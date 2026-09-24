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
        // Node we arrived from (null for ego root). A hop straight back to
        // it (A -> B -> A) is skipped by the caller: round trips label a
        // person through themselves ("my nephew's aunt" for my own
        // sister-in-law reads as blood Sister) and the detour-shifted
        // states then beat the true labels on degree. Simple paths (which
        // never contain a 2-cycle) are unaffected.
        Long prevId;
        // Insertion order: keeps the search deterministic — equal-cost
        // paths resolve first-discovered-wins, as BFS did before.
        long seq;

        public State(Long userId, int v, int maxV, int s, int line, String prevCat,
                     String prevG, boolean viaSide, int depth, long seq, Long prevId) {
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
            this.prevId = prevId;
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
        queue.add(new State(me.getId(), 0, 0, 0, 0, null, "N", false, 0, seq++, null));

        Map<Long, Integer> bestDegree = new HashMap<>();
        bestDegree.put(me.getId(), 0);
        // Whether the recorded best came from a proven side reading
        // (spouse-side flip or exact sidePair name) as opposed to a plain
        // generic inference: on a degree tie the proven reading wins even
        // when both names are plain ("Sister-in-law" over "Sister").
        Map<Long, Boolean> bestProven = new HashMap<>();
        Set<String> expanded = new HashSet<>();
        // Proven side readings (see flipFired below) with their blood-degree.
        Map<Long, String> provenLabel = new HashMap<>();
        Map<Long, Integer> provenDegree = new HashMap<>();

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
                if (curr.prevId != null && nextId.equals(curr.prevId)) continue; // no 2-cycle returns

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
                String nextPrevG = middleGender;
                // SIBLING hop: same parents, so same side-context — inherit
                // (a brother's maternal/paternal kin are my maternal/paternal
                // kin). Without this every nibling-side guess collapses to a
                // bogus-low-degree blood label that beats the truth. Root ego
                // has no context to inherit (keep own).
                if ("SIBLING".equals(nextPrevCat) && curr.prevCat != null) {
                    nextPrevCat = curr.prevCat;
                    if (!"N".equals(curr.prevG)) nextPrevG = curr.prevG;
                }
                boolean nextVia = curr.viaSide;
                // Set when this edge's own side marker proves the reading
                // (spouse-side flip below, or an exact sidePair name): such
                // proven labels outrank degree-winning blood guesses for the
                // same person (recorded after the search).
                boolean flipFired = false;

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
                        else if (isSpouseSideKin(rel, curr, me, nextId, adj)) {
                            nextS = 1;
                            flipFired = true;
                        }
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
                        else if (isSpouseSideKin(rel, curr, me, nextId, adj)) {
                            nextS = 1;
                            flipFired = true;
                        }
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
                        middleGender, egoGender, targetGender, gender, kinSideOf(rel),
                        rel != null ? rel.getRelationName() : null);
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
                            + " from=(" + curr.v + "," + curr.maxV + "," + curr.s + ",l=" + curr.line + "," + curr.prevCat + ",pg=" + curr.prevG + ")"
                            + " lbl=" + otherToMeStr + "/" + meToOtherStr + " deg=" + nextDegree);
                }
                if (nextDegree <= MAX_SUGGESTION_DEGREE
                        && nextDegree < bestDegree.getOrDefault(nextId, Integer.MAX_VALUE)) {
                    bestDegree.put(nextId, nextDegree);
                    bestProven.put(nextId, flipFired || sidePair != null);
                    results.put(nextId, new RelResult(otherToMeStr, meToOtherStr, nextVia));
                }
                // A proven side reading (edge's own side marker, or an exact
                // sidePair name) outranks a degree-winning blood guess for
                // the same person: record it at blood degree (no in-law
                // penalty) and prefer it over equal-or-farther labels below.
                // Closer labels (lower degree) still stand — a proven flip
                // never demotes a nearer truth.
                if ((flipFired || sidePair != null) && otherToMeStr != null) {
                    int provenDeg = trueDegree(nextV, nextMaxV, 0);
                    int curDeg = provenDegree.getOrDefault(nextId, Integer.MAX_VALUE);
                    String curLbl = provenLabel.get(nextId);
                    if (provenDeg < curDeg || (provenDeg == curDeg && curLbl != null
                            && isExactName(otherToMeStr) && !isExactName(curLbl))) {
                        provenDegree.put(nextId, provenDeg);
                        provenLabel.put(nextId, otherToMeStr);
                    }
                }
                queue.add(new State(nextId, nextV, nextMaxV, nextS, nextLine, nextPrevCat,
                        nextPrevG, nextVia, curr.depth + 1, seq++, curr.userId));
            }
        }

        // Prefer proven side readings over equal-or-farther labels. On a
        // degree tie: a proven reading beats an unproven generic even when
        // both names are plain; between two proven readings the exact
        // (chain/parenthesized) name beats the plain generic one.
        for (Map.Entry<Long, String> e : provenLabel.entrySet()) {
            Long uid = e.getKey();
            int pd = provenDegree.get(uid);
            int best = bestDegree.getOrDefault(uid, Integer.MAX_VALUE);
            RelResult cur = results.get(uid);
            boolean curProven = bestProven.getOrDefault(uid, false);
            boolean curExact = cur != null && isExactName(cur.otherToMe);
            if (pd < best || (pd == best && !curProven)
                    || (pd == best && curProven && isExactName(e.getValue()) && !curExact)) {
                results.put(uid, new RelResult(e.getValue(),
                        cur != null ? cur.meToOther : null, false));
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
                                             String targetGender, String otherGender,
                                             int kinSide, String relName) {
        if (curr.s != 0 && curr.s != 1 && curr.s != 2) return null;
        boolean mMale = "M".equals(middleGender);
        boolean mFemale = "F".equals(middleGender);
        if (!mMale && !mFemale) return null;
        boolean tMale = "M".equals(targetGender);
        boolean tFemale = "F".equals(targetGender);
        if (!tMale && !tFemale) return null;
        boolean eMale = "M".equals(egoGender);
        boolean oMale = "M".equals(otherGender);
        // My spouse's sibling is never generic Brother/Sister-in-law: a
        // wife's brother/sister is Sala/Sali, a husband's brother/sister is
        // Devar/Nanad (all rows exist). Direct-spouse state only (s == 2).
        if ("SIBLING".equals(cat) && curr.s == 2 && nextS == 1) {
            // eMale: my wife's sibling; else my husband's sibling.
            String myView;
            String theirView;
            if (eMale) {
                myView = tMale ? "Brother-in-law (Wife's Brother)"
                        : "Sister-in-law (Wife's Sister)";
                theirView = "Brother-in-law (Sister's Husband)";
            } else {
                myView = tMale ? "Brother-in-law (Husband's Brother)"
                        : "Sister-in-law (Husband's Sister)";
                theirView = "Sister-in-law (Brother's Wife)";
            }
            return new String[]{myView, theirView};
        }
        // My child's flipped pibling (spouse side) is never generic: name
        // the exact seat. Plain sides derive from ego gender (my husband's
        // brother is Devar, my wife's sister is Sali...); married-in rows
        // map to their exact counterpart each way (Tai<->Jethani,
        // Chachi<->Devrani, Fufa<->Nandoi/Jija, Mami<->Bhabhi/Sarhaj,
        // Mausa<->Jija/Sadu). Blood-side readings stay generic (my own
        // brother/sister). Flipped (nextS == 1) direct-child states only.
        if ("PIBLING".equals(cat) && curr.v == -1 && curr.maxV == 0 && curr.s == 0 && nextS == 1) {
            String[] exact = flippedPiblingExact(relName, kinSide, eMale, tMale);
            if (exact != null) return exact;
        }
        // My nibling's parent: a brother-line nibling's mother is my
        // brother's wife (Bhabhi) and the father is my Brother; a
        // sister-line nibling mirrors this (Sister / Jija). Exact rows all
        // exist. Nibling-state, blood path, fresh line only. (nextS is as
        // the switch computed: in-law rows with s == 1, blood with s == 0 —
        // the formulas below mirror that switch logic exactly.)
        if ("PARENT".equals(cat) && curr.v == -1 && curr.maxV == 1 && curr.s == 0
                && "NIBLING".equals(curr.prevCat) && curr.line != 0) {
            String myView;
            String theirView;
            if (curr.line == 2) {
                myView = tMale ? "Brother" : "Sister-in-law (Brother's Wife)";
                theirView = tMale ? (eMale ? "Brother" : "Sister")
                        : "Sister-in-law (Husband's Sister)";
            } else {
                myView = tMale ? "Brother-in-law (Sister's Husband)" : "Sister";
                theirView = tMale ? (eMale ? "Brother-in-law (Wife's Brother)"
                                : "Sister-in-law (Wife's Sister)")
                        : (eMale ? "Brother" : "Sister");
            }
            return new String[]{myView, theirView};
        }
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
        // My grandchild's/nibling's sibling shares their line: a
        // daughter-line grandchild's brother is my Daughter's Son, a
        // brother-line nibling's brother is my Brother Son. Only for a
        // directly-reached curr (depth 1: the line was set by my own edge,
        // so line-relative == ego-relative); deeper lines belong to someone
        // else's family and stay generic.
        if ("SIBLING".equals(cat) && curr.depth == 1 && curr.s == 0 && nextS == 0) {
            if (curr.v == -2 && curr.maxV == 0 && curr.line != 0) {
                boolean sonLine = curr.line == 2;
                String myView = sonLine
                        ? (tMale ? "Grandson" : "Granddaughter")
                        : (tMale ? "Daughter's Son" : "Daughter's Daughter");
                String theirView = (sonLine ? "Paternal " : "Maternal ")
                        + (oMale ? "Grandfather" : "Grandmother");
                return new String[]{myView, theirView};
            }
            if (curr.v == -1 && curr.maxV == 1 && curr.line != 0) {
                boolean broLine = curr.line == 2;
                String myView = broLine
                        ? (tMale ? "Brother Son" : "Brother Daughter")
                        : (tMale ? "Sister Son" : "Sister Daughter");
                String theirView = oMale ? "Uncle" : "Aunt";
                return new String[]{myView, theirView};
            }
        }
        // My sibling's side-marked pibling shares my sides (same parents):
        // naming stays generic above, but here the side is certain, so name
        // it exactly (Paternal/Maternal Aunt/Uncle/GF/GM). SIBLING-prevCat
        // with s == 0 means a same-parents chain from ego's own sibling
        // link (inherited contexts preserve it); anything else stays generic.
        if (("GRANDPARENT".equals(cat) || "PIBLING".equals(cat))
                && curr.s == 0 && nextS == 0 && "SIBLING".equals(curr.prevCat)
                && kinSide > 0) {
            String sideName;
            String backName;
            if ("GRANDPARENT".equals(cat)) {
                sideName = (kinSide == 2 ? "Maternal " : "Paternal ")
                        + (tMale ? "Grandfather" : "Grandmother");
                backName = (kinSide == 2)
                        ? (eMale ? "Daughter's Son" : "Daughter's Daughter")
                        : (eMale ? "Grandson" : "Granddaughter");
            } else {
                sideName = (kinSide == 2 ? "Maternal " : "Paternal ")
                        + (tMale ? "Uncle" : "Aunt");
                backName = (kinSide == 2)
                        ? (eMale ? "Sister Son" : "Sister Daughter")
                        : (eMale ? "Brother Son" : "Brother Daughter");
            }
            return new String[]{sideName, backName};
        }
        // My grandchild's side-marked pibling, line-known: a son-line
        // grandchild's paternal aunt/uncle is my own child (Son/Daughter),
        // but the maternal side married in — my Daughter-in-law's
        // sibling, i.e. my Son's Brother/Sister-in-law (rows exist);
        // daughter-line mirrors this. Fresh line only (prevCat proves whose
        // line it is); married-in markers ("... Wife/Husband") stay generic.
        if ("PIBLING".equals(cat) && curr.v == -2 && curr.s == 0
                && (("GRANDCHILD".equals(curr.prevCat) || "NIBLING".equals(curr.prevCat)))
                && curr.line != 0 && kinSide > 0) {
            boolean sonLine = curr.line == 2;
            boolean paternal = kinSide == 1;
            String myView;
            String theirView;
            if (sonLine == paternal) {
                myView = tMale ? "Son" : "Daughter";
                theirView = eMale ? "Father" : "Mother";
            } else if (sonLine) {
                myView = tMale ? "Son's Brother-in-law" : "Son's Sister-in-law";
                theirView = eMale ? "Son's Father-in-law" : "Son's Mother-in-law";
            } else {
                myView = tMale ? "Daughter's Brother-in-law" : "Daughter's Sister-in-law";
                theirView = eMale ? "Daughter's Father-in-law" : "Daughter's Mother-in-law";
            }
            return new String[]{myView, theirView};
        }
        // My sibling's child is my nibling, brother/sister-line by the
        // sibling's own gender ("my brother's son" is exact, not generic
        // Nephew). Sibling-state (same parents) with s == 0 only.
        if ("CHILD".equals(cat) && curr.v == 0 && curr.maxV == 1 && curr.s == 0 && nextS == 0) {
            boolean broLine = "M".equals(middleGender);
            boolean sisLine = "F".equals(middleGender);
            if (broLine || sisLine) {
                String myView = broLine
                        ? (tMale ? "Brother Son" : "Brother Daughter")
                        : (tMale ? "Sister Son" : "Sister Daughter");
                String theirView = (broLine ? "Paternal " : "Maternal ")
                        + (eMale ? "Uncle" : "Aunt");
                return new String[]{myView, theirView};
            }
        }
        return null;
    }

    // Exact (chain or parenthesized specific) vs plain generic names:
    // "Sister-in-law (Husband's Sister)" and "Brother's Father-in-law"
    // describe precisely; "Sister-in-law" does not.
    private static boolean isExactName(String name) {
        return name != null && (name.contains("(") || name.contains("'s "));
    }

    // Exact names for a flipped (spouse-side) pibling of my own child.
    // Plain sides: my husband's brother/sister = Devar/Nanad, my wife's
    // brother/sister = Sala/Sali. Married-in rows map to their counterpart:
    // Tai<->Jethani, Chachi<->Devrani, Fufa->Nandoi(mine f)/Jija(mine m),
    // Mami->Bhabhi(mine f)/Sarhaj(mine m), Mausa->Jija(mine f)/Sadu(mine m).
    // theirView is the reverse seat (all rows exist). Returns null when the
    // generic in-law label should stand.
    private static String[] flippedPiblingExact(String relName, int kinSide,
                                                boolean eMale, boolean tMale) {
        if (relName == null) return null;
        String n = relName.toLowerCase().trim();
        // Plain side rows reached flipped: derive from ego gender.
        if (n.equals("paternal uncle") || n.equals("paternal aunt")
                || n.equals("father elder brother")) {
            if (eMale) return null; // my own brother/sister: generic stands
            return new String[]{
                    tMale ? "Brother-in-law (Husband's Brother)"
                            : "Sister-in-law (Husband's Sister)",
                    "Sister-in-law (Brother's Wife)"};
        }
        if (n.equals("maternal uncle") || n.equals("maternal aunt")) {
            if (!eMale) return null; // my own brother/sister: generic stands
            return new String[]{
                    tMale ? "Brother-in-law (Wife's Brother)"
                            : "Sister-in-law (Wife's Sister)",
                    "Brother-in-law (Sister's Husband)"};
        }
        // Married-in rows: exact counterpart each way.
        String myView = null;
        String theirView = null;
        if (n.equals("father elder brother wife")) {
            if (eMale) { myView = "Sister-in-law (Brother's Wife)"; theirView = "Brother-in-law (Husband's Brother)"; }
            else { myView = "Husband's Elder Brother's Wife"; theirView = "Husband's Brother's Wife"; }
        } else if (n.equals("father younger brother wife")) {
            if (eMale) { myView = "Sister-in-law (Brother's Wife)"; theirView = "Brother-in-law (Husband's Brother)"; }
            else { myView = "Husband's Brother's Wife"; theirView = "Husband's Elder Brother's Wife"; }
        } else if (n.equals("father sister husband")) {
            if (eMale) { myView = "Brother-in-law (Sister's Husband)"; theirView = "Brother-in-law (Wife's Sister's Husband)"; }
            else { myView = "Husband's Sister's Husband"; theirView = "Sister-in-law (Wife's Brother's Wife)"; }
        } else if (n.equals("mother brother wife")) {
            if (eMale) { myView = "Sister-in-law (Wife's Brother's Wife)"; theirView = "Husband's Sister's Husband"; }
            else { myView = "Sister-in-law (Brother's Wife)"; theirView = "Sister-in-law (Husband's Sister)"; }
        } else if (n.equals("mother sister husband")) {
            if (eMale) { myView = "Brother-in-law (Wife's Sister's Husband)"; theirView = "Brother-in-law (Wife's Sister's Husband)"; }
            else { myView = "Brother-in-law (Sister's Husband)"; theirView = "Sister-in-law (Wife's Sister)"; }
        }
        if (myView == null) return null;
        return new String[]{myView, theirView};
    }

    private String resolveStateName(int v, int maxV, int s, String gender) {
        boolean m = "M".equals(gender);
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
