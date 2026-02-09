# Decision Log

**Purpose:** Track all technical and process decisions
**Why:** Remember why we chose X over Y
**Format:** ADR (Architecture Decision Record) style

---

## Decision Index

| # | Date | Title | Status |
|---|------|-------|--------|
| [001](#decision-001-platform-migration) | 2026-02-04 | Platform Migration | ✅ Approved |
| [002](#decision-002-microservices-architecture) | 2026-02-04 | Microservices Architecture | ✅ Approved |
| [003](#decision-003-moralis-api-selection) | 2026-02-04 | Moralis API Selection | ✅ Approved |
| [004](#decision-004-supabase-database) | 2026-02-04 | Supabase Database | 🟡 Pending Setup |
| [005](#decision-005-railway-hosting) | 2026-02-04 | Railway Hosting | 🟡 Pending Approval |

---

## Decision #001: Platform Migration

### Context
- Existing codebase: Four.meme on BNB Chain
- TDD specification: Pump.fun on Solana
- Mismatch between code and spec

### Decision
**Migrate from Four.meme/BNB Chain to Pump.fun/Solana**

### Options Considered

#### Option 1: Continue with Four.meme ⭐⭐⭐
**Pros:**
- Code already exists (31 files)
- Faster to complete (~1-2 weeks)
- Less risk (known platform)

**Cons:**
- Doesn't match TDD spec
- BNB Chain vs Solana differences
- Need to rewrite TDD

#### Option 2: Migrate to Pump.fun ⭐⭐⭐⭐⭐ **CHOSEN**
**Pros:**
- Matches TDD v2.2.0 spec
- Solana's faster finality
- Pump.fun has good APIs
- Clean start, no legacy code

**Cons:**
- Complete rewrite needed
- Longer timeline (~6 weeks)
- Unknown platform initially

#### Option 3: Hybrid (Test Four.meme, then port)
**Pros:**
- Learn from Four.meme version
- Can test concepts

**Cons:**
- Double work
- Wastes time

### Rationale
User chose Option 2. Align with TDD specification, build it right from the start. Timeline is acceptable (6 weeks).

### Consequences
- Start from scratch
- 6-week timeline
- Need to learn Solana
- All code will be new

### Status
✅ **Approved** by user on 2026-02-04

### Stakeholders
- User (decision maker)
- Claude (implementer)

### Review Date
After Phase 1 completion

---

## Decision #002: Microservices Architecture

### Context
- Need to choose architecture pattern
- TDD specifies 3 services
- Options: Monolith vs Microservices

### Decision
**Use 3 microservices: Scanner, Trader, Monitor**

### Options Considered

#### Option 1: Monolith ⭐⭐⭐
**Pros:**
- Simpler deployment
- No inter-service communication overhead
- Easier debugging

**Cons:**
- Scaling limitations
- Single point of failure
- Doesn't match TDD

#### Option 2: Microservices ⭐⭐⭐⭐⭐ **CHOSEN**
**Pros:**
- Matches TDD spec
- Independent scaling
- Separation of concerns
- Each service can restart independently

**Cons:**
- More complex deployment
- Need service communication (Supabase Realtime)
- More monitoring needed

### Rationale
Per TDD specification. Better architecture for long-term, enables:
- Scanner can poll every 5 minutes independently
- Trader always-on for instant execution
- Monitor can track positions without blocking scanner

### Service Breakdown

**Scanner Service (256MB, cron 5min):**
- Poll Pump.fun API
- Run pre-condition checks
- Score tokens
- Write top candidates to DB

**Trader Service (256MB, always-on):**
- Listen for buy signals (Realtime)
- Execute buy transactions
- Listen for sell signals
- Execute sell transactions
- Update positions

**Monitor Service (512MB, always-on):**
- Track portfolio every 15 minutes
- Check exit conditions
- Real-time panic sell monitoring
- Generate sell signals

### Consequences
- Deploy 3 separate services on Railway
- Use Supabase Realtime for communication
- More complex but more scalable
- Each service can fail independently

### Status
✅ **Approved** (from TDD spec)

### Review Date
After Phase 8 (Deployment)

---

## Decision #003: Moralis API Selection

### Context
- Need data source for Pump.fun tokens
- Blocker: Don't know if API exists
- Research found 5 options

### Decision
**Use Moralis API as primary data source**

### Options Considered

| Provider | Type | Free Tier | Score |
|----------|------|-----------|-------|
| **Moralis** | REST | ✅ Yes | ⭐⭐⭐⭐⭐ **CHOSEN** |
| Bitquery | GraphQL | Limited | ⭐⭐⭐⭐ |
| QuickNode | REST | ❌ No | ⭐⭐⭐ |
| bloXroute | Stream | ❌ No | ⭐⭐⭐ |
| PumpDev.io | WebSocket | ✅ Yes | ⭐⭐⭐ |

### Rationale

**Why Moralis:**
1. ✅ Free tier available
2. ✅ Perfect endpoint: `/exchange/pumpfun/new`
3. ✅ Comprehensive data (metadata, prices, liquidity)
4. ✅ REST API (easy integration)
5. ✅ Well-documented

**Fallback Plan:**
- If rate limits: Use Bitquery
- For trading: QuickNode Metis
- For real-time: Add WebSocket later

### Implementation
```typescript
// Scanner Service - Phase 4
const tokens = await moralisAPI.getNewPumpFunTokens();
```

### Consequences
- Need Moralis API key (free signup)
- Subject to rate limits (monitor)
- Have 4 fallback options if needed
- No web scraping needed!

### Status
✅ **Approved** - Research completed, documented in research.md #001

### Review Date
After Phase 4 implementation

---

## Decision #004: Supabase Database

### Context
- Need database for positions, trades, scores
- TDD specifies PostgreSQL
- Options: Self-hosted, managed services

### Decision
**Use Supabase (managed PostgreSQL with Realtime)**

### Options Considered

#### Option 1: Self-hosted PostgreSQL
**Pros:** Full control, no vendor lock-in
**Cons:** Ops overhead, no Realtime, more expensive

#### Option 2: Supabase ⭐⭐⭐⭐⭐ **CHOSEN**
**Pros:** Free tier, Realtime included, easy setup, good docs
**Cons:** Vendor lock-in, free tier limits (500MB)

#### Option 3: AWS RDS
**Pros:** Scalable, reliable
**Cons:** Expensive, no Realtime, complex setup

### Rationale
Per TDD specification. Supabase provides:
- PostgreSQL database
- **Realtime subscriptions** (critical for service communication)
- Free tier sufficient for start
- Easy migration if needed

### Database Schema
7 tables (per TDD):
- positions
- trades
- token_scores
- blacklisted_devs
- wallet_state
- sell_signals
- logs

### Consequences
- External dependency
- 500MB limit (monitor usage)
- Need backup strategy
- Realtime enables microservices communication

### Status
🟡 **Pending user setup**

### Review Date
After Phase 2 completion

---

## Decision #005: Railway Hosting

### Context
- Need hosting for 3 microservices
- Options: Various PaaS providers

### Decision
**Use Railway for hosting all 3 services**

### Options Considered

| Provider | Cost/mo | Ease | Score |
|----------|---------|------|-------|
| **Railway** | $5-15 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ **CHOSEN** |
| Heroku | $15-30 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| DigitalOcean | $12+ | ⭐⭐⭐ | ⭐⭐⭐ |
| AWS | $20+ | ⭐⭐ | ⭐⭐ |
| Self-hosted | $5+ | ⭐ | ⭐⭐ |

### Rationale
Per TDD specification. Railway offers:
- Easy deployment (GitHub integration)
- Reasonable pricing
- Built-in monitoring
- Environment variables
- Health checks
- Auto-restart

### Cost Estimate
- Scanner: ~$2.5/mo (256MB, cron)
- Trader: ~$2.5/mo (256MB, always-on)
- Monitor: ~$5/mo (512MB, always-on)
- **Total: ~$10/mo** (within $5-15 budget)

### Consequences
- Monthly cost $5-15
- Need Railway account
- GitHub repo required
- Docker knowledge helpful

### Status
🟡 **Pending user budget approval**

### Review Date
Before Phase 8 (Deployment)

---

## 📋 Decision Template

```markdown
## Decision #XXX: [Title]

### Context
What's the situation? What problem are we solving?

### Decision
**Clear statement of what we decided**

### Options Considered

#### Option 1: [Name] ⭐⭐⭐
**Pros:**
**Cons:**

#### Option 2: [Name] ⭐⭐⭐⭐⭐ **CHOSEN**
**Pros:**
**Cons:**

### Rationale
Why did we choose this? Key factors?

### Consequences
What are the implications?
- Positive
- Negative
- Trade-offs

### Status
✅ Approved / 🟡 Pending / ❌ Rejected / 🔄 Superseded

### Stakeholders
Who was involved? Who approved?

### Review Date
When should we revisit this?

---
```

---

## 🔄 Decision Lifecycle

```
Proposed → Discussed → Decided → Implemented → Reviewed
   ↓          ↓           ↓            ↓           ↓
 Research   Options    Document     Code it     Works?
              ↓           ↓            ↓           ↓
          Pros/Cons   Rationale    Test it    Retrospect
```

---

## 📊 Decision Statistics

**Total Decisions:** 5
**Approved:** 3
**Pending:** 2
**Rejected:** 0
**Superseded:** 0

**Categories:**
- Architecture: 2
- Infrastructure: 2
- API/Data: 1

---

**Last Updated:** 2026-02-04
**Next Decision:** TBD
