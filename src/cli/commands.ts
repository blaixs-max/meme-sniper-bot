import { ethers } from 'ethers';
import { walletManager } from '../core/wallet.js';
import { tradingEngine } from '../core/trading.js';
import { blockchain } from '../core/blockchain.js';
import { contractScanner } from '../security/contract-scanner.js';
import { positionManager } from '../risk/position-manager.js';
import { twitterMetrics } from '../twitter/metrics.js';
import { tokenMonitor } from '../services/token-monitor.js';
import { eventListener } from '../services/event-listener.js';
import { priceTracker } from '../services/price-tracker.js';
import { stopLossManager } from '../risk/stop-loss.js';
import { takeProfitManager } from '../risk/take-profit.js';
import { settings } from '../config/settings.js';
import { isValidAddress, parseUnits } from '../utils/helpers.js';
import * as display from './display.js';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Check wallet balance
 */
export async function checkBalance(): Promise<CommandResult> {
  try {
    const info = await walletManager.getWalletInfo();
    display.displayWalletInfo(info);

    return {
      success: true,
      message: 'Balance retrieved',
      data: info,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get balance: ${(error as Error).message}`,
    };
  }
}

/**
 * Buy a token
 */
export async function buyToken(
  tokenAddress: string,
  amountBNB: string,
  slippage?: number
): Promise<CommandResult> {
  if (!isValidAddress(tokenAddress)) {
    return { success: false, message: 'Invalid token address' };
  }

  const amount = parseUnits(amountBNB);

  // Check if we can open position
  const canOpen = positionManager.canOpenPosition(amount);
  if (!canOpen.allowed) {
    return { success: false, message: canOpen.reason! };
  }

  display.displayLoading('Checking security');

  // Security check
  if (settings.honeypotCheckEnabled || settings.rugCheckEnabled) {
    const securityResult = await contractScanner.quickCheck(tokenAddress);
    if (!securityResult.safe) {
      display.clearLoading();
      return {
        success: false,
        message: `Security check failed: ${securityResult.reason}`,
      };
    }
  }

  display.clearLoading();
  display.displayLoading('Executing buy');

  const result = await tradingEngine.buyToken(
    tokenAddress,
    amount,
    slippage || settings.defaultSlippage
  );

  display.clearLoading();

  if (result.success) {
    // Get token info
    const tokenInfo = await tradingEngine.getTokenInfo(tokenAddress);

    if (tokenInfo) {
      // Open position
      positionManager.openPosition(
        tokenInfo,
        amount,
        result.amountOut,
        tokenInfo.price || 0n,
        result.txHash
      );
    }

    display.displayTradeResult({
      success: true,
      type: 'buy',
      token: tokenInfo?.symbol || tokenAddress,
      amountIn: amount,
      amountOut: result.amountOut,
      txHash: result.txHash,
    });

    return {
      success: true,
      message: 'Buy successful',
      data: result,
    };
  }

  display.displayTradeResult({
    success: false,
    type: 'buy',
    token: tokenAddress,
    amountIn: amount,
    amountOut: 0n,
    error: result.error,
  });

  return {
    success: false,
    message: result.error || 'Buy failed',
  };
}

/**
 * Sell a token
 */
export async function sellToken(
  tokenAddress: string,
  percentToSell: number = 100,
  slippage?: number
): Promise<CommandResult> {
  if (!isValidAddress(tokenAddress)) {
    return { success: false, message: 'Invalid token address' };
  }

  display.displayLoading('Executing sell');

  // Get token balance
  const balance = await walletManager.getTokenBalance(tokenAddress);

  if (balance === 0n) {
    display.clearLoading();
    return { success: false, message: 'No tokens to sell' };
  }

  const amountToSell = (balance * BigInt(percentToSell)) / 100n;

  const result = await tradingEngine.sellToken(
    tokenAddress,
    amountToSell,
    slippage || settings.defaultSlippage
  );

  display.clearLoading();

  if (result.success) {
    // Update position
    const position = positionManager.getPositionByToken(tokenAddress);
    if (position) {
      if (percentToSell >= 100) {
        positionManager.closePosition(position.id, result);
      } else {
        positionManager.reducePosition(position.id, amountToSell, result.amountOut);
      }
    }

    const tokenInfo = await tradingEngine.getTokenInfo(tokenAddress);

    display.displayTradeResult({
      success: true,
      type: 'sell',
      token: tokenInfo?.symbol || tokenAddress,
      amountIn: amountToSell,
      amountOut: result.amountOut,
      txHash: result.txHash,
    });

    return {
      success: true,
      message: 'Sell successful',
      data: result,
    };
  }

  display.displayTradeResult({
    success: false,
    type: 'sell',
    token: tokenAddress,
    amountIn: amountToSell,
    amountOut: 0n,
    error: result.error,
  });

  return {
    success: false,
    message: result.error || 'Sell failed',
  };
}

/**
 * Analyze a token
 */
export async function analyzeToken(tokenAddress: string): Promise<CommandResult> {
  if (!isValidAddress(tokenAddress)) {
    return { success: false, message: 'Invalid token address' };
  }

  display.displayLoading('Analyzing token');

  try {
    // Get token info
    const tokenInfo = await tradingEngine.getTokenInfo(tokenAddress);

    display.clearLoading();

    if (!tokenInfo) {
      return { success: false, message: 'Could not fetch token info' };
    }

    display.displayTokenInfo({
      address: tokenInfo.address,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      reserveBNB: tokenInfo.reserveBNB,
      price: tokenInfo.price,
      creator: tokenInfo.creator,
    });

    // Security analysis
    display.displayLoading('Running security scan');
    const security = await contractScanner.analyze(tokenAddress);
    display.clearLoading();

    display.displaySecurityAnalysis(security);

    // Twitter analysis if available
    if (twitterMetrics.isAvailable()) {
      display.displayLoading('Analyzing Twitter');
      const twitter = await twitterMetrics.analyzeToken(tokenInfo.symbol, tokenInfo.name);
      display.clearLoading();

      console.log('\n  Twitter Analysis:');
      console.log(`    Score: ${twitter.score}/100`);
      console.log(`    Tweets: ${twitter.tweetCount}`);
      console.log(`    Sentiment: ${twitter.sentiment.overall}`);
    }

    return {
      success: true,
      message: 'Analysis complete',
      data: { tokenInfo, security },
    };
  } catch (error) {
    display.clearLoading();
    return {
      success: false,
      message: `Analysis failed: ${(error as Error).message}`,
    };
  }
}

/**
 * View positions
 */
export async function viewPositions(): Promise<CommandResult> {
  const positions = positionManager.getAllPositions();

  // Update all positions
  for (const pos of positions) {
    await positionManager.updatePosition(pos.id);
  }

  display.displayPositions(positionManager.getAllPositions());

  const summary = positionManager.getPositionSummary();
  console.log(`\n  Total Invested: ${summary.totalInvested}`);
  console.log(`  Total PnL: ${summary.totalPnL}`);
  console.log(`  Remaining Budget: ${summary.remainingBudget}`);

  return {
    success: true,
    message: `${positions.length} positions`,
    data: positions,
  };
}

/**
 * Start the bot
 */
export async function startBot(): Promise<CommandResult> {
  try {
    display.displayInfo('Starting bot...');

    // Start services
    await eventListener.start();
    await tokenMonitor.start();
    await priceTracker.start();

    // Start risk managers
    stopLossManager.start();
    takeProfitManager.start();

    display.displaySuccess('Bot started');

    return { success: true, message: 'Bot started' };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start: ${(error as Error).message}`,
    };
  }
}

/**
 * Stop the bot
 */
export async function stopBot(): Promise<CommandResult> {
  try {
    display.displayInfo('Stopping bot...');

    eventListener.stop();
    tokenMonitor.stop();
    priceTracker.stop();
    stopLossManager.stop();
    takeProfitManager.stop();

    display.displaySuccess('Bot stopped');

    return { success: true, message: 'Bot stopped' };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stop: ${(error as Error).message}`,
    };
  }
}

/**
 * Get bot status
 */
export function getBotStatus(): {
  running: boolean;
  services: Record<string, boolean>;
} {
  return {
    running: eventListener.isRunning(),
    services: {
      eventListener: eventListener.isRunning(),
      tokenMonitor: tokenMonitor.isRunning(),
      priceTracker: priceTracker.isRunning(),
      stopLoss: stopLossManager.isActive(),
      takeProfit: takeProfitManager.isActive(),
    },
  };
}

/**
 * Get network info
 */
export async function getNetworkInfo(): Promise<CommandResult> {
  try {
    const blockNumber = await blockchain.getBlockNumber();
    const gasPrice = await blockchain.getGasPrice();

    console.log('\n  Network Information:');
    console.log(`    Chain: BNB Smart Chain (56)`);
    console.log(`    Block: ${blockNumber}`);
    console.log(`    Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    console.log(`    Connected: ${blockchain.isBlockchainConnected() ? 'Yes' : 'No'}`);

    return { success: true, message: 'Network info retrieved' };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get network info: ${(error as Error).message}`,
    };
  }
}
