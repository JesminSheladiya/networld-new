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

    @Query("SELECT u FROM User u WHERE u.email = :identifier OR u.phone = :identifier")
    Optional<User> findByIdentifier(@Param("identifier") String identifier);

    // Search users by name or email (excluding current user)
    @Query("""
        SELECT u FROM User u
        WHERE u.id <> :currentUserId
          AND (LOWER(u.fullName)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.username)  LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(u.email)     LIKE LOWER(CONCAT('%', :query, '%')))
    """)
    List<User> searchUsers(@Param("query") String query,
                           @Param("currentUserId") Long currentUserId);
}