import { config } from 'dotenv';
import { AppSettings, RiskConfig, TakeProfitLevel } from '../types/index.js';
import { BNB_CHAIN, RISK_DEFAULTS, TRADING } from './constants.js';

// Load environment variables
config();

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseBigInt(value: string | undefined, defaultValue: bigint): bigint {
  if (!value) return defaultValue;
  try {
    // Convert from human readable (e.g., "0.1") to wei
    const parts = value.split('.');
    if (parts.length === 1) {
      return BigInt(parts[0]) * 10n ** 18n;
    }
    const decimals = parts[1].length;
    const whole = BigInt(parts[0]) * 10n ** 18n;
    const fraction = BigInt(parts[1]) * 10n ** BigInt(18 - decimals);
    return whole + fraction;
  } catch {
    return defaultValue;
  }
}

function parseTakeProfitLevels(value: string | undefined): TakeProfitLevel[] {
  if (!value) return [...RISK_DEFAULTS.TAKE_PROFIT_LEVELS];

  try {
    const levels = value.split(',').map(v => parseInt(v.trim(), 10));
    return levels.map((percent, index) => ({
      percent,
      sellPercent: index === levels.length - 1 ? 100 : 25 + (index * 25),
      triggered: false,
    }));
  } catch {
    return [...RISK_DEFAULTS.TAKE_PROFIT_LEVELS];
  }
}

function buildRiskConfig(): RiskConfig {
  return {
    stopLossPercent: parseInt(process.env.STOP_LOSS_PERCENT || String(RISK_DEFAULTS.STOP_LOSS_PERCENT), 10),
    takeProfitLevels: parseTakeProfitLevels(process.env.TAKE_PROFIT_LEVELS),
    maxPositionSizeBNB: parseBigInt(process.env.MAX_BUY_AMOUNT, RISK_DEFAULTS.MAX_POSITION_SIZE_BNB),
    maxConcurrentPositions: parseInt(process.env.MAX_POSITIONS || String(RISK_DEFAULTS.MAX_CONCURRENT_POSITIONS), 10),
    dailyLimitBNB: parseBigInt(process.env.DAILY_LIMIT_BNB, RISK_DEFAULTS.DAILY_LIMIT_BNB),
    trailingStopEnabled: parseBoolean(process.env.TRAILING_STOP_ENABLED, false),
    trailingStopPercent: parseInt(process.env.TRAILING_STOP_PERCENT || String(RISK_DEFAULTS.TRAILING_STOP_PERCENT), 10),
  };
}

export function loadSettings(): AppSettings {
  return {
    // Network
    rpcUrls: process.env.RPC_URL
      ? [process.env.RPC_URL, ...BNB_CHAIN.RPC_URLS.filter(url => url !== process.env.RPC_URL)]
      : [...BNB_CHAIN.RPC_URLS],
    wssUrl: process.env.WSS_URL || BNB_CHAIN.WSS_URL,

    // Trading
    maxBuyAmount: parseBigInt(process.env.MAX_BUY_AMOUNT, 10n ** 17n), // 0.1 BNB default
    defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE || String(TRADING.DEFAULT_SLIPPAGE)),
    gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER || String(TRADING.GAS_BUFFER)),

    // Risk Management
    risk: buildRiskConfig(),

    // Security
    honeypotCheckEnabled: parseBoolean(process.env.HONEYPOT_CHECK_ENABLED, true),
    rugCheckEnabled: parseBoolean(process.env.RUG_CHECK_ENABLED, true),
    minLiquidityBNB: parseBigInt(process.env.MIN_LIQUIDITY_BNB, 10n ** 18n), // 1 BNB default

    // Twitter
    twitterAnalysisEnabled: parseBoolean(process.env.TWITTER_ANALYSIS_ENABLED, false),
    minTwitterScore: parseInt(process.env.MIN_TWITTER_SCORE || '30', 10),

    // Logging
    logLevel: (process.env.LOG_LEVEL as AppSettings['logLevel']) || 'info',
    logToFile: parseBoolean(process.env.LOG_TO_FILE, true),
  };
}

// Export singleton settings instance
export const settings = loadSettings();

// Twitter configuration
export const twitterConfig = {
  bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  apiKey: process.env.TWITTER_API_KEY || '',
  apiSecret: process.env.TWITTER_API_SECRET || '',
  isConfigured(): boolean {
    return !!this.bearerToken || (!!this.apiKey && !!this.apiSecret);
  },
};

// Wallet configuration (encrypted key handling)
export const walletConfig = {
  encryptedPrivateKey: process.env.PRIVATE_KEY_ENCRYPTED || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  // For development/testing - NOT RECOMMENDED FOR PRODUCTION
  privateKey: process.env.PRIVATE_KEY || '',

  hasEncryptedKey(): boolean {
    return !!this.encryptedPrivateKey && !!this.encryptionKey;
  },

  hasPlainKey(): boolean {
    return !!this.privateKey;
  },

  isConfigured(): boolean {
    return this.hasEncryptedKey() || this.hasPlainKey();
  },
};
