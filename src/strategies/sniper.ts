import { ethers } from 'ethers';
import { BaseStrategy, BaseStrategyConfig } from './base-strategy.js';
import { createLogger } from '../utils/logger.js';
import {
  TokenInfo,
  Position,
  BuyDecision,
  SellDecision,
  SecurityAnalysis,
  TwitterAnalysis,
} from '../types/index.js';

const logger = createLogger('SNIPER_STRATEGY');

export interface SniperConfig extends BaseStrategyConfig {
  // Buy conditions
  maxAgeMinutes: number; // Only buy tokens younger than this
  buyAmountBNB: bigint; // Amount to spend per snipe
  minReserveBNB: bigint; // Minimum liquidity
  maxReserveBNB: bigint; // Maximum liquidity (avoid already pumped)

  // Filters
  blacklistedCreators: string[]; // Don't buy from these creators
  blacklistedWords: string[]; // Skip tokens with these words in name/symbol
  whitelistedCreators: string[]; // Only buy from these (if not empty)

  // Twitter requirements
  minTwitterScore: number; // Minimum Twitter score (0-100)

  // Sell conditions
  autoSellAfterMinutes: number; // Auto-sell after this time (0 = disabled)
}

const DEFAULT_CONFIG: SniperConfig = {
  name: 'sniper',
  enabled: true,
  params: {},
  minConfidence: 0.6,
  maxRiskScore: 40,
  requireSecurityCheck: true,
  requireTwitterAnalysis: false,

  maxAgeMinutes: 5,
  buyAmountBNB: ethers.parseEther('0.1'),
  minReserveBNB: ethers.parseEther('0.5'),
  maxReserveBNB: ethers.parseEther('10'),

  blacklistedCreators: [],
  blacklistedWords: ['test', 'scam', 'rug', 'fake'],
  whitelistedCreators: [],

  minTwitterScore: 0,
  autoSellAfterMinutes: 0,
};

export class SniperStrategy extends BaseStrategy {
  protected config: SniperConfig;

  constructor(config: Partial<SniperConfig> = {}) {
    super('sniper', config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Determine if should buy a new token
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

    // Check token age
    const ageMinutes = (Date.now() - token.createdAt.getTime()) / 60000;
    if (ageMinutes > this.config.maxAgeMinutes) {
      return this.noBuy(`Token too old: ${Math.floor(ageMinutes)} minutes`);
    }

    // Check liquidity
    if (token.reserveBNB < this.config.minReserveBNB) {
      return this.noBuy(`Liquidity too low: ${ethers.formatEther(token.reserveBNB)} BNB`);
    }

    if (token.reserveBNB > this.config.maxReserveBNB) {
      return this.noBuy(`Liquidity too high (already pumped): ${ethers.formatEther(token.reserveBNB)} BNB`);
    }

    // Check creator blacklist
    if (this.config.blacklistedCreators.length > 0) {
      const creatorLower = token.creator.toLowerCase();
      if (this.config.blacklistedCreators.some(c => c.toLowerCase() === creatorLower)) {
        return this.noBuy('Creator is blacklisted');
      }
    }

    // Check creator whitelist
    if (this.config.whitelistedCreators.length > 0) {
      const creatorLower = token.creator.toLowerCase();
      if (!this.config.whitelistedCreators.some(c => c.toLowerCase() === creatorLower)) {
        return this.noBuy('Creator not in whitelist');
      }
    }

    // Check name/symbol blacklist
    const nameLower = token.name.toLowerCase();
    const symbolLower = token.symbol.toLowerCase();
    for (const word of this.config.blacklistedWords) {
      if (nameLower.includes(word) || symbolLower.includes(word)) {
        return this.noBuy(`Token name/symbol contains blacklisted word: ${word}`);
      }
    }

    // Check Twitter score if required
    if (this.config.minTwitterScore > 0) {
      if (!twitter) {
        return this.noBuy('Twitter analysis required but not available');
      }
      if (twitter.score < this.config.minTwitterScore) {
        return this.noBuy(`Twitter score ${twitter.score} below minimum ${this.config.minTwitterScore}`);
      }
    }

    // All checks passed - calculate confidence
    let confidence = 0.7;

    // Boost confidence for verified creators
    if (this.config.whitelistedCreators.length > 0) {
      confidence += 0.1;
    }

    // Boost for good Twitter score
    if (twitter && twitter.score > 50) {
      confidence += 0.1;
    }

    // Lower confidence for higher risk
    if (analysis && analysis.riskScore > 20) {
      confidence -= 0.1;
    }

    const riskScore = analysis?.riskScore || 30;

    const decision = this.yesBuy(
      this.config.buyAmountBNB,
      `New token detected: ${token.symbol} (${Math.floor(ageMinutes)}m old)`,
      Math.min(confidence, 1),
      riskScore
    );

    this.logDecision('buy', token.symbol, decision);
    return decision;
  }

  /**
   * Determine if should sell a position
   */
  async shouldSell(position: Position): Promise<SellDecision> {
    if (!this.isActive()) {
      return this.noSell('Strategy is disabled');
    }

    // Check auto-sell timer
    if (this.config.autoSellAfterMinutes > 0) {
      const holdMinutes = (Date.now() - position.entryTime.getTime()) / 60000;
      if (holdMinutes >= this.config.autoSellAfterMinutes) {
        const decision = this.yesSell(
          position.amount,
          `Auto-sell triggered after ${Math.floor(holdMinutes)} minutes`,
          'strategy'
        );
        this.logDecision('sell', position.token.symbol, decision);
        return decision;
      }
    }

    // No automatic sell conditions met
    return this.noSell('No sell conditions met');
  }

  /**
   * Configure sniper-specific settings
   */
  configureSniper(config: Partial<SniperConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Sniper strategy configured', {
      maxAgeMinutes: this.config.maxAgeMinutes,
      buyAmount: ethers.formatEther(this.config.buyAmountBNB),
      minLiquidity: ethers.formatEther(this.config.minReserveBNB),
    });
  }

  /**
   * Add creator to blacklist
   */
  blacklistCreator(address: string): void {
    if (!this.config.blacklistedCreators.includes(address.toLowerCase())) {
      this.config.blacklistedCreators.push(address.toLowerCase());
    }
  }

  /**
   * Add creator to whitelist
   */
  whitelistCreator(address: string): void {
    if (!this.config.whitelistedCreators.includes(address.toLowerCase())) {
      this.config.whitelistedCreators.push(address.toLowerCase());
    }
  }

  /**
   * Add word to blacklist
   */
  blacklistWord(word: string): void {
    if (!this.config.blacklistedWords.includes(word.toLowerCase())) {
      this.config.blacklistedWords.push(word.toLowerCase());
    }
  }

  /**
   * Get sniper configuration
   */
  getSniperConfig(): SniperConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const sniperStrategy = new SniperStrategy();
