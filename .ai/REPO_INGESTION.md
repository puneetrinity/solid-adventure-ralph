# Repo Ingestion & Context Slicing

## Purpose
Build a compact, reliable context pack for planning and patch proposals without dumping the entire repo.

## Rules
- Prefer repo-local truth: .ai/*, docs/ADRs, existing patterns.
- Retrieve by priority and cap size. Avoid huge files.
- Always record which files/sections were used (pointers) into artifacts/ledger.

## Priority order (fetch in this order)
1) .ai/* (if exists in target repo)
2) README, docs architecture/ADRs
3) CI configs (to learn gates): package scripts, workflow names (read-only)
4) Entry points / routing: controllers, routes, main modules
5) Domain modules likely impacted
6) Existing tests around impacted modules

## Heuristics
- Detect stack: package.json, tsconfig, prisma schema, docker files
- Identify boundaries: folder structure (src/modules, packages, services)
- Identify conventions: lint/typecheck/test scripts, test frameworks
- Predict "blast radius":
  - search for similar features
  - locate API surfaces and data models

## Limits (suggested)
- Max total context per run: 200-400 KB text (tunable)
- Max file size: 50 KB (skip or summarize larger)
- Always include file paths and (if possible) line ranges in internal pointers

## Output
- Store a "Context Pack" artifact that lists:
  - base_sha
  - files included
  - brief map of repo modules
  - discovered commands (lint/test/typecheck)
