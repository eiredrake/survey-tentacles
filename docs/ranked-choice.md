# Ranked Choice (#35)

Admins add candidates with names and optional descriptions and arrange their default order.
Both Edit and Vote use the same drag-and-drop ordering control, with up/down buttons for
keyboard and touch users. Candidate text is rendered as text, not HTML.

Participants select only the candidates they want to rank. Their selected list is saved in
preference order, starting at rank 1. A required question needs at least one candidate;
an optional question may be left blank or cleared. Resubmission replaces that participant's
previous ranking. No default order counts as an answer until candidates are selected.

Candidate IDs survive name, description, and default-order edits, preserving existing ballots.
Adding or removing candidates clears prior responses, as stated in the editor. Copying a
survey creates new candidate IDs and no responses. View and participant View show ordered
ballots without computing a winner or applying a tally method.

## Storage and deployment

Hibernate creates the ranked-choice question, candidate, and answer tables. The existing
startup schema updater extends the PostgreSQL question-type CHECK constraint to include
RANKED_CHOICE; this uses the existing bundled SQL script rather than a second updater.
Restart the application after updating. No separate manual SQL step is required.

## Reuse and verification

- Shared choice editor save/cancel flow and canonical getCsrfToken.js.
- Existing survey submission, notifications, question images, copy, and completion paths.
- One candidate ordering control for Edit/Vote and one ballot renderer for both View pages.
- Existing choice prompt and numeric option-ID validation reused without changing Single/Multi Select semantics.
- RankedChoiceQuestionTests covers partial ballots, persistence, replacement, validation,
  required/closed modes, copy/delete, and endpoint access; ranked-choice.test.cjs covers UI behavior.

Existing question-specific answer endpoints still repeat some load/save plumbing across types.
That is separate technical debt; this change does not refactor unrelated answer flows.
