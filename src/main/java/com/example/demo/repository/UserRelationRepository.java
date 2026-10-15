package com.example.demo.repository;

import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRelationRepository extends JpaRepository<UserRelation, Long> {

    // 10k-user lists (pending/sent/connections tabs) hydrate fromUser,
    // toUser and relation per row — without the graph each row costs 3
    // extra SELECTs (30k queries for a 10k list = the "lag/crash").
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    List<UserRelation> findByFromUser(User fromUser);
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    List<UserRelation> findByToUser(User toUser);
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    List<UserRelation> findByFromUserAndStatus(User fromUser, String status);
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    List<UserRelation> findByToUserAndStatus(User toUser, String status);
    // Paged variants bound DOM + payload for 10k-item tabs (default 20).
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    Page<UserRelation> findByToUserAndStatus(User toUser, String status, Pageable pageable);
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    Page<UserRelation> findByFromUserAndStatus(User fromUser, String status, Pageable pageable);
    // Badge/tab totals without hydrating entities.
    long countByToUserAndStatus(User toUser, String status);
    Optional<UserRelation> findByFromUserAndToUser(User fromUser, User toUser);
    @EntityGraph(attributePaths = {"fromUser", "toUser", "relation"})
    List<UserRelation> findByStatus(String status);

    // Cheap total for the unfiltered counts tab — COUNT(*) over the
    // (from_user_id, status) index instead of loading full entities.
    long countByFromUserAndStatus(User fromUser, String status);

    // Bulk pair lookups for suggestion regen: 2 queries instead of 2 per
    // candidate user (200k queries at 100k users = the regen "crash").
    // Returns [otherUserId, status] rows for all pairs touching me.
    @Query("SELECT ur.toUser.id, ur.status FROM UserRelation ur WHERE ur.fromUser = :me")
    List<Object[]> findOutgoingIdStatus(@Param("me") User me);

    @Query("SELECT ur.fromUser.id, ur.status FROM UserRelation ur WHERE ur.toUser = :me")
    List<Object[]> findIncomingIdStatus(@Param("me") User me);

    // Candidate scan without hydrating 100k full User entities (ids only;
    // per-candidate entity is attached lazily via getReferenceById).
    @Query("SELECT u.id FROM User u WHERE u.id <> :excludedId")
    List<Long> findAllIdsExcept(@Param("excludedId") Long excludedId);

    // Cheap filtered total for the counts tab — same predicates as
    // searchAcceptedConnections but COUNT only (no entity hydration, no N+1).
    // Parens matter: the OR legs must stay inside the fromUser/status scope.
    @Query("""
        SELECT COUNT(ur) FROM UserRelation ur
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (LOWER(ur.toUser.fullName)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR (:includePhone = TRUE AND LOWER(ur.toUser.phone) LIKE LOWER(CONCAT('%', :query, '%'))))
    """)
    long countSearchAcceptedConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("includePhone") boolean includePhone
    );

    // Lightweight email sets for the connections-of viewer check: the old
    // code hydrated two full ACCEPTED entity lists (with TEXT photo columns
    // via the EntityGraph) just to build a lowercased-email set. At 10k
    // connections × 4G that is the profile-connections lag; at 1M it OOMs.
    @Query("""
        SELECT LOWER(ur.toUser.email) FROM UserRelation ur
        WHERE ur.fromUser = :viewer AND ur.status = 'ACCEPTED'
    """)
    List<String> findAcceptedToEmails(@Param("viewer") User viewer);

    @Query("""
        SELECT LOWER(ur.fromUser.email) FROM UserRelation ur
        WHERE ur.toUser = :viewer AND ur.status = 'ACCEPTED'
    """)
    List<String> findAcceptedFromEmails(@Param("viewer") User viewer);

    // Suggestions are owned per-sender: each user regenerates ONLY their own
    // outgoing rows (incoming rows belong to the other side's regeneration —
    // writing both sides caused last-writer-wins flapping on asymmetric pairs).
    @Modifying
    @Query("DELETE FROM UserRelation ur WHERE ur.status = 'SUGGESTED' AND ur.fromUser = :user")
    void deleteAllSuggestionsFor(@Param("user") User user);

    // Account deletion: every relation row touching the user, either side,
    // any status (pending/suggested/accepted/declined).
    @Modifying
    @Query("DELETE FROM UserRelation ur WHERE ur.fromUser = :user OR ur.toUser = :user")
    void deleteAllInvolving(@Param("user") User user);

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

    // Contacts search scope: name + username always, phone only on
    // desktop (includePhone). Email / relation names never match here.
    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (LOWER(ur.toUser.fullName)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR (:includePhone = TRUE AND LOWER(ur.toUser.phone) LIKE LOWER(CONCAT('%', :query, '%'))))
    """)
    List<UserRelation> searchAcceptedConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("includePhone") boolean includePhone
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

    // Server-side category filter, driven by the master relation_category
    // column: INLAW -> inlaws, OTHER -> others, everything else -> family.
    // New relations only need the correct category — no query changes required.
    @EntityGraph(attributePaths = {"toUser", "relation"})
    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (:query IS NULL OR :query = '' OR (
               LOWER(ur.toUser.fullName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR (:includePhone = TRUE AND LOWER(ur.toUser.phone) LIKE LOWER(CONCAT('%', :query, '%')))))
          AND (:category IS NULL OR :category = '' OR :category = 'all'
            OR (:category = 'inlaws' AND r.relationCategory = 'INLAW')
            OR (:category = 'family' AND r.relationCategory <> 'INLAW' AND r.relationCategory <> 'OTHER')
            OR (:category = 'others' AND r.relationCategory = 'OTHER'))
    """)
    Page<UserRelation> pageFilteredConnections(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("category") String category,
            @Param("includePhone") boolean includePhone,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"toUser", "relation"})
    @Query("""
        SELECT ur FROM UserRelation ur
        JOIN ur.relation r
        WHERE ur.fromUser = :fromUser
          AND ur.status = 'ACCEPTED'
          AND (:query IS NULL OR :query = '' OR (
               LOWER(ur.toUser.fullName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(ur.toUser.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR (:includePhone = TRUE AND LOWER(ur.toUser.phone) LIKE LOWER(CONCAT('%', :query, '%')))))
          AND (:category IS NULL OR :category = '' OR :category = 'all'
            OR (:category = 'inlaws' AND r.relationCategory = 'INLAW')
            OR (:category = 'family' AND r.relationCategory <> 'INLAW' AND r.relationCategory <> 'OTHER')
            OR (:category = 'others' AND r.relationCategory = 'OTHER'))
          AND r.relationName IN :relations
    """)
    Page<UserRelation> pageFilteredConnectionsByRelations(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("category") String category,
            @Param("relations") List<String> relations,
            @Param("includePhone") boolean includePhone,
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
            OR (:includePhone = TRUE AND LOWER(ur.toUser.phone) LIKE LOWER(CONCAT('%', :query, '%')))))
        GROUP BY r.relationName
        ORDER BY COUNT(ur) DESC, r.relationName ASC
    """)
    List<Object[]> countConnectionsByRelation(
            @Param("fromUser") User fromUser,
            @Param("query") String query,
            @Param("includePhone") boolean includePhone
    );
}