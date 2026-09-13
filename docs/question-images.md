# Question images

In Edit Survey, save the question, then use its image icon in the question list.
The shared panel offers one image for the question and one portrait for each saved
Relationship character. Upload/replace and remove save immediately, independently
of question text or responses. Clicking a thumbnail opens a larger view.

PNG, JPEG, WebP and animated GIF are supported up to 5 MB. Images are displayed
from the original file, including their animation; no thumbnail re-encoding occurs.
Survey cover images accept GIF too.

## Storage and ownership

`ImageAttachment` stores the owner type/id, containing survey/question ids, file
name, content type and byte count. A unique owner constraint allows one image per
object. The first owner types are `QUESTION` and `RELATIONSHIP_SUBJECT`; new content
types can use the same endpoints and controls by extending the owner resolver.
There are no image fields specific to Relationship questions or answers.

Files use the existing persistent upload directory and Docker volume. Hibernate
creates the new metadata table during startup, using the existing schema-update
configuration. No manual migration is needed for this new table.

Uploads and removals require an administrator and CSRF. Retrieval requires login,
and all endpoints verify that the owner belongs to the requested survey.

Replacement and owner deletion remove old files after the database commits.
Rolled-back uploads remove the newly written file and retain the previous image.
Filesystem cleanup failures are logged for operational follow-up. Survey copying
creates independent files and attachments so deleting one copy cannot break another.

Relationship edits retain the ids of characters included in the request, preserving
their portraits. The pre-existing behavior of clearing Relationship responses when
saving question content remains; changing only an image does not clear responses.

## API

- `GET /api/surveys/{surveyId}/questions/{questionId}/images`: attachment metadata.
- `GET /api/surveys/{surveyId}/images/{ownerType}/{ownerId}`: original image bytes.
- `POST /api/surveys/{surveyId}/images/{ownerType}/{ownerId}`: upload/replace a multipart `file`.
- `DELETE /api/surveys/{surveyId}/images/{ownerType}/{ownerId}`: remove the image.

## Verification

`ImageAttachmentTests` covers animated GIF round trips, authorization, ownership,
file validation, transaction rollback/cleanup, character retention, owner deletion
and independent survey copies. `question-images.test.cjs` covers the shared editor,
Vote/View/Participant View portraits, enlarged previews and failed uploads.
