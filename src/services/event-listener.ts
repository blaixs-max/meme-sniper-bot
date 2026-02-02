import { ethers, Contract, EventLog } from 'ethers';
import { EventEmitter } from 'events';
import { blockchain } from '../core/blockchain.js';
import { FOUR_MEME, BNB_CHAIN } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import {
  TokenCreatedEvent,
  TokenPurchaseEvent,
  TokenSaleEvent,
  TokenMigratedEvent,
} from '../types/index.js';
import fourMemeAbi from '../../abis/four-meme.json';

const logger = createLogger('EVENT_LISTENER');
const TOKEN_MANAGER_ABI = fourMemeAbi.TokenManager2;

export class EventListener extends EventEmitter {
  private contract: Contract | null = null;
  private isListening: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: number = 0;

  constructor() {
    super();
  }

  /**
   * Initialize event listener
   */
  async initialize(): Promise<void> {
    const provider = blockchain.getProvider();

    this.contract = new Contract(
      FOUR_MEME.TOKEN_MANAGER,
      TOKEN_MANAGER_ABI,
      provider
    );

    this.lastProcessedBlock = await blockchain.getBlockNumber();
    logger.info('Event listener initialized', {
      contract: FOUR_MEME.TOKEN_MANAGER,
      startBlock: this.lastProcessedBlock,
    });
  }

  /**
   * Start listening for events
   */
  async start(): Promise<void> {
    if (this.isListening) {
      logger.warn('Event listener already running');
      return;
    }

    if (!this.contract) {
      await this.initialize();
    }

    this.isListening = true;
    logger.info('Starting event listener');

    // Try WebSocket first, fall back to polling
    const wsProvider = blockchain.getWsProvider();
    if (wsProvider) {
      this.startWebSocketListening();
    } else {
      this.startPolling();
    }
  }

  /**
   * Start WebSocket-based event listening
   */
  private startWebSocketListening(): void {
    if (!this.contract) return;

    logger.info('Using WebSocket for event listening');

    // Listen for TokenCreated events
    this.contract.on('TokenCreated', (token, creator, name, symbol, timestamp, event) => {
      const eventData: TokenCreatedEvent = {
        token,
        creator,
        name,
        symbol,
        timestamp: Number(timestamp),
        txHash: (event as EventLog).transactionHash,
        blockNumber: (event as EventLog).blockNumber,
      };

      logger.info('New token created', {
        symbol,
        name,
        token,
        creator,
      });

      this.emit('tokenCreated', eventData);
    });

    // Listen for TokenPurchase events
    this.contract.on('TokenPurchase', (buyer, token, amountIn, amountOut, timestamp, event) => {
      const eventData: TokenPurchaseEvent = {
        buyer,
        token,
        amountIn,
        amountOut,
        timestamp: Number(timestamp),
        txHash: (event as EventLog).transactionHash,
        blockNumber: (event as EventLog).blockNumber,
      };

      logger.debug('Token purchase', {
        token,
        buyer: buyer.slice(0, 10) + '...',
        amountIn: ethers.formatEther(amountIn),
      });

      this.emit('tokenPurchase', eventData);
    });

    // Listen for TokenSale events
    this.contract.on('TokenSale', (seller, token, amountIn, amountOut, timestamp, event) => {
      const eventData: TokenSaleEvent = {
        seller,
        token,
        amountIn,
        amountOut,
        timestamp: Number(timestamp),
        txHash: (event as EventLog).transactionHash,
        blockNumber: (event as EventLog).blockNumber,
      };

      logger.debug('Token sale', {
        token,
        seller: seller.slice(0, 10) + '...',
        amountOut: ethers.formatEther(amountOut),
      });

      this.emit('tokenSale', eventData);
    });

    // Listen for TokenMigrated events
    this.contract.on('TokenMigrated', (token, pair, liquidity, timestamp, event) => {
      const eventData: TokenMigratedEvent = {
        token,
        pair,
        liquidity,
        timestamp: Number(timestamp),
        txHash: (event as EventLog).transactionHash,
        blockNumber: (event as EventLog).blockNumber,
      };

      logger.info('Token migrated to PancakeSwap', {
        token,
        pair,
        liquidity: ethers.formatEther(liquidity),
      });

      this.emit('tokenMigrated', eventData);
    });
  }

  /**
   * Start polling-based event listening (fallback)
   */
  private startPolling(): void {
    logger.info('Using HTTP polling for event listening');

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollEvents();
      } catch (error) {
        logger.error('Polling error', { error: (error as Error).message });
      }
    }, BNB_CHAIN.BLOCK_TIME);
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    if (!this.contract) return;

    const currentBlock = await blockchain.getBlockNumber();
    if (currentBlock <= this.lastProcessedBlock) return;

    const fromBlock = this.lastProcessedBlock + 1;
    const toBlock = Math.min(currentBlock, fromBlock + 100); // Process max 100 blocks at a time

    // Query TokenCreated events
    const tokenCreatedFilter = this.contract.filters.TokenCreated();
    const createdEvents = await this.contract.queryFilter(tokenCreatedFilter, fromBlock, toBlock);

    for (const event of createdEvents) {
      const log = event as EventLog;
      if (log.args) {
        const eventData: TokenCreatedEvent = {
          token: log.args[0],
          creator: log.args[1],
          name: log.args[2],
          symbol: log.args[3],
          timestamp: Number(log.args[4]),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
        this.emit('tokenCreated', eventData);
      }
    }

    // Query TokenPurchase events
    const purchaseFilter = this.contract.filters.TokenPurchase();
    const purchaseEvents = await this.contract.queryFilter(purchaseFilter, fromBlock, toBlock);

    for (const event of purchaseEvents) {
      const log = event as EventLog;
      if (log.args) {
        const eventData: TokenPurchaseEvent = {
          buyer: log.args[0],
          token: log.args[1],
          amountIn: log.args[2],
          amountOut: log.args[3],
          timestamp: Number(log.args[4]),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
        this.emit('tokenPurchase', eventData);
      }
    }

    // Query TokenSale events
    const saleFilter = this.contract.filters.TokenSale();
    const saleEvents = await this.contract.queryFilter(saleFilter, fromBlock, toBlock);

    for (const event of saleEvents) {
      const log = event as EventLog;
      if (log.args) {
        const eventData: TokenSaleEvent = {
          seller: log.args[0],
          token: log.args[1],
          amountIn: log.args[2],
          amountOut: log.args[3],
          timestamp: Number(log.args[4]),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
        this.emit('tokenSale', eventData);
      }
    }

    // Query TokenMigrated events
    const migratedFilter = this.contract.filters.TokenMigrated();
    const migratedEvents = await this.contract.queryFilter(migratedFilter, fromBlock, toBlock);

    for (const event of migratedEvents) {
      const log = event as EventLog;
      if (log.args) {
        const eventData: TokenMigratedEvent = {
          token: log.args[0],
          pair: log.args[1],
          liquidity: log.args[2],
          timestamp: Number(log.args[3]),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
        this.emit('tokenMigrated', eventData);
      }
    }

    this.lastProcessedBlock = toBlock;
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (!this.isListening) return;

    this.isListening = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.contract) {
      this.contract.removeAllListeners();
    }

    logger.info('Event listener stopped');
  }

  /**
   * Get historical events
   */
  async getHistoricalEvents(
    eventName: 'TokenCreated' | 'TokenPurchase' | 'TokenSale' | 'TokenMigrated',
    fromBlock: number,
    toBlock?: number
  ): Promise<EventLog[]> {
    if (!this.contract) {
      await this.initialize();
    }

    const filter = this.contract!.filters[eventName]();
    const events = await this.contract!.queryFilter(
      filter,
      fromBlock,
      toBlock || 'latest'
    );

    return events as EventLog[];
  }

  /**
   * Get events for a specific token
   */
  async getTokenEvents(
    tokenAddress: string,
    fromBlock?: number
  ): Promise<{
    purchases: TokenPurchaseEvent[];
    sales: TokenSaleEvent[];
  }> {
    if (!this.contract) {
      await this.initialize();
    }

    const startBlock = fromBlock || (await blockchain.getBlockNumber()) - 10000;

    // Get purchase events for this token
    const purchaseFilter = this.contract!.filters.TokenPurchase(null, tokenAddress);
    const purchaseEvents = await this.contract!.queryFilter(purchaseFilter, startBlock);

    const purchases: TokenPurchaseEvent[] = purchaseEvents.map(e => {
      const log = e as EventLog;
      return {
        buyer: log.args![0],
        token: log.args![1],
        amountIn: log.args![2],
        amountOut: log.args![3],
        timestamp: Number(log.args![4]),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });

    // Get sale events for this token
    const saleFilter = this.contract!.filters.TokenSale(null, tokenAddress);
    const saleEvents = await this.contract!.queryFilter(saleFilter, startBlock);

    const sales: TokenSaleEvent[] = saleEvents.map(e => {
      const log = e as EventLog;
      return {
        seller: log.args![0],
        token: log.args![1],
        amountIn: log.args![2],
        amountOut: log.args![3],
        timestamp: Number(log.args![4]),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });

    return { purchases, sales };
  }

  /**
   * Check if listener is running
   */
  isRunning(): boolean {
    return this.isListening;
  }
}

// Export singleton instance
export const eventListener = new EventListener();
