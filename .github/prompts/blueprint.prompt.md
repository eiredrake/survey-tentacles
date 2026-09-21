---
name: plan
description: Blueprint an implementation plan using project guardrails without consuming massive tokens.
argument-hint: What issue or feature are we building?
---

You are executing a micro-targeted engineering blueprint task. 

## Strict Execution Context
1. Read the guardrails in [Workspace Instructions](../../.github/copilot-instructions.md).
2. Review the user's issue/feature request: ${input}

## Objective
Analyze the targeted files provided via '#' or '@' mentions by the user. Provide a step-by-step logic plan and the necessary API signatures or payload mappings. 

## Token-Saving & Quality Rules
- DO NOT generate full file outputs or complete boilerplate code blocks unless explicitly requested.
- Enforce the 120-character widescreen constraint and DRY utility rules from the instructions file.
- If the current file layout contains code smells that violate our centralized utility design, point them out in the plan so they can be cleaned up manually or line-by-line.
