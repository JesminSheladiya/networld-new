package com.example.demo.service;

import com.example.demo.dto.UserRelationSuggestionDTO;
import com.example.demo.model.Relation;
import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import com.example.demo.repository.RelationRepository;
import com.example.demo.repository.UserRelationRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * End-to-end suggestion check on a synthetic family graph (no DB):
 * resolver + regenerateAllSuggestions + chain upgrade, exactly as the
 * Suggestions tab serves them.
 */
class SuggestionEngineTest {

    private UserRelationRepository urr;
    private UserRepository userRepo;
    private RelationRepository relRepo;
    private UserRelationService service;
    private List<UserRelation> rows;
    private List<User> users;
    private long rowSeq = 100;
    private long userSeq = 1;

    private static void setId(Object o, long id) throws Exception {
        Field f = o.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(o, id);
    }

    private User user(String email, String name, String username, String gender) throws Exception {
        User u = new User();
        u.setEmail(email);
        u.setFullName(name);
        u.setUsername(username);
        u.setGender(gender);
        setId(u, userSeq++);
        users.add(u);
        return u;
    }

    private static Relation rel(String name, int gen, String gender, String cat, boolean blood, String english) {
        Relation r = new Relation();
        r.setRelationName(name);
        r.setGenerationLevel(gen);
        r.setGender(gender);
        r.setRelationCategory(cat);
        r.setIsBlood(blood);
        r.setEnglishRelation(english);
        r.setIndianRelation(name);
        return r;
    }

    /** Accepted pair, both directions (mirrors acceptRelation). */
    private void accepted(User from, User to, Relation fwd, Relation rev) throws Exception {
        UserRelation a = new UserRelation(from, to, fwd, "ACCEPTED");
        setId(a, rowSeq++);
        UserRelation b = new UserRelation(to, from, rev, "ACCEPTED");
        setId(b, rowSeq++);
        rows.add(a);
        rows.add(b);
    }

    @BeforeEach
    void setup() {
        rows = new ArrayList<>();
        users = new ArrayList<>();

        Map<String, Relation> byName = new HashMap<>();
        Map<String, Relation> byEng = new HashMap<>();
        Relation[] master = {
            rel("Brother", 0, "M", "SIBLING", true, "Brother"),
            rel("Sister", 0, "F", "SIBLING", true, "Sister"),
            rel("Husband", 0, "M", "SPOUSE", false, "Husband"),
            rel("Wife", 0, "F", "SPOUSE", false, "Wife"),
            rel("Son", -1, "M", "CHILD", true, "Son"),
            rel("Father", 1, "M", "PARENT", true, "Father"),
            rel("Daughter-in-law", -1, "F", "INLAW", false, "Son's Wife"),
            rel("Sister-in-law", 0, "F", "INLAW", false, "Sister-in-law"),
            rel("Brother-in-law", 0, "M", "INLAW", false, "Brother-in-law"),
            rel("Sister-in-law (Brother's Wife)", 0, "F", "INLAW", false, "Brother's Wife"),
            rel("Brother-in-law (Sister's Husband)", 0, "M", "INLAW", false, "Sister's Husband"),
            rel("Sister-in-law (Wife's Sister)", 0, "F", "INLAW", false, "Wife's Sister"),
            rel("Brother-in-law (Wife's Brother)", 0, "M", "INLAW", false, "Wife's Brother"),
            rel("Sister-in-law (Husband's Sister)", 0, "F", "INLAW", false, "Husband's Sister"),
            rel("Brother-in-law (Husband's Brother)", 0, "M", "INLAW", false, "Husband's Brother"),
            rel("Uncle", 1, "M", "PIBLING", true, "Uncle"),
            rel("Aunt", 1, "F", "PIBLING", true, "Aunt"),
            rel("Paternal Aunt", 1, "F", "PIBLING", true, "Father's Sister"),
            rel("Father Elder Brother", 1, "M", "PIBLING", true, "Father's Elder Brother"),
            rel("Father Sister Husband", 1, "M", "PIBLING", true, "Father's Sister's Husband"),
            rel("Maternal Uncle", 1, "M", "PIBLING", true, "Mother's Brother"),
            rel("Maternal Aunt", 1, "F", "PIBLING", true, "Mother's Aunt"),
            rel("Brother Son", -1, "M", "NIBLING", true, "Brother's Son"),
            rel("Brother Daughter", -1, "F", "NIBLING", true, "Brother's Daughter"),
            rel("Sister Son", -1, "M", "NIBLING", true, "Sister's Son"),
            rel("Sister Daughter", -1, "F", "NIBLING", true, "Sister's Daughter"),
            rel("Cousin Brother", 0, "M", "COUSIN", true, "Parent's Sibling's Son"),
            rel("Father Elder Brother Son", 0, "M", "COUSIN", true, "Father Elder Brother's Son"),
            rel("Father Sister Son", 0, "M", "COUSIN", true, "Father Sister's Son"),
            rel("Mother Brother Son", 0, "M", "COUSIN", true, "Mother Brother's Son"),
            rel("Mother Sister Son", 0, "M", "COUSIN", true, "Mother Sister's Son"),
        };
        for (Relation r : master) {
            byName.put(r.getRelationName().toLowerCase(), r);
            byEng.put(r.getEnglishRelation().toLowerCase(), r);
        }

        relRepo = mock(RelationRepository.class);
        when(relRepo.findByRelationNameIgnoreCase(anyString())).thenAnswer(inv -> {
            String q = inv.getArgument(0);
            return Optional.ofNullable(q == null ? null : byName.get(q.toLowerCase()));
        });
        when(relRepo.findByEnglishRelationIgnoreCase(anyString())).thenAnswer(inv -> {
            String q = inv.getArgument(0);
            return Optional.ofNullable(q == null ? null : byEng.get(q.toLowerCase()));
        });
        when(relRepo.findByRelationCategoryAndGenerationLevelAndGenderOrderByRelationName(
                anyString(), any(), anyString())).thenReturn(List.of());

        userRepo = mock(UserRepository.class);
        when(userRepo.findAll()).thenAnswer(inv -> new ArrayList<>(users));
        when(userRepo.findByEmail(anyString())).thenAnswer(inv -> {
            String email = inv.getArgument(0);
            return users.stream().filter(u -> u.getEmail().equals(email)).findFirst();
        });

        urr = mock(UserRelationRepository.class);
        doNothing().when(urr).lockSuggestionRegeneration(anyLong());
        doAnswer(inv -> {
            User u = inv.getArgument(0);
            rows.removeIf(r -> "SUGGESTED".equals(r.getStatus())
                    && r.getFromUser().getId().equals(u.getId()));
            return null;
        }).when(urr).deleteAllSuggestionsFor(any(User.class));
        when(urr.save(any(UserRelation.class))).thenAnswer(inv -> {
            UserRelation ur = inv.getArgument(0);
            if (ur.getId() == null) {
                try { setId(ur, rowSeq++); } catch (Exception e) { throw new RuntimeException(e); }
                rows.add(ur);
            } else {
                rows.removeIf(r -> ur.getId().equals(r.getId()));
                rows.add(ur);
            }
            return ur;
        });
        when(urr.findByFromUserAndStatus(any(User.class), anyString())).thenAnswer(inv ->
                rows.stream().filter(r -> r.getFromUser().getId().equals(inv.getArgument(0, User.class).getId())
                        && r.getStatus().equals(inv.getArgument(1))).collect(Collectors.toList()));
        when(urr.findByToUserAndStatus(any(User.class), anyString())).thenAnswer(inv ->
                rows.stream().filter(r -> r.getToUser().getId().equals(inv.getArgument(0, User.class).getId())
                        && r.getStatus().equals(inv.getArgument(1))).collect(Collectors.toList()));
        when(urr.findByStatus(anyString())).thenAnswer(inv ->
                rows.stream().filter(r -> r.getStatus().equals(inv.getArgument(0))).collect(Collectors.toList()));
        when(urr.findByFromUserAndToUser(any(User.class), any(User.class))).thenAnswer(inv -> {
            User a = inv.getArgument(0);
            User b = inv.getArgument(1);
            return rows.stream().filter(r -> r.getFromUser().getId().equals(a.getId())
                    && r.getToUser().getId().equals(b.getId())).findFirst();
        });

        service = new UserRelationService(urr, userRepo, relRepo, new RelationshipResolver());
    }

    private Relation R(String name) {
        return relRepo.findByRelationNameIgnoreCase(name).orElseThrow();
    }

    private Map<String, String> suggestionsFor(User me) {
        return service.getInferredSuggestions(me).stream()
                .collect(Collectors.toMap(
                        UserRelationSuggestionDTO::getSuggestedUserEmail,
                        UserRelationSuggestionDTO::getInferredRelation,
                        (a, b) -> a));
    }

    @Test
    void inLawChainsResolveToExactSeats_maleEgo() throws Exception {
        User me = user("me@x.com", "Me", "me", "M");
        User b = user("b@x.com", "Brother", "b", "M");
        User s = user("s@x.com", "Sister", "s", "F");
        User w = user("w@x.com", "Wife", "w", "F");
        User bw = user("bw@x.com", "Bhabhi", "bw", "F");
        User sh = user("sh@x.com", "Jija", "sh", "M");
        User ws = user("ws@x.com", "Sali", "ws", "F");
        User wb = user("wb@x.com", "Sala", "wb", "M");
        User son = user("son@x.com", "Son", "son", "M");
        User dil = user("dil@x.com", "Bahu", "dil", "F");

        accepted(me, b, R("Brother"), R("Brother"));
        accepted(me, s, R("Sister"), R("Sister"));
        accepted(me, w, R("Wife"), R("Husband"));
        accepted(b, bw, R("Wife"), R("Husband"));
        accepted(s, sh, R("Husband"), R("Wife"));
        accepted(w, ws, R("Sister"), R("Sister"));
        accepted(w, wb, R("Brother"), R("Brother"));
        accepted(me, son, R("Son"), R("Father"));
        accepted(son, dil, R("Wife"), R("Husband"));

        Map<String, String> got = suggestionsFor(me);
        assertEquals("Sister-in-law (Brother's Wife)", got.get("bw@x.com"));
        assertEquals("Brother-in-law (Sister's Husband)", got.get("sh@x.com"));
        assertEquals("Sister-in-law (Wife's Sister)", got.get("ws@x.com"));
        assertEquals("Brother-in-law (Wife's Brother)", got.get("wb@x.com"));
        assertEquals("Daughter-in-law", got.get("dil@x.com"));
        // No ambiguous plain in-law labels remain
        assertFalse(got.values().stream().anyMatch(
                v -> v.equals("Sister-in-law") || v.equals("Brother-in-law")));
    }

    @Test
    void husbandSideChainsResolveToExactSeats_femaleEgo() throws Exception {
        User me = user("me2@x.com", "Me2", "me2", "F");
        User h = user("h@x.com", "Husband", "h", "M");
        User hs = user("hs@x.com", "Nanad", "hs", "F");
        User hb = user("hb@x.com", "Devar", "hb", "M");

        accepted(me, h, R("Husband"), R("Wife"));
        accepted(h, hs, R("Sister"), R("Brother"));
        accepted(h, hb, R("Brother"), R("Brother"));

        Map<String, String> got = suggestionsFor(me);
        assertEquals("Sister-in-law (Husband's Sister)", got.get("hs@x.com"));
        assertEquals("Brother-in-law (Husband's Brother)", got.get("hb@x.com"));
    }

    @Test
    void cousinChainsResolveToExactSeats() throws Exception {
        User me = user("me3@x.com", "Me3", "me3", "M");
        User f = user("f@x.com", "Father", "f", "M");
        User tau = user("tau@x.com", "Tau", "tau", "M");
        User chs = user("chs@x.com", "Tayera", "chs", "M");
        User bua = user("bua@x.com", "Bua", "bua", "F");
        User fufa = user("fufa@x.com", "Fufa", "fufa", "M");
        User fs = user("fs@x.com", "Fufera", "fs", "M");
        User mama = user("mama@x.com", "Mama", "mama", "M");
        User ms = user("ms@x.com", "Mamera", "ms", "M");

        accepted(me, f, R("Father"), R("Son"));
        accepted(me, tau, R("Father Elder Brother"), R("Brother Son"));
        accepted(tau, chs, R("Son"), R("Father"));
        accepted(me, bua, R("Paternal Aunt"), R("Brother Daughter"));
        accepted(bua, fufa, R("Husband"), R("Wife"));
        accepted(fufa, fs, R("Son"), R("Father"));
        accepted(me, mama, R("Maternal Uncle"), R("Sister Son"));
        accepted(mama, ms, R("Son"), R("Father"));

        Map<String, String> got = suggestionsFor(me);
        assertEquals("Father Elder Brother Son", got.get("chs@x.com"));
        assertEquals("Father Sister Son", got.get("fs@x.com"));
        assertEquals("Mother Brother Son", got.get("ms@x.com"));
    }
}
