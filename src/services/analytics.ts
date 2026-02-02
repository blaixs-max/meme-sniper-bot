import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { eventListener } from './event-listener.js';
import { priceTracker } from './price-tracker.js';
import { tradingEngine } from '../core/trading.js';
import { blockchain } from '../core/blockchain.js';
import { createLogger } from '../utils/logger.js';
import { TokenInfo } from '../types/index.js';

const logger = createLogger('ANALYTICS');

export interface TokenAnalytics {
  token: TokenInfo;
  volume24h: bigint;
  trades24h: number;
  uniqueBuyers24h: number;
  uniqueSellers24h: number;
  largestBuy: bigint;
  largestSell: bigint;
  priceChange24h: number;
  buyPressure: number; // buy volume / total volume
  holderConcentration: number; // top 10 holders / total supply
  ageMinutes: number;
  marketCapBNB: bigint;
}

export interface WhaleTrade {
  type: 'buy' | 'sell';
  trader: string;
  amount: bigint;
  amountBNB: bigint;
  timestamp: Date;
  txHash: string;
}

export class AnalyticsService {
  private cache: NodeCache;
  private whaleThreshold: bigint = ethers.parseEther('1'); // 1 BNB

  constructor() {
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
  }

  /**
   * Get comprehensive analytics for a token
   */
  async getTokenAnalytics(tokenAddress: string): Promise<TokenAnalytics | null> {
    const cacheKey = `analytics:${tokenAddress.toLowerCase()}`;
    const cached = this.cache.get<TokenAnalytics>(cacheKey);
    if (cached) return cached;

    try {
      // Get token info
      const tokenInfo = await tradingEngine.getTokenInfo(tokenAddress);
      if (!tokenInfo) return null;

      // Get trade events from last 24 hours
      const currentBlock = await blockchain.getBlockNumber();
      const blocksIn24h = Math.floor((24 * 60 * 60 * 1000) / 3000); // ~28800 blocks
      const fromBlock = Math.max(0, currentBlock - blocksIn24h);

      const { purchases, sales } = await eventListener.getTokenEvents(
        tokenAddress,
        fromBlock
      );

      // Calculate metrics
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const recentPurchases = purchases.filter(
        p => p.timestamp * 1000 >= oneDayAgo
      );
      const recentSales = sales.filter(
        s => s.timestamp * 1000 >= oneDayAgo
      );

      // Volume
      const buyVolume = recentPurchases.reduce(
        (sum, p) => sum + p.amountIn,
        0n
      );
      const sellVolume = recentSales.reduce(
        (sum, s) => sum + s.amountOut,
        0n
      );
      const volume24h = buyVolume + sellVolume;

      // Unique traders
      const uniqueBuyers = new Set(recentPurchases.map(p => p.buyer)).size;
      const uniqueSellers = new Set(recentSales.map(s => s.seller)).size;

      // Largest trades
      const largestBuy = recentPurchases.reduce(
        (max, p) => (p.amountIn > max ? p.amountIn : max),
        0n
      );
      const largestSell = recentSales.reduce(
        (max, s) => (s.amountOut > max ? s.amountOut : max),
        0n
      );

      // Buy pressure
      const buyPressure = volume24h > 0n
        ? Number((buyVolume * 100n) / volume24h)
        : 50;

      // Price change
      const priceChange24h = priceTracker.getPriceChange(tokenAddress, 24 * 60 * 60 * 1000);

      // Token age
      const ageMinutes = Math.floor(
        (now - tokenInfo.createdAt.getTime()) / 60000
      );

      // Market cap (rough estimate)
      const price = tokenInfo.price || 0n;
      const marketCapBNB = price > 0n
        ? (price * tokenInfo.totalSupply) / (10n ** 36n)
        : tokenInfo.reserveBNB;

      const analytics: TokenAnalytics = {
        token: tokenInfo,
        volume24h,
        trades24h: recentPurchases.length + recentSales.length,
        uniqueBuyers24h: uniqueBuyers,
        uniqueSellers24h: uniqueSellers,
        largestBuy,
        largestSell,
        priceChange24h,
        buyPressure,
        holderConcentration: 0, // Would require additional data
        ageMinutes,
        marketCapBNB,
      };

      this.cache.set(cacheKey, analytics);
      return analytics;
    } catch (error) {
      logger.error('Failed to get token analytics', {
        tokenAddress,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Detect whale trades for a token
   */
  async getWhaleTrades(
    tokenAddress: string,
    hours: number = 24
  ): Promise<WhaleTrade[]> {
    const currentBlock = await blockchain.getBlockNumber();
    const blocksInPeriod = Math.floor((hours * 60 * 60 * 1000) / 3000);
    const fromBlock = Math.max(0, currentBlock - blocksInPeriod);

    const { purchases, sales } = await eventListener.getTokenEvents(
      tokenAddress,
      fromBlock
    );

    const whaleTrades: WhaleTrade[] = [];

    // Filter whale purchases
    for (const purchase of purchases) {
      if (purchase.amountIn >= this.whaleThreshold) {
        whaleTrades.push({
          type: 'buy',
          trader: purchase.buyer,
          amount: purchase.amountOut,
          amountBNB: purchase.amountIn,
          timestamp: new Date(purchase.timestamp * 1000),
          txHash: purchase.txHash,
        });
      }
    }

    // Filter whale sales
    for (const sale of sales) {
      if (sale.amountOut >= this.whaleThreshold) {
        whaleTrades.push({
          type: 'sell',
          trader: sale.seller,
          amount: sale.amountIn,
          amountBNB: sale.amountOut,
          timestamp: new Date(sale.timestamp * 1000),
          txHash: sale.txHash,
        });
      }
    }

    // Sort by time descending
    return whaleTrades.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Get trading activity score (0-100)
   */
  async getActivityScore(tokenAddress: string): Promise<number> {
    const analytics = await this.getTokenAnalytics(tokenAddress);
    if (!analytics) return 0;

    // Factors for activity score
    const volumeScore = Math.min(
      Number(analytics.volume24h / ethers.parseEther('1')),
      30
    ); // max 30 points for 30+ BNB volume

    const tradesScore = Math.min(analytics.trades24h / 10, 20); // max 20 points for 200+ trades

    const uniqueTradersScore = Math.min(
      (analytics.uniqueBuyers24h + analytics.uniqueSellers24h) / 5,
      20
    ); // max 20 points for 100+ unique traders

    const buyPressureScore = analytics.buyPressure > 50 ? 15 : 5; // 15 points if more buying

    const ageScore = analytics.ageMinutes < 60 ? 15 : 5; // 15 points if less than 1 hour old

    return Math.min(
      Math.round(
        volumeScore + tradesScore + uniqueTradersScore + buyPressureScore + ageScore
      ),
      100
    );
  }

  /**
   * Check for suspicious activity patterns
   */
  async checkSuspiciousActivity(
    tokenAddress: string
  ): Promise<{ suspicious: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const analytics = await this.getTokenAnalytics(tokenAddress);
    if (!analytics) {
      return { suspicious: true, reasons: ['Could not fetch analytics'] };
    }

    // Check for low unique traders relative to volume
    if (analytics.volume24h > ethers.parseEther('10') &&
        analytics.uniqueBuyers24h < 5) {
      reasons.push('High volume with very few unique buyers (possible wash trading)');
    }

    // Check for single large holder
    if (analytics.holderConcentration > 80) {
      reasons.push('High holder concentration (top holders own >80%)');
    }

    // Check for immediate large sells after creation
    if (analytics.ageMinutes < 30 && analytics.largestSell > ethers.parseEther('5')) {
      reasons.push('Large sell within 30 minutes of creation');
    }

    // Check for more sells than buys volume
    const sellPressure = 100 - analytics.buyPressure;
    if (sellPressure > 70 && analytics.trades24h > 10) {
      reasons.push('Heavy sell pressure (>70% of volume)');
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Set whale threshold
   */
  setWhaleThreshold(thresholdBNB: bigint): void {
    this.whaleThreshold = thresholdBNB;
    logger.info('Whale threshold updated', {
      threshold: ethers.formatEther(thresholdBNB),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.flushAll();
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
