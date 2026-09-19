# CSRF caller inventory and migration audit

Audited 2026-09-19. Original implementation: `67b071a`. Migration: `75e0e33`.
The migration was already committed when this follow-up audit began; it was reviewed rather than replayed.

## Original patterns

- 13 unchecked fetch/JSON blocks: four survey-list actions and nine survey-editor actions. These did not validate response status or token shape.
- Seven checked fetch/JSON blocks: select and nomination editors, participant-group request wrapper, participant picker, attachment saver, notification preference, and survey submission. These checked HTTP status but did not validate the token object.
- One logout block: checked HTTP status, displayed a toast on failure, and used the returned form parameter rather than a request header.
- One existing canonical caller: survey tagline save.

There were 21 duplicate retrieval blocks, not 41 independent retrieval implementations. Additional matches were token consumption and header construction.

## Callers and retained behavior

| File | Caller / operation | Request behavior |
| --- | --- | --- |
| index.js | Copy survey | POST, returned header name |
| index.js | Delete survey | DELETE, existing confirmation retained |
| index.js | Change survey status | POST JSON |
| index.js | Create survey | POST JSON, existing navigation retained |
| survey-edit.js | setupSelectEditor | POST JSON for Single/Multi Select create/update |
| survey-edit.js | setupTitleEditor | POST JSON title |
| survey-edit.js | saveTagline | POST JSON, already used canonical helper |
| survey-edit.js | setupSchedulingQuestionSave | POST JSON create/update |
| survey-edit.js | setupShortTextQuestionSave | POST JSON create/update |
| survey-edit.js | setupRelationshipQuestionSave | POST JSON create/update |
| survey-edit.js | loadQuestions delete action | DELETE question |
| survey-edit.js | loadParticipants required toggle | POST JSON assignment requirement |
| survey-edit.js | loadParticipants remove action | DELETE assignment |
| survey-edit.js | setupSurveyImageUpload upload | POST FormData; no forced JSON content type |
| survey-edit.js | setupSurveyImageUpload remove | DELETE image |
| survey-edit.js | setupNominationQuestionSave | POST JSON create/update |
| participant-groups.js | groupRequest | Shared POST/PUT/DELETE transport for group create/edit/delete; conflict handling retained |
| participant-picker.js | picker save | POST JSON batch assignments |
| question-images.js | saveImage | POST FormData or DELETE; shared by question and character attachments |
| survey-events.js | notification preference toggle | PUT JSON; existing error/disabled-state handling retained |
| survey.js | initializeSurveySubmit | One token passed to all answer handlers and the final submission notice; no added per-answer retrieval |
| logout.js | logout | Native POST form using returned parameterName, preserving identity-provider navigation |

Every retrieval now calls the existing getCsrfToken.js implementation. Header requests use the returned headerName. Logout additionally checks parameterName because HTML form submission cannot set the CSRF request header. It does not retrieve or parse the token independently.

The canonical helper and its tests were unchanged. Existing catches and cleanup remain in place; logout now also catches helper failures. Older unchecked event handlers still propagate errors when they have no catch; this audit does not claim a general UI error-handling refactor.

All pages load the helper before its consumers. Obsolete retrieval/parsing blocks have been removed. No additional CSRF helper was introduced.

## Verification

- `npm test --prefix backend/src/test/js`: 105 passing tests, including canonical helper tests, migration/script-order guards, protected operation tests, and logout success/failure tests.
- Repository-wide tracked-file search for endpoint literals, CSRF/XSRF header literals and former response variables found only the backend endpoint and canonical frontend fetch outside tests.
- Full search including tests: other occurrences are fixture responses, assertions, and migration guards, not application retrieval implementations.
- Frontend token/header uses were reviewed separately; headers remain computed from returned data. No production hardcoded CSRF header names or second retrieval implementation remain.

Search used before adding this audit document:

```powershell
git grep -n -i -E '/csrf|x-csrf|x-xsrf|csrfResponse|tokenResponse' -- ':!backend/src/test/**'
```

Results:

```text
backend/src/main/java/org/eiredrake/tentacles/controller/CsrfController.java:10: @GetMapping("/csrf")
backend/src/main/resources/static/js/getCsrfToken.js:38: response = await fetch("/csrf", {
```

Subsequent searches also match this documentation, which is not executable code.