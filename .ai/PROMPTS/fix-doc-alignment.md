# Fix Documentation Alignment Prompt

> Use this prompt to fix all documentation alignment issues.
> This is the action prompt - run AFTER the check prompt identifies issues.

---

## Prompt for Ralph

```
You are updating the arch-orchestrator documentation to match the current implementation.

## Context
- Read `.ai/DOC_ALIGNMENT_REPORT.md` for the list of issues
- The Prisma schema is the source of truth for data models
- The TypeScript code is the source of truth for states, types, and API
- Documentation should reflect what IS implemented, not what WILL BE implemented
- Future features should be in a "## Future" section, not mixed with current features

## Task: Fix All Misaligned Documents

### 1. Fix DATA_MODEL.md

Read `prisma/schema.prisma` and update `.ai/DATA_MODEL.md` to match exactly:

- Remove tables that don't exist in Prisma: `repos`, `gate_results`, `ci_runs`
- Add models that exist in Prisma but not in docs
- Match field names exactly (use camelCase to match Prisma)
- Add a "## Future Tables" section for planned but not implemented tables
- Format as:

```markdown
## Tables (Implemented)

### Workflow
```prisma
model Workflow {
  id        String   @id
  state     String
  ...
}
```

Fields:
- id: UUID, primary key
- state: WorkflowState enum value
- ...
```

### 2. Fix WORKFLOW_STATE_MACHINE.md

Read `packages/core/src/workflow/states.ts` and update:

- List ONLY states that exist in code
- Move TRIAGE_DONE, DESIGN_DONE, SCOPE_FROZEN to "## Future States" section
- Update the flow diagram to match actual transitions
- Verify against `transition.ts` for allowed transitions

Current states in code:
```
INGESTED → PATCHES_PROPOSED → WAITING_USER_APPROVAL →
APPLYING_PATCHES → PR_OPEN → VERIFYING_CI → DONE

Error states: NEEDS_HUMAN, BLOCKED_POLICY, FAILED
```

### 3. Fix API_CONTRACT.md

Scan `apps/api/src/**/*.controller.ts` and update:

- Add all implemented endpoints
- Remove endpoints not yet implemented
- Add request/response schemas
- Match the frontend API client in `apps/web/src/api/client.ts`

Required format:
```markdown
### Endpoint Name
`METHOD /api/path`

**Request:**
```json
{ "field": "type" }
```

**Response:**
```json
{ "field": "type" }
```

**Status:** Implemented | Planned
```

### 4. Fix FRONTEND_SPEC.md

Resolve internal conflicts:
- Remove Zustand references (use useState + Context as stated)
- Consolidate file structure (use `src/api/client.ts`, remove `lib/`)
- Ensure tech stack section matches actual dependencies
- Remove SSE references (polling for MVP)

### 5. Fix ARCHITECTURE.md

Add current package structure:
```
packages/
├── core/
│   └── src/
│       ├── workflow/      # Transition engine, states
│       │   ├── states.ts
│       │   └── transition.ts
│       ├── policy/        # Policy engine, gates
│       │   ├── policy-engine.ts
│       │   ├── diff-parser.ts
│       │   ├── gate2.ts
│       │   └── index.ts
│       └── audit/         # Proof ledger
│           ├── run-recorder.ts
│           └── context-hash.ts
```

### 6. Fix PROOF_LEDGER.md

- Change `gate_results` to reference `WorkflowRun` table
- Change `context_hash` to `inputHash` to match Prisma
- Clarify that gate results are stored in WorkflowRun.outputs

## Output Requirements

For each file you update:
1. Show the exact changes made
2. Verify the change matches the source of truth
3. Keep existing accurate content
4. Add "Last Updated: YYYY-MM-DD" at the top

## Verification

After updates, run:
```bash
# Verify no broken references
grep -r "gate_results" .ai/*.md   # Should return nothing
grep -r "context_hash" .ai/*.md   # Should return nothing (use inputHash)
grep -r "TRIAGE_DONE" .ai/*.md    # Should only be in Future section
```

## Do NOT

- Add features that don't exist in code
- Remove Future/Planned sections entirely
- Change code to match docs (docs follow code)
- Add speculative implementation details
```

---

## Quick Fix Script

For simple fixes, use this script:

```bash
#!/bin/bash
# Quick doc fixes

# Fix context_hash -> inputHash
sed -i 's/context_hash/inputHash/g' .ai/PROOF_LEDGER.md
sed -i 's/context_hash/inputHash/g' .ai/DATA_MODEL.md

# Add last updated date
for f in .ai/*.md; do
  if ! grep -q "Last Updated:" "$f"; then
    sed -i "1i<!-- Last Updated: $(date +%Y-%m-%d) -->\n" "$f"
  fi
done

echo "Quick fixes applied. Manual review still needed."
```

---

## Validation Checklist

After fixing, verify:

- [ ] DATA_MODEL.md lists exactly the models in prisma/schema.prisma
- [ ] WORKFLOW_STATE_MACHINE.md states match states.ts
- [ ] API_CONTRACT.md endpoints match controllers
- [ ] FRONTEND_SPEC.md has no internal conflicts
- [ ] ARCHITECTURE.md reflects packages/core structure
- [ ] PROOF_LEDGER.md references correct table/field names
- [ ] DOC_ALIGNMENT_REPORT.md updated to show ✅ ALIGNED
