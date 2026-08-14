package com.example.demo.repository;

import com.example.demo.model.Relation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RelationRepository extends JpaRepository<Relation, Long> {

    Optional<Relation> findByRelationNameIgnoreCase(String relationName);

    Optional<Relation> findFirstByGenerationLevelAndGenderAndIsBlood(
            Integer generationLevel, String gender, Boolean isBlood
    );

    Optional<Relation> findFirstByGenerationLevelAndIsBlood(
            Integer generationLevel, Boolean isBlood
    );

    Optional<Relation> findByRelationCategoryAndGenerationLevelAndGender(
            String relationCategory, Integer generationLevel, String gender
    );
}