import chalk from 'chalk';
import Table from 'cli-table3';
import { CLI } from '../config/constants.js';
import { formatBNB, formatRelativeTime, shortenAddress } from '../utils/helpers.js';
import { Position, WalletInfo, DashboardData } from '../types/index.js';

/**
 * Clear terminal screen
 */
export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

/**
 * Display bot header
 */
export function displayHeader(): void {
  const header = `
${chalk.cyan('┌' + '─'.repeat(CLI.TABLE_WIDTH - 2) + '┐')}
${chalk.cyan('│')} ${chalk.bold.yellow(CLI.BOT_NAME)} ${chalk.gray('v' + CLI.VERSION)}${' '.repeat(CLI.TABLE_WIDTH - CLI.BOT_NAME.length - CLI.VERSION.length - 7)}${chalk.cyan('│')}
${chalk.cyan('└' + '─'.repeat(CLI.TABLE_WIDTH - 2) + '┘')}
`;
  console.log(header);
}

/**
 * Display wallet info
 */
export function displayWalletInfo(wallet: WalletInfo): void {
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold('  Wallet Information'));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(`  Address: ${chalk.yellow(wallet.address)}`);
  console.log(`  BNB Balance: ${chalk.green(formatBNB(wallet.balanceBNB))}`);

  if (wallet.balances.size > 0) {
    console.log('\n  Token Balances:');
    for (const [symbol, balance] of wallet.balances) {
      console.log(`    ${symbol}: ${chalk.white(formatBNB(balance))}`);
    }
  }
  console.log();
}

/**
 * Display positions table
 */
export function displayPositions(positions: Position[]): void {
  if (positions.length === 0) {
    console.log(chalk.gray('  No active positions\n'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Token'),
      chalk.cyan('Amount'),
      chalk.cyan('Entry'),
      chalk.cyan('Current'),
      chalk.cyan('PnL'),
      chalk.cyan('Age'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
    colWidths: [10, 12, 12, 12, 10, 10],
  });

  for (const pos of positions) {
    const pnlColor = pos.pnlPercent >= 0 ? chalk.green : chalk.red;
    const pnlStr = `${pos.pnlPercent >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(2)}%`;

    table.push([
      pos.token.symbol.slice(0, 8),
      formatBNB(pos.amountBNB),
      formatBNB(pos.entryPrice),
      formatBNB(pos.currentPrice),
      pnlColor(pnlStr),
      formatRelativeTime(pos.entryTime),
    ]);
  }

  console.log(table.toString());
}

/**
 * Display dashboard
 */
export function displayDashboard(data: DashboardData): void {
  clearScreen();
  displayHeader();

  // Status line
  const statusColor = data.botStatus === 'running' ? chalk.green : chalk.red;
  console.log(`  Status: ${statusColor(data.botStatus.toUpperCase())}`);
  console.log(`  Uptime: ${formatUptime(data.uptime)}`);
  console.log();

  // Wallet
  displayWalletInfo(data.wallet);

  // Positions
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold(`  Active Positions (${data.positions.length})`));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  displayPositions(data.positions);

  // Total PnL
  const pnlColor = data.totalPnL >= 0n ? chalk.green : chalk.red;
  console.log(`\n  Total PnL: ${pnlColor(formatBNB(data.totalPnL))}`);
  console.log();
}

/**
 * Display menu
 */
export function displayMenu(options: { name: string; value: string }[]): void {
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold('  Menu'));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));

  options.forEach((opt, index) => {
    console.log(`  ${chalk.yellow(`[${index}]`)} ${opt.name}`);
  });

  console.log();
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.log(chalk.red(`✗ ${message}`));
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Display token info
 */
export function displayTokenInfo(token: {
  address: string;
  name: string;
  symbol: string;
  reserveBNB?: bigint;
  price?: bigint;
  creator?: string;
}): void {
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold(`  ${token.symbol} - ${token.name}`));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(`  Address: ${chalk.yellow(token.address)}`);
  if (token.creator) {
    console.log(`  Creator: ${chalk.gray(shortenAddress(token.creator))}`);
  }
  if (token.reserveBNB) {
    console.log(`  Liquidity: ${chalk.green(formatBNB(token.reserveBNB))}`);
  }
  if (token.price) {
    console.log(`  Price: ${chalk.white(formatBNB(token.price))}`);
  }
  console.log();
}

/**
 * Display security analysis
 */
export function displaySecurityAnalysis(analysis: {
  isHoneypot: boolean;
  riskScore: number;
  recommendation: 'safe' | 'caution' | 'avoid';
  issues: { type: string; severity: string; description: string }[];
}): void {
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold('  Security Analysis'));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));

  // Honeypot status
  const honeypotStatus = analysis.isHoneypot
    ? chalk.red('YES - DO NOT BUY')
    : chalk.green('No');
  console.log(`  Honeypot: ${honeypotStatus}`);

  // Risk score
  const riskColor = analysis.riskScore < 30 ? chalk.green
    : analysis.riskScore < 60 ? chalk.yellow
    : chalk.red;
  console.log(`  Risk Score: ${riskColor(analysis.riskScore + '/100')}`);

  // Recommendation
  const recColor = analysis.recommendation === 'safe' ? chalk.green
    : analysis.recommendation === 'caution' ? chalk.yellow
    : chalk.red;
  console.log(`  Recommendation: ${recColor(analysis.recommendation.toUpperCase())}`);

  // Issues
  if (analysis.issues.length > 0) {
    console.log('\n  Issues:');
    for (const issue of analysis.issues) {
      const severityColor = issue.severity === 'critical' ? chalk.red
        : issue.severity === 'high' ? chalk.redBright
        : issue.severity === 'medium' ? chalk.yellow
        : chalk.gray;
      console.log(`    ${severityColor(`[${issue.severity.toUpperCase()}]`)} ${issue.description}`);
    }
  }
  console.log();
}

/**
 * Display trade result
 */
export function displayTradeResult(result: {
  success: boolean;
  type: 'buy' | 'sell';
  token: string;
  amountIn: bigint;
  amountOut: bigint;
  txHash?: string;
  error?: string;
}): void {
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));
  console.log(chalk.bold(`  ${result.type.toUpperCase()} Result`));
  console.log(chalk.cyan('─'.repeat(CLI.TABLE_WIDTH)));

  if (result.success) {
    displaySuccess(`${result.type === 'buy' ? 'Bought' : 'Sold'} ${result.token}`);
    console.log(`  Amount In: ${formatBNB(result.amountIn)}`);
    console.log(`  Amount Out: ${formatBNB(result.amountOut)}`);
    if (result.txHash) {
      console.log(`  TX: ${chalk.blue(result.txHash)}`);
    }
  } else {
    displayError(`${result.type} failed: ${result.error}`);
  }
  console.log();
}

/**
 * Display loading spinner
 */
export function displayLoading(message: string): void {
  process.stdout.write(`${chalk.cyan('⟳')} ${message}...`);
}

/**
 * Clear loading message
 */
export function clearLoading(): void {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

/**
 * Format uptime
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Display separator line
 */
export function displaySeparator(): void {
  console.log(chalk.gray('─'.repeat(CLI.TABLE_WIDTH)));
}

/**
 * Display new token alert
 */
export function displayNewTokenAlert(token: {
  symbol: string;
  name: string;
  address: string;
}): void {
  console.log(chalk.bgYellow.black(' NEW TOKEN '));
  console.log(`  ${chalk.bold(token.symbol)} - ${token.name}`);
  console.log(`  ${chalk.gray(token.address)}`);
  console.log();
}
