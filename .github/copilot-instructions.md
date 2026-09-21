# Tentacles — Copilot Instructions

These instructions apply to all AI-assisted coding work in the Tentacles repository.

## Read AGENTS.md First

Before planning, modifying, or generating project code, read the repository-root:

`AGENTS.md`

`AGENTS.md` contains the authoritative coding-agent rules for:

- scope control;
- pinned context;
- DRY and reuse;
- security;
- testing;
- production safety;
- failure escalation;
- code style;
- implementation handoffs.

Follow it unless the developer explicitly overrides a rule for the current task.

Do not duplicate or reinterpret those rules here.

---

## Project Overview

Tentacles is a Spring Boot application with a Java backend and a static HTML/CSS/JavaScript frontend served by Spring.

Primary application code is under:

`backend/`

Backend Java:

`backend/src/main/java/`

Static frontend:

`backend/src/main/resources/static/`

Tests:

`backend/src/test/`

Development and deployment scripts:

`scripts/`

VS Code development tooling:

`.vscode/`

and:

`tools/vscode-tentacles/`

Do not assume `backend/` contains only backend code. The current Tentacles frontend is also contained within the Spring application.

Do not invent a separate frontend architecture unless a task explicitly introduces one.

---

## Technology

Tentacles currently uses:

- Java
- Spring Boot
- Spring Security
- OAuth2 / OIDC
- PostgreSQL
- Gradle
- HTML
- CSS
- browser JavaScript
- Docker for production deployment

Authentication currently uses an OIDC identity provider.

Keep application authentication provider-agnostic wherever practical.

Use established Spring Security mechanisms rather than implementing parallel authentication or authorization systems.

---

## Work From Verified Code

Do not guess how Tentacles works.

Before changing behavior:

1. inspect the relevant existing implementation;
2. search for an existing equivalent implementation;
3. identify the established project pattern;
4. make the smallest coherent change.

Existing Tentacles code and verified project conventions take precedence over generic framework advice.

Do not invent files, helpers, endpoints, classes, configuration properties, or architectural layers without verifying that they exist or are required.

---

## Pinned Implementation Context

When the developer provides specific files, classes, methods, functions, symbols, or code sections for an implementation task, treat them as the approved working boundary.

Do not autonomously expand implementation scope.

If another file or subsystem is required:

1. stop;
2. identify exactly what additional context is required;
3. explain why;
4. wait for the developer to expand the boundary.

A search result does not automatically authorize modification of the file it identifies.

---

## DRY

Search before creating.

Reuse established implementations of the same behavior.

Do not create duplicate:

- utilities;
- constants;
- CSRF handling;
- authentication logic;
- validation behavior;
- formatting behavior;
- error handling;
- API behavior;
- business rules.

Do not abstract unrelated code merely because it uses the same language primitive or has superficially similar syntax.

DRY means one authoritative implementation of the same behavior, not abstraction for abstraction's sake.

---

## Frontend HTTP / API Behavior

Do not assume all browser `fetch()` calls must route through one generic API client.

Reuse centralized HTTP utilities when the behavior itself is shared.

Independent API operations may use `fetch()` directly when no established shared behavior applies.

Before creating a new HTTP helper, search for an existing project utility.

---

## CSRF

The canonical frontend CSRF helper is:

`backend/src/main/resources/static/js/getCsrfToken.js`

Use `getCsrfToken()` when frontend code requires CSRF information.

It returns both:

- `token`
- `headerName`

Use the returned `headerName`.

Do not hardcode the CSRF header name.

Do not create another `/csrf` retrieval implementation when the canonical helper is applicable.

---

## Security

Spring Security owns authentication and authorization concerns.

Do not:

- bypass Spring Security;
- disable CSRF to solve a request problem;
- create custom authentication interceptors when established Spring Security mechanisms apply;
- expose secrets;
- log credentials or tokens;
- hardcode credentials.

Business/domain validation is not automatically a security concern and may remain in the appropriate controller, service, model, or established validation utility.

---

## Scope

Implement only the requested change.

Do not include opportunistic:

- refactors;
- cleanup;
- renames;
- architecture changes;
- dependency upgrades;
- formatting changes;
- unrelated bug fixes.

Report unrelated technical debt separately.

---

## Testing

Run targeted tests while implementing.

Run the appropriate broader suite before completion when required by the task.

Inspect the results rather than assuming a successful process exit proves the requested behavior.

Do not modify tests merely to make an incorrect implementation pass.

After three unsuccessful autonomous fix/test attempts for the same failure, stop and report the problem rather than continuing to iterate.

---

## Code Style

Follow the surrounding code.

Prefer readable, direct implementations.

Avoid unnecessary vertical expansion of simple JavaScript or Java statements.

Do not reformat unrelated code.

Do not introduce a new style merely because it is your preferred style.

---

## Implementation Work Orders

When given an approved implementation plan, treat it as a work order.

The expected workflow is:

**read AGENTS.md → inspect pinned context → verify plan against actual code → implement smallest coherent change → test → inspect diff → report**

Do not reinterpret a bounded implementation task as permission to redesign the surrounding system.

If the approved plan cannot be safely implemented within its stated boundary, stop and report what additional context is required.