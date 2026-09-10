-- USERS TABLE (same as before)
CREATE TABLE IF NOT EXISTS users (
    id        BIGSERIAL PRIMARY KEY,
    username  VARCHAR(100) NOT NULL,
    password  VARCHAR(255) NOT NULL,
    email     VARCHAR(150) NOT NULL,
    phone     VARCHAR(20),
    full_name VARCHAR(150),
    profile_picture TEXT,
    role      VARCHAR(50) NOT NULL DEFAULT 'USER',
    CONSTRAINT uk_users_email  UNIQUE (email),
    CONSTRAINT uk_users_phone  UNIQUE (phone)
);

-- RELATIONS TABLE (lookup: english / indian / generic display names)
CREATE TABLE IF NOT EXISTS relations (
    id                BIGSERIAL PRIMARY KEY,
    relation_name     VARCHAR(255) NOT NULL UNIQUE,
    english_relation  VARCHAR(255),
    indian_relation   VARCHAR(255),
    generic_relation  VARCHAR(255),
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