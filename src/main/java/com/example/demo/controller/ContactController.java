package com.example.demo.controller;

import com.example.demo.dto.ContactDTO;
import com.example.demo.dto.InferredRelationDTO;
import com.example.demo.mapper.ContactMapper;
import com.example.demo.model.Contact;
import com.example.demo.model.Relation;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.ContactService;
import com.example.demo.service.RelationService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@CrossOrigin(origins = "http://localhost:3000")
@RestController
@RequestMapping("/api/contacts")
public class ContactController {

    private final ContactService contactService;
    private final RelationService relationService;
    private final UserRepository userRepository;

    public ContactController(ContactService contactService,
                             RelationService relationService,
                             UserRepository userRepository) {
        this.contactService = contactService;
        this.relationService = relationService;
        this.userRepository = userRepository;
    }

    // ── Helper: get user from @AuthenticationPrincipal OR SecurityContext ──
    private User getCurrentUser(UserDetails userDetails) {
        String email;

        if (userDetails != null) {
            email = userDetails.getUsername();
        } else {
            // Fallback: read from SecurityContextHolder directly
            Object principal = SecurityContextHolder.getContext()
                    .getAuthentication().getPrincipal();
            if (principal instanceof UserDetails ud) {
                email = ud.getUsername();
            } else if (principal instanceof String s) {
                email = s;
            } else {
                throw new RuntimeException("User not authenticated");
            }
        }

        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found: " + email));
    }

    @GetMapping
    public ResponseEntity<List<ContactDTO>> getAllContacts(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        List<Contact> contacts = contactService.getAllContacts(user);
        List<ContactDTO> dtos = contacts.stream()
                .map(contact -> {
                    ContactDTO dto = ContactMapper.toDTO(contact);
                    if (contact.getRelation() != null) {
                        dto.setRelationName(contact.getRelation().getRelationName());
                    }
                    return dto;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ContactDTO> getContactById(@PathVariable Long id) {
        return contactService.getContactById(id)
                .map(contact -> ResponseEntity.ok(ContactMapper.toDTO(contact)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createContact(
            @Valid @RequestBody ContactDTO dto,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        Contact saved = contactService.saveContact(dto, user);
        return ResponseEntity.ok(ContactMapper.toDTO(saved));
    }

    @PostMapping("/{id}/upload-picture")
    public ResponseEntity<?> uploadPicture(
            @PathVariable Long id,
            @RequestBody java.util.Map<String, String> body) {
        String base64 = body.get("imageBase64");
        if (base64 == null || base64.isBlank())
            return ResponseEntity.badRequest().body("Image data required!");
        ContactDTO updated = contactService.uploadProfilePicture(id, base64);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}/remove-picture")
    public ResponseEntity<?> removePicture(@PathVariable Long id) {
        ContactDTO updated = contactService.removeProfilePicture(id);
        return ResponseEntity.ok(updated);
    }

    @GetMapping("/paginated")
    public Page<ContactDTO> getContactsPaginated(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        Pageable pageable = PageRequest.of(page, size);
        Page<Contact> contactsPage = contactService.getAllContacts(user, pageable);
        return contactsPage.map(ContactMapper::toDTO);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ContactDTO> updateContact(
            @PathVariable Long id,
            @Valid @RequestBody ContactDTO dto) {
        Contact updated = contactService.updateContact(id, dto)
                .orElseThrow(() -> new RuntimeException("Contact not found"));
        ContactDTO responseDto = ContactMapper.toDTO(updated);
        if (updated.getRelation() != null) {
            responseDto.setRelationName(updated.getRelation().getRelationName());
        }
        return ResponseEntity.ok(responseDto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContact(@PathVariable Long id) {
        contactService.deleteContact(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/relations")
    public List<Relation> getRelations() {
        return relationService.getAll();
    }

    @GetMapping("/inferred-relations")
    public ResponseEntity<List<InferredRelationDTO>> getInferredRelations(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        return ResponseEntity.ok(relationService.inferRelations(user));
    }

    @GetMapping("/search")
    public Page<ContactDTO> searchContacts(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) Long relationId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        Page<Contact> contacts =
                contactService.searchContacts(name, phone, email, relationId, user,
                        PageRequest.of(page, size));
        return contacts.map(ContactMapper::toDTO);
    }
}