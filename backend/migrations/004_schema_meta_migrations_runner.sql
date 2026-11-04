-- Marque l'adoption du runner versionné (schema produit 4).
CREATE TABLE IF NOT EXISTS schema_meta (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  version INT NOT NULL DEFAULT 4,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_meta (id, version, updated_at)
VALUES (1, 4, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE version = GREATEST(version, 4), updated_at = UTC_TIMESTAMP();
