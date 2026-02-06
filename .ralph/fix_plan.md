# Ralph Fix Plan

## Source of Truth
**All tasks are defined in `.ai/PLAN.md`**
**Current status is tracked in `.ai/STATUS.json`**

Do NOT use this file for task tracking. Use the `.ai/` specs.

## Quick Reference

### Current Status (from .ai/STATUS.json)
- **Next Task:** T3.2 (Workflow Runs + Proof Ledger)
- **Completed:** T0.1, T0.2, T0.3, T1.1, T1.2, T1.3, T2.1, T2.2, T3.1

### Phase Overview
- Phase 0-2: DONE (Safety Spine, Patch Loop, Approval)
- Phase 3: IN PROGRESS (Orchestrator)
- Phases 4-12: PENDING

## How to Work

1. Read `.ai/STATUS.json` for current `next` task
2. Read `.ai/PLAN.md` for task details
3. Implement following subtasks and acceptance criteria
4. Verify proof exists
5. Update `.ai/STATUS.json`:
   - Add task ID to `completed` array
   - Set `next` to following task
   - Update `notes`

## Notes
- Focus on one task at a time
- Don't skip ahead in the plan
- Safety invariants must never break
- Run `npm test` to verify
