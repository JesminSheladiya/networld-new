package com.example.demo.repository;

import com.example.demo.model.User;
import com.example.demo.model.UsernameChangeHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface UsernameChangeHistoryRepository extends JpaRepository<UsernameChangeHistory, Long> {
    long countByUserAndChangedAtAfter(User user, Instant after);

    Optional<UsernameChangeHistory> findFirstByUserAndChangedAtAfterOrderByChangedAtAsc(
            User user, Instant after);

    void deleteByUser(User user);
}
