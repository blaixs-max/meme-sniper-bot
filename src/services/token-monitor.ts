import { EventEmitter } from 'events';
import { eventListener } from './event-listener.js';
import { tradingEngine } from '../core/trading.js';
import { createLogger } from '../utils/logger.js';
import { TokenCreatedEvent, TokenInfo } from '../types/index.js';

const logger = createLogger('TOKEN_MONITOR');

export interface TokenFilter {
  nameContains?: string[];
  nameNotContains?: string[];
  symbolContains?: string[];
  symbolNotContains?: string[];
  creatorWhitelist?: string[];
  creatorBlacklist?: string[];
  minReserveBNB?: bigint;
}

export interface MonitoredToken extends TokenInfo {
  discoveredAt: Date;
  eventData: TokenCreatedEvent;
}

export class TokenMonitor extends EventEmitter {
  private isMonitoring: boolean = false;
  private filter: TokenFilter = {};
  private recentTokens: Map<string, MonitoredToken> = new Map();
  private maxRecentTokens: number = 100;

  constructor() {
    super();
  }

  /**
   * Set token filter criteria
   */
  setFilter(filter: TokenFilter): void {
    this.filter = filter;
    logger.info('Token filter updated', { filter });
  }

  /**
   * Start monitoring for new tokens
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Token monitor already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting token monitor');

    // Listen for new token events
    eventListener.on('tokenCreated', this.handleNewToken.bind(this));

    // Make sure event listener is running
    if (!eventListener.isRunning()) {
      await eventListener.start();
    }
  }

  /**
   * Handle new token created event
   */
  private async handleNewToken(event: TokenCreatedEvent): Promise<void> {
    logger.debug('New token detected', {
      symbol: event.symbol,
      name: event.name,
      address: event.token,
    });

    // Apply filters
    if (!this.passesFilter(event)) {
      logger.debug('Token filtered out', { symbol: event.symbol });
      return;
    }

    // Get full token info
    const tokenInfo = await tradingEngine.getTokenInfo(event.token);
    if (!tokenInfo) {
      logger.warn('Could not fetch token info', { address: event.token });
      return;
    }

    const monitoredToken: MonitoredToken = {
      ...tokenInfo,
      discoveredAt: new Date(),
      eventData: event,
    };

    // Store in recent tokens
    this.addRecentToken(monitoredToken);

    logger.info('New token passed filter', {
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      address: tokenInfo.address,
      creator: tokenInfo.creator,
    });

    // Emit event for strategies to handle
    this.emit('newToken', monitoredToken);
  }

  /**
   * Check if token passes the filter criteria
   */
  private passesFilter(event: TokenCreatedEvent): boolean {
    const { name, symbol, creator } = event;
    const nameLower = name.toLowerCase();
    const symbolLower = symbol.toLowerCase();
    const creatorLower = creator.toLowerCase();

    // Check name contains
    if (this.filter.nameContains?.length) {
      const matches = this.filter.nameContains.some(s =>
        nameLower.includes(s.toLowerCase())
      );
      if (!matches) return false;
    }

    // Check name not contains
    if (this.filter.nameNotContains?.length) {
      const matches = this.filter.nameNotContains.some(s =>
        nameLower.includes(s.toLowerCase())
      );
      if (matches) return false;
    }

    // Check symbol contains
    if (this.filter.symbolContains?.length) {
      const matches = this.filter.symbolContains.some(s =>
        symbolLower.includes(s.toLowerCase())
      );
      if (!matches) return false;
    }

    // Check symbol not contains
    if (this.filter.symbolNotContains?.length) {
      const matches = this.filter.symbolNotContains.some(s =>
        symbolLower.includes(s.toLowerCase())
      );
      if (matches) return false;
    }

    // Check creator whitelist
    if (this.filter.creatorWhitelist?.length) {
      const matches = this.filter.creatorWhitelist.some(addr =>
        creatorLower === addr.toLowerCase()
      );
      if (!matches) return false;
    }

    // Check creator blacklist
    if (this.filter.creatorBlacklist?.length) {
      const matches = this.filter.creatorBlacklist.some(addr =>
        creatorLower === addr.toLowerCase()
      );
      if (matches) return false;
    }

    return true;
  }

  /**
   * Add token to recent list with size limit
   */
  private addRecentToken(token: MonitoredToken): void {
    this.recentTokens.set(token.address.toLowerCase(), token);

    // Enforce size limit
    if (this.recentTokens.size > this.maxRecentTokens) {
      const oldestKey = this.recentTokens.keys().next().value;
      if (oldestKey) {
        this.recentTokens.delete(oldestKey);
      }
    }
  }

  /**
   * Get recent tokens
   */
  getRecentTokens(): MonitoredToken[] {
    return Array.from(this.recentTokens.values()).sort(
      (a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime()
    );
  }

  /**
   * Get token by address
   */
  getToken(address: string): MonitoredToken | undefined {
    return this.recentTokens.get(address.toLowerCase());
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    eventListener.off('tokenCreated', this.handleNewToken.bind(this));

    logger.info('Token monitor stopped');
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.isMonitoring;
  }

  /**
   * Clear filter
   */
  clearFilter(): void {
    this.filter = {};
    logger.info('Token filter cleared');
  }
}

// Export singleton instance
export const tokenMonitor = new TokenMonitor();
