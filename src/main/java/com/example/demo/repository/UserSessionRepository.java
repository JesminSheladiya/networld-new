package com.example.demo.repository;

import com.example.demo.model.User;
import com.example.demo.model.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    List<UserSession> findByUserOrderByLastActiveAtDesc(User user);

    Optional<UserSession> findByTokenHash(String tokenHash);

    Optional<UserSession> findByIdAndUser(Long id, User user);

    @Modifying
    @Query("DELETE FROM UserSession s WHERE s.user = :user")
    int deleteByUser(@Param("user") User user);
}
