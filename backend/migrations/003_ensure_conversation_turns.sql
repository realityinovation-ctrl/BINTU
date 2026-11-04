-- Journal d'espace d'attente (idempotent pour bases antérieures à bdd.sql v3).
CREATE TABLE IF NOT EXISTS conversation_turns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id CHAR(36) NOT NULL,
  organization_id VARCHAR(128) NULL,
  role VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_turns_investigation (investigation_id, id),
  KEY idx_turns_org (organization_id, created_at),
  CONSTRAINT fk_turns_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
