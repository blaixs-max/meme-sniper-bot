import { EventEmitter } from 'events';
import { priceTracker } from '../services/price-tracker.js';
import { tradingEngine } from '../core/trading.js';
import { createLogger } from '../utils/logger.js';
import { formatBNB, formatPercent, formatUnits, calculatePercentChange } from '../utils/helpers.js';
import { Position, TakeProfitLevel } from '../types/index.js';

const logger = createLogger('TAKE_PROFIT');

export interface TakeProfitConfig {
  enabled: boolean;
  levels: TakeProfitLevel[];
}

interface TrackedPosition {
  position: Position;
  triggeredLevels: Set<number>; // Track which levels have been triggered
  remainingAmount: bigint;
}

export class TakeProfitManager extends EventEmitter {
  private config: TakeProfitConfig;
  private trackedPositions: Map<string, TrackedPosition> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<TakeProfitConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      levels: [
        { percent: 50, sellPercent: 25, triggered: false },
        { percent: 100, sellPercent: 50, triggered: false },
        { percent: 200, sellPercent: 100, triggered: false },
      ],
      ...config,
    };
  }

  /**
   * Update configuration
   */
  configure(config: Partial<TakeProfitConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Take-profit configuration updated', { config: this.config });
  }

  /**
   * Add take profit level
   */
  addLevel(percent: number, sellPercent: number): void {
    const existingIndex = this.config.levels.findIndex(l => l.percent === percent);

    if (existingIndex >= 0) {
      this.config.levels[existingIndex] = { percent, sellPercent, triggered: false };
    } else {
      this.config.levels.push({ percent, sellPercent, triggered: false });
      // Sort levels by percent
      this.config.levels.sort((a, b) => a.percent - b.percent);
    }

    logger.info('Take-profit level added', { percent, sellPercent });
  }

  /**
   * Remove take profit level
   */
  removeLevel(percent: number): void {
    this.config.levels = this.config.levels.filter(l => l.percent !== percent);
    logger.info('Take-profit level removed', { percent });
  }

  /**
   * Start monitoring positions
   */
  start(checkIntervalMs: number = 5000): void {
    if (this.isRunning) {
      logger.warn('Take-profit manager already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Take-profit is disabled');
      return;
    }

    this.isRunning = true;
    logger.info('Starting take-profit manager');

    // Subscribe to price updates
    priceTracker.on('priceUpdate', this.handlePriceUpdate.bind(this));

    // Start periodic check
    this.checkInterval = setInterval(() => {
      this.checkAllPositions();
    }, checkIntervalMs);
  }

  /**
   * Add position to track
   */
  trackPosition(position: Position): void {
    const key = this.getPositionKey(position);

    const tracked: TrackedPosition = {
      position,
      triggeredLevels: new Set(),
      remainingAmount: position.amount,
    };

    this.trackedPositions.set(key, tracked);

    // Start tracking price
    priceTracker.trackToken(position.token.address);

    logger.info('Position tracked for take-profit', {
      token: position.token.symbol,
      entryPrice: formatBNB(position.entryPrice),
      levels: this.config.levels.map(l => `${l.percent}% -> sell ${l.sellPercent}%`),
    });
  }

  /**
   * Update position
   */
  updatePosition(position: Position): void {
    const key = this.getPositionKey(position);
    const tracked = this.trackedPositions.get(key);

    if (tracked) {
      tracked.position = position;
      tracked.remainingAmount = position.amount;
    }
  }

  /**
   * Remove position from tracking
   */
  untrackPosition(position: Position): void {
    const key = this.getPositionKey(position);
    this.trackedPositions.delete(key);
    logger.debug('Position untracked', { token: position.token.symbol });
  }

  /**
   * Handle price update event
   */
  private handlePriceUpdate(priceData: { token: string; price: bigint }): void {
    const tokenAddress = priceData.token.toLowerCase();

    for (const [posKey, tracked] of this.trackedPositions) {
      if (posKey.includes(tokenAddress)) {
        this.checkPosition(tracked, priceData.price);
      }
    }
  }

  /**
   * Check single position against take profit levels
   */
  private checkPosition(tracked: TrackedPosition, currentPrice: bigint): void {
    const { position, triggeredLevels, remainingAmount } = tracked;

    if (remainingAmount === 0n) return;

    const pnlPercent = calculatePercentChange(position.entryPrice, currentPrice);

    // Check each level
    for (const level of this.config.levels) {
      if (triggeredLevels.has(level.percent)) continue;

      if (pnlPercent >= level.percent) {
        this.triggerTakeProfit(tracked, level, currentPrice, pnlPercent);
      }
    }
  }

  /**
   * Check all positions
   */
  private async checkAllPositions(): Promise<void> {
    for (const tracked of this.trackedPositions.values()) {
      try {
        const currentPrice = await priceTracker.getCurrentPrice(
          tracked.position.token.address
        );
        this.checkPosition(tracked, currentPrice);
      } catch (error) {
        logger.debug('Could not check position', {
          token: tracked.position.token.symbol,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Trigger take profit for a level
   */
  private async triggerTakeProfit(
    tracked: TrackedPosition,
    level: TakeProfitLevel,
    currentPrice: bigint,
    pnlPercent: number
  ): Promise<void> {
    const { position, remainingAmount } = tracked;

    // Calculate amount to sell
    const sellAmount = (remainingAmount * BigInt(level.sellPercent)) / 100n;

    if (sellAmount === 0n) return;

    // Mark level as triggered
    tracked.triggeredLevels.add(level.percent);

    logger.info('Take-profit triggered', {
      token: position.token.symbol,
      level: `${level.percent}%`,
      sellPercent: `${level.sellPercent}%`,
      sellAmount: formatUnits(sellAmount),
      pnl: formatPercent(pnlPercent),
    });

    // Emit event before selling
    this.emit('takeProfitTriggered', {
      position,
      level,
      currentPrice,
      pnlPercent,
      sellAmount,
    });

    // Execute partial sell
    try {
      const result = await tradingEngine.sellToken(
        position.token.address,
        sellAmount,
        5 // Normal slippage for take profit
      );

      if (result.success) {
        tracked.remainingAmount -= sellAmount;

        logger.info('Take-profit sell executed', {
          token: position.token.symbol,
          level: `${level.percent}%`,
          txHash: result.txHash,
          amountOut: formatBNB(result.amountOut),
          remaining: formatUnits(tracked.remainingAmount),
        });

        this.emit('takeProfitSold', {
          position,
          level,
          result,
          pnlPercent,
          remainingAmount: tracked.remainingAmount,
        });

        // If all sold, remove from tracking
        if (tracked.remainingAmount === 0n) {
          this.untrackPosition(position);
        }
      } else {
        // Reset trigger on failure to retry
        tracked.triggeredLevels.delete(level.percent);

        logger.error('Take-profit sell failed', {
          token: position.token.symbol,
          error: result.error,
        });

        this.emit('takeProfitFailed', {
          position,
          level,
          error: result.error,
        });
      }
    } catch (error) {
      tracked.triggeredLevels.delete(level.percent);

      logger.error('Take-profit execution error', {
        token: position.token.symbol,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get position key
   */
  private getPositionKey(position: Position): string {
    return `${position.token.address.toLowerCase()}-${position.id}`;
  }

  /**
   * Stop the manager
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    priceTracker.off('priceUpdate', this.handlePriceUpdate.bind(this));

    logger.info('Take-profit manager stopped');
  }

  /**
   * Check if manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): TakeProfitConfig {
    return { ...this.config };
  }

  /**
   * Get configured levels
   */
  getLevels(): TakeProfitLevel[] {
    return [...this.config.levels];
  }

  /**
   * Get tracked positions
   */
  getTrackedPositions(): TrackedPosition[] {
    return Array.from(this.trackedPositions.values());
  }
}

// Export singleton instance
export const takeProfitManager = new TakeProfitManager();
