import { config } from 'dotenv';
import chalk from 'chalk';

// Load environment variables
config();

import { blockchain } from './core/blockchain.js';
import { walletManager } from './core/wallet.js';
import { tradingEngine } from './core/trading.js';
import { eventListener } from './services/event-listener.js';
import { tokenMonitor } from './services/token-monitor.js';
import { priceTracker } from './services/price-tracker.js';
import { positionManager } from './risk/position-manager.js';
import { stopLossManager } from './risk/stop-loss.js';
import { takeProfitManager } from './risk/take-profit.js';
import { contractScanner } from './security/contract-scanner.js';
import { sniperStrategy } from './strategies/sniper.js';
import { twitterMetrics } from './twitter/metrics.js';
import { startMenu } from './cli/menu.js';
import * as display from './cli/display.js';
import { logger } from './utils/logger.js';
import { settings, walletConfig } from './config/settings.js';
import { CLI } from './config/constants.js';

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  console.error(chalk.red('\nFatal error:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  console.error(chalk.red('\nUnhandled promise rejection:'), reason);
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log(chalk.yellow('\n\nShutting down...'));

  try {
    // Stop services
    eventListener.stop();
    tokenMonitor.stop();
    priceTracker.stop();
    stopLossManager.stop();
    takeProfitManager.stop();

    // Disconnect from blockchain
    await blockchain.disconnect();

    console.log(chalk.green('Shutdown complete'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('Error during shutdown:'), (error as Error).message);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Initialize the bot
 */
async function initialize(): Promise<boolean> {
  console.log(chalk.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.yellow(`  ${CLI.BOT_NAME} v${CLI.VERSION}`));
  console.log(chalk.cyan('='.repeat(60) + '\n'));

  // Check wallet configuration
  if (!walletConfig.isConfigured()) {
    console.log(chalk.red('✗ Wallet not configured'));
    console.log(chalk.gray('  Please set PRIVATE_KEY or PRIVATE_KEY_ENCRYPTED in .env'));
    console.log(chalk.gray('  See .env.example for reference\n'));
    return false;
  }

  try {
    // Connect to blockchain
    console.log(chalk.blue('→ Connecting to BNB Chain Mainnet...'));
    const blockNumber = await blockchain.getBlockNumber();
    console.log(chalk.green(`✓ Connected to BNB Chain (Block: ${blockNumber})`));

    // Initialize wallet
    console.log(chalk.blue('→ Loading wallet...'));
    await walletManager.initialize();
    const address = walletManager.getAddress();
    const balance = await walletManager.getBnbBalance();
    console.log(chalk.green(`✓ Wallet loaded: ${address.slice(0, 6)}...${address.slice(-4)}`));
    console.log(chalk.green(`  Balance: ${(Number(balance) / 1e18).toFixed(4)} BNB`));

    // Check balance
    if (balance < settings.maxBuyAmount) {
      console.log(chalk.yellow(`⚠ Low balance - less than max buy amount (${Number(settings.maxBuyAmount) / 1e18} BNB)`));
    }

    // Initialize trading engine
    console.log(chalk.blue('→ Initializing trading engine...'));
    await tradingEngine.initialize();
    console.log(chalk.green('✓ Trading engine ready'));

    // Initialize event listener
    console.log(chalk.blue('→ Initializing event listener...'));
    await eventListener.initialize();
    console.log(chalk.green('✓ Event listener ready'));

    // Check Twitter availability
    if (settings.twitterAnalysisEnabled) {
      if (twitterMetrics.isAvailable()) {
        console.log(chalk.green('✓ Twitter analysis enabled'));
      } else {
        console.log(chalk.yellow('⚠ Twitter API not configured - analysis disabled'));
      }
    }

    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.green.bold('  Initialization Complete'));
    console.log(chalk.cyan('='.repeat(60) + '\n'));

    return true;
  } catch (error) {
    console.log(chalk.red(`\n✗ Initialization failed: ${(error as Error).message}`));
    logger.error('Initialization failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Run in auto mode (non-interactive)
 */
async function runAutoMode(): Promise<void> {
  console.log(chalk.yellow('\nStarting in AUTO mode...\n'));

  // Set up new token handler
  tokenMonitor.on('newToken', async (token) => {
    display.displayNewTokenAlert({
      symbol: token.symbol,
      name: token.name,
      address: token.address,
    });

    // Security check
    if (settings.honeypotCheckEnabled || settings.rugCheckEnabled) {
      const security = await contractScanner.quickCheck(token.address);
      if (!security.safe) {
        console.log(chalk.red(`  Security check failed: ${security.reason}`));
        return;
      }
    }

    // Get Twitter analysis if enabled
    let twitter = undefined;
    if (settings.twitterAnalysisEnabled && twitterMetrics.isAvailable()) {
      twitter = await twitterMetrics.analyzeToken(token.symbol, token.name);
    }

    // Ask strategy if we should buy
    const security = await contractScanner.analyze(token.address);
    const decision = await sniperStrategy.shouldBuy(token, security, twitter);

    if (decision.shouldBuy) {
      console.log(chalk.green(`  → Buying: ${decision.reason}`));

      const result = await tradingEngine.buyWithRetry(
        token.address,
        decision.amount,
        settings.defaultSlippage
      );

      if (result.success) {
        console.log(chalk.green(`  ✓ Bought! TX: ${result.txHash}`));

        // Open position
        positionManager.openPosition(
          token,
          decision.amount,
          result.amountOut,
          token.price || 0n,
          result.txHash
        );
      } else {
        console.log(chalk.red(`  ✗ Buy failed: ${result.error}`));
      }
    } else {
      console.log(chalk.gray(`  → Skipped: ${decision.reason}`));
    }
  });

  // Start services
  await eventListener.start();
  await tokenMonitor.start();
  await priceTracker.start();
  stopLossManager.start();
  takeProfitManager.start();

  console.log(chalk.green('Bot is running. Press Ctrl+C to stop.\n'));

  // Keep running
  await new Promise(() => {}); // Never resolves
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto') || args.includes('-a');
  const helpMode = args.includes('--help') || args.includes('-h');

  if (helpMode) {
    console.log(`
${chalk.bold('Four.meme Sniper Bot')}

Usage: npm run dev [options]

Options:
  --auto, -a    Run in automatic mode (non-interactive)
  --help, -h    Show this help message

Interactive mode (default):
  The bot will start with an interactive CLI menu where you can:
  - Start/stop the bot
  - View and manage positions
  - Execute manual trades
  - Analyze tokens
  - Configure settings

Auto mode (--auto):
  The bot will automatically:
  - Monitor for new tokens
  - Run security checks
  - Execute trades based on configured strategies
  - Manage risk with stop-loss and take-profit

Configuration:
  Copy .env.example to .env and configure your settings.
  See README.md for detailed configuration options.
`);
    process.exit(0);
  }

  // Initialize
  const initialized = await initialize();
  if (!initialized) {
    process.exit(1);
  }

  // Run in selected mode
  if (autoMode) {
    await runAutoMode();
  } else {
    await startMenu();
  }
}

// Run
main().catch((error) => {
  logger.error('Fatal error', { error: error.message });
  console.error(chalk.red('\nFatal error:'), error.message);
  process.exit(1);
});
