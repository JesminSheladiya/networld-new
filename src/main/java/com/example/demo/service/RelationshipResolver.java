package com.example.demo.service;

import com.example.demo.model.Relation;
import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class RelationshipResolver {

    private static class State {
        Long userId;
        int v;
        int maxV;
        int s;
        // grandchild lineage: 0 = unknown, 1 = via my daughter
        // ("Daughter's Son/Daughter"), 2 = via my son (paternal default).
        // Consumed by a PARENT hop ("my grandchild's father/mother").
        int line;

        public State(Long userId, int v, int maxV, int s, int line) {
            this.userId = userId;
            this.v = v;
            this.maxV = maxV;
            this.s = s;
            this.line = line;
        }
    }

    public static class RelResult {
        public String otherToMe;
        public String meToOther;
        public RelResult(String o2m, String m2o) {
            this.otherToMe = o2m;
            this.meToOther = m2o;
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

        Queue<State> queue = new LinkedList<>();
        queue.add(new State(me.getId(), 0, 0, 0, 0));
        
        Set<Long> visited = new HashSet<>();
        visited.add(me.getId());

        while (!queue.isEmpty()) {
            State curr = queue.poll();
            
            for (UserRelation edge : adj.getOrDefault(curr.userId, Collections.emptyList())) {
                Long nextId = edge.getToUser().getId();
                if (visited.contains(nextId)) continue;
                visited.add(nextId);
                
                Relation rel = edge.getRelation();
                String cat = rel.getRelationCategory() != null ? rel.getRelationCategory() : "OTHER";
                
                int nextV = curr.v;
                int nextMaxV = curr.maxV;
                int nextS = curr.s;
                int nextLine = curr.line;

                switch (cat.toUpperCase()) {
                    case "PARENT":
                        nextV += 1; nextMaxV = Math.max(nextMaxV, nextV);
                        nextLine = 0;
                        if (nextS == 2) {
                            nextS = 1;
                        } else if (nextS == 0 && curr.v == -1 && curr.maxV == 0) {
                            nextS = 2; // Child's other parent is our Spouse
                        } else if (nextS == 0 && curr.v == -2 && curr.maxV == 0 && curr.line != 0) {
                            // My grandchild's parent: daughter-line ("Daughter's
                            // Son/Daughter") -> father is my Son-in-law, mother
                            // is my Daughter; son-line -> father is my Son,
                            // mother is my Daughter-in-law.
                            boolean targetMale = !"F".equals(rel.getGender());
                            boolean inLaw = (curr.line == 1) ? targetMale : !targetMale;
                            if (inLaw) nextS = 1;
                        }
                        break;
                    case "CHILD": 
                        nextV -= 1; 
                        if (nextS == 2) nextS = 0;
                        break;
                    case "SIBLING": 
                        nextMaxV = Math.max(nextMaxV, nextV + 1); 
                        if (nextS == 2) nextS = 1;
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
                        break;
                    case "NIBLING": // Nephew/Niece
                        nextV -= 1; nextMaxV = Math.max(nextMaxV, nextV + 2);
                        if (nextS == 2) nextS = 1;
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
                        nextS = 1;
                        break;
                    default:
                        int g = rel.getGenerationLevel() != null ? rel.getGenerationLevel() : 0;
                        nextV += g;
                        if (g > 0) nextMaxV = Math.max(nextMaxV, nextV);
                        else if (g == 0) nextMaxV = Math.max(nextMaxV, nextV + 1);
                        break;
                }
                
                User nextUser = edge.getToUser();
                String gender = (nextUser != null && nextUser.getGender() != null) ? nextUser.getGender() : "N";
                User middleUser = users.get(curr.userId);
                String middleGender = (middleUser != null && middleUser.getGender() != null)
                        ? middleUser.getGender() : "N";
                String egoGender = (me != null && me.getGender() != null) ? me.getGender() : "N";
                String targetGender = (rel.getGender() != null) ? rel.getGender() : "N";

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
                
                results.put(nextId, new RelResult(otherToMeStr, meToOtherStr));
                queue.add(new State(nextId, nextV, nextMaxV, nextS, nextLine));
            }
        }
        
        return results;
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