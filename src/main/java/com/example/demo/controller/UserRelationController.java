package com.example.demo.controller;

import com.example.demo.dto.UserRelationSuggestionDTO;
import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import com.example.demo.repository.UserRelationRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.UserRelationService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/user-relations")
public class UserRelationController {

    private final UserRelationService userRelationService;
    private final UserRepository      userRepository;
    private final UserRelationRepository userRelationRepository;

    public UserRelationController(UserRelationService userRelationService,
                                  UserRepository userRepository,
                                  UserRelationRepository userRelationRepository) {
        this.userRelationService      = userRelationService;
        this.userRepository           = userRepository;
        this.userRelationRepository   = userRelationRepository;
    }

    private User getCurrentUser(UserDetails ud) {
        return userRepository.findByEmail(ud.getUsername())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    @GetMapping("/search-users")
    public ResponseEntity<List<Map<String, Object>>> searchUsers(
            @RequestParam String query,
            @AuthenticationPrincipal UserDetails ud) {
        User me = getCurrentUser(ud);
        // Keep one-character searches useful (e.g. "a"), while still
        // avoiding an unbounded empty-query scan. The frontend debounces and
        // the result remains capped below.
        String q = query == null ? "" : query.trim().replaceAll("\\s+", " ");
        if (q.isEmpty()) return ResponseEntity.ok(List.of());
        // Hard cap: search-users is a typeahead, not a full dump.
        List<User> users = userRepository.searchUsers(
                q, me.getId(), org.springframework.data.domain.PageRequest.of(0, 20));
        List<Map<String, Object>> result = new ArrayList<>();
        for (User u : users) {
            Map<String, Object> item = new HashMap<>();
            Optional<UserRelation> fwd = userRelationRepository.findByFromUserAndToUser(me, u);
            Optional<UserRelation> rev = userRelationRepository.findByFromUserAndToUser(u, me);
            boolean connected =
                    (fwd.isPresent() && "ACCEPTED".equals(fwd.get().getStatus())) ||
                    (rev.isPresent() && "ACCEPTED".equals(rev.get().getStatus()));
            item.put("id",         u.getId());
            item.put("name",       u.getFullName() != null ? u.getFullName() : u.getDisplayName());
            item.put("username",   u.getDisplayName());
            item.put("email",      u.getEmail());
            // Typeahead rows are list icons → server-side thumbnail (full
            // photo loads on demand via GET /profile when the profile opens).
            String pic = com.example.demo.util.ImageCompress.listThumb(
                    u.getProfilePicture(), u.getId());
            item.put("profilePic", pic != null ? pic : "");
            // Typeahead rows never render covers — the detail screen fetches
            // them on demand via GET /profile (see slimForList rationale).
            item.put("coverImage", "");
            item.put("coverHidden", u.hidesCoverFrom(me.getEmail(), connected));
            item.put("contactInfoHidden", u.hidesContactInfoFrom(me.getEmail(), connected));
            item.put("phone",      u.hidesContactInfoFrom(me.getEmail(), connected) ? null : u.getPhone());
            item.put("gender",     u.getGender());
            item.put("birthDate",  u.hidesContactInfoFrom(me.getEmail(), connected) ? null : u.getBirthDate());
            item.put("bio",        u.getBio());
            item.put("occupation", u.getOccupation());

            // Only PENDING counts as sent/received — DECLINED resets to fresh state
            Long pendingId = null;
            boolean suggested = false;
            String suggestedRelation = null;
            if (fwd.isPresent()) {
                if ("ACCEPTED".equals(fwd.get().getStatus())) {
                    item.put("relationName", fwd.get().getRelation().getRelationName());
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
                } else if ("PENDING".equals(rev.get().getStatus())) {
                    item.put("pending", "received");
                    pendingId = rev.get().getId();
                    item.put("inferredRelation", rev.get().getRelation().getRelationName());
                }
            }
            item.put("pendingRelationId", pendingId);
            item.put("suggested", suggested);
            if (suggestedRelation != null) {
                item.put("inferredRelation", suggestedRelation);
            }
            result.add(item);
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/send")
    public ResponseEntity<?> sendRequest(
            @AuthenticationPrincipal UserDetails ud,
            @RequestBody Map<String, Object> body) {
        User me = getCurrentUser(ud);
        String toEmail    = (String) body.get("toEmail");
        Long   relationId = Long.valueOf(body.get("relationId").toString());
        userRelationService.sendRelationRequest(me, toEmail, relationId);
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Request sent!");
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<?> accept(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails ud) {
        userRelationService.acceptRelation(id, getCurrentUser(ud));
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Accepted!");
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{id}/decline")
    public ResponseEntity<?> decline(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails ud) {
        userRelationService.declineRelation(id, getCurrentUser(ud));
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Declined!");
        return ResponseEntity.ok(resp);
    }

    // Edit ONLY the relation of an accepted connection
    @PutMapping("/{id}/relation")
    public ResponseEntity<?> editRelation(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails ud,
            @RequestBody Map<String, Object> body) {
        String relationName = (String) body.get("relationName");
        userRelationService.editRelation(id, getCurrentUser(ud), relationName);
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Relation updated!");
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/pending")
    public ResponseEntity<Page<UserRelationSuggestionDTO>> getPending(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserDetails ud) {
        // Bounded pages: the old unbounded list shipped 10k rows (5MB+ DOM).
        int safeSize = Math.min(1000, Math.max(1, size));
        Pageable pageable = PageRequest.of(Math.max(0, page), safeSize);
        return ResponseEntity.ok(userRelationService.getPendingRequests(getCurrentUser(ud), pageable));
    }

    @GetMapping("/pending/count")
    public ResponseEntity<Map<String, Long>> getPendingCount(
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(Map.of("count",
                userRelationService.countPendingRequests(getCurrentUser(ud))));
    }

    // Outgoing requests I sent that are still pending (for the Sent tab).
    @GetMapping("/sent")
    public ResponseEntity<Page<UserRelationSuggestionDTO>> getSent(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserDetails ud) {
        int safeSize = Math.min(1000, Math.max(1, size));
        Pageable pageable = PageRequest.of(Math.max(0, page), safeSize);
        return ResponseEntity.ok(userRelationService.getSentRequests(getCurrentUser(ud), pageable));
    }

    @GetMapping("/sent/count")
    public ResponseEntity<Map<String, Long>> getSentCount(
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(Map.of("count",
                userRelationService.countSentRequests(getCurrentUser(ud))));
    }

    // Sender withdraws their own outgoing PENDING request.
    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails ud) {
        userRelationService.cancelSentRequest(id, getCurrentUser(ud));
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Cancelled!");
        return ResponseEntity.ok(resp);
    }

    // Returns system-inferred SUGGESTED entries (paged; regen result is
    // cached per user per TTL window so page clicks don't re-run regen).
    @GetMapping("/suggestions")
    public ResponseEntity<Page<UserRelationSuggestionDTO>> getSuggestions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserDetails ud) {
        int safeSize = Math.min(1000, Math.max(1, size));
        Pageable pageable = PageRequest.of(Math.max(0, page), safeSize);
        return ResponseEntity.ok(userRelationService.getInferredSuggestions(getCurrentUser(ud), pageable));
    }

    // Badge total without regen (the list endpoint regenerates; badges and
    // background polls must never trigger a ~1min regen on mega-hubs).
    @GetMapping("/suggestions/count")
    public ResponseEntity<Map<String, Long>> getSuggestionsCount(
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(Map.of("count",
                userRelationService.countInferredSuggestions(getCurrentUser(ud))));
    }

    @GetMapping("/connections")
    public ResponseEntity<List<UserRelationSuggestionDTO>> getConnections(
            @RequestParam(required = false) String query,
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(userRelationService.getMyConnections(getCurrentUser(ud), query));
    }

    // Single full profile (covers included) for the detail screen: lists
    // never ship covers, so this 1-row fetch fills them on demand.
    @GetMapping("/profile")
    public ResponseEntity<java.util.Map<String, Object>> getProfile(
            @RequestParam String email,
            @AuthenticationPrincipal UserDetails ud) {
        getCurrentUser(ud); // authenticated only
        return ResponseEntity.ok(userRelationService.getProfileOf(ud.getUsername(), email));
    }

    @GetMapping("/connections/of")
    public ResponseEntity<java.util.Map<String, Object>> getConnectionsOf(
            @RequestParam String email,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String query,
            @AuthenticationPrincipal UserDetails ud) {
        getCurrentUser(ud); // authenticated only; no private filtering by design
        int safePage = Math.max(0, page);
        int safeSize = Math.min(1000, Math.max(1, size));
        return ResponseEntity.ok(userRelationService.getConnectionsOf(
                ud.getUsername(), email,
                query,
                org.springframework.data.domain.PageRequest.of(safePage, safeSize)));
    }

    @GetMapping("/connections/paged")
    public ResponseEntity<Page<UserRelationSuggestionDTO>> getConnectionsPaged(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) List<String> relations,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "true") boolean includePhone,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserDetails ud) {
        // Clamp: unbounded size (frontend offers up to 1000) × concurrent
        // users = multi-MB pages + expensive COUNT(*) with LIKE predicates.
        // 50/100/200/500/1000 options keep desktop fast and mobile (50/page
        // infinite scroll) chatty-free on 4G.
        int safePage = Math.max(0, page);
        int safeSize = Math.min(1000, Math.max(1, size));
        if (relations != null && relations.size() > 50) {
            relations = relations.subList(0, 50);
        }
        Pageable pageable = PageRequest.of(safePage, safeSize, toSort(sort));
        return ResponseEntity.ok(userRelationService.getMyConnectionsPaged(
                getCurrentUser(ud), query, category, relations, includePhone, pageable));
    }

    @GetMapping("/connections/counts")
    public ResponseEntity<Map<String, Long>> getConnectionCounts(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "true") boolean includePhone,
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(userRelationService.getConnectionCounts(getCurrentUser(ud), query, includePhone));
    }

    @GetMapping("/connections/relations")
    public ResponseEntity<List<Map<String, Object>>> getConnectionRelations(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "true") boolean includePhone,
            @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(userRelationService.getConnectionRelationCounts(getCurrentUser(ud), query, includePhone));
    }

    private static org.springframework.data.domain.Sort toSort(String sort) {
        if (sort == null || sort.isBlank()) return org.springframework.data.domain.Sort.unsorted();
        String[] parts = sort.split(",");
        String field = parts[0].trim().toLowerCase();
        boolean asc = parts.length < 2 || !parts[1].trim().equalsIgnoreCase("desc");
        String property;
        switch (field) {
            case "phone":    property = "toUser.phone"; break;
            case "username": property = "toUser.username"; break;
            case "email":    property = "toUser.email"; break;
            case "relation": property = "relation.relationName"; break;
            case "name":
            default:         property = "toUser.fullName"; break;
        }
        return asc ? org.springframework.data.domain.Sort.by(property).ascending()
                   : org.springframework.data.domain.Sort.by(property).descending();
    }

    @PostMapping("/suggestions/send")
    public ResponseEntity<?> sendSuggestionRequest(
            @AuthenticationPrincipal UserDetails ud,
            @RequestBody Map<String, String> body) {
        userRelationService.sendInferredSuggestionRequest(
                getCurrentUser(ud),
                body.get("otherEmail"),
                body.get("relationName"));
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Request sent!");
        return ResponseEntity.ok(resp);
    }

    @DeleteMapping("/suggestions/{id}/dismiss")
    public ResponseEntity<?> dismissSuggestion(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails ud) {
        userRelationService.dismissSuggestion(id, getCurrentUser(ud));
        Map<String, String> resp = new HashMap<>();
        resp.put("message", "Dismissed!");
        return ResponseEntity.ok(resp);
    }
}
