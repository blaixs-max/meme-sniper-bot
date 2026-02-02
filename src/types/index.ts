// Token information
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  creator: string;
  createdAt: Date;
  reserveBNB: bigint;
  reserveToken: bigint;
  isMigrated: boolean;
  price?: bigint;
}

// Position tracking
export interface Position {
  id: string;
  token: TokenInfo;
  entryPrice: bigint;
  currentPrice: bigint;
  amount: bigint;
  amountBNB: bigint;
  entryTime: Date;
  pnlPercent: number;
  pnlBNB: bigint;
  stopLossPrice?: bigint;
  takeProfitLevels?: TakeProfitLevel[];
}

export interface TakeProfitLevel {
  percent: number;
  sellPercent: number;
  triggered: boolean;
}

// Trading decisions
export interface BuyDecision {
  shouldBuy: boolean;
  amount: bigint;
  reason: string;
  confidence: number;
  riskScore: number;
}

export interface SellDecision {
  shouldSell: boolean;
  amount: bigint;
  reason: string;
  sellType: 'stop_loss' | 'take_profit' | 'manual' | 'strategy';
}

// Transaction types
export interface TradeResult {
  success: boolean;
  txHash?: string;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed?: bigint;
  error?: string;
}

export interface TransactionConfig {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

// Events from blockchain
export interface TokenPurchaseEvent {
  buyer: string;
  token: string;
  amountIn: bigint;
  amountOut: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface TokenSaleEvent {
  seller: string;
  token: string;
  amountIn: bigint;
  amountOut: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface TokenCreatedEvent {
  token: string;
  creator: string;
  name: string;
  symbol: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface TokenMigratedEvent {
  token: string;
  pair: string;
  liquidity: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

// Security analysis
export interface SecurityAnalysis {
  isHoneypot: boolean;
  hasRugPullRisk: boolean;
  riskScore: number;
  issues: SecurityIssue[];
  recommendation: 'safe' | 'caution' | 'avoid';
}

export interface SecurityIssue {
  type: 'honeypot' | 'ownership' | 'mint' | 'blacklist' | 'proxy' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface HoneypotCheckResult {
  isHoneypot: boolean;
  canSell: boolean;
  sellTax: number;
  buyTax: number;
  error?: string;
}

export interface RugPullAnalysis {
  hasRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  indicators: RugPullIndicator[];
}

export interface RugPullIndicator {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Twitter analysis
export interface TwitterAnalysis {
  tokenSymbol: string;
  tweetCount: number;
  uniqueUsers: number;
  engagement: TwitterEngagement;
  sentiment: SentimentAnalysis;
  influencerMentions: number;
  score: number;
  lastUpdated: Date;
}

export interface TwitterEngagement {
  likes: number;
  retweets: number;
  replies: number;
  total: number;
}

export interface SentimentAnalysis {
  positive: number;
  negative: number;
  neutral: number;
  overall: 'positive' | 'negative' | 'neutral';
  hypeScore: number;
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  createdAt: Date;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
  };
  isInfluencer: boolean;
}

// Strategy configuration
export interface StrategyConfig {
  name: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface TradingStrategy {
  name: string;
  shouldBuy(token: TokenInfo, analysis?: SecurityAnalysis, twitter?: TwitterAnalysis): Promise<BuyDecision>;
  shouldSell(position: Position): Promise<SellDecision>;
  configure(config: StrategyConfig): void;
}

// Risk management
export interface RiskConfig {
  stopLossPercent: number;
  takeProfitLevels: TakeProfitLevel[];
  maxPositionSizeBNB: bigint;
  maxConcurrentPositions: number;
  dailyLimitBNB: bigint;
  trailingStopEnabled: boolean;
  trailingStopPercent?: number;
}

// Wallet information
export interface WalletInfo {
  address: string;
  balanceBNB: bigint;
  balances: Map<string, bigint>;
}

// Application settings
export interface AppSettings {
  rpcUrls: string[];
  wssUrl: string;
  maxBuyAmount: bigint;
  defaultSlippage: number;
  gasPriceMultiplier: number;
  risk: RiskConfig;
  honeypotCheckEnabled: boolean;
  rugCheckEnabled: boolean;
  minLiquidityBNB: bigint;
  twitterAnalysisEnabled: boolean;
  minTwitterScore: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
}

// CLI types
export interface MenuOption {
  name: string;
  value: string;
  description?: string;
}

export interface DashboardData {
  wallet: WalletInfo;
  positions: Position[];
  recentTrades: TradeResult[];
  botStatus: 'running' | 'stopped' | 'error';
  uptime: number;
  totalPnL: bigint;
}

// Price tracking
export interface PriceData {
  token: string;
  price: bigint;
  timestamp: Date;
  volume24h?: bigint;
  priceChange24h?: number;
}

export interface OHLC {
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
  timestamp: Date;
}

// Event emitter types
export type EventType =
  | 'token_created'
  | 'token_purchase'
  | 'token_sale'
  | 'token_migrated'
  | 'price_update'
  | 'position_opened'
  | 'position_closed'
  | 'stop_loss_triggered'
  | 'take_profit_triggered'
  | 'error';

export interface BotEvent<T = unknown> {
  type: EventType;
  data: T;
  timestamp: Date;
}
