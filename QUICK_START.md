# Quick Start Guide - Session Resume

**Purpose:** Hızlı bir şekilde çalışmaya başlamak için
**Time:** 2-3 dakika

---

## 🚀 Yeni Session Başlarken (2 dakika)

### 1. Context Loading (60 saniye)
```bash
# Bu 3 dosyayı oku:
1. docs/SESSIONS.md (son session)        # 30 sn
2. PROGRESS_LOG.md (current status)      # 15 sn
3. tasks/todo.md (pending tasks)         # 15 sn
```

### 2. Quick Status Check (30 saniye)
```
❓ Hangi phase'deyiz?          → tasks/todo.md (Line 4)
❓ Ne yapıyoruz?                → SESSIONS.md (Last session goals)
❓ Blocker var mı?              → PROGRESS_LOG.md (Blockers section)
❓ User'dan ne bekliyoruz?      → tasks/todo.md (Task #002)
```

### 3. Ready to Work (30 saniye)
```
✅ Context loaded
✅ Current status belli
✅ Next steps hazır
→ Başla!
```

---

## 📋 Current Project Status (One-Liner)

**Update this daily:**

```
📍 Phase: Pre-Phase 1
🎯 Current: Waiting for user prerequisites
✅ Last Done: Pump.fun API research complete
🔜 Next: Start Phase 1 when ready
🚧 Blocker: User prerequisites (Supabase, wallet, etc.)
```

---

## 🎯 What's Next? (Decision Tree)

```
START HERE
    ↓
User prerequisites ready?
    ↓
YES → Start Phase 1 (Project Setup)
    ├─ Create monorepo structure
    ├─ Install dependencies
    └─ Set up Supabase
    ↓
NO → What's missing?
    ├─ Supabase → Help user set up
    ├─ Wallet → Ask for status
    ├─ Budget → Confirm Railway OK
    └─ API keys → List what's needed
```

---

## 📂 Essential Files (Must Read)

| File | When | Why |
|------|------|-----|
| **docs/SESSIONS.md** | Every session start | Full context |
| **tasks/todo.md** | Before any work | Current tasks |
| **PROGRESS_LOG.md** | Daily | Status updates |
| **WORKING_RULES.md** | First read, then reference | Rules |
| **tasks/research.md** | Before researching | Avoid duplicate work |
| **tasks/lessons.md** | Before coding | Learn from mistakes |

---

## ⚡ Speed Commands

### Check Status
```bash
# What phase are we in?
head -5 tasks/todo.md

# Any blockers?
grep "Blocker" docs/PROGRESS_LOG.md

# Last session summary?
head -50 docs/SESSIONS.md
```

### Update Progress
```bash
# Mark task complete
# Edit tasks/todo.md → Status: ✅ Complete

# Log progress
# Edit PROGRESS_LOG.md → Add to daily log

# Add lesson
# Edit tasks/lessons.md → New lesson entry
```

---

## 🔄 Common Scenarios

### Scenario 1: User Returns with Prerequisites
```
1. Read Task #002 in tasks/todo.md
2. Check off completed prerequisites
3. If all done → Start Phase 1
4. Update PROGRESS_LOG.md
```

### Scenario 2: User Has Question
```
1. Check docs/SESSIONS.md for previous discussions
2. Check tasks/research.md for technical answers
3. Answer with reference to documented decisions
```

### Scenario 3: Need to Make Technical Decision
```
1. Check WORKING_RULES.md → Plan Mode required?
2. Research if needed → Document in tasks/research.md
3. Discuss with user
4. Document in PROGRESS_LOG.md → Technical Decisions
5. Update IMPLEMENTATION_PLAN.md if scope changes
```

### Scenario 4: Error/Blocker Encountered
```
1. Document in PROGRESS_LOG.md → Blockers section
2. Add to tasks/lessons.md if it's a mistake
3. Research solution → tasks/research.md
4. Communicate to user
5. Update tasks/todo.md status
```

---

## 📊 One-Glance Dashboard

```
PROJECT: Pump.fun Trading Bot
PHASE: Pre-Phase 1 (Planning Complete, Waiting Prerequisites)
PROGRESS: ██░░░░░░░░ 10%

COMPLETED:
├─ ✅ Planning & Documentation System
├─ ✅ API Research (Pump.fun)
└─ ✅ Working Rules Established

IN PROGRESS:
└─ 🟡 User Prerequisites (Supabase, Wallet, etc.)

NEXT UP:
├─ 🔜 Phase 1: Project Setup
├─ 🔜 Monorepo Structure
└─ 🔜 Supabase Database

BLOCKERS:
└─ ⏳ Waiting for user account setups

RISKS:
├─ None currently
└─ All major unknowns resolved

DECISIONS PENDING:
└─ None (all decided)
```

---

## 🎓 Remember

**Before ANY work:**
- [ ] Read last session summary
- [ ] Check WORKING_RULES.md
- [ ] Review pending tasks
- [ ] Check for blockers

**After ANY work:**
- [ ] Update task status
- [ ] Log progress
- [ ] Document decisions
- [ ] Prepare handoff

---

## 💡 Pro Tips

1. **Always start with docs/SESSIONS.md** - It has everything
2. **Update as you go** - Don't wait until end
3. **When in doubt, check WORKING_RULES.md**
4. **Use CTRL+F** to find things quickly
5. **Update "Current Project Status" above daily**

---

**Last Updated:** 2026-02-04
**Next Update:** Start of next session
