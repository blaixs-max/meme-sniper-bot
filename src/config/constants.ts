// Four.meme Contract Addresses
export const FOUR_MEME = {
  TOKEN_MANAGER: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  FOUR_TOKEN: '0x9eb5d5731dff7c3c53cf6ba3c05fc1247c790ef9',
} as const;

// Event Signatures
export const EVENTS = {
  TOKEN_PURCHASE: '0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942',
  TOKEN_SALE: '0x', // To be discovered
  TOKEN_CREATED: '0x', // To be discovered
  TOKEN_MIGRATED: '0x', // To be discovered
} as const;

// BNB Chain Configuration
export const BNB_CHAIN = {
  CHAIN_ID: 56,
  NAME: 'BNB Smart Chain',
  SYMBOL: 'BNB',
  DECIMALS: 18,
  RPC_URLS: [
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org',
    'https://bsc-dataseed4.binance.org',
  ],
  WSS_URL: 'wss://bsc-ws-node.nariox.org:443',
  EXPLORER_URL: 'https://bscscan.com',
  BLOCK_TIME: 3000, // 3 seconds
} as const;

// Common Token Addresses
export const TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
} as const;

// Trading Constants
export const TRADING = {
  DEFAULT_SLIPPAGE: 5, // 5%
  MAX_SLIPPAGE: 49, // 49%
  MIN_SLIPPAGE: 0.1, // 0.1%
  TRADING_FEE: 1, // 1%
  DEFAULT_GAS_LIMIT: 300000n,
  GAS_BUFFER: 1.2, // 20% buffer
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  TX_TIMEOUT: 60000, // 60 seconds
} as const;

// Token Constants
export const TOKEN_CONSTANTS = {
  STANDARD_SUPPLY: 1_000_000_000n * 10n ** 18n, // 1 billion with 18 decimals
  BONDING_CURVE_TARGET: 24n * 10n ** 18n, // ~24 BNB graduation
  DECIMALS: 18,
} as const;

// Security Thresholds
export const SECURITY = {
  MAX_BUY_TAX: 10, // 10%
  MAX_SELL_TAX: 10, // 10%
  MIN_LIQUIDITY_BNB: 1n * 10n ** 18n, // 1 BNB
  SUSPICIOUS_OWNER_FUNCTIONS: [
    'setFee',
    'setTax',
    'blacklist',
    'addBlacklist',
    'removeBlacklist',
    'pause',
    'unpause',
    'mint',
    'setMaxTx',
    'setMaxWallet',
    'excludeFromFee',
  ],
} as const;

// Twitter API Configuration
export const TWITTER = {
  API_BASE_URL: 'https://api.twitter.com/2',
  RATE_LIMIT_FREE: 1500, // tweets per month
  RATE_LIMIT_BASIC: 10000, // tweets per month
  CACHE_TTL: 300, // 5 minutes
  SEARCH_WINDOW_DAYS: 7, // Recent search limit
} as const;

// Sentiment Keywords
export const SENTIMENT_KEYWORDS = {
  POSITIVE: [
    'moon', 'gem', 'bullish', 'pump', 'buy', 'hold', 'hodl',
    'rocket', 'launch', 'fire', 'amazing', 'great', 'legit',
    '100x', '1000x', 'early', 'alpha', 'based', 'lfg',
  ],
  NEGATIVE: [
    'rug', 'scam', 'honeypot', 'fake', 'avoid', 'dump',
    'sell', 'bearish', 'dead', 'shit', 'trash', 'warning',
    'rugpull', 'ponzi', 'fraud', 'exit',
  ],
} as const;

// Logging Configuration
export const LOGGING = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_FILES: 5,
  LOG_DIR: './logs',
} as const;

// CLI Display
export const CLI = {
  BOT_NAME: 'FOUR.MEME SNIPER BOT',
  VERSION: '1.0.0',
  REFRESH_INTERVAL: 1000, // 1 second
  TABLE_WIDTH: 60,
} as const;

// Risk Management Defaults
export const RISK_DEFAULTS = {
  STOP_LOSS_PERCENT: 20,
  TAKE_PROFIT_LEVELS: [
    { percent: 50, sellPercent: 25, triggered: false },
    { percent: 100, sellPercent: 50, triggered: false },
    { percent: 200, sellPercent: 100, triggered: false },
  ],
  MAX_POSITION_SIZE_BNB: 1n * 10n ** 18n, // 1 BNB
  MAX_CONCURRENT_POSITIONS: 5,
  DAILY_LIMIT_BNB: 5n * 10n ** 18n, // 5 BNB
  TRAILING_STOP_PERCENT: 10,
} as const;
