import { useEffect, useState, useCallback } from "react";
import { Spin, Button } from "antd";
import { BellOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { getInverseRelation } from "../UserProfile";
import RelationChip from "../shared/RelationChip";

const AV_COLORS = ["#3b82f6", "#38bdf8", "#0ea5e9", "#10b981", "#f59e0b"];

function RequestsPage() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const { bump, key: refreshKey, setPendingCount } = useRefresh();

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
    try {
      await api.accept(id);
      fetchPending();
      bump();
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
        <div>
          <h1 className="nw-page-title">Pending Requests</h1>
          <p className="nw-page-subtitle">People who want to connect with you</p>
        </div>
        <Button className="nw-refresh-btn" size="small" type="text" loading={loading} onClick={fetchPending}>
          Refresh
        </Button>
      </div>

      <div className="nw-discover-panel">
        {loading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading requests...</span></div>
        ) : pending.length === 0 ? (
          <div className="nw-state-box">
            <BellOutlined style={{ fontSize: 40, color: "#475569" }} />
            <span className="nw-state-text">No pending requests</span>
          </div>
        ) : (
          <div className="nw-discover-list">
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
                      <button className="nw-act-btn nw-act-accept" title="Accept" onClick={() => accept(p.pendingRelationId)}>
                        <CheckOutlined />
                      </button>
                      <button className="nw-act-btn nw-act-decline" title="Decline" onClick={() => decline(p.pendingRelationId)}>
                        <CloseOutlined />
                      </button>
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