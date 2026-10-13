package com.example.demo.service;

import com.example.demo.dto.ContactDTO;
import com.example.demo.mapper.ContactMapper;
import com.example.demo.model.Contact;
import com.example.demo.model.Relation;
import com.example.demo.model.User;
import com.example.demo.model.UserRelation;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactSpecification;
import com.example.demo.repository.RelationRepository;
import com.example.demo.repository.UserRelationRepository;
import com.example.demo.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.Optional;

@Service
public class ContactService {

    private final ContactRepository      contactRepository;
    private final RelationRepository     relationRepository;
    private final UserRepository         userRepository;
    private final UserRelationRepository userRelationRepository;

    public ContactService(ContactRepository contactRepository,
                          RelationRepository relationRepository,
                          UserRepository userRepository,
                          UserRelationRepository userRelationRepository) {
        this.contactRepository      = contactRepository;
        this.relationRepository     = relationRepository;
        this.userRepository         = userRepository;
        this.userRelationRepository = userRelationRepository;
    }

    @Transactional(readOnly = true)
    public List<Contact> getAllContacts(User user) {
        return contactRepository.findByUser(user);
    }

    @Transactional(readOnly = true)
    public Page<Contact> getAllContacts(User user, Pageable pageable) {
        return contactRepository.findByUser(user, pageable);
    }

    @Transactional(readOnly = true)
    public Optional<Contact> getContactById(Long id, User user) {
        return contactRepository.findByIdAndUser(id, user);
    }

    @Transactional
    public Contact saveContact(ContactDTO dto, User currentUser) {
        if (dto.getPhone() != null
                && contactRepository.existsByUserAndPhone(currentUser, dto.getPhone())) {
            throw new RuntimeException("Phone number already exists!");
        }
        if (dto.getEmail() != null
                && contactRepository.existsByUserAndEmail(currentUser, dto.getEmail())) {
            throw new RuntimeException("Email already exists!");
        }
        Contact contact = ContactMapper.toEntity(dto);
        contact.setUser(currentUser);

        // ── FIX: use a final local variable for lambda ──
        final Relation finalRelation;
        if (dto.getRelationId() != null) {
            finalRelation = relationRepository.findById(dto.getRelationId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Invalid relation ID: " + dto.getRelationId()));
            contact.setRelation(finalRelation);
        } else {
            finalRelation = null;
        }

        Contact saved = contactRepository.save(contact);

        // Auto-create PENDING UserRelation if contact email = a registered user
        if (dto.getEmail() != null && finalRelation != null) {
            Optional<User> contactUserOpt = userRepository.findByEmail(dto.getEmail());
            contactUserOpt.ifPresent(contactUser -> {
                if (contactUser.getId().equals(currentUser.getId())) return;

                boolean alreadyExists = userRelationRepository
                        .findByFromUserAndToUser(currentUser, contactUser)
                        .isPresent();
                if (alreadyExists) return;

                UserRelation ur = new UserRelation(currentUser, contactUser, finalRelation, "PENDING");
                userRelationRepository.save(ur);

                System.out.println("=== UserRelation created: "
                        + currentUser.getEmail() + " → " + contactUser.getEmail()
                        + " as " + finalRelation.getRelationName() + " [PENDING]");
            });
        }

        return saved;
    }

    @Transactional
    public Optional<Contact> updateContact(Long id, ContactDTO dto, User user) {
        return contactRepository.findByIdAndUser(id, user).map(contact -> {
            // Phone / email are identity fields — immutable after creation.
            if (dto.getPhone() != null && !dto.getPhone().equals(contact.getPhone())) {
                throw new RuntimeException("Phone cannot be changed!");
            }
            if (dto.getEmail() != null && !dto.getEmail().equalsIgnoreCase(contact.getEmail())) {
                throw new RuntimeException("Email cannot be changed!");
            }

            contact.setName(dto.getName());

            if (dto.getProfilePicture() != null) {
                contact.setProfilePicture(
                        dto.getProfilePicture().isBlank() ? null : dto.getProfilePicture()
                );
            }

            if (dto.getRelationId() != null) {
                Relation relation = relationRepository.findById(dto.getRelationId())
                        .orElseThrow(() -> new IllegalArgumentException("Invalid relation ID"));
                contact.setRelation(relation);
            } else {
                contact.setRelation(null);
            }

            return contactRepository.save(contact);
        });
    }

    @Transactional
    public boolean deleteContact(Long id, User user) {
        return contactRepository.deleteByIdAndUser(id, user) > 0;
    }

    @Transactional(readOnly = true)
    public Page<Contact> searchContacts(String name, String phone, String email,
                                        Long relationId, User user, Pageable pageable) {
        Specification<Contact> spec = ContactSpecification.buildSpec(name, phone, email, relationId)
                .and((root, query, cb) -> cb.equal(root.get("user"), user));
        return contactRepository.findAll(spec, pageable);
    }

    @Transactional
    public ContactDTO uploadProfilePicture(Long contactId, String base64Image, User user) {
        Contact contact = contactRepository.findByIdAndUser(contactId, user)
                .orElseThrow(() -> new RuntimeException("Contact not found"));
        contact.setProfilePicture(base64Image);
        contactRepository.save(contact);
        return ContactMapper.toDTO(contact);
    }

    @Transactional
    public ContactDTO removeProfilePicture(Long contactId, User user) {
        Contact contact = contactRepository.findByIdAndUser(contactId, user)
                .orElseThrow(() -> new RuntimeException("Contact not found"));
        contact.setProfilePicture(null);
        contactRepository.save(contact);
        return ContactMapper.toDTO(contact);
    }
}
