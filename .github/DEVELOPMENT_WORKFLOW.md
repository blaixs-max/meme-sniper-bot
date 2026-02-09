# Development Workflow

Bu dosya, Pump.fun bot geliştirme sürecindeki iş akışını tanımlar.

---

## 📋 Her Work Session Başında

1. **PROGRESS_LOG.md** dosyasını oku
   - Son durumu gör
   - Blocker'ları kontrol et
   - Bugünkü hedefi belirle

2. **Todo listesini** kontrol et
   - Hangi task'lar pending?
   - Hangi task in_progress?
   - Priorileleri gözden geçir

3. **IMPLEMENTATION_PLAN.md** ile senkronize ol
   - Hangi phase'deyiz?
   - Phase için ne kaldı?

---

## 💻 Geliştirme Sırasında

### Kod Yazarken
1. **Her önemli task için:**
   - Todo'yu `in_progress` yap
   - Kod yaz
   - Test et
   - Todo'yu `completed` yap

2. **Her commit öncesi:**
   - Değişiklikleri PROGRESS_LOG.md'ye not et
   - Commit message anlamlı olsun

3. **Yeni bir decision/blocker olduğunda:**
   - PROGRESS_LOG.md'ye kaydet
   - İlgili kişiye bildir (user/team)

### Code Review Checklist
- [ ] TypeScript strict mode uyumlu?
- [ ] Error handling var mı?
- [ ] Logger kullanılıyor mu?
- [ ] Environment variables güvenli mi?
- [ ] Sensitive data log'lanmıyor mu?

---

## 📝 Her Work Session Sonunda

### Dokümantasyon Güncelleme (5-10 dakika)

1. **PROGRESS_LOG.md güncelle:**
   ```markdown
   ### YYYY-MM-DD - Day X: Kısa Başlık

   #### ✅ Completed
   - [x] Yapılan task 1
   - [x] Yapılan task 2

   #### 🔄 In Progress
   - [ ] Yarım kalan task

   #### 📝 Notes
   - Önemli notlar
   - Karşılaşılan sorunlar

   #### 🎯 Next Steps
   - Yarın yapılacaklar
   ```

2. **IMPLEMENTATION_PLAN.md güncelle (gerekirse):**
   - Phase status değişti mi? (🔵 → 🟡 → 🟢)
   - Progress % güncelle
   - ETA değişti mi?
   - Yeni task ekle/çıkar

3. **Todo listesini temizle:**
   - Completed olanları kontrol et
   - Stale olanları kaldır
   - Yarınki task'ları ekle

---

## 🎯 Phase Tamamlandığında

### Phase Completion Checklist

- [ ] **Code:**
  - [ ] Tüm planlanan features tamamlandı
  - [ ] Unit testler yazıldı
  - [ ] Integration testler çalışıyor
  - [ ] Linting hatasız
  - [ ] TypeScript build başarılı

- [ ] **Dokümantasyon:**
  - [ ] README güncellendi
  - [ ] PROGRESS_LOG.md'ye phase summary yazıldı
  - [ ] IMPLEMENTATION_PLAN.md'de phase 🟢 Complete yapıldı
  - [ ] Varsa API dokümantasyonu oluşturuldu

- [ ] **Git:**
  - [ ] Tüm değişiklikler commit edildi
  - [ ] Descriptive commit messages
  - [ ] Branch merged (eğer feature branch kullanılıyorsa)

- [ ] **Review:**
  - [ ] User'a demo/update verildi
  - [ ] Feedback toplandı
  - [ ] Next phase için plan onaylandı

---

## 🚨 Blocker ile Karşılaşıldığında

### İşlem Adımları:

1. **PROGRESS_LOG.md'ye blocker ekle:**
   ```markdown
   ### Blocker #X: Kısa Başlık
   - **Severity:** 🔴 Critical / 🟡 Medium / 🟢 Low
   - **Description:** Detaylı açıklama
   - **Impact:** Neyi engelliyor?
   - **Resolution Options:** Olası çözümler
   - **Status:** 🔍 Investigating / ⏳ Waiting / 🔧 In Progress
   - **Created:** YYYY-MM-DD
   ```

2. **User'ı bilgilendir** (eğer user input gerekliyse)

3. **Alternatif task'a geç** (eğer varsa)

4. **Blocker çözüldüğünde:**
   - Status'u ✅ Resolved yap
   - Resolution detayını yaz
   - İlgili task'a geri dön

---

## 📊 Weekly Review (Haftalık)

Her Pazar veya Pazartesi:

1. **Progress Review:**
   - Bu hafta ne yapıldı?
   - Target'a göre neredeyiz?
   - Velocity nasıl? (planlanan vs gerçekleşen)

2. **Plan Adjustment:**
   - Timeline'ı güncelle gerekirse
   - Priority'leri yeniden değerlendir
   - Scope'ta değişiklik var mı?

3. **Dokümantasyon:**
   - PROGRESS_LOG.md'de haftalık summary yaz
   - IMPLEMENTATION_PLAN.md'yi güncelle

---

## 🔧 Development Commands

### Daily Commands
```bash
# Başlangıç
git pull
npm install  # eğer dependencies güncellendiyse

# Development
npm run dev

# Testing
npm run test
npm run lint

# Build
npm run build

# Bitiş
git add .
git commit -m "feat: descriptive message"
git push
```

### Documentation Update
```bash
# Progress log güncelle
nano docs/PROGRESS_LOG.md

# Implementation plan güncelle
nano docs/IMPLEMENTATION_PLAN.md

# Commit
git add docs/
git commit -m "docs: update progress log"
git push
```

---

## 📁 File Organization

```
docs/
├── TECHNICAL_DESIGN_DOCUMENT.md  # Master spec (rarely changes)
├── IMPLEMENTATION_PLAN.md        # 8-phase roadmap (updated per phase)
├── PROGRESS_LOG.md               # Daily log (updated daily)
└── .github/
    └── DEVELOPMENT_WORKFLOW.md   # This file (workflow guide)
```

---

## ✅ Definition of Done

### Task Level
- [ ] Code yazıldı ve çalışıyor
- [ ] Test yazıldı (varsa)
- [ ] Code review yapıldı (varsa reviewer)
- [ ] Dokümante edildi
- [ ] Commit edildi

### Feature Level
- [ ] Tüm task'lar complete
- [ ] Integration test'ler geçti
- [ ] User'a demo verildi
- [ ] Dokümantasyon tamamlandı

### Phase Level
- [ ] Tüm features tamamlandı
- [ ] Phase checklist dolduruldu
- [ ] User approval alındı
- [ ] Next phase için hazır

---

## 🎓 Best Practices

### Commit Messages
```
feat: add Solana wallet connection
fix: resolve price calculation bug
docs: update progress log for day 3
refactor: extract common validation logic
test: add unit tests for scanner service
chore: update dependencies
```

### Branch Strategy (eğer kullanılırsa)
```
main                    # Production-ready code
├── develop            # Integration branch
├── feature/scanner    # Feature branches
├── feature/trader
└── hotfix/critical-bug
```

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Meaningful variable names
- Comments for complex logic only
- Error handling her zaman

---

**Reminder:** Bu workflow'u takip etmek, projenin sağlıklı ilerlemesini garanti eder. Her gün 5-10 dakika dokümantasyon güncellemesi, ileride saatlerce zaman kazandırır!
