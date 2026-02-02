import { ethers, Contract } from 'ethers';
import { blockchain } from '../core/blockchain.js';
import { FOUR_MEME, SECURITY } from '../config/constants.js';
import { securityLogger as logger } from '../utils/logger.js';
import { HoneypotCheckResult } from '../types/index.js';
import fourMemeAbi from '../../abis/four-meme.json';

const TOKEN_MANAGER_ABI = fourMemeAbi.TokenManager2;
const ERC20_ABI = fourMemeAbi.ERC20;

export class HoneypotChecker {
  private tokenManagerContract: Contract;

  constructor() {
    this.tokenManagerContract = new Contract(
      FOUR_MEME.TOKEN_MANAGER,
      TOKEN_MANAGER_ABI,
      blockchain.getHttpProvider()
    );
  }

  /**
   * Check if a token is a honeypot by simulating a buy and sell
   */
  async check(tokenAddress: string): Promise<HoneypotCheckResult> {
    logger.info('Checking for honeypot', { token: tokenAddress });

    try {
      // Get token contract
      const tokenContract = new Contract(
        tokenAddress,
        ERC20_ABI,
        blockchain.getHttpProvider()
      );

      // Check basic ERC20 functions work
      try {
        await tokenContract.name();
        await tokenContract.symbol();
        await tokenContract.decimals();
        await tokenContract.totalSupply();
      } catch (error) {
        return {
          isHoneypot: true,
          canSell: false,
          sellTax: 100,
          buyTax: 100,
          error: 'Token does not implement basic ERC20 functions',
        };
      }

      // Simulate buy - calculate expected output
      const testBuyAmount = ethers.parseEther('0.01'); // 0.01 BNB
      let buyOutput: bigint;

      try {
        buyOutput = await this.tokenManagerContract.calculateBuyAmount(
          tokenAddress,
          testBuyAmount
        );

        if (buyOutput === 0n) {
          return {
            isHoneypot: true,
            canSell: false,
            sellTax: 100,
            buyTax: 100,
            error: 'Cannot buy token (zero output)',
          };
        }
      } catch (error) {
        return {
          isHoneypot: true,
          canSell: false,
          sellTax: 100,
          buyTax: 100,
          error: `Buy simulation failed: ${(error as Error).message}`,
        };
      }

      // Simulate sell - calculate expected output
      let sellOutput: bigint;

      try {
        sellOutput = await this.tokenManagerContract.calculateSellAmount(
          tokenAddress,
          buyOutput
        );

        if (sellOutput === 0n) {
          return {
            isHoneypot: true,
            canSell: false,
            sellTax: 100,
            buyTax: 0,
            error: 'Cannot sell token (zero output)',
          };
        }
      } catch (error) {
        return {
          isHoneypot: true,
          canSell: false,
          sellTax: 100,
          buyTax: 0,
          error: `Sell simulation failed: ${(error as Error).message}`,
        };
      }

      // Calculate effective taxes
      // For a round trip: buy with X BNB -> get Y tokens -> sell Y tokens -> get Z BNB
      // Total loss = X - Z, includes both buy and sell fees/slippage
      const roundTripLoss = testBuyAmount - sellOutput;
      const totalTaxPercent = Number((roundTripLoss * 100n) / testBuyAmount);

      // Estimate individual taxes (rough approximation)
      // Assuming roughly equal buy and sell tax
      const buyTax = Math.floor(totalTaxPercent / 2);
      const sellTax = Math.ceil(totalTaxPercent / 2);

      // Check if taxes are too high
      const isHoneypot = sellTax > SECURITY.MAX_SELL_TAX || buyTax > SECURITY.MAX_BUY_TAX;

      const result: HoneypotCheckResult = {
        isHoneypot,
        canSell: true,
        sellTax,
        buyTax,
      };

      logger.info('Honeypot check complete', {
        token: tokenAddress,
        ...result,
      });

      return result;
    } catch (error) {
      logger.error('Honeypot check error', {
        token: tokenAddress,
        error: (error as Error).message,
      });

      return {
        isHoneypot: true,
        canSell: false,
        sellTax: 100,
        buyTax: 100,
        error: `Check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check transfer restrictions
   */
  async checkTransferRestrictions(tokenAddress: string): Promise<{
    restricted: boolean;
    reason?: string;
  }> {
    try {
      const tokenContract = new Contract(
        tokenAddress,
        ERC20_ABI,
        blockchain.getHttpProvider()
      );

      // Try to get transfer-related functions that might indicate restrictions
      const provider = blockchain.getHttpProvider();
      const code = await provider.getCode(tokenAddress);

      // Check for common restriction patterns in bytecode
      // These are simplified checks - real implementation would be more thorough

      // Check for pause functionality
      if (code.includes('5c975abb')) { // paused() selector
        // Contract has pause functionality
        try {
          const paused = await tokenContract.paused();
          if (paused) {
            return {
              restricted: true,
              reason: 'Token transfers are paused',
            };
          }
        } catch {
          // Function doesn't exist or isn't standard
        }
      }

      // Check for blacklist functionality
      if (code.includes('44337ea1') || code.includes('fe575a87')) { // isBlacklisted selectors
        return {
          restricted: false, // Has blacklist but we don't know if we're on it
          reason: 'Token has blacklist functionality',
        };
      }

      return { restricted: false };
    } catch (error) {
      return {
        restricted: true,
        reason: `Could not verify: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Perform quick honeypot check (faster but less thorough)
   */
  async quickCheck(tokenAddress: string): Promise<boolean> {
    try {
      // Just check if sell simulation works
      const tokenContract = new Contract(
        tokenAddress,
        ERC20_ABI,
        blockchain.getHttpProvider()
      );

      // Basic checks
      await tokenContract.totalSupply();

      // Check sell is possible
      const testAmount = ethers.parseEther('1000'); // Test with 1000 tokens
      const sellOutput = await this.tokenManagerContract.calculateSellAmount(
        tokenAddress,
        testAmount
      );

      // If sell output is 0 or very low (>99% tax), it's likely a honeypot
      return sellOutput === 0n;
    } catch {
      return true; // Assume honeypot if check fails
    }
  }
}

// Export singleton instance
export const honeypotChecker = new HoneypotChecker();
