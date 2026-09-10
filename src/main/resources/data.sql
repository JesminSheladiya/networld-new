-- =============================================
-- USERS
-- =============================================
--INSERT INTO users (username, password, email, role)
--VALUES ('admin',
--        '$2a$12$79.h960LXubRcFLEZeSdF.aeU0nJen.z6hrMXDq0DX/ET4ABsaJv6',
--        'admin@example.com', 'ADMIN')
--ON CONFLICT (email) DO NOTHING;

-- =============================================
-- RELATIONS MASTER DATA
-- =============================================
INSERT INTO relations (relation_name, generation_level, gender, relation_category, is_blood, english_relation, indian_relation, generic_relation) VALUES
('Grandfather', 2, 'M', 'GRANDPARENT', true, 'Grandfather', 'Dada', 'Grandfather'),
('Grandmother', 2, 'F', 'GRANDPARENT', true, 'Grandmother', 'Dadi', 'Grandmother'),
('Paternal Grandfather', 2, 'M', 'GRANDPARENT', true, 'Father''s Father', 'Dada', 'Paternal Grandfather'),
('Paternal Grandmother', 2, 'F', 'GRANDPARENT', true, 'Father''s Mother', 'Dadi', 'Paternal Grandmother'),
('Maternal Grandfather', 2, 'M', 'GRANDPARENT', true, 'Mother''s Father', 'Nana', 'Maternal Grandfather'),
('Maternal Grandmother', 2, 'F', 'GRANDPARENT', true, 'Mother''s Mother', 'Nani', 'Maternal Grandmother'),
('Father', 1, 'M', 'PARENT', true, 'Father', 'Papa/Pita', 'Father'),
('Mother', 1, 'F', 'PARENT', true, 'Mother', 'Maa/Mata', 'Mother'),
('Father Elder Brother', 1, 'M', 'PIBLING', true, 'Father''s Elder Brother', 'Tau/Taya', 'Father''s Elder Brother'),
('Father Elder Brother Wife', 1, 'F', 'PIBLING', true, 'Father''s Elder Brother''s Wife', 'Tai', 'Father''s Elder Brother''s Wife'),
('Father Younger Brother Wife', 1, 'F', 'PIBLING', true, 'Father''s Younger Brother''s Wife', 'Chachi', 'Father''s Younger Brother''s Wife'),
('Father Sister Husband', 1, 'M', 'PIBLING', true, 'Father''s Sister''s Husband', 'Fufa', 'Father''s Sister''s Husband'),
('Mother Brother Wife', 1, 'F', 'PIBLING', true, 'Mother''s Brother''s Wife', 'Mami', 'Mother''s Brother''s Wife'),
('Mother Sister Husband', 1, 'M', 'PIBLING', true, 'Mother''s Sister''s Husband', 'Mausa', 'Mother''s Sister''s Husband'),
('Son', -1, 'M', 'CHILD', true, 'Son', 'Beta', 'Son'),
('Daughter', -1, 'F', 'CHILD', true, 'Daughter', 'Beti', 'Daughter'),
('Brother Son', -1, 'M', 'NIBLING', true, 'Brother''s Son', 'Bhatija', 'Brother''s Son'),
('Brother Daughter', -1, 'F', 'NIBLING', true, 'Brother''s Daughter', 'Bhatiji', 'Brother''s Daughter'),
('Sister Son', -1, 'M', 'NIBLING', true, 'Sister''s Son', 'Bhanja', 'Sister''s Son'),
('Sister Daughter', -1, 'F', 'NIBLING', true, 'Sister''s Daughter', 'Bhanji', 'Sister''s Daughter'),
('Son-in-law', -1, 'M', 'INLAW', false, 'Daughter''s Husband', 'Damad', 'Son-in-law'),
('Daughter-in-law', -1, 'F', 'INLAW', false, 'Son''s Wife', 'Bahu', 'Daughter-in-law'),
('Nephew', -1, 'M', 'NIBLING', true, 'Nephew', 'Bhatija/Bhanja', 'Nephew'),
('Niece', -1, 'F', 'NIBLING', true, 'Niece', 'Bhatiji/Bhanji', 'Niece'),
('Grandson', -2, 'M', 'GRANDCHILD', true, 'Child''s Son', 'Pota', 'Grandson'),
('Granddaughter', -2, 'F', 'GRANDCHILD', true, 'Child''s Daughter', 'Poti', 'Granddaughter'),
('Friend', 0, 'N', 'OTHER', false, 'Friend', 'Dost', 'Friend'),
('Elder Brother', 0, 'M', 'SIBLING', true, 'Elder Brother', 'Bade Bhai', 'Elder Brother'),
('Elder Sister', 0, 'F', 'SIBLING', true, 'Elder Sister', 'Badi Behen', 'Elder Sister'),
('Younger Brother', 0, 'M', 'SIBLING', true, 'Younger Brother', 'Chhota Bhai', 'Younger Brother'),
('Younger Sister', 0, 'F', 'SIBLING', true, 'Younger Sister', 'Chhoti Behen', 'Younger Sister'),
('Cousin Brother', 0, 'M', 'COUSIN', true, 'Parent''s Sibling''s Son', 'Cousin Bhai', 'Cousin Brother'),
('Cousin Sister', 0, 'F', 'COUSIN', true, 'Parent''s Sibling''s Daughter', 'Cousin Behen', 'Cousin Sister'),
('Brother', 0, 'M', 'SIBLING', true, 'Brother', 'Bhai', 'Brother'),
('Sister', 0, 'F', 'SIBLING', true, 'Sister', 'Behen', 'Sister'),
('Uncle', 1, 'M', 'PIBLING', true, 'Uncle', 'Chacha/Mama', 'Uncle'),
('Aunt', 1, 'F', 'PIBLING', true, 'Aunt', 'Bua/Mausi', 'Aunt'),
('Husband', 0, 'M', 'SPOUSE', false, 'Husband', 'Pati', 'Husband'),
('Wife', 0, 'F', 'SPOUSE', false, 'Wife', 'Patni', 'Wife'),
('Father-in-law', 1, 'M', 'INLAW', false, 'Spouse''s Father', 'Sasur', 'Father-in-law'),
('Mother-in-law', 1, 'F', 'INLAW', false, 'Spouse''s Mother', 'Saas', 'Mother-in-law'),
('Brother-in-law', 0, 'M', 'INLAW', false, 'Brother-in-law', 'Devar/Jija', 'Brother-in-law'),
('Sister-in-law', 0, 'F', 'INLAW', false, 'Sister-in-law', 'Nanad/Sali', 'Sister-in-law'),
('Paternal Uncle', 1, 'M', 'PIBLING', true, 'Father''s Brother', 'Chacha', 'Paternal Uncle'),
('Paternal Aunt', 1, 'F', 'PIBLING', true, 'Father''s Sister', 'Bua', 'Paternal Aunt'),
('Maternal Uncle', 1, 'M', 'PIBLING', true, 'Mother''s Brother', 'Mama', 'Maternal Uncle'),
('Maternal Aunt', 1, 'F', 'PIBLING', true, 'Mother''s Sister', 'Mausi', 'Maternal Aunt'),
('Paternal Cousin Brother', 0, 'M', 'COUSIN', true, 'Father''s Brother''s Son', 'Chachera Bhai', 'Paternal Cousin Brother'),
('Paternal Cousin Sister', 0, 'F', 'COUSIN', true, 'Father''s Brother''s Daughter', 'Chacheri Behen', 'Paternal Cousin Sister'),
('Maternal Cousin Brother', 0, 'M', 'COUSIN', true, 'Mother''s Brother''s Son', 'Mamera Bhai', 'Maternal Cousin Brother'),
('Maternal Cousin Sister', 0, 'F', 'COUSIN', true, 'Mother''s Brother''s Daughter', 'Mameri Behen', 'Maternal Cousin Sister'),
('Daughter''s Son', -2, 'M', 'GRANDCHILD', true, 'Daughter''s Son', 'Nati', 'Grandson'),
('Daughter''s Daughter', -2, 'F', 'GRANDCHILD', true, 'Daughter''s Daughter', 'Natini', 'Granddaughter'),
('Brother-in-law (Wife''s Brother)', 0, 'M', 'INLAW', false, 'Wife''s Brother', 'Sala', 'Brother-in-law'),
('Sister-in-law (Wife''s Brother''s Wife)', 0, 'F', 'INLAW', false, 'Wife''s Brother''s Wife', 'Sarhaj', 'Sister-in-law'),
('Brother-in-law (Wife''s Sister''s Husband)', 0, 'M', 'INLAW', false, 'Wife''s Sister''s Husband', 'Sadu', 'Brother-in-law'),
('Child''s Spouse''s Father', 0, 'M', 'INLAW', false, 'Child''s Spouse''s Father', 'Samdhi', 'Co-father-in-law'),
('Child''s Spouse''s Mother', 0, 'F', 'INLAW', false, 'Child''s Spouse''s Mother', 'Samdhan', 'Co-mother-in-law'),
('Husband''s Sister''s Husband', 0, 'M', 'INLAW', false, 'Husband''s Sister''s Husband', 'Nandoi', 'Brother-in-law'),
('Husband''s Brother''s Wife', 0, 'F', 'INLAW', false, 'Husband''s Brother''s Wife', 'Devrani', 'Sister-in-law'),
('Husband''s Elder Brother', 0, 'M', 'INLAW', false, 'Husband''s Elder Brother', 'Jeth', 'Brother-in-law'),
('Husband''s Elder Brother''s Wife', 0, 'F', 'INLAW', false, 'Husband''s Elder Brother''s Wife', 'Jethani', 'Sister-in-law'),
('Brother-in-law (Husband''s Brother)', 0, 'M', 'INLAW', false, 'Husband''s Brother', 'Devar', 'Brother-in-law'),
('Sister-in-law (Husband''s Sister)', 0, 'F', 'INLAW', false, 'Husband''s Sister', 'Nanad', 'Sister-in-law'),
('Brother-in-law (Sister''s Husband)', 0, 'M', 'INLAW', false, 'Sister''s Husband', 'Jija', 'Brother-in-law'),
('Sister-in-law (Wife''s Sister)', 0, 'F', 'INLAW', false, 'Wife''s Sister', 'Sali', 'Sister-in-law')
ON CONFLICT (relation_name) DO UPDATE SET generation_level = EXCLUDED.generation_level, gender = EXCLUDED.gender, relation_category = EXCLUDED.relation_category, is_blood = EXCLUDED.is_blood, english_relation = EXCLUDED.english_relation, indian_relation = EXCLUDED.indian_relation, generic_relation = EXCLUDED.generic_relation;



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

-- CHILD + NIBLING → COUSIN (same as above, reversed)

-- =============================================
-- COUSIN Rules
-- =============================================

-- COUSIN + SIBLING → COUSIN (my cousin is also my sibling's cousin)

-- COUSIN + SIBLING (gender-specific cousin types)

-- COUSIN + CHILD → COUSIN

-- Cousin Brother + Cousin Sister → cousins to each other

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

-- COUSIN + COUSIN → both are cousins to each other

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