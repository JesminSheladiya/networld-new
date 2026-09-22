import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Spin, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPenToSquare, faUser, faAddressCard } from "@fortawesome/free-regular-svg-icons";
import { faArrowLeft, faCakeCandles, faLink, faUsers, faChevronRight, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
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

function ContactProfile({ contact, showBack = false, onBack, onRelationSaved }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [relation, setRelation] = useState(contact.relation || "");
  const [connections, setConnections] = useState(null);

  // Header stat opens the connections list as its own page (mobile).
  const openConnections = () => {
    navigate(
      `/contacts/${encodeURIComponent(contact.username || contact.email)}/connections`,
      { state: { contact } }
    );
  };

  // Fresh server data (detail refetch) replaces the snapshot — keep the
  // chip in sync instead of sticking with the first snapshot.
  useEffect(() => {
    setRelation(contact.relation || "");
  }, [contact.email, contact.relation]);

  // This user's connections — count in the header, full list in its tab.
  // Guarded + cleared on contact switch — otherwise a slow response for the
  // previous profile overwrites the new one (stale list glitch).
  useEffect(() => {
    let cancelled = false;
    if (!contact.email) {
      setConnections(null);
      return;
    }
    setConnections(null);
    api
      .connectionsOf(contact.email)
      .then((res) => {
        if (!cancelled) setConnections(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setConnections(null);
      });
    return () => {
      cancelled = true;
    };
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
        className="pf-contact-head"
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
        connectionsCount={connections ? connections.length : null}
        onConnectionsClick={openConnections}
      />

      {/* Stacked sections (same language as own profile) — no tabs. */}
      <div className="pf-grid">
        <div className="pf-main">
          {contact.bio && (
          <div className="pf-card pf-about-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">
                <span className="pf-card-ico"><FontAwesomeIcon icon={faCircleInfo} /></span>
                About
              </h2>
            </div>
            <p className="pf-bio-text">
              {contact.bio}
            </p>
          </div>
          )}

          <div className="pf-card pf-contact-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">
                <span className="pf-card-ico"><FontAwesomeIcon icon={faAddressCard} /></span>
                Contact info
              </h2>
            </div>
            <div className="pf-info-rows">
              {relation && (
                <div className="pf-info-row">
                  <span className="pf-info-icon"><FontAwesomeIcon icon={faLink} /></span>
                  <span className="pf-info-text">
                    <span className="pf-info-label">Relation</span>
                    <RelationChip relation={relation} style={{ fontSize: 12 }} />
                  </span>
                  {contact.relationId != null && (
                    <Tooltip title="Edit relation">
                      <button
                        className="pf-info-edit"
                        aria-label="Edit relation"
                        onClick={() => setEditing(true)}
                      >
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>
                    </Tooltip>
                  )}
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
              ].map(({ label, value, icon }) => (
                <div className="pf-info-row" key={label}>
                  <span className="pf-info-icon">{icon}</span>
                  <span className="pf-info-text">
                    <span className="pf-info-label">{label}</span>
                    <span className="pf-info-value">{value}</span>
                  </span>
                </div>
              ))}
              {contact.birthDate && (
                <div className="pf-info-row">
                  <span className="pf-info-icon"><FontAwesomeIcon icon={faCakeCandles} /></span>
                  <span className="pf-info-text">
                    <span className="pf-info-label">Birth Date</span>
                    <span className="pf-info-value">{formatBirthDateWithAge(contact.birthDate)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pf-side">
          <div className="pf-card pf-connections-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">
                <span className="pf-card-ico"><FontAwesomeIcon icon={faUsers} /></span>
                Connections
              </h2>
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
              <div className="pf-conn-list">
                {(() => {
                  const displayConnections = connections.slice(0, 6);
                  const hasMore = connections.length > 6;
                  return (
                    <>
                      {displayConnections.map((item, i) => {
                        const c = mapConnectionToContact(item, i);
                        return (
                          <div
                            className="pf-conn-row"
                            key={c.email || c.username || i}
                            onClick={() => openProfile(c)}
                            title={`View ${c.name || "profile"}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter") openProfile(c); }}
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
                                {c.username ? `@${c.username.toLowerCase()}` : c.email}
                              </span>
                            </span>
                            <span className="pf-conn-right">
                              <FontAwesomeIcon icon={faChevronRight} className="pf-conn-chevron" />
                            </span>
                          </div>
                        );
                      })}
                      {hasMore && (
                        <button
                          className="pf-conn-view-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConnections();
                          }}
                          title="View all connections"
                        >
                          View all connections
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
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
