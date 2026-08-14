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

    public List<Relation> getAll() {
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