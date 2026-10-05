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
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    otp_hash VARCHAR(120),
    otp_expiry TIMESTAMPTZ,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    otp_sent_at TIMESTAMPTZ,
    CONSTRAINT uk_users_email  UNIQUE (email),
    CONSTRAINT uk_users_phone  UNIQUE (phone)
);
-- Backfill for databases created before email_verified / otp_attempts existed.
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

-- CONTACT TABLE (FK to relations)
CREATE TABLE IF NOT EXISTS contact (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(150),
    phone           VARCHAR(20)  NOT NULL,
    email           VARCHAR(150) NOT NULL,
    relation_id     BIGINT,
    profile_picture TEXT,
    user_id         BIGINT,
    CONSTRAINT uk_contact_phone    UNIQUE (phone),
    CONSTRAINT uk_contact_email    UNIQUE (email),
    CONSTRAINT fk_contact_relation FOREIGN KEY (relation_id) REFERENCES relations(id),
    CONSTRAINT fk_contact_user     FOREIGN KEY (user_id)     REFERENCES users(id)
);

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