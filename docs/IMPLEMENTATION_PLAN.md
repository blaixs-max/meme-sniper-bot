# Pump.fun Bot Implementation Plan

**Start Date:** 2026-02-04
**Target:** Pump.fun/Solana Trading Bot (TDD v2.2.0)
**Status:** Planning Phase

---

## 🎯 Objective

Build a fully autonomous trading bot for Pump.fun platform on Solana blockchain with:
- 3 microservices architecture (Scanner, Trader, Monitor)
- Supabase PostgreSQL database
- Railway hosting
- Advanced filtering and scoring system
- Multi-platform social analysis
- 40 token portfolio management

---

## 📋 Implementation Phases

### Phase 1: Project Setup & Architecture (Week 1)
**Duration:** 2-3 days

#### Tasks:
- [ ] Create new project structure (monorepo)
- [ ] Set up packages (shared, scanner, trader, monitor)
- [ ] Configure TypeScript for each package
- [ ] Install Solana dependencies (@solana/web3.js, @solana/spl-token)
- [ ] Install Supabase client
- [ ] Set up development environment
- [ ] Create .env.example for all services

#### Deliverables:
```
pump-fun-bot/
├── packages/
│   ├── shared/
│   ├── scanner/
│   ├── trader/
│   └── monitor/
├── scripts/
├── docs/
└── package.json (workspace root)
```

---

### Phase 2: Supabase Database Setup (Week 1)
**Duration:** 1-2 days

#### Tasks:
- [ ] Create Supabase project
- [ ] Create database schema (11 tables)
  - [ ] positions
  - [ ] trades
  - [ ] token_scores
  - [ ] blacklisted_devs
  - [ ] wallet_state
  - [ ] sell_signals
  - [ ] logs
  - [ ] trade_decisions (Karar Denetim - her trade kararı ve nedenleri)
  - [ ] trade_outcomes (Sonuç Takip - PnL, çıkış nedeni, 48h sonrası durum)
  - [ ] weekly_reports (Haftalık analiz raporları ve sinyal güvenilirliği)
  - [ ] parameter_versions (Parametre değişiklik geçmişi ve versiyonlama)
- [ ] Enable Realtime subscriptions
- [ ] Set up Row Level Security
- [ ] Test database connection
- [ ] Create database queries module

#### SQL Scripts:
- `scripts/setup-db.sql`
- `scripts/seed-db.sql`

---

### Phase 3: Shared Package (Week 1-2)
**Duration:** 3-4 days

#### Core Modules:
- [ ] **Config**
  - constants.ts (Pump.fun addresses, Solana config)
  - settings.ts (environment variables)
- [ ] **Database**
  - supabase.ts (client setup)
  - queries.ts (CRUD operations)
- [ ] **API Clients**
  - pump-fun.ts (Pump.fun API)
  - birdeye.ts (BirdEye API)
  - dexscreener.ts (DexScreener API)
- [ ] **Core**
  - solana.ts (Solana connection)
  - wallet.ts (Keypair management)
- [ ] **Utils**
  - logger.ts (Winston logger)
  - helpers.ts
  - encryption.ts (AES-256)
- [ ] **Types**
  - index.ts (all TypeScript interfaces)

---

### Phase 4: Scanner Service (Week 2-3)
**Duration:** 5-7 days

#### Main Components:

**4.1 Pump.fun Integration**
- [ ] API client for new tokens
- [ ] Token info fetching
- [ ] 5-minute cron scheduler

**4.2 Pre-condition Checks (7 filters)**
- [ ] Pre-condition 1: Social media activity
  - [ ] Telegram bot integration
  - [ ] Twitter check (BirdEye)
  - [ ] Discord bot integration
- [ ] Pre-condition 2: Website analyzer
  - [ ] SSL check
  - [ ] Domain age
  - [ ] Content analysis (whitepaper, roadmap, team)
- [ ] Pre-condition 3: Holder distribution
  - [ ] Solana RPC holder data
  - [ ] Top 10 holder percentage
- [ ] Pre-condition 4: Min 20 holders check
- [ ] Pre-condition 5: Token age check (max 7 days)
- [ ] Pre-condition 6: Price history analysis
  - [ ] 1-hour dump check
  - [ ] 24-hour dump check
  - [ ] ATH distance check
- [ ] Pre-condition 7: Dev wallet analysis
  - [ ] Creator transaction history
  - [ ] Rug pull detection
  - [ ] Wallet age and project count

**4.3 Scoring System**
- [ ] Pre-condition scorer (1-10 per filter)
- [ ] Social scorer (Twitter deep scan)
  - [ ] Cashtag search
  - [ ] Hashtag search
  - [ ] Name search
  - [ ] Bot detection
- [ ] Final scorer (weighted 50/50)

**4.4 Database Integration**
- [ ] Write top 20 to token_scores table
- [ ] Trigger buy signals for Trader

---

### Phase 5: Trader Service (Week 3-4)
**Duration:** 4-5 days

#### Components:

**5.1 Trading Engine**
- [ ] Solana transaction builder
- [ ] Buy token function (Pump.fun API)
- [ ] Sell token function
- [ ] Slippage calculation
- [ ] Gas optimization

**5.2 Signal Listener**
- [ ] Supabase Realtime subscription
- [ ] Listen to token_scores (buy signals)
- [ ] Listen to sell_signals (sell triggers)

**5.3 Buy Executor**
- [ ] Pre-buy validation
  - [ ] Price pump check (30% threshold)
  - [ ] Duplicate position check
  - [ ] Balance check
- [ ] Weighted buy distribution
- [ ] Position tracking
- [ ] Transaction retry logic

**5.4 Sell Executor**
- [ ] Panic sell handler (immediate)
- [ ] Stop loss handler
- [ ] Take profit handler (partial sells)
- [ ] Portfolio cleanup handler

**5.5 Cash Management**
- [ ] 50% reserve enforcement
- [ ] Available balance calculator
- [ ] Turn-based spending calculator (10-25%)

---

### Phase 6: Monitor Service (Week 4-5)
**Duration:** 5-6 days

#### Components:

**6.1 Portfolio Tracker**
- [ ] Load all positions from DB
- [ ] 15-minute update cycle
- [ ] Price updates (BirdEye/DexScreener)
- [ ] PnL calculation

**6.2 Exit Strategies**
- [ ] **Take Profit**
  - [ ] TP1: +50% → sell 25%
  - [ ] TP2: +100% → sell 25%
  - [ ] TP3: +200% → sell 25%
  - [ ] TP4: +500% → bot decision
  - [ ] Spike handling (cumulative sell)
- [ ] **Stop Loss**
  - [ ] -10%: Mark as watching
  - [ ] -15%: Check other signals
  - [ ] -20%: Trigger stop loss
- [ ] **Momentum Exit**
  - [ ] Twitter engagement drop (50% in 3h)
  - [ ] Buy pressure drop (70% in 30m)
  - [ ] Min 10% profit requirement
- [ ] **Timeout Exit**
  - [ ] 2h: Mark as watching
  - [ ] 4h: Sell candidate
  - [ ] 6h: Force sell
- [ ] **Panic Sell**
  - [ ] Real-time liquidity monitoring
  - [ ] Liquidity drop 50% in 5min → PANIC
  - [ ] Liquidity drop 25% in 1min → PANIC
  - [ ] Dev wallet 10% sell → PANIC

**6.3 Weakness Scorer**
- [ ] Calculate weakness score
  - [ ] Current PnL (30%)
  - [ ] Twitter trend (25%)
  - [ ] Holder growth (20%)
  - [ ] Buy pressure (15%)
  - [ ] Initial score (10%)
- [ ] Portfolio cleanup (sell weakest 10 when at 40)

**6.4 Position Manager**
- [ ] Portfolio limit (max 40)
- [ ] Emergency sell for high-score opportunity (>90)

**6.5 Decision Auditor (Trade Decision Audit System)**
- [ ] **Karar Kayıt Modülü**
  - [ ] Her BUY/SKIP/SELL kararını trade_decisions tablosuna yaz
  - [ ] Tüm sinyalleri ve puan katkılarını kaydet
  - [ ] Market verileri snapshot (fiyat, likidite, holder, volume)
  - [ ] Karar anı zaman damgası ve token yaşı
- [ ] **Sonuç Takip Modülü**
  - [ ] Pozisyon kapanınca trade_outcomes tablosuna yaz
  - [ ] PnL hesapla (SOL ve %)
  - [ ] Çıkış nedenini kaydet (TP/SL/Panic/Timeout/Momentum)
  - [ ] 48 saat sonra otomatik token durumu kontrolü (cron)
  - [ ] Kaçırılan kar yüzdesi hesapla (erken çıkış analizi)
  - [ ] Karar doğruluğu değerlendirmesi (evaluateDecision)
- [ ] **Haftalık Analiz Motoru (Pazar cron)**
  - [ ] Genel metrikler: win rate, avg win/loss, best/worst trade
  - [ ] Sinyal güvenilirlik analizi (her sinyalin reliability score)
  - [ ] Kaçırılan fırsat analizi (SKIP edilen ama moon yapan tokenlar)
  - [ ] Yanıltıcı sinyal tespiti (kayıplarda sık görülen sinyaller)
  - [ ] Haftalık raporu weekly_reports tablosuna yaz
- [ ] **Parametre Optimizasyonu**
  - [ ] Otomatik sinyal puan ayarı (güvenilirlik < 0.3 → düşür, > 0.7 → artır)
  - [ ] TP/SL threshold mikro ayarları (±%5 aralığında)
  - [ ] Monitor frekans ayarları
  - [ ] Güvenlik: tehlikeli değişiklikler için manuel onay zorunlu
  - [ ] Parametre versiyonlama (her değişiklik loglanır)
- [ ] **Aylık Deep Review Raporu**
  - [ ] En iyi/kötü 5 trade analizi
  - [ ] Kategori bazlı performans (Celebrity vs Meme vs AI)
  - [ ] Zaman bazlı performans (saat/gün korelasyonu)
  - [ ] Piyasa korelasyonu (SOL/BTC ile ilişki)
  - [ ] Yeni pattern tespiti

---

### Phase 7: Testing & Integration (Week 5-6)
**Duration:** 4-5 days

#### Tasks:
- [ ] Unit tests for critical functions
- [ ] Integration tests between services
- [ ] Supabase Realtime testing
- [ ] Mock trading tests (testnet)
- [ ] End-to-end flow testing
- [ ] Load testing
- [ ] Error scenario testing

---

### Phase 8: Railway Deployment (Week 6)
**Duration:** 2-3 days

#### Tasks:
- [ ] Create Railway project
- [ ] Set up 3 services (Scanner, Trader, Monitor)
- [ ] Configure environment variables
- [ ] Set up Dockerfiles for each service
- [ ] Configure health checks
- [ ] Set up cron for Scanner (5min)
- [ ] Set up cron for Decision Auditor - 48h kontrol (6 saatte bir)
- [ ] Set up cron for Weekly Analysis (Pazar 00:00)
- [ ] Deploy and test in production
- [ ] Monitor logs and performance
- [ ] Document deployment process

---

## 📊 Progress Tracking

| Phase | Status | Progress | ETA |
|-------|--------|----------|-----|
| 1. Setup | 🔵 Not Started | 0% | Week 1 |
| 2. Database | 🔵 Not Started | 0% | Week 1 |
| 3. Shared | 🔵 Not Started | 0% | Week 1-2 |
| 4. Scanner | 🔵 Not Started | 0% | Week 2-3 |
| 5. Trader | 🔵 Not Started | 0% | Week 3-4 |
| 6. Monitor | 🔵 Not Started | 0% | Week 4-5 |
| 7. Testing | 🔵 Not Started | 0% | Week 5-6 |
| 8. Deploy | 🔵 Not Started | 0% | Week 6 |

**Legend:**
- 🔵 Not Started
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked

---

## 🔑 Key Dependencies

### External Services
1. **Supabase** - Database & Realtime
   - Sign up: https://supabase.com
   - Free tier: 500MB DB, 5GB bandwidth
2. **Railway** - Hosting
   - Sign up: https://railway.app
   - Cost: ~$5-15/month
3. **BirdEye API** - Market data & social metrics
   - Sign up: https://birdeye.so
   - May have rate limits
4. **Solana RPC** - Blockchain connection
   - Helius, Alchemy, or public RPCs
5. **Telegram Bot** (Optional)
   - For group member checks
6. **Discord Bot** (Optional)
   - For server member checks

### NPM Packages
```json
{
  "@solana/web3.js": "^1.87.6",
  "@solana/spl-token": "^0.3.9",
  "@supabase/supabase-js": "^2.39.3",
  "axios": "^1.6.5",
  "winston": "^3.11.0",
  "node-cron": "^3.0.3",
  "cheerio": "^1.0.0-rc.12",
  "dotenv": "^16.4.0"
}
```

---

## ⚠️ Critical Decisions Needed

### Before Starting:
1. **Solana Wallet**
   - Do you have a Solana wallet with SOL?
   - Need ~5-10 SOL for testing + trading
2. **Supabase Account**
   - Free tier sufficient?
3. **Railway Account**
   - Budget: $5-15/month OK?
4. **API Keys**
   - BirdEye API key?
   - Twitter API (optional)?
   - Telegram/Discord bots (optional)?
5. **Pump.fun API**
   - Need to research if they have public API
   - May need to scrape or use alternative data source

---

## 📝 Next Steps

1. ✅ Answer critical questions above
2. Create Supabase account & project
3. Create Railway account
4. Set up Solana wallet
5. Research Pump.fun API/data access
6. Start Phase 1: Project Setup

---

**Last Updated:** 2026-02-09
**Next Review:** After Phase 1 completion

---

## 📌 Document Management

### Update Policy
This document will be updated:
- ✅ Before starting each phase (update status to 🟡 In Progress)
- ✅ After completing each phase (update status to 🟢 Complete)
- ✅ When technical decisions are made
- ✅ When blockers are encountered
- ✅ When timeline estimates change

### Related Documents
- [PROGRESS_LOG.md](./PROGRESS_LOG.md) - Daily progress tracking
- [TECHNICAL_DESIGN_DOCUMENT.md](./TECHNICAL_DESIGN_DOCUMENT.md) - Original TDD spec
- [README.md](../README.md) - Project overview (to be updated)

### Version History
- **v1.0** (2026-02-04): Initial implementation plan created
- Next version will be v1.1 when Phase 1 completes
