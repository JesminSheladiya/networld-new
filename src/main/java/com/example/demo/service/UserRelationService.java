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

        // Cross-request guard: the other side already has a live row toward me.
        // A second opposite PENDING row would leave a stale request behind
        // after either side accepts — so block it and point at Requests.
        Optional<UserRelation> reverse = userRelationRepo.findByFromUserAndToUser(toUser, fromUser);
        if (reverse.isPresent() && "PENDING".equals(reverse.get().getStatus()))
            throw new RuntimeException("You already have a pending request from " + toEmail
                    + ". Please accept it from Requests instead.");
        if (reverse.isPresent() && "ACCEPTED".equals(reverse.get().getStatus()))
            throw new RuntimeException("Already connected!");

        Optional<UserRelation> existing = userRelationRepo.findByFromUserAndToUser(fromUser, toUser);
        // Only a live row blocks a fresh request — DECLINED / SUGGESTED /
        // DISMISSED rows are reused below. (SUGGESTED rows exist for pairs
        // the engine discovered; sending to them must stay possible.)
        if (existing.isPresent() && ("PENDING".equals(existing.get().getStatus())
                || "ACCEPTED".equals(existing.get().getStatus())))
            throw new RuntimeException("ACCEPTED".equals(existing.get().getStatus())
                    ? "Already connected!" : "Request already sent!");

        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new RuntimeException("Invalid relation!"));

        validateRelationGender(relation, toUser);

        if (existing.isPresent()) {
            // Reuse the declined row as a fresh request (keeps from/to unique)
            UserRelation ur = existing.get();
            ur.setRelation(relation);
            ur.setStatus("PENDING");
            userRelationRepo.save(ur);
        } else {
            userRelationRepo.save(new UserRelation(fromUser, toUser, relation, "PENDING"));
        }
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
        if (reverse == null && "N".equals(ur.getRelation().getGender())) {
            // Gender-neutral symmetric relations (e.g. Friend) mirror themselves
            reverse = ur.getRelation();
        }
        Optional<UserRelation> reverseOpt = userRelationRepo.findByFromUserAndToUser(currentUser, ur.getFromUser());
        if (reverseOpt.isEmpty()) {
            if (reverse != null) {
                userRelationRepo.save(new UserRelation(currentUser, ur.getFromUser(), reverse, "ACCEPTED"));
            }
        } else {
            // Merge a cross-request: my own opposite PENDING row (I had also
            // sent them a request) becomes ACCEPTED too, keeping the relation
            // *I* chose — each side keeps its own label, no stale request left.
            UserRelation rev = reverseOpt.get();
            if (!"ACCEPTED".equals(rev.getStatus())) {
                rev.setStatus("ACCEPTED");
                userRelationRepo.save(rev);
            }
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
        validateRelationGender(newRel, ur.getToUser());
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

    // Category grouping shared with the app tabs, driven by the master
    // relation_category column (NOT keywords): INLAW -> inlaws,
    // OTHER -> others, everything else -> family. New relations only need
    // the correct category — no code changes required.
    static String categoryOf(Relation rel) {
        if (rel == null || rel.getRelationCategory() == null) return "others";
        String c = rel.getRelationCategory().toUpperCase();
        if ("INLAW".equals(c)) return "inlaws";
        if ("OTHER".equals(c)) return "others";
        return "family";
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
            String cat = categoryOf(ur.getRelation());
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
        validateRelationGender(relation, otherUser);

        Optional<UserRelation> existing = userRelationRepo.findByFromUserAndToUser(currentUser, otherUser);
        if (existing.isPresent() && "ACCEPTED".equals(existing.get().getStatus()))
            throw new RuntimeException("Already connected!");
        if (existing.isPresent() && "PENDING".equals(existing.get().getStatus()))
            throw new RuntimeException("Request already sent!");
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

    // A gendered relation (M/F) can only go to a matching or neutral (N) user.
    // Neutral relations (Friend, Cousin, ...) are valid for everyone.
    static void validateRelationGender(Relation relation, User toUser) {
        String rg = relation.getGender();
        String ug = toUser.getGender();
        if (rg == null || ug == null || "N".equals(rg) || "N".equals(ug)) return;
        if (!rg.equals(ug)) {
            String who = "F".equals(ug) ? "female" : "male";
            throw new RuntimeException(
                    "'" + relation.getRelationName() + "' can only be sent to "
                    + ("F".equals(rg) ? "female" : "male") + " users, but "
                    + toUser.getEmail() + " is " + who + ".");
        }
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
        String g = genderSource.getGender();

        // Precise reverses first (generic alphabetical pick would be wrong here):
        // piblings <-> generic niblings, niblings <-> generic piblings,
        // elder <-> younger siblings (deterministic by age order).
        String preferred = preferredReverseName(rel.getRelationName(), g);
        if (preferred != null) {
            Optional<Relation> exact = relationRepository.findByRelationNameIgnoreCase(preferred);
            if (exact.isPresent()) return exact.get();
        }

        return relationRepository
                .findByRelationCategoryAndGenerationLevelAndGenderOrderByRelationName(reverseCategory, reverseLevel, g)
                .stream().findFirst().orElse(null);
    }

    // Exact reverse names where the generic alphabetical pick would be imprecise.
    // Returns null when the generic lookup is already precise.
    private static String preferredReverseName(String relationName, String requesterGender) {
        if (relationName == null) return null;
        boolean f = "F".equals(requesterGender);
        switch (relationName.toLowerCase()) {
            // paternal side -> son's children (NOT "Daughter's Son")
            case "paternal grandfather":
            case "paternal grandmother":
                return f ? "Granddaughter" : "Grandson";
            // maternal side -> daughter's children
            case "maternal grandfather":
            case "maternal grandmother":
                return f ? "Daughter's Daughter" : "Daughter's Son";
            // generic grandparent -> paternal default
            case "grandfather":
            case "grandmother":
                return f ? "Granddaughter" : "Grandson";
            // grandchild -> side-specific grandparent (NOT alphabetical-first
            // generic): daughter-line keeps maternal side, otherwise paternal
            // default — keeps downstream in-law inference correct.
            case "daughter's son":
                return "Maternal Grandfather";
            case "daughter's daughter":
                return "Maternal Grandmother";
            case "grandson":
                return "Paternal Grandfather";
            case "granddaughter":
                return "Paternal Grandmother";
            // piblings -> side-specific niblings (NOT generic Nephew):
            // father's side is brother-line, mother's side sister-line.
            case "uncle":
            case "aunt":
                return f ? "Niece" : "Nephew";
            case "paternal uncle":
            case "paternal aunt":
            case "father elder brother":
            case "father elder brother wife":
            case "father younger brother wife":
            case "father sister husband":
                return f ? "Brother Daughter" : "Brother Son";
            case "maternal uncle":
            case "maternal aunt":
            case "mother brother wife":
            case "mother sister husband":
                return f ? "Sister Daughter" : "Sister Son";
            // niblings -> generic piblings (NOT "Father Elder Brother" etc.)
            case "nephew":
            case "niece":
            case "brother son":
            case "brother daughter":
            case "sister son":
            case "sister daughter":
                return f ? "Aunt" : "Uncle";
            // elder <-> younger siblings (deterministic by age order)
            case "elder brother":
            case "elder sister":
                return f ? "Younger Sister" : "Younger Brother";
            case "younger brother":
            case "younger sister":
                return f ? "Elder Sister" : "Elder Brother";
            // generic siblings -> generic siblings (NOT "Elder ..." alphabetical pick)
            case "brother":
            case "sister":
                return f ? "Sister" : "Brother";
            // in-law specifics -> precise reverses (NOT alphabetical-first).
            // Each entry: recipient is sender's X; result describes sender as
            // seen by recipient, gender-aware (f = sender female).
            case "father-in-law":
                return f ? "Daughter-in-law" : "Son-in-law";
            case "mother-in-law":
                return f ? "Daughter-in-law" : "Son-in-law";
            case "son-in-law":
                return f ? "Mother-in-law" : "Father-in-law";
            case "daughter-in-law":
                return f ? "Mother-in-law" : "Father-in-law";
            case "brother-in-law":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "sister-in-law":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "brother-in-law (husband's brother)":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "sister-in-law (husband's sister)":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "brother-in-law (sister's husband)":
                return f ? "Sister-in-law (Wife's Sister)" : "Brother-in-law";
            case "sister-in-law (wife's sister)":
                return f ? "Sister-in-law" : "Brother-in-law (Sister's Husband)";
            case "brother-in-law (wife's brother)":
                return f ? "Sister-in-law" : "Brother-in-law (Sister's Husband)";
            case "brother-in-law (wife's sister's husband)":
                return f ? "Sister-in-law" : "Brother-in-law (Wife's Sister's Husband)";
            case "sister-in-law (wife's brother's wife)":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "husband's elder brother":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "husband's elder brother's wife":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "husband's sister's husband":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "husband's brother's wife":
                return f ? "Husband's Brother's Wife" : "Brother-in-law";
            case "child's spouse's father":
                return f ? "Child's Spouse's Mother" : "Child's Spouse's Father";
            case "child's spouse's mother":
                return f ? "Child's Spouse's Mother" : "Child's Spouse's Father";
            default:
                return null;
    }
    }
}