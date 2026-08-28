-- Tarot Daily / Tarot Fortune Web App
-- Legacy MySQL/MariaDB schema. The Vercel deployment uses schema.vercel.sql instead.
-- Application timestamps are written in UTC; the UI displays Asia/Bangkok time.

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NULL,
    access_code_hash VARCHAR(255) NULL,
    access_code_hint VARCHAR(16) NULL,
    role ENUM('admin', 'beta_user') NOT NULL DEFAULT 'beta_user',
    status ENUM('active', 'suspended', 'expired') NOT NULL DEFAULT 'active',
    access_mode ENUM('beta_unlimited', 'credits') NOT NULL DEFAULT 'beta_unlimited',
    access_started_at DATETIME NULL,
    access_expires_at DATETIME NULL,
    credits INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    last_login_at DATETIME NULL,
    last_ai_used_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_status (role, status),
    KEY idx_users_expiry (access_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    question_hash CHAR(64) NOT NULL,
    question_text TEXT NULL,
    answer_text MEDIUMTEXT NULL,
    card_ids TEXT NOT NULL,
    model VARCHAR(120) NOT NULL,
    response_id VARCHAR(120) NULL,
    request_status ENUM('success', 'failed') NOT NULL DEFAULT 'failed',
    error_type VARCHAR(80) NULL,
    input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_ai_usage_user_time (user_id, created_at),
    KEY idx_ai_usage_status_time (request_status, created_at),
    CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
