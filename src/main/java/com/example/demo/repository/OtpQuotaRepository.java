package com.example.demo.repository;

import com.example.demo.model.OtpQuota;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

public interface OtpQuotaRepository extends JpaRepository<OtpQuota, Long> {
    Optional<OtpQuota> findByEmailAndPurpose(String email, String purpose);

    @Transactional
    void deleteByEmail(String email);
}
