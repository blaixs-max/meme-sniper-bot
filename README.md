# Four.meme Sniper Bot

Autonomous trading bot for the Four.meme platform on BNB Chain. Built with TypeScript/Node.js with a CLI interface.

## Features

- **Real-time Token Monitoring**: Detects new tokens on Four.meme instantly
- **Security Analysis**: Honeypot detection, rug pull analysis, contract scanning
- **Risk Management**: Stop-loss, take-profit, position limits
- **Trading Strategies**: Sniper, whale tracker, momentum trading
- **Twitter Integration**: Social sentiment analysis and hype detection
- **Interactive CLI**: User-friendly menu-driven interface

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- BNB for gas and trading
- (Optional) Twitter API credentials for social analysis

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd meme-sniper-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure your settings (see Configuration section)
nano .env
```

## Configuration

Edit the `.env` file with your settings:

### Required Settings

```env
# Your wallet private key (NEVER share this!)
PRIVATE_KEY=your_private_key_here
```

### Trading Settings

```env
# Maximum BNB to spend per trade
MAX_BUY_AMOUNT=0.1

# Default slippage tolerance (percentage)
DEFAULT_SLIPPAGE=5

# Gas price multiplier for faster transactions
GAS_PRICE_MULTIPLIER=1.2
```

### Risk Management

```env
# Stop loss percentage (e.g., 20 = -20%)
STOP_LOSS_PERCENT=20

# Take profit levels (comma-separated percentages)
TAKE_PROFIT_LEVELS=50,100,200

# Maximum concurrent positions
MAX_POSITIONS=5

# Daily trading limit in BNB
DAILY_LIMIT_BNB=1
```

### Security Settings

```env
# Enable honeypot check before buying
HONEYPOT_CHECK_ENABLED=true

# Enable rug pull detection
RUG_CHECK_ENABLED=true

# Minimum liquidity in BNB to consider a token
MIN_LIQUIDITY_BNB=1
```

### Twitter Integration (Optional)

```env
# Twitter API Bearer Token
TWITTER_BEARER_TOKEN=your_bearer_token

# Enable Twitter sentiment analysis
TWITTER_ANALYSIS_ENABLED=true

# Minimum Twitter score to consider buying (0-100)
MIN_TWITTER_SCORE=30
```

## Usage

### Interactive Mode (Default)

```bash
npm run dev
```

This starts the bot with an interactive CLI menu:

```
┌──────────────────────────────────────────────────────────┐
│  FOUR.MEME SNIPER BOT v1.0                               │
└──────────────────────────────────────────────────────────┘
  Wallet: 0x1234...5678
  BNB Balance: 1.5 BNB

  [0] Start/Stop Bot
  [1] View Positions
  [2] Manual Buy
  [3] Manual Sell
  [4] Analyze Token
  [5] Check Balance
  [6] Network Info
  [7] Settings
  [8] Exit
```

### Auto Mode

```bash
npm run dev -- --auto
```

Runs the bot in fully automatic mode, executing trades based on configured strategies.

### Build for Production

```bash
npm run build
npm start
```

## Trading Strategies

### 1. Sniper Strategy

Automatically buys newly created tokens based on configurable criteria:

- Token age (only buy tokens < X minutes old)
- Minimum/maximum liquidity
- Creator whitelist/blacklist
- Name/symbol filters
- Twitter score requirements

### 2. Whale Tracker Strategy

Follows large traders:

- Track specific wallet addresses
- Mirror whale buys with configurable percentage
- Detect and follow any wallet making large trades

### 3. Momentum Strategy

Trades based on price/volume momentum:

- Minimum price increase thresholds
- Volume requirements
- Activity score filtering
- Buy pressure analysis

## Security Features

### Honeypot Detection

- Simulates buy/sell to detect if tokens can be sold
- Calculates buy/sell taxes
- Checks for transfer restrictions

### Rug Pull Analysis

- Contract ownership checks
- Mint function detection
- Blacklist/pause function detection
- Proxy pattern identification

### Contract Scanner

- Bytecode analysis
- Known scam pattern detection
- Comprehensive risk scoring

## Risk Management

### Stop-Loss

- Fixed percentage stop-loss
- Trailing stop-loss option
- Time-based stop (auto-sell after X minutes)

### Take-Profit

- Multiple take-profit levels
- Partial selling at each level
- Configurable sell percentages

### Position Limits

- Maximum position size
- Maximum concurrent positions
- Daily trading limits

## Project Structure

```
meme-sniper-bot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/
│   │   ├── constants.ts      # Contract addresses, ABIs
│   │   └── settings.ts       # User settings
│   ├── core/
│   │   ├── wallet.ts         # Wallet management
│   │   ├── blockchain.ts     # BNB Chain connection
│   │   └── trading.ts        # Buy/Sell operations
│   ├── services/
│   │   ├── token-monitor.ts  # New token detection
│   │   ├── event-listener.ts # Blockchain events
│   │   ├── price-tracker.ts  # Price tracking
│   │   └── analytics.ts      # Token analytics
│   ├── twitter/
│   │   ├── client.ts         # Twitter API client
│   │   ├── search.ts         # Token search
│   │   ├── sentiment.ts      # Sentiment analysis
│   │   └── metrics.ts        # Social metrics
│   ├── strategies/
│   │   ├── base-strategy.ts  # Strategy interface
│   │   ├── sniper.ts         # Sniper strategy
│   │   ├── whale-tracker.ts  # Whale tracking
│   │   └── momentum.ts       # Momentum trading
│   ├── security/
│   │   ├── honeypot-check.ts # Honeypot detection
│   │   ├── rug-detector.ts   # Rug pull analysis
│   │   └── contract-scanner.ts # Security scanning
│   ├── risk/
│   │   ├── stop-loss.ts      # Stop-loss management
│   │   ├── take-profit.ts    # Take-profit management
│   │   └── position-manager.ts # Position tracking
│   ├── cli/
│   │   ├── commands.ts       # CLI commands
│   │   ├── menu.ts           # Interactive menu
│   │   └── display.ts        # Terminal UI
│   ├── utils/
│   │   ├── logger.ts         # Logging
│   │   ├── helpers.ts        # Utilities
│   │   └── encryption.ts     # Key encryption
│   └── types/
│       └── index.ts          # TypeScript types
├── abis/
│   └── four-meme.json        # Contract ABIs
├── .env.example              # Example config
├── package.json
├── tsconfig.json
└── README.md
```

## Contract Addresses

- **Four.meme TokenManager2**: `0x5c952063c7fc8610FFDB798152D69F0B9550762b`
- **FOUR Token**: `0x9eb5d5731dff7c3c53cf6ba3c05fc1247c790ef9`
- **Network**: BNB Chain Mainnet (Chain ID: 56)

## Security Warnings

1. **Never share your private key** - It gives full access to your wallet
2. **Use a dedicated trading wallet** - Don't use your main wallet
3. **Start with small amounts** - Test with minimal funds first
4. **Enable security checks** - Keep honeypot and rug detection enabled
5. **Monitor your positions** - Don't leave the bot unattended for long periods

## Disclaimer

This software is provided "as is" without warranty of any kind. Trading cryptocurrencies carries significant risk. You may lose some or all of your investment. Only trade with funds you can afford to lose. The developers are not responsible for any financial losses.

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.
