import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { Spin, Button, Tooltip, message, Avatar, Pagination } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLightbulb, faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faCheck, faXmark, faRotateRight, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import RelationPickerModal from "../shared/RelationPickerModal";
import RelationChip from "../shared/RelationChip";
import ConfirmPopup from "../shared/ConfirmPopup";
import { avatarColorFor, DEFAULT_PAGE_SIZE, getPageSizePreference, setPageSizePreference, pageSizeOptionsForTotal, MQ_COMPACT } from "../../constants";
import { toDataUrl } from "../../utils/imageUtils";
import { useAuth } from "../../context/AuthContext";

// Suggestions are preserved while navigating away from this page. Mutations
// change refreshKey, which intentionally invalidates this snapshot.
const suggestionsCache = new Map();

// Memoized row — same markup as before. Virtuoso mounts only the visible
// window (contacts-page pattern), so a 9.5k list never grows the DOM and
// every append stays as fast as the first one.
const SuggestionRow = memo(function SuggestionRow({
  s, isEditing, editValue, edited, relName,
  onOpen, onStartEdit, onSaveEdit, onCancelEdit, onOpenPicker, onSend, onDismiss,
}) {
  const rel = (s.inferredRelation || "").toLowerCase();
  const avColor = avatarColorFor(s.suggestedUserName);
  return (
    <div
      className="nw-req-row"
      onClick={() => onOpen(s)}
      title="View profile"
      style={{ cursor: "pointer" }}
    >
      <div className="nw-req-left">
        <Avatar
          size={40}
          src={toDataUrl(s.suggestedUserProfilePic)}
          style={{
            backgroundColor: s.suggestedUserProfilePic ? "transparent" : avColor,
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {!(s.suggestedUserProfilePic) && (s.suggestedUserName || "?").charAt(0).toUpperCase()}
        </Avatar>
        <div className="nw-find-info">
          <div className="nw-find-name">{s.suggestedUserName}</div>
          <div className="nw-find-email">{s.suggestedUserUsername ? `@${s.suggestedUserUsername.toLowerCase()}` : (!s.contactInfoHidden ? s.suggestedUserEmail : "—")}</div>
          <div className="nw-find-reason">
            <span className="nw-auto-badge">AUTO</span> {s.reason}
          </div>
        </div>
      </div>

      {isEditing ? (
        <div className="nw-edit-inline" onClick={(e) => e.stopPropagation()}>
          <button
            className="nw-relation-pick-btn"
            onClick={() => onOpenPicker()}
            title={editValue ? relName(editValue) : "Select relation"}
          >
            {editValue ? relName(editValue) : "Relation"}
          </button>
          <div className="nw-req-actions">
            <button className="nw-act-btn nw-act-accept" title="Save" onClick={() => onSaveEdit(s.suggestedUserEmail)}>
              <FontAwesomeIcon icon={faCheck} />
            </button>
            <button className="nw-act-btn nw-act-decline" title="Cancel" onClick={onCancelEdit}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>
      ) : (
        <div className="nw-req-right">
          <span className="nw-rel-row">
            <RelationChip relation={rel} style={{ fontSize: 11 }} />
            {edited && (
              <span className="nw-edited-tag">Edited</span>
            )}
          </span>
          <div className="nw-req-actions" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Edit Relation">
              <Button size="small" type="text" icon={<FontAwesomeIcon icon={faPenToSquare} style={{ color: "#64748b", fontSize: 14 }} />} onClick={() => onStartEdit(s)} style={{ padding: 0, width: 30, height: 30 }} />
            </Tooltip>
            <Tooltip title="Send Request">
              <button className="nw-act-btn nw-act-send" onClick={() => onSend(s)}>
                <FontAwesomeIcon icon={faPaperPlane} />
              </button>
            </Tooltip>
            <Tooltip title="Dismiss">
              <button className="nw-act-btn nw-act-dismiss" onClick={() => onDismiss(s)}><FontAwesomeIcon icon={faXmark} /></button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
});

function SuggestionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountKey = user?.email || "anonymous";
  const cachedSuggestions = suggestionsCache.get(accountKey);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);
  const [suggestions, setSuggestions] = useState(() => cachedSuggestions?.data || []);
  const [suggestionsTotal, setSuggestionsTotal] = useState(() => cachedSuggestions?.total || 0);
  const [suggestionsPage, setSuggestionsPage] = useState(0);
  const [loading, setLoading] = useState(() => !cachedSuggestions);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editedEmails, setEditedEmails] = useState([]);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [pageSize, setPageSize] = useState(() => getPageSizePreference(accountKey));
  const { bump, key: refreshKey, setSuggestionsCount } = useRefresh();
  const { relName } = useRelationDisplay();

  const abortSuggRef = useRef(null);
  const reqIdRef = useRef(0);
  useEffect(() => {
    const mq = window.matchMedia(MQ_COMPACT);
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Contacts-page pattern: DB-paged (50/page), replace on page 0, append
  // after. Stale responses are dropped; stale requests are aborted.
  const fetchSuggestions = async (pageNum, append = false) => {
    const id = ++reqIdRef.current;
    if (abortSuggRef.current) abortSuggRef.current.abort();
    const ctrl = new AbortController();
    abortSuggRef.current = ctrl;
    if (!append) setLoading(true);
    try {
      const res = await api.suggestions(pageNum, pageSize, ctrl.signal);
      if (id !== reqIdRef.current) return;
      const data = res.data?.content || [];
      const total = res.data?.totalElements ?? data.length;
      setSuggestions((prev) => (append ? [...prev, ...data] : data));
      setSuggestionsTotal(total);
      setSuggestionsCount(total);
      if (!append) {
        suggestionsCache.set(accountKey, { refreshKey, pageSize, data, total });
      }
      if (!append) setEditedEmails([]);
    } catch (e) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
      if (!append && id === reqIdRef.current) {
        setSuggestions([]);
        setSuggestionsTotal(0);
        setSuggestionsCount(0);
      }
    } finally {
      if (!append && id === reqIdRef.current) setLoading(false);
    }
  };

  // Mount + refresh: immediate page-0 load (no blank wait).
  useEffect(() => {
    setLoadingMore(false);
    const cached = suggestionsCache.get(accountKey);
    if (cached && cached.refreshKey === refreshKey && cached.pageSize === pageSize) {
      setSuggestionsPage(0);
      setSuggestions(cached.data || []);
      setSuggestionsTotal(cached.total || 0);
      setSuggestionsCount(cached.total || 0);
      return;
    }
    setSuggestionsPage(0);
    fetchSuggestions(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, refreshKey, isCompact, pageSize]);

  // Next pages: append on compact, replace on desktop (pagination turns).
  useEffect(() => {
    if (suggestionsPage === 0) return;
    if (isCompact) setLoadingMore(true);
    fetchSuggestions(suggestionsPage, isCompact).finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionsPage]);

  const hasMore = suggestions.length < suggestionsTotal;

  // Next page pre-loads as the end approaches — no waiting at the bottom.
  const loadMore = useCallback(() => {
    if (isCompact && hasMore && !loading && !loadingMore) {
      setSuggestionsPage((p) => p + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact, hasMore, loading, loadingMore]);

  // Instagram-style: open anyone's profile from a result row.
  const openProfile = useCallback((s) => {
    const contact = {
      key: s.suggestedUserEmail,
      name: s.suggestedUserName || "",
      username: s.suggestedUserUsername || "",
      email: s.suggestedUserEmail || "",
      phone: s.suggestedUserPhone || "",
      profilePicture: s.suggestedUserProfilePic || null,
      coverImage: s.suggestedUserCoverImage || null,
      coverHidden: !!s.coverHidden,
      relation: s.inferredRelation || "",
      relationId: null,
      pending: s.pending || null,
      pendingRelationId: s.pendingRelationId ?? null,
      gender: s.suggestedUserGender || null,
      birthDate: s.suggestedUserBirthDate || null,
      bio: s.suggestedUserBio || "",
      occupation: s.suggestedUserOccupation || "",
      contactInfoHidden: !!s.contactInfoHidden,
      reason: s.reason || "",
      suggested: true,
    };
    navigate(
      `/contacts/${encodeURIComponent(s.suggestedUserUsername || s.suggestedUserEmail)}`,
      { state: { contact } }
    );
  }, [navigate]);

  // Row removed server-side → back to a fresh page 0 via bump (same as
  // contacts: the refresh effect owns the reload, single trigger).
  const sendRequest = async (s) => {
    try {
      await api.suggestionsSend(s.suggestedUserEmail, s.inferredRelation);
      bump();
      message.success("Connection request sent");
    } catch (e) {
      // Server is the source of truth — show its message and re-fetch.
      message.error(e?.response?.data?.message || "Could not send request");
      bump();
    }
  };

  const dismiss = async (s) => {
    try {
      await api.dismissSuggestion(s.pendingRelationId);
      bump();
      message.success("Suggestion dismissed");
    } catch {
      // silent
    }
  };

  const startEdit = useCallback((s) => {
    setEditingEmail(s.suggestedUserEmail);
    setEditValue(s.inferredRelation || "");
    setPickerOpen(true);
  }, []);

  const saveEdit = useCallback((email) => {
    const finalRel = editValue;
    if (!finalRel || !finalRel.trim()) return;
    setSuggestions((prev) =>
      prev.map((x) => (x.suggestedUserEmail === email ? { ...x, inferredRelation: finalRel } : x))
    );
    setEditedEmails((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setEditingEmail(null);
    message.success("Relation updated");
  }, [editValue]);

  const cancelEdit = useCallback(() => {
    setEditingEmail(null);
    setPickerOpen(false);
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);

  const renderRow = useCallback(
    (_index, s) => (
      <SuggestionRow
        s={s}
        isEditing={editingEmail === s.suggestedUserEmail}
        editValue={editValue}
        edited={editedEmails.includes(s.suggestedUserEmail)}
        relName={relName}
        onOpen={openProfile}
        onStartEdit={startEdit}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
        onOpenPicker={openPicker}
        onSend={sendRequest}
        onDismiss={setDismissTarget}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingEmail, editValue, editedEmails, relName, openProfile, startEdit, saveEdit, cancelEdit, openPicker]
  );

  const refresh = () => {
    setSuggestionsPage(0);
    fetchSuggestions(0, false);
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-find-head-row">
          <div>
            <h1 className="nw-page-title">Suggestions</h1>
            <p className="nw-page-subtitle">People you may know, discovered through mutual connections</p>
          </div>
          <Button className="nw-refresh-btn" size="small" type="text" loading={loading} onClick={refresh} icon={<FontAwesomeIcon icon={faRotateRight} />}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="nw-discover-panel">
        {loading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading suggestions...</span></div>
        ) : suggestionsTotal === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No suggestions yet</span>
            <span className="nw-state-sub">Add more contacts to get smart suggestions from your network</span>
          </div>
        ) : (
          <div className="nw-discover-list">
             <div className="nw-discover-label">Suggestions · <span title={suggestionsTotal}>{suggestionsTotal.toLocaleString()}</span></div>
            {isCompact ? (
              <Virtuoso
                useWindowScroll
                data={suggestions}
                endReached={loadMore}
                overscan={360}
                itemContent={renderRow}
              />
            ) : (
              suggestions.map((s) => (
                <SuggestionRow
                  key={s.suggestedUserEmail || s.pendingRelationId}
                  s={s}
                  isEditing={editingEmail === s.suggestedUserEmail}
                  editValue={editValue}
                  edited={editedEmails.includes(s.suggestedUserEmail)}
                  relName={relName}
                  onOpen={openProfile}
                  onStartEdit={startEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onOpenPicker={openPicker}
                  onSend={sendRequest}
                  onDismiss={setDismissTarget}
                />
              ))
            )}
            {isCompact && (loadingMore ? (
              <div className="nw-list-loader">
                <Spin size="small" />
                <span>Loading more suggestions...</span>
              </div>
            ) : (
              !hasMore && <div className="nw-list-end">No more suggestions</div>
            ))}
          </div>
        )}
      </div>
      {!isCompact && suggestionsTotal > DEFAULT_PAGE_SIZE && (
        <div className="nw-table-pagination">
          <Pagination
            current={suggestionsPage + 1}
            pageSize={pageSize}
            total={suggestionsTotal}
            showSizeChanger
            pageSizeOptions={pageSizeOptionsForTotal(suggestionsTotal)}
            showQuickJumper
            size="small"
            onChange={(pg, newPageSize) => {
              setSuggestionsPage(pg - 1);
              if (newPageSize !== pageSize) {
                setPageSize(newPageSize);
                setPageSizePreference(accountKey, newPageSize);
              }
            }}
          />
        </div>
      )}

      <RelationPickerModal
        open={pickerOpen}
        title="Edit Relation"
        personName={suggestions.find((x) => x.suggestedUserEmail === editingEmail)?.suggestedUserName}
        personGender={suggestions.find((x) => x.suggestedUserEmail === editingEmail)?.suggestedUserGender}
        value={editValue || undefined}
        currentRelation={editValue}
        onClose={() => setPickerOpen(false)}
        onPick={(v) => setEditValue(v)}
      />

      <ConfirmPopup
        open={dismissTarget !== null}
        title="Dismiss suggestion?"
        message="This suggestion will be removed."
        okText="Dismiss"
        okIcon={faXmark}
        onCancel={() => setDismissTarget(null)}
        onOk={() => {
          const t = dismissTarget;
          setDismissTarget(null);
          dismiss(t);
        }}
      />
    </div>
  );
}

export default SuggestionsPage;
