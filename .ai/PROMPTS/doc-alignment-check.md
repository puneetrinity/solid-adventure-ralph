# Documentation Alignment Check Prompt

> Use this prompt to verify documentation stays aligned with implementation.
> Run after completing any phase or major feature.

---

## Prompt

```
You are a documentation auditor for the arch-orchestrator project. Your job is to verify that all specification documents in `.ai/` are aligned with the actual implementation.

## Instructions

1. **Read the source of truth files:**
   - `prisma/schema.prisma` - actual data model
   - `packages/core/src/workflow/states.ts` - actual workflow states
   - `packages/core/src/workflow/transition.ts` - actual transitions
   - `packages/core/src/policy/policy-engine.ts` - actual policy rules
   - `packages/core/src/policy/gate2.ts` - actual gate implementation
   - `apps/api/src/**/*.controller.ts` - actual API endpoints
   - `apps/web/src/api/client.ts` - frontend API client (if exists)

2. **Compare against specification documents:**
   - `.ai/DATA_MODEL.md` vs `prisma/schema.prisma`
   - `.ai/WORKFLOW_STATE_MACHINE.md` vs `states.ts`
   - `.ai/API_CONTRACT.md` vs controllers + frontend client
   - `.ai/GATES.md` vs gate implementations
   - `.ai/POLICY_ENGINE.md` vs policy-engine.ts
   - `.ai/ARCHITECTURE.md` vs actual folder structure
   - `.ai/FRONTEND_SPEC.md` vs `apps/web/` (if exists)

3. **Check for these specific issues:**
   - Tables/models documented but not in Prisma schema
   - Tables/models in Prisma but not documented
   - States documented but not in code
   - States in code but not documented
   - API endpoints documented but not implemented
   - API endpoints implemented but not documented
   - Field name mismatches (snake_case vs camelCase)
   - Type mismatches (string vs enum, optional vs required)

4. **Generate a report with:**
   - Summary table (document | status | issue count)
   - Detailed issues per document
   - Specific line numbers where possible
   - Recommended fixes (update doc OR update code)

5. **Update `.ai/DOC_ALIGNMENT_REPORT.md` with your findings**

## Output Format

For each document, report:
```
### [DOCUMENT_NAME]
Status: ✅ ALIGNED | ⚠️ OUTDATED | ❌ MISALIGNED

**Issues:**
1. [Issue description]
   - Location: [file:line]
   - Expected: [what docs say]
   - Actual: [what code says]
   - Fix: [update docs | update code]
```

## Success Criteria

- All ❌ MISALIGNED issues resolved
- All ⚠️ OUTDATED issues have action items
- DOC_ALIGNMENT_REPORT.md is current
```

---

## Quick Check Commands

Run these to gather current state:

```bash
# List all Prisma models
grep "^model " prisma/schema.prisma

# List all workflow states
grep -E "^\s*\|?\s*'" packages/core/src/workflow/states.ts | head -20

# List all API endpoints
grep -r "@Get\|@Post\|@Put\|@Delete\|@Patch" apps/api/src --include="*.ts" | grep -v node_modules

# List all frontend API methods
grep -E "^\s+\w+:" apps/web/src/api/client.ts 2>/dev/null || echo "No frontend yet"

# Check policy rules
grep "rule:" packages/core/src/policy/policy-engine.ts

# Check gate implementations
ls packages/core/src/policy/gate*.ts 2>/dev/null
```

---

## Integration with Ralph

Add to `.ralph/AGENT.md`:

```markdown
## After Each Phase

1. Run documentation alignment check
2. Update any misaligned docs
3. Update DOC_ALIGNMENT_REPORT.md
4. Ensure all docs reflect current implementation
```

---

## Automation Script

Save as `scripts/check-docs.sh`:

```bash
#!/bin/bash
# Quick documentation alignment check

echo "=== Prisma Models ==="
grep "^model " prisma/schema.prisma | wc -l
grep "^model " prisma/schema.prisma

echo ""
echo "=== Workflow States ==="
grep -oE "'[A-Z_]+'" packages/core/src/workflow/states.ts 2>/dev/null | sort -u

echo ""
echo "=== Policy Rules ==="
grep "rule:" packages/core/src/policy/policy-engine.ts 2>/dev/null | grep -oE "'[a-z_]+'"

echo ""
echo "=== API Endpoints ==="
grep -r "@Get\|@Post" apps/api/src --include="*.controller.ts" 2>/dev/null | grep -oE "'[^']+'" | sort -u

echo ""
echo "=== Test Count ==="
npx jest --listTests 2>/dev/null | wc -l
echo "test files"

echo ""
echo "=== Doc Files ==="
ls -la .ai/*.md | wc -l
echo "documentation files in .ai/"
```

---

## When to Run

- ✅ After completing any task (T*.*)
- ✅ After modifying Prisma schema
- ✅ After adding/changing API endpoints
- ✅ After modifying workflow states
- ✅ Before creating a PR
- ✅ At the end of each phase
