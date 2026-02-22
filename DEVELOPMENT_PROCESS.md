# DEVELOPMENT_PROCESS.md

> Universal build process for AI-assisted software development.
> This document lives in every Claude Project (as project knowledge) and every repo root (for Claude Code).
> It is not project-specific. It applies to every build.

---

## The Context File System

Every project maintains these files. They are the memory system that prevents context drift across AI coding sessions. Claude Code reads them before writing any code. The planning Claude references them when generating briefs.

| File | Purpose | When Updated |
|------|---------|--------------|
| `CLAUDE.md` | Primary briefing doc. Tech stack, architecture rules, current phase/session, database summary, API routes, pages, env vars. Claude Code reads this FIRST. | Every phase/session start + end |
| `CONVENTIONS.md` | Code patterns, naming rules, file structure, error handling, anti-patterns. Grows organically from actual code — never speculative. | After each phase/session |
| `CHANGELOG.md` | One paragraph per completed phase/session. What shipped and what exists. | After each phase/session |
| `SCHEMA.md` | Database schema source of truth. Every table, every column with type, every RPC function with signature, every index. Version history at bottom. | After any migration |
| `FEATURE_MAP.md` | Maps every feature to its owning files — page, API routes, components, lib modules, DB tables, and which phase built it. Organized by feature area, not by phase. | After each phase/session |
| `PHASE_HISTORY.md` | Detailed record of what each phase/session built — what exists in the codebase, key patterns established, data state. More detailed than CHANGELOG. | After each phase/session |
| Scope Doc | The master blueprint. High-level roadmap showing WHAT each phase does. NOT the build spec — phase briefs are the build spec. | Only if scope changes |
| Phase/Session Brief | The actual build spec for the current phase. Exhaustive: every API route, component, migration, prompt, edge case. Generated before building, archived after. | Created before each phase |

### Rules

- **One phase brief at a time.** Don't pre-generate future briefs.
- **CONVENTIONS.md grows from reality.** Only document patterns that actually exist in the codebase. Never speculative.
- **SCHEMA.md is always current.** After any migration, update the schema doc BEFORE writing code that depends on new tables.
- **FEATURE_MAP.md reflects what's built.** Update after each phase — never before (it should reflect reality, not plans).
- **When in doubt, check the docs.** Search project knowledge before asking the human to re-explain.

---

## Phase/Session Execution Loop

```
PLAN (in Claude planning instance)
  → Review phase spec from scope doc
  → Generate the phase brief (exhaustive build spec)
  → Cross-model audit (ChatGPT/Gemini review)
  → Apply findings, version bump the brief
  → Mark brief as READY FOR BUILD

UPDATE CONTEXT FILES
  → Update CLAUDE.md "Current Phase" section
  → Verify CONVENTIONS.md is current

BUILD (in Claude Code)
  → Claude Code reads CLAUDE.md first
  → Follow the phase brief step by step
  → Git commit after each working step
  → Test each piece before moving to the next

VERIFY
  → Check exit criteria from the phase brief
  → Test it actually works (curl for APIs, browser for UI)

CLOSE THE PHASE
  → Update CHANGELOG.md (one paragraph)
  → Update PHASE_HISTORY.md (detailed record)
  → Update CONVENTIONS.md (new patterns)
  → Update FEATURE_MAP.md (new features)
  → Update CLAUDE.md (status, routes, pages)
  → Update SCHEMA.md (if migrations were run)
  → Post-phase code audit in fresh chat
  → Return to PLAN for next phase
```

### Build Rules

1. **One phase at a time.** Never skip ahead.
2. **Git commit after every working step.** Not at the end of the phase.
3. **Update all context files between phases.** This is how you beat context drift.
4. **Claude Code reads CLAUDE.md before writing any code.** Every session.
5. **If something breaks, stop and diagnose.** Don't build on top of broken code.
6. **Post-phase code audit is non-negotiable.** Fresh chat, load the codebase, verify nothing was broken.
7. **Migrations before code.** All SQL verified in the database before writing code that depends on it.
8. **Test before moving on.** Each API route tested with curl before building UI. Each component verified before the next.

---

## Phase Brief Standards

Every phase brief must include these sections. Missing any of them means the brief isn't ready for build.

| Section | What It Contains |
|---------|-----------------|
| **Step-by-step build order** | Numbered steps with checkpoints and git commit points |
| **Complete code / file contents** | Every file, every function — ready for Claude Code to implement |
| **Migration SQL** | Complete, tested, ready for the database SQL editor |
| **Type definitions** | All TypeScript interfaces defined BEFORE lib functions that use them |
| **API contracts** | Exact request/response shapes for every route being built |
| **Exit criteria checklist** | Checkboxes for everything that must work before the phase is done |
| **Deferred items table** | Features considered but deliberately pushed to later, with rationale |
| **Decisions for the human** | Open questions requiring human judgment, surfaced explicitly |
| **Schema doc update notes** | Exactly what to add to SCHEMA.md after the phase |
| **Post-phase update protocol** | Which context files to update and what to add to each |

### Brief Quality Bar

The brief should be detailed enough that Claude Code can execute it without asking clarifying questions. If Claude Code has to guess or make assumptions, the brief wasn't detailed enough.

Reference: A well-audited phase brief runs 800–1,600+ lines and goes through 3–5 audit rounds. That's the quality bar.

---

## Cross-Model Audit Protocol

Before a phase brief is marked READY FOR BUILD, it goes through cross-model validation. This catches bugs that a single AI misses.

### Process

1. **Generate** the full brief in the planning Claude instance
2. **Audit Round 1** — Send to ChatGPT with the prompt: "You are a senior full-stack developer auditing a build spec. Find bugs, security issues, missing edge cases, race conditions, and architectural problems. Be harsh."
3. **Audit Round 2** — Send to Gemini with the same prompt (different model = different blind spots)
4. **Triage** — Classify each finding:

| Severity | Criteria | Action |
|----------|----------|--------|
| 🔴 Critical | Data loss, security holes, breaking bugs | Must fix before build |
| 🟡 Important | Logic errors, edge cases, missing validation | Should fix before build |
| 🟢 Minor | Type improvements, naming, polish | Fix if easy |
| Dismissed | Not applicable or out of scope | Document rationale |

5. **Apply** — Update the brief with fixes, bump version (v1.0 → v1.1)
6. **Document** — Add the audit findings table to the brief itself

### Audit Findings Table Format

```markdown
| # | Severity | Found By | Finding | Fix Applied |
|---|----------|----------|---------|-------------|
| A | 🔴 | ChatGPT | Description of the bug | What was changed |
| B | 🟡 | Gemini | Description of the issue | What was changed |

**Dismissed findings:**
- Finding X: Reason it was dismissed
```

---

## Schema Document Standards

The schema doc (SCHEMA.md or project-specific name) is the single source of truth for the data model. It must contain:

1. **Table inventory** — Every table with purpose, column count
2. **Column details** — Every column: name, type, nullable, default, description
3. **RPC functions** — Every database function: name, parameters with types, return type, what it does
4. **Indexes** — Name, table, columns, type (btree, ivfflat, etc.)
5. **Storage buckets** — If applicable
6. **Constraints** — CHECK constraints, UNIQUE constraints, foreign keys
7. **Triggers** — What fires, when, what it does
8. **Version history** — Table at the bottom tracking every schema change with date

### Update Protocol

After any migration:
1. Run the migration in the database
2. Verify it worked (check tables, columns, functions)
3. Update SCHEMA.md BEFORE writing any code that depends on the new schema
4. Increment the version in the version history table

---

## Feature Map Standards

FEATURE_MAP.md maps every feature to its owning files. This prevents "where does X live?" questions during builds.

### Entry Format

```markdown
### Feature Name
- **Description:** What it does (one sentence)
- **Page:** Route path (or "None — API only")
- **API Routes:** List with methods and purposes
- **Components:** File paths
- **Lib Modules:** File paths
- **DB Tables:** Which tables it reads/writes
- **Phase:** Which phase built it (and modified it, if applicable)
```

### Organization

Organize by feature area (Authentication, Dashboard, Pipeline, etc.) — NOT by phase. When a feature is modified in a later phase, update its entry and note the modification.

---

## Deferred Items Protocol

Every phase brief maintains a deferred items table. This is the scope creep firewall.

| Column | Purpose |
|--------|---------|
| Feature | What was considered |
| Deferred To | Which future phase/release |
| Reason | Why it's not being built now |

### Rules

- If it's not in the phase brief, it doesn't get built.
- If Claude Code starts building something not in the brief, stop immediately.
- Deferred items can be promoted to a future phase brief — but only during the PLAN step, never during BUILD.

---

## Post-Phase Protocol (Checklist)

After completing each phase, update these documents in order:

- [ ] **CHANGELOG.md** — Add one paragraph: what shipped, what exists
- [ ] **PHASE_HISTORY.md** — Add detailed record: what was built, what files exist, key patterns established, data state
- [ ] **CONVENTIONS.md** — Add any new patterns that emerged (naming, error handling, component patterns, etc.)
- [ ] **FEATURE_MAP.md** — Add entries for every new feature, update entries for modified features
- [ ] **CLAUDE.md** — Update current phase status, add new routes/pages/env vars
- [ ] **SCHEMA.md** — Update if any migrations were run (should already be done per migration protocol)
- [ ] **Post-phase code audit** — Open a fresh AI chat, load the codebase, verify nothing is broken or inconsistent

Only after ALL of these are complete do you start planning the next phase.

---

## The Two-Brain Model

Two separate AI instances serve different purposes:

| Instance | Role | What It Does |
|----------|------|-------------|
| **Planning Claude** | Strategist | Generates phase briefs, makes architecture decisions, audits specs, thinks through tradeoffs |
| **Claude Code** | Builder | Reads CLAUDE.md, follows the phase brief step by step, writes code, commits to git |

### Rules

- Planning happens in the Claude Project chat. Building happens in Claude Code in the terminal.
- The phase brief is the handoff document between the two.
- Fresh Claude Code sessions for different types of work (avoid context pollution).
- If Claude Code needs to make an architecture decision not covered by the brief, STOP and ask — don't let it improvise.

---

## When the AI Is Uncertain

If uncertain about implementation details (function signatures, return types, state management patterns, file contents, or existing code patterns), the AI should:

1. **Check context files first** — CLAUDE.md, CONVENTIONS.md, SCHEMA.md, FEATURE_MAP.md
2. **Search project knowledge** — The answer may already exist
3. **Ask for a Claude Code query** — Frame it as a copy-pasteable prompt the human can drop into Claude Code and screenshot back

Never guess. Never assume. Check the docs or ask.
