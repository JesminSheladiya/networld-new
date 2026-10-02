import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, Button, Tooltip, message, Avatar } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-regular-svg-icons";
import { faCheck, faXmark, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { getInverseRelation } from "../../utils/relationUtils";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import RelationChip from "../shared/RelationChip";
import ConfirmPopup from "../shared/ConfirmPopup";
import { avatarColorFor } from "../../constants";
import { toDataUrl } from "../../utils/imageUtils";

function RequestsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("received");
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [declineId, setDeclineId] = useState(null);
  const [sent, setSent] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const { bump, key: refreshKey, setPendingCount } = useRefresh();
  const { relName, relCategory } = useRelationDisplay();
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // "X wants to add you as their <Relation>" → relation in chosen language
  const formatReason = (reason) => {
    if (!reason) return reason;
    const marker = " as their ";
    const idx = reason.lastIndexOf(marker);
    if (idx === -1) return reason;
    return reason.slice(0, idx + marker.length) + relName(reason.slice(idx + marker.length).trim());
  };

  // "You asked X to be your <Relation>" → relation in chosen language
  const formatSentReason = (reason) => {
    if (!reason) return reason;
    const marker = " to be your ";
    const idx = reason.lastIndexOf(marker);
    if (idx === -1) return reason;
    return reason.slice(0, idx + marker.length) + relName(reason.slice(idx + marker.length).trim());
  };

  // Which contacts tab the new contact lands in (master-driven, like backend)
  const categoryOfRelation = (name) => relCategory(name);
  const categoryLabel = (key) =>
    key === "inlaws" ? "In-Laws" : key === "family" ? "Family" : key === "others" ? "Others" : "All";

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.pending();
      const data = res.data || [];
      setPending(data);
      setPendingCount(data.length);
    } catch {
      setPending([]);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [setPendingCount]);

  const fetchSent = useCallback(async () => {
    setSentLoading(true);
    try {
      const res = await api.sent();
      setSent(res.data || []);
    } catch {
      setSent([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchSent();
  }, [refreshKey, fetchPending, fetchSent]);

  // Sliding pill indicator — same segmented control as Contacts tabs.
  useEffect(() => {
    const activeIdx = tab === "received" ? 0 : 1;
    const el = chipRefs.current[activeIdx];
    if (!el || !chipsRef.current) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const c = chipsRef.current.getBoundingClientRect();
      setIndicator({ left: r.left - c.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tab, pending.length, sent.length]);

  const refreshAll = () => {
    fetchPending();
    fetchSent();
  };

  // Instagram-style: open anyone's profile from a result row.
  const openProfile = (p) => {
    const contact = {
      key: p.suggestedUserEmail,
      name: p.suggestedUserName || "",
      username: p.suggestedUserUsername || "",
      email: p.suggestedUserEmail || "",
      phone: p.suggestedUserPhone || "",
      profilePicture: p.suggestedUserProfilePic || null,
      coverImage: p.suggestedUserCoverImage || null,
      coverHidden: !!p.coverHidden,
      relation: p.inferredRelation || "",
      relationId: null,
      pending: "received",
      pendingRelationId: p.pendingRelationId ?? null,
      gender: p.suggestedUserGender || null,
      birthDate: p.suggestedUserBirthDate || null,
      bio: p.suggestedUserBio || "",
      occupation: p.suggestedUserOccupation || "",
      contactInfoHidden: !!p.contactInfoHidden,
    };
    navigate(
      `/contacts/${encodeURIComponent(p.suggestedUserUsername || p.suggestedUserEmail)}`,
      { state: { contact } }
    );
  };

  const accept = async (id) => {
    const item = pending.find((x) => x.pendingRelationId === id);
    try {
      await api.accept(id);
      const inv = getInverseRelation(item?.inferredRelation, item?.suggestedUserGender) || "";
      const cat = categoryOfRelation(inv);
      fetchPending();
      bump();
      message.success(`Accepted — added to ${categoryLabel(cat)}`);
      navigate("/contacts", { state: { category: cat } });
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not accept request");
      fetchPending();
    }
  };

  const decline = async (id) => {
    try {
      await api.decline(id);
      fetchPending();
      bump();
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not decline request");
      fetchPending();
    }
  };

  // Sent tab: open the recipient's profile (shows the "Request Sent" chip —
  // the seed carries pending:"sent" so the strip is correct instantly, and
  // the detail refetch keeps it via search-users).
  const openSentProfile = (p) => {
    const contact = {
      key: p.suggestedUserEmail,
      name: p.suggestedUserName || "",
      username: p.suggestedUserUsername || "",
      email: p.suggestedUserEmail || "",
      phone: p.suggestedUserPhone || "",
      profilePicture: p.suggestedUserProfilePic || null,
      coverImage: p.suggestedUserCoverImage || null,
      coverHidden: !!p.coverHidden,
      relation: p.inferredRelation || "",
      relationId: null,
      pending: "sent",
      pendingRelationId: p.pendingRelationId ?? null,
      gender: p.suggestedUserGender || null,
      birthDate: p.suggestedUserBirthDate || null,
      bio: p.suggestedUserBio || "",
      occupation: p.suggestedUserOccupation || "",
      contactInfoHidden: !!p.contactInfoHidden,
    };
    navigate(
      `/contacts/${encodeURIComponent(p.suggestedUserUsername || p.suggestedUserEmail)}`,
      { state: { contact } }
    );
  };

  const cancelSent = async (id) => {
    try {
      await api.cancel(id);
      fetchSent();
      bump();
      message.success("Request cancelled");
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not cancel request");
      fetchSent();
    }
  };

  const isReceived = tab === "received";
  const busy = isReceived ? loading : sentLoading;

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-find-head-row">
          <div>
            <h1 className="nw-page-title">Requests</h1>
            <p className="nw-page-subtitle">
              {isReceived
                ? "People who want to connect with you"
                : "Requests you sent that are still pending"}
            </p>
          </div>
          <Button className="nw-refresh-btn" size="small" type="text" loading={busy} onClick={refreshAll} icon={<FontAwesomeIcon icon={faRotateRight} />}>
            Refresh
          </Button>
        </div>
        <div className="nw-req-chips-row">
          <div className="nw-chips" ref={chipsRef} role="tablist" aria-label="Requests">
            <span
              className="nw-chip-indicator"
              style={{ left: indicator.left, width: indicator.width }}
            />
            <button
              role="tab"
              aria-selected={isReceived}
              ref={(el) => (chipRefs.current[0] = el)}
              className={isReceived ? "nw-chip active" : "nw-chip"}
              onClick={() => setTab("received")}
            >
              Received
              <span className="nw-chip-count">{pending.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={!isReceived}
              ref={(el) => (chipRefs.current[1] = el)}
              className={!isReceived ? "nw-chip active" : "nw-chip"}
              onClick={() => setTab("sent")}
            >
              Sent
              <span className="nw-chip-count">{sent.length}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="nw-discover-panel">
        {isReceived ? (
          loading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading requests...</span></div>
        ) : pending.length === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faBell} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No pending requests</span>
            <span className="nw-state-sub">When someone sends you a connection request, it will show up here</span>
          </div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">Requests · {pending.length}</div>
            {pending.map((p, i) => {
              const rel = getInverseRelation(p.inferredRelation, p.suggestedUserGender)?.toLowerCase() || "";
              const avColor = avatarColorFor(p.suggestedUserName);
              return (
                <div
                  className="nw-req-row"
                  key={i}
                  onClick={() => openProfile(p)}
                  title="View profile"
                  style={{ cursor: "pointer" }}
                >
                  <div className="nw-req-left">
                    <Avatar
                      size={40}
                      src={toDataUrl(p.suggestedUserProfilePic)}
                      style={{
                        backgroundColor: p.suggestedUserProfilePic ? "transparent" : avColor,
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {!(p.suggestedUserProfilePic) && (p.suggestedUserName || "?").charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="nw-find-info">
                      <div className="nw-find-name">{p.suggestedUserName}</div>
                      <div className="nw-find-email">{p.suggestedUserUsername ? `@${p.suggestedUserUsername.toLowerCase()}` : (!p.contactInfoHidden ? p.suggestedUserEmail : "—")}</div>
                      <div className="nw-find-reason">{formatReason(p.reason)}</div>
                    </div>
                  </div>
                  <div className="nw-req-right">
                    <RelationChip relation={rel} style={{ fontSize: 11 }} />
                    <div className="nw-req-actions" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Decline">
                        <button className="nw-act-btn nw-act-decline" onClick={() => setDeclineId(p.pendingRelationId)}>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      </Tooltip>
                      <Tooltip title="Accept">
                        <button className="nw-act-btn nw-act-accept" onClick={() => accept(p.pendingRelationId)}>
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
        ) : sentLoading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading sent requests...</span></div>
        ) : sent.length === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faBell} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No sent requests</span>
            <span className="nw-state-sub">Requests you send will stay here until accepted</span>
          </div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">Sent · {sent.length}</div>
            {sent.map((p, i) => {
              const rel = (p.inferredRelation || "").toLowerCase();
              const avColor = avatarColorFor(p.suggestedUserName);
              return (
                <div
                  className="nw-req-row"
                  key={i}
                  onClick={() => openSentProfile(p)}
                  title="View profile"
                  style={{ cursor: "pointer" }}
                >
                  <div className="nw-req-left">
                    <Avatar
                      size={40}
                      src={toDataUrl(p.suggestedUserProfilePic)}
                      style={{
                        backgroundColor: p.suggestedUserProfilePic ? "transparent" : avColor,
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {!(p.suggestedUserProfilePic) && (p.suggestedUserName || "?").charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="nw-find-info">
                      <div className="nw-find-name">{p.suggestedUserName}</div>
                      <div className="nw-find-email">{p.suggestedUserUsername ? `@${p.suggestedUserUsername.toLowerCase()}` : (!p.contactInfoHidden ? p.suggestedUserEmail : "—")}</div>
                      <div className="nw-find-reason">{formatSentReason(p.reason)}</div>
                    </div>
                  </div>
                  <div className="nw-req-right">
                    <RelationChip relation={rel} style={{ fontSize: 11 }} />
                    <div className="nw-req-actions" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Cancel request">
                        <button className="nw-act-btn nw-act-decline" onClick={() => setCancelId(p.pendingRelationId)}>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmPopup
        open={declineId !== null}
        title="Decline request?"
        message="This connection request will be removed."
        okText="Decline"
        okIcon={faXmark}
        onCancel={() => setDeclineId(null)}
        onOk={() => {
          const id = declineId;
          setDeclineId(null);
          decline(id);
        }}
      />

      <ConfirmPopup
        open={cancelId !== null}
        title="Cancel request?"
        message="The other person will no longer see this request. You can send it again later."
        okText="Cancel request"
        okIcon={faXmark}
        onCancel={() => setCancelId(null)}
        onOk={() => {
          const id = cancelId;
          setCancelId(null);
          cancelSent(id);
        }}
      />
    </div>
  );
}

export default RequestsPage;