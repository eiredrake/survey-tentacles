---
name: refactor
description: Abstract duplicate logic or clean up code smell using strict DRY and 120-character formatting guardrails.
argument-hint: What specific pattern or logic are we abstracting/cleaning up?
---

You are executing a precision refactoring task. 

## Strict Execution Context
1. Read the guardrails in [Workspace Instructions](../../.github/copilot-instructions.md).
2. Review the refactoring goal: ${input}

## Objective
Analyze the file(s) targeted via '#' or '@' mentions. Your goal is to abstract duplication or clear out code smell while strictly adhering to our architectural design patterns.

## Token-Saving & Quality Rules
- **Enforce Centralized Utilities:** If the requested refactor involves cross-cutting concerns (e.g., token extraction, headers, validation), extract them to our centralized infrastructure. Never replace code smell with local, inline utility variants.
- **Diffs & Local Snippets Only:** Do not output the entire file. Provide only the targeted, modified function blocks or a structured diff patch.
- **Horizontal Integrity:** Enforce the 120-character widescreen rule. Do not break or aggressively line-feed argument lists or parameters unless a single horizontal line exceeds 120 characters.
