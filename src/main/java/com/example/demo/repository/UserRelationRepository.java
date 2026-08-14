package com.example.demo.repository;

import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRelationRepository extends JpaRepository<UserRelation, Long> {

    List<UserRelation> findByFromUser(User fromUser);
    List<UserRelation> findByToUser(User toUser);
    List<UserRelation> findByFromUserAndStatus(User fromUser, String status);
    List<UserRelation> findByToUserAndStatus(User toUser, String status);
    Optional<UserRelation> findByFromUserAndToUser(User fromUser, User toUser);
    List<UserRelation> findByStatus(String status);

    @Modifying
    @Query("DELETE FROM UserRelation ur WHERE ur.status = 'SUGGESTED' AND (ur.fromUser = :user OR ur.toUser = :user)")
    void deleteAllSuggestionsFor(@Param("user") User user);

    @Query(value = "SELECT pg_advisory_xact_lock(:lockKey)", nativeQuery = true)
    void lockSuggestionRegeneration(@Param("lockKey") long lockKey);


    @Query("""
        SELECT ur FROM UserRelation ur
        WHERE ((ur.toUser = :commonUser AND ur.fromUser <> :me)
           OR  (ur.fromUser = :commonUser AND ur.toUser <> :me))
          AND ur.status = 'ACCEPTED'
    """)
    List<UserRelation> findOthersRelatedToSameUser(
            @Param("commonUser") User commonUser,
            @Param("me") User me
    );

    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (LOWER(ur.toUser.fullName)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.email)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.phone)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(r.relationName)      LIKE LOWER(CONCAT('%', :query, '%')))
    """)
    List<UserRelation> searchAcceptedConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query
    );
}