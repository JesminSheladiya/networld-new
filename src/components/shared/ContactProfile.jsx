import { useEffect, useState } from "react";
import { Avatar, Modal } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faArrowLeft, faPhone, faCakeCandles } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import RelationChip from "./RelationChip";
import EditRelationModal from "./EditRelationModal";
import { formatBirthDateWithAge } from "../../utils/dateUtils";

function ContactProfile({ contact, showBack = false, onBack }) {
  const [relations, setRelations] = useState([]);
  const [editing, setEditing] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  useEffect(() => {
    api.relations().then((res) => setRelations(res.data)).catch(() => {});
  }, []);

  return (
    <div className="nw-profile">
      {showBack && (
        <button className="nw-back-btn" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back to Contacts
        </button>
      )}

      <div className="nw-profile-head">
        <div
          className="nw-profile-avatar-wrap"
          onClick={() => contact.profilePicture && setImageViewerOpen(true)}
          style={{ cursor: contact.profilePicture ? "pointer" : "default" }}
        >
          <Avatar
            size={104}
            src={contact.profilePicture || null}
            style={{ backgroundColor: contact.profilePicture ? "transparent" : "#2563eb", fontSize: 38 }}
          >
            {!contact.profilePicture && contact.name?.charAt(0).toUpperCase()}
          </Avatar>
        </div>
        <h1 className="nw-profile-name">{contact.name}</h1>
        <RelationChip relation={contact.relation} style={{ fontSize: 13 }} />
      </div>

      <div className="nw-profile-section">
        {contact.phone && (
          <div className="nw-profile-row">
            <span className="nw-profile-row-icon"><FontAwesomeIcon icon={faPhone} /></span>
            <span className="nw-profile-row-text">
              <span className="nw-profile-row-label">Phone</span>
              <span className="nw-profile-row-value">{contact.phone}</span>
            </span>
          </div>
        )}
        {contact.email && (
          <div className="nw-profile-row">
            <span className="nw-profile-row-icon"><FontAwesomeIcon icon={faEnvelope} /></span>
            <span className="nw-profile-row-text">
              <span className="nw-profile-row-label">Email</span>
              <span className="nw-profile-row-value">{contact.email}</span>
            </span>
          </div>
        )}
        {contact.birthDate && (
          <div className="nw-profile-row">
            <span className="nw-profile-row-icon"><FontAwesomeIcon icon={faCakeCandles} /></span>
            <span className="nw-profile-row-text">
              <span className="nw-profile-row-label">Birth Date</span>
              <span className="nw-profile-row-value">{formatBirthDateWithAge(contact.birthDate)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="nw-profile-actions">
        <button className="nw-edit-btn nw-edit-btn-plain" onClick={() => setEditing(true)}>
          <FontAwesomeIcon icon={faPenToSquare} /> Edit Relation
        </button>
      </div>

      <EditRelationModal
        contact={contact}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(newRel) => { contact.relation = newRel; }}
      />

      {imageViewerOpen && (
        <div
          onClick={() => setImageViewerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              setImageViewerOpen(false);
            }}
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              fontSize: 18,
              cursor: "pointer",
              zIndex: 2001,
            }}
          >
            ✕
          </span>
          <img
            src={contact.profilePicture}
            alt="Profile full view"
            onClick={(e) => e.stopPropagation()}
            style={{
              objectFit: "contain",
              width: "min(480px, 100%)",
              height: "auto",
              maxHeight: "80vh",
              display: "block",
              background: "#000",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ContactProfile;