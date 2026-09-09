package com.example.demo.repository;

import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
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

    Page<UserRelation> findByFromUserAndStatus(User fromUser, String status, Pageable pageable);

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
    Page<UserRelation> searchAcceptedConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            Pageable pageable
    );

    // Server-side category filter. Categories mirror the app grouping:
    // family = main relations (incl. uncle's/aunt's children); inlaws = *-in-law;
    // others = friend, generic cousins + anything else.
    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (:query IS NULL OR :query = '' OR (
               LOWER(ur.toUser.fullName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.email)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.phone)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(r.relationName)      LIKE LOWER(CONCAT('%', :query, '%'))))
          AND (:category IS NULL OR :category = '' OR :category = 'all'
            OR (:category = 'inlaws' AND LOWER(r.relationName) LIKE '%in-law%')
            OR (:category = 'family' AND LOWER(r.relationName) NOT LIKE '%in-law%' AND (
                 LOWER(r.relationName) LIKE '%father%'   OR LOWER(r.relationName) LIKE '%mother%'
              OR LOWER(r.relationName) LIKE '%brother%'  OR LOWER(r.relationName) LIKE '%sister%'
              OR LOWER(r.relationName) LIKE '%son%'      OR LOWER(r.relationName) LIKE '%daughter%'
              OR LOWER(r.relationName) LIKE '%husband%'  OR LOWER(r.relationName) LIKE '%wife%'
              OR LOWER(r.relationName) LIKE '%grand%'    OR LOWER(r.relationName) LIKE '%uncle%'
              OR LOWER(r.relationName) LIKE '%aunt%'     OR LOWER(r.relationName) LIKE '%nephew%'
              OR LOWER(r.relationName) LIKE '%niece%'    OR LOWER(r.relationName) LIKE '%elder%'
              OR LOWER(r.relationName) LIKE '%younger%'  OR LOWER(r.relationName) LIKE '%cousin%'
              OR LOWER(r.relationName) LIKE '%paternal%' OR LOWER(r.relationName) LIKE '%maternal%'
              OR LOWER(r.relationName) LIKE '%''s%'))
            OR (:category = 'others' AND LOWER(r.relationName) NOT LIKE '%in-law%' AND (
                 LOWER(r.relationName) LIKE '%friend%'
              OR (LOWER(r.relationName) NOT LIKE '%father%'   AND LOWER(r.relationName) NOT LIKE '%mother%'
              AND LOWER(r.relationName) NOT LIKE '%brother%'  AND LOWER(r.relationName) NOT LIKE '%sister%'
              AND LOWER(r.relationName) NOT LIKE '%son%'      AND LOWER(r.relationName) NOT LIKE '%daughter%'
              AND LOWER(r.relationName) NOT LIKE '%husband%'  AND LOWER(r.relationName) NOT LIKE '%wife%'
              AND LOWER(r.relationName) NOT LIKE '%grand%'    AND LOWER(r.relationName) NOT LIKE '%uncle%'
              AND LOWER(r.relationName) NOT LIKE '%aunt%'     AND LOWER(r.relationName) NOT LIKE '%nephew%'
              AND LOWER(r.relationName) NOT LIKE '%niece%'    AND LOWER(r.relationName) NOT LIKE '%elder%'
              AND LOWER(r.relationName) NOT LIKE '%younger%'  AND LOWER(r.relationName) NOT LIKE '%cousin%'
              AND LOWER(r.relationName) NOT LIKE '%paternal%' AND LOWER(r.relationName) NOT LIKE '%maternal%'
              AND LOWER(r.relationName) NOT LIKE '%''s%'))))
    """)
    Page<UserRelation> pageFilteredConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("category") String category,
            Pageable pageable
    );

    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (:query IS NULL OR :query = '' OR (
               LOWER(ur.toUser.fullName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.email)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.phone)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(r.relationName)      LIKE LOWER(CONCAT('%', :query, '%'))))
          AND (:category IS NULL OR :category = '' OR :category = 'all'
            OR (:category = 'inlaws' AND LOWER(r.relationName) LIKE '%in-law%')
            OR (:category = 'family' AND LOWER(r.relationName) NOT LIKE '%in-law%' AND (
                 LOWER(r.relationName) LIKE '%father%'   OR LOWER(r.relationName) LIKE '%mother%'
              OR LOWER(r.relationName) LIKE '%brother%'  OR LOWER(r.relationName) LIKE '%sister%'
              OR LOWER(r.relationName) LIKE '%son%'      OR LOWER(r.relationName) LIKE '%daughter%'
              OR LOWER(r.relationName) LIKE '%husband%'  OR LOWER(r.relationName) LIKE '%wife%'
              OR LOWER(r.relationName) LIKE '%grand%'    OR LOWER(r.relationName) LIKE '%uncle%'
              OR LOWER(r.relationName) LIKE '%aunt%'     OR LOWER(r.relationName) LIKE '%nephew%'
              OR LOWER(r.relationName) LIKE '%niece%'    OR LOWER(r.relationName) LIKE '%elder%'
              OR LOWER(r.relationName) LIKE '%younger%'  OR LOWER(r.relationName) LIKE '%cousin%'
              OR LOWER(r.relationName) LIKE '%paternal%' OR LOWER(r.relationName) LIKE '%maternal%'
              OR LOWER(r.relationName) LIKE '%''s%'))
            OR (:category = 'others' AND LOWER(r.relationName) NOT LIKE '%in-law%' AND (
                 LOWER(r.relationName) LIKE '%friend%'
              OR (LOWER(r.relationName) NOT LIKE '%father%'   AND LOWER(r.relationName) NOT LIKE '%mother%'
              AND LOWER(r.relationName) NOT LIKE '%brother%'  AND LOWER(r.relationName) NOT LIKE '%sister%'
              AND LOWER(r.relationName) NOT LIKE '%son%'      AND LOWER(r.relationName) NOT LIKE '%daughter%'
              AND LOWER(r.relationName) NOT LIKE '%husband%'  AND LOWER(r.relationName) NOT LIKE '%wife%'
              AND LOWER(r.relationName) NOT LIKE '%grand%'    AND LOWER(r.relationName) NOT LIKE '%uncle%'
              AND LOWER(r.relationName) NOT LIKE '%aunt%'     AND LOWER(r.relationName) NOT LIKE '%nephew%'
              AND LOWER(r.relationName) NOT LIKE '%niece%'    AND LOWER(r.relationName) NOT LIKE '%elder%'
              AND LOWER(r.relationName) NOT LIKE '%younger%'  AND LOWER(r.relationName) NOT LIKE '%cousin%'
              AND LOWER(r.relationName) NOT LIKE '%paternal%' AND LOWER(r.relationName) NOT LIKE '%maternal%'
              AND LOWER(r.relationName) NOT LIKE '%''s%'))))
          AND r.relationName IN :relations
    """)
    Page<UserRelation> pageFilteredConnectionsByRelations(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("category") String category,
            @Param("relations") List<String> relations,
            Pageable pageable
    );

    @Query("""
        SELECT r.relationName, COUNT(ur) FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (:query IS NULL OR :query = '' OR (
               LOWER(ur.toUser.fullName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.email)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.phone)     LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(r.relationName)      LIKE LOWER(CONCAT('%', :query, '%'))))
        GROUP BY r.relationName
        ORDER BY COUNT(ur) DESC, r.relationName ASC
    """)
    List<Object[]> countConnectionsByRelation(
            @Param("fromUser") User fromUser,
            @Param("query") String query
    );
}