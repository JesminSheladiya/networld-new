import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, Button, Tooltip, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-regular-svg-icons";
import { faCheck, faXmark, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { getInverseRelation } from "../UserProfile";
import RelationChip from "../shared/RelationChip";

const AV_COLORS = ["#3b82f6", "#38bdf8", "#0ea5e9", "#10b981", "#f59e0b"];

function RequestsPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const { bump, key: refreshKey, setPendingCount } = useRefresh();

  // Mirror of backend grouping: decides which contacts tab the new contact lands in
  const categoryOfRelation = (name) => {
    const r = (name || "").toLowerCase();
    if (r.includes("in-law")) return "inlaws";
    if (r.includes("cousin")) return "others";
    if (r.includes("'s")) return "family";
    const keys = ["father", "mother", "brother", "sister", "son", "daughter",
      "husband", "wife", "grand", "uncle", "aunt", "nephew", "niece"];
    if (keys.some((k) => r.includes(k))) return "family";
    return "others";
  };
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

  useEffect(() => {
    fetchPending();
  }, [refreshKey, fetchPending]);

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
    } catch {
      // silent
    }
  };

  const decline = async (id) => {
    try {
      await api.decline(id);
      fetchPending();
      bump();
    } catch {
      // silent
    }
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-find-head-row">
          <div>
            <h1 className="nw-page-title">Pending Requests</h1>
            <p className="nw-page-subtitle">People who want to connect with you</p>
          </div>
          <Button className="nw-refresh-btn" size="small" type="text" loading={loading} onClick={fetchPending} icon={<FontAwesomeIcon icon={faRotateRight} />}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="nw-discover-panel">
        {loading ? (
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
              const avColor = AV_COLORS[((p.suggestedUserName || "").charCodeAt(0) || 0) % AV_COLORS.length];
              return (
                <div className="nw-req-row" key={i}>
                  <div className="nw-req-left">
                    <div className="nw-find-avatar" style={{ background: avColor }}>
                      {(p.suggestedUserName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="nw-find-info">
                      <div className="nw-find-name">{p.suggestedUserName}</div>
                      <div className="nw-find-email">{p.suggestedUserEmail}</div>
                      <div className="nw-find-reason">{p.reason}</div>
                    </div>
                  </div>
                  <div className="nw-req-right">
                    <RelationChip relation={rel} style={{ fontSize: 11 }} />
                    <div className="nw-req-actions">
                      <Tooltip title="Accept">
                        <button className="nw-act-btn nw-act-accept" onClick={() => accept(p.pendingRelationId)}>
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      </Tooltip>
                      <Tooltip title="Decline">
                        <button className="nw-act-btn nw-act-decline" onClick={() => decline(p.pendingRelationId)}>
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
    </div>
  );
}

export default RequestsPage;