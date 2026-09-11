package com.example.demo.service;

import com.example.demo.dto.InferredRelationDTO;
import com.example.demo.model.Contact;
import com.example.demo.model.Relation;
import com.example.demo.model.RelationInferenceRule;
import com.example.demo.model.User;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.RelationInferenceRuleRepository;
import com.example.demo.repository.RelationRepository;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class RelationService {

    private final RelationRepository relationRepository;
    private final ContactRepository contactRepository;
    private final RelationInferenceRuleRepository inferenceRuleRepository;

    public RelationService(RelationRepository relationRepository,
                           ContactRepository contactRepository,
                           RelationInferenceRuleRepository inferenceRuleRepository) {
        this.relationRepository = relationRepository;
        this.contactRepository = contactRepository;
        this.inferenceRuleRepository = inferenceRuleRepository;
    }

    // Selection lists only: generic duplicates are hidden because specific
    // variants cover them (Grandfather -> Paternal Grandfather,
    // Brother -> Elder/Younger Brother, Uncle -> Paternal/Maternal Uncle,
    // Nephew -> Brother's/Sister's Son, etc.). Chain relations
    // ("Brother's Brother-in-law", ...) STAY selectable: users see them in
    // suggestions and must be able to send them manually too (gender
    // compatibility is still validated on send). Rows stay in the DB
    // because the suggestion engine outputs these exact generic names.
    private static final java.util.Set<String> HIDDEN_FROM_SELECTION = java.util.Set.of(
            "cousin", "grandfather", "grandmother", "brother", "sister",
            "uncle", "aunt", "nephew", "niece");

    public List<Relation> getAll() {
        return relationRepository.findAll().stream()
                .filter(r -> !HIDDEN_FROM_SELECTION.contains(r.getRelationName().toLowerCase()))
                .sorted(SELECTION_ORDER)
                .collect(java.util.stream.Collectors.toList());
    }

    // Selection order: family first, then side by side, so similar
    // options always sit together ("Jija" next to "Jija (Behen ke Pati)"
    // instead of scattered pages apart — picking the wrong twin used to
    // store the wrong relation and derail future suggestions).
    // Rank 1: blood / immediate family (parents, spouse, siblings,
    // children, grandparents, grandchildren).
    // Rank 2: extended sides grouped together — paternal side (tau,
    // chacha, bua...) before maternal side (mama, mausi...), then
    // niblings and cousins.
    // Rank 3: in-laws grouped by base form, then everything else.
    // Within a group: plain name first, then variants A-Z. Deterministic
    // in Java (DB heap order can drift), so every picker everywhere shows
    // the same arrangement. Data-driven: future rows slot in automatically.
    private static final java.util.List<String> CATEGORY_ORDER = java.util.List.of(
            "PARENT", "SPOUSE", "SIBLING", "CHILD",
            "GRANDPARENT", "GRANDCHILD", "PIBLING", "NIBLING", "COUSIN",
            "INLAW", "OTHER");

    private static final java.util.Comparator<Relation> SELECTION_ORDER =
            java.util.Comparator
                    .comparingInt(RelationService::categoryRank)
                    .thenComparing(RelationService::orderKey)
                    .thenComparingInt(RelationService::sideRank)
                    .thenComparing(RelationService::baseForm)
                    .thenComparing(r -> isPlainForm(r) ? 0 : 1)
                    .thenComparing(r -> r.getRelationName().toLowerCase());

    // Couple-wise arrangement: husband immediately followed by wife, so a
    // pair is never split across the list (Devar-Devrani, Sadu-Sali,
    // Sasur-Saas, ...). Only categories with couples need explicit pairs;
    // everything unlisted (including future rows) falls back to the generic
    // side/base-form order below. Keys are lowercase relation names.
    private static final java.util.List<String> PIBLING_ORDER = java.util.List.of(
            "father elder brother", "father elder brother wife",
            "paternal uncle", "father younger brother wife",
            "father sister husband", "paternal aunt",
            "maternal uncle", "mother brother wife",
            "mother sister husband", "maternal aunt");

    private static final java.util.List<String> INLAW_ORDER = java.util.List.of(
            "brother-in-law",
            "brother-in-law (wife's brother)", "sister-in-law (wife's brother's wife)",
            "brother-in-law (wife's sister's husband)", "sister-in-law (wife's sister)",
            "brother-in-law (husband's brother)", "husband's brother's wife",
            "husband's elder brother", "husband's elder brother's wife",
            "husband's sister's husband",
            "sister-in-law",
            "child's spouse's father", "child's spouse's mother",
            "father-in-law", "mother-in-law",
            "son-in-law", "daughter-in-law");

    // Group key: explicit couple position when listed, else a shared
    // fallback bucket — the side/base keys after this do the rest, so
    // paternal sides (dada-dadi, paternal cousins) always precede maternal
    // ones while unlisted future rows still slot in sensibly.
    private static String orderKey(Relation r) {
        String name = r.getRelationName() == null ? "" : r.getRelationName().toLowerCase();
        String cat = r.getRelationCategory() == null ? "" : r.getRelationCategory().toUpperCase();
        int idx = -1;
        if ("PIBLING".equals(cat)) idx = PIBLING_ORDER.indexOf(name);
        else if ("INLAW".equals(cat)) idx = INLAW_ORDER.indexOf(name);
        if (idx >= 0) return "0:" + String.format("%03d", idx);
        return "1:";
    }

    private static int categoryRank(Relation r) {
        if (r.getRelationCategory() == null) return Integer.MAX_VALUE;
        int i = CATEGORY_ORDER.indexOf(r.getRelationCategory().toUpperCase());
        return i < 0 ? Integer.MAX_VALUE : i;
    }

    // Paternal side ("Paternal ...", "Father ...") before maternal side
    // ("Maternal ...", "Mother ..."); sideless names stay in place.
    private static int sideRank(Relation r) {
        String n = r.getRelationName() == null ? "" : r.getRelationName().toLowerCase();
        if (n.contains("paternal") || n.startsWith("father ")) return 0;
        if (n.contains("maternal") || n.startsWith("mother ")) return 1;
        return 2;
    }

    private static String baseForm(Relation r) {
        String g = r.getGenericRelation();
        return (g == null || g.isBlank() ? r.getRelationName() : g).toLowerCase();
    }

    private static boolean isPlainForm(Relation r) {
        return r.getRelationName() != null
                && r.getRelationName().equalsIgnoreCase(r.getGenericRelation());
    }

    // Complete display map (no filter): hidden engine-only rows (Brother,
    // Grandfather, ...) also carry indian/generic names, and every chip /
    // label in the app resolves through this — otherwise those fall back
    // to English regardless of the chosen format.
    public List<Relation> getAllForDisplay() {
        return relationRepository.findAll();
    }


    public List<InferredRelationDTO> inferRelations(User user) {

        // ── 1. Load only THIS user's contacts ──────────────────────────
        List<Contact> allContacts = contactRepository.findByUser(user);

        List<InferredRelationDTO> suggestions = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        // ── 2. Load inference rules into a map ─────────────────────────
        List<RelationInferenceRule> allRules = inferenceRuleRepository.findAll();
        System.out.println("=== RULES LOADED FROM DB: " + allRules.size());
        System.out.println("=== USER CONTACTS COUNT : " + allContacts.size());

        Map<String, String> rulesMap = new HashMap<>();
        for (RelationInferenceRule rule : allRules) {
            String key = rule.getCategoryA() + "|" + rule.getGenderA()
                    + "|" + rule.getCategoryB() + "|" + rule.getGenderB();
            rulesMap.put(key, rule.getInferredRelationName());
        }

        // ── 3. Compare every pair of this user's contacts ──────────────
        for (Contact contactA : allContacts) {
            Relation relA = contactA.getRelation();
            if (relA == null || relA.getRelationCategory() == null) continue;
            if (relA.getRelationCategory().equals("OTHER")) continue;

            String catA    = relA.getRelationCategory();
            String genderA = relA.getGender() != null ? relA.getGender() : "N";

            for (Contact contactB : allContacts) {
                if (contactA.getId().equals(contactB.getId())) continue;

                Relation relB = contactB.getRelation();
                if (relB == null || relB.getRelationCategory() == null) continue;
                if (relB.getRelationCategory().equals("OTHER")) continue;

                String catB    = relB.getRelationCategory();
                String genderB = relB.getGender() != null ? relB.getGender() : "N";

                // Try most-specific match first, then fallbacks
                String inferredName = rulesMap.get(catA + "|" + genderA + "|" + catB + "|" + genderB);
                if (inferredName == null)
                    inferredName = rulesMap.get(catA + "|" + genderA + "|" + catB + "|N");
                if (inferredName == null)
                    inferredName = rulesMap.get(catA + "|N|" + catB + "|" + genderB);
                if (inferredName == null)
                    inferredName = rulesMap.get(catA + "|N|" + catB + "|N");

                // ── 5. Generation-level fallback when no rule matches ──
                if (inferredName == null) {
                    inferredName = inferByGenerationLevel(relA, relB);
                }

                if (inferredName == null) continue;

                // Verify the inferred relation name exists in relations master
                Optional<Relation> inferredRelation =
                        relationRepository.findByRelationNameIgnoreCase(inferredName);
                if (inferredRelation.isEmpty()) continue;

                // Deduplicate A→B (we keep both A→B and B→A as separate suggestions)
                String dedupKey = contactA.getId() + "-" + contactB.getId();
                if (!seen.contains(dedupKey)) {
                    seen.add(dedupKey);
                    suggestions.add(new InferredRelationDTO(
                            contactA.getName(),
                            contactB.getName(),
                            inferredName
                    ));
                }
            }
        }

        System.out.println("=== TOTAL SUGGESTIONS FOR USER [" + user.getUsername() + "]: " + suggestions.size());
        return suggestions;
    }

    /**
     * Fallback inference using generation levels when no exact rule matches.
     * Compares generation levels of the two relations to determine
     * whether A is parent-like, child-like, or sibling-like to B.
     */
    private String inferByGenerationLevel(Relation relA, Relation relB) {
        int genA = relA.getGenerationLevel() != null ? relA.getGenerationLevel() : 0;
        int genB = relB.getGenerationLevel() != null ? relB.getGenerationLevel() : 0;
        int diff = genA - genB;
        String genderA = relA.getGender() != null ? relA.getGender() : "N";

        // Only handle blood relations with same blood status for consistency
        boolean isBloodA = relA.getIsBlood() != null && relA.getIsBlood();
        boolean isBloodB = relB.getIsBlood() != null && relB.getIsBlood();

        // Normalize: if both are blood, treat as blood relations
        boolean bothBlood = isBloodA && isBloodB;
        boolean neitherBlood = !isBloodA && !isBloodB;

        if (diff == 0) {
            // Same generation level → sibling-like
            if (bothBlood) {
                return genderA.equals("M") ? "Brother" : "Sister";
            } else if (neitherBlood) {
                // In-laws: brother-in-law / sister-in-law
                return genderA.equals("M") ? "Brother-in-law" : "Sister-in-law";
            } else {
                // Mixed: treat as in-law
                return genderA.equals("M") ? "Brother-in-law" : "Sister-in-law";
            }
        } else if (diff > 0) {
            // A is older generation than B → parent-like
            if (diff == 1) {
                // Direct parent-child
                if (bothBlood) {
                    return genderA.equals("M") ? "Father" : "Mother";
                } else {
                    return genderA.equals("M") ? "Father-in-law" : "Mother-in-law";
                }
            } else {
                // Grandparent / great-grandparent level
                if (bothBlood) {
                    return genderA.equals("M") ? "Grandfather" : "Grandmother";
                } else {
                    return genderA.equals("M") ? "Grandfather" : "Grandmother";
                }
            }
        } else {
            // A is younger generation than B → child-like
            if (diff == -1) {
                if (bothBlood) {
                    return genderA.equals("M") ? "Son" : "Daughter";
                } else {
                    return genderA.equals("M") ? "Son-in-law" : "Daughter-in-law";
                }
            } else {
                if (bothBlood) {
                    return genderA.equals("M") ? "Grandson" : "Granddaughter";
                } else {
                    return genderA.equals("M") ? "Grandson" : "Granddaughter";
                }
            }
        }
    }
}