package com.example.demo.repository;

import com.example.demo.model.EmailOtpVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

public interface EmailOtpRepository extends JpaRepository<EmailOtpVerification, Long> {
    Optional<EmailOtpVerification> findByEmail(String email);
    @Modifying
    @Transactional
    void deleteByEmail(String email);
}
