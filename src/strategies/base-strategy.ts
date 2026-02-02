import { EventEmitter } from 'events';
import {
  TokenInfo,
  Position,
  BuyDecision,
  SellDecision,
  SecurityAnalysis,
  TwitterAnalysis,
  StrategyConfig,
  TradingStrategy,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('STRATEGY');

export interface BaseStrategyConfig extends StrategyConfig {
  minConfidence: number;
  maxRiskScore: number;
  requireSecurityCheck: boolean;
  requireTwitterAnalysis: boolean;
}

export abstract class BaseStrategy extends EventEmitter implements TradingStrategy {
  name: string;
  protected config: BaseStrategyConfig;
  protected isEnabled: boolean = true;

  constructor(name: string, config: Partial<BaseStrategyConfig> = {}) {
    super();
    this.name = name;
    this.config = {
      name,
      enabled: true,
      params: {},
      minConfidence: 0.5,
      maxRiskScore: 50,
      requireSecurityCheck: true,
      requireTwitterAnalysis: false,
      ...config,
    };
  }

  /**
   * Configure strategy
   */
  configure(config: StrategyConfig): void {
    this.config = {
      ...this.config,
      ...config,
      params: { ...this.config.params, ...config.params },
    };
    this.isEnabled = config.enabled;
    logger.info(`Strategy ${this.name} configured`, { config: this.config });
  }

  /**
   * Check if strategy is enabled
   */
  isActive(): boolean {
    return this.isEnabled && this.config.enabled;
  }

  /**
   * Enable strategy
   */
  enable(): void {
    this.isEnabled = true;
    this.config.enabled = true;
    logger.info(`Strategy ${this.name} enabled`);
  }

  /**
   * Disable strategy
   */
  disable(): void {
    this.isEnabled = false;
    this.config.enabled = false;
    logger.info(`Strategy ${this.name} disabled`);
  }

  /**
   * Determine if should buy - to be implemented by subclasses
   */
  abstract shouldBuy(
    token: TokenInfo,
    analysis?: SecurityAnalysis,
    twitter?: TwitterAnalysis
  ): Promise<BuyDecision>;

  /**
   * Determine if should sell - to be implemented by subclasses
   */
  abstract shouldSell(position: Position): Promise<SellDecision>;

  /**
   * Pre-check before buy decision
   */
  protected async preCheckBuy(
    _token: TokenInfo,
    analysis?: SecurityAnalysis,
    twitter?: TwitterAnalysis
  ): Promise<{ pass: boolean; reason?: string }> {
    // Check if strategy is enabled
    if (!this.isActive()) {
      return { pass: false, reason: 'Strategy is disabled' };
    }

    // Check security analysis if required
    if (this.config.requireSecurityCheck) {
      if (!analysis) {
        return { pass: false, reason: 'Security analysis required but not provided' };
      }

      if (analysis.isHoneypot) {
        return { pass: false, reason: 'Token is a honeypot' };
      }

      if (analysis.riskScore > this.config.maxRiskScore) {
        return {
          pass: false,
          reason: `Risk score ${analysis.riskScore} exceeds maximum ${this.config.maxRiskScore}`,
        };
      }

      if (analysis.recommendation === 'avoid') {
        return { pass: false, reason: 'Security analysis recommends avoid' };
      }
    }

    // Check Twitter analysis if required
    if (this.config.requireTwitterAnalysis && !twitter) {
      return { pass: false, reason: 'Twitter analysis required but not provided' };
    }

    return { pass: true };
  }

  /**
   * Create a negative buy decision
   */
  protected noBuy(reason: string): BuyDecision {
    return {
      shouldBuy: false,
      amount: 0n,
      reason,
      confidence: 0,
      riskScore: 100,
    };
  }

  /**
   * Create a positive buy decision
   */
  protected yesBuy(
    amount: bigint,
    reason: string,
    confidence: number,
    riskScore: number
  ): BuyDecision {
    return {
      shouldBuy: true,
      amount,
      reason,
      confidence,
      riskScore,
    };
  }

  /**
   * Create a no-sell decision
   */
  protected noSell(reason: string): SellDecision {
    return {
      shouldSell: false,
      amount: 0n,
      reason,
      sellType: 'strategy',
    };
  }

  /**
   * Create a sell decision
   */
  protected yesSell(
    amount: bigint,
    reason: string,
    sellType: SellDecision['sellType'] = 'strategy'
  ): SellDecision {
    return {
      shouldSell: true,
      amount,
      reason,
      sellType,
    };
  }

  /**
   * Get strategy configuration
   */
  getConfig(): BaseStrategyConfig {
    return { ...this.config };
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Log decision
   */
  protected logDecision(
    type: 'buy' | 'sell',
    token: string,
    decision: BuyDecision | SellDecision
  ): void {
    const action = type === 'buy'
      ? (decision as BuyDecision).shouldBuy
      : (decision as SellDecision).shouldSell;

    logger.info(`${this.name} ${type} decision`, {
      token,
      action: action ? 'YES' : 'NO',
      reason: decision.reason,
    });
  }
}
