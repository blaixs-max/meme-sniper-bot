import { ethers } from 'ethers';
import { BaseStrategy, BaseStrategyConfig } from './base-strategy.js';
import { priceTracker } from '../services/price-tracker.js';
import { analyticsService } from '../services/analytics.js';
import { createLogger } from '../utils/logger.js';
import {
  TokenInfo,
  Position,
  BuyDecision,
  SellDecision,
  SecurityAnalysis,
  TwitterAnalysis,
} from '../types/index.js';

const logger = createLogger('MOMENTUM_STRATEGY');

export interface MomentumConfig extends BaseStrategyConfig {
  // Buy conditions
  minPriceIncrease5m: number; // Minimum 5-minute price increase %
  minPriceIncrease1h: number; // Minimum 1-hour price increase %
  minVolume24h: bigint; // Minimum 24h volume in BNB
  minTrades24h: number; // Minimum number of trades

  // Buy settings
  buyAmountBNB: bigint;

  // Sell conditions
  sellOnMomentumLoss: boolean; // Sell when momentum reverses
  momentumLossThreshold: number; // Price drop % to trigger sell

  // Filters
  minActivityScore: number; // Minimum activity score (0-100)
  requireBuyPressure: boolean; // Only buy if buy pressure > 50%
}

const DEFAULT_CONFIG: MomentumConfig = {
  name: 'momentum',
  enabled: true,
  params: {},
  minConfidence: 0.5,
  maxRiskScore: 50,
  requireSecurityCheck: true,
  requireTwitterAnalysis: false,

  minPriceIncrease5m: 5,
  minPriceIncrease1h: 10,
  minVolume24h: ethers.parseEther('5'),
  minTrades24h: 20,

  buyAmountBNB: ethers.parseEther('0.1'),

  sellOnMomentumLoss: true,
  momentumLossThreshold: 10,

  minActivityScore: 40,
  requireBuyPressure: true,
};

export class MomentumStrategy extends BaseStrategy {
  protected config: MomentumConfig;
  private positionHighs: Map<string, bigint> = new Map(); // Track position highs for momentum loss

  constructor(config: Partial<MomentumConfig> = {}) {
    super('momentum', config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Determine if should buy based on momentum
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

    try {
      // Get analytics
      const tokenAnalytics = await analyticsService.getTokenAnalytics(token.address);
      if (!tokenAnalytics) {
        return this.noBuy('Could not fetch analytics');
      }

      // Check volume
      if (tokenAnalytics.volume24h < this.config.minVolume24h) {
        return this.noBuy(
          `Volume too low: ${ethers.formatEther(tokenAnalytics.volume24h)} BNB`
        );
      }

      // Check trade count
      if (tokenAnalytics.trades24h < this.config.minTrades24h) {
        return this.noBuy(`Not enough trades: ${tokenAnalytics.trades24h}`);
      }

      // Check buy pressure
      if (this.config.requireBuyPressure && tokenAnalytics.buyPressure <= 50) {
        return this.noBuy(`Buy pressure too low: ${tokenAnalytics.buyPressure}%`);
      }

      // Check activity score
      const activityScore = await analyticsService.getActivityScore(token.address);
      if (activityScore < this.config.minActivityScore) {
        return this.noBuy(`Activity score too low: ${activityScore}`);
      }

      // Check price momentum
      const priceChange5m = priceTracker.getPriceChange(token.address, 5 * 60 * 1000);
      const priceChange1h = priceTracker.getPriceChange(token.address, 60 * 60 * 1000);

      if (priceChange5m < this.config.minPriceIncrease5m) {
        return this.noBuy(`5m price change too low: ${priceChange5m.toFixed(2)}%`);
      }

      if (priceChange1h < this.config.minPriceIncrease1h) {
        return this.noBuy(`1h price change too low: ${priceChange1h.toFixed(2)}%`);
      }

      // Check for suspicious activity
      const suspicious = await analyticsService.checkSuspiciousActivity(token.address);
      if (suspicious.suspicious) {
        return this.noBuy(`Suspicious activity: ${suspicious.reasons[0]}`);
      }

      // All checks passed - calculate confidence
      let confidence = 0.5;

      // Boost for strong momentum
      if (priceChange5m > 10) confidence += 0.1;
      if (priceChange1h > 20) confidence += 0.1;

      // Boost for high volume
      if (tokenAnalytics.volume24h > this.config.minVolume24h * 5n) {
        confidence += 0.1;
      }

      // Boost for good Twitter
      if (twitter && twitter.score > 60) {
        confidence += 0.1;
      }

      const riskScore = analysis?.riskScore || 35;

      const decision = this.yesBuy(
        this.config.buyAmountBNB,
        `Strong momentum: +${priceChange5m.toFixed(1)}% (5m), +${priceChange1h.toFixed(1)}% (1h)`,
        Math.min(confidence, 1),
        riskScore
      );

      this.logDecision('buy', token.symbol, decision);
      return decision;
    } catch (error) {
      logger.error('Momentum analysis failed', {
        token: token.symbol,
        error: (error as Error).message,
      });
      return this.noBuy(`Analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Determine if should sell based on momentum loss
   */
  async shouldSell(position: Position): Promise<SellDecision> {
    if (!this.isActive()) {
      return this.noSell('Strategy is disabled');
    }

    if (!this.config.sellOnMomentumLoss) {
      return this.noSell('Momentum loss selling disabled');
    }

    try {
      // Get current price
      const currentPrice = await priceTracker.getCurrentPrice(position.token.address);

      // Track position high
      const posKey = position.id;
      const previousHigh = this.positionHighs.get(posKey) || position.entryPrice;

      if (currentPrice > previousHigh) {
        this.positionHighs.set(posKey, currentPrice);
        return this.noSell('Price still rising');
      }

      // Check if dropped from high
      const dropFromHigh = Number(((previousHigh - currentPrice) * 10000n) / previousHigh) / 100;

      if (dropFromHigh >= this.config.momentumLossThreshold) {
        // Clean up tracking
        this.positionHighs.delete(posKey);

        const decision = this.yesSell(
          position.amount,
          `Momentum loss: -${dropFromHigh.toFixed(1)}% from high`,
          'strategy'
        );

        this.logDecision('sell', position.token.symbol, decision);
        return decision;
      }

      return this.noSell(`Drop from high (${dropFromHigh.toFixed(1)}%) below threshold`);
    } catch (error) {
      logger.error('Momentum sell check failed', {
        token: position.token.symbol,
        error: (error as Error).message,
      });
      return this.noSell('Check failed');
    }
  }

  /**
   * Configure momentum strategy
   */
  configureMomentum(config: Partial<MomentumConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Momentum strategy configured', {
      minPriceIncrease5m: this.config.minPriceIncrease5m,
      minPriceIncrease1h: this.config.minPriceIncrease1h,
      minVolume24h: ethers.formatEther(this.config.minVolume24h),
    });
  }

  /**
   * Clear position high tracking
   */
  clearPositionTracking(): void {
    this.positionHighs.clear();
  }

  /**
   * Get momentum config
   */
  getMomentumConfig(): MomentumConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const momentumStrategy = new MomentumStrategy();
