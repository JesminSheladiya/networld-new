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

    public List<Contact> getAllContacts(User user) {
        return contactRepository.findByUser(user);
    }

    public Page<Contact> getAllContacts(User user, Pageable pageable) {
        return contactRepository.findByUser(user, pageable);
    }

    public Optional<Contact> getContactById(Long id) {
        return contactRepository.findById(id);
    }

    public Contact saveContact(ContactDTO dto, User currentUser) {
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

    public Optional<Contact> updateContact(Long id, ContactDTO dto) {
        return contactRepository.findById(id).map(contact -> {
            if (contactRepository.existsByPhoneAndIdNot(dto.getPhone(), id)) {
                throw new RuntimeException("Phone number already exists!");
            }
            if (contactRepository.existsByEmailAndIdNot(dto.getEmail(), id)) {
                throw new RuntimeException("Email already exists!");
            }

            contact.setName(dto.getName());
            contact.setPhone(dto.getPhone());
            contact.setEmail(dto.getEmail());

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

    public void deleteContact(Long id) {
        contactRepository.deleteById(id);
    }

    public Page<Contact> searchContacts(String name, String phone, String email,
                                        Long relationId, User user, Pageable pageable) {
        Specification<Contact> spec = ContactSpecification.buildSpec(name, phone, email, relationId)
                .and((root, query, cb) -> cb.equal(root.get("user"), user));
        return contactRepository.findAll(spec, pageable);
    }

    public ContactDTO uploadProfilePicture(Long contactId, String base64Image) {
        Contact contact = contactRepository.findById(contactId)
                .orElseThrow(() -> new RuntimeException("Contact not found"));
        contact.setProfilePicture(base64Image);
        contactRepository.save(contact);
        return ContactMapper.toDTO(contact);
    }

    public ContactDTO removeProfilePicture(Long contactId) {
        Contact contact = contactRepository.findById(contactId)
                .orElseThrow(() -> new RuntimeException("Contact not found"));
        contact.setProfilePicture(null);
        contactRepository.save(contact);
        return ContactMapper.toDTO(contact);
    }
}