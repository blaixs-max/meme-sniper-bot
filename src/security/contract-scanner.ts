import { ethers } from 'ethers';
import { blockchain } from '../core/blockchain.js';
import { honeypotChecker } from './honeypot-check.js';
import { rugPullDetector } from './rug-detector.js';
import { securityLogger as logger } from '../utils/logger.js';
import { SecurityAnalysis, SecurityIssue } from '../types/index.js';

// Known safe contract code hashes (verified contracts)
const SAFE_CODE_HASHES = new Set<string>([
  // Add known safe contract hashes here
]);

export class ContractScanner {
  /**
   * Perform comprehensive security analysis
   */
  async analyze(tokenAddress: string): Promise<SecurityAnalysis> {
    logger.info('Starting comprehensive security scan', { token: tokenAddress });

    const issues: SecurityIssue[] = [];
    let isHoneypot = false;
    let hasRugPullRisk = false;

    try {
      // Run honeypot check
      const honeypotResult = await honeypotChecker.check(tokenAddress);
      isHoneypot = honeypotResult.isHoneypot;

      if (isHoneypot) {
        issues.push({
          type: 'honeypot',
          severity: 'critical',
          description: honeypotResult.error ||
            `High taxes detected - Buy: ${honeypotResult.buyTax}%, Sell: ${honeypotResult.sellTax}%`,
        });
      } else if (honeypotResult.sellTax > 5 || honeypotResult.buyTax > 5) {
        issues.push({
          type: 'honeypot',
          severity: 'medium',
          description: `Elevated taxes - Buy: ${honeypotResult.buyTax}%, Sell: ${honeypotResult.sellTax}%`,
        });
      }

      // Run rug pull analysis
      const rugAnalysis = await rugPullDetector.analyze(tokenAddress);
      hasRugPullRisk = rugAnalysis.hasRisk;

      for (const indicator of rugAnalysis.indicators) {
        issues.push({
          type: indicator.type as SecurityIssue['type'],
          severity: indicator.severity,
          description: indicator.description,
        });
      }

      // Run bytecode analysis
      const bytecodeIssues = await this.analyzeBytecode(tokenAddress);
      issues.push(...bytecodeIssues);

      // Check contract verification status
      const verificationIssue = await this.checkVerificationStatus(tokenAddress);
      if (verificationIssue) {
        issues.push(verificationIssue);
      }

      // Calculate risk score (0-100)
      const riskScore = this.calculateRiskScore(issues);

      // Determine recommendation
      const recommendation = this.getRecommendation(riskScore, isHoneypot, hasRugPullRisk);

      const result: SecurityAnalysis = {
        isHoneypot,
        hasRugPullRisk,
        riskScore,
        issues,
        recommendation,
      };

      logger.info('Security scan complete', {
        token: tokenAddress,
        riskScore,
        recommendation,
        issueCount: issues.length,
      });

      return result;
    } catch (error) {
      logger.error('Security scan error', {
        token: tokenAddress,
        error: (error as Error).message,
      });

      return {
        isHoneypot: true,
        hasRugPullRisk: true,
        riskScore: 100,
        issues: [{
          type: 'other',
          severity: 'critical',
          description: `Scan failed: ${(error as Error).message}`,
        }],
        recommendation: 'avoid',
      };
    }
  }

  /**
   * Analyze contract bytecode for suspicious patterns
   */
  private async analyzeBytecode(tokenAddress: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    try {
      const code = await blockchain.getHttpProvider().getCode(tokenAddress);

      if (code === '0x' || code.length < 100) {
        issues.push({
          type: 'other',
          severity: 'critical',
          description: 'Contract has no code or very minimal code',
        });
        return issues;
      }

      const codeLower = code.toLowerCase();

      // Check for self-destruct
      if (codeLower.includes('ff')) {
        // SELFDESTRUCT can be legitimate, check context
        const selfDestructCount = (codeLower.match(/ff/g) || []).length;
        if (selfDestructCount > 0) {
          issues.push({
            type: 'other',
            severity: 'medium',
            description: 'Contract contains SELFDESTRUCT opcode',
          });
        }
      }

      // Check code hash against known safe contracts
      const codeHash = ethers.keccak256(code);
      if (SAFE_CODE_HASHES.has(codeHash)) {
        // Known safe contract - no issues to add
        logger.debug('Contract matches known safe hash', { hash: codeHash });
      }

      // Check for very small contract (might be proxy or scam)
      if (code.length < 500) {
        issues.push({
          type: 'proxy',
          severity: 'medium',
          description: 'Very small contract bytecode (possible proxy or minimal implementation)',
        });
      }

      // Check for hidden functions (non-standard selectors at the end)
      // This is a simplified check
      const hasHiddenFunctions = code.length > 10000 &&
        codeLower.slice(-100).includes('363d3d373d3d3d363d73');

      if (hasHiddenFunctions) {
        issues.push({
          type: 'other',
          severity: 'high',
          description: 'Possible hidden functionality detected',
        });
      }

    } catch (error) {
      issues.push({
        type: 'other',
        severity: 'high',
        description: `Could not analyze bytecode: ${(error as Error).message}`,
      });
    }

    return issues;
  }

  /**
   * Check if contract is verified on BSCScan
   */
  private async checkVerificationStatus(
    _tokenAddress: string
  ): Promise<SecurityIssue | null> {
    // Note: This would require BSCScan API key to properly implement
    // For now, we skip this check
    return null;
  }

  /**
   * Calculate risk score from issues
   */
  private calculateRiskScore(issues: SecurityIssue[]): number {
    if (issues.length === 0) return 0;

    let score = 0;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score += 40;
          break;
        case 'high':
          score += 25;
          break;
        case 'medium':
          score += 10;
          break;
        case 'low':
          score += 5;
          break;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Get recommendation based on analysis
   */
  private getRecommendation(
    riskScore: number,
    isHoneypot: boolean,
    hasRugPullRisk: boolean
  ): 'safe' | 'caution' | 'avoid' {
    if (isHoneypot || riskScore >= 70) {
      return 'avoid';
    }

    if (hasRugPullRisk || riskScore >= 30) {
      return 'caution';
    }

    return 'safe';
  }

  /**
   * Quick security check (returns true if safe to trade)
   */
  async quickCheck(tokenAddress: string): Promise<{
    safe: boolean;
    reason?: string;
  }> {
    try {
      // Quick honeypot check
      const isHoneypot = await honeypotChecker.quickCheck(tokenAddress);
      if (isHoneypot) {
        return { safe: false, reason: 'Potential honeypot detected' };
      }

      // Quick rug pull check
      const isRisky = await rugPullDetector.quickCheck(tokenAddress);
      if (isRisky) {
        return { safe: false, reason: 'High rug pull risk detected' };
      }

      return { safe: true };
    } catch (error) {
      return { safe: false, reason: `Check failed: ${(error as Error).message}` };
    }
  }
}

// Export singleton instance
export const contractScanner = new ContractScanner();
