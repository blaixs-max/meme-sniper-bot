import { ethers, WebSocketProvider, JsonRpcProvider, Network } from 'ethers';
import { BNB_CHAIN } from '../config/constants.js';
import { settings } from '../config/settings.js';
import { blockchainLogger as logger } from '../utils/logger.js';
import { delay, retry } from '../utils/helpers.js';

// Custom network for BNB Chain
const bnbNetwork = new Network(BNB_CHAIN.NAME, BNB_CHAIN.CHAIN_ID);

export class BlockchainConnection {
  private httpProvider: JsonRpcProvider | null = null;
  private wsProvider: WebSocketProvider | null = null;
  private currentRpcIndex: number = 0;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor() {
    this.setupProvider();
  }

  private async setupProvider(): Promise<void> {
    await this.connectHttp();
    await this.connectWebSocket();
  }

  private async connectHttp(): Promise<void> {
    const rpcUrls = settings.rpcUrls;

    for (let i = 0; i < rpcUrls.length; i++) {
      const rpcIndex = (this.currentRpcIndex + i) % rpcUrls.length;
      const rpcUrl = rpcUrls[rpcIndex];

      try {
        logger.debug(`Connecting to HTTP RPC: ${rpcUrl}`);

        const provider = new JsonRpcProvider(rpcUrl, bnbNetwork, {
          staticNetwork: bnbNetwork,
        });

        // Test connection
        const blockNumber = await provider.getBlockNumber();
        logger.info(`Connected to BNB Chain via ${rpcUrl}`, { blockNumber });

        this.httpProvider = provider;
        this.currentRpcIndex = rpcIndex;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        logger.warn(`Failed to connect to ${rpcUrl}`, { error: (error as Error).message });
      }
    }

    throw new Error('Failed to connect to any RPC endpoint');
  }

  private async connectWebSocket(): Promise<void> {
    try {
      logger.debug(`Connecting to WebSocket: ${settings.wssUrl}`);

      this.wsProvider = new WebSocketProvider(settings.wssUrl, bnbNetwork, {
        staticNetwork: bnbNetwork,
      });

      // Handle WebSocket events
      const ws = this.wsProvider.websocket as unknown as {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      };

      ws.on('open', () => {
        logger.info('WebSocket connected');
        this.resubscribeAllListeners();
      });

      ws.on('close', () => {
        logger.warn('WebSocket disconnected');
        this.handleWebSocketDisconnect();
      });

      ws.on('error', (error: unknown) => {
        logger.error('WebSocket error', { error: (error as Error).message });
      });

    } catch (error) {
      logger.warn('Failed to connect WebSocket, falling back to HTTP polling', {
        error: (error as Error).message,
      });
    }
  }

  private async handleWebSocketDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const backoffDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    logger.info(`Reconnecting WebSocket in ${backoffDelay}ms (attempt ${this.reconnectAttempts})`);
    await delay(backoffDelay);

    try {
      await this.connectWebSocket();
    } catch (error) {
      logger.error('WebSocket reconnect failed', { error: (error as Error).message });
    }
  }

  private resubscribeAllListeners(): void {
    for (const [eventName, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        this.wsProvider?.on(eventName, callback);
      }
    }
  }

  /**
   * Get the HTTP provider for transactions
   */
  getHttpProvider(): JsonRpcProvider {
    if (!this.httpProvider) {
      throw new Error('HTTP provider not initialized');
    }
    return this.httpProvider;
  }

  /**
   * Get the WebSocket provider for events
   */
  getWsProvider(): WebSocketProvider | null {
    return this.wsProvider;
  }

  /**
   * Get the best available provider
   */
  getProvider(): JsonRpcProvider | WebSocketProvider {
    return this.wsProvider || this.getHttpProvider();
  }

  /**
   * Check if connected to the blockchain
   */
  isBlockchainConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return retry(async () => {
      return await this.getHttpProvider().getBlockNumber();
    });
  }

  /**
   * Get gas price with multiplier
   */
  async getGasPrice(): Promise<bigint> {
    const feeData = await this.getHttpProvider().getFeeData();
    const gasPrice = feeData.gasPrice || 5000000000n; // 5 gwei default
    return BigInt(Math.floor(Number(gasPrice) * settings.gasPriceMultiplier));
  }

  /**
   * Get account balance
   */
  async getBalance(address: string): Promise<bigint> {
    return retry(async () => {
      return await this.getHttpProvider().getBalance(address);
    });
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    return retry(async () => {
      return await this.getHttpProvider().getTransactionReceipt(txHash);
    });
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1,
    timeout: number = 60000
  ): Promise<ethers.TransactionReceipt | null> {
    return this.getHttpProvider().waitForTransaction(txHash, confirmations, timeout);
  }

  /**
   * Subscribe to new blocks
   */
  onBlock(callback: (blockNumber: number) => void): void {
    const eventName = 'block';
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(callback as (...args: unknown[]) => void);

    const provider = this.wsProvider || this.httpProvider;
    provider?.on(eventName, callback);
  }

  /**
   * Subscribe to pending transactions
   */
  onPendingTransaction(callback: (txHash: string) => void): void {
    if (!this.wsProvider) {
      logger.warn('Pending transactions require WebSocket connection');
      return;
    }

    const eventName = 'pending';
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(callback as (...args: unknown[]) => void);

    this.wsProvider.on(eventName, callback);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(eventName?: string): void {
    if (eventName) {
      this.listeners.delete(eventName);
      this.httpProvider?.removeAllListeners(eventName);
      this.wsProvider?.removeAllListeners(eventName);
    } else {
      this.listeners.clear();
      this.httpProvider?.removeAllListeners();
      this.wsProvider?.removeAllListeners();
    }
  }

  /**
   * Disconnect from blockchain
   */
  async disconnect(): Promise<void> {
    this.removeAllListeners();

    if (this.wsProvider) {
      await this.wsProvider.destroy();
      this.wsProvider = null;
    }

    this.httpProvider = null;
    this.isConnected = false;

    logger.info('Disconnected from blockchain');
  }

  /**
   * Switch to next RPC if current one fails
   */
  async switchRpc(): Promise<void> {
    logger.info('Switching to next RPC endpoint');
    this.currentRpcIndex = (this.currentRpcIndex + 1) % settings.rpcUrls.length;
    await this.connectHttp();
  }
}

// Export singleton instance
export const blockchain = new BlockchainConnection();
