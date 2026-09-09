import { useEffect, useState, useCallback } from "react";
import { Spin, Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLightbulb, faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faArrowRight, faCheck, faXmark, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import RelationPickerModal from "../shared/RelationPickerModal";
import RelationChip from "../shared/RelationChip";

const AV_COLORS = ["#3b82f6", "#38bdf8", "#0ea5e9", "#10b981", "#f59e0b"];

function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [relations, setRelations] = useState([]);
  const [editingEmail, setEditingEmail] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { bump, key: refreshKey, setSuggestionsCount } = useRefresh();
  const { relName } = useRelationDisplay();

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suggestions();
      const data = res.data || [];
      setSuggestions(data);
      setSuggestionsCount(data.length);
    } catch {
      setSuggestions([]);
      setSuggestionsCount(0);
    } finally {
      setLoading(false);
    }
  }, [setSuggestionsCount]);

  useEffect(() => {
    fetchSuggestions();
    api.relations().then((res) => setRelations(res.data || [])).catch(() => setRelations([]));
  }, [refreshKey, fetchSuggestions]);

  const sendRequest = async (s) => {
    try {
      await api.suggestionsSend(s.suggestedUserEmail, s.inferredRelation);
      const remaining = suggestions.filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail).length;
      setSuggestions((p) => p.filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail));
      setSuggestionsCount(remaining);
      bump();
    } catch {
      // silent
    }
  };

  const dismiss = async (s) => {
    try {
      await api.dismissSuggestion(s.pendingRelationId);
      const remaining = suggestions.filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail).length;
      setSuggestions((p) => p.filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail));
      setSuggestionsCount(remaining);
      bump();
    } catch {
      // silent
    }
  };

  const startEdit = (s) => {
    setEditingEmail(s.suggestedUserEmail);
    setEditValue(s.inferredRelation || "");
  };

  const saveEdit = (email) => {
    const finalRel = editValue;
    if (!finalRel || !finalRel.trim()) return;
    setSuggestions((prev) =>
      prev.map((x) => (x.suggestedUserEmail === email ? { ...x, inferredRelation: finalRel } : x))
    );
    setEditingEmail(null);
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-find-head-row">
          <div>
            <h1 className="nw-page-title">Suggestions</h1>
            <p className="nw-page-subtitle">People you may know, discovered through mutual connections</p>
          </div>
          <Button className="nw-refresh-btn" size="small" type="text" loading={loading} onClick={fetchSuggestions} icon={<FontAwesomeIcon icon={faRotateRight} />}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="nw-discover-panel">
        {loading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading suggestions...</span></div>
        ) : suggestions.length === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No suggestions yet</span>
            <span className="nw-state-sub">Add more contacts to get smart suggestions from your network</span>
          </div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">Suggestions · {suggestions.length}</div>
            {suggestions.map((s, i) => {
              const rel = (s.inferredRelation || "").toLowerCase();
              const avColor = AV_COLORS[((s.suggestedUserName || "").charCodeAt(0) || 0) % AV_COLORS.length];
              return (
                <div className="nw-req-row" key={i}>
                  <div className="nw-req-left">
                    <div className="nw-find-avatar" style={{ background: avColor }}>
                      {(s.suggestedUserName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="nw-find-info">
                      <div className="nw-find-name">{s.suggestedUserName}</div>
                      <div className="nw-find-email">{s.suggestedUserEmail}</div>
                      <div className="nw-find-reason">
                        <span className="nw-auto-badge">AUTO</span> {s.reason}
                      </div>
                    </div>
                  </div>

                  {editingEmail === s.suggestedUserEmail ? (
                    <div className="nw-edit-inline">
                      <button
                        className="nw-relation-pick-btn"
                        onClick={() => setPickerOpen(true)}
                        title={editValue ? relName(editValue) : "Select relation"}
                      >
                        {editValue ? relName(editValue) : "Relation"}
                      </button>
                      <div className="nw-req-actions">
                        <button className="nw-act-btn nw-act-accept" title="Save" onClick={() => saveEdit(s.suggestedUserEmail)}>
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                        <button className="nw-act-btn nw-act-decline" title="Cancel" onClick={() => setEditingEmail(null)}>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="nw-req-right">
                      <RelationChip relation={rel} style={{ fontSize: 11 }} />
                      <div className="nw-req-actions">
                        <Tooltip title="Edit Relation">
                          <Button size="small" type="text" icon={<FontAwesomeIcon icon={faPenToSquare} style={{ color: "#64748b", fontSize: 14 }} />} onClick={() => startEdit(s)} style={{ padding: 0, width: 30, height: 30 }} />
                        </Tooltip>
                        <button className="nw-act-btn nw-act-send" title="Send Request" onClick={() => sendRequest(s)}>
                          <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                        <button className="nw-act-btn nw-act-dismiss" title="Dismiss" onClick={() => dismiss(s)}><FontAwesomeIcon icon={faXmark} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RelationPickerModal
        open={pickerOpen}
        title="Edit Relation"
        personName={suggestions.find((x) => x.suggestedUserEmail === editingEmail)?.suggestedUserName}
        value={editValue || undefined}
        onClose={() => setPickerOpen(false)}
        onPick={(v) => setEditValue(v)}
      />
    </div>
  );
}

export default SuggestionsPage;