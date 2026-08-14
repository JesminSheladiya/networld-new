package com.example.demo.repository;

import com.example.demo.model.RelationInferenceRule;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RelationInferenceRuleRepository
        extends JpaRepository<RelationInferenceRule, Long> {

    Optional<RelationInferenceRule> findByCategoryAAndGenderAAndCategoryBAndGenderB(
            String categoryA, String genderA,
            String categoryB, String genderB
    );
}