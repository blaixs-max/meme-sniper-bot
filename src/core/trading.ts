import { Contract } from 'ethers';
import { blockchain } from './blockchain.js';
import { walletManager } from './wallet.js';
import { FOUR_MEME, TRADING } from '../config/constants.js';
import { settings } from '../config/settings.js';
import { tradeLogger as logger } from '../utils/logger.js';
import { formatBNB, formatUnits, calculateSlippage, delay } from '../utils/helpers.js';
import { TradeResult, TokenInfo } from '../types/index.js';
import fourMemeAbi from '../../abis/four-meme.json';

const TOKEN_MANAGER_ABI = fourMemeAbi.TokenManager2;
const ERC20_ABI = fourMemeAbi.ERC20;

export class TradingEngine {
  private tokenManagerContract: Contract | null = null;

  /**
   * Initialize trading engine with contracts
   */
  async initialize(): Promise<void> {
    const wallet = walletManager.getWallet();

    this.tokenManagerContract = new Contract(
      FOUR_MEME.TOKEN_MANAGER,
      TOKEN_MANAGER_ABI,
      wallet
    );

    logger.info('Trading engine initialized', {
      tokenManager: FOUR_MEME.TOKEN_MANAGER,
    });
  }

  /**
   * Get token manager contract
   */
  getTokenManager(): Contract {
    if (!this.tokenManagerContract) {
      throw new Error('Trading engine not initialized');
    }
    return this.tokenManagerContract;
  }

  /**
   * Calculate expected output amount for buy
   */
  async calculateBuyAmount(tokenAddress: string, amountInBNB: bigint): Promise<bigint> {
    try {
      const contract = this.getTokenManager();
      return await contract.calculateBuyAmount(tokenAddress, amountInBNB);
    } catch (error) {
      logger.warn('Failed to calculate buy amount, using estimate', {
        error: (error as Error).message,
      });
      // Return a rough estimate if the function fails
      return 0n;
    }
  }

  /**
   * Calculate expected output amount for sell
   */
  async calculateSellAmount(tokenAddress: string, amountInTokens: bigint): Promise<bigint> {
    try {
      const contract = this.getTokenManager();
      return await contract.calculateSellAmount(tokenAddress, amountInTokens);
    } catch (error) {
      logger.warn('Failed to calculate sell amount', {
        error: (error as Error).message,
      });
      return 0n;
    }
  }

  /**
   * Get current token price
   */
  async getTokenPrice(tokenAddress: string): Promise<bigint> {
    try {
      const contract = this.getTokenManager();
      return await contract.getTokenPrice(tokenAddress);
    } catch {
      return 0n;
    }
  }

  /**
   * Get token info from Four.meme
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const contract = this.getTokenManager();
      const info = await contract.tokens(tokenAddress);

      // Get additional ERC20 info
      const tokenContract = new Contract(
        tokenAddress,
        ERC20_ABI,
        blockchain.getHttpProvider()
      );

      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: info.totalSupply,
        creator: info.creator,
        createdAt: new Date(Number(info.createdAt) * 1000),
        reserveBNB: info.reserveBNB,
        reserveToken: info.reserveToken,
        isMigrated: info.isMigrated,
        price: await this.getTokenPrice(tokenAddress),
      };
    } catch (error) {
      logger.error('Failed to get token info', {
        tokenAddress,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Buy token on Four.meme
   */
  async buyToken(
    tokenAddress: string,
    amountBNB: bigint,
    slippagePercent: number = settings.defaultSlippage
  ): Promise<TradeResult> {
    logger.info('Initiating buy', {
      token: tokenAddress,
      amount: formatBNB(amountBNB),
      slippage: `${slippagePercent}%`,
    });

    try {
      // Check balance
      const balance = await walletManager.getBnbBalance();
      if (balance < amountBNB) {
        return {
          success: false,
          amountIn: amountBNB,
          amountOut: 0n,
          error: `Insufficient BNB balance. Have: ${formatBNB(balance)}, Need: ${formatBNB(amountBNB)}`,
        };
      }

      // Calculate expected output and minimum with slippage
      const expectedOutput = await this.calculateBuyAmount(tokenAddress, amountBNB);
      const minAmountOut = calculateSlippage(expectedOutput, slippagePercent);

      logger.debug('Buy calculation', {
        expectedOutput: formatUnits(expectedOutput),
        minAmountOut: formatUnits(minAmountOut),
      });

      // Get gas price
      const gasPrice = await blockchain.getGasPrice();

      // Execute buy transaction
      const contract = this.getTokenManager();
      const tx = await contract.buyToken(tokenAddress, minAmountOut, {
        value: amountBNB,
        gasLimit: TRADING.DEFAULT_GAS_LIMIT,
        gasPrice,
        nonce: await walletManager.getNextNonce(),
      });

      logger.info('Buy transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await blockchain.waitForTransaction(tx.hash, 1, TRADING.TX_TIMEOUT);

      if (!receipt || receipt.status === 0) {
        await walletManager.resetNonce();
        return {
          success: false,
          txHash: tx.hash,
          amountIn: amountBNB,
          amountOut: 0n,
          error: 'Transaction failed',
        };
      }

      // Parse the TokenPurchase event to get actual output
      let actualOutput = expectedOutput;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'TokenPurchase') {
            actualOutput = parsed.args.amountOut;
            break;
          }
        } catch {
          // Not our event, continue
        }
      }

      logger.info('Buy successful', {
        txHash: receipt.hash,
        amountIn: formatBNB(amountBNB),
        amountOut: formatUnits(actualOutput),
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.hash,
        amountIn: amountBNB,
        amountOut: actualOutput,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      await walletManager.resetNonce();
      const errorMessage = (error as Error).message;

      logger.error('Buy failed', {
        token: tokenAddress,
        error: errorMessage,
      });

      return {
        success: false,
        amountIn: amountBNB,
        amountOut: 0n,
        error: errorMessage,
      };
    }
  }

  /**
   * Sell token on Four.meme
   */
  async sellToken(
    tokenAddress: string,
    amountTokens: bigint,
    slippagePercent: number = settings.defaultSlippage
  ): Promise<TradeResult> {
    logger.info('Initiating sell', {
      token: tokenAddress,
      amount: formatUnits(amountTokens),
      slippage: `${slippagePercent}%`,
    });

    try {
      // Check token balance
      const tokenBalance = await walletManager.getTokenBalance(tokenAddress);
      if (tokenBalance < amountTokens) {
        return {
          success: false,
          amountIn: amountTokens,
          amountOut: 0n,
          error: `Insufficient token balance. Have: ${formatUnits(tokenBalance)}, Need: ${formatUnits(amountTokens)}`,
        };
      }

      // Check and approve if needed
      const allowance = await walletManager.getAllowance(tokenAddress, FOUR_MEME.TOKEN_MANAGER);
      if (allowance < amountTokens) {
        logger.info('Approving token for sell');
        await walletManager.approveToken(tokenAddress, FOUR_MEME.TOKEN_MANAGER);
        await delay(3000); // Wait for approval to be confirmed
      }

      // Calculate expected output and minimum with slippage
      const expectedOutput = await this.calculateSellAmount(tokenAddress, amountTokens);
      const minAmountOut = calculateSlippage(expectedOutput, slippagePercent);

      logger.debug('Sell calculation', {
        expectedOutput: formatBNB(expectedOutput),
        minAmountOut: formatBNB(minAmountOut),
      });

      // Get gas price
      const gasPrice = await blockchain.getGasPrice();

      // Execute sell transaction
      const contract = this.getTokenManager();
      const tx = await contract.sellToken(tokenAddress, amountTokens, minAmountOut, {
        gasLimit: TRADING.DEFAULT_GAS_LIMIT,
        gasPrice,
        nonce: await walletManager.getNextNonce(),
      });

      logger.info('Sell transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await blockchain.waitForTransaction(tx.hash, 1, TRADING.TX_TIMEOUT);

      if (!receipt || receipt.status === 0) {
        await walletManager.resetNonce();
        return {
          success: false,
          txHash: tx.hash,
          amountIn: amountTokens,
          amountOut: 0n,
          error: 'Transaction failed',
        };
      }

      // Parse the TokenSale event to get actual output
      let actualOutput = expectedOutput;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'TokenSale') {
            actualOutput = parsed.args.amountOut;
            break;
          }
        } catch {
          // Not our event, continue
        }
      }

      logger.info('Sell successful', {
        txHash: receipt.hash,
        amountIn: formatUnits(amountTokens),
        amountOut: formatBNB(actualOutput),
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.hash,
        amountIn: amountTokens,
        amountOut: actualOutput,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      await walletManager.resetNonce();
      const errorMessage = (error as Error).message;

      logger.error('Sell failed', {
        token: tokenAddress,
        error: errorMessage,
      });

      return {
        success: false,
        amountIn: amountTokens,
        amountOut: 0n,
        error: errorMessage,
      };
    }
  }

  /**
   * Sell all tokens
   */
  async sellAllTokens(
    tokenAddress: string,
    slippagePercent: number = settings.defaultSlippage
  ): Promise<TradeResult> {
    const balance = await walletManager.getTokenBalance(tokenAddress);
    if (balance === 0n) {
      return {
        success: false,
        amountIn: 0n,
        amountOut: 0n,
        error: 'No tokens to sell',
      };
    }

    return this.sellToken(tokenAddress, balance, slippagePercent);
  }

  /**
   * Execute buy with retry logic
   */
  async buyWithRetry(
    tokenAddress: string,
    amountBNB: bigint,
    slippagePercent: number = settings.defaultSlippage,
    maxRetries: number = TRADING.MAX_RETRIES
  ): Promise<TradeResult> {
    let lastResult: TradeResult = {
      success: false,
      amountIn: amountBNB,
      amountOut: 0n,
      error: 'No attempts made',
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResult = await this.buyToken(tokenAddress, amountBNB, slippagePercent);

      if (lastResult.success) {
        return lastResult;
      }

      // Check if error is retryable
      if (lastResult.error?.includes('Insufficient') ||
          lastResult.error?.includes('Invalid')) {
        break; // Don't retry for these errors
      }

      if (attempt < maxRetries) {
        logger.info(`Retrying buy (attempt ${attempt + 1}/${maxRetries})`);
        await delay(TRADING.RETRY_DELAY * attempt);

        // Increase slippage for retry
        slippagePercent = Math.min(slippagePercent + 2, TRADING.MAX_SLIPPAGE);
      }
    }

    return lastResult;
  }
}

// Export singleton instance
export const tradingEngine = new TradingEngine();
