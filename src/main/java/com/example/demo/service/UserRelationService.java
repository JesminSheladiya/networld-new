package com.example.demo.service;

import com.example.demo.dto.UserRelationSuggestionDTO;
import com.example.demo.model.*;
import com.example.demo.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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

        Relation newRel = getRequiredRelation(relationName.trim());
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
                    Relation rel = ur.getRelation();
                    return new UserRelationSuggestionDTO(
                            ur.getId(), name, s.getEmail(), s.getPhone(), s.getProfilePicture(),
                            s.getGender(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            rel.getGenericRelation(),
                            name + " wants to add you as their " + rel.getRelationName(),
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
            Relation rel = ur.getRelation();
            return new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getGender(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    rel.getGenericRelation(),
                    null, "ACCEPTED");
        }).collect(Collectors.toList());
    }

    // Category grouping shared with the app tabs (keep keyword lists in sync
    // with UserRelationRepository pageFilteredConnections queries).
    // family  = main relations (parents, siblings, spouse, grandparents,
    //           grandchildren, uncles/aunts, nephews/nieces, elder/younger siblings,
    //           cousins (paternal/maternal))
    // inlaws  = *-in-law relations
    // others  = friend + anything else
    private static final List<String> FAMILY_KEYWORDS = List.of(
            "father", "mother", "brother", "sister", "son", "daughter",
            "husband", "wife", "grand", "uncle", "aunt", "nephew", "niece",
            "elder", "younger", "cousin", "paternal", "maternal");

    static String categoryOf(String relationName) {
        String r = relationName == null ? "" : relationName.toLowerCase();
        if (r.contains("in-law")) return "inlaws";
        if (r.contains("friend")) return "others";
        // 's means possessive like "uncle's son" -> family
        if (r.contains("'s")) return "family";
        for (String k : FAMILY_KEYWORDS) {
            if (r.contains(k)) return "family";
        }
        return "others";
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String normalizeCategory(String category) {
        if (category == null) return null;
        String c = category.trim().toLowerCase();
        return (c.equals("family") || c.equals("inlaws") || c.equals("others")) ? c : null;
    }

    public Page<UserRelationSuggestionDTO> getMyConnectionsPaged(
            User currentUser, String query, String category, List<String> relations, Pageable pageable) {
        String q = blankToNull(query);
        String c = normalizeCategory(category);
        Page<UserRelation> relationsPage = (relations != null && !relations.isEmpty())
                ? userRelationRepo.pageFilteredConnectionsByRelations(currentUser, q, c, relations, pageable)
                : userRelationRepo.pageFilteredConnections(currentUser, q, c, pageable);

        return relationsPage.map(ur -> {
            User o = ur.getToUser();
            String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
            Relation rel = ur.getRelation();
            return new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getGender(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    rel.getGenericRelation(),
                    null, "ACCEPTED");
        });
    }

    public Map<String, Long> getConnectionCounts(User currentUser, String query) {
        String q = blankToNull(query);
        List<UserRelation> list = (q == null)
                ? userRelationRepo.findByFromUserAndStatus(currentUser, "ACCEPTED")
                : userRelationRepo.searchAcceptedConnections(currentUser, q);

        Map<String, Long> counts = new HashMap<>();
        counts.put("all", (long) list.size());
        counts.put("family", 0L);
        counts.put("inlaws", 0L);
        counts.put("others", 0L);
        for (UserRelation ur : list) {
            String cat = categoryOf(ur.getRelation().getRelationName());
            counts.put(cat, counts.get(cat) + 1);
        }
        return counts;
    }

    public List<Map<String, Object>> getConnectionRelationCounts(User currentUser, String query) {
        String q = blankToNull(query);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] row : userRelationRepo.countConnectionsByRelation(currentUser, q)) {
            Map<String, Object> item = new HashMap<>();
            item.put("value", String.valueOf(row[0]));
            item.put("count", ((Number) row[1]).longValue());
            out.add(item);
        }
        return out;
    }

    @Transactional
    public List<UserRelationSuggestionDTO> getInferredSuggestions(User currentUser) {
        regenerateAllSuggestions(currentUser);

        return userRelationRepo.findByFromUserAndStatus(currentUser, "SUGGESTED")
                .stream().map(ur -> {
                    User o = ur.getToUser();
                    String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
                    Relation rel = ur.getRelation();
                    return new UserRelationSuggestionDTO(
                            ur.getId(), name, o.getEmail(), o.getPhone(), o.getProfilePicture(),
                            o.getGender(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            rel.getGenericRelation(),
                            "Discovered through your network connections",
                            "SUGGESTED");
                }).collect(Collectors.toList());
    }

    // Send a request based on a system suggestion → PENDING (not auto-accepted)
    @Transactional
    public void sendInferredSuggestionRequest(User currentUser, String otherEmail, String relationName) {
        User otherUser = userRepository.findByEmail(otherEmail)
                .orElseThrow(() -> new RuntimeException("User not found!"));

        Relation relation = getRequiredRelation(relationName);

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

    // Custom relations are disabled: only predefined relations from the
    // relations table are accepted. Unknown names are rejected.
    private Relation getRequiredRelation(String relationName) {
        return relationRepository.findByRelationNameIgnoreCase(relationName)
                .orElseThrow(() -> new RuntimeException(
                        "Unknown relation: " + relationName + ". Please choose from the list."));
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
                .findByRelationCategoryAndGenerationLevelAndGenderOrderByRelationName(reverseCategory, reverseLevel, genderSource.getGender())
                .stream().findFirst().orElse(null);
    }
}