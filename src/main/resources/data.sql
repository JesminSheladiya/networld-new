-- =============================================
-- USERS
-- =============================================
INSERT INTO users (username, password, email, role)
VALUES ('admin',
        '$2a$12$79.h960LXubRcFLEZeSdF.aeU0nJen.z6hrMXDq0DX/ET4ABsaJv6',
        'admin@example.com', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- RELATIONS MASTER DATA
-- =============================================
INSERT INTO relations (relation_name, generation_level, gender, relation_category, is_blood) VALUES
('Father',           1,  'M', 'PARENT',     true),
('Mother',           1,  'F', 'PARENT',     true),
('Brother',          0,  'M', 'SIBLING',    true),
('Sister',           0,  'F', 'SIBLING',    true),
('Son',             -1,  'M', 'CHILD',      true),
('Daughter',        -1,  'F', 'CHILD',      true),
('Grandfather',      2,  'M', 'GRANDPARENT', true),
('Grandmother',      2,  'F', 'GRANDPARENT', true),
('Grandson',        -2,  'M', 'GRANDCHILD', true),
('Granddaughter',   -2,  'F', 'GRANDCHILD', true),
('Uncle',           1,   'M', 'OTHER',      true),
('Aunt',            1,   'F', 'OTHER',      true),
('Cousin',          0,   'N', 'OTHER',      true),
('Cousin Brother',  0,   'M', 'OTHER',      true),
('Cousin Sister',   0,   'F', 'OTHER',      true),
('Husband',          0,  'M', 'SPOUSE',     false),
('Wife',             0,  'F', 'SPOUSE',     false),
('Nephew',          -1,  'M', 'OTHER',      true),
('Niece',           -1,  'F', 'OTHER',      true),
('Father-in-law',    1,  'M', 'INLAW',      false),
('Mother-in-law',    1,  'F', 'INLAW',      false),
('Son-in-law',      -1,  'M', 'INLAW',      false),
('Daughter-in-law', -1,  'F', 'INLAW',      false),
('Brother-in-law',   0,  'M', 'INLAW',      false),
('Sister-in-law',    0,  'F', 'INLAW',      false),
('Uncle''s Daughter', 0, 'F', 'COUSIN',     true),
('Uncle''s Son',      0, 'M', 'COUSIN',     true),
('Aunt''s Daughter',  0, 'F', 'COUSIN',     true),
('Aunt''s Son',       0, 'M', 'COUSIN',     true)
ON CONFLICT (relation_name) DO UPDATE SET generation_level = EXCLUDED.generation_level, gender = EXCLUDED.gender, relation_category = EXCLUDED.relation_category, is_blood = EXCLUDED.is_blood;


UPDATE relations SET relation_category = 'PARENT'
    WHERE LOWER(relation_name) IN ('father','mother') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'SIBLING'
    WHERE LOWER(relation_name) IN ('brother','sister') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'CHILD'
    WHERE LOWER(relation_name) IN ('son','daughter') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'SPOUSE'
    WHERE LOWER(relation_name) IN ('husband','wife') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'GRANDPARENT'
    WHERE LOWER(relation_name) IN ('grandfather','grandmother') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'GRANDCHILD'
    WHERE LOWER(relation_name) IN ('grandson','granddaughter') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'INLAW'
    WHERE LOWER(relation_name) IN ('father-in-law','mother-in-law','son-in-law','daughter-in-law','brother-in-law','sister-in-law') AND (relation_category IS NULL OR relation_category = 'OTHER');
UPDATE relations SET relation_category = 'OTHER'
    WHERE LOWER(relation_name) IN ('uncle','aunt','cousin','nephew','niece') AND relation_category IS NULL;
UPDATE relations SET relation_category = 'PIBLING'
    WHERE LOWER(relation_name) IN ('uncle','aunt') AND (relation_category = 'OTHER' OR relation_category IS NULL);
UPDATE relations SET relation_category = 'NIBLING'
    WHERE LOWER(relation_name) IN ('nephew','niece') AND (relation_category = 'OTHER' OR relation_category IS NULL);
UPDATE relations SET relation_category = 'COUSIN'
    WHERE LOWER(relation_name) IN ('cousin','cousin brother','cousin sister') AND (relation_category = 'OTHER' OR relation_category IS NULL);

INSERT INTO relations (relation_name, generation_level, gender, relation_category, is_blood) VALUES ('Friend', 0, 'N', 'OTHER', false)
ON CONFLICT (relation_name) DO NOTHING;


-- =============================================
-- SAMPLE CONTACTS
-- =============================================
--INSERT INTO contact (name, phone, email, relation_id)
--SELECT 'John Doe', '9876543210', 'john@example.com', r.id
--FROM relations r WHERE r.relation_name = 'Brother'
--ON CONFLICT (phone) DO NOTHING;
--
--INSERT INTO contact (name, phone, email, relation_id)
--SELECT 'Jane Doe', '9876543211', 'jane@example.com', r.id
--FROM relations r WHERE r.relation_name = 'Sister'
--ON CONFLICT (phone) DO NOTHING;

-- =============================================
-- INFERENCE RULES
-- =============================================
INSERT INTO relation_inference_rules
    (category_a, gender_a, category_b, gender_b, inferred_relation_name) VALUES

-- SIBLING + SIBLING
('SIBLING','M','SIBLING','M','Brother'),
('SIBLING','M','SIBLING','F','Brother'),
('SIBLING','F','SIBLING','M','Sister'),
('SIBLING','F','SIBLING','F','Sister'),

-- PARENT + PARENT → Spouse
('PARENT','M','PARENT','F','Husband'),
('PARENT','F','PARENT','M','Wife'),

('PARENT','M','PARENT','M','Brother'),
('PARENT','F','PARENT','F','Sister'),
('PARENT','N','PARENT','M','Brother'),
('PARENT','N','PARENT','F','Sister'),
('PARENT','N','PARENT','N','Brother'),

-- PARENT + SIBLING → Parent of sibling
('PARENT','M','SIBLING','M','Father'),
('PARENT','M','SIBLING','F','Father'),
('PARENT','F','SIBLING','M','Mother'),
('PARENT','F','SIBLING','F','Mother'),

-- SIBLING + PARENT → Child of parent
('SIBLING','M','PARENT','M','Son'),
('SIBLING','M','PARENT','F','Son'),
('SIBLING','F','PARENT','M','Daughter'),
('SIBLING','F','PARENT','F','Daughter'),

-- CHILD + CHILD → Siblings
('CHILD','M','CHILD','M','Brother'),
('CHILD','M','CHILD','F','Brother'),
('CHILD','F','CHILD','M','Sister'),
('CHILD','F','CHILD','F','Sister'),

-- PARENT + CHILD → Grandparent of grandchild
('PARENT','M','CHILD','M','Grandfather'),
('PARENT','M','CHILD','F','Grandfather'),
('PARENT','F','CHILD','M','Grandmother'),
('PARENT','F','CHILD','F','Grandmother'),

-- CHILD + PARENT → Grandchild of grandparent
('CHILD','M','PARENT','M','Grandson'),
('CHILD','M','PARENT','F','Grandson'),
('CHILD','F','PARENT','M','Granddaughter'),
('CHILD','F','PARENT','F','Granddaughter'),

-- GRANDPARENT + PARENT
('GRANDPARENT','M','PARENT','M','Father'),
('GRANDPARENT','M','PARENT','F','Father-in-law'),
('GRANDPARENT','F','PARENT','M','Mother'),
('GRANDPARENT','F','PARENT','F','Mother-in-law'),

-- GRANDPARENT + SIBLING
('GRANDPARENT','M','SIBLING','M','Grandfather'),
('GRANDPARENT','M','SIBLING','F','Grandfather'),
('GRANDPARENT','F','SIBLING','M','Grandmother'),
('GRANDPARENT','F','SIBLING','F','Grandmother'),

-- GRANDPARENT + CHILD
('GRANDPARENT','M','CHILD','M','Grandfather'),
('GRANDPARENT','M','CHILD','F','Grandfather'),
('GRANDPARENT','F','CHILD','M','Grandmother'),
('GRANDPARENT','F','CHILD','F','Grandmother'),

-- GRANDPARENT + SPOUSE
('GRANDPARENT','M','SPOUSE','M','Father-in-law'),
('GRANDPARENT','M','SPOUSE','F','Father-in-law'),
('GRANDPARENT','F','SPOUSE','M','Mother-in-law'),
('GRANDPARENT','F','SPOUSE','F','Mother-in-law'),

-- GRANDCHILD + PARENT
('GRANDCHILD','M','PARENT','M','Grandson'),
('GRANDCHILD','M','PARENT','F','Grandson'),
('GRANDCHILD','F','PARENT','M','Granddaughter'),
('GRANDCHILD','F','PARENT','F','Granddaughter'),

-- GRANDCHILD + SIBLING
('GRANDCHILD','M','SIBLING','M','Grandson'),
('GRANDCHILD','M','SIBLING','F','Grandson'),
('GRANDCHILD','F','SIBLING','M','Granddaughter'),
('GRANDCHILD','F','SIBLING','F','Granddaughter'),

-- SPOUSE + SIBLING
('SPOUSE','M','SIBLING','M','Father'),
('SPOUSE','M','SIBLING','F','Father'),
('SPOUSE','F','SIBLING','M','Mother'),
('SPOUSE','F','SIBLING','F','Mother'),

-- SPOUSE + CHILD
('SPOUSE','M','CHILD','M','Father'),
('SPOUSE','M','CHILD','F','Father'),
('SPOUSE','F','CHILD','M','Mother'),
('SPOUSE','F','CHILD','F','Mother'),

-- SPOUSE + PARENT
('SPOUSE','M','PARENT','M','Son-in-law'),
('SPOUSE','M','PARENT','F','Son-in-law'),
('SPOUSE','F','PARENT','M','Daughter-in-law'),
('SPOUSE','F','PARENT','F','Daughter-in-law'),

-- SIBLING + CHILD → Uncle/Aunt
('SIBLING','M','CHILD','M','Uncle'),
('SIBLING','M','CHILD','F','Uncle'),
('SIBLING','F','CHILD','M','Aunt'),
('SIBLING','F','CHILD','F','Aunt'),

-- CHILD + SIBLING → Nephew/Niece
('CHILD','M','SIBLING','M','Nephew'),
('CHILD','M','SIBLING','F','Nephew'),
('CHILD','F','SIBLING','M','Niece'),
('CHILD','F','SIBLING','F','Niece'),

-- INLAW + PARENT
('INLAW','M','PARENT','M','Son-in-law'),
('INLAW','M','PARENT','F','Son-in-law'),
('INLAW','F','PARENT','M','Daughter-in-law'),
('INLAW','F','PARENT','F','Daughter-in-law'),

-- INLAW + SIBLING
('INLAW','M','SIBLING','M','Brother-in-law'),
('INLAW','M','SIBLING','F','Brother-in-law'),
('INLAW','F','SIBLING','M','Sister-in-law'),
('INLAW','F','SIBLING','F','Sister-in-law'),

-- INLAW + SPOUSE
('INLAW','M','SPOUSE','M','Brother-in-law'),
('INLAW','M','SPOUSE','F','Brother-in-law'),
('INLAW','F','SPOUSE','M','Sister-in-law'),
('INLAW','F','SPOUSE','F','Sister-in-law'),

-- PARENT + INLAW
('PARENT','M','INLAW','M','Father-in-law'),
('PARENT','M','INLAW','F','Father-in-law'),
('PARENT','F','INLAW','M','Mother-in-law'),
('PARENT','F','INLAW','F','Mother-in-law'),

-- SIBLING + INLAW
('SIBLING','M','INLAW','M','Brother-in-law'),
('SIBLING','M','INLAW','F','Brother-in-law'),
('SIBLING','F','INLAW','M','Sister-in-law'),
('SIBLING','F','INLAW','F','Sister-in-law'),

-- =============================================
-- PIBLING (Parent's Sibling = Uncle/Aunt) Rules
-- =============================================

-- PIBLING + SIBLING → same PIBLING (my uncle is also my sibling's uncle)
('PIBLING','M','SIBLING','M','Uncle'),
('PIBLING','M','SIBLING','F','Uncle'),
('PIBLING','F','SIBLING','M','Aunt'),
('PIBLING','F','SIBLING','F','Aunt'),

-- SIBLING + PIBLING → NIBLING (sibling of uncle's sibling = nephew/niece)
('SIBLING','M','PIBLING','M','Nephew'),
('SIBLING','M','PIBLING','F','Nephew'),
('SIBLING','F','PIBLING','M','Niece'),
('SIBLING','F','PIBLING','F','Niece'),

-- PIBLING + CHILD → COUSIN (my uncle's child = cousin of my child)
('PIBLING','M','CHILD','M','Cousin'),
('PIBLING','M','CHILD','F','Cousin'),
('PIBLING','F','CHILD','M','Cousin'),
('PIBLING','F','CHILD','F','Cousin'),

-- CHILD + PIBLING → NIBLING (my child is nephew/niece of my uncle)
('CHILD','M','PIBLING','M','Nephew'),
('CHILD','M','PIBLING','F','Nephew'),
('CHILD','F','PIBLING','M','Niece'),
('CHILD','F','PIBLING','F','Niece'),

-- =============================================
-- NIBLING (Nephew/Niece) Rules
-- =============================================

-- NIBLING + SIBLING → CHILD (my nephew is my sibling's child)
('NIBLING','M','SIBLING','M','Son'),
('NIBLING','M','SIBLING','F','Son'),
('NIBLING','F','SIBLING','M','Daughter'),
('NIBLING','F','SIBLING','F','Daughter'),

-- SIBLING + NIBLING → PIBLING (my sibling's child's uncle/aunt = me)
('SIBLING','M','NIBLING','M','Uncle'),
('SIBLING','M','NIBLING','F','Uncle'),
('SIBLING','F','NIBLING','M','Aunt'),
('SIBLING','F','NIBLING','F','Aunt'),

-- NIBLING + CHILD → COUSIN (my nephew + my child = cousins)
('NIBLING','M','CHILD','M','Cousin'),
('NIBLING','M','CHILD','F','Cousin'),
('NIBLING','F','CHILD','M','Cousin'),
('NIBLING','F','CHILD','F','Cousin'),

-- CHILD + NIBLING → COUSIN (same as above, reversed)
('CHILD','M','NIBLING','M','Cousin'),
('CHILD','M','NIBLING','F','Cousin'),
('CHILD','F','NIBLING','M','Cousin'),
('CHILD','F','NIBLING','F','Cousin'),

-- =============================================
-- COUSIN Rules
-- =============================================

-- COUSIN + SIBLING → COUSIN (my cousin is also my sibling's cousin)
('COUSIN','N','SIBLING','M','Cousin'),
('COUSIN','N','SIBLING','F','Cousin'),
('SIBLING','M','COUSIN','N','Cousin'),
('SIBLING','F','COUSIN','N','Cousin'),

-- COUSIN + SIBLING (gender-specific cousin types)
('COUSIN','M','SIBLING','M','Cousin'),
('COUSIN','M','SIBLING','F','Cousin'),
('COUSIN','F','SIBLING','M','Cousin'),
('COUSIN','F','SIBLING','F','Cousin'),
('SIBLING','M','COUSIN','M','Cousin'),
('SIBLING','M','COUSIN','F','Cousin'),
('SIBLING','F','COUSIN','M','Cousin'),
('SIBLING','F','COUSIN','F','Cousin'),

-- COUSIN + CHILD → COUSIN
('COUSIN','N','CHILD','M','Cousin'),
('COUSIN','N','CHILD','F','Cousin'),
('CHILD','M','COUSIN','N','Cousin'),
('CHILD','F','COUSIN','N','Cousin'),
('COUSIN','M','CHILD','M','Cousin'),
('COUSIN','M','CHILD','F','Cousin'),
('COUSIN','F','CHILD','M','Cousin'),
('COUSIN','F','CHILD','F','Cousin'),
('CHILD','M','COUSIN','M','Cousin'),
('CHILD','M','COUSIN','F','Cousin'),
('CHILD','F','COUSIN','M','Cousin'),
('CHILD','F','COUSIN','F','Cousin'),

-- Cousin Brother + Cousin Sister → cousins to each other
('COUSIN','M','COUSIN','F','Cousin'),
('COUSIN','F','COUSIN','M','Cousin'),

-- =============================================
-- PIBLING + PIBLING / NIBLING + NIBLING cross
-- =============================================

-- PIBLING + PIBLING → SIBLING (two uncles/aunts are siblings)
('PIBLING','M','PIBLING','M','Brother'),
('PIBLING','M','PIBLING','F','Brother'),
('PIBLING','F','PIBLING','M','Sister'),
('PIBLING','F','PIBLING','F','Sister'),

-- NIBLING + NIBLING → SIBLING (two nephews/nieces are siblings)
('NIBLING','M','NIBLING','M','Brother'),
('NIBLING','M','NIBLING','F','Brother'),
('NIBLING','F','NIBLING','M','Sister'),
('NIBLING','F','NIBLING','F','Sister'),

-- PIBLING + NIBLING → COUSIN (uncle + nephew → cousin? Actually they can't be directly inferred)
('PIBLING','M','NIBLING','M','Cousin'),
('PIBLING','M','NIBLING','F','Cousin'),
('PIBLING','F','NIBLING','M','Cousin'),
('PIBLING','F','NIBLING','F','Cousin'),
('NIBLING','M','PIBLING','M','Cousin'),
('NIBLING','M','PIBLING','F','Cousin'),
('NIBLING','F','PIBLING','M','Cousin'),
('NIBLING','F','PIBLING','F','Cousin'),

-- COUSIN + COUSIN → both are cousins to each other
('COUSIN','N','COUSIN','N','Cousin'),
('COUSIN','M','COUSIN','M','Cousin'),
('COUSIN','F','COUSIN','F','Cousin'),

-- COUSIN + PIBLING → NIBLING (my cousin to my uncle = nephew/niece of uncle)
('COUSIN','N','PIBLING','M','Nephew'),
('COUSIN','N','PIBLING','F','Niece'),
('COUSIN','M','PIBLING','M','Nephew'),
('COUSIN','M','PIBLING','F','Niece'),
('COUSIN','F','PIBLING','M','Nephew'),
('COUSIN','F','PIBLING','F','Niece'),
('PIBLING','M','COUSIN','N','Nephew'),
('PIBLING','F','COUSIN','N','Niece'),
('PIBLING','M','COUSIN','M','Nephew'),
('PIBLING','M','COUSIN','F','Niece'),
('PIBLING','F','COUSIN','M','Nephew'),
('PIBLING','F','COUSIN','F','Niece'),

-- COUSIN + NIBLING → COUSIN (my cousin + my nephew = also cousins)
('COUSIN','N','NIBLING','M','Cousin'),
('COUSIN','N','NIBLING','F','Cousin'),
('COUSIN','M','NIBLING','M','Cousin'),
('COUSIN','M','NIBLING','F','Cousin'),
('COUSIN','F','NIBLING','M','Cousin'),
('COUSIN','F','NIBLING','F','Cousin'),
('NIBLING','M','COUSIN','N','Cousin'),
('NIBLING','F','COUSIN','N','Cousin'),
('NIBLING','M','COUSIN','M','Cousin'),
('NIBLING','M','COUSIN','F','Cousin'),
('NIBLING','F','COUSIN','M','Cousin'),
('NIBLING','F','COUSIN','F','Cousin'),

-- =============================================
-- PARENT + PIBLING → SIBLING (my parent + my uncle = siblings)
-- =============================================
('PARENT','M','PIBLING','M','Brother'),
('PARENT','M','PIBLING','F','Brother'),
('PARENT','F','PIBLING','M','Sister'),
('PARENT','F','PIBLING','F','Sister'),
('PIBLING','M','PARENT','M','Brother'),
('PIBLING','M','PARENT','F','Brother'),
('PIBLING','F','PARENT','M','Sister'),
('PIBLING','F','PARENT','F','Sister')

ON CONFLICT (category_a, gender_a, category_b, gender_b) DO UPDATE SET inferred_relation_name = EXCLUDED.inferred_relation_name;