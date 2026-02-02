import { ethers } from 'ethers';
import { BaseStrategy, BaseStrategyConfig } from './base-strategy.js';
import { eventListener } from '../services/event-listener.js';
import { analyticsService } from '../services/analytics.js';
import { createLogger } from '../utils/logger.js';
import {
  TokenInfo,
  Position,
  BuyDecision,
  SellDecision,
  SecurityAnalysis,
  TwitterAnalysis,
  TokenPurchaseEvent,
} from '../types/index.js';

const logger = createLogger('WHALE_TRACKER');

export interface WhaleTrackerConfig extends BaseStrategyConfig {
  // Whale detection
  whaleThresholdBNB: bigint; // Minimum buy to consider as whale
  followWhalePercent: number; // Percentage of whale buy to mirror

  // Tracking
  trackedWallets: string[]; // Specific wallets to follow
  trackAnyWhale: boolean; // Track any wallet that makes large buys

  // Filters
  maxFollowDelaySeconds: number; // Max time after whale buy to follow
  minWhaleProfitPercent: number; // Only follow if whale is in profit

  // Limits
  maxBuyAmountBNB: bigint;
  maxDailyFollows: number;
}

const DEFAULT_CONFIG: WhaleTrackerConfig = {
  name: 'whale-tracker',
  enabled: true,
  params: {},
  minConfidence: 0.5,
  maxRiskScore: 50,
  requireSecurityCheck: true,
  requireTwitterAnalysis: false,

  whaleThresholdBNB: ethers.parseEther('1'),
  followWhalePercent: 10,

  trackedWallets: [],
  trackAnyWhale: true,

  maxFollowDelaySeconds: 60,
  minWhaleProfitPercent: 0,

  maxBuyAmountBNB: ethers.parseEther('0.5'),
  maxDailyFollows: 10,
};

interface WhaleBuy {
  wallet: string;
  token: string;
  amount: bigint;
  timestamp: Date;
  txHash: string;
}

export class WhaleTrackerStrategy extends BaseStrategy {
  protected config: WhaleTrackerConfig;
  private recentWhaleBuys: Map<string, WhaleBuy[]> = new Map();
  private dailyFollowCount: number = 0;
  private lastResetDate: string = '';
  private isListening: boolean = false;

  constructor(config: Partial<WhaleTrackerConfig> = {}) {
    super('whale-tracker', config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start tracking whale activity
   */
  startTracking(): void {
    if (this.isListening) return;

    this.isListening = true;
    eventListener.on('tokenPurchase', this.handlePurchase.bind(this));

    logger.info('Whale tracking started', {
      threshold: ethers.formatEther(this.config.whaleThresholdBNB),
      trackedWallets: this.config.trackedWallets.length,
    });
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    if (!this.isListening) return;

    this.isListening = false;
    eventListener.off('tokenPurchase', this.handlePurchase.bind(this));

    logger.info('Whale tracking stopped');
  }

  /**
   * Handle purchase event
   */
  private handlePurchase(event: TokenPurchaseEvent): void {
    const isWhale = event.amountIn >= this.config.whaleThresholdBNB;
    const isTracked = this.config.trackedWallets.some(
      w => w.toLowerCase() === event.buyer.toLowerCase()
    );

    if (!isWhale && !isTracked) return;

    const whaleBuy: WhaleBuy = {
      wallet: event.buyer,
      token: event.token,
      amount: event.amountIn,
      timestamp: new Date(event.timestamp * 1000),
      txHash: event.txHash,
    };

    // Store whale buy
    const tokenBuys = this.recentWhaleBuys.get(event.token) || [];
    tokenBuys.push(whaleBuy);
    this.recentWhaleBuys.set(event.token, tokenBuys);

    // Cleanup old buys (keep last 10 per token)
    if (tokenBuys.length > 10) {
      this.recentWhaleBuys.set(event.token, tokenBuys.slice(-10));
    }

    logger.info('Whale buy detected', {
      wallet: event.buyer.slice(0, 10) + '...',
      token: event.token.slice(0, 10) + '...',
      amount: ethers.formatEther(event.amountIn),
      isTrackedWallet: isTracked,
    });

    // Emit event for bot to handle
    this.emit('whaleBuy', whaleBuy);
  }

  /**
   * Determine if should buy based on whale activity
   */
  async shouldBuy(
    token: TokenInfo,
    analysis?: SecurityAnalysis,
    twitter?: TwitterAnalysis
  ): Promise<BuyDecision> {
    // Pre-checks
    const preCheck = await this.preCheckBuy(token, analysis, twitter);
    if (!preCheck.pass) {
      return this.noBuy(preCheck.reason!);
    }

    // Check daily limit
    this.checkDailyReset();
    if (this.dailyFollowCount >= this.config.maxDailyFollows) {
      return this.noBuy(`Daily follow limit reached (${this.config.maxDailyFollows})`);
    }

    // Get recent whale buys for this token
    const whaleBuys = this.recentWhaleBuys.get(token.address) || [];
    if (whaleBuys.length === 0) {
      return this.noBuy('No recent whale activity');
    }

    // Find most recent whale buy
    const latestBuy = whaleBuys[whaleBuys.length - 1];
    const buyAgeSeconds = (Date.now() - latestBuy.timestamp.getTime()) / 1000;

    // Check if buy is too old
    if (buyAgeSeconds > this.config.maxFollowDelaySeconds) {
      return this.noBuy(`Whale buy too old: ${Math.floor(buyAgeSeconds)}s ago`);
    }

    // Check if tracked wallet
    const isTrackedWallet = this.config.trackedWallets.some(
      w => w.toLowerCase() === latestBuy.wallet.toLowerCase()
    );

    // Calculate buy amount (percentage of whale buy, capped at max)
    let buyAmount = (latestBuy.amount * BigInt(this.config.followWhalePercent)) / 100n;
    if (buyAmount > this.config.maxBuyAmountBNB) {
      buyAmount = this.config.maxBuyAmountBNB;
    }

    // Calculate confidence
    let confidence = 0.5;

    if (isTrackedWallet) {
      confidence += 0.2;
    }

    // Higher confidence for larger whale buys
    if (latestBuy.amount > this.config.whaleThresholdBNB * 2n) {
      confidence += 0.1;
    }

    // Lower confidence for high risk
    if (analysis && analysis.riskScore > 30) {
      confidence -= 0.1;
    }

    const riskScore = analysis?.riskScore || 40;

    const decision = this.yesBuy(
      buyAmount,
      `Following whale buy: ${ethers.formatEther(latestBuy.amount)} BNB`,
      Math.min(confidence, 1),
      riskScore
    );

    if (decision.shouldBuy) {
      this.dailyFollowCount++;
    }

    this.logDecision('buy', token.symbol, decision);
    return decision;
  }

  /**
   * Determine if should sell
   */
  async shouldSell(position: Position): Promise<SellDecision> {
    if (!this.isActive()) {
      return this.noSell('Strategy is disabled');
    }

    // Get whale activity for this token
    const whaleTrades = await analyticsService.getWhaleTrades(
      position.token.address,
      1 // Last hour
    );

    // Count whale sells
    const whaleSells = whaleTrades.filter(t => t.type === 'sell');
    const whaleBuys = whaleTrades.filter(t => t.type === 'buy');

    // If whales are selling more than buying, consider selling
    if (whaleSells.length > whaleBuys.length && whaleSells.length >= 2) {
      // Check if tracked wallets are selling
      const trackedSells = whaleSells.filter(s =>
        this.config.trackedWallets.some(
          w => w.toLowerCase() === s.trader.toLowerCase()
        )
      );

      if (trackedSells.length > 0) {
        const decision = this.yesSell(
          position.amount,
          `Tracked wallet selling: ${trackedSells[0].trader.slice(0, 10)}...`,
          'strategy'
        );
        this.logDecision('sell', position.token.symbol, decision);
        return decision;
      }
    }

    return this.noSell('No whale sell signals');
  }

  /**
   * Check and reset daily counter
   */
  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyFollowCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Add wallet to track
   */
  addTrackedWallet(address: string): void {
    const lower = address.toLowerCase();
    if (!this.config.trackedWallets.includes(lower)) {
      this.config.trackedWallets.push(lower);
      logger.info('Added tracked wallet', { address });
    }
  }

  /**
   * Remove tracked wallet
   */
  removeTrackedWallet(address: string): void {
    const lower = address.toLowerCase();
    this.config.trackedWallets = this.config.trackedWallets.filter(
      w => w !== lower
    );
  }

  /**
   * Get tracked wallets
   */
  getTrackedWallets(): string[] {
    return [...this.config.trackedWallets];
  }

  /**
   * Get recent whale buys for a token
   */
  getRecentWhaleBuys(tokenAddress: string): WhaleBuy[] {
    return this.recentWhaleBuys.get(tokenAddress) || [];
  }

  /**
   * Clear whale buy history
   */
  clearHistory(): void {
    this.recentWhaleBuys.clear();
  }
}

// Export singleton instance
export const whaleTrackerStrategy = new WhaleTrackerStrategy();
