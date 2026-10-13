package com.example.demo.repository;

import com.example.demo.model.Contact;
import com.example.demo.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface ContactRepository extends JpaRepository<Contact, Long>, JpaSpecificationExecutor<Contact> {

    boolean existsByUserAndPhoneAndIdNot(User user, String phone, Long id);
    boolean existsByUserAndEmailAndIdNot(User user, String email, Long id);

    boolean existsByUserAndPhone(User user, String phone);
    boolean existsByUserAndEmail(User user, String email);

    java.util.Optional<Contact> findByIdAndUser(Long id, User user);

    long deleteByIdAndUser(Long id, User user);

    List<Contact> findByUser(User user);
    Page<Contact> findByUser(User user, Pageable pageable);

    void deleteByUser(User user);

}