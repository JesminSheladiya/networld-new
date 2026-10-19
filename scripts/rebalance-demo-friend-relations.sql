-- Demo-data migration: replace accepted Friend rows with all compatible
-- relation-master entries. Run manually after taking a database backup.
-- It intentionally leaves PENDING, DECLINED and SUGGESTED rows untouched.

BEGIN;

CREATE TABLE friend_relation_migration_backup_20261019 AS
SELECT ur.id, ur.relation_id
FROM user_relations ur
JOIN relations r ON r.id = ur.relation_id
WHERE ur.status = 'ACCEPTED'
  AND LOWER(r.relation_name) = 'friend';

WITH relation_pool AS (
    SELECT 'M' AS target_gender, r.id,
           ROW_NUMBER() OVER (ORDER BY r.id) - 1 AS pool_index,
           COUNT(*) OVER () AS pool_size
    FROM relations r
    WHERE r.gender = 'M' AND LOWER(r.relation_name) <> 'friend'
    UNION ALL
    SELECT 'F' AS target_gender, r.id,
           ROW_NUMBER() OVER (ORDER BY r.id) - 1 AS pool_index,
           COUNT(*) OVER () AS pool_size
    FROM relations r
    WHERE r.gender = 'F' AND LOWER(r.relation_name) <> 'friend'
),
friend_rows AS (
    SELECT ur.id,
           CASE WHEN u.gender IN ('M', 'F') THEN u.gender ELSE NULL END AS target_gender,
           ROW_NUMBER() OVER (
               PARTITION BY u.gender
               ORDER BY ur.id
           ) - 1 AS row_index
    FROM user_relations ur
    JOIN relations old_rel ON old_rel.id = ur.relation_id
    JOIN users u ON u.id = ur.to_user_id
    WHERE ur.status = 'ACCEPTED'
      AND LOWER(old_rel.relation_name) = 'friend'
),
updates AS (
    SELECT f.id AS user_relation_id, p.id AS new_relation_id
    FROM friend_rows f
    JOIN relation_pool p
      ON p.target_gender = f.target_gender
     AND p.pool_index = MOD(f.row_index, p.pool_size)
    WHERE f.target_gender IS NOT NULL
)
UPDATE user_relations ur
SET relation_id = updates.new_relation_id
FROM updates
WHERE ur.id = updates.user_relation_id;

COMMIT;

-- Rollback, if needed:
-- UPDATE user_relations ur
-- SET relation_id = b.relation_id
-- FROM friend_relation_migration_backup_20261019 b
-- WHERE ur.id = b.id;
