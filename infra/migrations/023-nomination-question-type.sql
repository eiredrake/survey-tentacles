-- Optional manual psql entry point. The application also runs this update automatically on startup.
\set ON_ERROR_STOP on
BEGIN;
\ir ../../backend/src/main/resources/db/023-nomination-question-type.sql
COMMIT;
