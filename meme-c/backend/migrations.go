package main

import (
	"database/sql"
	_ "github.com/lib/pq"
)

func runMigrations(db *sql.DB) error {
	stmts := []string{
		`
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
		`
CREATE TABLE IF NOT EXISTS user_sms_codes (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
		`CREATE INDEX IF NOT EXISTS idx_user_sms_codes_phone_created_at ON user_sms_codes (phone, created_at DESC);`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`,
		`
CREATE TABLE IF NOT EXISTS workshop_jobs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  text_content  TEXT NOT NULL,
  reference_id  TEXT NOT NULL DEFAULT '',
  mode          TEXT NOT NULL DEFAULT 'normal',
  speed         FLOAT8 NOT NULL DEFAULT 1.0,
  status        TEXT NOT NULL DEFAULT 'pending',
  error_msg     TEXT,
  audio_path    TEXT,
  segment_count INT NOT NULL DEFAULT 0,
  segments_done INT NOT NULL DEFAULT 0,
  favorite      BOOLEAN NOT NULL DEFAULT FALSE,
  disliked      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
		`CREATE INDEX IF NOT EXISTS idx_workshop_jobs_user_created ON workshop_jobs (user_id, created_at DESC);`,
		`
CREATE TABLE IF NOT EXISTS user_voices (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ready',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_voices_user_ref ON user_voices (user_id, reference_id);`,
		`CREATE INDEX IF NOT EXISTS idx_user_voices_user_created ON user_voices (user_id, created_at DESC);`,
		`
CREATE TABLE IF NOT EXISTS cluster_nodes (
  id              BIGSERIAL PRIMARY KEY,
  node_id         TEXT NOT NULL UNIQUE,
  tailscale_ip    TEXT NOT NULL,
  fish_port_base  INT NOT NULL DEFAULT 8080,
  gpu_count       INT NOT NULL DEFAULT 1,
  region          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active',
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
		`CREATE INDEX IF NOT EXISTS idx_cluster_nodes_last_seen ON cluster_nodes (last_seen_at DESC);`,
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
