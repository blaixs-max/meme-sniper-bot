# Working Rules - Pump.fun Bot Development

**Effective Date:** 2026-02-04
**Status:** Active
**Mandatory Compliance:** Yes

Bu kurallar, projenin tüm geliştirme sürecinde **zorunlu** olarak uygulanacaktır.

---

## 🗣️ 0. İletişim Dili

### Türkçe Zorunluluğu

**KURAL:** Tüm iletişim Türkçe olmalıdır.

- ✅ **Her zaman Türkçe konuş**
  - Açıklamalar Türkçe
  - Kod yorumları Türkçe
  - Documentation Türkçe
  - Commit message'ları Türkçe

- ✅ **İstisnalar:**
  - Kod (JavaScript/TypeScript) İngilizce (variable names, function names)
  - Technical terimler (API, REST, JSON, etc.)
  - External library/framework isimleri
  - Log messages (production için İngilizce daha iyi)

---

## 🎯 1. Plan Mode Default

### Ne Zaman Plan Mode Kullanılır?

**Plan Mode'a geçilmesi ZORUNLU durumlar:**

1. ✅ **Non-trivial tasks**
   - 3+ adım gerektiren taskler
   - Architectural kararlar
   - Yeni servis/modül ekleme
   - Veritabanı şeması değişiklikleri
   - API entegrasyonları

2. ✅ **Verification için**
   - Sadece building için değil
   - Code review süreçlerinde
   - Integration testing planlamasında
   - Deployment checklist hazırlarken

3. ✅ **Specification yazımında**
   - Detaylı spec'ler **önden** yazılmalı
   - Belirsizlikler varsa user ile tartışılmalı
   - Ambiguity'leri **önlemek** için detaylı plan

### Plan Mode Workflow:

```
1. Task alındı
   ↓
2. Non-trivial mi? (3+ adım / architectural?)
   ↓ (YES)
3. EnterPlanMode kullan
   ↓
4. Detaylı spec yaz (tasks/todo.md)
   ↓
5. User ile confirm et (gerekirse)
   ↓
6. Implementation'a başla
```

---

## 🔄 2. Self-Improvement Loop

### Sürekli Öğrenme Sistemi

**Her correction bir öğrenme fırsatıdır!**

#### 2.1 Correction Geldiğinde:

1. ✅ **tasks/lessons.md** dosyasına yaz
   - Specific pattern kullan (aşağıda)
   - Ne yanlış yapıldı?
   - Doğrusu ne olmalıydı?
   - Bundan ne öğrendik?

2. ✅ **Kendi kurallarını üret**
   - "Bir daha asla X yapma"
   - "Her zaman Y kontrol et"
   - "Z durumunda şunu yap"

3. ✅ **Her session başında lessons.md oku**
   - Geçmiş hataları hatırla
   - Aynı hatayı tekrarlama
   - Sürekli gelişim

#### Lesson Entry Format:

```markdown
### Lesson #X: Kısa Başlık
**Date:** YYYY-MM-DD
**Context:** Ne yapıyorduk?
**Mistake:** Ne yanlış gitti?
**Correction:** User ne düzeltti?
**Root Cause:** Neden oldu?
**Rule Created:** Bundan sonra ne yapacağız?
**Tags:** #category #importance

---
```

---

## ✅ 3. Verification Before Done

### Hiçbir Task Doğrulanmadan Complete İşaretlenmez!

**ZORUNLU verification steps:**

#### 3.1 Kendi Kendine Sor:

- ❓ "Bunu bir developer onaylar mı?"
- ❓ "Production'a çıksa sorun çıkar mı?"
- ❓ "Test yazdım mı?"
- ❓ "Edge case'leri düşündüm mü?"

#### 3.2 Verification Checklist:

```markdown
- [ ] Kod çalışıyor mu? (manuel test)
- [ ] Tests passing mi? (npm test)
- [ ] Linting hatasız mı? (npm run lint)
- [ ] Build başarılı mı? (npm run build)
- [ ] Logs kontrol edildi mi?
- [ ] Error scenarios test edildi mi?
- [ ] Documentation güncellendi mi?
```

#### 3.3 Sadece Hepsi ✅ ise:

→ Task'ı **completed** işaretle
→ **tasks/todo.md** güncelle
→ **PROGRESS_LOG.md** güncelle

---

## 📋 4. Task Management (7 Adımlı Süreç)

### 4.1 Plan First

**Her task için tasks/todo.md dosyasına yaz:**

```markdown
## Task: [Task Başlığı]
**Phase:** X
**Priority:** High/Medium/Low
**Status:** 🔵 Not Started

### Checklist:
- [ ] Step 1: Detaylı açıklama
- [ ] Step 2: Detaylı açıklama
- [ ] Step 3: Detaylı açıklama

### Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2

### Verification:
- [ ] Test 1 passes
- [ ] Test 2 passes
```

### 4.2 Verify Plan

**İmplementasyona başlamadan önce:**

- ✅ Plan complete mi?
- ✅ Tüm adımlar net mi?
- ✅ Dependencies belirlendi mi?
- ✅ User onayı gerekli mi?

### 4.3 Track Progress

**Her adımda tasks/todo.md güncelle:**

```markdown
### Progress Log:
- [x] Step 1: Detaylı açıklama ✅ (2026-02-04 14:30)
- [x] Step 2: Detaylı açıklama ✅ (2026-02-04 15:00)
- [ ] Step 3: Detaylı açıklama (in progress)
```

### 4.4 Explain Changes

**Her önemli adım için high-level summary:**

```markdown
### Change Summary:
**What Changed:**
- Added X module
- Refactored Y function
- Fixed Z bug

**Why:**
- To improve performance
- To fix issue #123

**Impact:**
- Breaks backward compatibility? No
- Requires migration? No
- Dependencies updated? Yes
```

### 4.5 Document Result

**Task bittiğinde tasks/todo.md'ye review ekle:**

```markdown
### Review:
**Completed:** 2026-02-04
**Duration:** 3 hours
**Outcome:** ✅ Success / ⚠️ Partial / ❌ Failed
**What Worked:**
- X worked well
**What Didn't:**
- Y had issues
**Lessons:**
- Link to lessons.md entry
```

### 4.6 Capture Lessons

**Her değişiklikle tasks/lessons.md güncelle:**

- User correction → Lesson entry
- Unexpected bug → Lesson entry
- Better approach bulundu → Lesson entry
- Time wasted → Lesson entry (why?)

### 4.7 Document Research

**İnternet araştırmaları → tasks/research.md**

#### Research Entry Format:

```markdown
### Research #X: [Topic]
**Date:** YYYY-MM-DD
**Question:** What we needed to know?
**Sources:** Links to docs/articles
**Findings:**
- Key finding 1
- Key finding 2
**Conclusion:** Summary
**Applied:** Where we used this
**Status:** ✅ Valid / ⚠️ Outdated / ❌ Wrong

---
```

#### Research Management:

- ✅ **Geliştirirken bu dosyayı oku**
  - Aynı araştırmayı tekrarlama
  - Önceki bulguları kullan

- ✅ **Öğrendiklerimiz internet ile örtüşmüyorsa:**
  ```markdown
  **Status Update:** ⚠️ No longer valid as of YYYY-MM-DD
  **Reason:** Actual implementation differs / API changed / Better method found
  **New Approach:** Link to new research entry
  ```

---

## 📊 Compliance Tracking

### Daily Checklist:

Her work session sonunda kontrol et:

- [ ] Bugünkü taskler **tasks/todo.md**'de tracked mi?
- [ ] Tamamlananlar **verified** mi?
- [ ] Lesson varsa **tasks/lessons.md**'ye yazıldı mı?
- [ ] Research varsa **tasks/research.md**'ye yazıldı mı?
- [ ] **PROGRESS_LOG.md** güncellendi mi?
- [ ] **docs/SESSIONS.md** güncellendi mi? 🆕

### Session End Checklist:

Her work session bittiğinde:

- [ ] **docs/SESSIONS.md**'ye session log yaz
  - Completed tasks
  - Decisions made
  - Conversations summary
  - Blockers encountered
  - Next session goals
- [ ] Session metrics kaydet
- [ ] Handoff notes yaz (next session için)

### Weekly Review:

Her hafta kontrol et:

- [ ] Tüm completed taskler verify edildi mi?
- [ ] Lessons review edildi mi?
- [ ] Research entries güncel mi?
- [ ] Rules'a uyuluyor mu?

---

## 🚨 Rule Violations

### Ne Olur İhlal Edilirse?

1. **Immediate Stop** 🛑
   - Rule ihlal edildiği fark edildiğinde dur
   - Geri dön, doğru yap

2. **Document Violation** 📝
   - **tasks/lessons.md**'ye yaz
   - Neden ihlal edildi?
   - Nasıl önlenebilirdi?

3. **Fix Process** 🔧
   - Süreci düzelt
   - Rule'u güncelle gerekirse
   - User'ı bilgilendir

---

## 📚 File Structure

```
/workspaces/meme-sniper-bot/
├── WORKING_RULES.md          # Bu dosya (rules)
├── tasks/
│   ├── todo.md               # Task tracking
│   ├── lessons.md            # Lessons learned
│   └── research.md           # Research notes
├── docs/
│   ├── PROGRESS_LOG.md       # Daily progress
│   ├── IMPLEMENTATION_PLAN.md # Master plan
│   └── TECHNICAL_DESIGN_DOCUMENT.md
└── .github/
    └── DEVELOPMENT_WORKFLOW.md
```

---

## 🎯 Success Metrics

### Bu kurallara uyulduğunda:

- ✅ **0 repeated mistakes**
- ✅ **0 incomplete tasks marked as done**
- ✅ **0 wasted research time**
- ✅ **100% traceability** (her değişiklik documented)
- ✅ **Continuous improvement** (her lesson bir improvement)

---

## 🔄 Rule Updates

Bu kurallar **living document**.

**Update Trigger:**
- User yeni kural ekler
- Süreç iyileştirmesi gerekir
- Lesson'dan yeni pattern çıkar

**Update Process:**
1. Değişikliği **WORKING_RULES.md**'ye yaz
2. **PROGRESS_LOG.md**'de announce et
3. User'a confirm ettir

---

**Version:** 1.0
**Last Updated:** 2026-02-04
**Next Review:** After Phase 1 completion

---

## 💡 Remember

> **"Hız > Doğruluk" değil, "Doğruluk = Hız"**
>
> İlk seferde doğru yapmak, sonra düzeltmekten her zaman daha hızlıdır.

**Bu kurallar bizim kılavuzumuz. Her zaman takip edilmelidir!** 🎯
