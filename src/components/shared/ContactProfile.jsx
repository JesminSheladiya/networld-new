import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPenToSquare, faUser } from "@fortawesome/free-regular-svg-icons";
import { faArrowLeft, faCakeCandles, faLink } from "@fortawesome/free-solid-svg-icons";
import { PhoneOutlined } from "@ant-design/icons";
import { avatarColorFor } from "../../constants";
import RelationChip from "./RelationChip";
import EditRelationModal from "./EditRelationModal";
import ProfileHeader from "../profile/ProfileHeader";
import ProfilePictureViewer from "../ProfilePictureViewer";
import { formatBirthDateWithAge } from "../../utils/dateUtils";
import "../css/profile-page.css";

function ContactProfile({ contact, showBack = false, onBack, onRelationSaved }) {
  const [editing, setEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [relation, setRelation] = useState(contact.relation || "");

  // Fresh server data (detail refetch) replaces the snapshot — keep the
  // chip in sync instead of sticking with the first snapshot.
  useEffect(() => {
    setRelation(contact.relation || "");
  }, [contact.email, contact.relation]);

  const name = contact.name || "Unknown";
  const initial = (name.charAt(0) || "?").toUpperCase();

  return (
    <div className="pf-page">
      {showBack && (
        <button className="nw-back-btn" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back to Contacts
        </button>
      )}

      {/* Same header as own profile — viewer-only slots here. */}
      <ProfileHeader
        coverImage={contact?.coverImage}
        avatarSrc={contact.profilePicture}
        avatarBg={avatarColorFor(name)}
        avatarText={initial}
        onAvatarClick={() => setViewerOpen(true)}
        onCoverClick={() => setCoverViewerOpen(true)}
        name={name}
        username={contact.username}
        email={contact.email}
        phone={contact.phone}
        stat={
          relation && (
            <RelationChip relation={relation} style={{ fontSize: 12 }} />
          )
        }
        actions={
          <>
            {contact.profilePicture && (
              <button className="pf-ghost-btn" onClick={() => setViewerOpen(true)}>
                View photo
              </button>
            )}
            {contact.relationId != null && (
              <button className="pf-ghost-btn" onClick={() => setEditing(true)}>
                <FontAwesomeIcon icon={faPenToSquare} /> Edit Relation
              </button>
            )}
          </>
        }
      />

      <div className="pf-grid">
        <div className="pf-main">
      {/* ── About card ── */}
      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">About</h2>
        </div>
        <p className="pf-bio-text">
          {contact.bio || <span className="pf-placeholder">No bio added yet.</span>}
        </p>
      </div>
        </div>
        <div className="pf-side">
      {/* ── Contact info card ── */}
      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">Contact info</h2>
        </div>
        <div className="pf-info-rows">
          {relation && (
            <div className="pf-info-row">
              <span className="pf-info-icon"><FontAwesomeIcon icon={faLink} /></span>
              <span className="pf-info-text">
                <span className="pf-info-label">Relation</span>
                <RelationChip relation={relation} style={{ fontSize: 12 }} />
              </span>
            </div>
          )}
          {[
            { label: "Phone", value: contact.phone || "—", icon: <PhoneOutlined /> },
            { label: "Email", value: contact.email || "—", icon: <FontAwesomeIcon icon={faEnvelope} /> },
            {
              label: "Gender",
              value: contact.gender === "M" ? "Male" : contact.gender === "F" ? "Female" : (contact.gender || "—"),
              icon: <FontAwesomeIcon icon={faUser} />,
            },
            {
              label: "Birth Date",
              value: contact.birthDate ? formatBirthDateWithAge(contact.birthDate) : "—",
              icon: <FontAwesomeIcon icon={faCakeCandles} />,
            },
          ].map(({ label, value, icon }) => (
            <div className="pf-info-row" key={label}>
              <span className="pf-info-icon">{icon}</span>
              <span className="pf-info-text">
                <span className="pf-info-label">{label}</span>
                <span className="pf-info-value">{value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
        </div>
      </div>

      <EditRelationModal
        contact={{ ...contact, relation }}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(newRel) => {
          setRelation(newRel);
          contact.relation = newRel;
          onRelationSaved?.(newRel);
        }}
      />

      <ProfilePictureViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        src={contact.profilePicture}
        name={name}
      />
      <ProfilePictureViewer
        open={coverViewerOpen}
        onClose={() => setCoverViewerOpen(false)}
        src={contact.coverImage}
        name={name}
        alt="Cover full view"
        maxWidth="min(960px, 100%)"
      />
    </div>
  );
}

export default ContactProfile;
