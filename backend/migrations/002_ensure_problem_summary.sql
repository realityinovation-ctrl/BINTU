-- Colonne d'historique mobile / desk (idempotent si déjà présente via bdd.sql).
SET @has_problem_summary := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'investigations'
    AND COLUMN_NAME = 'problem_summary'
);
SET @sql_problem := IF(
  @has_problem_summary = 0,
  'ALTER TABLE investigations ADD COLUMN problem_summary VARCHAR(512) NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt_problem FROM @sql_problem;
EXECUTE stmt_problem;
DEALLOCATE PREPARE stmt_problem;
