import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import { eventListener } from './event-listener.js';
import { tradingEngine } from '../core/trading.js';
import { createLogger } from '../utils/logger.js';
import { PriceData, OHLC, TokenPurchaseEvent, TokenSaleEvent } from '../types/index.js';

const logger = createLogger('PRICE_TRACKER');

interface PriceHistory {
  prices: PriceData[];
  ohlc: Map<string, OHLC>; // key: timestamp bucket
}

export class PriceTracker extends EventEmitter {
  private cache: NodeCache;
  private priceHistory: Map<string, PriceHistory> = new Map();
  private trackedTokens: Set<string> = new Set();
  private isTracking: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private ohlcBucketSize: number = 60000; // 1 minute buckets

  constructor() {
    super();
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min cache
  }

  /**
   * Start tracking prices for a token
   */
  async trackToken(tokenAddress: string): Promise<void> {
    const address = tokenAddress.toLowerCase();

    if (this.trackedTokens.has(address)) {
      return;
    }

    this.trackedTokens.add(address);

    // Initialize price history
    this.priceHistory.set(address, {
      prices: [],
      ohlc: new Map(),
    });

    // Get initial price
    await this.updatePrice(address);

    logger.info('Started tracking token', { address });
  }

  /**
   * Stop tracking a token
   */
  untrackToken(tokenAddress: string): void {
    const address = tokenAddress.toLowerCase();
    this.trackedTokens.delete(address);
    this.priceHistory.delete(address);
    this.cache.del(`price:${address}`);

    logger.info('Stopped tracking token', { address });
  }

  /**
   * Start the price tracker
   */
  async start(updateIntervalMs: number = 5000): Promise<void> {
    if (this.isTracking) {
      logger.warn('Price tracker already running');
      return;
    }

    this.isTracking = true;
    logger.info('Starting price tracker');

    // Listen for trade events to update prices
    eventListener.on('tokenPurchase', this.handlePurchase.bind(this));
    eventListener.on('tokenSale', this.handleSale.bind(this));

    // Start periodic updates
    this.updateInterval = setInterval(async () => {
      await this.updateAllPrices();
    }, updateIntervalMs);
  }

  /**
   * Handle purchase event
   */
  private handlePurchase(event: TokenPurchaseEvent): void {
    const address = event.token.toLowerCase();
    if (!this.trackedTokens.has(address)) return;

    // Calculate implied price from trade
    if (event.amountOut > 0n) {
      const impliedPrice = (event.amountIn * 10n ** 18n) / event.amountOut;
      this.recordPrice(address, impliedPrice);
    }
  }

  /**
   * Handle sale event
   */
  private handleSale(event: TokenSaleEvent): void {
    const address = event.token.toLowerCase();
    if (!this.trackedTokens.has(address)) return;

    // Calculate implied price from trade
    if (event.amountIn > 0n) {
      const impliedPrice = (event.amountOut * 10n ** 18n) / event.amountIn;
      this.recordPrice(address, impliedPrice);
    }
  }

  /**
   * Update price for a token
   */
  private async updatePrice(address: string): Promise<void> {
    try {
      const price = await tradingEngine.getTokenPrice(address);
      if (price > 0n) {
        this.recordPrice(address, price);
      }
    } catch (error) {
      logger.debug('Failed to fetch price', { address, error: (error as Error).message });
    }
  }

  /**
   * Record a new price point
   */
  private recordPrice(address: string, price: bigint): void {
    const history = this.priceHistory.get(address);
    if (!history) return;

    const now = new Date();
    const priceData: PriceData = {
      token: address,
      price,
      timestamp: now,
    };

    // Add to price history
    history.prices.push(priceData);

    // Trim old prices (keep last 1000)
    if (history.prices.length > 1000) {
      history.prices = history.prices.slice(-1000);
    }

    // Update OHLC
    this.updateOHLC(address, price, now);

    // Update cache
    this.cache.set(`price:${address}`, price);

    // Emit price update event
    this.emit('priceUpdate', priceData);
  }

  /**
   * Update OHLC data
   */
  private updateOHLC(address: string, price: bigint, timestamp: Date): void {
    const history = this.priceHistory.get(address);
    if (!history) return;

    const bucket = Math.floor(timestamp.getTime() / this.ohlcBucketSize) * this.ohlcBucketSize;
    const bucketKey = bucket.toString();

    const existing = history.ohlc.get(bucketKey);

    if (existing) {
      // Update existing bucket
      if (price > existing.high) existing.high = price;
      if (price < existing.low) existing.low = price;
      existing.close = price;
    } else {
      // Create new bucket
      history.ohlc.set(bucketKey, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0n, // Would need to track separately
        timestamp: new Date(bucket),
      });

      // Trim old buckets (keep last 1440 = 24 hours at 1 min intervals)
      if (history.ohlc.size > 1440) {
        const oldestKey = history.ohlc.keys().next().value;
        if (oldestKey) history.ohlc.delete(oldestKey);
      }
    }
  }

  /**
   * Update all tracked prices
   */
  private async updateAllPrices(): Promise<void> {
    for (const address of this.trackedTokens) {
      await this.updatePrice(address);
    }
  }

  /**
   * Get current price for a token
   */
  async getCurrentPrice(tokenAddress: string): Promise<bigint> {
    const address = tokenAddress.toLowerCase();

    // Check cache first
    const cached = this.cache.get<bigint>(`price:${address}`);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch fresh price
    const price = await tradingEngine.getTokenPrice(address);
    this.cache.set(`price:${address}`, price);
    return price;
  }

  /**
   * Get price history for a token
   */
  getPriceHistory(tokenAddress: string, limit?: number): PriceData[] {
    const address = tokenAddress.toLowerCase();
    const history = this.priceHistory.get(address);

    if (!history) return [];

    const prices = history.prices;
    return limit ? prices.slice(-limit) : prices;
  }

  /**
   * Get OHLC data for a token
   */
  getOHLC(tokenAddress: string): OHLC[] {
    const address = tokenAddress.toLowerCase();
    const history = this.priceHistory.get(address);

    if (!history) return [];

    return Array.from(history.ohlc.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Get price change percentage
   */
  getPriceChange(tokenAddress: string, periodMs: number = 3600000): number {
    const address = tokenAddress.toLowerCase();
    const history = this.priceHistory.get(address);

    if (!history || history.prices.length < 2) return 0;

    const now = Date.now();
    const oldPrices = history.prices.filter(
      p => now - p.timestamp.getTime() >= periodMs
    );

    if (oldPrices.length === 0) return 0;

    const oldPrice = oldPrices[oldPrices.length - 1].price;
    const currentPrice = history.prices[history.prices.length - 1].price;

    if (oldPrice === 0n) return 0;

    return Number(((currentPrice - oldPrice) * 10000n) / oldPrice) / 100;
  }

  /**
   * Stop the price tracker
   */
  stop(): void {
    if (!this.isTracking) return;

    this.isTracking = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    eventListener.off('tokenPurchase', this.handlePurchase.bind(this));
    eventListener.off('tokenSale', this.handleSale.bind(this));

    logger.info('Price tracker stopped');
  }

  /**
   * Check if tracker is running
   */
  isRunning(): boolean {
    return this.isTracking;
  }

  /**
   * Get all tracked tokens
   */
  getTrackedTokens(): string[] {
    return Array.from(this.trackedTokens);
  }
}

// Export singleton instance
export const priceTracker = new PriceTracker();
