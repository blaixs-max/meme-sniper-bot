import { EventEmitter } from 'events';
import { priceTracker } from '../services/price-tracker.js';
import { stopLossManager } from './stop-loss.js';
import { takeProfitManager } from './take-profit.js';
import { createLogger } from '../utils/logger.js';
import { formatBNB, formatUnits, generateId, calculatePercentChange } from '../utils/helpers.js';
import { Position, TokenInfo, TradeResult, RiskConfig } from '../types/index.js';
import { settings } from '../config/settings.js';

const logger = createLogger('POSITION_MANAGER');

export class PositionManager extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private dailyVolume: bigint = 0n;
  private dailyVolumeResetTime: number = 0;
  private riskConfig: RiskConfig;

  constructor() {
    super();
    this.riskConfig = settings.risk;
    this.resetDailyVolume();
  }

  /**
   * Configure risk settings
   */
  configure(config: Partial<RiskConfig>): void {
    this.riskConfig = { ...this.riskConfig, ...config };
    logger.info('Position manager configured', { config: this.riskConfig });
  }

  /**
   * Check if we can open a new position
   */
  canOpenPosition(amountBNB: bigint): {
    allowed: boolean;
    reason?: string;
  } {
    // Check max concurrent positions
    if (this.positions.size >= this.riskConfig.maxConcurrentPositions) {
      return {
        allowed: false,
        reason: `Maximum concurrent positions reached (${this.riskConfig.maxConcurrentPositions})`,
      };
    }

    // Check position size
    if (amountBNB > this.riskConfig.maxPositionSizeBNB) {
      return {
        allowed: false,
        reason: `Position size ${formatBNB(amountBNB)} exceeds maximum ${formatBNB(this.riskConfig.maxPositionSizeBNB)}`,
      };
    }

    // Check daily limit
    this.checkDailyReset();
    if (this.dailyVolume + amountBNB > this.riskConfig.dailyLimitBNB) {
      const remaining = this.riskConfig.dailyLimitBNB - this.dailyVolume;
      return {
        allowed: false,
        reason: `Daily limit would be exceeded. Remaining: ${formatBNB(remaining)}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Open a new position
   */
  openPosition(
    token: TokenInfo,
    amountBNB: bigint,
    amountTokens: bigint,
    entryPrice: bigint,
    _txHash?: string
  ): Position {
    const position: Position = {
      id: generateId(),
      token,
      entryPrice,
      currentPrice: entryPrice,
      amount: amountTokens,
      amountBNB,
      entryTime: new Date(),
      pnlPercent: 0,
      pnlBNB: 0n,
      takeProfitLevels: [...this.riskConfig.takeProfitLevels],
    };

    // Store position
    this.positions.set(position.id, position);

    // Update daily volume
    this.dailyVolume += amountBNB;

    // Register with risk managers
    stopLossManager.trackPosition(position);
    takeProfitManager.trackPosition(position);

    // Track price
    priceTracker.trackToken(token.address);

    logger.info('Position opened', {
      id: position.id,
      token: token.symbol,
      amount: formatUnits(amountTokens),
      cost: formatBNB(amountBNB),
      entryPrice: formatBNB(entryPrice),
    });

    this.emit('positionOpened', position);

    return position;
  }

  /**
   * Update position with current price
   */
  async updatePosition(positionId: string): Promise<Position | null> {
    const position = this.positions.get(positionId);
    if (!position) return null;

    try {
      const currentPrice = await priceTracker.getCurrentPrice(position.token.address);

      position.currentPrice = currentPrice;
      position.pnlPercent = calculatePercentChange(position.entryPrice, currentPrice);
      position.pnlBNB = this.calculatePnLBNB(position);

      // Update in risk managers
      stopLossManager.updatePosition(position);
      takeProfitManager.updatePosition(position);

      return position;
    } catch (error) {
      logger.debug('Could not update position', {
        id: positionId,
        error: (error as Error).message,
      });
      return position;
    }
  }

  /**
   * Close a position (after selling)
   */
  closePosition(positionId: string, sellResult?: TradeResult): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;

    // Unregister from risk managers
    stopLossManager.untrackPosition(position);
    takeProfitManager.untrackPosition(position);

    // Remove from positions
    this.positions.delete(positionId);

    logger.info('Position closed', {
      id: position.id,
      token: position.token.symbol,
      pnl: `${position.pnlPercent.toFixed(2)}%`,
      txHash: sellResult?.txHash,
    });

    this.emit('positionClosed', {
      position,
      sellResult,
    });

    return position;
  }

  /**
   * Partially close a position
   */
  reducePosition(positionId: string, soldAmount: bigint, receivedBNB: bigint): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;

    const previousAmount = position.amount;
    position.amount -= soldAmount;

    // If fully sold, close position
    if (position.amount <= 0n) {
      return this.closePosition(positionId);
    }

    // Update proportional values
    const ratio = Number(position.amount) / Number(previousAmount);
    position.amountBNB = BigInt(Math.floor(Number(position.amountBNB) * ratio));

    // Update in risk managers
    stopLossManager.updatePosition(position);
    takeProfitManager.updatePosition(position);

    logger.info('Position reduced', {
      id: position.id,
      token: position.token.symbol,
      soldAmount: formatUnits(soldAmount),
      remaining: formatUnits(position.amount),
      receivedBNB: formatBNB(receivedBNB),
    });

    this.emit('positionReduced', {
      position,
      soldAmount,
      receivedBNB,
    });

    return position;
  }

  /**
   * Calculate PnL in BNB
   */
  private calculatePnLBNB(position: Position): bigint {
    if (position.currentPrice === 0n || position.entryPrice === 0n) return 0n;

    const currentValue = (position.amount * position.currentPrice) / (10n ** 18n);
    const entryValue = position.amountBNB;

    return currentValue - entryValue;
  }

  /**
   * Get position by ID
   */
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Get position by token address
   */
  getPositionByToken(tokenAddress: string): Position | undefined {
    const address = tokenAddress.toLowerCase();
    for (const position of this.positions.values()) {
      if (position.token.address.toLowerCase() === address) {
        return position;
      }
    }
    return undefined;
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get open position count
   */
  getPositionCount(): number {
    return this.positions.size;
  }

  /**
   * Get total portfolio value
   */
  async getPortfolioValue(): Promise<{
    totalValueBNB: bigint;
    totalCostBNB: bigint;
    totalPnLBNB: bigint;
    totalPnLPercent: number;
  }> {
    let totalValueBNB = 0n;
    let totalCostBNB = 0n;

    for (const position of this.positions.values()) {
      await this.updatePosition(position.id);

      const currentValue = (position.amount * position.currentPrice) / (10n ** 18n);
      totalValueBNB += currentValue;
      totalCostBNB += position.amountBNB;
    }

    const totalPnLBNB = totalValueBNB - totalCostBNB;
    const totalPnLPercent = totalCostBNB > 0n
      ? Number((totalPnLBNB * 10000n) / totalCostBNB) / 100
      : 0;

    return {
      totalValueBNB,
      totalCostBNB,
      totalPnLBNB,
      totalPnLPercent,
    };
  }

  /**
   * Get remaining daily budget
   */
  getRemainingDailyBudget(): bigint {
    this.checkDailyReset();
    return this.riskConfig.dailyLimitBNB - this.dailyVolume;
  }

  /**
   * Check and reset daily volume if needed
   */
  private checkDailyReset(): void {
    const now = Date.now();
    if (now >= this.dailyVolumeResetTime) {
      this.resetDailyVolume();
    }
  }

  /**
   * Reset daily volume
   */
  private resetDailyVolume(): void {
    this.dailyVolume = 0n;

    // Set reset time to next midnight UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    this.dailyVolumeResetTime = tomorrow.getTime();

    logger.debug('Daily volume reset', {
      nextReset: tomorrow.toISOString(),
    });
  }

  /**
   * Get risk configuration
   */
  getRiskConfig(): RiskConfig {
    return { ...this.riskConfig };
  }

  /**
   * Get position summary for display
   */
  getPositionSummary(): {
    count: number;
    totalInvested: string;
    totalPnL: string;
    remainingBudget: string;
  } {
    let totalInvested = 0n;
    let totalPnL = 0n;

    for (const position of this.positions.values()) {
      totalInvested += position.amountBNB;
      totalPnL += position.pnlBNB;
    }

    return {
      count: this.positions.size,
      totalInvested: formatBNB(totalInvested),
      totalPnL: formatBNB(totalPnL),
      remainingBudget: formatBNB(this.getRemainingDailyBudget()),
    };
  }
}

// Export singleton instance
export const positionManager = new PositionManager();
