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
        
        public State(Long userId, int v, int maxV, int s) {
            this.userId = userId;
            this.v = v;
            this.maxV = maxV;
            this.s = s;
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
        queue.add(new State(me.getId(), 0, 0, 0));
        
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
                
                switch (cat.toUpperCase()) {
                    case "PARENT": 
                        nextV += 1; nextMaxV = Math.max(nextMaxV, nextV); 
                        if (nextS == 2) {
                            nextS = 1;
                        } else if (nextS == 0 && curr.v == -1 && curr.maxV == 0) {
                            nextS = 2; // Child's other parent is our Spouse
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
                        break;
                    case "GRANDCHILD": 
                        nextV -= 2; 
                        if (nextS == 2) nextS = 0;
                        break;
                    case "PIBLING": // Uncle/Aunt
                        nextV += 1; nextMaxV = Math.max(nextMaxV, nextV + 1); 
                        if (nextS == 2) nextS = 1;
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
                String otherToMeStr = resolveStateName(nextV, nextMaxV, nextS, gender);
                
                int invV = -nextV;
                int invMaxV = nextMaxV - nextV;
                String meGender = (me != null && me.getGender() != null) ? me.getGender() : "N";
                String meToOtherStr = resolveStateName(invV, invMaxV, nextS, meGender);
                
                results.put(nextId, new RelResult(otherToMeStr, meToOtherStr));
                queue.add(new State(nextId, nextV, nextMaxV, nextS));
            }
        }
        
        return results;
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
        if (v > 2 && maxV == v) return m ? "Grandfather" : "Grandmother";
        if (v < -2 && maxV == 0) return m ? "Grandson" : "Granddaughter";
        
        return null;
    }
}