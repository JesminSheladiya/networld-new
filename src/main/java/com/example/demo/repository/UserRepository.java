package com.example.demo.repository;

import com.example.demo.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    boolean existsByPhone(String phone);
    boolean existsByUsernameIgnoreCase(String username);
    boolean existsByUsernameIgnoreCaseAndEmailNot(String username, String email);

    @Query("SELECT u FROM User u WHERE u.email = :identifier OR u.phone = :identifier OR LOWER(u.username) = LOWER(:identifier)")
    Optional<User> findByIdentifier(@Param("identifier") String identifier);

    // Search users by name, phone or email (excluding current user).
    // Unbounded variant kept for callers that already cap; new code should
    // use the Pageable overload below (100k-user safety).
    @Query("""
        SELECT u FROM User u
        WHERE u.id <> :currentUserId
          AND (LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.username) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.email) LIKE LOWER(CONCAT('%', :query, '%'))
            OR COALESCE(u.phone, '') LIKE CONCAT('%', :query, '%'))
        ORDER BY CASE
            WHEN LOWER(u.username) = LOWER(:query)
              OR LOWER(COALESCE(u.fullName, '')) = LOWER(:query) THEN 0
            WHEN LOWER(u.username) LIKE LOWER(CONCAT(:query, '%'))
              OR LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT(:query, '%')) THEN 1
            WHEN LOWER(u.username) LIKE LOWER(CONCAT('%', :query, '%'))
              OR LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT('%', :query, '%')) THEN 2
            WHEN LOWER(COALESCE(u.email, '')) LIKE LOWER(CONCAT('%', :query, '%'))
              OR COALESCE(u.phone, '') LIKE CONCAT('%', :query, '%') THEN 3
            ELSE 4
        END, LOWER(COALESCE(u.fullName, '')), LOWER(u.username)
    """)
    List<User> searchUsers(@Param("query") String query,
                           @Param("currentUserId") Long currentUserId);

    @Query("""
        SELECT u FROM User u
        WHERE u.id <> :currentUserId
          AND (LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.username) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.email) LIKE LOWER(CONCAT('%', :query, '%'))
            OR COALESCE(u.phone, '') LIKE CONCAT('%', :query, '%'))
        ORDER BY CASE
            WHEN LOWER(u.username) = LOWER(:query)
              OR LOWER(COALESCE(u.fullName, '')) = LOWER(:query) THEN 0
            WHEN LOWER(u.username) LIKE LOWER(CONCAT(:query, '%'))
              OR LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT(:query, '%')) THEN 1
            WHEN LOWER(u.username) LIKE LOWER(CONCAT('%', :query, '%'))
              OR LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT('%', :query, '%')) THEN 2
            WHEN LOWER(COALESCE(u.email, '')) LIKE LOWER(CONCAT('%', :query, '%'))
              OR COALESCE(u.phone, '') LIKE CONCAT('%', :query, '%') THEN 3
            ELSE 4
        END, LOWER(COALESCE(u.fullName, '')), LOWER(u.username)
    """)
    List<User> searchUsers(@Param("query") String query,
                           @Param("currentUserId") Long currentUserId,
                           org.springframework.data.domain.Pageable pageable);

    // Regen candidate scan: ids only (hydrating 100k full Users per regen
    // pulls every TEXT photo column into the persistence context).
    @Query("SELECT u.id FROM User u WHERE u.id <> :excludedId")
    List<Long> findAllIdsExcept(@Param("excludedId") Long excludedId);
}
