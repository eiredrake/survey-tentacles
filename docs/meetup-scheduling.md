# Meetup Scheduling (#20)

The admin supplies a prompt and Required setting, without predetermined choices.
Participants choose Specific time or Time window for each entry, in their browser's local
time zone, and may mix both. Windows have a start and end; the end must be after the start. They can remove entries with the x icon. Submitting
also includes a complete date/time still in the entry field. Resubmitting replaces
only that participant's availability; optional answers can be cleared.

Times are stored as instants. Different offsets representing the same instant count
together, and duplicate entries never count a participant twice. This implementation
counts overlapping windows as well as specific times inside those windows. Windows
include their start and exclude their end: merely touching windows do not overlap.
Overlapping entries from one person count that person only once. Adjacent result
segments merge only when the same people are available throughout. No meeting
duration is inferred from a specific-time entry.

After the survey is CLOSED or PUBLISHED, View shows the most popular times first,
with ties sorted chronologically. Vote becomes read-only and also shows these results.
Participant View displays only the selected participant's submitted availability.
Prompt edits preserve answers; copied surveys have no availability responses.

The existing startup schema updater includes MEETUP in PostgreSQL's question-type
constraint. Hibernate creates the new question/answer tables and adds the nullable endDateTime
column to an existing meetup_answer table. Earlier specific-time answers remain valid. Restart DEV after
updating; a browser refresh alone does not reload the backend question-type list.

## Reuse and remaining technical debt

Scheduling and Meetup share result-bar rendering and date formatting. Short Text and
Meetup share the prompt-only editor. Existing submission, CSRF, notifications, images,
copy/delete, and completion paths are reused. The obsolete, shadowed duplicate
renderSchedulingAnswers function was removed when its retained implementation became
the shared participant renderer.

Existing Scheduling's editor still repeats local date assembly between entry and
restoration, and other question types still repeat some request plumbing. These are
separate technical debt rather than part of this change.
