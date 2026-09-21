---
name: fix
description: Provide a highly targeted bug fix for a stack trace or runtime error without recursive guessing.
argument-hint: Paste the error logs, exception trace, or describe the bug behavior here.
---

You are executing a micro-targeted bug-fixing task.

## Strict Execution Context
1. Read the guardrails in [Workspace Instructions](../../.github/copilot-instructions.md).
2. Review the error log / bug behavior: ${input}

## Objective
Analyze the targeted files provided via '#' or '@' mentions by the user. Provide the minimal, single-point-of-failure code fix required to resolve this specific error.

## Token-Saving & Budget Protection Rules
- **No Recursive Guessing:** If the solution is ambiguous or requires speculative context you do not have, STOP immediately and ask the user for clarification. Do not output multiple variations.
- **Micro-Targeted Snippets Only:** Do not rewrite or output unedited boilerplate code around the fix. Provide only the specific lines or functions changing.
- **Format Integrity:** Enforce the 120-character widescreen constraint from our instructions file. Do not wrap parameters or argument lists unless the single line strictly breaches 120 characters.
