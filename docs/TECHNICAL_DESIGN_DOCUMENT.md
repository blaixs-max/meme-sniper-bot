# Technical Design Document
## Pump.fun Meme Coin Trading Bot v2.2.0

**Son Güncelleme:** 2026-02-09
**Durum:** Development
**Platform:** Solana (Pump.fun)

---

## İçindekiler

1. [Proje Genel Bakış](#1-proje-genel-bakış)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Backend Mimarisi](#3-backend-mimarisi)
4. [Veritabanı Şeması](#4-veritabanı-şeması)
5. [Aşama I: Tarama ve Filtreleme](#5-aşama-i-tarama-ve-filtreleme)
6. [Aşama II: Puanlama ve Alım](#6-aşama-ii-puanlama-ve-alım)
7. [Aşama III: Portföy Takibi](#7-aşama-iii-portföy-takibi)
8. [Aşama IV: Satış ve Çıkış](#8-aşama-iv-satış-ve-çıkış)
9. [Kasa Yönetimi](#9-kasa-yönetimi)
10. [İş Kuralları ve Edge Case'ler](#10-iş-kuralları-ve-edge-caseler)
11. [API Entegrasyonları](#11-api-entegrasyonları)
12. [Veri Yapıları](#12-veri-yapıları)
13. [Teknik Altyapı](#13-teknik-altyapı)
14. [Deployment](#14-deployment)
15. [Hata Yönetimi ve Güvenlik](#15-hata-yönetimi-ve-güvenlik)
16. [Maliyet Analizi](#16-maliyet-analizi)
17. [Değişiklik Geçmişi](#17-değişiklik-geçmişi)

---

## 1. Proje Genel Bakış

### 1.1 Amaç
Pump.fun platformunda yeni tokenleri otomatik tarayıp, çok katmanlı filtreleme ve sosyal analiz ile alım-satım kararları veren otonom trading botu.

### 1.2 Temel Felsefe
> "Çoğu bot sadece fiyata bakar, bu bot 'ilgiye' (hype) bakıyor. Kriptoda fiyat ilgiyi takip eder."

### 1.3 Temel Özellikler
- ✅ 5 dakikada bir Pump.fun taraması
- ✅ 7 ön şart ile otomatik filtreleme
- ✅ Çoklu sosyal medya kontrolü (X, Telegram, Discord)
- ✅ Website profesyonellik analizi
- ✅ Holder dağılım (Bubble Map) analizi
- ✅ Developer cüzdan geçmişi kontrolü
- ✅ Ağırlıklı puanlama sistemi
- ✅ Akıllı kasa yönetimi (%50 nakit koruması)
- ✅ Kademeli take-profit ve stop-loss
- ✅ Panic sell koruması
- ✅ Max 40 token portföy yönetimi

### 1.4 Teknoloji Stack

| Kategori | Teknoloji |
|----------|-----------|
| Runtime | Node.js >= 18.0.0 |
| Dil | TypeScript |
| Blockchain | @solana/web3.js, @solana/spl-token |
| Database | Supabase (PostgreSQL) |
| Hosting | Railway (3 servis) |
| Veri API | BirdEye, DexScreener |
| Sosyal Veri | BirdEye sosyal metrikleri |
| Real-time | Supabase Realtime |
| CLI | inquirer, chalk, ora |
| Logging | Winston + Supabase |

### 1.5 Başarı Tahmini

| Durum | Oran | Sonuç |
|-------|------|-------|
| Rug Pull/Scam (Filtrelenen) | %70-80 | Bot pas geçer |
| Hatalı Sinyal (Zararına satış) | %15 | Küçük stop-loss zararları |
| Mütevazı Kâr (%10-%30) | %10 | Kasanın dönmesini sağlar |
| Büyük Patlama (10x-50x) | %1-2 | Moonshot kazançları |

---

## 2. Sistem Mimarisi

### 2.1 Yüksek Seviye Akış

```
┌─────────────────────────────────────────────────────────────────┐
│                         TUR DÖNGÜSÜ                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   AŞAMA I    │───→│   AŞAMA II   │───→│  AŞAMA III   │      │
│  │   Tarama &   │    │  Puanlama &  │    │   Portföy    │      │
│  │  Filtreleme  │    │    Alım      │    │   Takibi     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ↓                   ↓                   ↓               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  7 Ön Şart   │    │   Top 20     │    │  15 dk'da    │      │
│  │   Kontrolü   │    │ → Top 10     │    │   bir        │      │
│  │              │    │   Seçimi     │    │  güncelle    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                 │               │
│                                                 ↓               │
│                                          ┌──────────────┐      │
│                                          │  AŞAMA IV    │      │
│                                          │  Satış &     │      │
│                                          │  Çıkış       │      │
│                                          └──────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Zamanlama

| İşlem | Periyot |
|-------|---------|
| Pump.fun tarama | Her 5 dakika |
| Ön şart kontrolü | Tarama sonrası |
| Derin sosyal tarama | Top 20 için |
| Alım kararı | Puanlama sonrası |
| Portföy güncelleme | Her 15 dakika |
| Panic sell kontrolü | Sürekli (real-time) |
| 48h karar değerlendirme | Her 6 saat |
| Haftalık analiz + rapor | Pazar 00:00 |

---

## 3. Backend Mimarisi

### 3.1 Genel Bakış

Bot, 3 ayrı mikroservis olarak Railway üzerinde çalışır. Servisler arası iletişim Supabase Realtime ile sağlanır.

```
┌─────────────────────────────────────────────────────────────┐
│                         RAILWAY                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │  SCANNER    │   │   TRADER    │   │   MONITOR   │       │
│  │  Service    │   │   Service   │   │   Service   │       │
│  │  (256MB)    │   │   (256MB)   │   │   (512MB)   │       │
│  │  5dk cycle  │   │  always-on  │   │  always-on  │       │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘       │
│         │                 │                 │               │
│         └────────────┬────┴─────────────────┘               │
│                      │                                       │
│              Supabase Realtime                              │
│                      │                                       │
└──────────────────────┼───────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE                                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │positions │ │  trades  │ │  scores  │ │   logs   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  + Realtime subscriptions                                   │
│  + Row Level Security                                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Servis Detayları

#### SCANNER Service

| Özellik | Değer |
|---------|-------|
| Görev | Yeni token tarama, ön şart kontrolü, puanlama |
| Çalışma | Her 5 dakika (cron) |
| RAM | 256MB |
| Çıktı | `token_scores` tablosuna yaz |

**Akış:**
```
Her 5 dk → Pump.fun tara → Ön şartlar → Puanla → Top 20 → DB'ye yaz
```

#### TRADER Service

| Özellik | Değer |
|---------|-------|
| Görev | Alım/satım işlemleri, TX gönderme |
| Çalışma | Always-on (event listener) |
| RAM | 256MB |
| Çıktı | `positions`, `trades` tablolarına yaz |

**Akış:**
```
DB dinle → Alım sinyali? → Buy TX → Position aç
         → Satış sinyali? → Sell TX → Position kapat
```

#### MONITOR Service

| Özellik | Değer |
|---------|-------|
| Görev | Portföy takibi, exit kontrolleri, panic sell, karar denetimi |
| Çalışma | Always-on (15dk cycle + real-time panic + cron jobs) |
| RAM | 512MB |
| Çıktı | Satış sinyalleri → DB'ye yaz → TRADER alır |

**Akış:**
```
Sürekli → Panic kontrol (likidite, dev satış)
15 dk   → Portföy güncelle → Exit kontrol → Sinyal üret
6 saat  → 48h geçmiş kararları değerlendir (Decision Audit)
Pazar   → Haftalık analiz + sinyal güvenilirlik + parametre önerisi
```

### 3.3 Servisler Arası İletişim

**Yöntem:** Supabase Realtime

| Kaynak | Tablo | Hedef | Aksiyon |
|--------|-------|-------|---------|
| SCANNER | `token_scores` | TRADER | Yeni alım sinyali |
| MONITOR | `sell_signals` | TRADER | Satış sinyali |
| TRADER | `positions` | MONITOR | Pozisyon takibi |

**Realtime Subscription Örneği:**
```typescript
// TRADER servisi
supabase
  .channel('sell_signals')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'sell_signals'
  }, (payload) => {
    handleSellSignal(payload.new);
  })
  .subscribe();
```

### 3.4 Health Check

Her servis için `/health` endpoint:

```typescript
{
  service: 'scanner',
  status: 'healthy',
  lastRun: '2026-02-02T10:00:00Z',
  uptime: 3600,
  version: '2.1.0'
}
```

**Railway Ayarları:**
- Health check: Her 30 saniye
- Restart policy: On failure
- Max restart: 10 deneme
- Backoff: Exponential (1s, 2s, 4s...)

---

## 4. Veritabanı Şeması

### 4.1 Supabase Tabloları

#### positions (Açık Pozisyonlar)

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(44) NOT NULL,
  token_symbol VARCHAR(20) NOT NULL,
  token_name VARCHAR(100),

  -- Giriş bilgileri
  entry_price DECIMAL(20, 10) NOT NULL,
  entry_amount BIGINT NOT NULL,
  entry_value_sol DECIMAL(20, 10) NOT NULL,
  remaining_amount BIGINT NOT NULL,

  -- Güncel durum
  current_price DECIMAL(20, 10),
  current_value_sol DECIMAL(20, 10),
  pnl_percent DECIMAL(10, 4),
  pnl_sol DECIMAL(20, 10),

  -- Skorlar
  initial_score INT,
  weakness_score INT,

  -- Take profit tracking
  tp1_triggered BOOLEAN DEFAULT FALSE,
  tp2_triggered BOOLEAN DEFAULT FALSE,
  tp3_triggered BOOLEAN DEFAULT FALSE,
  tp4_triggered BOOLEAN DEFAULT FALSE,

  -- İzleme durumu
  is_watching BOOLEAN DEFAULT FALSE,
  watch_reason VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_token ON positions(token_address);
CREATE INDEX idx_positions_watching ON positions(is_watching);
```

#### trades (İşlem Geçmişi)

```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id),
  token_address VARCHAR(44) NOT NULL,
  token_symbol VARCHAR(20) NOT NULL,

  -- İşlem detayları
  trade_type VARCHAR(10) NOT NULL, -- 'buy' | 'sell'
  amount_token BIGINT NOT NULL,
  amount_sol DECIMAL(20, 10) NOT NULL,
  price DECIMAL(20, 10) NOT NULL,

  -- Satış bilgileri
  sell_reason VARCHAR(50), -- stop_loss, take_profit, panic, momentum, timeout, cleanup
  pnl_percent DECIMAL(10, 4),
  pnl_sol DECIMAL(20, 10),

  -- Blockchain
  tx_signature VARCHAR(100),
  tx_status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, failed

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_token ON trades(token_address);
CREATE INDEX idx_trades_type ON trades(trade_type);
CREATE INDEX idx_trades_date ON trades(created_at);
```

#### token_scores (Token Puanları - Cache)

```sql
CREATE TABLE token_scores (
  token_address VARCHAR(44) PRIMARY KEY,
  token_symbol VARCHAR(20),
  token_name VARCHAR(100),

  -- Ön şart puanları
  social_activity_score INT,
  website_score INT,
  holder_distribution_score INT,
  price_history_score INT,
  dev_wallet_score INT,
  pre_condition_total INT,

  -- Sosyal skor
  social_score INT,

  -- Final
  final_score INT,
  passed_filters BOOLEAN,
  elimination_reason VARCHAR(100),

  -- Detaylı veri (JSON)
  scan_data JSONB,

  -- Timestamps
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);
```

#### blacklisted_devs (Rug Yapan Devler)

```sql
CREATE TABLE blacklisted_devs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  reason VARCHAR(200),
  rug_token_address VARCHAR(44),
  rug_token_symbol VARCHAR(20),
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blacklist_wallet ON blacklisted_devs(wallet_address);
```

#### wallet_state (Cüzdan Durumu)

```sql
CREATE TABLE wallet_state (
  id INT PRIMARY KEY DEFAULT 1,
  total_balance_sol DECIMAL(20, 10),
  available_balance_sol DECIMAL(20, 10),
  reserved_balance_sol DECIMAL(20, 10),
  in_positions_sol DECIMAL(20, 10),
  last_updated TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT single_row CHECK (id = 1)
);
```

#### sell_signals (Satış Sinyalleri)

```sql
CREATE TABLE sell_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id),
  token_address VARCHAR(44) NOT NULL,

  signal_type VARCHAR(50) NOT NULL, -- panic_sell, stop_loss, take_profit, momentum, timeout, cleanup
  sell_percent INT NOT NULL, -- Pozisyonun yüzdesi
  urgency VARCHAR(20) NOT NULL, -- immediate, normal
  reason VARCHAR(200),

  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_unprocessed ON sell_signals(processed) WHERE processed = FALSE;
```

#### logs (Kritik Loglar)

```sql
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(20) NOT NULL, -- scanner, trader, monitor
  level VARCHAR(10) NOT NULL, -- info, warn, error, critical
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_service ON logs(service);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_date ON logs(created_at);
```

#### trade_decisions (Karar Kayıtları - Decision Audit)

```sql
CREATE TABLE trade_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(44) NOT NULL,
  token_name VARCHAR(100),
  token_symbol VARCHAR(20),

  -- Karar
  decision VARCHAR(10) NOT NULL, -- 'BUY' | 'SKIP' | 'SELL'

  -- Puanlama verileri
  score INT,
  risk_score INT,
  positive_signals JSONB, -- ["KOL tweet", "Active TG", ...]
  negative_signals JSONB, -- ["Dev wallet young", "Low liquidity", ...]
  signal_details JSONB,   -- {"kol_tweet": 20, "active_tg": 5, ...}

  -- Market snapshot
  token_age_minutes INT,
  entry_price DECIMAL(20, 10),
  market_cap_at_entry DECIMAL(20, 4),
  liquidity_sol DECIMAL(20, 10),
  holder_count INT,
  top10_holder_percent DECIMAL(5, 2),
  volume_24h DECIMAL(20, 4),
  rugcheck_score INT,

  -- Pozisyon bilgisi
  investment_sol DECIMAL(20, 10),
  position_percent DECIMAL(5, 2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decisions_token ON trade_decisions(token_address);
CREATE INDEX idx_decisions_type ON trade_decisions(decision);
CREATE INDEX idx_decisions_date ON trade_decisions(created_at);
```

#### trade_outcomes (Sonuç Takibi - Decision Audit)

```sql
CREATE TABLE trade_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES trade_decisions(id),

  -- Çıkış verileri
  exit_price DECIMAL(20, 10),
  exit_timestamp TIMESTAMPTZ,
  exit_reason VARCHAR(50), -- 'TP1','TP2','TP3','TP4','STOP_LOSS','PANIC_SELL','MOMENTUM_EXIT','TIMEOUT','MANUAL'
  pnl_sol DECIMAL(20, 10),
  pnl_percent DECIMAL(10, 4),
  hold_duration_minutes INT,

  -- 48 saat sonrası snapshot
  price_after_48h DECIMAL(20, 10),
  token_status VARCHAR(20), -- 'moon','alive','flat','declining','dead','rugged'
  actual_ath DECIMAL(20, 10),
  ath_after_exit BOOLEAN DEFAULT FALSE,
  missed_profit_percent DECIMAL(10, 4),

  -- Doğruluk değerlendirmesi
  decision_correct BOOLEAN,
  evaluation_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outcomes_decision ON trade_outcomes(decision_id);
CREATE INDEX idx_outcomes_correct ON trade_outcomes(decision_correct);
```

#### weekly_reports (Haftalık Analiz Raporları)

```sql
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Genel metrikler
  total_trades INT,
  winning_trades INT,
  losing_trades INT,
  win_rate DECIMAL(5, 2),
  total_pnl_sol DECIMAL(20, 10),
  avg_win_percent DECIMAL(10, 4),
  avg_loss_percent DECIMAL(10, 4),

  -- En iyi/kötü trade
  best_trade JSONB,   -- {token, pnl_percent, decision_id}
  worst_trade JSONB,  -- {token, pnl_percent, decision_id}

  -- Sinyal analizi
  misleading_signals JSONB,    -- [{signal, reliability, times_triggered}]
  reliable_signals JSONB,      -- [{signal, reliability, times_triggered}]
  missed_opportunities JSONB,  -- [{token, skip_score, actual_performance}]

  -- Parametre önerileri
  parameter_adjustments JSONB, -- [{param, old_value, new_value, reason}]
  adjustments_applied BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_period ON weekly_reports(period_start);
```

#### parameter_versions (Parametre Versiyonlama)

```sql
CREATE TABLE parameter_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL,
  change_type VARCHAR(10) NOT NULL, -- 'auto' | 'manual'

  -- Değişiklik detayı
  changes JSONB NOT NULL, -- [{parameter, old_value, new_value, reason, based_on_trades}]

  -- Performans karşılaştırma
  performance_before JSONB, -- {win_rate, avg_pnl}
  performance_after JSONB,  -- {win_rate, avg_pnl} (1 hafta sonra doldurulur)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_params_version ON parameter_versions(version);
```

### 4.2 Supabase Realtime Konfigürasyonu

```sql
-- Realtime için tabloları etkinleştir
ALTER PUBLICATION supabase_realtime ADD TABLE token_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE sell_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;
```

---

## 5. Aşama I: Tarama ve Filtreleme

### 5.1 Veri Toplama

Bot her 5 dakikada bir Pump.fun'daki yeni projeleri listeler.

**Veri Kaynağı:** Pump.fun API / BirdEye API

### 5.2 Ön Şartlar (Eleme Kriterleri)

#### Ön Şart 1: Sosyal Medya Varlığı ve Aktivitesi

En az 1 platform aktif olmalı:

| Platform | Min Üye/Takipçi | Min Aktivite (24 saat) |
|----------|-----------------|------------------------|
| Telegram | 20 üye | 10 mesaj |
| X (Twitter) | 10 takipçi | 3 tweet |
| Discord | 20 üye | - |

**Kontrol Yöntemi:**
- Telegram: Bot ile grup kontrolü
- X: BirdEye sosyal verisi
- Discord: Bot ile sunucu kontrolü

**Sonuç:** Hiçbiri aktif değilse → **DİREKT ELE**

---

#### Ön Şart 2: Website Profesyonellik Puanı (1-10)

| Kriter | Puan |
|--------|------|
| SSL sertifikası var (https) | +1 |
| Domain yaşı > 7 gün | +1 |
| Whitepaper/Docs linki var | +2 |
| Roadmap bölümü var | +1 |
| Takım bilgisi var | +2 |
| Sosyal medya linkleri çalışıyor | +1 |
| Mobil uyumlu | +1 |
| Hızlı yükleniyor (< 3 sn) | +1 |
| **Toplam** | **10** |

**Sonuç:** Website yoksa → **0 puan** (ele alınmaz ama düşük skor)

---

#### Ön Şart 3: Holder Dağılımı - Bubble Map (1-10)

| Durum | Puan |
|-------|------|
| Top 10 holder < %30 | 10 |
| Top 10 holder %30-50 | 7 |
| Top 10 holder %50-70 | 4 |
| Top 10 holder > %70 | 1 |

**Veri Kaynağı:** Solana RPC / BirdEye holder data

---

#### Ön Şart 4: Minimum Holder Sayısı

**Kural:** Holder sayısı minimum **20 kişi** olmalı

**Sonuç:** < 20 holder → **DİREKT ELE**

---

#### Ön Şart 5: Token Yaşı

**Kural:** Coin en fazla **1 hafta (7 gün)** önce üretilmiş olmalı

**Sonuç:** > 7 gün → **DİREKT ELE**

---

#### Ön Şart 6: Fiyat Geçmişi Analizi (1-10)

| Kontrol | Yaşandıysa | Puan Etkisi |
|---------|------------|-------------|
| 1 saatte %50+ düşüş | Evet | -3 |
| 24 saatte %70+ düşüş | Evet | -4 |
| ATH'den %90+ düşüş | Evet | -3 |
| Hiçbiri yaşanmamış | Temiz | 10 |

**Örnek Hesaplama:**
- Coin X: 1 saatte %60 düşmüş → 10 - 3 = **7 puan**
- Coin Y: 24 saatte %80 düşmüş + ATH'den %95 düşmüş → 10 - 4 - 3 = **3 puan**
- Coin Z: Temiz geçmiş → **10 puan**

---

#### Ön Şart 7: Developer Cüzdan Analizi

**Kritik Kontrol (Eleme):**
- Dev cüzdan geçmişinde **1 bile rug varsa** → **DİREKT ELE**

**Puanlama (Rug yoksa):**

| Kontrol | Puan |
|---------|------|
| İlk proje (1 proje) | +2 |
| 2-5 proje, hepsi aktif | +4 |
| 2-5 proje, bazıları ölü | +1 |
| Cüzdan yaşı < 7 gün | -2 |
| Cüzdan yaşı > 30 gün | +2 |
| Cüzdan yaşı > 90 gün | +4 |

**Veri Kaynağı:** Pump.fun creator address + Solana transaction history

---

### 5.3 Ön Şart Özet Tablosu

| # | Ön Şart | Eleme | Puanlama |
|---|---------|-------|----------|
| 1 | Sosyal medya aktifliği | ❌ Yoksa ele | ✅ Var/yok |
| 2 | Website profesyonelliği | - | 1-10 puan |
| 3 | Holder dağılımı | - | 1-10 puan |
| 4 | Min 20 holder | ❌ < 20 ele | ✅ Geçti |
| 5 | Max 7 gün yaş | ❌ > 7 gün ele | ✅ Geçti |
| 6 | Fiyat geçmişi | - | 1-10 puan |
| 7 | Dev cüzdan | ❌ Rug varsa ele | 1-10 puan |

---

### 5.4 Ön Şart Sonrası

Tüm eleme kriterlerini geçen coinler puanlanır ve **Top 20** seçilir.

```
Tüm Yeni Coinler
       │
       ↓
┌──────────────────┐
│ Ön Şart 1-7      │
│ Eleme Kontrolleri│
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
  Elendi    Geçti
    │         │
    ↓         ↓
  (drop)   Puanla
              │
              ↓
       ┌──────────────┐
       │   Top 20     │
       │   Seçimi     │
       └──────────────┘
```

---

## 6. Aşama II: Puanlama ve Alım

### 6.1 Derin Sosyal Tarama (Top 20 için)

Her token için X.com'da 3 farklı arama yapılır:

| Arama Tipi | Örnek | Açıklama |
|------------|-------|----------|
| Cashtag | $ABC | Para sembolü |
| Hashtag | #ABC | Hashtag |
| Tam isim | "AbcCoin" | Proje adı |

**Ölçülen Metrikler:**

| Metrik | Açıklama |
|--------|----------|
| Tweet sayısı | Son 1 saatteki tweet |
| Toplam etkileşim | Like + RT + Reply |
| Tweet başına ort. etkileşim | Engagement rate |
| Bot/spam oranı | Şüpheli hesap filtresi |

**Bot/Spam Tespiti:**
- Hesap yaşı < 7 gün → Bot şüphesi
- 0 takipçili hesaptan etkileşim → Şüpheli
- Aynı dakikada benzer tweetler → Koordineli spam

---

### 6.2 Final Puanlama

| Kategori | Ağırlık |
|----------|---------|
| Derin Sosyal Tarama (X.com) | %50 |
| Ön Şart Puanları Toplamı | %50 |

**Hesaplama:**
```
FinalSkor = (SosyalSkor × 0.5) + (ÖnŞartSkor × 0.5)
```

---

### 6.3 Token Seçimi

Top 20'den **maksimum 10 token** seçilir (en yüksek puanlılar).

---

### 6.4 Tur Başı Harcama Kararı

Bot, Top 10'un ortalama puanına göre ne kadar harcayacağına karar verir:

| Top 10 Ort. Puan | Harcama Oranı |
|------------------|---------------|
| > 80 | Yatırım havuzunun %25'i |
| 60-80 | Yatırım havuzunun %20'si |
| 40-60 | Yatırım havuzunun %15'i |
| < 40 | Yatırım havuzunun %10'u |

---

### 6.5 Ağırlıklı Alım Dağılımı

Seçilen tokenlere puan bazlı ağırlıkla yatırım yapılır:

**Formül:**
```
Token Yatırımı = (Token Puanı / Toplam Puan) × Harcanacak Tutar
```

**Örnek:** 5 token, 10 SOL harcanacak

| Token | Puan | Ağırlık | Yatırım |
|-------|------|---------|---------|
| A | 90 | 90/320 = %28 | 2.8 SOL |
| B | 80 | 80/320 = %25 | 2.5 SOL |
| C | 70 | 70/320 = %22 | 2.2 SOL |
| D | 50 | 50/320 = %16 | 1.6 SOL |
| E | 30 | 30/320 = %9 | 0.9 SOL |
| **Toplam** | **320** | **%100** | **10 SOL** |

---

## 7. Aşama III: Portföy Takibi

### 7.1 Portföy Limitleri

| Parametre | Değer |
|-----------|-------|
| Maksimum token sayısı | 40 |
| Güncelleme periyodu | 15 dakika |

### 7.2 Dinamik Değerlendirme (Her 15 dk)

Her token için kontrol edilen metrikler:

| Metrik | Veri Kaynağı |
|--------|--------------|
| X.com trendi | BirdEye sosyal |
| Holder artış hızı | Solana RPC |
| Alım baskısı | DexScreener volume |
| Fiyat değişimi | BirdEye price |
| Likidite durumu | DexScreener |

### 7.3 Portföy 40'a Ulaştığında

En zayıf 10 token satılarak yeni tura yer açılır.

**Zayıflık Skoru Hesaplama:**

| Faktör | Ağırlık |
|--------|---------|
| Güncel kâr/zarar % | %30 |
| X etkileşim trendi | %25 |
| Holder artış hızı | %20 |
| Alım baskısı | %15 |
| İlk değerlendirme puanı | %10 |

En düşük skorlu 10 token satılır.

---

## 8. Aşama IV: Satış ve Çıkış

### 8.1 Take Profit (Kademeli Kâr Alma)

| Kâr % | Aksiyon | Kalan Pozisyon |
|-------|---------|----------------|
| +50% | Pozisyonun %25'ini sat | %75 |
| +100% (2x) | Pozisyonun %25'ini sat | %50 |
| +200% (3x) | Pozisyonun %25'ini sat | %25 |
| +500% (6x) | Bot karar verir | %0-25 |

---

### 8.2 Stop Loss

| Zarar % | Aksiyon |
|---------|---------|
| -10% | ⚠️ İzlemeye al |
| -15% | 🟡 Diğer sinyallere bak (X, holder vs.) |
| -20% | 🔴 **STOP LOSS** - Pozisyonu kapat |

---

### 8.3 Momentum Satışı

**Ön Koşul:** Minimum **%10 kârda** olmalısın

| Metrik | Zaman | Düşüş Eşiği | Aksiyon |
|--------|-------|-------------|---------|
| X etkileşimi | 3 saat | %50 azaldı | 📉 Satış |
| Alım hızı | 30 dk | %70 azaldı | 📉 Satış |
| Her ikisi birden | - | %50 azaldı | 📉 Satış |

---

### 8.4 Panic Sell

| Durum | Aksiyon |
|-------|---------|
| Likidite 5 dk'da %30+ düştü | ⚠️ Uyarı, yakın takip |
| Likidite 5 dk'da %50+ düştü | 🔴 **PANIC SELL** |
| Likidite 1 dk'da %25+ düştü | 🔴 **PANIC SELL** |
| Dev wallet %10+ satış yaptı | 🔴 **PANIC SELL** |

---

### 8.5 Zaman Aşımı Satışı

| Süre | Durum | Aksiyon |
|------|-------|---------|
| 2 saat | Fiyat < %5 değişim + X etkileşimi düşük | ⚠️ İzlemeye al |
| 4 saat | Hala < %5 + holder artmıyor | 🟡 Satış adayı |
| 6 saat | Hiçbir pozitif sinyal yok | 🔴 **Zaman aşımı satışı** |

---

### 8.6 Satış Öncelik Sırası

```
1. PANIC SELL (Anlık) ──────────────────→ Hemen sat
       │
       ↓
2. STOP LOSS (-20%) ────────────────────→ Hemen sat
       │
       ↓
3. TAKE PROFIT (Kademeli) ──────────────→ Kısmi sat
       │
       ↓
4. MOMENTUM SATIŞI (Kârda) ─────────────→ Sat
       │
       ↓
5. ZAMAN AŞIMI (6 saat) ────────────────→ Sat
       │
       ↓
6. YER AÇMA (40 token dolunca) ─────────→ En zayıf 10'u sat
```

---

## 9. Kasa Yönetimi

### 9.1 Temel Kural

```
┌─────────────────────────────────────┐
│           TOPLAM KASA               │
├──────────────────┬──────────────────┤
│   %50 NAKİT      │   %50 YATIRIM    │
│   (Dokunulmaz)   │    (Havuz)       │
└──────────────────┴──────────────────┘
```

### 9.2 Örnek Senaryo

**Kasa:** 100 SOL

| Bölüm | Miktar | Kullanım |
|-------|--------|----------|
| Nakit | 50 SOL | Dokunulmaz, acil durum rezervi |
| Yatırım Havuzu | 50 SOL | Trading için kullanılır |

**Her turda harcanabilecek:**
- Minimum: 50 × 0.10 = **5 SOL**
- Maksimum: 50 × 0.25 = **12.5 SOL**

### 9.3 Kasa Döngüsü

```
        ┌──────────────┐
        │  Başlangıç   │
        │   Kasası     │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │  %50 Nakit   │
        │  %50 Havuz   │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │  Tur Alımı   │
        │  (%10-%25)   │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │   Satışlar   │
        │  (TP/SL/vs)  │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │  Kâr/Zarar   │
        │  Havuza Ekle │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │ Yeni Tur İçin│
        │  Havuz Güncelle│
        └──────────────┘
```

---

## 10. İş Kuralları ve Edge Case'ler

### 10.1 Tekrar Alım Kuralı

**Kural:** Portföyde zaten olan token tekrar alınmaz.

| Durum | Karar | Gerekçe |
|-------|-------|---------|
| Token portföyde var | ❌ Alma | Diversifikasyon korunmalı |
| Token daha önce satıldı | ✅ Alınabilir | Yeni fırsat olabilir |

**Uygulama:** Scanner, `positions` tablosunu kontrol eder. Aktif pozisyonu olan tokenler Top 20'ye dahil edilmez.

---

### 10.2 Fiyat Gecikmesi Koruması

**Sorun:** Scanner'dan Trader'a geçen sürede fiyat değişebilir.

**Kural:** Scan anından bu yana fiyat **%30+** artmışsa → **ALMA**

```typescript
const scanPrice = tokenScore.scan_data.price;
const currentPrice = await getCurrentPrice(tokenAddress);
const priceChange = ((currentPrice - scanPrice) / scanPrice) * 100;

if (priceChange > 30) {
  logger.warn('Price pumped since scan, skipping', { priceChange });
  return; // Pump'a girme
}
```

---

### 10.3 Minimum İşlem Miktarı

**Kural:** Minimum alım miktarı **0.1 SOL**

| Durum | Karar |
|-------|-------|
| Ağırlıklı dağılım < 0.1 SOL | Token atlanır |
| Atlanan tokenin payı | Diğer tokenlere dağıtılır |

**Örnek:**
```
Token A: 0.08 SOL (atla) → 0 SOL
Token B: 0.15 SOL → 0.15 + 0.04 = 0.19 SOL
Token C: 0.12 SOL → 0.12 + 0.04 = 0.16 SOL
```

---

### 10.4 Puan Normalizasyonu

**Sorun:** Ön şart puanları (max 40) ve sosyal skor (max 100) farklı ölçeklerde.

**Çözüm:** Her ikisini 0-100'e normalize et.

```typescript
// Ön şart puanları: Website(10) + Holder(10) + PriceHistory(10) + DevWallet(10) = 40 max
const preConditionNormalized = (preConditionTotal / 40) * 100;

// Sosyal skor zaten 0-100

// Final skor
const finalScore = (preConditionNormalized * 0.5) + (socialScore * 0.5);
```

**Örnek:**
| Metrik | Ham | Normalized |
|--------|-----|------------|
| Ön Şart Toplam | 32/40 | 80 |
| Sosyal Skor | 70/100 | 70 |
| **Final Skor** | | **(80×0.5)+(70×0.5) = 75** |

---

### 10.5 Portföy Dolu + Yüksek Skorlu Fırsat

**Kural:** Portföy 40 tokende VE yeni token skoru **>90** ise:
- En zayıf 1 tokeni **HEMEN** sat
- Yeni tokeni al

```typescript
if (portfolio.length >= 40 && newToken.score > 90) {
  const weakest = portfolio.sort((a, b) => a.weaknessScore - b.weaknessScore)[0];
  await emergencySell(weakest);
  await buyToken(newToken);
}
```

**Not:** Normal durumda 15 dk'da bir zayıf 10 token satılır. Bu kural sadece **istisnai fırsatlar** için.

---

### 10.6 Panic Sell Yedekleme

**Sorun:** Monitor servisi çökerse panic sell çalışmaz.

**Çözüm:** Trader servisine basit panic kontrol ekle.

```typescript
// Trader - her işlem öncesi
async function preTradeCheck(tokenAddress: string): Promise<boolean> {
  // Likidite kontrolü
  const liquidity = await getLiquidity(tokenAddress);
  if (liquidity < PANIC_LIQUIDITY_THRESHOLD) {
    logger.error('Liquidity too low, blocking trade');
    return false;
  }

  // Dev satış kontrolü
  const devSoldPercent = await checkDevWalletSales(tokenAddress);
  if (devSoldPercent > 10) {
    logger.error('Dev sold >10%, blocking trade');
    await triggerPanicSell(tokenAddress);
    return false;
  }

  return true;
}
```

**Trader'ın Panic Yetkileri:**
- Alım işlemini engelleme ✅
- Mevcut pozisyon için panic sell tetikleme ✅
- Realtime likidite izleme ❌ (Monitor'ün görevi)

---

### 10.7 Hızlı Take Profit (Spike Durumu)

**Sorun:** Fiyat hızlıca birden fazla TP seviyesini geçebilir.

**Kural:** En yüksek ulaşılan seviyeye göre **kümülatif satış**, **tek TX**.

| Ulaşılan Seviye | Kümülatif Satış |
|-----------------|-----------------|
| TP1 (+50%) | %25 |
| TP2 (+100%) | %50 (25+25) |
| TP3 (+200%) | %75 (25+25+25) |
| TP4 (+500%) | Bot karar verir |

**Örnek:**
```
Fiyat +250%'e spike yaptı (TP3'ü geçti)
→ TP1, TP2, TP3 hepsi tetiklendi
→ Tek TX'de %75 sat
→ Kalan %25 tutulmaya devam
```

**Uygulama:**
```typescript
function calculateSellPercent(pnlPercent: number, position: Position): number {
  let sellPercent = 0;

  if (pnlPercent >= 50 && !position.tp1_triggered) sellPercent += 25;
  if (pnlPercent >= 100 && !position.tp2_triggered) sellPercent += 25;
  if (pnlPercent >= 200 && !position.tp3_triggered) sellPercent += 25;
  if (pnlPercent >= 500 && !position.tp4_triggered) {
    // Bot kararı: Kalan her şeyi sat veya tut
    sellPercent += position.remainingPercent;
  }

  return sellPercent;
}
```

---

### 10.8 Sosyal Medya Doğrulama

**Sorun:** Sahte veya alakasız sosyal medya linkleri.

**Kural:** Kanal adı veya açıklamasında token sembolü/adı geçmeli.

```typescript
async function validateSocialLink(link: string, token: TokenInfo): Promise<boolean> {
  const channelInfo = await getChannelInfo(link);

  const nameMatch = channelInfo.name.toLowerCase().includes(token.symbol.toLowerCase()) ||
                    channelInfo.name.toLowerCase().includes(token.name.toLowerCase());

  const descMatch = channelInfo.description?.toLowerCase().includes(token.symbol.toLowerCase()) ||
                    channelInfo.description?.toLowerCase().includes(token.name.toLowerCase());

  return nameMatch || descMatch;
}
```

**Sonuç:**
- ✅ Eşleşme var → Link geçerli
- ❌ Eşleşme yok → Link şüpheli, puan düşür

---

### 10.9 TX Başarısızlık Yönetimi

**Kural:** 3 ardışık başarısız TX → Token "sorunlu" işaretle

```typescript
const FAILED_TX_THRESHOLD = 3;
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 saat

// Her başarısız TX'de
tokenFailedTxCount[tokenAddress]++;

if (tokenFailedTxCount[tokenAddress] >= FAILED_TX_THRESHOLD) {
  await markTokenAsProblematic(tokenAddress, 'Repeated TX failures');
  problemTokenCooldown[tokenAddress] = Date.now() + COOLDOWN_PERIOD;
}

// Alım öncesi kontrol
if (problemTokenCooldown[tokenAddress] > Date.now()) {
  logger.warn('Token in cooldown due to TX failures');
  return; // Atla
}
```

---

### 10.10 Dev Cüzdan Tespiti

**Başlangıç Yaklaşımı:** Pump.fun creator adresi = Dev cüzdanı

**Gelecek İyileştirme:** Associated wallet analizi
- Creator'ın ilk funding kaynağı
- Creator'ın transfer yaptığı adresler
- Aynı pattern'de hareket eden cüzdanlar

**Mevcut Kapsam:**
```typescript
async function getDevWallet(tokenAddress: string): Promise<string> {
  const tokenInfo = await getPumpFunTokenInfo(tokenAddress);
  return tokenInfo.creator; // Sadece creator
}

async function checkDevSales(tokenAddress: string): Promise<number> {
  const devWallet = await getDevWallet(tokenAddress);
  const initialHolding = await getInitialDevHolding(tokenAddress, devWallet);
  const currentHolding = await getCurrentBalance(devWallet, tokenAddress);

  const soldPercent = ((initialHolding - currentHolding) / initialHolding) * 100;
  return soldPercent;
}
```

---

### 10.11 Karar Özet Tablosu

| Konu | Karar | Gerekçe |
|------|-------|---------|
| Aynı tokeni tekrar alma | ❌ Hayır | Diversifikasyon |
| Fiyat %30+ artmış | ❌ Alma | Pump'a girme |
| Min işlem miktarı | 0.1 SOL | Dust önleme |
| Panic sell yedek | ✅ Trader'a ekle | Kritik koruma |
| Portföy dolu + skor >90 | ✅ Acil satış | Fırsat kaçırma |
| Hızlı TP spike | Tek TX, kümülatif | Basit ve kârlı |
| Sosyal link doğrulama | Sembol/ad eşleşmesi | Sahte link önleme |
| TX 3x başarısız | 1 saat cooldown | Sorunlu token |
| Dev cüzdan | Creator adresi | Basit başlangıç |

---

## 11. API Entegrasyonları

### 11.1 Veri Kaynakları

| Veri | Birincil Kaynak | Yedek Kaynak |
|------|-----------------|--------------|
| Yeni tokenlar | Pump.fun API | BirdEye |
| Fiyat/Hacim | BirdEye | DexScreener |
| Holder dağılımı | Solana RPC | BirdEye |
| X etkileşimi | BirdEye sosyal | - |
| Telegram/Discord | Bot kontrolü | - |
| Website analizi | HTTP request | - |

### 11.2 Rate Limit Yönetimi

**Tahmini Limitler (Ücretsiz planlar):**

| API | Limit |
|-----|-------|
| BirdEye | ~100 istek/dakika |
| DexScreener | ~300 istek/dakika |
| Solana RPC (Public) | Değişken |

**Öncelik Sırası (Limit dolduğunda):**

1. **Birinci öncelik:** Panic sell kontrolleri
2. **İkinci öncelik:** Mevcut portföy takibi
3. **Üçüncü öncelik:** Yeni token taraması

---

### 11.3 API Yapılandırması

```typescript
const API_CONFIG = {
  birdEye: {
    baseUrl: 'https://public-api.birdeye.so',
    rateLimit: 100, // per minute
  },
  dexScreener: {
    baseUrl: 'https://api.dexscreener.com',
    rateLimit: 300,
  },
  solanaRpc: {
    urls: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com',
    ],
  },
  pumpFun: {
    baseUrl: 'https://pump.fun/api', // TBD
  },
};
```

---

## 12. Veri Yapıları

### 12.1 Token Bilgisi

```typescript
interface PumpToken {
  // Temel bilgiler
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;

  // Creator bilgileri
  creator: string;
  createdAt: Date;

  // Sosyal linkler
  website?: string;
  telegram?: string;
  twitter?: string;
  discord?: string;

  // Piyasa verileri
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;

  // Holder verileri
  holderCount: number;
  top10HolderPercent: number;
}
```

### 12.2 Ön Şart Skoru

```typescript
interface PreConditionScore {
  tokenAddress: string;

  // Eleme sonuçları
  passedAllFilters: boolean;
  eliminationReason?: string;

  // Puanlar
  socialActivityScore: number;      // Ön şart 1 (var/yok)
  websiteProfessionalismScore: number; // Ön şart 2 (1-10)
  holderDistributionScore: number;  // Ön şart 3 (1-10)
  priceHistoryScore: number;        // Ön şart 6 (1-10)
  devWalletScore: number;           // Ön şart 7 (1-10)

  // Toplam
  totalPreConditionScore: number;
}
```

### 12.3 Derin Sosyal Tarama Sonucu

```typescript
interface DeepSocialScan {
  tokenAddress: string;

  // X.com verileri
  tweetCount1h: number;
  totalEngagement: number;
  avgEngagementPerTweet: number;
  suspectedBotRatio: number;

  // Arama sonuçları
  cashtagResults: SearchResult;
  hashtagResults: SearchResult;
  nameResults: SearchResult;

  // Final skor
  socialScore: number; // 0-100
}

interface SearchResult {
  query: string;
  tweetCount: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
}
```

### 12.4 Pozisyon

```typescript
interface Position {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;

  // Giriş bilgileri
  entryPrice: number;
  entryAmount: bigint;
  entryValueSOL: number;
  entryTime: Date;

  // Güncel durum
  currentPrice: number;
  currentValueSOL: number;
  remainingAmount: bigint; // Kısmi satışlardan sonra

  // P&L
  pnlPercent: number;
  pnlSOL: number;

  // Take profit tracking
  tp1Triggered: boolean; // +50%
  tp2Triggered: boolean; // +100%
  tp3Triggered: boolean; // +200%
  tp4Triggered: boolean; // +500%

  // Skorlar
  initialScore: number;
  currentWeaknessScore: number;

  // İzleme durumu
  isWatching: boolean; // -10% veya 2 saat stagnant
  watchReason?: string;
}
```

### 12.5 Satış Kararı

```typescript
interface SellDecision {
  tokenAddress: string;

  shouldSell: boolean;
  sellAmount: bigint; // Kısmi veya tam
  sellPercent: number; // Pozisyonun yüzdesi

  sellType:
    | 'panic_sell'
    | 'stop_loss'
    | 'take_profit'
    | 'momentum'
    | 'timeout'
    | 'portfolio_cleanup';

  reason: string;
  urgency: 'immediate' | 'normal';
}
```

---

## 13. Teknik Altyapı

### 13.1 Proje Yapısı (Monorepo)

```
pump-fun-bot/
├── packages/
│   ├── shared/                     # Paylaşılan kod
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── constants.ts
│   │   │   │   └── settings.ts
│   │   │   ├── database/
│   │   │   │   ├── supabase.ts     # Supabase client
│   │   │   │   └── queries.ts      # DB sorguları
│   │   │   ├── api/
│   │   │   │   ├── birdeye.ts
│   │   │   │   ├── dexscreener.ts
│   │   │   │   └── pump-fun.ts
│   │   │   ├── core/
│   │   │   │   ├── solana.ts
│   │   │   │   └── wallet.ts
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts
│   │   │   │   ├── helpers.ts
│   │   │   │   └── encryption.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   ├── scanner/                    # SCANNER Service
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point
│   │   │   ├── pump-scanner.ts
│   │   │   ├── pre-conditions.ts
│   │   │   ├── social-scanner.ts
│   │   │   ├── analysis/
│   │   │   │   ├── website-analyzer.ts
│   │   │   │   ├── holder-analyzer.ts
│   │   │   │   ├── dev-wallet-analyzer.ts
│   │   │   │   └── price-history.ts
│   │   │   └── scoring/
│   │   │       ├── pre-condition-scorer.ts
│   │   │       ├── social-scorer.ts
│   │   │       └── final-scorer.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── trader/                     # TRADER Service
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point
│   │   │   ├── trading-engine.ts
│   │   │   ├── buy-executor.ts
│   │   │   ├── sell-executor.ts
│   │   │   └── signal-listener.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── monitor/                    # MONITOR Service
│       ├── src/
│       │   ├── index.ts            # Entry point
│       │   ├── portfolio-tracker.ts
│       │   ├── position-manager.ts
│       │   ├── cash-manager.ts
│       │   ├── exits/
│       │   │   ├── take-profit.ts
│       │   │   ├── stop-loss.ts
│       │   │   ├── momentum-exit.ts
│       │   │   ├── panic-sell.ts
│       │   │   └── timeout-exit.ts
│       │   ├── audit/
│       │   │   ├── decision-recorder.ts   # Karar kayıt modülü
│       │   │   ├── outcome-tracker.ts     # Sonuç takip (48h kontrol)
│       │   │   ├── weekly-analyzer.ts     # Haftalık analiz motoru
│       │   │   ├── parameter-optimizer.ts # Otomatik parametre ayarı
│       │   │   └── report-generator.ts    # Rapor oluşturucu
│       │   └── weakness-scorer.ts
│       ├── Dockerfile
│       └── package.json
│
├── docs/
│   └── TECHNICAL_DESIGN_DOCUMENT.md
│
├── scripts/
│   ├── setup-db.sql                # Supabase tablo oluşturma
│   └── deploy.sh                   # Railway deploy script
│
├── package.json                    # Root package.json (workspaces)
├── tsconfig.base.json              # Shared TS config
├── .env.example
└── railway.json
```

### 13.2 Bağımlılıklar

#### Shared Package

| Paket | Açıklama |
|-------|----------|
| @solana/web3.js | Solana blockchain etkileşimi |
| @solana/spl-token | SPL Token işlemleri |
| @supabase/supabase-js | Supabase client & realtime |
| axios | HTTP istekleri |
| winston | Logging |
| dotenv | Environment variables |

#### Scanner Service

| Paket | Açıklama |
|-------|----------|
| node-cron | 5 dk scheduler |
| cheerio | Website parsing |
| puppeteer-core | Website screenshot (opsiyonel) |

#### Trader Service

| Paket | Açıklama |
|-------|----------|
| bs58 | Base58 encoding |

#### Monitor Service

| Paket | Açıklama |
|-------|----------|
| node-cache | In-memory price cache |

#### Dev Dependencies

| Paket | Açıklama |
|-------|----------|
| typescript | TypeScript compiler |
| tsx | Development runner |
| @types/node | Node.js types |

### 13.3 Environment Variables

```env
# === SUPABASE ===
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...  # Sadece backend

# === SOLANA ===
SOLANA_PRIVATE_KEY_ENCRYPTED=<encrypted_key>
ENCRYPTION_KEY=<32_byte_key>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_URL_BACKUP=https://solana-api.projectserum.com

# === API KEYS ===
BIRDEYE_API_KEY=<optional>
DEXSCREENER_API_KEY=<optional>

# === TELEGRAM BOT (Sosyal kontrol için) ===
TELEGRAM_BOT_TOKEN=<optional>

# === DISCORD BOT (Sosyal kontrol için) ===
DISCORD_BOT_TOKEN=<optional>

# === TRADING ===
MAX_PORTFOLIO_SIZE=40
CASH_RESERVE_PERCENT=50
MIN_BUY_PERCENT=10
MAX_BUY_PERCENT=25

# === RISK ===
STOP_LOSS_PERCENT=20
TAKE_PROFIT_1=50
TAKE_PROFIT_2=100
TAKE_PROFIT_3=200
TAKE_PROFIT_4=500

# === TIMING ===
SCAN_INTERVAL_MS=300000      # 5 dakika
PORTFOLIO_UPDATE_MS=900000   # 15 dakika

# === LOGGING ===
LOG_LEVEL=info

# === SERVICE IDENTIFICATION ===
SERVICE_NAME=scanner  # scanner | trader | monitor
```

---

## 14. Deployment

### 14.1 Prerequisites

- Node.js >= 18.0.0
- Solana cüzdanı (SOL bakiyesi ile)
- Supabase hesabı
- Railway hesabı
- Opsiyonel: Telegram/Discord bot tokenları

### 14.2 Supabase Kurulumu

1. Supabase'de yeni proje oluştur
2. SQL Editor'da tablo şemalarını çalıştır (Bölüm 4)
3. Realtime'ı etkinleştir
4. API URL ve Key'i al

### 14.3 Railway Kurulumu

```
Railway Project: pump-fun-bot
├── scanner-service
│   ├── Source: GitHub repo /services/scanner
│   ├── Build: Dockerfile
│   └── Schedule: */5 * * * * (her 5 dk)
│
├── trader-service
│   ├── Source: GitHub repo /services/trader
│   ├── Build: Dockerfile
│   └── Start: Always running
│
├── monitor-service
│   ├── Source: GitHub repo /services/monitor
│   ├── Build: Dockerfile
│   └── Start: Always running
│
└── Environment Variables (Shared)
    ├── SUPABASE_URL
    ├── SUPABASE_KEY
    ├── SOLANA_RPC_URL
    ├── SOLANA_PRIVATE_KEY_ENCRYPTED
    ├── ENCRYPTION_KEY
    └── ...
```

### 14.4 Local Development

```bash
# Klonla
git clone <repo-url>
cd pump-fun-bot

# Bağımlılıkları yükle
npm install

# .env oluştur
cp .env.example .env
# .env dosyasını düzenle

# Development (tüm servisler tek process)
npm run dev

# Sadece scanner
npm run dev:scanner

# Sadece trader
npm run dev:trader

# Sadece monitor
npm run dev:monitor
```

### 14.5 Production Deploy

```bash
# Railway CLI ile
railway login
railway link

# Her servisi deploy et
cd services/scanner && railway up
cd services/trader && railway up
cd services/monitor && railway up
```

### 14.6 Çalışma Modları

| Mod | Komut | Açıklama |
|-----|-------|----------|
| Development | `npm run dev` | Tüm servisler tek process |
| Production | Railway | 3 ayrı servis |
| Interactive | `npm run cli` | Manuel kontrol menüsü |

---

## 15. Hata Yönetimi ve Güvenlik

### 15.1 Hata Senaryoları

| Hata | Servis | Çözüm |
|------|--------|-------|
| Solana RPC down | Hepsi | Yedek RPC'ye geç (failover) |
| BirdEye API limit | Scanner | Rate limit bekle, cache kullan |
| Supabase bağlantı koptu | Hepsi | Retry + exponential backoff |
| TX başarısız | Trader | 3 deneme, slippage artır |
| Beklenmeyen exception | Hepsi | Log → Restart → Devam |

### 15.2 Retry Stratejisi

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,    // 1 saniye
  maxDelay: 30000,       // 30 saniye
  backoffMultiplier: 2,  // Exponential
};

// Delay: 1s → 2s → 4s → 8s → 16s → 30s (max)
```

### 15.3 Recovery

```
TRADER servisi çökerse:
├── Pozisyonlar DB'de güvende ✓
├── Restart sonrası DB'den pozisyonları yükle
└── Kaldığı yerden devam et

SCANNER servisi çökerse:
├── Bir sonraki 5 dk döngüsünü bekle
└── Veri kaybı yok (stateless)

MONITOR servisi çökerse:
├── Pozisyonlar güncellenmez (geçici)
├── Restart sonrası catch-up yap
└── Panic sell gecikmeli olabilir ⚠️
```

### 15.4 Private Key Güvenliği

**Çift Katmanlı Şifreleme:**

```
1. AES-256-GCM ile şifrele (client tarafında)
   ↓
2. Railway Environment Variables (server tarafında)
   ↓
3. Runtime'da decrypt → Memory'de tut
   ↓
4. Asla log'lama, asla DB'ye yazma
```

**Kod Örneği:**
```typescript
// Başlangıçta
const encryptedKey = process.env.SOLANA_PRIVATE_KEY_ENCRYPTED;
const encryptionKey = process.env.ENCRYPTION_KEY;
const privateKey = decrypt(encryptedKey, encryptionKey);

// Memory'de tut
const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

// Asla log'lama
logger.info('Wallet loaded', { address: wallet.publicKey.toBase58() });
// ❌ logger.info('Key', { key: privateKey });
```

### 15.5 API Key Güvenliği

| Key | Saklama Yeri | Erişim |
|-----|--------------|--------|
| Supabase URL | Railway env | Tüm servisler |
| Supabase Key | Railway env | Tüm servisler |
| Solana Private Key | Railway env (encrypted) | Sadece Trader |
| BirdEye API Key | Railway env | Scanner, Monitor |

---

## 16. Maliyet Analizi

### 16.1 Supabase (Ücretsiz Tier)

| Özellik | Limit | Kullanım |
|---------|-------|----------|
| Database | 500 MB | ~50 MB (yeterli) |
| Realtime | 200 bağlantı | 3 bağlantı |
| API | Sınırsız | ✓ |
| Bandwidth | 5 GB/ay | ~1 GB |

**Maliyet: $0/ay** ✅

### 16.2 Railway

| Plan | Fiyat | Dahil Kredi |
|------|-------|-------------|
| Hobby | $5/ay | $5 kullanım |
| Pro | $20/ay | $20 kullanım |

**Servis Maliyetleri (Hobby):**

| Servis | RAM | CPU | Aylık |
|--------|-----|-----|-------|
| Scanner | 256MB | 0.25 vCPU | ~$2.5 |
| Trader | 256MB | 0.25 vCPU | ~$2.5 |
| Monitor | 512MB | 0.5 vCPU | ~$5 |
| **Toplam** | | | **~$10** |

**Net Maliyet:** ~$5/ay (Hobby plan kredisi dahil)

### 16.3 Toplam Aylık Maliyet

| Servis | Maliyet |
|--------|---------|
| Supabase | $0 |
| Railway | ~$5-10 |
| Solana TX fees | ~$1-5 (işlem hacmine göre) |
| **TOPLAM** | **~$6-15/ay** |

---

## 17. Değişiklik Geçmişi

| Tarih | Versiyon | Değişiklik |
|-------|----------|------------|
| 2026-02-02 | 1.0.0 | İlk TDD (Four.meme/BNB Chain) |
| 2026-02-02 | 2.0.0 | **MAJOR:** Pump.fun/Solana'ya geçiş |
| 2026-02-02 | 2.1.0 | **Backend mimarisi eklendi** |
| 2026-02-02 | 2.2.0 | **İş kuralları ve edge case'ler eklendi** |
| 2026-02-09 | 2.3.0 | **Trade Decision Audit System eklendi** |

### v2.3.0 Değişiklik Detayları

**Trade Decision Audit System (Karar Denetim Sistemi):**
- 4 yeni veritabanı tablosu: trade_decisions, trade_outcomes, weekly_reports, parameter_versions
- Karar kayıt modülü: Her BUY/SKIP/SELL kararı tüm sinyaller ve market verileriyle loglanır
- Sonuç takip modülü: PnL, çıkış nedeni, 48 saat sonrası token durumu
- Haftalık analiz motoru: Sinyal güvenilirliği, kaçırılan fırsatlar, yanıltıcı sinyaller
- Parametre optimizasyonu: Otomatik puan ayarı (güvenli sınırlar içinde) + manuel onay (tehlikeli değişiklikler)
- Parametre versiyonlama: Her değişiklik loglanır ve performans öncesi/sonrası karşılaştırılır
- Monitor service'e 5 yeni dosya: decision-recorder, outcome-tracker, weekly-analyzer, parameter-optimizer, report-generator
- Aylık deep review raporu desteği

---

### v2.2.0 Değişiklik Detayları

**İş Kuralları ve Edge Case'ler:**
- Tekrar alım kuralı (aynı token portföydeyken almama)
- Fiyat gecikmesi koruması (%30+ pump skip)
- Minimum işlem miktarı (0.1 SOL)
- Puan normalizasyonu (0-100 ölçeği)
- Portföy dolu + yüksek skorlu fırsat yönetimi
- Panic sell yedekleme (Trader'da backup kontrol)
- Hızlı take profit (tek TX kümülatif satış)
- Sosyal medya link doğrulama
- TX başarısızlık yönetimi (3 strike = 1 saat cooldown)
- Dev cüzdan tespit yaklaşımı

---

### v2.1.0 Değişiklik Detayları

**Backend Mimarisi:**
- Supabase (PostgreSQL) veritabanı eklendi
- 3 mikroservis mimarisi (Scanner, Trader, Monitor)
- Railway deployment yapılandırması
- Supabase Realtime ile servisler arası iletişim

**Veritabanı:**
- 6 tablo şeması tanımlandı (positions, trades, token_scores, blacklisted_devs, wallet_state, sell_signals, logs)
- Realtime subscriptions yapılandırması

**Güvenlik:**
- Çift katmanlı private key şifreleme
- Environment variables yönetimi
- Error handling ve recovery stratejileri

**Maliyet:**
- Detaylı maliyet analizi (~$6-15/ay)

---

### v2.0.0 Değişiklik Detayları

**Platform Değişikliği:**
- BNB Chain → Solana
- Four.meme → Pump.fun
- ethers.js → @solana/web3.js

**Yeni Algoritma:**
- 7 ön şart sistemi
- Çoklu sosyal medya kontrolü
- Website profesyonellik puanı
- Holder dağılım analizi
- Dev cüzdan geçmişi kontrolü
- Derin sosyal tarama (X.com)
- Ağırlıklı puanlama (%50 sosyal, %50 ön şart)

**Kasa Yönetimi:**
- %50 nakit koruması
- Tur bazlı %10-%25 harcama
- Puan bazlı ağırlıklı alım

**Portföy:**
- Max 40 token
- 15 dk güncelleme döngüsü
- Zayıflık skoru ile temizlik

**Çıkış Stratejileri:**
- Kademeli take profit (+50%, +100%, +200%, +500%)
- Stop loss (-10% izle, -15% sinyal, -20% sat)
- Momentum satışı (min %10 kârda)
- Panic sell (likidite %50 düşüş, dev %10 satış)
- Zaman aşımı (6 saat)

---

**Döküman Sonu**

*Bu döküman her kod değişikliğinde güncellenmelidir.*

---

## Ek A: Hızlı Referans Kartı

### Backend Mimarisi
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Railway (3 servis)
- **İletişim:** Supabase Realtime
- **Maliyet:** ~$6-15/ay

### Servisler
| Servis | Görev | Çalışma |
|--------|-------|---------|
| Scanner | Tarama, puanlama | Her 5 dk |
| Trader | Alım/satım TX | Always-on |
| Monitor | Portföy, exit | Always-on |

### Eleme Kriterleri (DİREKT ELE)
- ❌ Sosyal medya yok/inaktif
- ❌ Holder < 20
- ❌ Token > 7 gün
- ❌ Dev geçmişinde rug var

### Puanlama (1-10)
- Website profesyonelliği
- Holder dağılımı (bubble map)
- Fiyat geçmişi
- Dev cüzdan analizi

### Satış Tetikleyicileri
- 🔴 Panic: Likidite %50↓ veya Dev %10 satış
- 🔴 Stop Loss: -%20
- 📈 Take Profit: +50%, +100%, +200%, +500%
- 📉 Momentum: X %50↓ (3h) veya Alım %70↓ (30dk)
- ⏰ Timeout: 6 saat pozitif sinyal yok

### Kasa Kuralları
- %50 nakit (dokunulmaz)
- Tur başı %10-%25 harcama
- Puan bazlı ağırlıklı alım

### Veritabanı Tabloları
| Tablo | Açıklama |
|-------|----------|
| positions | Açık pozisyonlar |
| trades | İşlem geçmişi |
| token_scores | Token puanları (cache) |
| blacklisted_devs | Kara liste |
| wallet_state | Cüzdan durumu |
| sell_signals | Satış sinyalleri |
| logs | Kritik loglar |
| trade_decisions | Karar kayıtları (neden aldık/skip ettik) |
| trade_outcomes | Sonuç takibi (PnL + 48h sonrası) |
| weekly_reports | Haftalık analiz raporları |
| parameter_versions | Parametre değişiklik geçmişi |
