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
        // Younger/Elder precision when both birth dates are known.
        relation = refineSiblingByAge(relation, fromUser, toUser);

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
        // Younger/Elder precision on the accepted row too when both birth
        // dates are known (describer = sender, described = recipient).
        ur.setRelation(refineSiblingByAge(ur.getRelation(), ur.getFromUser(), currentUser));
        userRelationRepo.save(ur);

        Relation reverse = findReverseRelation(ur.getRelation(), ur.getFromUser());
        if (reverse == null && "N".equals(ur.getRelation().getGender())) {
            // Gender-neutral symmetric relations (e.g. Friend) mirror themselves
            reverse = ur.getRelation();
        }
        if (reverse != null) {
            // Reverse describes the sender as seen by me.
            reverse = refineSiblingByAge(reverse, currentUser, ur.getFromUser());
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

    // Privacy: strip what the target hides from this viewer. Avatar, name,
    // username, gender and bio always stay visible (relation pickers and
    // lists need gender everywhere — privacy applies on profile pages only).
    // Email stays in transport (it keys navigation/actions) — display layers
    // hide it when contact info is private.
    // Connected viewers (and self) are exempt — they see everything.
    private static UserRelationSuggestionDTO applyProfilePrivacy(
            String viewerEmail, User target, boolean connected,
            UserRelationSuggestionDTO dto) {
        if (target.hidesCoverFrom(viewerEmail, connected)) {
            // Frosted server-side preview (never the original bytes).
            dto.setSuggestedUserCoverImage(
                    com.example.demo.util.ImagePrivacy.blurredCoverOrNull(
                            dto.getSuggestedUserCoverImage()));
            dto.setCoverHidden(true);
        }
        if (target.hidesContactInfoFrom(viewerEmail, connected)) {
            dto.setSuggestedUserPhone(null);
            dto.setSuggestedUserBirthDate(null);
            dto.setContactInfoHidden(true);
        }
        return dto;
    }

    // Accepted relation in either direction (accept writes both rows).
    private boolean areConnected(User a, User b) {
        if (a == null || b == null) return false;
        return userRelationRepo.findByFromUserAndToUser(a, b)
                        .map(ur -> "ACCEPTED".equals(ur.getStatus())).orElse(false)
                || userRelationRepo.findByFromUserAndToUser(b, a)
                        .map(ur -> "ACCEPTED".equals(ur.getStatus())).orElse(false);
    }

    public List<UserRelationSuggestionDTO> getPendingRequests(User currentUser) {        return userRelationRepo.findByToUserAndStatus(currentUser, "PENDING")
                .stream()
                .map(ur -> {
                    User s = ur.getFromUser();
                    String name = s.getFullName() != null ? s.getFullName() : s.getDisplayName();
                    Relation rel = ur.getRelation();
                    UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                            ur.getId(), name, s.getDisplayName(), s.getEmail(), s.getPhone(), s.getProfilePicture(),
                            s.getCoverImage(),
                            s.getGender(), s.getBirthDate(), s.getBio(), s.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            name + " wants to add you as their " + rel.getRelationName(),
                            "PENDING");
                    return applyProfilePrivacy(currentUser.getEmail(), s, false, dto);
                }).collect(Collectors.toList());
    }

    // Outgoing PENDING rows — requests I sent that are still awaiting a reply.
    // DECLINED rows are excluded (a cancelled/declined request resets to fresh
    // state, same as search-users). Cancelled rows reuse the DECLINED status
    // so a later re-send reuses the row (keeps from/to unique).
    public List<UserRelationSuggestionDTO> getSentRequests(User currentUser) {
        return userRelationRepo.findByFromUserAndStatus(currentUser, "PENDING")
                .stream()
                .map(ur -> {
                    User t = ur.getToUser();
                    String name = t.getFullName() != null ? t.getFullName() : t.getDisplayName();
                    Relation rel = ur.getRelation();
                    UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                            ur.getId(), name, t.getDisplayName(), t.getEmail(), t.getPhone(), t.getProfilePicture(),
                            t.getCoverImage(),
                            t.getGender(), t.getBirthDate(), t.getBio(), t.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "You asked " + name + " to be your " + rel.getRelationName(),
                            "PENDING");
                    return applyProfilePrivacy(currentUser.getEmail(), t, false, dto);
                }).collect(Collectors.toList());
    }

    // Sender withdraws their own outgoing PENDING request.
    @Transactional
    public void cancelSentRequest(Long id, User currentUser) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        if (!ur.getFromUser().getId().equals(currentUser.getId()))
            throw new RuntimeException("Not authorized!");

        if (!"PENDING".equals(ur.getStatus()))
            throw new RuntimeException("Request is no longer pending!");

        ur.setStatus("DECLINED");
        userRelationRepo.save(ur);
    }

    public List<UserRelationSuggestionDTO> getMyConnections(User currentUser, String query) {
        return getMyConnections(currentUser, query, currentUser.getEmail(), null);
    }

    // viewerConnEmailsOrNull: viewer's accepted-connection emails (both
    // directions, lowercased). Null = viewer owns this list → no stripping.
    private List<UserRelationSuggestionDTO> getMyConnections(
            User currentUser, String query, String viewerEmail,
            java.util.Set<String> viewerConnEmailsOrNull) {        List<UserRelation> relations = (query == null || query.isBlank())
                ? userRelationRepo.findByFromUserAndStatus(currentUser, "ACCEPTED")
                : userRelationRepo.searchAcceptedConnections(currentUser, query.trim(), true);

        return relations.stream().map(ur -> {
            User o = ur.getToUser();
            String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
            Relation rel = ur.getRelation();
            UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    null, "ACCEPTED");
        boolean visibleToViewer = viewerConnEmailsOrNull == null
                || (o.getEmail() != null && viewerConnEmailsOrNull.contains(o.getEmail().toLowerCase()));
        return applyProfilePrivacy(viewerEmail, o, visibleToViewer, dto);
        }).collect(Collectors.toList());
    }

    // Any user's accepted connections (accept creates reverse rows, so this
    // is complete for every user — no private filtering by design).
    // Shape: { total, items }. Items the viewer may not see come back empty
    // (connections hidden); total always shows. Viewer sees their own all.
    public java.util.Map<String, Object> getConnectionsOf(String viewerEmail, String email) {
        User target = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        boolean self = target.getEmail() != null && viewerEmail != null
                && target.getEmail().equalsIgnoreCase(viewerEmail);
        java.util.Set<String> viewerConns = null;
        if (!self) {
            User viewer = viewerEmail == null
                    ? null
                    : userRepository.findByEmail(viewerEmail).orElse(null);
            viewerConns = new java.util.HashSet<>();
            if (viewer != null) {
                for (UserRelation ur : userRelationRepo.findByFromUserAndStatus(viewer, "ACCEPTED")) {
                    if (ur.getToUser().getEmail() != null)
                        viewerConns.add(ur.getToUser().getEmail().toLowerCase());
                }
                for (UserRelation ur : userRelationRepo.findByToUserAndStatus(viewer, "ACCEPTED")) {
                    if (ur.getFromUser().getEmail() != null)
                        viewerConns.add(ur.getFromUser().getEmail().toLowerCase());
                }
            }
        }
        List<UserRelationSuggestionDTO> all =
                getMyConnections(target, null, viewerEmail, viewerConns);
        boolean connectedToOwner = self || (viewerConns != null
                && target.getEmail() != null
                && viewerConns.contains(target.getEmail().toLowerCase()));
        List<UserRelationSuggestionDTO> visible =
                target.hidesConnectionsFrom(viewerEmail, connectedToOwner)
                        ? java.util.List.of()
                        : all;
        java.util.Map<String, Object> out = new java.util.HashMap<>();
        out.put("total", all.size());
        out.put("items", visible);
        return out;
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
            User currentUser, String query, String category, List<String> relations, boolean includePhone, Pageable pageable) {
        String q = blankToNull(query);
        String c = normalizeCategory(category);
        Page<UserRelation> relationsPage = (relations != null && !relations.isEmpty())
                ? userRelationRepo.pageFilteredConnectionsByRelations(currentUser, q, c, relations, includePhone, pageable)
                : userRelationRepo.pageFilteredConnections(currentUser, q, c, includePhone, pageable);

        return relationsPage.map(ur -> {
            User o = ur.getToUser();
            String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
            Relation rel = ur.getRelation();
            UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    null, "ACCEPTED");
        return applyProfilePrivacy(currentUser.getEmail(), o, true, dto);
        });
    }

    public Map<String, Long> getConnectionCounts(User currentUser, String query, boolean includePhone) {
        String q = blankToNull(query);
        List<UserRelation> list = (q == null)
                ? userRelationRepo.findByFromUserAndStatus(currentUser, "ACCEPTED")
                : userRelationRepo.searchAcceptedConnections(currentUser, q, includePhone);

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

    public List<Map<String, Object>> getConnectionRelationCounts(User currentUser, String query, boolean includePhone) {
        String q = blankToNull(query);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] row : userRelationRepo.countConnectionsByRelation(currentUser, q, includePhone)) {
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
            UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), o.getProfilePicture(),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "Discovered through your network connections",
                            "SUGGESTED");
                    return applyProfilePrivacy(currentUser.getEmail(), o, false, dto);
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

    // Younger/Elder precision: a generic Brother/Sister becomes the exact
    // age variant when BOTH birth dates are known (described older than
    // describer = Elder, else Younger; same date keeps generic). Only the
    // generic pair is ever refined — explicit Elder/Younger choices and all
    // other relations pass through untouched, as does anything with unknown
    // dates or a gender-neutral described user. describer = the viewer,
    // described = the person the row talks about.
    private Relation refineSiblingByAge(Relation rel, User describer, User described) {
        if (rel == null) return null;
        if (!"SIBLING".equalsIgnoreCase(rel.getRelationCategory())) return rel;
        String n = rel.getRelationName() == null ? "" : rel.getRelationName().trim();
        boolean male;
        if ("Brother".equalsIgnoreCase(n)) male = true;
        else if ("Sister".equalsIgnoreCase(n)) male = false;
        else return rel;
        if (describer == null || described == null
                || describer.getBirthDate() == null || described.getBirthDate() == null) return rel;
        if (rel.getGender() == null || !rel.getGender().equals(described.getGender())) return rel;
        int cmp = described.getBirthDate().compareTo(describer.getBirthDate());
        if (cmp == 0) return rel;
        String want = (cmp < 0 ? "Elder " : "Younger ") + (male ? "Brother" : "Sister");
        return relationRepository.findByRelationNameIgnoreCase(want).orElse(rel);
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
    //
    // ONE-SIDED WRITES: only me -> other rows are written here, never
    // other -> me. The reverse direction belongs to other's own regeneration
    // (their words for me can legitimately differ from my generic reverse,
    // e.g. chain relations). Writing both sides caused last-writer-wins
    // flapping between asymmetric pairs.
    @Transactional
    public void regenerateAllSuggestions(User me) {
        userRelationRepo.lockSuggestionRegeneration(48201927L);
        userRelationRepo.deleteAllSuggestionsFor(me);

        List<UserRelation> accepted = userRelationRepo.findByStatus("ACCEPTED");
        Map<Long, RelationshipResolver.RelResult> resolvedMap = resolver.resolveAll(accepted, me);

        // Accepted adjacency for chain bridges: fromUserId -> (toUserId -> relationName).
        Map<Long, Map<Long, String>> adjLabels = new HashMap<>();
        Map<Long, User> usersById = new HashMap<>();
        for (UserRelation ur : accepted) {
            adjLabels.computeIfAbsent(ur.getFromUser().getId(), k -> new HashMap<>())
                    .put(ur.getToUser().getId(), ur.getRelation().getRelationName());
            usersById.put(ur.getFromUser().getId(), ur.getFromUser());
            usersById.put(ur.getToUser().getId(), ur.getToUser());
        }
        Map<Long, Map<Long, RelationshipResolver.RelResult>> inferredCache = new HashMap<>();
        Map<String, Relation> relationCache = new HashMap<>();

        List<User> allUsers = userRepository.findAll();

        for (User other : allUsers) {
            if (other.getId().equals(me.getId())) continue;

            Optional<UserRelation> existing = userRelationRepo.findByFromUserAndToUser(me, other);
            if (existing.isPresent() && !"SUGGESTED".equals(existing.get().getStatus())) continue;

            Optional<UserRelation> reverseExisting = userRelationRepo.findByFromUserAndToUser(other, me);
            if (reverseExisting.isPresent() && !"SUGGESTED".equals(reverseExisting.get().getStatus())) continue;

            RelationshipResolver.RelResult result = resolvedMap.get(other.getId());

            String genericName = (result == null) ? null : result.otherToMe;
            Optional<Relation> genericRel = (genericName == null) ? Optional.empty()
                    : relationRepository.findByRelationNameIgnoreCase(genericName);
            if (genericRel.isEmpty() && genericName != null) {
                genericRel = relationRepository.findByEnglishRelationIgnoreCase(genericName);
            }

            // Distant/unnamed pairs get a descriptive chain ("Brother's
            // Brother-in-law") composed through a bridge person; close blood
            // truths always keep their generic label. Every NON-BLOOD generic
            // is also a chain candidate — a plain "Sister-in-law" is ambiguous
            // (Brother's Wife vs Husband's Sister vs Wife's Sister are
            // different seats in Indian kinship), while the composed chain
            // names the actual path exactly. Chains only win when a curated
            // master row matches; otherwise the generic stands.
            boolean keepGeneric = genericRel.isPresent()
                    && Boolean.TRUE.equals(genericRel.get().getIsBlood());
            String chainName = keepGeneric ? null
                    : composeChain(me, other, resolvedMap, accepted, adjLabels, usersById,
                            inferredCache, relationCache);

            String finalName;
            if (chainName != null) {
                finalName = chainName;
            } else if (genericRel.isPresent()) {
                finalName = genericName;
            } else {
                continue;
            }

            Optional<Relation> finalRel = relationRepository.findByRelationNameIgnoreCase(finalName);
            if (finalRel.isEmpty()) {
                finalRel = relationRepository.findByEnglishRelationIgnoreCase(finalName);
            }
            if (finalRel.isEmpty()) continue;
            // Younger/Elder precision on suggestions too (describer = me).
            finalRel = Optional.of(refineSiblingByAge(finalRel.get(), me, other));

            if (existing.isPresent()) {
                UserRelation ur = existing.get();
                ur.setRelation(finalRel.get());
                userRelationRepo.save(ur);
            } else {
                userRelationRepo.save(new UserRelation(me, other, finalRel.get(), "SUGGESTED"));
            }
        }
    }

    // First-link categories for chain composition: simple blood ties only.
    // Spouse/in-law/nibling/cousin links are excluded (spouse-led chains
    // collapse into existing in-law rows; compound words like "Brother Son"
    // read poorly as chain heads). Piblings ARE included — uncle/aunt-led
    // chains are exactly how cousin seats resolve ("Father Sister" + "Son"
    // = Fufera Bhai); misses simply fall through to the generic label.
    private static final java.util.Set<String> CHAIN_HEAD_CATEGORIES = java.util.Set.of(
            "PARENT", "CHILD", "SIBLING", "GRANDPARENT", "GRANDCHILD", "PIBLING");

    // Seat-identical side wordings: "Paternal Aunt" IS "Father Sister" (no
    // elder/younger split exists for aunts, maternal uncles/aunts). Used as
    // extra chain-head forms. Deliberately NOT mapped: "Paternal Uncle"
    // (elder Tau vs younger Chacha is unknowable) and grandparents.
    private static final java.util.Map<String, String> PIBLING_SYNONYMS = java.util.Map.of(
            "paternal aunt", "father sister",
            "maternal uncle", "mother brother",
            "maternal aunt", "mother sister");

    // Compose a descriptive chain relation ("Brother's Brother-in-law") for a
    // distant pair via a bridge person X: "<my label for X>'s <X's label for
    // target>". Both links may be accepted or inferred-close; the composed
    // name must match a curated chain row or nothing is returned (caller
    // keeps the generic label). Correct by construction: a possessive of two
    // true links. Deterministic: accepted bridges first, then by name.
    private String composeChain(User me, User other,
            Map<Long, RelationshipResolver.RelResult> egoMap,
            List<UserRelation> accepted,
            Map<Long, Map<Long, String>> adjLabels,
            Map<Long, User> usersById,
            Map<Long, Map<Long, RelationshipResolver.RelResult>> inferredCache,
            Map<String, Relation> relationCache) {
        List<Long> bridges = new ArrayList<>(egoMap.keySet());
        bridges.remove(me.getId());
        bridges.remove(other.getId());
        Set<Long> acceptedContacts =
                adjLabels.getOrDefault(me.getId(), java.util.Collections.emptyMap()).keySet();
        bridges.sort((a, b) -> {
            boolean aa = acceptedContacts.contains(a);
            boolean ab = acceptedContacts.contains(b);
            if (aa != ab) return aa ? -1 : 1;
            return Long.compare(a, b);
        });

        java.util.Map<Long, String> myLabels =
                adjLabels.getOrDefault(me.getId(), java.util.Collections.emptyMap());

        for (Long bridgeId : bridges) {
            RelationshipResolver.RelResult head = egoMap.get(bridgeId);
            if (head == null || head.otherToMe == null) continue;
            // Head wordings to try: the resolver's label plus my own chosen
            // label for a directly-added bridge (the resolver generalizes
            // "Father Younger Brother" → "Paternal Uncle", which would make
            // exact chains unresolvable) plus seat-identical synonyms
            // ("Paternal Aunt" IS "Father Sister").
            java.util.LinkedHashSet<String> headForms = new java.util.LinkedHashSet<>();
            headForms.add(head.otherToMe);
            String directEdge = myLabels.get(bridgeId);
            if (directEdge != null) headForms.add(directEdge);
            for (String hf : new java.util.ArrayList<>(headForms)) {
                String syn = PIBLING_SYNONYMS.get(hf.toLowerCase());
                if (syn != null) headForms.add(syn);
            }

            // Second link: bridge's own accepted wording first, else bridge's inference.
            String tailName = adjLabels.getOrDefault(bridgeId, java.util.Collections.emptyMap())
                    .get(other.getId());
            if (tailName == null) {
                User bridge = usersById.get(bridgeId);
                if (bridge == null) continue;
                Map<Long, RelationshipResolver.RelResult> bridgeMap =
                        inferredCache.computeIfAbsent(bridgeId,
                                k -> resolver.resolveAll(accepted, bridge));
                RelationshipResolver.RelResult tail = bridgeMap.get(other.getId());
                if (tail == null || tail.otherToMe == null) continue;
                tailName = tail.otherToMe;
            }
            final String tailKey = tailName;
            Relation tailRow = relationCache.computeIfAbsent(tailKey.toLowerCase(),
                    k -> relationRepository.findByRelationNameIgnoreCase(tailKey).orElse(null));
            if (tailRow == null) continue;
            // Chain tail uses the relation's own name (e.g. "Son's
            // Father-in-law"); the old generic display label is gone.
            // If the exact tail has no chain row, retry with its base form
            // ("Sister-in-law (Husband's Sister)" -> "Sister-in-law"):
            // generalizing an exact tail preserves truth ("Sister's
            // Sister-in-law" still describes her exactly).
            String tailGeneric = tailName;
            Optional<Relation> hit = Optional.empty();
            for (String hf : headForms) {
                Relation hr = relationOf(hf, relationCache);
                // Gate on the REAL row; synonyms inherit it (a synonym is
                // not itself a master row, so it can never pass the gate).
                if (!isChainHead(hr)) continue;
                hit = findChainRowCandidate(hf, tailGeneric);
                if (hit.isEmpty()) {
                    String syn = PIBLING_SYNONYMS.get(hf.toLowerCase());
                    if (syn != null) hit = findChainRowCandidate(syn, tailGeneric);
                }
                if (hit.isEmpty()) {
                    // Married-in pibling heads (Chachi, Mami, Fufa, Mausa,
                    // Tai) carry the spouse suffix — the bloodline is the
                    // head minus that suffix ("Father Sister Husband" +
                    // "Son" is really "Father Sister's Son" = Fufera Bhai).
                    String stripped = strippedPiblingHead(hf, hr);
                    if (stripped != null) {
                        hit = findChainRowCandidate(stripped, tailGeneric);
                    }
                }
                if (hit.isPresent()) break;
            }
            if (hit.isPresent()) return hit.get().getRelationName();
        }
        return null;
    }

    // Bridge-head gate: simple blood ties only. Spouse/in-law/nibling/
    // cousin links are excluded (spouse-led chains collapse into existing
    // in-law rows); piblings ARE allowed — uncle/aunt-led chains are exactly
    // how cousin seats (Tayera, Fufera, Masera, ...) resolve.
    private static boolean isChainHead(Relation headRow) {
        return headRow != null
                && Boolean.TRUE.equals(headRow.getIsBlood())
                && CHAIN_HEAD_CATEGORIES.contains(
                        headRow.getRelationCategory() != null
                                ? headRow.getRelationCategory().toUpperCase() : "");
    }

    // Master-row lookup with the shared cache (cache holds nulls too —
    // HashMap, so a second lookup for the same miss stays free).
    private Relation relationOf(String name, Map<String, Relation> relationCache) {
        String key = name.toLowerCase();
        if (relationCache.containsKey(key)) return relationCache.get(key);
        Relation rel = relationRepository.findByRelationNameIgnoreCase(name).orElse(null);
        relationCache.put(key, rel);
        return rel;
    }

    // Curated chain-row lookup for a composed "<Head>'s <Tail>" path:
    // relation_name first, then english_relation (first-order chains like
    // "Brother's Wife" live there), then the same two with a parenthesized
    // tail generalized ("Sister-in-law (Husband's Sister)" → "Sister-in-law").
    private Optional<Relation> findChainRowCandidate(String head, String tailGeneric) {
        String candidate = head + "'s " + tailGeneric;
        Optional<Relation> hit = relationRepository.findByRelationNameIgnoreCase(candidate);
        if (hit.isPresent()) return hit;
        hit = relationRepository.findByEnglishRelationIgnoreCase(candidate);
        if (hit.isPresent()) return hit;
        int paren = tailGeneric.indexOf(" (");
        if (paren > 0) {
            candidate = head + "'s " + tailGeneric.substring(0, paren);
            hit = relationRepository.findByRelationNameIgnoreCase(candidate);
            if (hit.isPresent()) return hit;
            hit = relationRepository.findByEnglishRelationIgnoreCase(candidate);
        }
        return hit;
    }

    // Married-in pibling head ("Father Sister Husband") → bloodline head
    // ("Father Sister") for chain composition, or null when not applicable.
    private static String strippedPiblingHead(String headName, Relation headRel) {
        if (headName == null || headRel == null) return null;
        if (!"PIBLING".equalsIgnoreCase(headRel.getRelationCategory())) return null;
        if (headName.endsWith(" Husband")) {
            return headName.substring(0, headName.length() - " Husband".length());
        }
        if (headName.endsWith(" Wife")) {
            return headName.substring(0, headName.length() - " Wife".length());
        }
        return null;
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
            // chain relations ("Brother's Brother-in-law", ...): reverse to
            // the generic in-law by the sender's gender — always valid, and
            // the paired chain on the other side is computed by that side's
            // own composition (which the accept flow preserves).
            case "brother's brother-in-law":
            case "sister's brother-in-law":
            case "son's brother-in-law":
            case "daughter's brother-in-law":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "sister's sister-in-law":
            case "daughter's sister-in-law":
            case "brother's sister-in-law":
            case "son's sister-in-law":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "son's father-in-law":
                // Paired chains, exact in both directions (samdhi is samdhi
                // back): my son's father-in-law sees me as his daughter's
                // father/mother-in-law, gender-matched — and mirrored.
                return f ? "Daughter's Mother-in-law" : "Daughter's Father-in-law";
            case "daughter's father-in-law":
                return f ? "Son's Mother-in-law" : "Son's Father-in-law";
            case "son's mother-in-law":
                return f ? "Daughter's Mother-in-law" : "Daughter's Father-in-law";
            case "daughter's mother-in-law":
                return f ? "Son's Mother-in-law" : "Son's Father-in-law";
            // First-order chain with no plain fallback: the reverse names the
            // exact counter-seat (row added to master).
            case "brother-in-law (sister's husband)":
                return f ? "Sister-in-law (Wife's Sister)" : "Brother-in-law (Wife's Brother)";
            case "brother's son-in-law":
            case "sister's son-in-law":
            case "son's son-in-law":
            case "daughter's son-in-law":
                return f ? "Daughter-in-law" : "Son-in-law";
            case "brother's daughter-in-law":
            case "sister's daughter-in-law":
            case "son's daughter-in-law":
            case "daughter's daughter-in-law":
                return f ? "Daughter-in-law" : "Son-in-law";
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
            case "father younger brother":
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
                return f ? "Sister-in-law (Brother's Wife)" : null;
            case "sister-in-law (husband's sister)":
                return f ? "Sister-in-law (Brother's Wife)" : null;
            case "sister-in-law (brother's wife)":
                return f ? "Sister-in-law (Husband's Sister)" : "Brother-in-law (Husband's Brother)";
            case "sister-in-law (wife's sister)":
                return f ? null : "Brother-in-law (Sister's Husband)";
            case "brother-in-law (wife's brother)":
                return f ? null : "Brother-in-law (Sister's Husband)";
            case "brother-in-law (wife's sister's husband)":
                return f ? "Sister-in-law" : "Brother-in-law (Wife's Sister's Husband)";
            case "sister-in-law (wife's brother's wife)":
                return f ? "Sister-in-law" : "Brother-in-law";
            case "husband's elder brother":
                return f ? "Sister-in-law (Brother's Wife)" : "Brother-in-law";
            case "husband's elder brother's wife":
                return f ? "Husband's Brother's Wife" : "Brother-in-law";
            case "husband's sister's husband":
                return f ? "Sister-in-law (Wife's Brother's Wife)" : "Brother-in-law";
            case "husband's brother's wife":
                return f ? "Husband's Brother's Wife" : "Brother-in-law";
            case "child's father-in-law":
                return f ? "Child's Mother-in-law" : "Child's Father-in-law";
            case "child's mother-in-law":
                return f ? "Child's Mother-in-law" : "Child's Father-in-law";
            default:
                return null;
    }
    }
}