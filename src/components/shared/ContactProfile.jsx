import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Spin, Tooltip, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPenToSquare, faUser, faAddressCard, faBell } from "@fortawesome/free-regular-svg-icons";
import { faArrowLeft, faCakeCandles, faLink, faUsers, faChevronRight, faCircleInfo, faPaperPlane, faPlus, faCheck, faXmark, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { PhoneOutlined, LockOutlined } from "@ant-design/icons";
import { avatarColorFor } from "../../constants";
import { api } from "../../Services/networld";
import { mapConnectionToContact } from "../../utils/contactMapper";
import { useRefresh } from "./RefreshContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import { getInverseRelation } from "../../utils/relationUtils";
import RelationChip from "./RelationChip";
import EditRelationModal from "./EditRelationModal";
import RelationPickerModal from "./RelationPickerModal";
import ConfirmPopup from "./ConfirmPopup";
import ProfileHeader from "../profile/ProfileHeader";
import ProfilePictureViewer from "../ProfilePictureViewer";
import { formatBirthDateWithAge } from "../../utils/dateUtils";
import { toDataUrl } from "../../utils/imageUtils";
import "../css/profile-page.css";

function ContactProfile({ contact, showBack = false, onBack, onRelationSaved, onChanged, fresh = true }) {
  const navigate = useNavigate();
  const { bump } = useRefresh();
  const { relName } = useRelationDisplay();
  const [editing, setEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const [relation, setRelation] = useState(contact.relation || "");
  const [connections, setConnections] = useState(null);

  // Stranger request flow (relation pick + send), like Find People.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedRelId, setPickedRelId] = useState(null);
  const [relations, setRelations] = useState([]);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);

  const isConnection = contact.relationId != null;
  const isPendingReceived =
    !isConnection && contact.pending === "received" && contact.pendingRelationId != null;
  const isPendingSent = !isConnection && !isPendingReceived && contact.pending === "sent";
  const isStranger = !isConnection && !isPendingReceived && !isPendingSent;

  useEffect(() => {
    if (!isStranger) return;
    api
      .relations()
      .then((res) => setRelations(res.data || []))
      .catch(() => setRelations([]));
  }, [isStranger, contact.email]);

  const pickedFound = relations.find((r) => r.id === pickedRelId);

  const refreshAfterAction = () => {
    bump();
    onChanged?.();
  };

  const sendRequest = async () => {
    if (!pickedRelId || sending) return;
    setSending(true);
    try {
      await api.send(contact.email, pickedRelId);
      message.success("Connection request sent");
      setPickedRelId(null);
      refreshAfterAction();
    } catch (e) {
      // Server is the source of truth — show its message and re-fetch.
      message.error(e?.response?.data?.message || "Could not send request");
      refreshAfterAction();
    } finally {
      setSending(false);
    }
  };

  const doAccept = async () => {
    if (acting) return;
    setActing(true);
    try {
      await api.accept(contact.pendingRelationId);
      message.success("Connection request accepted");
      refreshAfterAction();
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not accept request");
      refreshAfterAction();
    } finally {
      setActing(false);
    }
  };

  const doDecline = async () => {
    if (acting) return;
    setDeclineOpen(false);
    setActing(true);
    try {
      await api.decline(contact.pendingRelationId);
      message.success("Connection request declined");
      refreshAfterAction();
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not decline request");
      refreshAfterAction();
    } finally {
      setActing(false);
    }
  };

  // Header stat opens the connections list as its own page (mobile).
  const openConnections = () => {
    navigate(
      `/contacts/${encodeURIComponent(contact.username || contact.email)}/connections`,
      { state: { contact } }
    );
  };

  const connTotal = connections ? connections.total : null;
  const connItems = connections ? connections.items : [];
  const connLocked = connTotal > 0 && connItems.length === 0;

  // Fresh server data (detail refetch) replaces the snapshot — keep the
  // chip in sync instead of sticking with the first snapshot.
  useEffect(() => {
    setRelation(contact.relation || "");
  }, [contact.email, contact.relation]);

  // This user's connections — { total, items }. Total always shows;
  // items come back empty when the owner hides them (count still visible,
  // list locked — never clickable into).
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
        if (cancelled) return;
        const data = res.data || {};
        setConnections({
          total: data.total ?? 0,
          items: Array.isArray(data.items) ? data.items : [],
        });
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
        coverImage={fresh ? contact?.coverImage : null}
        avatarSrc={toDataUrl(contact.profilePicture)}
        avatarBg={avatarColorFor(name)}
        avatarText={initial}
        onAvatarClick={() => setViewerOpen(true)}
        onCoverClick={() => setCoverViewerOpen(true)}
        coverLocked={!!contact.coverHidden}
        name={name}
        username={contact.username}
        email={contact.email}
        phone={contact.phone}
        connectionsCount={connTotal}
        onConnectionsClick={connLocked ? undefined : openConnections}
        belowRowAction={
          isPendingReceived ? (
            <div className="pf-req-strip">
              <span className="pf-req-strip-icon">
                <FontAwesomeIcon icon={faBell} />
              </span>
              <span className="pf-req-msg">
                <strong>{name}</strong> wants to add you as their{" "}
                <strong>{relation ? relName(relation) : "connection"}</strong>
              </span>
              <span className="pf-req-side">
                <RelationChip
                  relation={getInverseRelation(relation, contact.gender)?.toLowerCase() || ""}
                  style={{ fontSize: 11 }}
                />
                <span className="pf-req-btns">
                  <Tooltip title="Decline">
                    <button
                      className="nw-act-btn nw-act-decline"
                      disabled={acting}
                      onClick={() => setDeclineOpen(true)}
                      aria-label="Decline request"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </Tooltip>
                  <Tooltip title="Accept">
                    <button
                      className="pf-req-accept"
                      disabled={acting}
                      onClick={doAccept}
                      aria-label="Accept request"
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      {acting ? "Accepting..." : "Accept"}
                    </button>
                  </Tooltip>
                </span>
              </span>
            </div>
          ) : isStranger ? (
            <div className="pf-req-strip">
              <span className="pf-req-strip-icon">
                <FontAwesomeIcon icon={faUserPlus} />
              </span>
              <span className="pf-req-msg">
                Send a connection to <strong>{name}</strong>
                {pickedFound ? (
                  <>
                    {" "}as their <strong>{relName(pickedFound.relationName)}</strong>
                  </>
                ) : null}
              </span>
              <span className="pf-req-side">
                <button
                  className="pf-ghost-btn"
                  onClick={() => setPickerOpen(true)}
                  title={pickedFound ? relName(pickedFound.relationName) : "Select Relation"}
                >
                  {pickedFound ? (
                    relName(pickedFound.relationName)
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPlus} style={{ fontSize: "10px" }} /> Select
                      Relation
                    </>
                  )}
                </button>
                <button
                  className="pf-primary-btn"
                  disabled={!pickedRelId || sending}
                  onClick={sendRequest}
                >
                  <FontAwesomeIcon icon={faPaperPlane} style={{ fontSize: 11 }} />
                  {sending ? "Sending..." : "Send"}
                </button>
              </span>
            </div>
          ) : null
        }
        belowAvatarAction={
          isPendingSent ? (
            <div className="pf-sk-actions-row">
              <span className="nw-find-chip-sent">✓ Request Sent</span>
            </div>
          ) : null
        }
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
            {contact.contactInfoHidden ? (
              <div className="nw-state-box">
                <LockOutlined style={{ fontSize: 32, color: "#475569" }} />
                <span className="nw-state-text">Contact info is private</span>
                <span className="nw-state-sub">{name} has chosen to keep contact details hidden</span>
              </div>
            ) : !fresh ? (
              <div className="nw-state-box">
                <Spin size="large" />
                <span className="nw-state-text">Loading contact info...</span>
              </div>
            ) : (
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
              <div className="pf-info-row">
                <span className="pf-info-icon"><FontAwesomeIcon icon={faCakeCandles} /></span>
                <span className="pf-info-text">
                  <span className="pf-info-label">Birth Date</span>
                  <span className="pf-info-value">{contact.birthDate ? formatBirthDateWithAge(contact.birthDate) : "—"}</span>
                </span>
              </div>
            </div>
            )}
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
                  {connTotal} {connTotal === 1 ? "connection" : "connections"}
                </span>
              )}
            </div>
            {connections === null ? (
              <div className="nw-state-box">
                <Spin size="large" />
                <span className="nw-state-text">Loading connections...</span>
              </div>
            ) : connLocked ? (
              <div className="nw-state-box">
                <LockOutlined style={{ fontSize: 32, color: "#475569" }} />
                <span className="nw-state-text">Connections are private</span>
                <span className="nw-state-sub">{name} has chosen to keep connections hidden</span>
              </div>
            ) : connItems.length === 0 ? (
              <div className="nw-state-box">
                <FontAwesomeIcon icon={faUsers} style={{ fontSize: 40, color: "#475569" }} />
                <span className="nw-state-text">No connections yet</span>
              </div>
            ) : (
              <div className="pf-conn-list">
                {(() => {
                  const displayConnections = connItems.slice(0, 6);
                  const hasMore = connTotal > 6;
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

      <RelationPickerModal
        open={pickerOpen}
        title="Select Relation"
        personName={name}
        personGender={contact.gender}
        value={pickedRelId}
        idMode
        onClose={() => setPickerOpen(false)}
        onPick={(v) => {
          setPickedRelId(v);
          setPickerOpen(false);
        }}
      />

      <ConfirmPopup
        open={declineOpen}
        title="Decline request?"
        message="This connection request will be removed."
        okText="Decline"
        onCancel={() => setDeclineOpen(false)}
        onOk={doDecline}
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
