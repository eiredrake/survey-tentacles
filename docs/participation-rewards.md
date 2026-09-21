# Participation rewards (#8)

## Using rewards

1. Open **Administration → Participation Rewards**, enable rewards, and choose the point name (for example, Karma).
2. Create perks with a name, description, and positive whole-number cost. Uncheck **Available** to retire a perk.
3. On a survey's **Edit** page, expand **Participation Rewards**, enable that survey, set values for saved questions, and click the save icon. Zero means no award. Use the reload icon after adding/removing questions while the panel is open.
4. Participants use the trophy icon to see their balance, history, leaderboard, and perk store. Eligible questions display their point value in Vote mode.
5. Administrators review purchases in the rewards page's **Redemptions** table. Redemption records the purchase; delivering/using a perk (such as advantage at the gaming table) happens outside Tentacles.

Rewards default to off both globally and per survey. There is one balance/store per instance. New and copied surveys require explicit reward configuration. Turning rewards off pauses earning and spending but preserves balances, history, and existing configuration.

## Award and spending rules

- The successful survey submission endpoint awards points after its existing access/completion checks. Saving an individual answer does not award points.
- Each participant can earn once per question, using the value configured at that submission. Subsequent edits, resubmissions, or changes to the point value do not award it again or alter prior transactions.
- Only answered questions with positive configured values qualify. `QuestionCompletionService` is the shared authority used by submission completion and rewards. Existing semantics are preserved, including the distinction between a comment on an optional relationship question and the score required on a required relationship question.
- Enabling rewards does not perform a bulk award for earlier submissions. A later successful submission can earn an as-yet-unawarded question's configured points.
- The leaderboard shows lifetime earned points, not the remaining balance. Spending does not lower a participant's rank.
- Balances are computed from the append-only ledger. Awards are positive transactions; redemptions are negative. No mutable balance field exists.
- Award keys are unique per participant/question. Redemption request IDs are unique per participant and allow safe retries. A participant row lock serializes earning/spending, preventing concurrent purchases from overspending. The browser preserves an ambiguous redemption's request ID for retries during that page session.
- Ledger descriptions and source identifiers are snapshots. Deleting questions/surveys or changing/retiring perks cannot erase or rewrite past awards or purchases.

## Deployment and architecture

The isolated `org.eiredrake.tentacles.rewards` package contains settings, per-survey configuration, perks, ledger entities, APIs, and transaction logic. It hooks into the existing successful-submission path; there is no plugin framework.

The existing Hibernate schema-update deployment configuration creates the new rewards tables and indexes on startup. No existing table columns, question-type constraints, or data require modification for this feature. The build includes the entities and UI resources.

Admin endpoints under `/api/rewards/admin/**` require `ROLE_ADMIN`. Account/history and redemption always use the authenticated participant, never a caller-supplied user ID. Mutations use the canonical `getCsrfToken()` token and server-provided `headerName`.

## Reuse review and validation

- Moved existing completion logic into one shared service instead of copying it into rewards. Updated two existing Mockito test fixtures to supply that dependency.
- Extracted ranked choice's accessible icon-button factory into `icon-button.js`; both ranked choice and rewards now call it. All affected pages load it before consumers.
- Reused existing date formatting, table/icon styling, toast behavior, global navigation, and CSRF implementation.
- The rewards API helper is shared across its three screens. The existing participant-groups request helper returns no data and has group-specific conflict/error semantics; it was not silently changed into a general API wrapper.
- Rewards use exact decimal-to-integer validation with field-specific bounds. Existing survey option-ID parsing has different input/range semantics and was left unchanged.
- Existing repeated request plumbing and manually constructed icon controls elsewhere remain separate technical debt; this change does not refactor those unrelated flows.
- Full Java suite: 131 passing tests locally and against disposable PostgreSQL 16, including concurrent awards/redemptions, repeat submission, authorization/CSRF, disabling, validation, and audit preservation.
- Full JavaScript suite: 143 passing tests, including rewards screens, canonical CSRF headers/failures, ambiguous redemption retry, and ranked-choice regressions.
- Final production-source search: `/csrf` retrieval only in `getCsrfToken.js`; no hardcoded CSRF header names. One question-completion implementation and one shared icon-button factory remain.

Live-browser visual testing with an authenticated DEV session remains a manual check.
