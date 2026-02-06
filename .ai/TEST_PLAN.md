# Test Plan

## Goals
- Prove orchestrator determinism and safety.
- Prove "no GitHub contents writes before approval".
- Prove policy engine blocks forbidden changes and records evidence.
- Prove golden flow: create → propose → approve → PR → CI → DONE (with mocks/fixtures).

## Pyramid
- Unit (core): 60%
- Integration (DB/queue/HTTP): 30%
- E2E golden flow: 10%

## Invariants
- I1: No GitHub contents write actions occur/enqueue pre-approval.
- I2: Frozen files cannot be modified without override.
- I3: Orchestrator decides state transitions, not LLM.
- I4: Proof Ledger records context hash + artifacts + gates per run.

## Scope
Unit tests:
- transition()
- policy diff eval
- Gate0/Gate2
- context hash stability

Integration tests:
- webhook signature + event persistence + enqueue
- worker consumes job and persists artifacts
- approval endpoint records approval and enqueues apply
- apply blocked without approval; apply allowed with approval (mock GitHub)

E2E:
- one happy-path golden flow test with fixture CI success event
