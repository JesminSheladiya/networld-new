package com.example.demo.service;

import com.example.demo.model.Relation;
import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class RelationshipResolver {

    // Suggestions are generated only up to this TRUE kinship degree,
    // computed from the resolved state — not from path length. A sparse
    // graph can link close kin through several hops (dada -> jesmin ->
    // bua is truly father-daughter, degree 1), so cutting off by hops
    // wrongly hid such relations. Degree = canonical steps up to the
    // common ancestor and back down, plus one for a marriage crossed:
    // parent/child = 1, grandparent/grandchild/sibling = 2,
    // uncle/aunt/nephew/niece/sibling-in-law = 3.
    static final int MAX_SUGGESTION_DEGREE = 3;

    // True kinship degree of a resolved state: steps up to the common
    // ancestor (maxV) plus steps back down (maxV - v), plus one when an
    // in-law boundary was crossed (s != 0).
    static int trueDegree(int v, int maxV, int s) {
        return 2 * maxV - v + (s == 0 ? 0 : 1);
    }

    // Which side of the family a relation name belongs to, derived from
    // the relation's own naming convention ("Paternal ..."/"Father ..."
    // = father's side, "Maternal ..."/"Mother ..." = mother's side).
    // Generic rows ("Uncle", "Grandfather") carry no side (0). Married-in
    // rows ("... Wife" / "... Husband": Chachi, Mami, Fufa, Mausa) are
    // always the spouse's side (-1). Applies to every current and future
    // pibling/grandparent — no per-name hardcoding.
    // Returns 1 = paternal, 2 = maternal, 0 = unknown; -1 = married-in.
    private static int kinSideOf(Relation rel) {
        String n = (rel != null && rel.getRelationName() != null)
                ? rel.getRelationName().toLowerCase().trim() : "";
        if (n.endsWith(" wife") || n.endsWith(" husband")) return -1;
        if (n.contains("paternal") || n.startsWith("father ")) return 1;
        if (n.contains("maternal") || n.startsWith("mother ")) return 2;
        return 0;
    }

    private static class State {
        Long userId;
        int v;
        int maxV;
        int s;
        // lineage: 0 = unknown, 1 = daughter/sister line, 2 = son/brother
        // line. Set by a GRANDCHILD hop (whose daughter's/son's child this
        // is) or a NIBLING hop (whose sister's/brother's child this is).
        // Consumed by PARENT ("my grandchild's/nibling's father/mother"),
        // PIBLING and GRANDPARENT side consumers.
        int line;
        // Relation category of the edge that reached this state
        // (PARENT, CHILD, NIBLING, ...). Tells a PARENT hop whether the
        // current node is my nibling (needs nibling-line logic) or my
        // grandchild (needs grandchild-line logic). Null for ego.
        String prevCat;
        // Gender of the node we arrived from (the middle person for a hop
        // out of here): for a CHILD link curr IS prev's son/daughter, so
        // prev's gender tells whose blood the other parent is. "N" when
        // unknown (ego root).
        String prevG;
        // True when this state's in-law-ness (or naming) relied on a
        // side-assumption rule (pibling/grandfather side-matching, in-law
        // normalizations) or an s==1 translation / INLAW edge, rather than
        // an exact composition (blood, own marriage, nibling's/grandchild's
        // parent). Tainted generics are candidates for chain upgrade
        // ("Brother's Brother-in-law" describes the actual path exactly);
        // untainted close truths are kept as-is.
        boolean viaSide;
        // Hops (edges) from ego to this state; guards against runaway
        // re-exploration. Family relations resolve within a few hops.
        int depth;
        // Insertion order: keeps the search deterministic — equal-cost
        // paths resolve first-discovered-wins, as BFS did before.
        long seq;

        public State(Long userId, int v, int maxV, int s, int line, String prevCat,
                     String prevG, boolean viaSide, int depth, long seq) {
            this.userId = userId;
            this.v = v;
            this.maxV = maxV;
            this.s = s;
            this.line = line;
            this.prevCat = prevCat;
            this.prevG = prevG;
            this.viaSide = viaSide;
            this.depth = depth;
            this.seq = seq;
        }
    }

    public static class RelResult {
        public String otherToMe;
        public String meToOther;
        public boolean viaSideRule;
        public RelResult(String o2m, String m2o, boolean viaSideRule) {
            this.otherToMe = o2m;
            this.meToOther = m2o;
            this.viaSideRule = viaSideRule;
        }
    }

    public Map<Long, RelResult> resolveAll(List<UserRelation> acceptedRelations, User me) {
        Map<Long, RelResult> results = new HashMap<>();
        Map<Long, List<UserRelation>> adj = new HashMap<>();
        Map<Long, User> users = new HashMap<>();

        for (UserRelation ur : acceptedRelations) {
            adj.computeIfAbsent(ur.getFromUser().getId(), k -> new ArrayList<>()).add(ur);
            users.put(ur.getFromUser().getId(), ur.getFromUser());
            users.put(ur.getToUser().getId(), ur.getToUser());
        }

        // Closest-kinship-first search (Dijkstra-style): states expand in
        // order of true kinship degree, so each person is labelled by
        // their CLOSEST relationship to ego. A state is re-expanded only
        // in a genuinely new (v, maxV, s, line, side) shape, and the
        // recorded suggestion is the minimum-degree one (ties keep
        // first-discovered order — stable and deterministic).
        PriorityQueue<State> queue = new PriorityQueue<>(
                Comparator.comparingInt((State st) -> trueDegree(st.v, st.maxV, st.s))
                        .thenComparingLong(st -> st.seq));
        long seq = 0;
        queue.add(new State(me.getId(), 0, 0, 0, 0, null, "N", false, 0, seq++));

        Map<Long, Integer> bestDegree = new HashMap<>();
        bestDegree.put(me.getId(), 0);
        Set<String> expanded = new HashSet<>();

        while (!queue.isEmpty()) {
            State curr = queue.poll();
            String key = curr.userId + "|" + curr.v + "|" + curr.maxV + "|" + curr.s
                    + "|" + curr.line + "|" + curr.prevCat + "|" + curr.prevG
                    + "|" + curr.viaSide;
            if (!expanded.add(key)) continue; // same shape already expanded
            if (curr.depth >= 8) continue; // safety guard; families resolve far earlier

            for (UserRelation edge : adj.getOrDefault(curr.userId, Collections.emptyList())) {
                Long nextId = edge.getToUser().getId();
                if (nextId.equals(me.getId())) continue; // never suggest ego

                Relation rel = edge.getRelation();
                String cat = rel.getRelationCategory() != null ? rel.getRelationCategory() : "OTHER";

                // Genders needed by the side-aware consumers below: prevG =
                // gender of the node we arrived from, stored on the state
                // (for CHILD hops curr IS prev's child, so prev's gender
                // tells whose blood the other parent is); middle = curr
                // itself (for naming); target = who the edge points at.
                User nextUser = edge.getToUser();
                String gender = (nextUser != null && nextUser.getGender() != null) ? nextUser.getGender() : "N";
                User middleUser = users.get(curr.userId);
                String middleGender = (middleUser != null && middleUser.getGender() != null)
                        ? middleUser.getGender() : "N";
                String egoGender = (me != null && me.getGender() != null) ? me.getGender() : "N";
                String targetGender = (rel.getGender() != null) ? rel.getGender() : "N";
                boolean prevMale = "M".equals(curr.prevG);
                boolean prevKnown = prevMale || "F".equals(curr.prevG);

                int nextV = curr.v;
                int nextMaxV = curr.maxV;
                int nextS = curr.s;
                int nextLine = curr.line;
                String nextPrevCat = cat.toUpperCase();
                boolean nextVia = curr.viaSide;

                switch (cat.toUpperCase()) {
                    case "PARENT":
                        nextV += 1; nextMaxV = Math.max(nextMaxV, nextV);
                        nextLine = 0;
                        if (nextS == 2) {
                            nextS = 1;
                        } else if (nextS == 0 && "NIBLING".equals(curr.prevCat) && curr.line != 0) {
                            // My nibling's parent: a sister-line nibling's
                            // father is my Brother-in-law (my sister's
                            // husband) while the mother is my Sister; a
                            // brother-line nibling mirrors this. Mirrors the
                            // grandchild-line rule below; without it every
                            // nibling's parent collapses to a blood sibling.
                            boolean targetMale = !"F".equals(rel.getGender());
                            boolean inLaw = (curr.line == 1) ? targetMale : !targetMale;
                            if (inLaw) nextS = 1;
                        } else if (nextS == 0 && curr.v == -1 && curr.maxV == 0) {
                            nextS = 2; // Child's other parent is our Spouse
                        } else if (nextS == 0 && curr.line != 0
                                && "GRANDCHILD".equals(curr.prevCat)) {
                            // My grandchild's parent, line-aware on every
                            // shape: cycles can revisit the same people at
                            // other coordinates (e.g. my grandson seen at
                            // nephew level via his grandfather), and without
                            // the line the parent collapses to blood with a
                            // bogus-low degree that overwrites the truth.
                            // Daughter-line + father -> Son-in-law, + mother
                            // -> Daughter (blood); son-line mirrored. Runs
                            // after the spouse rule above (my own child's
                            // other parent is my Spouse, not an in-law).
                            boolean targetMale = !"F".equals(rel.getGender());
                            boolean inLaw = (curr.line == 1) ? targetMale : !targetMale;
                            if (inLaw) nextS = 1;
                        } else if (nextS == 0 && "CHILD".equals(curr.prevCat) && prevKnown) {
                            // My descendant's parent via a child link: curr
                            // IS prev's son/daughter, so curr's same-gender
                            // parent is prev (blood) and the other-gender
                            // parent married in (e.g. my sister's son's
                            // father is my Brother-in-law; my son's son's
                            // father is my Son). Runs after the spouse rule
                            // above (my own child's other parent is my Spouse).
                            boolean targetMale = !"F".equals(rel.getGender());
                            if (targetMale != prevMale) nextS = 1;
                        } else if (curr.s == 1) {
                            // Translating through in-law territory ("my
                            // in-law's parent"): exact only for close truths,
                            // a guess otherwise — flag for chain upgrade.
                            nextVia = true;
                        }
                        break;
                    case "CHILD":
                        nextV -= 1;
                        if (nextS == 2) nextS = 0;
                        break;
                    case "SIBLING":
                        nextMaxV = Math.max(nextMaxV, nextV + 1);
                        if (nextS == 2) nextS = 1;
                        else if (nextS == 1 && curr.v == -1 && curr.maxV == 0) {
                            // My in-law child's sibling (e.g. my DIL's
                            // brother): an in-law's blood, at my children's
                            // generation socially — name them as
                            // sibling-in-law level ("Son-in-law" would claim
                            // they married my child, which is wrong).
                            nextV = 0;
                            nextMaxV = Math.max(nextMaxV, 1);
                            nextVia = true;
                        }
                        break;
                    case "SPOUSE": 
                        if (nextS == 0) {
                            if (nextV == 0 && nextMaxV == 0) nextS = 2; // Direct Spouse
                            else if (nextV < 0 || (nextV == 0 && nextMaxV > 0)) nextS = 1; // In-Law
                            // if nextV > 0, spouse is absorbed (stepparent -> parent)
                        }
                        break;
                    case "GRANDPARENT":
                        nextV += 2; nextMaxV = Math.max(nextMaxV, nextV);
                        if (nextS == 2) nextS = 1;
                        else if (isSpouseSideKin(rel, curr, me, nextId, adj)) nextS = 1;
                        else if (nextS == 0 && kinSideOf(rel) > 0
                                && !(curr.v == -1 && curr.maxV == 0)
                                && ((("NIBLING".equals(curr.prevCat)
                                        || "GRANDCHILD".equals(curr.prevCat))
                                        && curr.line != 0)
                                    || ("CHILD".equals(curr.prevCat) && prevKnown))) {
                            // My nibling's/grandchild's/descendant's
                            // grandfather, side-aware: a paternal GF is the
                            // father's father — in-law when that father
                            // married in (sister's/daughter's husband's
                            // father), blood when he is the blood link
                            // (brother's/son's father); a maternal GF
                            // mirrors this. The link gender comes from the
                            // edge line for nibling/grandchild hops and from
                            // the middle person's gender for child hops
                            // (there curr IS prev's child). Without it such
                            // grandparents collapse to blood with a bogus-low
                            // degree that overwrites the truth. (My OWN
                            // child's GF is covered by the spouse-side rule
                            // above, not here.)
                            int side = kinSideOf(rel);
                            boolean inLaw;
                            if ("CHILD".equals(curr.prevCat)) {
                                inLaw = (side == 1) != prevMale;
                            } else {
                                inLaw = (curr.line == 1) ? (side == 1) : (side == 2);
                            }
                            if (inLaw) {
                                nextS = 1;
                                nextVia = true;
                            }
                        } else if (curr.s == 1) {
                            // Translating through in-law territory ("my
                            // in-law's grandfather"): a guess — flag it.
                            nextVia = true;
                        }
                        break;
                    case "GRANDCHILD": 
                        nextV -= 2; 
                        if (nextS == 2) nextS = 0;
                        // Remember whose line this grandchild is on for a
                        // later "my grandchild's parent" hop.
                        String gl = rel.getRelationName() != null
                                ? rel.getRelationName().toLowerCase() : "";
                        nextLine = gl.startsWith("daughter") ? 1 : 2;
                        break;
                    case "PIBLING": // Uncle/Aunt
                        nextV += 1; nextMaxV = Math.max(nextMaxV, nextV + 1);
                        if (nextS == 2) nextS = 1;
                        else if (isSpouseSideKin(rel, curr, me, nextId, adj)) nextS = 1;
                        else if (kinSideOf(rel) != 0 && !(curr.v == -1 && curr.maxV == 0)) {
                            // My grandchild's/nibling's/descendant's uncle/aunt,
                            // side-aware. The link gender comes from the edge
                            // line for nibling/grandchild hops (it names whose
                            // sister's/brother's/daughter's/son's child this
                            // is) and from the middle person's gender for
                            // child hops (there curr IS prev's child, so a
                            // same-gender parent is prev (blood) and the
                            // other married in). Same-side -> blood kin (my
                            // son's son's paternal aunt is my daughter);
                            // opposite side -> in-law (my sister's son's
                            // paternal aunt is my BIL's sister). Married-in
                            // rows ("... Wife/Husband") and anyone already
                            // in-law are always in-law (the line is
                            // meaningless for an in-law's family).
                            // (My OWN child's aunt/uncle is handled by the
                            // spouse-side rule above, not here.)
                            int side = kinSideOf(rel);
                            boolean inLaw;
                            if (side == -1) {
                                inLaw = true;
                            } else if (curr.s != 0) {
                                inLaw = true;
                            } else if ((("NIBLING".equals(curr.prevCat)
                                        || "GRANDCHILD".equals(curr.prevCat))
                                        && curr.line != 0)) {
                                inLaw = (curr.line == 1) ? (side == 1) : (side == 2);
                            } else if ("CHILD".equals(curr.prevCat) && prevKnown) {
                                inLaw = (side == 1) != prevMale;
                            } else {
                                inLaw = false; // unknown: keep previous behaviour
                            }
                            if (inLaw) {
                                nextS = 1;
                                nextVia = true;
                                if (side > 0 && curr.v <= -2) {
                                    // A deep opposite-side/in-law aunt/uncle
                                    // (e.g. my son-in-law's sister) stands at
                                    // my children's generation socially — name
                                    // them as sibling-in-law level, which is
                                    // also what common usage calls them.
                                    nextV = 0;
                                    nextMaxV = Math.max(nextMaxV, 1);
                                }
                            }
                        }
                        break;
                    case "NIBLING": // Nephew/Niece
                        nextV -= 1; nextMaxV = Math.max(nextMaxV, nextV + 2);
                        if (nextS == 2) nextS = 1;
                        // Remember whose line this nibling is on for a later
                        // "my nibling's parent" hop (same convention as the
                        // grandchild line: 1 = sister line, 2 = brother line).
                        nextLine = niblingLineOf(rel);
                        break;
                    case "COUSIN": 
                        nextMaxV = Math.max(nextMaxV, nextV + 2); 
                        if (nextS == 2) nextS = 1;
                        break;
                    case "INLAW":
                        int genInLaw = rel.getGenerationLevel() != null ? rel.getGenerationLevel() : 0;
                        nextV += genInLaw;
                        if (genInLaw > 0) nextMaxV = Math.max(nextMaxV, nextV);
                        else if (genInLaw == 0) nextMaxV = Math.max(nextMaxV, nextV + 1);
                        // An in-law edge always spans a marriage: from below
                        // (e.g. my son's father-in-law) the level must not
                        // collapse to (0,0) — that yields an unnameable NULL
                        // at bogus degree 1 which then blocks the truth.
                        if (curr.v < 0) nextMaxV = Math.max(nextMaxV, nextV + 1);
                        nextS = 1;
                        nextVia = true;
                        break;
                    default:
                        int g = rel.getGenerationLevel() != null ? rel.getGenerationLevel() : 0;
                        nextV += g;
                        if (g > 0) nextMaxV = Math.max(nextMaxV, nextV);
                        else if (g == 0) nextMaxV = Math.max(nextMaxV, nextV + 1);
                        break;
                }
                
                String[] sidePair = sideSpecificPair(cat.toUpperCase(), curr, nextS,
                        middleGender, egoGender, targetGender, gender);
                String otherToMeStr;
                String meToOtherStr;
                if (sidePair != null) {
                    otherToMeStr = sidePair[0];
                    meToOtherStr = sidePair[1];
                } else {
                    otherToMeStr = resolveStateName(nextV, nextMaxV, nextS, gender);

                    int invV = -nextV;
                    int invMaxV = nextMaxV - nextV;
                    String meGender = (me != null && me.getGender() != null) ? me.getGender() : "N";
                    meToOtherStr = resolveStateName(invV, invMaxV, nextS, meGender);
                }
                
                // Record (and keep) the closest-kinship label; anything
                // beyond MAX_SUGGESTION_DEGREE is too distant to suggest.
                // Transit continues regardless — a suppressed node can still
                // lead to a closer one (kinship degree is not monotonic).
                int nextDegree = trueDegree(nextV, nextMaxV, nextS);
                String dbgFilter = System.getenv("RESOLVER_DEBUG");
                if (dbgFilter != null && me != null && me.getEmail() != null
                        && me.getEmail().contains(dbgFilter)) {
                    System.out.println("DBG ego=" + me.getEmail()
                            + " edge=" + edge.getFromUser().getEmail() + "-["
                            + (rel != null ? rel.getRelationName() + "/" + rel.getRelationCategory() : "?")
                            + "]->" + edge.getToUser().getEmail()
                            + " st=(" + nextV + "," + nextMaxV + "," + nextS + ",l=" + nextLine + "," + nextPrevCat + ")"
                            + " from=(" + curr.v + "," + curr.maxV + "," + curr.s + ",l=" + curr.line + "," + curr.prevCat + ")"
                            + " lbl=" + otherToMeStr + "/" + meToOtherStr + " deg=" + nextDegree);
                }
                if (nextDegree <= MAX_SUGGESTION_DEGREE
                        && nextDegree < bestDegree.getOrDefault(nextId, Integer.MAX_VALUE)) {
                    bestDegree.put(nextId, nextDegree);
                    results.put(nextId, new RelResult(otherToMeStr, meToOtherStr, nextVia));
                }
                queue.add(new State(nextId, nextV, nextMaxV, nextS, nextLine, nextPrevCat,
                        middleGender, nextVia, curr.depth + 1, seq++));
            }
        }
        
        return results;
    }

    // Which sibling's line a NIBLING edge belongs to, derived from the
    // relation's own naming convention ("Sister Son" = my sister's son,
    // "Brother Daughter" = my brother's daughter). Generic rows ("Nephew",
    // "Niece") carry no line, so they return unknown (0) and keep the
    // previous blood-sibling behaviour. Applies to every current and
    // future "Sister ..."/"Brother ..." nibling — no per-name hardcoding.
    private static int niblingLineOf(Relation rel) {
        String n = (rel != null && rel.getRelationName() != null)
                ? rel.getRelationName().toLowerCase().trim() : "";
        if (n.startsWith("sister ")) return 1;
        if (n.startsWith("brother ")) return 2;
        return 0;
    }

    // True when 'rel' names kin on my child's OTHER parent's side (my
    // spouse's side), so the suggestion must be an in-law, not blood:
    //  - married-in piblings (".. Wife" / ".. Husband": Chachi, Mami,
    //    Fufa, Mausa, Tai) are always in-laws, for either gender;
    //  - maternal-side kin (Maternal ../Mother's ..) belong to the mother:
    //    spouse side unless I (ego) am the mother (female);
    //  - paternal-side kin (Paternal ../Father's ..) belong to the father:
    //    spouse side unless I am the father (male).
    // Only applies when 'curr' is exactly my own child (v=-1, maxV=0,
    // blood), mirroring the "child's other parent is our spouse" assumption.
    private static boolean isSpouseSideKin(Relation rel, State curr, User me,
                                           Long nextId,
                                           Map<Long, List<UserRelation>> adj) {
        if (curr.v != -1 || curr.maxV != 0 || curr.s != 0) return false;
        if (me == null || me.getGender() == null) return false;
        String n = (rel != null && rel.getRelationName() != null)
                ? rel.getRelationName().toLowerCase() : "";
        boolean maternal = n.contains("maternal") || n.startsWith("mother ");
        boolean paternal = n.contains("paternal") || n.startsWith("father ");
        if (!maternal && !paternal && nextId != null && adj != null) {
            // Legacy/generic edge ("Grandfather"): the reverse grandchild
            // edge proves the line — "Daughter's Son/Daughter" means the
            // mother's side even though this edge name says nothing.
            for (UserRelation back : adj.getOrDefault(nextId, Collections.emptyList())) {
                if (back.getToUser() != null && curr.userId.equals(back.getToUser().getId())
                        && back.getRelation() != null
                        && back.getRelation().getRelationName() != null
                        && back.getRelation().getRelationName().toLowerCase().startsWith("daughter")) {
                    maternal = true;
                    break;
                }
            }
        }
        if (!maternal && !paternal) return false;
        boolean egoFemale = "F".equals(me.getGender());
        return maternal ? !egoFemale : egoFemale;
    }

    // Side-specific grandparent/grandchild names using the MIDDLE person's
    // gender: "my mother's father" is Maternal (not generic) Grandfather,
    // "my daughter's son" is Daughter's Son (not generic Grandson).
    // Returns {myView, theirView} so both suggested rows stay consistent
    // with each other, or null when the generic engine result is fine.
    // Blood paths (s == 0); the CHILD branch also accepts an in-law middle
    // (s == 1, son-/daughter-in-law) with flipped lineage. Known genders only.
    private static String[] sideSpecificPair(String cat, State curr, int nextS,
                                             String middleGender, String egoGender,
                                             String targetGender, String otherGender) {
        if (curr.s != 0 && curr.s != 1) return null;
        boolean mMale = "M".equals(middleGender);
        boolean mFemale = "F".equals(middleGender);
        if (!mMale && !mFemale) return null;
        boolean tMale = "M".equals(targetGender);
        boolean tFemale = "F".equals(targetGender);
        if (!tMale && !tFemale) return null;
        boolean eMale = "M".equals(egoGender);
        boolean oMale = "M".equals(otherGender);
        // My parent's parent: mother's side is maternal, father's paternal.
        // Strictly blood path only (an in-law's parent has no side name).
        if ("PARENT".equals(cat) && curr.s == 0 && nextS == 0
                && curr.v == 1 && curr.maxV == 1) {
            String myView = (mMale ? "Paternal " : "Maternal ")
                    + (tMale ? "Grandfather" : "Grandmother");
            String theirView = mMale
                    ? (eMale ? "Grandson" : "Granddaughter")
                    : (eMale ? "Daughter's Son" : "Daughter's Daughter");
            return new String[]{myView, theirView};
        }
        // My child's child: daughter's children are daughter-line.
        // Middle reached as in-law (s == 1) flips the line: my son-in-law's
        // children are my daughter's children, my daughter-in-law's are my
        // son's. This keeps multi-path BFS order-independent (either route
        // to the same grandchild yields the same name).
        if ("CHILD".equals(cat) && curr.v == -1 && curr.maxV == 0
                && (curr.s == 0 || curr.s == 1)) {
            if (curr.s == 1 && nextS != 1) return null;
            if (curr.s == 0 && nextS != 0) return null;
            boolean sonLine = (curr.s == 0) ? mMale : !mMale;
            String myView = sonLine
                    ? (tMale ? "Grandson" : "Granddaughter")
                    : (tMale ? "Daughter's Son" : "Daughter's Daughter");
            String theirView = (sonLine ? "Paternal " : "Maternal ")
                    + (oMale ? "Grandfather" : "Grandmother");
            return new String[]{myView, theirView};
        }
        return null;
    }

    private String resolveStateName(int v, int maxV, int s, String gender) {        boolean m = "M".equals(gender);
        if (s == 2) {
            return m ? "Husband" : "Wife";
        }
        if (s == 1) {
            if (v == 1 && maxV == 1) return m ? "Father-in-law" : "Mother-in-law";
            if (v == -1 && maxV == 0) return m ? "Son-in-law" : "Daughter-in-law";
            if (v == 0 && maxV == 1) return m ? "Brother-in-law" : "Sister-in-law";
            if (v == 1 && maxV >= 2) return m ? "Uncle" : "Aunt";
            if (v == -1 && maxV >= 1) return m ? "Nephew" : "Niece";
            if (v == 0 && maxV >= 2) return m ? "Cousin Brother" : "Cousin Sister";
            if (v >= 2 && maxV == v) return m ? "Grandfather" : "Grandmother";
            if (v <= -2 && maxV == 0) return m ? "Grandson" : "Granddaughter";
        } 
        
        if (v == 1 && maxV == 1) return m ? "Father" : "Mother";
        if (v == -1 && maxV == 0) return m ? "Son" : "Daughter";
        if (v == 0 && maxV == 1) return m ? "Brother" : "Sister";
        if (v == 2 && maxV == 2) return m ? "Grandfather" : "Grandmother";
        if (v == -2 && maxV == 0) return m ? "Grandson" : "Granddaughter";
        if (v == 1 && maxV >= 2) return m ? "Uncle" : "Aunt";
        if (v == -1 && maxV >= 1) return m ? "Nephew" : "Niece";
        if (v == 0 && maxV >= 2) return m ? "Cousin Brother" : "Cousin Sister";
        
        return null;
    }
}
