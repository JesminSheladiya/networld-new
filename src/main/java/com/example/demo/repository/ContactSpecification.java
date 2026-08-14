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
                predicates.add(cb.like(cb.lower(root.get("name")), "%" + name.toLowerCase() + "%"));
            }

            if (phone != null && !phone.isBlank()) {
                predicates.add(cb.equal(root.get("phone"), phone));
            }

            if (email != null && !email.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("email")), "%" + email.toLowerCase() + "%"));
            }

            if (relationId != null) {
                predicates.add(cb.equal(root.get("relation"), relationId));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
