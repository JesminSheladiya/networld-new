-- USERS TABLE (keep in sync with User entity; Hibernate ddl-auto=update
-- cannot add NOT NULL columns to a non-empty table, so fresh installs
-- must already contain email_verified / otp_attempts with defaults —
-- otherwise every /register INSERT fails with
-- 'column "email_verified" of relation "users" does not exist')
CREATE TABLE IF NOT EXISTS users (
    id        BIGSERIAL PRIMARY KEY,
    username  VARCHAR(100) NOT NULL,
    password  VARCHAR(255) NOT NULL,
    email     VARCHAR(150) NOT NULL,
    phone     VARCHAR(20),
    full_name VARCHAR(150),
    gender    VARCHAR(1),
    profile_picture TEXT,
    cover_image TEXT,
    birth_date DATE,
    bio VARCHAR(200),
    occupation VARCHAR(60),
    hide_cover BOOLEAN,
    hide_connections BOOLEAN,
    hide_contact_info BOOLEAN,
    role      VARCHAR(50) NOT NULL DEFAULT 'USER',
    relation_format VARCHAR(10),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    otp_hash VARCHAR(120),
    otp_expiry TIMESTAMPTZ,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    otp_sent_at TIMESTAMPTZ,
    CONSTRAINT uk_users_email  UNIQUE (email),
    CONSTRAINT uk_users_phone  UNIQUE (phone)
);
-- Backfill for databases created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_cover BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_connections BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_contact_info BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relation_format VARCHAR(10);
-- Legacy rows (created before OTP existed) count as verified.
UPDATE users SET email_verified = TRUE WHERE otp_hash IS NULL AND otp_sent_at IS NULL AND email_verified = FALSE;

-- RELATIONS TABLE (lookup: english / indian display names)
CREATE TABLE IF NOT EXISTS relations (
    id                BIGSERIAL PRIMARY KEY,
    relation_name     VARCHAR(255) NOT NULL UNIQUE,
    english_relation  VARCHAR(255),
    indian_relation   VARCHAR(255),
    generation_level  INTEGER NOT NULL DEFAULT 0,
    gender            VARCHAR(1) DEFAULT 'N',
    relation_category VARCHAR(20) DEFAULT 'OTHER',
    is_blood          BOOLEAN NOT NULL DEFAULT true
);

-- CONTACT TABLE (FK to relations + users; unique per owner, not globally —
-- two users must be able to save the same family number / email)
CREATE TABLE IF NOT EXISTS contact (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(150),
    phone           VARCHAR(20)  NOT NULL,
    email           VARCHAR(150) NOT NULL,
    relation_id     BIGINT,
    profile_picture TEXT,
    user_id         BIGINT,
    CONSTRAINT uk_contact_user_phone UNIQUE (user_id, phone),
    CONSTRAINT uk_contact_user_email UNIQUE (user_id, email),
    CONSTRAINT fk_contact_relation FOREIGN KEY (relation_id) REFERENCES relations(id),
    CONSTRAINT fk_contact_user     FOREIGN KEY (user_id)     REFERENCES users(id)
);
-- Migration for databases created with the old GLOBAL uniques:
-- drop them if present so shared numbers/emails no longer collide.
-- (Fresh tables get the per-user constraints from CREATE TABLE above;
-- pre-existing tables get them via Hibernate ddl-auto=update from the
-- Contact entity. No DO block here — Spring's SQL init splits on ';'
-- and cannot parse dollar-quoted bodies.)
ALTER TABLE contact DROP CONSTRAINT IF EXISTS uk_contact_phone;
ALTER TABLE contact DROP CONSTRAINT IF EXISTS uk_contact_email;

-- USER RELATIONS TABLE (connections between users)
CREATE TABLE IF NOT EXISTS user_relations (
    id          BIGSERIAL PRIMARY KEY,
    status      VARCHAR(20) NOT NULL,
    from_user_id BIGINT NOT NULL,
    relation_id BIGINT NOT NULL,
    to_user_id  BIGINT NOT NULL,
    CONSTRAINT uk_user_relations_from_to UNIQUE (from_user_id, to_user_id),
    CONSTRAINT fk_ur_from_user FOREIGN KEY (from_user_id) REFERENCES users(id),
    CONSTRAINT fk_ur_relation  FOREIGN KEY (relation_id)  REFERENCES relations(id),
    CONSTRAINT fk_ur_to_user   FOREIGN KEY (to_user_id)   REFERENCES users(id)
);

-- USER SESSIONS TABLE (one row per active login; deleting a row revokes it)
CREATE TABLE IF NOT EXISTS user_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    token_hash      VARCHAR(64) NOT NULL,
    device_info     VARCHAR(255),
    device_name     VARCHAR(100),
    ip_address      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_user_sessions_token UNIQUE (token_hash),
    CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id)
);
-- Upgrade path for early user_sessions tables that shipped without device_name.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_name VARCHAR(100);

-- USERNAME CHANGE HISTORY (Hibernate-managed entity; defined here so that
-- standalone psql runs also create it — previously only indexes referenced it)
CREATE TABLE IF NOT EXISTS username_change_history (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_unch_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- EMAIL OTP VERIFICATIONS (previously Hibernate-only; defined here so
-- standalone psql runs also create it with its index)
CREATE TABLE IF NOT EXISTS email_otp_verifications (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(255) NOT NULL UNIQUE,
    otp_hash     VARCHAR(120),
    otp_expiry   TIMESTAMPTZ,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    otp_sent_at  TIMESTAMPTZ,
    verified     BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at  TIMESTAMPTZ
);

-- INFERENCE RULES TABLE (category+gender pairs -> inferred relation name)
CREATE TABLE IF NOT EXISTS relation_inference_rules (
    id                     BIGSERIAL PRIMARY KEY,
    category_a             VARCHAR(20) NOT NULL,
    gender_a               VARCHAR(1)  NOT NULL,
    category_b             VARCHAR(20) NOT NULL,
    gender_b               VARCHAR(1)  NOT NULL,
    inferred_relation_name VARCHAR(100) NOT NULL,
    CONSTRAINT uk_inference_rule UNIQUE (category_a, gender_a, category_b, gender_b)
);

-- ══════════════════════════════════════════════════════════════════
-- 10M-USER PERFORMANCE INDEXES (run LAST — every table above exists now)
-- Every hot query path is covered below. All statements are IF NOT EXISTS
-- so every reboot is safe (missing indexes get created, present ones skip).
--
-- NOTE for a live table that already holds millions of rows: plain
-- CREATE INDEX takes a write lock while building. For zero-downtime
-- deploys, run the same definitions once with CONCURRENTLY during a
-- maintenance window instead, e.g.:
--   CREATE INDEX CONCURRENTLY idx_ur_from_status
--   ON user_relations(from_user_id, status);
-- ══════════════════════════════════════════════════════════════════

-- Trigram support for %search% matching (Find People, discover search).
-- Needs a privileged role once; on managed Postgres (RDS/Cloud SQL)
-- enable pg_trgm from the console instead if this line fails.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- users: case-insensitive username lookups (login identifier + availability).
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
-- users: case-insensitive email lookups (login identifier uses raw email OR
-- LOWER(username); availability + OTP flows hit email per keystroke).
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- users: global %LIKE% search (Find People page) via trigram. Expression
-- indexes match the actual query shape: LOWER(col) LIKE LOWER('%q%').
CREATE INDEX IF NOT EXISTS idx_users_fullname_trgm ON users USING gin (LOWER(full_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (LOWER(username) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users USING gin (LOWER(email) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_phone_trgm ON users USING gin (LOWER(phone) gin_trgm_ops);

-- contact: every query is scoped to one user's address book.
CREATE INDEX IF NOT EXISTS idx_contact_user ON contact(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_relation ON contact(relation_id);
-- contact: relation filter + per-user duplicate checks resolve from index.
CREATE INDEX IF NOT EXISTS idx_contact_user_relation ON contact(user_id, relation_id);

-- user_relations: every list starts from from_user_id + status
-- (connections, paged, counts, search). Composite order matters.
CREATE INDEX IF NOT EXISTS idx_ur_from_status ON user_relations(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ur_to_status ON user_relations(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ur_relation ON user_relations(relation_id);
CREATE INDEX IF NOT EXISTS idx_ur_status ON user_relations(status);
-- Covering indexes for the 100k-user hot paths: paged + relation-IN filter
-- + GROUP BY all resolve from the index without heap fetches; reverse
-- lookups (pending/sent/counts-of) use the to_user leg.
CREATE INDEX IF NOT EXISTS idx_ur_from_status_rel ON user_relations(from_user_id, status, relation_id);
CREATE INDEX IF NOT EXISTS idx_ur_to_status_from ON user_relations(to_user_id, status, from_user_id);

-- user_sessions: lookup by owner for session listing / revocation.
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- username_change_history: rolling 7-day window count + earliest lookup.
CREATE INDEX IF NOT EXISTS idx_unch_user_changed ON username_change_history(user_id, changed_at DESC);

-- relations: case-insensitive name lookup (tiny table, free to index).
CREATE INDEX IF NOT EXISTS idx_relations_name_lower ON relations (LOWER(relation_name));
