-- BINTU — schéma MySQL pour XAMPP / MariaDB / MySQL 8
-- Import : phpMyAdmin > Importer > choisir ce fichier
-- Base créée : bintu
-- Schema version : 3 (users Google + sessions limitées type ChatGPT + historique)

CREATE DATABASE IF NOT EXISTS bintu
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bintu;

CREATE TABLE IF NOT EXISTS schema_meta (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  version INT NOT NULL DEFAULT 3,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_meta (id, version, updated_at)
VALUES (1, 3, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE version = 3, updated_at = UTC_TIMESTAMP();

-- ---------------------------------------------------------------------------
-- Utilisateurs (Google Cloud Console / OAuth ID token)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  google_sub VARCHAR(128) NOT NULL,
  email VARCHAR(320) NOT NULL,
  name VARCHAR(200) NULL,
  picture_url VARCHAR(1024) NULL,
  organization_id VARCHAR(128) NOT NULL,
  plan VARCHAR(32) NOT NULL DEFAULT 'free',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  last_login_at VARCHAR(40) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_google_sub (google_sub),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions applicatives (Bearer) — durée limitée comme ChatGPT free au démarrage
CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  revoked_at VARCHAR(40) NULL,
  last_seen_at VARCHAR(40) NULL,
  user_agent VARCHAR(512) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token_hash (token_hash),
  KEY idx_sessions_user (user_id, expires_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quotas journaliers (fenêtre UTC) — messages / live / diagnostics
CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id CHAR(36) NOT NULL,
  period_date CHAR(10) NOT NULL,
  messages_used INT NOT NULL DEFAULT 0,
  messages_limit INT NOT NULL DEFAULT 40,
  live_minutes_used DECIMAL(8,2) NOT NULL DEFAULT 0,
  live_minutes_limit DECIMAL(8,2) NOT NULL DEFAULT 15,
  investigations_used INT NOT NULL DEFAULT 0,
  investigations_limit INT NOT NULL DEFAULT 5,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, period_date),
  CONSTRAINT fk_quota_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Diagnostics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investigations (
  id CHAR(36) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  status VARCHAR(64) NOT NULL,
  -- Résumé court pour l'historique téléphone (évite de parser state_json)
  problem_summary VARCHAR(512) NULL,
  state_json LONGTEXT NOT NULL,
  organization_id VARCHAR(128) NULL,
  created_by_user_id VARCHAR(128) NULL,
  state_schema_version INT NOT NULL DEFAULT 2,
  state_revision INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_investigations_org_updated (organization_id, updated_at),
  KEY idx_investigations_org_status (organization_id, status, updated_at),
  KEY idx_investigations_user_updated (created_by_user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration douce si la table existait déjà (XAMPP / import partiel)
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

CREATE TABLE IF NOT EXISTS overlay_payloads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id CHAR(36) NOT NULL,
  step_id VARCHAR(128) NOT NULL,
  confidence_score DECIMAL(5,4) NULL,
  payload_json LONGTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_overlay_investigation (investigation_id, id),
  CONSTRAINT fk_overlay_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal des tours en espace d'attente (mémoire conversationnelle légère)
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
