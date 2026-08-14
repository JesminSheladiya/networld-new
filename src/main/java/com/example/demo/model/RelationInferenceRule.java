package com.example.demo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "relation_inference_rules")
public class RelationInferenceRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "category_a", nullable = false, length = 20)
    private String categoryA;

    @Column(name = "gender_a", nullable = false, length = 1)
    private String genderA;

    @Column(name = "category_b", nullable = false, length = 20)
    private String categoryB;

    @Column(name = "gender_b", nullable = false, length = 1)
    private String genderB;

    @Column(name = "inferred_relation_name", nullable = false, length = 100)
    private String inferredRelationName;

    // Getters
    public Long getId() { return id; }
    public String getCategoryA() { return categoryA; }
    public String getGenderA() { return genderA; }
    public String getCategoryB() { return categoryB; }
    public String getGenderB() { return genderB; }
    public String getInferredRelationName() { return inferredRelationName; }
}