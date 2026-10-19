package com.example.demo.repository;

import com.example.demo.model.Contact;
import com.example.demo.model.Relation;

import org.springframework.data.jpa.domain.Specification;

import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.CriteriaQuery;

import java.util.ArrayList;
import java.util.List;

public class ContactSpecification {

    public static Specification<Contact> buildSpec(
            String name,
            String phone,
            String email,
            Long relationId
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (name != null && !name.isBlank()) {
                String pattern = likePattern(name);
                predicates.add(cb.like(cb.lower(root.get("name")), "%" + pattern + "%", '\\'));
            }

            if (phone != null && !phone.isBlank()) {
                predicates.add(cb.equal(root.get("phone"), phone));
            }

            if (email != null && !email.isBlank()) {
                String pattern = likePattern(email);
                predicates.add(cb.like(cb.lower(root.get("email")), "%" + pattern + "%", '\\'));
            }

            if (relationId != null) {
                predicates.add(cb.equal(root.get("relation").get("id"), relationId));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    // User input is still bound as a query parameter by Criteria/JPA. Escaping
    // LIKE metacharacters additionally prevents '%' and '_' from turning a
    // literal search into an unexpectedly broad pattern.
    private static String likePattern(String value) {
        return value.toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
