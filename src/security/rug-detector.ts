import { ethers, Contract } from 'ethers';
import { blockchain } from '../core/blockchain.js';
import { SECURITY } from '../config/constants.js';
import { securityLogger as logger } from '../utils/logger.js';
import { RugPullAnalysis, RugPullIndicator } from '../types/index.js';

// Extended ABI for ownership checks
const OWNABLE_ABI = [
  'function owner() view returns (address)',
  'function renounceOwnership() external',
  'function transferOwnership(address) external',
];

// Common rug pull function selectors
const RUG_SELECTORS = {
  mint: '40c10f19', // mint(address,uint256)
  setFee: 'a22cb465', // various fee setters
  blacklist: '44337ea1', // blacklist(address)
  pause: '8456cb59', // pause()
  setMaxTx: '3f4218e0', // setMaxTxAmount
  excludeFromFee: '437823ec', // excludeFromFee
  setTradingEnabled: 'c9567bf9', // various trading controls
};

export class RugPullDetector {
  /**
   * Analyze token for rug pull risks
   */
  async analyze(tokenAddress: string): Promise<RugPullAnalysis> {
    logger.info('Analyzing for rug pull risks', { token: tokenAddress });

    const indicators: RugPullIndicator[] = [];

    try {
      // Check ownership
      const ownershipResult = await this.checkOwnership(tokenAddress);
      if (ownershipResult) {
        indicators.push(ownershipResult);
      }

      // Check for dangerous functions
      const dangerousFunctions = await this.checkDangerousFunctions(tokenAddress);
      indicators.push(...dangerousFunctions);

      // Check mint function
      const mintResult = await this.checkMintFunction(tokenAddress);
      if (mintResult) {
        indicators.push(mintResult);
      }

      // Check for proxy pattern
      const proxyResult = await this.checkProxyPattern(tokenAddress);
      if (proxyResult) {
        indicators.push(proxyResult);
      }

      // Determine overall risk level
      const riskLevel = this.calculateRiskLevel(indicators);

      const result: RugPullAnalysis = {
        hasRisk: indicators.length > 0,
        riskLevel,
        indicators,
      };

      logger.info('Rug pull analysis complete', {
        token: tokenAddress,
        riskLevel,
        indicatorCount: indicators.length,
      });

      return result;
    } catch (error) {
      logger.error('Rug pull analysis error', {
        token: tokenAddress,
        error: (error as Error).message,
      });

      return {
        hasRisk: true,
        riskLevel: 'high',
        indicators: [{
          type: 'analysis_failed',
          description: `Could not analyze: ${(error as Error).message}`,
          severity: 'high',
        }],
      };
    }
  }

  /**
   * Check ownership status
   */
  private async checkOwnership(tokenAddress: string): Promise<RugPullIndicator | null> {
    try {
      const contract = new Contract(
        tokenAddress,
        OWNABLE_ABI,
        blockchain.getHttpProvider()
      );

      const owner = await contract.owner();

      // Check if ownership is renounced (zero address)
      if (owner === ethers.ZeroAddress) {
        return null; // Ownership renounced - good
      }

      // Check if owner is a contract (might be timelock/multisig - better)
      const ownerCode = await blockchain.getHttpProvider().getCode(owner);
      if (ownerCode !== '0x') {
        return {
          type: 'ownership',
          description: 'Owner is a contract (possibly timelock/multisig)',
          severity: 'low',
        };
      }

      // Owner is an EOA - higher risk
      return {
        type: 'ownership',
        description: `Ownership not renounced. Owner: ${owner.slice(0, 10)}...`,
        severity: 'medium',
      };
    } catch {
      // Contract doesn't have owner function - might be ownable or not
      return null;
    }
  }

  /**
   * Check for dangerous functions in contract
   */
  private async checkDangerousFunctions(
    tokenAddress: string
  ): Promise<RugPullIndicator[]> {
    const indicators: RugPullIndicator[] = [];

    try {
      const code = await blockchain.getHttpProvider().getCode(tokenAddress);
      const codeLower = code.toLowerCase();

      for (const funcName of SECURITY.SUSPICIOUS_OWNER_FUNCTIONS) {
        // Check if function selector exists in bytecode
        const selector = RUG_SELECTORS[funcName as keyof typeof RUG_SELECTORS];
        if (selector && codeLower.includes(selector)) {
          let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

          // Determine severity based on function
          if (['mint', 'blacklist', 'pause'].includes(funcName)) {
            severity = 'high';
          } else if (['setFee', 'setTax'].includes(funcName)) {
            severity = 'medium';
          }

          indicators.push({
            type: 'ownership',
            description: `Contract has ${funcName} function`,
            severity,
          });
        }
      }
    } catch (error) {
      logger.debug('Could not check dangerous functions', {
        error: (error as Error).message,
      });
    }

    return indicators;
  }

  /**
   * Check for mint function and if it's restricted
   */
  private async checkMintFunction(
    tokenAddress: string
  ): Promise<RugPullIndicator | null> {
    try {
      const code = await blockchain.getHttpProvider().getCode(tokenAddress);

      // Check for mint selector
      if (code.toLowerCase().includes(RUG_SELECTORS.mint)) {
        return {
          type: 'mint',
          description: 'Contract has mint function - owner can create new tokens',
          severity: 'high',
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if contract uses proxy pattern
   */
  private async checkProxyPattern(
    tokenAddress: string
  ): Promise<RugPullIndicator | null> {
    try {
      const code = await blockchain.getHttpProvider().getCode(tokenAddress);

      // Check for common proxy patterns
      // EIP-1967 implementation slot
      if (code.includes('360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')) {
        return {
          type: 'proxy',
          description: 'Contract uses upgradeable proxy pattern',
          severity: 'high',
        };
      }

      // Check for delegatecall (common in proxies)
      // DELEGATECALL opcode is 0xf4
      const delegateCallCount = (code.match(/f4/gi) || []).length;
      if (delegateCallCount > 5) {
        return {
          type: 'proxy',
          description: 'Contract has multiple delegatecalls (possible proxy)',
          severity: 'medium',
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate overall risk level based on indicators
   */
  private calculateRiskLevel(
    indicators: RugPullIndicator[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (indicators.length === 0) return 'low';

    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const indicator of indicators) {
      severityCounts[indicator.severity]++;
    }

    if (severityCounts.critical > 0) return 'critical';
    if (severityCounts.high >= 2) return 'critical';
    if (severityCounts.high >= 1) return 'high';
    if (severityCounts.medium >= 2) return 'high';
    if (severityCounts.medium >= 1) return 'medium';
    return 'low';
  }

  /**
   * Quick risk check (returns true if high risk)
   */
  async quickCheck(tokenAddress: string): Promise<boolean> {
    try {
      const code = await blockchain.getHttpProvider().getCode(tokenAddress);
      const codeLower = code.toLowerCase();

      // Check for most dangerous indicators
      const hasMint = codeLower.includes(RUG_SELECTORS.mint);
      const hasBlacklist = codeLower.includes(RUG_SELECTORS.blacklist) ||
                          codeLower.includes('fe575a87'); // isBlacklisted
      const hasPause = codeLower.includes(RUG_SELECTORS.pause);

      return hasMint || hasBlacklist || hasPause;
    } catch {
      return true; // Assume risky if can't check
    }
  }
}

// Export singleton instance
export const rugPullDetector = new RugPullDetector();
