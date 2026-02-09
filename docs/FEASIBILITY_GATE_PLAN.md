# Feasibility Gate (Business Justification) — Deep Dive Plan

## Goal
Add a **pre‑stage feasibility review** before the existing ingest/policy/patch pipeline.
Users provide **Feature Goal + Business Justification**. The system runs an LLM‑based
analysis (complexity, ROI, risks, alternatives) and **waits for user approval** before
continuing to architecture/policy/patches.

This preserves the current pipeline and adds a gated step up front.

---

## High‑Level Flow

1. **Create Workflow (INTAKE)**
   - User provides:
     - `featureGoal`
     - `businessJustification`
     - `repo(s)`
   - State: `INTAKE`
   - Event: `ui.create` (already exists)
   - Orchestrator enqueues **feasibility_analysis** job.

2. **Feasibility Analysis (Worker)**
   - Inputs:
     - Feature goal, business justification
     - Repo context summary (RepoContext)
     - README + package.json (fallback)
   - Output:
     - Feasibility artifact (`FeasibilityV1`)
     - Recommendation: **Yes / No**
     - Reasoning (no numeric score)
     - Complexity narrative
     - Risks
     - Pros / Cons
     - Alternatives
   - State: `FEASIBILITY_READY`
   - Event: `worker.feasibility.completed`

3. **User Decision**
   - **Approve Feasibility** → state `FEASIBILITY_APPROVED`
   - **Reject Feasibility** → state `FEASIBILITY_REJECTED`
   - Event:
     - `ui.feasibility.approved`
     - `ui.feasibility.rejected`

4. **Normal Pipeline Continues**
   - Orchestrator triggers `ingest_context` → policy → patches → PR.

---

## Data Model Changes

### Workflow (new fields)
Add:
- `featureGoal` (string, required in UI)
- `businessJustification` (string, required in UI)

### Workflow State (new states)
- `INTAKE`
- `FEASIBILITY_READY`
- `FEASIBILITY_APPROVED`
- `FEASIBILITY_REJECTED`

### Artifact
Add new artifact type:
- `FeasibilityV1`

Shape:
```json
{
  "kind": "FeasibilityV1",
  "recommendation": "yes|no",
  "reasoning": "...",
  "complexity": "...",
  "risks": ["..."],
  "pros": ["..."],
  "cons": ["..."],
  "alternatives": ["..."],
  "assumptions": ["..."],
  "repoSummary": "...",
  "inputs": {
    "featureGoal": "...",
    "businessJustification": "..."
  }
}
```

---

## API Changes

### Create Workflow
Update `apps/api/src/workflows.service.ts`
- Accept `featureGoal` + `businessJustification`
- Set initial state to `INTAKE`

### Feasibility Actions
Add endpoints in `apps/api/src/workflows.controller.ts`
- `POST /api/workflows/:id/actions/approve_feasibility`
- `POST /api/workflows/:id/actions/reject_feasibility`

These should:
- Create WorkflowEvent
- Update Workflow state
- Emit orchestrator event:
  - `E_FEASIBILITY_APPROVED`
  - `E_FEASIBILITY_REJECTED`

---

## Worker Changes

### New Processor: `feasibility-analysis.processor.ts`
Add `apps/worker/src/processors/feasibility-analysis.processor.ts`

Steps:
1. Load workflow + repos + RepoContext summary
2. Build LLM prompt with:
   - featureGoal
   - businessJustification
   - repo context summary
   - README/package.json (fallback)
3. Generate Feasibility artifact (JSON)
4. Save artifact and workflow event
5. Emit `E_JOB_COMPLETED` with stage `feasibility_analysis`

### Orchestrator
Update `packages/core/src/workflow/transition.ts`

Add rules:
- `INTAKE` + `E_WORKFLOW_CREATED` → enqueue `feasibility_analysis`
- `FEASIBILITY_READY` + `E_FEASIBILITY_APPROVED` → enqueue `ingest_context`
- `FEASIBILITY_READY` + `E_FEASIBILITY_REJECTED` → stop workflow

---

## UI Changes

### Create Workflow Modal (WorkflowsPage)
- Add required fields:
  - Feature Goal
  - Business Justification

### Workflow Detail Page
- Add a **Feasibility** tab
- Show:
  - recommendation (Yes/No)
  - reasoning
  - complexity narrative
  - risks / pros / cons / alternatives
- Add buttons:
  - **Approve Feasibility**
  - **Reject Feasibility**

### Timeline
- Show new events:
  - `worker.feasibility.completed`
  - `ui.feasibility.approved`
  - `ui.feasibility.rejected`

---

## Multi‑Repo Behavior

Feasibility analysis should be **per workflow**, but include **repo summaries**:
- If multiple repos: include short summary per repo in the artifact
- The recommendation still applies to the workflow overall

---

## Tests / Validation

**API**
- Create workflow with goal + justification → state `INTAKE`
- Approve feasibility → state `FEASIBILITY_APPROVED`
- Reject feasibility → state `FEASIBILITY_REJECTED`

**Worker**
- Feasibility processor produces `FeasibilityV1` artifact
- Artifact has required keys (recommendation, reasoning, risks, pros/cons)

**UI**
- Modal enforces required fields
- Feasibility tab renders data
- Approve/Reject updates state

---

## Rollout Plan

1. Apply Prisma migration
2. Deploy API changes
3. Deploy worker (feasibility processor)
4. Deploy UI changes
5. Test end‑to‑end

---

## Open Questions (optional)

- Do we include a confidence rating in the feasibility artifact? (currently **no**)
- Should feasibility be re‑run if user edits goal/justification? (default: **no**, require new workflow)

