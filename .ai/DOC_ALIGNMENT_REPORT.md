# Documentation Alignment Report

> Generated: 2026-02-06
> Status: Issues Found - Requires Updates

---

## Summary

| Document | Status | Issues |
|----------|--------|--------|
| ARCHITECTURE.md | ⚠️ OUTDATED | Missing packages/core structure, policy engine location |
| DATA_MODEL.md | ❌ MISALIGNED | Missing tables, wrong field names, missing models |
| WORKFLOW_STATE_MACHINE.md | ❌ MISALIGNED | Extra states not in code, missing states from code |
| API_CONTRACT.md | ⚠️ INCOMPLETE | Missing endpoints, inconsistent with frontend |
| FRONTEND_SPEC.md | ⚠️ INCONSISTENT | Conflicting tech choices (Zustand vs Context) |
| GATES.md | ✅ ALIGNED | Matches implementation |
| POLICY_ENGINE.md | ✅ ALIGNED | Matches implementation |
| SECURITY_MODEL.md | ✅ ALIGNED | Consistent with implementation |
| REQUIREMENTS.md | ✅ ALIGNED | High-level, still accurate |
| CONSTRAINTS.md | ✅ ALIGNED | High-level, still accurate |
| PROOF_LEDGER.md | ⚠️ OUTDATED | References non-existent tables |

---

## Detailed Issues

### 1. DATA_MODEL.md vs prisma/schema.prisma

**Missing from Prisma (documented but not implemented):**
```
- repos table (owner, name, default_branch, installation_id)
- gate_results table (run_id, gate_name, pass, evidence)
- ci_runs table (workflow_id, pr_id, provider, check_suite_id, status, conclusion, url)
```

**Missing from Workflow model:**
```prisma
// DATA_MODEL.md says these should exist:
repo_id       String?
source_type   String?   // "issue" | "ui" | "api"
source_issue_number Int?
title         String?
base_ref      String?   // branch name, not just SHA
```

**Field name mismatches:**
| DATA_MODEL.md | Prisma Schema | Fix |
|---------------|---------------|-----|
| context_hash | inputHash | Rename to contextHash |
| content_sha | contentSha | ✅ OK (just case) |
| patch_set_id | patchSetId | ✅ OK (just case) |

**PolicyViolation differences:**
```
DATA_MODEL.md: scope(artifact/patch/github_action), entity_id, rule_id, details(json)
Prisma:        patchSetId, rule, file, line, evidence(string)
```

---

### 2. WORKFLOW_STATE_MACHINE.md vs packages/core/src/workflow/states.ts

**States in docs but NOT in code:**
```
TRIAGE_DONE
DESIGN_DONE
SCOPE_FROZEN
```

**States in code but NOT in docs:**
```
(none - code is subset of docs)
```

**Recommendation:** Either:
- A) Remove TRIAGE_DONE, DESIGN_DONE, SCOPE_FROZEN from docs (simpler MVP)
- B) Add these states to code for full triage flow

**Current code states:**
```typescript
'INGESTED' | 'PATCHES_PROPOSED' | 'WAITING_USER_APPROVAL' |
'APPLYING_PATCHES' | 'PR_OPEN' | 'VERIFYING_CI' |
'DONE' | 'NEEDS_HUMAN' | 'BLOCKED_POLICY' | 'FAILED'
```

---

### 3. API_CONTRACT.md vs Frontend

**Endpoints in docs but NOT in frontend API client:**
```
POST /api/workflows/:id/actions/cancel
```

**Endpoints in frontend but NOT in docs:**
```
POST /api/workflows/:id/actions/reject_patch_set
GET /api/health
GET /api/workflows (with pagination: limit, cursor, status params)
```

**Endpoint differences:**
| Docs | Frontend | Resolution |
|------|----------|------------|
| `/actions/request_changes` | `/actions/request_changes` | ✅ Match |
| (missing) | `/actions/reject_patch_set` | Add to docs |
| `/actions/cancel` | (missing) | Add to frontend |

---

### 4. FRONTEND_SPEC.md Internal Inconsistencies

**Tech stack conflicts:**
```
Line 11: State = "useState + Context"
Line 71: stores/app-store.ts = "Zustand store"
```
→ Pick one: Remove Zustand reference OR update tech stack

**File structure conflicts:**
```
Line 62-64: lib/api.ts, lib/sse.ts, lib/utils.ts
Line 32:    src/api/client.ts
```
→ Consolidate to single location (recommend `src/api/client.ts`)

**Real-time conflicts:**
```
Line 13: Real-time = "Polling (3-5s)"
Line 63: lib/sse.ts = "SSE connection"
```
→ Already updated to polling with SSE as future enhancement ✅

---

### 5. ARCHITECTURE.md Missing Updates

**Current structure not documented:**
```
packages/
├── core/
│   └── src/
│       ├── workflow/      # transition.ts, states.ts
│       ├── policy/        # policy-engine.ts, diff-parser.ts, gate2.ts
│       └── audit/         # run-recorder.ts, context-hash.ts
├── db/                    # (future)
```

**Missing components:**
- Policy engine location
- Gate2 implementation
- Transition engine
- Proof ledger (RunRecorder)

---

### 6. PROOF_LEDGER.md vs Implementation

**References non-existent table:**
```
gate_results table - NOT in Prisma schema
```

**Field name mismatch:**
```
Docs:   context_hash
Prisma: inputHash (in WorkflowRun)
```

---

## Action Items

### Critical (Blocking)
1. [ ] Update DATA_MODEL.md to match Prisma schema OR add missing tables to Prisma
2. [ ] Sync WORKFLOW_STATE_MACHINE.md with states.ts

### Important (Should Fix)
3. [ ] Update API_CONTRACT.md with all endpoints
4. [ ] Fix FRONTEND_SPEC.md internal conflicts
5. [ ] Update ARCHITECTURE.md with packages/core structure

### Minor (Nice to Have)
6. [ ] Standardize field naming (contextHash vs inputHash)
7. [ ] Update PROOF_LEDGER.md terminology

---

## Recommended Approach

**Option A: Docs Follow Code (Recommended for MVP)**
- Simplify docs to match current implementation
- Remove unimplemented features from docs
- Add "Future" sections for planned features

**Option B: Code Follows Docs**
- Add all documented tables/fields to Prisma
- Add all documented states to transition engine
- More work but more complete

---

## Files to Update

```bash
# Priority 1 - Schema alignment
.ai/DATA_MODEL.md
.ai/WORKFLOW_STATE_MACHINE.md

# Priority 2 - API/Frontend alignment
.ai/API_CONTRACT.md
.ai/FRONTEND_SPEC.md

# Priority 3 - Architecture updates
.ai/ARCHITECTURE.md
.ai/PROOF_LEDGER.md
```
