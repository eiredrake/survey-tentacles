---
name: test
description: Generate minimal, high-coverage unit or integration tests without duplicate setup boilerplate.
argument-hint: What behavior or edge case are we writing a test for?
---

You are executing a precision test generation task.

## Strict Execution Context
1. Read the guardrails in [Workspace Instructions](../../.github/copilot-instructions.md).
2. Review the targeted code/behavior to test: ${input}

## Objective
Generate standard unit or integration tests for the file(s) targeted via '#' or '@' mentions. If it is a backend test, use native Spring Boot testing paradigms (e.g., `@SpringBootTest`, `MockMvc`). 

## Token-Saving & Quality Rules
- **No Redundant Setup:** Scan the targeted test file or directory first. Do not regenerate shared mock configurations, application context setups, or test containers if they already exist in the base test class or helper files.
- **Snippet Output Only:** Output only the new `@Test` methods or specific test assertions required. Do not output the entire test class container unless explicitly asked.
- **Formatting:** Keep the 120-character rule active. Do not split assertions or mock method parameters across multiple vertical lines unnecessarily.
