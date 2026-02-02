import { EventEmitter } from 'events';
import { priceTracker } from '../services/price-tracker.js';
import { tradingEngine } from '../core/trading.js';
import { createLogger } from '../utils/logger.js';
import { formatBNB, formatPercent, calculatePercentChange } from '../utils/helpers.js';
import { Position } from '../types/index.js';

const logger = createLogger('STOP_LOSS');

export interface StopLossConfig {
  enabled: boolean;
  percentThreshold: number; // e.g., 20 means -20%
  trailingEnabled: boolean;
  trailingPercent?: number; // e.g., 10 means trail by 10%
  timeBasedEnabled: boolean;
  maxHoldTimeMinutes?: number; // Auto-sell after this time
}

interface TrackedPosition {
  position: Position;
  stopLossPrice: bigint;
  highestPrice: bigint; // For trailing stop
  startTime: Date;
}

export class StopLossManager extends EventEmitter {
  private config: StopLossConfig;
  private trackedPositions: Map<string, TrackedPosition> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<StopLossConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      percentThreshold: 20,
      trailingEnabled: false,
      trailingPercent: 10,
      timeBasedEnabled: false,
      maxHoldTimeMinutes: 60,
      ...config,
    };
  }

  /**
   * Update configuration
   */
  configure(config: Partial<StopLossConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Stop-loss configuration updated', { config: this.config });

    // Recalculate stop losses for existing positions
    for (const tracked of this.trackedPositions.values()) {
      this.updateStopLoss(tracked);
    }
  }

  /**
   * Start monitoring positions
   */
  start(checkIntervalMs: number = 5000): void {
    if (this.isRunning) {
      logger.warn('Stop-loss manager already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Stop-loss is disabled');
      return;
    }

    this.isRunning = true;
    logger.info('Starting stop-loss manager');

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

    // Calculate initial stop loss price
    const stopLossPrice = this.calculateStopLossPrice(
      position.entryPrice,
      position.entryPrice
    );

    const tracked: TrackedPosition = {
      position,
      stopLossPrice,
      highestPrice: position.entryPrice,
      startTime: new Date(),
    };

    this.trackedPositions.set(key, tracked);

    // Start tracking price
    priceTracker.trackToken(position.token.address);

    logger.info('Position tracked for stop-loss', {
      token: position.token.symbol,
      entryPrice: formatBNB(position.entryPrice),
      stopLossPrice: formatBNB(stopLossPrice),
    });
  }

  /**
   * Update position (e.g., after partial sell)
   */
  updatePosition(position: Position): void {
    const key = this.getPositionKey(position);
    const tracked = this.trackedPositions.get(key);

    if (tracked) {
      tracked.position = position;
      this.updateStopLoss(tracked);
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
    const key = priceData.token.toLowerCase();

    for (const [posKey, tracked] of this.trackedPositions) {
      if (posKey.includes(key)) {
        this.checkPosition(tracked, priceData.price);
      }
    }
  }

  /**
   * Check single position against stop loss
   */
  private checkPosition(tracked: TrackedPosition, currentPrice: bigint): void {
    const { position, stopLossPrice, highestPrice } = tracked;

    // Update highest price for trailing stop
    if (currentPrice > highestPrice) {
      tracked.highestPrice = currentPrice;

      // Recalculate trailing stop
      if (this.config.trailingEnabled) {
        this.updateStopLoss(tracked);
      }
    }

    // Check if stop loss triggered
    if (currentPrice <= stopLossPrice) {
      this.triggerStopLoss(tracked, currentPrice);
      return;
    }

    // Check time-based stop loss
    if (this.config.timeBasedEnabled && this.config.maxHoldTimeMinutes) {
      const holdTimeMinutes = (Date.now() - tracked.startTime.getTime()) / 60000;
      if (holdTimeMinutes >= this.config.maxHoldTimeMinutes) {
        const pnl = calculatePercentChange(position.entryPrice, currentPrice);
        if (pnl < 0) {
          logger.info('Time-based stop loss triggered', {
            token: position.token.symbol,
            holdTime: `${Math.floor(holdTimeMinutes)} minutes`,
            pnl: formatPercent(pnl),
          });
          this.triggerStopLoss(tracked, currentPrice);
        }
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
   * Trigger stop loss for a position
   */
  private async triggerStopLoss(
    tracked: TrackedPosition,
    currentPrice: bigint
  ): Promise<void> {
    const { position } = tracked;
    const pnl = calculatePercentChange(position.entryPrice, currentPrice);

    logger.warn('Stop-loss triggered', {
      token: position.token.symbol,
      entryPrice: formatBNB(position.entryPrice),
      currentPrice: formatBNB(currentPrice),
      stopLossPrice: formatBNB(tracked.stopLossPrice),
      pnl: formatPercent(pnl),
    });

    // Emit event before selling
    this.emit('stopLossTriggered', {
      position,
      currentPrice,
      pnl,
    });

    // Execute sell
    try {
      const result = await tradingEngine.sellAllTokens(
        position.token.address,
        10 // Higher slippage for emergency sell
      );

      if (result.success) {
        logger.info('Stop-loss sell executed', {
          token: position.token.symbol,
          txHash: result.txHash,
          amountOut: formatBNB(result.amountOut),
        });

        this.emit('stopLossSold', {
          position,
          result,
          pnl,
        });
      } else {
        logger.error('Stop-loss sell failed', {
          token: position.token.symbol,
          error: result.error,
        });

        this.emit('stopLossFailed', {
          position,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Stop-loss execution error', {
        token: position.token.symbol,
        error: (error as Error).message,
      });
    }

    // Remove from tracking
    this.untrackPosition(position);
  }

  /**
   * Update stop loss price for a tracked position
   */
  private updateStopLoss(tracked: TrackedPosition): void {
    tracked.stopLossPrice = this.calculateStopLossPrice(
      tracked.position.entryPrice,
      tracked.highestPrice
    );
  }

  /**
   * Calculate stop loss price
   */
  private calculateStopLossPrice(entryPrice: bigint, highestPrice: bigint): bigint {
    if (this.config.trailingEnabled && this.config.trailingPercent) {
      // Trailing stop: use highest price
      const trailAmount = (highestPrice * BigInt(this.config.trailingPercent)) / 100n;
      return highestPrice - trailAmount;
    }

    // Fixed stop: use entry price
    const stopAmount = (entryPrice * BigInt(this.config.percentThreshold)) / 100n;
    return entryPrice - stopAmount;
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

    logger.info('Stop-loss manager stopped');
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
  getConfig(): StopLossConfig {
    return { ...this.config };
  }

  /**
   * Get all tracked positions
   */
  getTrackedPositions(): TrackedPosition[] {
    return Array.from(this.trackedPositions.values());
  }
}

// Export singleton instance with default config
export const stopLossManager = new StopLossManager();
