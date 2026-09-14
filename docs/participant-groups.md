# Expected Participants and reusable groups

Admins can open **Administration** using the gear in the application header, then
**Participant Groups**, or use **Manage participant groups** beside the Groups heading inside the Expected Participants picker in Edit Survey. The editor link opens a new
tab so an unsaved question stays intact. Create or rename a group, check its members,
and save. Users come from Tentacles' known-user list (currently populated on sign-in).
An empty group is allowed. Group names are trimmed, limited to 100 characters, and
unique ignoring case.

In Edit Survey, use the + beside Expected Participants, check individual users and/or
groups, then use the Save icon to apply the selection. Membership is expanded at the time of
the request. Existing assignments are kept, including their required flags, answers,
and completion state; new assignments default to optional. Overlapping selections
and repeated requests add each user only once. Changing or deleting a group later
does not change surveys where it was previously used.

## Storage and identity boundary

The existing internal User.id is the reference used by ParticipantGroup.members
and SurveyAssignment.user. Neither feature queries an identity provider or stores
provider group names or external subject identifiers. The existing OIDC login
mapping remains in UserService; no additional provider or account-linking mechanism
is introduced here. A future identity adapter must resolve/reconcile accounts to
the existing internal user IDs. That can change independently of group membership
and survey-assignment schemas.

Hibernate's existing schema-update setting creates participant_group and
participant_group_member on backend startup, including foreign keys to internal
users and unique membership/name constraints. No manual SQL or environment changes
are needed. Back up these tables with the rest of the application database.

## API and guarantees

- GET/POST /api/participant-groups: list/create groups.
- PUT/DELETE /api/participant-groups/{id}: replace name/membership or delete a group.
- Group write body: {"name":"Movie Night","userIds":[1,2]}.
- POST /api/surveys/{id}/assignments/batch: {"userIds":[1],"groupIds":[2,3],"required":false}.

All group APIs and batch assignment require an administrator; writes require CSRF.
The existing username-based individual assignment endpoint remains compatible and
now also handles duplicate additions idempotently. Assignment additions lock the
survey row inside one transaction so simultaneous additions serialize, backed by
the existing unique survey/user constraint. Invalid selections fail before any new
assignments are written. Group deletion removes memberships, not users or assignments.

ParticipantGroupTests covers persistence, validation, authorization, overlapping
selections, legacy additions, snapshot behavior and preserved answers/completion.
participant-groups.test.cjs covers admin editing, picker requests, failed saves and
preserved unsaved question state.
