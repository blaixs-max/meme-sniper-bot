# Data-Driven Trading Rules - Pump.fun Bot

**Version:** 1.0
**Created:** 2026-02-08
**Based On:** Research #002 (29 token analysis, platform statistics)
**Status:** v1.1 - Trade Decision Audit System eklendi

---

## 1. Token Filtreleme (Pre-condition Check)

### 1.1 Otomatik RED (Auto-Reject)

Bu durumlardan **herhangi biri** varsa token otomatik reddedilir:

| # | Red Flag | Detection Method |
|---|----------|------------------|
| 1 | Mint Authority Retained | RugCheck / Solscan |
| 2 | Freeze Authority Retained | RugCheck / Solscan |
| 3 | Top 10 Holders > 40% | Holder analysis |
| 4 | No Social Media (Twitter/Telegram) | Social scan |
| 5 | Dev Wallet on Blacklist | blacklisted_devs table |
| 6 | Volume Bot Activity > 50% | Volume pattern analysis |
| 7 | RugCheck Score < 50 | RugCheck API |
| 8 | Token Age > 7 days AND no traction | Token age + volume check |

### 1.2 Dikkat Gerektiren (Yellow Flags)

Bu durumlar puan düşürür ama otomatik red değil:

| # | Yellow Flag | Puan Düşümü |
|---|-------------|-------------|
| 1 | Dev Wallet Age < 30 days | -10 |
| 2 | No Website | -5 |
| 3 | Top 10 Holders 30-40% | -5 |
| 4 | ATH < 15 min (too fast) | -10 |
| 5 | Liquidity < 5 SOL | -5 |
| 6 | No Telegram Group | -3 |

---

## 2. Token Puanlama Sistemi

### 2.1 Success Indicators (Pozitif Puanlar)

| # | Signal | Points | Reason |
|---|--------|--------|--------|
| 1 | **Celebrity/Elon Tweet** | +30 | PNUT: $17 → $3M |
| 2 | **Viral News Event** | +25 | MOODENG: $800 → $3.5M |
| 3 | **KOL Founder (10K+ followers)** | +20 | Shark Cat: $160M |
| 4 | **KOL Founder (1K-10K)** | +15 | Michi: $186M |
| 5 | **Previous Successful Project** | +20 | Track record proven |
| 6 | **Exchange Listing Rumor** | +15 | Binance = 10x (PNUT) |
| 7 | **Token Burn by Founder** | +15 | Skin in the game |
| 8 | **AI/Tech Narrative** | +15 | GOAT: $1B |
| 9 | **Trending Theme Timing** | +10 | Cat/dog war, political |
| 10 | **Pre-launch Marketing** | +10 | Organic interest |
| 11 | **Dev Wallet Age > 90 days** | +10 | Established actor |
| 12 | **Professional Website** | +5 | Legitimacy signal |
| 13 | **Active Telegram (1K+ members)** | +5 | Community |
| 14 | **RugCheck Score > 80** | +5 | Safe token |

### 2.2 Final Score Calculation

```
Base Score = 50
Final Score = Base Score + (Positive Points) - (Negative Points)
Max Score = 100
Min Score = 0
```

### 2.3 Score-Based Action

| Score Range | Action | Harcama % |
|-------------|--------|-----------|
| 90-100 | **STRONG BUY** | %25 of available |
| 80-89 | **BUY** | %20 of available |
| 70-79 | **CONSIDER** | %15 of available |
| 60-69 | **WEAK BUY** | %10 of available |
| < 60 | **SKIP** | %0 |

---

## 3. Entry Timing Strategy

### 3.1 Entry Windows

| Window | When to Enter | Risk Level |
|--------|---------------|------------|
| **Optimal** | 4-15 minutes after launch | Medium |
| **Good** | 15-60 minutes after launch | Low-Medium |
| **Late** | 1-6 hours after launch | Low but less upside |
| **Avoid** | First 30 seconds | Bot territory |
| **Avoid** | After graduation | Lower upside |

### 3.2 Entry Decision Flow

```
Token Detected (5-min scan)
    │
    ├─→ RugCheck Score < 50? → REJECT
    │
    ├─→ Red Flags? → REJECT
    │
    ├─→ Calculate Score
    │       │
    │       ├─→ Score < 60? → SKIP
    │       │
    │       └─→ Score >= 60? → Check Price
    │               │
    │               ├─→ Price pumped > 30% in last 5 min? → WAIT
    │               │
    │               └─→ Price stable/dip? → BUY
    │
    └─→ Log decision in database
```

---

## 4. Exit Strategy (Take Profit & Stop Loss)

### 4.1 Take Profit Levels (Kademeli Satış)

| Level | Trigger | Action | Kalan |
|-------|---------|--------|-------|
| **TP1** | +50% | Sell 25% | 75% |
| **TP2** | +100% (2x) | Sell 25% | 50% |
| **TP3** | +200% (3x) | Sell 25% | 25% |
| **TP4** | +500% (6x) | Bot decision* | 0-25% |

*TP4 Decision: If momentum strong (Twitter trending, volume increasing), hold. Otherwise, sell remaining.

### 4.2 Stop Loss

| Level | Condition | Action |
|-------|-----------|--------|
| **Watch** | -10% | Monitor closely |
| **Alert** | -15% | Check other signals |
| **STOP** | -20% | **SELL ALL** |

### 4.3 Panic Sell Triggers (Immediate Exit)

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Liquidity Drop | -50% in 5 min | **PANIC SELL** |
| Liquidity Drop | -25% in 1 min | **PANIC SELL** |
| Dev Wallet Sell | 10%+ of holdings | **PANIC SELL** |
| RugCheck Score Drop | Below 30 | **PANIC SELL** |

### 4.4 Momentum Exit

**Prerequisite:** Must be in profit (min +10%)

| Signal | Threshold | Action |
|--------|-----------|--------|
| Twitter Engagement | -50% in 3 hours | SELL |
| Buy Pressure | -70% in 30 min | SELL |
| Holder Growth | Stagnant for 2 hours | Consider SELL |

### 4.5 Timeout Exit

| Time | Condition | Action |
|------|-----------|--------|
| 2 hours | < 5% change, low engagement | Watch |
| 4 hours | Still flat | Sell candidate |
| 6 hours | No positive signals | **SELL** |

---

## 5. Position Sizing

### 5.1 Portfolio Limits

| Parameter | Value |
|-----------|-------|
| Max Positions | 40 tokens |
| Cash Reserve | 50% of total |
| Max per Trade | 25% of available |
| Min per Trade | 0.1 SOL |

### 5.2 Score-Weighted Allocation

```
Token Investment = (Token Score / Total Score of Batch) × Turn Budget
```

**Example:** 5 tokens selected, 10 SOL budget

| Token | Score | Weight | Investment |
|-------|-------|--------|------------|
| A | 90 | 90/320 = 28% | 2.8 SOL |
| B | 80 | 80/320 = 25% | 2.5 SOL |
| C | 70 | 70/320 = 22% | 2.2 SOL |
| D | 50 | 50/320 = 16% | 1.6 SOL |
| E | 30 | 30/320 = 9% | 0.9 SOL |

---

## 6. Risk Scoring Algorithm

### 6.1 Risk Score Calculation

```typescript
function calculateRiskScore(token: TokenData): number {
  let risk = 0;

  // Whale concentration (30 points max)
  if (token.top10HolderPercent > 50) risk += 30;
  else if (token.top10HolderPercent > 40) risk += 20;
  else if (token.top10HolderPercent > 30) risk += 10;

  // Liquidity risk (25 points max)
  if (token.liquiditySOL < 5) risk += 25;
  else if (token.liquiditySOL < 10) risk += 15;
  else if (token.liquiditySOL < 20) risk += 5;

  // Dev wallet risk (20 points max)
  if (token.devWalletAgeDays < 7) risk += 20;
  else if (token.devWalletAgeDays < 30) risk += 10;

  // Speed risk (15 points max)
  if (token.minutesToATH < 15) risk += 15;
  else if (token.minutesToATH < 30) risk += 10;

  // Authority risk (10 points max)
  if (token.mintAuthorityRetained) risk += 5;
  if (token.freezeAuthorityRetained) risk += 5;

  return Math.min(risk, 100);
}
```

### 6.2 Risk Interpretation

| Risk Score | Level | Max Position Size |
|------------|-------|-------------------|
| 0-25 | LOW | 100% of normal |
| 26-50 | MEDIUM | 75% of normal |
| 51-75 | HIGH | 50% of normal |
| 76-100 | CRITICAL | **DO NOT BUY** |

---

## 7. Monitoring & Alerts

### 7.1 Real-time Monitors

| Monitor | Frequency | Alert Trigger |
|---------|-----------|---------------|
| Price | Every 15 sec | TP/SL levels hit |
| Liquidity | Every 1 min | -25% drop |
| Dev Wallet | Every 5 min | Any sell > 5% |
| RugCheck | Every 30 min | Score drop > 20 |
| Twitter | Every 15 min | Engagement drop > 50% |

### 7.2 Alert Priorities

| Priority | Examples | Response Time |
|----------|----------|---------------|
| 🔴 CRITICAL | Panic triggers | Immediate (< 1 sec) |
| 🟠 HIGH | Stop loss hit | < 5 sec |
| 🟡 MEDIUM | TP levels hit | < 30 sec |
| 🟢 LOW | Info updates | Next cycle |

---

## 8. Blacklist Management

### 8.1 Auto-Blacklist Triggers

| Trigger | Duration | Reason |
|---------|----------|--------|
| Rug pull detected | Permanent | Proven scammer |
| Multiple failed tokens | 90 days | Pattern scammer |
| Fake engagement | 30 days | Trust violation |
| Contract exploit | Permanent | Security risk |

### 8.2 Blacklist Check Flow

```
New Token Detected
    │
    └─→ Check creator wallet against blacklisted_devs
            │
            ├─→ Match found? → AUTO-REJECT + LOG
            │
            └─→ No match? → Continue analysis
```

---

## 9. Special Scenarios

### 9.1 Celebrity/Elon Tweet Detected

```
1. Immediately increase position size limit (+50%)
2. Reduce entry delay (buy faster)
3. Extend TP targets (hold longer)
4. Monitor for exchange listing news
```

### 9.2 Exchange Listing Detected

```
1. If already holding → HOLD for pump
2. If not holding → Consider late entry
3. Watch for 10x potential (PNUT pattern)
4. Set higher TP targets
```

### 9.3 Viral News Event

```
1. Quick analysis of narrative (positive/negative)
2. If animal/sympathy story → Higher score
3. If political → Higher volatility expected
4. If celebrity involved → Maximum priority
```

---

## 10. Performance Metrics

### 10.1 KPIs to Track

| Metric | Target | Formula |
|--------|--------|---------|
| Win Rate | > 30% | Profitable trades / Total trades |
| Avg Win | > 50% | Average profit on winners |
| Avg Loss | < 20% | Average loss on losers |
| Sharpe Ratio | > 1.5 | Risk-adjusted returns |
| Max Drawdown | < 30% | Peak to trough decline |

### 10.2 Strategy Adjustment Triggers

| Condition | Adjustment |
|-----------|------------|
| Win rate < 20% for 1 week | Review scoring weights |
| Avg loss > 25% | Tighten stop loss |
| Too many timeouts | Review token age filter |
| Missing big winners | Review entry timing |

---

## 11. Trade Decision Audit System (Karar Denetim Sistemi)

Bot her kararını kayıt altına alır, sonuçları takip eder ve hatalarından öğrenir.

### 11.1 Aşama 1: Karar Kaydı (Her Trade Anında)

Her BUY, SKIP veya SELL kararında aşağıdaki veriler `trade_decisions` tablosuna yazılır:

```typescript
interface TradeDecision {
  id: string;                    // UUID
  token_address: string;         // Token mint address
  token_name: string;            // Token adı
  decision: 'BUY' | 'SKIP' | 'SELL';
  timestamp: Date;

  // Karar verileri
  score: number;                 // Final skor (0-100)
  risk_score: number;            // Risk skoru (0-100)
  positive_signals: string[];    // Tetikleyen pozitif sinyaller
  negative_signals: string[];    // Red/Yellow flags
  signal_details: Record<string, number>; // Her sinyalin puan katkısı

  // Market verileri
  token_age_minutes: number;     // Launch'tan bu yana geçen süre
  entry_price: number;           // Giriş fiyatı
  market_cap_at_entry: number;   // Girişteki market cap
  liquidity_sol: number;         // Girişteki likidite
  holder_count: number;          // Girişteki holder sayısı
  top10_holder_percent: number;  // Top 10 holder yüzdesi
  volume_24h: number;            // 24 saatlik hacim
  rugcheck_score: number;        // RugCheck puanı

  // Pozisyon
  investment_sol: number;        // Yatırılan SOL
  position_percent: number;      // Portföy yüzdesi
}
```

### 11.2 Aşama 2: Sonuç Takibi (Çıkış Anında + 48 Saat Sonra)

Her pozisyon kapandığında ve 48 saat sonra:

```typescript
interface TradeOutcome {
  decision_id: string;           // İlgili karar ID'si

  // Çıkış verileri
  exit_price: number;            // Çıkış fiyatı
  exit_timestamp: Date;
  exit_reason: 'TP1' | 'TP2' | 'TP3' | 'TP4' | 'STOP_LOSS' |
               'PANIC_SELL' | 'MOMENTUM_EXIT' | 'TIMEOUT' | 'MANUAL';
  pnl_sol: number;               // Kar/zarar (SOL)
  pnl_percent: number;           // Kar/zarar (%)
  hold_duration_minutes: number;  // Tutma süresi

  // 48 saat sonrası snapshot
  price_after_48h: number;       // 48 saat sonraki fiyat
  token_status: 'moon' | 'alive' | 'flat' | 'declining' | 'dead' | 'rugged';
  actual_ath: number;            // Gerçek ATH
  ath_after_exit: boolean;       // Çıktıktan sonra ATH yaptı mı
  missed_profit_percent: number; // Kaçırılan kar yüzdesi (eğer varsa)

  // Doğruluk değerlendirmesi
  decision_correct: boolean;     // Karar doğru muydu?
  // BUY + kâr = doğru, BUY + zarar = yanlış
  // SKIP + token düştü = doğru, SKIP + token 3x yaptı = yanlış
}
```

### 11.3 Karar Doğruluk Hesaplama

```typescript
function evaluateDecision(decision: TradeDecision, outcome: TradeOutcome): boolean {
  if (decision.decision === 'BUY') {
    // PnL pozitif mi?
    return outcome.pnl_percent > 0;
  }

  if (decision.decision === 'SKIP') {
    // Token 48 saat içinde 2x altında kaldı mı?
    // Kaldıysa doğru skip, yapmadıysa kaçırılmış fırsat
    return outcome.price_after_48h < decision.entry_price * 2;
  }

  if (decision.decision === 'SELL') {
    // Sattıktan sonra fiyat düştü mü?
    return outcome.price_after_48h <= outcome.exit_price;
  }

  return false;
}
```

---

## 12. Haftalık Otomatik Analiz ve Parametre Optimizasyonu

### 12.1 Haftalık Rapor (Her Pazar otomatik)

```typescript
interface WeeklyReport {
  period_start: Date;
  period_end: Date;

  // Genel metrikler
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl_sol: number;
  avg_win_percent: number;
  avg_loss_percent: number;
  best_trade: { token: string; pnl_percent: number };
  worst_trade: { token: string; pnl_percent: number };

  // Sinyal analizi
  misleading_signals: SignalAnalysis[];   // Yanıltıcı sinyaller
  missed_opportunities: MissedOpportunity[]; // Kaçırılan fırsatlar
  reliable_signals: SignalAnalysis[];     // Güvenilir sinyaller

  // Parametre önerileri
  parameter_adjustments: ParameterAdjustment[];
}
```

### 12.2 Sinyal Güvenilirlik Analizi

Her hafta her sinyalin performansı hesaplanır:

```typescript
interface SignalAnalysis {
  signal_name: string;          // Örn: "KOL Founder", "Active TG"
  times_triggered: number;       // Kaç kez tetiklendi
  in_winning_trades: number;     // Kazanan trade'lerde kaç kez
  in_losing_trades: number;      // Kaybeden trade'lerde kaç kez
  reliability_score: number;     // Güvenilirlik: win / total (0-1)
  current_points: number;        // Mevcut puan değeri
  suggested_points: number;      // Önerilen puan değeri
}
```

**Güvenilirlik formülü:**
```
reliability = wins_with_signal / total_with_signal

Eğer reliability < 0.3 → puan %50 düşür
Eğer reliability < 0.2 → puan %75 düşür
Eğer reliability > 0.7 → puan %25 artır
Eğer reliability > 0.8 → puan %50 artır
```

### 12.3 Kaçırılan Fırsat Analizi

```typescript
interface MissedOpportunity {
  token_address: string;
  token_name: string;
  skip_reason: string;           // Neden skip edildi
  skip_score: number;            // Verilen skor
  actual_performance: number;    // Gerçek performans (%)
  missing_signal: string;        // Hangi sinyal eksikti
  recommendation: string;        // Ne yapılmalı
}
```

### 12.4 Otomatik Parametre Güncelleme Kuralları

| Koşul | Aksyon | Limit |
|--------|--------|-------|
| Sinyal güvenilirliği < 0.2 (2+ hafta) | Puan %75 düşür | Min 1 puan |
| Sinyal güvenilirliği > 0.8 (2+ hafta) | Puan %50 artır | Max +10 puan |
| Win rate < %20 (1 hafta) | Tüm scoring ağırlıklarını gözden geçir | Manuel onay gerekli |
| Avg loss > %25 | Stop loss'u %2 sıkılaştır | Min -15% SL |
| %30+ trade timeout ile bitti | Token age filtresini sıkılaştır | Min 1 saat max age |
| %50+ kaçırılan fırsatlar RugCheck > 90 | RugCheck > 90 bonus puanı ekle | Max +15 puan |
| Panic sell > %20 (haftalık) | Liquidity monitoring frekansını artır | Min 15 sn |

### 12.5 Güvenlik: Otomatik vs Manuel Güncelleme

```
Otomatik güncellenebilir (güvenli):
  ✅ Sinyal puanları (±%50 aralığında)
  ✅ Monitor frekansları
  ✅ TP/SL threshold'ları (±%5 aralığında)
  ✅ Timeout süreleri (±1 saat aralığında)

Manuel onay gerekli (tehlikeli):
  🔒 Auto-reject kuralları ekleme/çıkarma
  🔒 Risk score formülü değişikliği
  🔒 Position sizing limitleri
  🔒 Panic sell threshold'ları
  🔒 %50'den fazla puan değişikliği
  🔒 Yeni sinyal türü ekleme
```

---

## 13. Sürekli İyileştirme Döngüsü

### 13.1 Döngü Akışı

```
   ┌──────────────┐
   │  Token Tespit │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ Karar Ver    │────▶│ KAYIT: Karar + Neden │
   │ (BUY/SKIP)   │     │ (trade_decisions)     │
   └──────┬───────┘     └─────────────────────┘
          │
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ Pozisyon      │────▶│ KAYIT: Sonuç + PnL  │
   │ Kapat         │     │ (trade_outcomes)      │
   └──────┬───────┘     └─────────────────────┘
          │
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ 48 Saat Sonra │────▶│ KAYIT: Token durumu  │
   │ Kontrol       │     │ (decision_correct?)   │
   └──────┬───────┘     └─────────────────────┘
          │
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ Haftalık      │────▶│ Sinyal analizi       │
   │ Analiz        │     │ Parametre önerileri   │
   │ (Pazar)       │     │ Kaçırılan fırsatlar   │
   └──────┬───────┘     └─────────────────────┘
          │
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ Parametre     │────▶│ Güncellenen kurallar │
   │ Güncelle      │     │ (otomatik + manuel)   │
   └──────┬───────┘     └─────────────────────┘
          │
          └──────────▶ Başa dön (yeni kurallarla)
```

### 13.2 Aylık Deep Review (Manuel)

Her ay sonunda yapılacak kapsamlı değerlendirme:

| Analiz | Detay |
|--------|-------|
| **En iyi 5 trade** | Ortak özellikleri neydi? |
| **En kötü 5 trade** | Ortak hata neydi? |
| **Kategori bazlı** | Celebrity vs Meme vs AI - hangisi karlı? |
| **Zaman bazlı** | Hangi saatlerde/günlerde performans iyi? |
| **Piyasa korelasyonu** | SOL/BTC fiyatı ile başarı ilişkisi |
| **Sinyal evrimi** | Hangi sinyaller güçlendi/zayıfladı? |
| **Yeni pattern** | Datada yeni bir pattern var mı? |

### 13.3 Versiyon Takibi

Her parametre değişikliği versiyonlanır:

```typescript
interface ParameterVersion {
  version: string;              // "v1.0", "v1.1", "v2.0"
  changed_at: Date;
  change_type: 'auto' | 'manual';
  changes: {
    parameter: string;          // Örn: "kol_score_points"
    old_value: number;
    new_value: number;
    reason: string;             // Neden değişti
    based_on_trades: number;    // Kaç trade'e dayanarak
  }[];
  performance_before: { win_rate: number; avg_pnl: number };
  performance_after?: { win_rate: number; avg_pnl: number }; // 1 hafta sonra
}
```

---

## Appendix: Data Sources

| Data | Source | Usage |
|------|--------|-------|
| New Tokens | Moralis API | Scanner detection |
| Token Metadata | Moralis + Birdeye | Token info |
| Price/Volume | DexScreener / Birdeye | Trading signals |
| Holder Data | Solana RPC | Distribution analysis |
| Social Metrics | Twitter API / BirdEye | Engagement scoring |
| Safety Score | RugCheck API | Risk assessment |
| Dev History | Solscan | Wallet analysis |

---

**Research Basis:**
- 8 successful token case studies (GOAT, Michi, Shark Cat, MOTHER, DADDY, MOODENG, PNUT, SCF)
- 1 rug pull case study (Gen Z Quant)
- Platform statistics (98.6% fail rate, 1.4% graduation)
- Entry timing analysis (4-hour optimal window)
- Success factor ranking
- Detection tools evaluation

---

**Next Version Updates:**
- [ ] Backtest results
- [ ] API systematic analysis (500+ coins)
- [ ] ML-based scoring refinement
- [ ] Real-time performance data
- [x] Trade Decision Audit System (Section 11-13)

---

**Document Control:**
- **Owner:** Bot Development Team
- **Review Frequency:** Weekly
- **Last Updated:** 2026-02-09
