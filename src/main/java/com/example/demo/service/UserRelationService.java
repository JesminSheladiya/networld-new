package com.example.demo.service;

import com.example.demo.dto.UserRelationSuggestionDTO;
import com.example.demo.model.*;
import com.example.demo.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserRelationService {

    // A generic Friend relation is intentionally conservative: unlike a
    // family relation it can match almost anyone in the graph. Requiring two
    // shared accepted connections keeps suggestions closer to mutual-friend
    // discovery instead of producing a friend row for every reachable user.
    private static final int MIN_MUTUALS_FOR_FRIEND_SUGGESTION = 2;

    // These represent one real-world seat in the user's family. All other
    // master relations may be assigned to multiple people.
    private static final Set<String> UNIQUE_RELATION_NAMES = Set.of(
            "father", "mother",
            "paternal grandfather", "paternal grandmother",
            "maternal grandfather", "maternal grandmother",
            "husband", "wife",
            "father-in-law", "mother-in-law"
    );

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

    // Self-proxy so getInferredSuggestions(Pageable) hits the @Cacheable
    // proxy instead of bypassing it via a direct this-call.
    private UserRelationService self;

    @org.springframework.beans.factory.annotation.Autowired
    public void setSelf(@org.springframework.context.annotation.Lazy UserRelationService self) {
        this.self = self;
    }

    // User manually sends a relation request
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
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
        ensureUniqueRelationAvailable(fromUser, relation, null);
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
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
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

        // Suggestions cache is evicted above. Do not regenerate the complete
        // graph inside the accept request; with the demo dataset this can
        // exceed the HTTP timeout. The next suggestions read regenerates it
        // lazily.
    }

    // Edit an accepted connection, or the relation on a pending request sent
    // by the current user. Pending incoming requests remain read-only.
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
    public void editRelation(Long id, User currentUser, String relationName) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        boolean participant = ur.getFromUser().getId().equals(currentUser.getId())
                || ur.getToUser().getId().equals(currentUser.getId());
        if (!participant)
            throw new RuntimeException("Not authorized!");

        boolean ownPendingRequest = "PENDING".equals(ur.getStatus())
                && ur.getFromUser().getId().equals(currentUser.getId());
        if (!"ACCEPTED".equals(ur.getStatus()) && !ownPendingRequest)
            throw new RuntimeException("Only your pending requests or accepted relations can be edited!");

        if (relationName == null || relationName.isBlank())
            throw new RuntimeException("Relation name is required!");

        Relation newRel = getRequiredRelation(relationName.trim());
        validateRelationGender(newRel, ur.getToUser());
        ensureUniqueRelationAvailable(currentUser, newRel, ur.getId());
        ur.setRelation(newRel);
        userRelationRepo.save(ur);

        // A pending request has no reverse accepted relation to keep in sync.
        if (ownPendingRequest) return;

        Optional<UserRelation> reverseOpt = userRelationRepo.findByFromUserAndToUser(ur.getToUser(), ur.getFromUser());
        if (reverseOpt.isPresent() && "ACCEPTED".equals(reverseOpt.get().getStatus())) {
            Relation revRel = findReverseRelation(newRel, ur.getFromUser());
            if (revRel != null) {
                reverseOpt.get().setRelation(revRel);
                userRelationRepo.save(reverseOpt.get());
            }
        }

        // The relation is already updated and the suggestions cache was
        // evicted above. Do not rebuild the complete graph synchronously here:
        // for large accounts this can scan 100k users twice and make an
        // otherwise small edit request time out. Suggestions regenerate lazily
        // on the next suggestions-list request.
    }

    // Remove an accepted connection completely. Accepted relationships are
    // represented by one row in each direction, so delete the pair rather
    // than only the row whose id was sent by the UI.
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
    public void removeConnection(Long id, User currentUser) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Connection not found!"));

        boolean participant = ur.getFromUser().getId().equals(currentUser.getId())
                || ur.getToUser().getId().equals(currentUser.getId());
        if (!participant)
            throw new RuntimeException("Not authorized!");
        if (!"ACCEPTED".equals(ur.getStatus()))
            throw new RuntimeException("Only an accepted connection can be removed!");

        userRelationRepo.deleteConnectionPair(ur.getFromUser(), ur.getToUser());
    }

    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
    public void declineRelation(Long id, User currentUser) {
        UserRelation ur = userRelationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Not found!"));

        if (!ur.getToUser().getId().equals(currentUser.getId()))
            throw new RuntimeException("Not authorized!");

        ur.setStatus("DECLINED");
        userRelationRepo.save(ur);
    }

    // Lists ship 50 rows per page and never render covers: a single 5MB
    // phone photo as base64 would stall slow networks past the 15s timeout.
    // Covers load on demand via getProfileOf; uploads are compressed once
    // server-side (avatars ≤512px) so the guard below only ever trips for
    // pre-existing oversized rows (initials show, profile stays intact).
    // List avatar: 128px server-side thumbnail (~6KB) via a bounded memory
    // cache — profiles/viewers always get the full stored photo. No extra DB
    // column: the thumb derives from the single stored image, keyed by owner
    // + content so photo changes recompute automatically.
    private static String thumbOf(User u) {
        if (u == null) return null;
        if (u.getId() == null) return u.getProfilePicture();
        return com.example.demo.util.ImageCompress.listThumb(u.getProfilePicture(), u.getId());
    }

    static final int LIST_MAX_PHOTO_CHARS = 300_000;

    private static UserRelationSuggestionDTO slimForList(UserRelationSuggestionDTO dto) {        dto.setSuggestedUserCoverImage(null);
        if (dto.getSuggestedUserProfilePic() != null
                && dto.getSuggestedUserProfilePic().length() > LIST_MAX_PHOTO_CHARS)
            dto.setSuggestedUserProfilePic(null);
        return dto;
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
                            ur.getId(), name, s.getDisplayName(), s.getEmail(), s.getPhone(), thumbOf(s),
                            s.getCoverImage(),
                            s.getGender(), s.getBirthDate(), s.getBio(), s.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            name + " wants to add you as their " + rel.getRelationName(),
                            "PENDING");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), s, false, dto));
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
                            ur.getId(), name, t.getDisplayName(), t.getEmail(), t.getPhone(), thumbOf(t),
                            t.getCoverImage(),
                            t.getGender(), t.getBirthDate(), t.getBio(), t.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "You asked " + name + " to be your " + rel.getRelationName(),
                            "PENDING");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), t, false, dto));
                }).collect(Collectors.toList());
    }

    // Paged variants: 10k-item tabs render 20 rows, not 10k DOM nodes.
    public Page<UserRelationSuggestionDTO> getPendingRequests(User currentUser, Pageable pageable) {
        return userRelationRepo.findByToUserAndStatus(currentUser, "PENDING", pageable)
                .map(ur -> {
                    User s = ur.getFromUser();
                    String name = s.getFullName() != null ? s.getFullName() : s.getDisplayName();
                    Relation rel = ur.getRelation();
                    UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                            ur.getId(), name, s.getDisplayName(), s.getEmail(), s.getPhone(), thumbOf(s),
                            s.getCoverImage(),
                            s.getGender(), s.getBirthDate(), s.getBio(), s.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            name + " wants to add you as their " + rel.getRelationName(),
                            "PENDING");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), s, false, dto));
                });
    }

    public Page<UserRelationSuggestionDTO> getSentRequests(User currentUser, Pageable pageable) {
        return userRelationRepo.findByFromUserAndStatus(currentUser, "PENDING", pageable)
                .map(ur -> {
                    User t = ur.getToUser();
                    String name = t.getFullName() != null ? t.getFullName() : t.getDisplayName();
                    Relation rel = ur.getRelation();
                    UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                            ur.getId(), name, t.getDisplayName(), t.getEmail(), t.getPhone(), thumbOf(t),
                            t.getCoverImage(),
                            t.getGender(), t.getBirthDate(), t.getBio(), t.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "You asked " + name + " to be your " + rel.getRelationName(),
                            "PENDING");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), t, false, dto));
                });
    }

    public long countPendingRequests(User currentUser) {
        return userRelationRepo.countByToUserAndStatus(currentUser, "PENDING");
    }

    public long countSentRequests(User currentUser) {
        return userRelationRepo.countByFromUserAndStatus(currentUser, "PENDING");
    }

    // Badge total without regen: counts stored SUGGESTED rows (regen
    // recomputes them on list read; the badge must never trigger a regen).
    public long countInferredSuggestions(User currentUser) {
        return userRelationRepo.countByFromUserAndStatus(currentUser, "SUGGESTED");
    }
    // Sender withdraws their own outgoing PENDING request.
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
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
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), thumbOf(o),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    null, "ACCEPTED");
        boolean visibleToViewer = viewerConnEmailsOrNull == null
                || (o.getEmail() != null && viewerConnEmailsOrNull.contains(o.getEmail().toLowerCase()));
        return slimForList(applyProfilePrivacy(viewerEmail, o, visibleToViewer, dto));
        }).collect(Collectors.toList());
    }

    // Any user's accepted connections, PAGED in the database (Instagram-style:
    // millions of followers still open instantly because each page ships only
    // ~50 small rows, never the whole graph). Shape stays { total, items } so
    // old clients keep working; new clients pass page/size.
    // Total always shows; items come back empty when the owner hides them.
    public java.util.Map<String, Object> getConnectionsOf(String viewerEmail, String email, Pageable pageable) {
        return getConnectionsOf(viewerEmail, email, null, pageable);
    }

    public java.util.Map<String, Object> getConnectionsOf(String viewerEmail, String email, String query, Pageable pageable) {
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
                // Email-only projections: no entity/photo hydration.
                viewerConns.addAll(userRelationRepo.findAcceptedToEmails(viewer));
                viewerConns.addAll(userRelationRepo.findAcceptedFromEmails(viewer));
            }
        }
        final java.util.Set<String> viewerConnSet = viewerConns;
        boolean connectedToOwner = self || (viewerConns != null
                && target.getEmail() != null
                && viewerConns.contains(target.getEmail().toLowerCase()));
        long total = userRelationRepo.countByFromUserAndStatus(target, "ACCEPTED");
        List<UserRelationSuggestionDTO> visible;
        if (target.hidesConnectionsFrom(viewerEmail, connectedToOwner)) {
            visible = java.util.List.of();
        } else {
            String normalizedQuery = query == null || query.trim().isEmpty() ? null : query.trim();
            Page<UserRelation> page =
                    userRelationRepo.pageFilteredConnections(target, normalizedQuery, null, false, pageable);
            visible = page.getContent().stream().map(ur -> {
                User o = ur.getToUser();
                String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
                Relation rel = ur.getRelation();
                UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                        ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), thumbOf(o),
                        o.getCoverImage(),
                        o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                        rel.getRelationName(),
                        rel.getEnglishRelation(),
                        rel.getIndianRelation(),
                        null, "ACCEPTED");
                boolean visibleToViewer = viewerConnSet == null
                        || (o.getEmail() != null && viewerConnSet.contains(o.getEmail().toLowerCase()));
                return slimForList(applyProfilePrivacy(viewerEmail, o, visibleToViewer, dto));
            }).collect(Collectors.toList());
        }
        java.util.Map<String, Object> out = new java.util.HashMap<>();
        out.put("total", target.hidesConnectionsFrom(viewerEmail, connectedToOwner)
                ? total
                : (query == null || query.trim().isEmpty() ? total
                    : userRelationRepo.pageFilteredConnections(target, query.trim(), null, false, pageable).getTotalElements()));
        out.put("items", visible);
        return out;
    }

    // Legacy unbounded shape kept for old callers — delegates to the paged
    // version with a single large page. New code must pass a Pageable.
    public java.util.Map<String, Object> getConnectionsOf(String viewerEmail, String email) {
        return getConnectionsOf(viewerEmail, email, PageRequest.of(0, 50));
    }

    // Full profile of ONE user (covers included): lists never ship covers,
    // so the detail screen fetches them here on demand — 1 small row instead
    // of 50 heavy ones. Shape matches search-users items, privacy-applied.
    public java.util.Map<String, Object> getProfileOf(String viewerEmail, String email) {
        User me = userRepository.findByEmail(viewerEmail).orElse(null);
        User u = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Optional<UserRelation> fwd = me == null
                ? Optional.empty() : userRelationRepo.findByFromUserAndToUser(me, u);
        Optional<UserRelation> rev = me == null
                ? Optional.empty() : userRelationRepo.findByFromUserAndToUser(u, me);
        boolean connected = areConnected(me, u);
        Map<String, Object> item = new HashMap<>();
        item.put("id", u.getId());
        item.put("name", u.getFullName() != null ? u.getFullName() : u.getDisplayName());
        item.put("username", u.getDisplayName());
        item.put("email", u.getEmail());
        item.put("profilePic", u.getProfilePicture() != null ? u.getProfilePicture() : "");
        item.put("coverImage", u.hidesCoverFrom(viewerEmail, connected)
                ? com.example.demo.util.ImagePrivacy.blurredCoverOrNull(u.getCoverImage())
                : (u.getCoverImage() != null ? u.getCoverImage() : ""));
        item.put("coverHidden", u.hidesCoverFrom(viewerEmail, connected));
        item.put("contactInfoHidden", u.hidesContactInfoFrom(viewerEmail, connected));
        item.put("phone", u.hidesContactInfoFrom(viewerEmail, connected) ? null : u.getPhone());
        item.put("gender", u.getGender());
        item.put("birthDate", u.hidesContactInfoFrom(viewerEmail, connected) ? null : u.getBirthDate());
        item.put("bio", u.getBio());
        item.put("occupation", u.getOccupation());

        Long pendingId = null;
        boolean suggested = false;
        String suggestedRelation = null;
        Long relationId = null;
        if (fwd.isPresent()) {
            if ("ACCEPTED".equals(fwd.get().getStatus())) {
                item.put("relationName", fwd.get().getRelation().getRelationName());
                relationId = fwd.get().getId();
            } else if ("PENDING".equals(fwd.get().getStatus())) {
                item.put("pending", "sent");
                pendingId = fwd.get().getId();
                item.put("inferredRelation", fwd.get().getRelation().getRelationName());
            } else if ("SUGGESTED".equals(fwd.get().getStatus())) {
                suggested = true;
                suggestedRelation = fwd.get().getRelation().getRelationName();
            }
        } else if (rev.isPresent()) {
            if ("ACCEPTED".equals(rev.get().getStatus())) {
                item.put("relationName", rev.get().getRelation().getRelationName());
                if (relationId == null) relationId = rev.get().getId();
            } else if ("PENDING".equals(rev.get().getStatus())) {
                item.put("pending", "received");
                pendingId = rev.get().getId();
                item.put("inferredRelation", rev.get().getRelation().getRelationName());
            }
        }
        item.put("pendingRelationId", pendingId);
        item.put("relationId", relationId);
        item.put("suggested", suggested);
        if (suggestedRelation != null) {
            item.put("inferredRelation", suggestedRelation);
        }
        return item;
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
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), thumbOf(o),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                    rel.getRelationName(),
                    rel.getEnglishRelation(),
                    rel.getIndianRelation(),
                    null, "ACCEPTED");
        return slimForList(applyProfilePrivacy(currentUser.getEmail(), o, true, dto));
        });
    }

    public Map<String, Long> getConnectionCounts(User currentUser, String query, boolean includePhone) {
        String q = blankToNull(query);
        Map<String, Long> counts = new HashMap<>();
        if (q == null) {
            // Fast path: COUNT(*) over the (from_user_id, status) index.
            // Category buckets come from the GROUP BY query (no entity load).
            long total = userRelationRepo.countByFromUserAndStatus(currentUser, "ACCEPTED");
            counts.put("all", total);
            counts.put("family", 0L);
            counts.put("inlaws", 0L);
            counts.put("others", 0L);
            if (total == 0) return counts;
            Map<String, String> buckets = relationBucketMap();
            for (Object[] row : userRelationRepo.countConnectionsByRelation(currentUser, null, includePhone)) {
                String bucket = buckets.getOrDefault(String.valueOf(row[0]).toLowerCase(), "others");
                counts.put(bucket, counts.get(bucket) + ((Number) row[1]).longValue());
            }
            return counts;
        }
        // Filtered path: COUNT(*) with the same LIKE predicates (no entity
        // hydration) + GROUP BY for buckets.
        long total = userRelationRepo.countSearchAcceptedConnections(currentUser, q, includePhone);
        counts.put("all", total);
        counts.put("family", 0L);
        counts.put("inlaws", 0L);
        counts.put("others", 0L);
        if (total == 0) return counts;
        Map<String, String> buckets = relationBucketMap();
        for (Object[] row : userRelationRepo.countConnectionsByRelation(currentUser, q, includePhone)) {
            String bucket = buckets.getOrDefault(String.valueOf(row[0]).toLowerCase(), "others");
            counts.put(bucket, counts.get(bucket) + ((Number) row[1]).longValue());
        }
        return counts;
    }

    // Bucket relation names with ONE master-table read: the old per-row
    // findByRelationNameIgnoreCase turned every counts call into 1 COUNT +
    // 1 GROUP BY + N relation lookups (dozens of queries on 4G for users
    // with many distinct relations — the tab counts lagged the list).
    private Map<String, String> relationBucketMap() {
        Map<String, String> m = new HashMap<>();
        for (Relation r : relationRepository.findAll()) {
            if (r.getRelationName() != null)
                m.put(r.getRelationName().toLowerCase(), categoryOf(r));
        }
        return m;
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
        return self.getCachedSuggestions(currentUser);
    }

    // Cached regen: the list is recomputed at most once per user per TTL
    // window (see CacheConfig). Page clicks slice the cached list instead
    // of re-running a ~1min regen per click on mega-hubs.
    @org.springframework.cache.annotation.Cacheable(value = "suggestions", key = "#currentUser.id")
    @Transactional
    public List<UserRelationSuggestionDTO> getCachedSuggestions(User currentUser) {
        regenerateAllSuggestions(currentUser);

        return userRelationRepo.findByFromUserAndStatus(currentUser, "SUGGESTED")
                .stream().map(ur -> {
                    User o = ur.getToUser();
                    String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
                    Relation rel = ur.getRelation();
            UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                    ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), thumbOf(o),
                    o.getCoverImage(),
                    o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "Discovered through your network connections",
                            "SUGGESTED");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), o, false, dto));
                }).collect(Collectors.toList());
    }

    public Page<UserRelationSuggestionDTO> getInferredSuggestions(User currentUser, Pageable pageable) {
        // DB-paged read: the old code loaded ALL suggested rows (9.5k entities
        // with TEXT photo columns) into memory on every page click, after a
        // full graph regen that times out on 4G for mega-hubs — the badge
        // showed "9.5k+" while the list stayed empty. Each page now ships only
        // its own ~50 rows with an index-only COUNT; regen stays on writes
        // (accept/send/edit) plus the cached full refresh, never on paging.
        return userRelationRepo.findByFromUserAndStatus(currentUser, "SUGGESTED", pageable)
                .map(ur -> {
                    User o = ur.getToUser();
                    String name = o.getFullName() != null ? o.getFullName() : o.getDisplayName();
                    Relation rel = ur.getRelation();
                    UserRelationSuggestionDTO dto = new UserRelationSuggestionDTO(
                            ur.getId(), name, o.getDisplayName(), o.getEmail(), o.getPhone(), thumbOf(o),
                            o.getCoverImage(),
                            o.getGender(), o.getBirthDate(), o.getBio(), o.getOccupation(),
                            rel.getRelationName(),
                            rel.getEnglishRelation(),
                            rel.getIndianRelation(),
                            "Discovered through your network connections",
                            "SUGGESTED");
                    return slimForList(applyProfilePrivacy(currentUser.getEmail(), o, false, dto));
                });
    }
    // Send a request based on a system suggestion → PENDING (not auto-accepted)
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
    public void sendInferredSuggestionRequest(User currentUser, String otherEmail, String relationName) {
        User otherUser = userRepository.findByEmail(otherEmail)
                .orElseThrow(() -> new RuntimeException("User not found!"));

        Relation relation = getRequiredRelation(relationName);
        validateRelationGender(relation, otherUser);
        ensureUniqueRelationAvailable(currentUser, relation, null);

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

        // Do not rebuild the complete suggestion graph synchronously here.
        // On large networks this made suggestions/send appear stuck until the
        // HTTP timeout. The cache is evicted above; the next suggestions read
        // regenerates the data lazily.
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

    private void ensureUniqueRelationAvailable(User user, Relation relation, Long excludedId) {
        if (relation == null || relation.getRelationName() == null
                || !UNIQUE_RELATION_NAMES.contains(relation.getRelationName().trim().toLowerCase())) {
            return;
        }
        if (userRelationRepo.existsActiveRelationForUser(user, relation, excludedId)) {
            throw new RuntimeException("You can select '" + relation.getRelationName()
                    + "' only once for your account.");
        }
    }

    public List<String> getUsedUniqueRelationNames(User user) {
        return userRelationRepo.findActiveRelationNamesForUser(user).stream()
                .filter(name -> name != null
                        && UNIQUE_RELATION_NAMES.contains(name.trim().toLowerCase()))
                .distinct()
                .collect(Collectors.toList());
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
    @org.springframework.cache.annotation.CacheEvict(value = "suggestions", allEntries = true)
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

        // Bulk pair snapshot: 2 queries replace 2-per-candidate lookups
        // (200k SELECTs at 100k users). Post-delete, outgoing rows can never
        // be SUGGESTED, so every surviving candidate is an insert (the old
        // update-branch was dead code).
        Map<Long, String> fwdStatus = new HashMap<>();
        for (Object[] row : userRelationRepo.findOutgoingIdStatus(me)) {
            fwdStatus.put((Long) row[0], (String) row[1]);
        }
        Map<Long, String> revStatus = new HashMap<>();
        for (Object[] row : userRelationRepo.findIncomingIdStatus(me)) {
            revStatus.put((Long) row[0], (String) row[1]);
        }

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

        // Id-only scan: hydrating 100k full User entities (with TEXT photo
        // columns) per regen is MBs of garbage; per-candidate work uses a
        // lazy reference (id only — composeChain/refine touch nothing else
        // until a finalist is found).
        List<Long> candidateIds = userRepository.findAllIdsExcept(me.getId());

        // Bulk insert at the end: one flush instead of per-row save + an
        // ever-growing persistence context.
        List<UserRelation> toInsert = new ArrayList<>();

        for (Long otherId : candidateIds) {
            String fs = fwdStatus.get(otherId);
            if (fs != null && !"SUGGESTED".equals(fs)) continue;

            String rs = revStatus.get(otherId);
            if (rs != null && !"SUGGESTED".equals(rs)) continue;

            RelationshipResolver.RelResult result = resolvedMap.get(otherId);

            String genericName = (result == null) ? null : result.otherToMe;
            Relation genericRel = (genericName == null) ? null : relationOf(genericName, relationCache);
            if (genericRel == null && genericName != null) {
                genericRel = relationOfEnglish(genericName, relationCache);
            }

            // If the graph proves mutual connections but no family relation
            // can be resolved, treat the pair as a Friend suggestion. Keep
            // this fallback conservative so unrelated users are not suggested
            // as friends without at least two shared accepted connections.
            int mutualConnections = countMutualConnections(me, otherId, adjLabels);
            if (genericRel == null && mutualConnections >= MIN_MUTUALS_FOR_FRIEND_SUGGESTION) {
                genericName = "Friend";
                genericRel = relationOf(genericName, relationCache);
            }

            // Distant/unnamed pairs get a descriptive chain ("Brother's
            // Brother-in-law") composed through a bridge person; close blood
            // truths always keep their generic label. Every NON-BLOOD generic
            // is also a chain candidate — a plain "Sister-in-law" is ambiguous
            // (Brother's Wife vs Husband's Sister vs Wife's Sister are
            // different seats in Indian kinship), while the composed chain
            // names the actual path exactly. Chains only win when a curated
            // master row matches; otherwise the generic stands.
            boolean keepGeneric = genericRel != null
                    && Boolean.TRUE.equals(genericRel.getIsBlood());
            User otherRef = userRepository.getReferenceById(otherId);
            String chainName = keepGeneric ? null
                    : composeChain(me, otherRef, resolvedMap, accepted, adjLabels, usersById,
                            inferredCache, relationCache);

            String finalName;
            if (chainName != null) {
                finalName = chainName;
            } else if (genericRel != null) {
                finalName = genericName;
            } else {
                continue;
            }

            if ("Friend".equalsIgnoreCase(finalName)
                    && mutualConnections < MIN_MUTUALS_FOR_FRIEND_SUGGESTION) {
                continue;
            }

            Relation finalRel = relationOf(finalName, relationCache);
            if (finalRel == null) {
                finalRel = relationOfEnglish(finalName, relationCache);
            }
            if (finalRel == null) continue;
            // Younger/Elder precision on suggestions too (describer = me).
            // Proxy SELECT fires here only for actual finalists (few).
            finalRel = refineSiblingByAge(finalRel, me, otherRef);

            toInsert.add(new UserRelation(me, otherRef, finalRel, "SUGGESTED"));
        }
        userRelationRepo.saveAll(toInsert);
    }

    private int countMutualConnections(User me, Long otherId,
            Map<Long, Map<Long, String>> adjacency) {
        Map<Long, String> mine = adjacency.getOrDefault(me.getId(), Map.of());
        int count = 0;
        for (Long contactId : mine.keySet()) {
            Map<Long, String> contactLinks = adjacency.get(contactId);
            if (contactLinks != null && contactLinks.containsKey(otherId)) count++;
        }
        return count;
    }

    // Cached english_relation fallback (relationCache holds nulls too, so a
    // second lookup for the same miss stays free).
    private Relation relationOfEnglish(String name, Map<String, Relation> relationCache) {
        String key = "en:" + name.toLowerCase();
        if (relationCache.containsKey(key)) return relationCache.get(key);
        Relation rel = relationRepository.findByEnglishRelationIgnoreCase(name).orElse(null);
        relationCache.put(key, rel);
        return rel;
    }

    // First-link categories for chain composition: simple blood ties only.
    private static final int MAX_BRIDGE_INFERENCES_PER_REGEN = 8;
    // Spouse/in-law/nibling/cousin links are excluded (spouse-led chains
    // collapse into existing in-law rows; compound words like "Brother Son"
    // read poorly as chain heads). Piblings ARE included — uncle/aunt-led
    // chains are exactly how cousin seats resolve ("Father Sister" + "Son"
    // = Paternal Cousin Brother); misses simply fall through to the generic label.
    private static final java.util.Set<String> CHAIN_HEAD_CATEGORIES = java.util.Set.of(
            "PARENT", "CHILD", "SIBLING", "GRANDPARENT", "GRANDCHILD", "PIBLING");

    // Seat-identical side wordings: "Paternal Aunt" IS "Father Sister" (no
    // elder/younger split exists for aunts, maternal uncles/aunts). Used as
    // extra chain-head forms. Deliberately NOT mapped: "Paternal Uncle"
    // (elder Father's Elder Brother vs younger Uncle is unknowable) and grandparents.
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

        // Bound: accepted bridges sort first, then cap the scan. Distant
        // candidates beyond the cap keep the generic label — at 100k users
        // an unbounded scan is 100k candidates × N bridges with a full
        // Dijkstra per bridge (the regen hang).
        final int MAX_BRIDGES_PER_CANDIDATE = 40;
        int scanned = 0;

        for (Long bridgeId : bridges) {
            if (scanned >= MAX_BRIDGES_PER_CANDIDATE) break;
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

            // Head gate FIRST (cached master lookups only): the expensive
            // second-link resolution below runs solely for bridges that can
            // actually head a chain.
            java.util.List<String[]> passingPairs = new java.util.ArrayList<>();
            for (String hf : headForms) {
                Relation hr = relationOf(hf, relationCache);
                // Gate on the REAL row; synonyms inherit it (a synonym is
                // not itself a master row, so it can never pass the gate).
                if (!isChainHead(hr)) continue;
                passingPairs.add(new String[]{hf, hf});
                String syn = PIBLING_SYNONYMS.get(hf.toLowerCase());
                if (syn != null) passingPairs.add(new String[]{syn, hf});
                // Married-in pibling heads (Father's Younger Brother's Wife, Mother's Brother's Wife, Father's Sister's Husband, Mother's Sister's Husband,
                // Father's Elder Brother's Wife) carry the spouse suffix — the bloodline is the
                // head minus that suffix ("Father Sister Husband" +
                // "Son" is really "Father Sister's Son" = Paternal Cousin Brother).
                String stripped = strippedPiblingHead(hf, hr);
                if (stripped != null) passingPairs.add(new String[]{stripped, hf});
            }
            if (passingPairs.isEmpty()) continue;
            scanned++;

            // Second link: bridge's own accepted wording first, else bridge's inference.
            // Runs only for gate-passing bridges; bridge Dijkstra results are
            // shared across all candidates via inferredCache.
            String tailName = adjLabels.getOrDefault(bridgeId, java.util.Collections.emptyMap())
                    .get(other.getId());
            if (tailName == null) {
                User bridge = usersById.get(bridgeId);
                if (bridge == null) continue;
                Map<Long, RelationshipResolver.RelResult> bridgeMap = inferredCache.get(bridgeId);
                if (bridgeMap == null) {
                    if (inferredCache.size() >= MAX_BRIDGE_INFERENCES_PER_REGEN) continue;
                    bridgeMap = resolver.resolveAll(accepted, bridge);
                    inferredCache.put(bridgeId, bridgeMap);
                }
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
            for (String[] pair : passingPairs) {
                hit = findChainRowCandidate(pair[0], tailGeneric, relationCache);
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

    // Curated chain-row lookup for a composed "<Head>'s <Father's Elder Brother's Wifel>" path:
    // relation_name first, then english_relation (first-order chains like
    // "Brother's Wife" live there), then the same two with a parenthesized
    // tail generalized ("Sister-in-law (Husband's Sister)" → "Sister-in-law").
    // Results cached (nulls included) — the same head/tail pair recurs
    // across thousands of candidates during regen.
    private Optional<Relation> findChainRowCandidate(String head, String tailGeneric,
            Map<String, Relation> relationCache) {
        String key = "chain:" + head.toLowerCase() + "|" + tailGeneric.toLowerCase();
        if (relationCache.containsKey(key)) return Optional.ofNullable(relationCache.get(key));
        Optional<Relation> hit = findChainRowCandidateUncached(head, tailGeneric);
        relationCache.put(key, hit.orElse(null));
        return hit;
    }

    private Optional<Relation> findChainRowCandidate(String head, String tailGeneric) {
        return findChainRowCandidateUncached(head, tailGeneric);
    }

    private Optional<Relation> findChainRowCandidateUncached(String head, String tailGeneric) {
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
