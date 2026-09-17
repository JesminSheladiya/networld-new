import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPenToSquare, faUser } from "@fortawesome/free-regular-svg-icons";
import { faArrowLeft, faCakeCandles, faLink, faUsers } from "@fortawesome/free-solid-svg-icons";
import { PhoneOutlined } from "@ant-design/icons";
import { avatarColorFor } from "../../constants";
import { api } from "../../Services/networld";
import { mapConnectionToContact } from "../../utils/contactMapper";
import RelationChip from "./RelationChip";
import EditRelationModal from "./EditRelationModal";
import ProfileHeader from "../profile/ProfileHeader";
import ProfilePictureViewer from "../ProfilePictureViewer";
import { formatBirthDateWithAge } from "../../utils/dateUtils";
import { toDataUrl } from "../../utils/imageUtils";
import "../css/profile-page.css";

const TABS = [
  { key: "about", label: "About" },
  { key: "info", label: "Contact Info" },
  { key: "connections", label: "Connections" },
];

function ContactProfile({ contact, showBack = false, onBack, onRelationSaved }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [relation, setRelation] = useState(contact.relation || "");
  const [connections, setConnections] = useState(null);
  const [activeTab, setActiveTab] = useState("about");

  // Fresh server data (detail refetch) replaces the snapshot — keep the
  // chip in sync instead of sticking with the first snapshot.
  useEffect(() => {
    setRelation(contact.relation || "");
  }, [contact.email, contact.relation]);

  // This user's connections — count in the header, full list in its tab.
  useEffect(() => {
    if (!contact.email) {
      setConnections(null);
      return;
    }
    api
      .connectionsOf(contact.email)
      .then((res) => setConnections(Array.isArray(res.data) ? res.data : []))
      .catch(() => setConnections(null));
  }, [contact.email]);

  const openProfile = (c) => {
    navigate(`/contacts/${encodeURIComponent(c.username || c.email)}`, {
      state: { contact: c },
    });
  };

  const name = contact.name || "Unknown";
  const initial = (name.charAt(0) || "?").toUpperCase();

  return (
    <div className="pf-page">
      {showBack && (
        <button className="nw-back-btn" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back
        </button>
      )}

      {/* Same header as own profile — viewer-only slots here. */}
      <ProfileHeader
        coverImage={contact?.coverImage}
        avatarSrc={toDataUrl(contact.profilePicture)}
        avatarBg={avatarColorFor(name)}
        avatarText={initial}
        onAvatarClick={() => setViewerOpen(true)}
        onCoverClick={() => setCoverViewerOpen(true)}
        name={name}
        username={contact.username}
        email={contact.email}
        phone={contact.phone}
        belowAvatarAction={
          <>
            {relation && (
              <RelationChip relation={relation} style={{ fontSize: 12 }} />
            )}
            {contact.relationId != null && (
              <button className="pf-ghost-btn" onClick={() => setEditing(true)}>
                <FontAwesomeIcon icon={faPenToSquare} /> Edit Relation
              </button>
            )}
          </>
        }
        connectionsCount={connections ? connections.length : null}
        onConnectionsClick={() => setActiveTab("connections")}
      />

      <div className="pf-tabs" role="tablist" aria-label="Profile sections">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`pf-tab${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {key === "connections" && connections ? ` (${connections.length})` : ""}
          </button>
        ))}
      </div>

      {activeTab === "about" && (
        <div className="pf-card">
          <div className="pf-card-head">
            <h2 className="pf-card-title">About</h2>
          </div>
          <p className="pf-bio-text">
            {contact.bio || <span className="pf-placeholder">No bio added yet.</span>}
          </p>
        </div>
      )}

      {activeTab === "info" && (
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
      )}

      {activeTab === "connections" && (
        <div className="pf-card">
          <div className="pf-card-head">
            <h2 className="pf-card-title">Connections</h2>
            {connections && (
              <span className="pf-count-pill">
                {connections.length} {connections.length === 1 ? "connection" : "connections"}
              </span>
            )}
          </div>
          {connections === null ? (
            <div className="nw-state-box">
              <Spin size="large" />
              <span className="nw-state-text">Loading connections...</span>
            </div>
          ) : connections.length === 0 ? (
            <div className="nw-state-box">
              <FontAwesomeIcon icon={faUsers} style={{ fontSize: 40, color: "#475569" }} />
              <span className="nw-state-text">No connections yet</span>
            </div>
          ) : (
            <div className="pf-info-rows">
              {connections.map((item, i) => {
                const c = mapConnectionToContact(item, i);
                return (
                  <div
                    className="pf-info-row pf-clickable-row"
                    key={c.email || c.username || i}
                    onClick={() => openProfile(c)}
                    title={`View ${c.name || "profile"}`}
                  >
                    <Avatar
                      size={44}
                      src={toDataUrl(c.profilePicture)}
                      style={{
                        backgroundColor: c.profilePicture
                          ? "transparent"
                          : avatarColorFor(c.name || "?"),
                        fontSize: 17,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {!c.profilePicture && (c.name || "?").charAt(0).toUpperCase()}
                    </Avatar>
                    <span className="pf-info-text">
                      <span className="pf-info-value">{c.name || "Unknown"}</span>
                      <span className="pf-info-label">
                        {c.username ? `@${c.username}` : c.email}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
        src={toDataUrl(contact.profilePicture)}
        name={name}
      />
      <ProfilePictureViewer
        open={coverViewerOpen}
        onClose={() => setCoverViewerOpen(false)}
        src={toDataUrl(contact.coverImage)}
        name={name}
        alt="Cover full view"
        maxWidth="min(960px, 100%)"
      />
    </div>
  );
}

export default ContactProfile;
