import inquirer from 'inquirer';
import chalk from 'chalk';
import * as commands from './commands.js';
import * as display from './display.js';
import { walletManager } from '../core/wallet.js';
import { isValidAddress } from '../utils/helpers.js';

export interface MenuState {
  running: boolean;
  currentScreen: 'main' | 'positions' | 'settings' | 'trade';
}

const state: MenuState = {
  running: false,
  currentScreen: 'main',
};

const MAIN_MENU_OPTIONS = [
  { name: 'Start/Stop Bot', value: 'toggle_bot' },
  { name: 'View Positions', value: 'positions' },
  { name: 'Manual Buy', value: 'buy' },
  { name: 'Manual Sell', value: 'sell' },
  { name: 'Analyze Token', value: 'analyze' },
  { name: 'Check Balance', value: 'balance' },
  { name: 'Network Info', value: 'network' },
  { name: 'Settings', value: 'settings' },
  { name: 'Exit', value: 'exit' },
];

/**
 * Start the interactive menu
 */
export async function startMenu(): Promise<void> {
  state.running = true;

  display.displayHeader();

  // Show wallet info
  try {
    const walletInfo = await walletManager.getWalletInfo();
    display.displayWalletInfo(walletInfo);
  } catch (error) {
    display.displayWarning('Could not load wallet info');
  }

  while (state.running) {
    await showMainMenu();
  }
}

/**
 * Show main menu
 */
async function showMainMenu(): Promise<void> {
  const botStatus = commands.getBotStatus();
  const statusText = botStatus.running
    ? chalk.green('● Running')
    : chalk.red('○ Stopped');

  console.log(`\n  Bot Status: ${statusText}\n`);

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select an action:',
      choices: MAIN_MENU_OPTIONS.map((opt, index) => ({
        name: `[${index}] ${opt.name}`,
        value: opt.value,
        short: opt.name,
      })),
    },
  ]);

  await handleMenuAction(action);
}

/**
 * Handle menu action
 */
async function handleMenuAction(action: string): Promise<void> {
  switch (action) {
    case 'toggle_bot':
      await toggleBot();
      break;

    case 'positions':
      await commands.viewPositions();
      break;

    case 'buy':
      await handleManualBuy();
      break;

    case 'sell':
      await handleManualSell();
      break;

    case 'analyze':
      await handleAnalyze();
      break;

    case 'balance':
      await commands.checkBalance();
      break;

    case 'network':
      await commands.getNetworkInfo();
      break;

    case 'settings':
      await showSettingsMenu();
      break;

    case 'exit':
      await handleExit();
      break;

    default:
      display.displayError('Unknown action');
  }
}

/**
 * Toggle bot running state
 */
async function toggleBot(): Promise<void> {
  const status = commands.getBotStatus();

  if (status.running) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Stop the bot?',
        default: false,
      },
    ]);

    if (confirm) {
      await commands.stopBot();
    }
  } else {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Start the bot?',
        default: true,
      },
    ]);

    if (confirm) {
      await commands.startBot();
    }
  }
}

/**
 * Handle manual buy
 */
async function handleManualBuy(): Promise<void> {
  const { tokenAddress } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenAddress',
      message: 'Token address:',
      validate: (input) => {
        if (!input) return 'Token address is required';
        if (!isValidAddress(input)) return 'Invalid address format';
        return true;
      },
    },
  ]);

  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: 'Amount in BNB:',
      default: '0.1',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) return 'Invalid amount';
        return true;
      },
    },
  ]);

  const { slippage } = await inquirer.prompt([
    {
      type: 'input',
      name: 'slippage',
      message: 'Slippage (%):',
      default: '5',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num < 0.1 || num > 49) return 'Slippage must be between 0.1 and 49';
        return true;
      },
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Buy ${amount} BNB worth of tokens with ${slippage}% slippage?`,
      default: true,
    },
  ]);

  if (confirm) {
    await commands.buyToken(tokenAddress, amount, parseFloat(slippage));
  }
}

/**
 * Handle manual sell
 */
async function handleManualSell(): Promise<void> {
  const { tokenAddress } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenAddress',
      message: 'Token address:',
      validate: (input) => {
        if (!input) return 'Token address is required';
        if (!isValidAddress(input)) return 'Invalid address format';
        return true;
      },
    },
  ]);

  const { percent } = await inquirer.prompt([
    {
      type: 'list',
      name: 'percent',
      message: 'How much to sell?',
      choices: [
        { name: '25%', value: 25 },
        { name: '50%', value: 50 },
        { name: '75%', value: 75 },
        { name: '100% (All)', value: 100 },
        { name: 'Custom amount', value: -1 },
      ],
    },
  ]);

  let sellPercent = percent;

  if (percent === -1) {
    const { customPercent } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customPercent',
        message: 'Percentage to sell (1-100):',
        validate: (input) => {
          const num = parseInt(input, 10);
          if (isNaN(num) || num < 1 || num > 100) return 'Must be between 1 and 100';
          return true;
        },
      },
    ]);
    sellPercent = parseInt(customPercent, 10);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Sell ${sellPercent}% of tokens?`,
      default: true,
    },
  ]);

  if (confirm) {
    await commands.sellToken(tokenAddress, sellPercent);
  }
}

/**
 * Handle analyze token
 */
async function handleAnalyze(): Promise<void> {
  const { tokenAddress } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenAddress',
      message: 'Token address to analyze:',
      validate: (input) => {
        if (!input) return 'Token address is required';
        if (!isValidAddress(input)) return 'Invalid address format';
        return true;
      },
    },
  ]);

  await commands.analyzeToken(tokenAddress);
}

/**
 * Show settings menu
 */
async function showSettingsMenu(): Promise<void> {
  const { setting } = await inquirer.prompt([
    {
      type: 'list',
      name: 'setting',
      message: 'Settings:',
      choices: [
        { name: 'Trading Settings', value: 'trading' },
        { name: 'Risk Management', value: 'risk' },
        { name: 'Security Settings', value: 'security' },
        { name: 'Back to Main Menu', value: 'back' },
      ],
    },
  ]);

  if (setting === 'back') return;

  display.displayInfo(`${setting} settings would be shown here`);
  // TODO: Implement settings editing
}

/**
 * Handle exit
 */
async function handleExit(): Promise<void> {
  const status = commands.getBotStatus();

  if (status.running) {
    const { stopFirst } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'stopFirst',
        message: 'Bot is running. Stop it before exiting?',
        default: true,
      },
    ]);

    if (stopFirst) {
      await commands.stopBot();
    }
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to exit?',
      default: true,
    },
  ]);

  if (confirm) {
    state.running = false;
    display.displayInfo('Goodbye!');
    process.exit(0);
  }
}

/**
 * Stop the menu
 */
export function stopMenu(): void {
  state.running = false;
}

/**
 * Get menu state
 */
export function getMenuState(): MenuState {
  return { ...state };
}
