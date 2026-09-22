# AGENTS.md — Tentacles Coding Agent Rules

This file defines the standing rules for any coding agent working on Tentacles.

These rules apply unless the developer explicitly overrides them for a specific task.

The purpose of these rules is to keep changes small, understandable, consistent with the existing architecture, and inexpensive to review.

---

# 1. Prime Directive

## Search before you write.

Before implementing new behavior, determine how Tentacles currently handles the same or substantially similar behavior.

Do not begin by creating code.

Begin by understanding the relevant existing code.

The normal implementation workflow is:

**search → understand → plan → implement → test → inspect → search for duplication → reassess**

Existing project architecture and established project conventions take precedence over generic architectural preferences.

Do not invent a new pattern merely because it would be reasonable in another project.

---

# 2. Pinned Context Is a Hard Working Boundary

When an implementation prompt identifies specific files, classes, methods, functions, symbols, or code sections as the approved context, treat that context as the working boundary.

You may:

- Read the supplied/pinned context.
- Modify files explicitly authorized by the implementation plan.
- Perform narrowly targeted searches explicitly required by the plan.
- Run appropriate tests and inspect their results.

You may NOT autonomously expand the task into unrelated files or subsystems merely because they appear relevant.

If implementation requires a file, class, utility, configuration, or subsystem outside the supplied context:

1. Stop.
2. Identify the exact additional context required.
3. Explain why it is required.
4. Wait for the developer to expand the working boundary.

Search results do not automatically authorize modification of the files they reveal.

Do not turn a bounded implementation task into repository-wide exploration.

---

# 3. Scope Discipline

Implement the requested behavior and nothing else.

Do not perform unrelated:

- refactoring;
- renaming;
- formatting;
- cleanup;
- architecture changes;
- dependency upgrades;
- file moves;
- API redesigns;
- database changes;
- modernization.

A file being imperfect is not authorization to fix it.

If significant technical debt is discovered outside the current task, report it separately.

Do not silently include it in the current change.

Prefer the smallest coherent change that satisfies the requirement.

---

# 4. DRY / Reuse Commandment

## There should be one authoritative implementation of the same behavior whenever practical.

Before adding any:

- helper;
- utility;
- constant;
- API wrapper;
- validation routine;
- formatter;
- authentication logic;
- CSRF logic;
- error-handling mechanism;
- status/type definition;
- business rule;
- reusable UI behavior;

search for an existing implementation first.

If equivalent behavior already exists, reuse it.

Do not create a second implementation merely because:

- the existing implementation is in another file;
- copying it is faster;
- the implementation is only a few lines;
- the new caller is nearby;
- creating another helper is convenient.

File locality and convenience are not sufficient reasons for duplication.

Before completing an implementation, search again for:

- duplicate implementations introduced by the change;
- obsolete implementations made unnecessary by the change;
- hardcoded values that should use an established source of truth.

If significant existing duplication is discovered outside the issue scope, report it as technical debt rather than silently refactoring it.

---

# 5. DRY Does Not Mean Premature Abstraction

Do not combine code merely because it looks superficially similar.

Two operations using the same JavaScript primitive, loop structure, Spring annotation, or Java construct are not automatically the same behavior.

Examples:

Two unrelated calls to `fetch()` do not automatically require a common abstraction.

Two validation loops enforcing different domain rules do not automatically belong in a shared validator.

Two short pieces of code that happen to look alike do not automatically justify a generic framework.

Centralize genuinely shared behavior.

Do not create abstractions for abstraction's sake.

The goal is:

**one authoritative implementation of the same behavior**

not:

**the fewest possible lines of code.**

---

# 6. Understand Before Modifying

Before changing code, inspect enough existing implementation to answer:

- What currently owns this behavior?
- What calls it?
- What established project convention applies?
- Is there already a reusable implementation?
- What is the smallest place where the change belongs?
- What tests currently protect this behavior?

Do not guess project architecture.

Do not invent filenames, functions, classes, endpoints, configuration properties, or conventions that have not been verified.

If required context is unavailable, stop and ask for it.

---

# 7. Frontend Rules

Tentacles currently serves its frontend as static resources from the Spring application.

Frontend code lives primarily under:

`backend/src/main/resources/static/`

Do not assume Tentacles has an independently built frontend application unless the repository architecture explicitly changes.

Use existing JavaScript utilities when they represent the behavior needed.

Do not create a new frontend utility merely because multiple callers use JavaScript's `fetch()` function.

Centralize shared HTTP behavior when the behavior itself is shared, such as:

- authentication handling;
- CSRF retrieval;
- common response/error processing;
- repeated request construction;
- repeated API semantics.

Do not force unrelated API calls through a generic abstraction merely to eliminate use of `fetch()`.

---

# 8. Canonical CSRF Rule

Tentacles has a canonical CSRF helper:

`backend/src/main/resources/static/js/getCsrfToken.js`

Code requiring CSRF information must use the established `getCsrfToken()` implementation when applicable.

Typical usage:

    const { token, headerName } = await getCsrfToken();

Callers must use the returned `headerName`.

Do not hardcode the CSRF header name.

Do not independently fetch `/csrf` when the canonical helper can provide the required behavior.

Do not create another CSRF helper.

When migrating existing CSRF implementations:

1. Inventory the existing behavior.
2. Confirm that the canonical helper is semantically compatible.
3. Migrate callers incrementally.
4. Test the migrated behavior.
5. Remove obsolete implementations only after their callers are migrated.
6. Search again for remaining duplicate CSRF retrieval logic and hardcoded CSRF header names.

If a caller genuinely cannot use the canonical helper, stop and document the technical reason before implementing another mechanism.

## Do not create a fifth CSRF implementation while fixing the existing four.

---

# 9. Backend and Spring Rules

Tentacles is a Spring Boot application.

Use the existing Spring architecture rather than inventing parallel mechanisms.

Spring Security owns application security concerns.

Do not create custom plain-Java authentication interceptors, filters, or authorization systems when Spring Security already provides the required mechanism.

Authentication, authorization, security context handling, OAuth/OIDC integration, and CSRF behavior should remain centralized through established Spring Security mechanisms.

Business validation is different from security infrastructure.

Domain-specific validation may legitimately belong in:

- controllers;
- services;
- domain/model logic;
- established validation utilities;

depending on the existing architecture.

Do not move ordinary business validation into security infrastructure merely to centralize it.

---

# 10. Authentication / OIDC Rules

Tentacles currently uses Spring Security with OIDC authentication.

The current production identity provider may be Authentik, but application code should remain provider-agnostic wherever practical.

Do not unnecessarily couple application behavior to Authentik-specific implementation details.

Prefer standard:

- Spring Security;
- OAuth2;
- OIDC;

mechanisms and claims where they satisfy the requirement.

Provider-specific behavior should only be introduced when the requirement genuinely depends on that provider.

---

# 11. Security Rules

Never weaken security merely to make a feature work.

Do not:

- disable CSRF protection to bypass a problem;
- bypass authentication or authorization checks;
- expose secrets;
- log tokens, passwords, credentials, or client secrets;
- hardcode credentials;
- expose protected administrative APIs through public routes;
- trust client-supplied ownership or authorization information without server-side verification.

Treat security failures as problems to understand, not obstacles to route around.

---

# 12. Secrets

Never print or log secrets.

This includes:

- passwords;
- database credentials;
- OIDC client secrets;
- access tokens;
- refresh tokens;
- CSRF tokens;
- private keys;
- environment secrets.

Do not request entire secret-bearing environment files when only one setting is required.

When debugging configuration, inspect only the minimum necessary value.

---

# 13. Database Rules

Do not change database schema or persistence behavior unless the task requires it.

Do not:

- drop tables;
- recreate production databases;
- remove persistent volumes;
- change persistence strategy;
- modify production data;

without explicit authorization.

Preserve existing data unless the task explicitly requires migration or deletion.

---

# 14. Production Safety

Tentacles production data is persistent and must survive application deployments.

Do not delete or recreate production Docker volumes as a troubleshooting shortcut.

Production uploads and PostgreSQL data must be treated as persistent data.

Deployment changes must preserve the currently running production application when a new image cannot be retrieved or started successfully whenever the existing deployment architecture permits this.

A failed deployment must not casually destroy the working deployment.

---

# 15. Testing Rules

Run the narrowest useful test while implementing.

After the implementation behaves correctly, run the appropriate broader test suite required by the task.

Do not modify tests merely to make a failing implementation pass unless the expected behavior itself has intentionally changed.

A failing existing test is evidence to investigate.

Do not assume the test is wrong.

For the local Tentacles development workflow, the explicit **Run Tests** command is intended to execute the complete test suite rather than relying on Gradle's incremental test skipping.

Inspect test results.

Do not equate a command exiting successfully with the requested behavior necessarily being correct.

---

# 16. Autonomous Fix Limit

An agent may make at most three autonomous fix/test attempts for the same failure.

A fix/test attempt means:

1. diagnose;
2. modify code;
3. rerun the relevant test or validation.

After three unsuccessful attempts:

STOP.

Report:

- what failed;
- what was attempted;
- what evidence was gathered;
- what remains unclear;
- what additional context may be required.

Do not continue consuming time or tokens through indefinite trial-and-error.

---

# 17. Failure Escalation

Stop and ask the developer rather than guessing when:

- required context lies outside the pinned boundary;
- existing architecture is ambiguous;
- two established patterns conflict;
- the requested change would require an architectural change not included in the task;
- tests contradict the implementation plan;
- security behavior is unclear;
- production data could be affected;
- implementation would require a new dependency;
- a migration appears necessary but was not authorized;
- three fix/test attempts have failed.

Stopping for clarification is preferable to speculative implementation.

---

# 18. Code Style

Follow the style of the surrounding code.

Do not reformat unrelated code.

Prefer readable code over clever code.

The developer uses a wide-screen environment.

Avoid unnecessary vertical expansion of simple statements.

Do not turn straightforward JavaScript such as:

    const response = await fetch(url, options);

into unnecessarily fragmented multi-line code unless readability genuinely requires it.

Likewise, do not collapse complex logic into unreadable one-liners merely to save vertical space.

Match the established formatting of the file being modified.

---

# 19. Comments

Comments should explain:

- why something exists;
- non-obvious constraints;
- security requirements;
- architectural reasons;
- surprising behavior.

Do not add comments that merely narrate obvious syntax.

Bad:

    // Increment count
    count++;

Useful:

    // Keep the existing container running if the requested image has not
    // finished publishing to GHCR.

Comments are not a substitute for clear code.

---

# 20. Dependencies

Do not add a dependency unless the task genuinely requires one.

Before adding a dependency:

1. verify that existing project libraries cannot solve the problem;
2. explain why the dependency is needed;
3. obtain developer approval if it was not part of the implementation plan.

Do not add a library merely to avoid writing a small amount of straightforward code.

---

# 21. New Utilities

Before creating a new utility:

1. Search the repository for equivalent behavior.
2. Inspect likely existing utilities.
3. Determine whether the behavior is genuinely shared.
4. Reuse or extend the existing authoritative implementation when appropriate.

If no suitable implementation exists, create the smallest utility that satisfies the actual shared requirement.

Do not create speculative generic frameworks for possible future reuse.

---

# 22. Error Handling

Preserve useful error information.

Do not replace specific failures with meaningless generic errors unless exposing the underlying information would create a security problem.

User-facing or operator-facing errors should explain the actionable problem when practical.

Example:

Instead of:

    docker compose failed

prefer:

    Image v1.8.4 is not available yet. If you just released this version,
    wait for the GitHub release build to finish before deploying.

Do not expose secrets or sensitive implementation details in errors.

---

# 23. No Opportunistic Cleanup

While implementing a feature or bug fix, you may notice:

- duplicate code;
- poor names;
- formatting problems;
- old comments;
- unrelated bugs;
- architectural debt.

Do not automatically fix them.

If they do not prevent the current task from being completed safely, leave them alone and report them separately.

This keeps commits and reviews focused.

---

# 24. Completion Checklist

Before declaring an implementation complete, verify:

- The requested behavior is implemented.
- Only authorized files were modified.
- No unrelated refactor was included.
- Existing authoritative implementations were reused where appropriate.
- No unnecessary duplicate implementation was introduced.
- No new hardcoded value duplicates an existing source of truth.
- Security behavior remains intact.
- Relevant tests pass.
- Appropriate broader tests pass when required.
- The resulting diff was inspected.
- Temporary debugging code was removed.
- Secrets were not logged or committed.
- The implementation matches the supplied acceptance criteria.

Perform a final targeted search when the task involves consolidating duplicated behavior.

---

# 25. Agent Handoff Contract

Tentacles development may deliberately separate planning from implementation.

The planning phase may be performed interactively by the developer and another assistant.

Worker agents should therefore treat an approved implementation plan as a work order, not an invitation to redesign the solution.

A good implementation work order contains:

- the goal;
- relevant files/symbols;
- current behavior;
- required change;
- acceptance criteria;
- authorized tests;
- explicit exclusions.

When given such a work order:

1. Read this `AGENTS.md`.
2. Read the supplied implementation plan.
3. Inspect the pinned context.
4. Confirm that the plan is compatible with the actual code.
5. Make the smallest coherent implementation.
6. Test it.
7. Inspect the resulting diff.
8. Report the result.

If the plan cannot be implemented within the supplied context, stop and explain why.

Do not silently expand the project scope.

---

# 26. Temporary Tooling

Do not add temporary migration scripts, patch scripts, generated intermediate files, scratch files, or one-off tooling to the repository unless the task explicitly requires them as permanent project artifacts.

An agent may use temporary tooling internally when necessary to perform a mechanical transformation, but it must not remain in the repository or final diff.

Before completion:

- remove all temporary files created during implementation;
- verify that no scratch or intermediate files remain;
- inspect the final Git diff;
- confirm that every remaining changed or untracked file is an intentional project artifact.

Do not introduce another programming language, runtime, build dependency, or permanent development tool into Tentacles merely as an implementation convenience.

Temporary tooling must never be committed unless the developer explicitly approves it as a permanent part of the project.

# 27. Final Principle

Tentacles values predictable, maintainable changes over autonomous cleverness.

When choosing between:

- inventing and reusing;
- broad and narrow;
- speculative and verified;
- clever and obvious;
- autonomous expansion and asking;

prefer:

**reuse, narrow scope, verified facts, obvious code, and asking when the boundary must change.**
## Third-Party Frontend Assets

Vendored frontend dependencies live in `backend/src/main/resources/static/vendor/<library-name>/`.
Keep each dependency self-contained with required license or attribution material. Third-party distribution
JavaScript and CSS belong in that directory, never Tentacles' `/js` or `/css`. Tentacles-specific wrappers,
behavior, and styling remain Tentacles-owned code. Do not modify vendored files for application customization.
