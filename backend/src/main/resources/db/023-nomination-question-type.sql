-- Hibernate updates tables but does not extend existing enum CHECK constraints.
SET LOCAL lock_timeout = '5s';
ALTER TABLE question
  DROP CONSTRAINT IF EXISTS question_type_check,
  ADD CONSTRAINT question_type_check CHECK (type IN (
    'SCHEDULING', 'SINGLE_SELECT', 'MULTI_SELECT', 'SHORT_TEXT', 'RELATIONSHIP', 'NOMINATION'
  ));
