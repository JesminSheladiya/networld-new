package com.example.demo.service;

import com.example.demo.dto.UserRelationSuggestionDTO;
import com.example.demo.model.*;
import com.example.demo.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserRelationService {

    private final UserRelationRepository userRelationRepo;
    private final UserRepository         userRepository;
    private final RelationRepository     relationRepository;
    private final RelationshipResolver   resolver;

    public UserRelationService(UserRelationRepository userRelationRepo,
                               UserRepository userRepository,
                               RelationRepository relationRepository,
                               RelationshipResolver resolver) {
        this.userRelationRepo   = userRelationRepo;
        this.userRepository     = userRepository;
        this.relationRepository = relationRepository;
        this.resolver           = resolver;
    }

    // User manually sends a relation request
    @Transactional
    public void sendRelationRequest(User fromUser, String toEmail, Long relationId) {
        User toUser = userRepository.findByEmail(toEmail)
                .orElseThrow(() -> new RuntimeException("User not found: " + toEmail));

        if (fromUser.getId().equals(toUser.getId()))
            throw new RuntimeException("Cannot add yourself!");

        if (userRelationRepo.findByFromUserAndToUser(fromUser, toUser).isPresent())
            throw new RuntimeException("Request already sent!");

        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new RuntimeException("Invalid relation!"));

        userRelationRepo.save(new UserRelation(fromUser, toUser, relation, "PENDING"));
    }

    // Accept a manually-sent or suggestion-based PENDING request
    @Transactional
    public void acceptRelation(Long id, User currentUser) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        if (!ur.getToUser().getId().equals(currentUser.getId()))
            throw new RuntimeException("Not authorized!");

        ur.setStatus("ACCEPTED");
        userRelationRepo.save(ur);

        Relation reverse = findReverseRelation(ur.getRelation(), ur.getFromUser());
        if (reverse != null && userRelationRepo.findByFromUserAndToUser(currentUser, ur.getFromUser()).isEmpty()) {
            userRelationRepo.save(new UserRelation(currentUser, ur.getFromUser(), reverse, "ACCEPTED"));
        }

        regenerateAllSuggestions(currentUser);
        regenerateAllSuggestions(ur.getFromUser());
    }

    // Edit ONLY the relation of an accepted connection (keeps reverse consistent)
    @Transactional
    public void editRelation(Long id, User currentUser, String relationName) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        boolean participant = ur.getFromUser().getId().equals(currentUser.getId())
                || ur.getToUser().getId().equals(currentUser.getId());
        if (!participant)
            throw new RuntimeException("Not authorized!");

        if (!"ACCEPTED".equals(ur.getStatus()))
            throw new RuntimeException("Only accepted relations can be edited!");

        if (relationName == null || relationName.isBlank())
            throw new RuntimeException("Relation name is required!");

        Relation newRel = getOrCreateRelation(relationName.trim());
        ur.setRelation(newRel);
        userRelationRepo.save(ur);

        Optional<UserRelation> reverseOpt = userRelationRepo.findByFromUserAndToUser(ur.getToUser(), ur.getFromUser());
        if (reverseOpt.isPresent() && "ACCEPTED".equals(reverseOpt.get().getStatus())) {
            Relation revRel = findReverseRelation(newRel, ur.getFromUser());
            if (revRel != null) {
                reverseOpt.get().setRelation(revRel);
                userRelationRepo.save(reverseOpt.get());
            }
        }

        regenerateAllSuggestions(ur.getFromUser());
        regenerateAllSuggestions(ur.getToUser());
    }

    @Transactional
    public void declineRelation(Long id, User currentUser) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        if (!ur.getToUser().getId().equals(currentUser.getId()))
            throw new RuntimeException("Not authorized!");

        ur.setStatus("DECLINED");
        userRelationRepo.save(ur);
    }

    public List<UserRelationSuggestionDTO> getPendingRequests(User currentUser) {
        return userRelationRepo.findByToUserAndStatus(currentUser, "PENDING")
                .stream()
                .map(ur -> {
                    User s = ur.getFromUser();
                    String name = s.getFullName() != null ? s.getFullName() : s.getDisplayName();
                    return new UserRelationSuggestionDTO(
                            ur.getId(), name, s.getEmail(), s.getPhone(), s.getProfilePicture(),
                            s.getGender(),
                            ur.getRelation().getRelationName(),
                            name + " wants to add you as their " + ur.getRelation().getRelationName(),
                            "PENDING");
                }).collect(Collectors.toList());
    }

    public List<UserRelationSuggestionDTO> getMyConnections(User currentUser, String query) {
        List<UserRelation> relations = (query == null || query.isBlank())
                ? userRelationRepo.findByFromUserAndStatus(currentUser, "ACCEPTED")
                : userRelationRepo.searchAcceptedConnections(currentUser, query.trim());

        return relations.stream().map(ur -> {
            User o = ur.getToUser();
            String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
            return new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getGender(),
                    ur.getRelation().getRelationName(), null, "ACCEPTED");
        }).collect(Collectors.toList());
    }

    @Transactional
    public List<UserRelationSuggestionDTO> getInferredSuggestions(User currentUser) {
        regenerateAllSuggestions(currentUser);

        return userRelationRepo.findByFromUserAndStatus(currentUser, "SUGGESTED")
                .stream().map(ur -> {
                    User o = ur.getToUser();
                    String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
                    return new UserRelationSuggestionDTO(
                            ur.getId(), name, o.getEmail(), o.getPhone(), o.getProfilePicture(),
                            o.getGender(),
                            ur.getRelation().getRelationName(),
                            "Discovered through your network connections",
                            "SUGGESTED");
                }).collect(Collectors.toList());
    }

    // Send a request based on a system suggestion → PENDING (not auto-accepted)
    @Transactional
    public void sendInferredSuggestionRequest(User currentUser, String otherEmail, String relationName) {
        User otherUser = userRepository.findByEmail(otherEmail)
                .orElseThrow(() -> new RuntimeException("User not found!"));

        Relation relation = getOrCreateRelation(relationName);

        Optional<UserRelation> existing = userRelationRepo.findByFromUserAndToUser(currentUser, otherUser);
        if (existing.isPresent()) {
            UserRelation ur = existing.get();
            ur.setRelation(relation);
            ur.setStatus("PENDING");
            userRelationRepo.save(ur);
        } else {
            userRelationRepo.save(new UserRelation(currentUser, otherUser, relation, "PENDING"));
        }

        regenerateAllSuggestions(currentUser);
        regenerateAllSuggestions(otherUser);
    }

    private Relation getOrCreateRelation(String relationName) {
        return relationRepository.findByRelationNameIgnoreCase(relationName)
                .orElseGet(() -> {
                    Relation newRel = new Relation();
                    newRel.setRelationName(relationName);
                    newRel.setRelationCategory("COUSIN");
                    newRel.setGenerationLevel(0);

                    String lower = relationName.toLowerCase();
                    if (lower.contains("daughter") || lower.contains("sister") || lower.contains("mother") || lower.contains("wife") || lower.contains("aunt") || lower.contains("niece") || lower.contains("girl") || lower.contains("female")) {
                        newRel.setGender("F");
                    } else if (lower.contains("son") || lower.contains("brother") || lower.contains("father") || lower.contains("husband") || lower.contains("uncle") || lower.contains("nephew") || lower.contains("boy") || lower.contains("male")) {
                        newRel.setGender("M");
                    } else {
                        newRel.setGender("N");
                    }

                    if (lower.contains("uncle") || lower.contains("aunt")) {
                        if (lower.contains("daughter") || lower.contains("son") || lower.contains("child")) {
                            newRel.setRelationCategory("COUSIN");
                            newRel.setGenerationLevel(0);
                        } else {
                            newRel.setRelationCategory("PIBLING");
                            newRel.setGenerationLevel(1);
                        }
                    } else if (lower.contains("cousin")) {
                        newRel.setRelationCategory("COUSIN");
                        newRel.setGenerationLevel(0);
                    } else if (lower.contains("father") || lower.contains("mother")) {
                        newRel.setGenerationLevel(1);
                        newRel.setRelationCategory("PARENT");
                    } else if (lower.contains("son") || lower.contains("daughter")) {
                        newRel.setGenerationLevel(-1);
                        newRel.setRelationCategory("CHILD");
                    } else if (lower.contains("nephew") || lower.contains("niece")) {
                        newRel.setGenerationLevel(-1);
                        newRel.setRelationCategory("NIBLING");
                    } else if (lower.contains("husband") || lower.contains("wife")) {
                        newRel.setGenerationLevel(0);
                        newRel.setRelationCategory("SPOUSE");
                    } else if (lower.contains("brother") || lower.contains("sister")) {
                        if (lower.contains("in-law") || lower.contains("law")) {
                            newRel.setRelationCategory("INLAW");
                        } else {
                            newRel.setRelationCategory("SIBLING");
                        }
                        newRel.setGenerationLevel(0);
                    }

                    return relationRepository.save(newRel);
                });
    }

    @Transactional
    public void dismissSuggestion(Long id, User currentUser) {
        userRelationRepo.findById(id).ifPresent(ur -> {
            if (ur.getFromUser().getId().equals(currentUser.getId())) {
                ur.setStatus("DISMISSED");
                userRelationRepo.save(ur);
            }
        });
    }

    // Rebuild every SUGGESTED entry for 'me' from the full accepted-relations graph.
    // Uses a Postgres advisory lock (held until transaction commit) so concurrent
    // regenerations from different users can't both insert the same SUGGESTED pair.
    @Transactional
    public void regenerateAllSuggestions(User me) {
        userRelationRepo.lockSuggestionRegeneration(48201927L);
        userRelationRepo.deleteAllSuggestionsFor(me);

        List<UserRelation> accepted = userRelationRepo.findByStatus("ACCEPTED");
        Map<Long, RelationshipResolver.RelResult> resolvedMap = resolver.resolveAll(accepted, me);

        List<User> allUsers = userRepository.findAll();

        for (User other : allUsers) {
            if (other.getId().equals(me.getId())) continue;

            Optional<UserRelation> existing = userRelationRepo.findByFromUserAndToUser(me, other);
            if (existing.isPresent() && !"SUGGESTED".equals(existing.get().getStatus())) continue;

            Optional<UserRelation> reverseExisting = userRelationRepo.findByFromUserAndToUser(other, me);
            if (reverseExisting.isPresent() && !"SUGGESTED".equals(reverseExisting.get().getStatus())) continue;

            RelationshipResolver.RelResult result = resolvedMap.get(other.getId());
            if (result == null || result.otherToMe == null || result.meToOther == null) continue;

            String otherToMe = result.otherToMe;
            String meToOther = result.meToOther;

            Optional<Relation> rel1 = relationRepository.findByRelationNameIgnoreCase(otherToMe);
            Optional<Relation> rel2 = relationRepository.findByRelationNameIgnoreCase(meToOther);
            if (rel1.isEmpty() || rel2.isEmpty()) continue;

            userRelationRepo.save(new UserRelation(me, other, rel1.get(), "SUGGESTED"));
            if (reverseExisting.isEmpty()) {
                userRelationRepo.save(new UserRelation(other, me, rel2.get(), "SUGGESTED"));
            }
        }
    }

    private static final Map<String, String> CATEGORY_REVERSE = Map.of(
            "PARENT", "CHILD",
            "CHILD", "PARENT",
            "SIBLING", "SIBLING",
            "SPOUSE", "SPOUSE",
            "GRANDPARENT", "GRANDCHILD",
            "GRANDCHILD", "GRANDPARENT",
            "INLAW", "INLAW",
            "PIBLING", "NIBLING",
            "NIBLING", "PIBLING",
            "COUSIN", "COUSIN"
    );

    // genderSource = person this reverse relation describes (ur.getFromUser())
    private Relation findReverseRelation(Relation rel, User genderSource) {
        if (rel == null || genderSource == null || genderSource.getGender() == null) return null;

        String reverseCategory = CATEGORY_REVERSE.get(rel.getRelationCategory());
        if (reverseCategory == null) return null;

        Integer reverseLevel = -rel.getGenerationLevel();

        return relationRepository
                .findByRelationCategoryAndGenerationLevelAndGender(reverseCategory, reverseLevel, genderSource.getGender())
                .orElse(null);
    }
}