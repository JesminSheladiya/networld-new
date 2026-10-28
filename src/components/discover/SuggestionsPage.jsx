import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { avatarColorFor, DEFAULT_PAGE_SIZE, getPageSizePreference, setPageSizePreference, pageSizeOptionsForTotal, PAGE_SIZE_OPTIONS_LIMITED, MQ_COMPACT } from "../../constants";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const accountKey = user?.email || "anonymous";
  const cachedSuggestions = suggestionsCache.get(accountKey);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);

  // Parse URL params
  const getInitialState = () => {
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = parseInt(searchParams.get("size") || String(getPageSizePreference(accountKey)), 10);
    return { page, pageSize };
  };

  const initial = getInitialState();

  const [suggestions, setSuggestions] = useState(() => cachedSuggestions?.data || []);
  const [suggestionsTotal, setSuggestionsTotal] = useState(() => cachedSuggestions?.total || 0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editedEmails, setEditedEmails] = useState([]);
  const [dismissTarget, setDismissTarget] = useState(null);

  // Page is 1-indexed in URL, 0-indexed internally
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);

  const { setSuggestionsCount } = useRefresh();
  const { relName, format } = useRelationDisplay();

  const abortSuggRef = useRef(null);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const restoredCacheRef = useRef(false);
  const restoredPageRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia(MQ_COMPACT);
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      const cached = suggestionsCache.get(accountKey);
      if (cached) suggestionsCache.set(accountKey, { ...cached, scrollY: window.scrollY });
      mountedRef.current = false;
      if (abortSuggRef.current) abortSuggRef.current.abort();
    };
  }, [accountKey]);

  // Sync URL when state changes
  const syncUrl = useCallback((updates = {}, replace = true) => {
    const nextParams = new URLSearchParams();
    const nextPage = updates.page ?? page;
    const nextPageSize = updates.pageSize ?? pageSize;

    nextParams.set("page", String(nextPage)); // Always include page (even page=1) for explicit URL state
    if (nextPageSize !== getPageSizePreference(accountKey)) nextParams.set("size", String(nextPageSize));

    setSearchParams(nextParams, { replace });
  }, [page, pageSize, setSearchParams, accountKey]);

  // Handle browser back/forward — sync state from URL
  useEffect(() => {
    const next = getInitialState();
    if (next.page !== page) { setPage(next.page); }
    if (next.pageSize !== pageSize) { setPageSize(next.pageSize); }
  }, [searchParams]);

  // Contacts-page pattern: DB-paged (50/page), replace on page 0, append
  // after. Stale responses are dropped; stale requests are aborted.
  const fetchSuggestions = async (pageNum, append = false) => {
    const id = ++reqIdRef.current;
    if (abortSuggRef.current) abortSuggRef.current.abort();
    const ctrl = new AbortController();
    abortSuggRef.current = ctrl;
    if (!append) setLoading(true);
    try {
      const res = await api.suggestions(pageNum - 1, pageSize, ctrl.signal);
      if (id !== reqIdRef.current) return;
      const data = res.data?.content || [];
      const total = res.data?.totalElements ?? data.length;
      // Backend adjusts page size based on network conditions — sync frontend state
      const actualPageSize = res.data.pageable?.size || pageSize;
      setSuggestions((prev) => {
        const next = append ? [...prev, ...data] : data;
        const prevCache = suggestionsCache.get(accountKey) || {};
        suggestionsCache.set(accountKey, { pageSize: actualPageSize, format, data: next, total, page: pageNum, scrollY: prevCache.scrollY });
        return next;
      });
      setSuggestionsTotal(total);
      setSuggestionsCount(total);
      if (actualPageSize !== pageSize) {
        setPageSize(actualPageSize);
        setPageSizePreference(accountKey, actualPageSize);
        syncUrl({ pageSize: actualPageSize });
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
    if (cached && cached.pageSize === pageSize && cached.format === format) {
      setPage(cached.page + 1 || 1);
      setSuggestions(cached.data || []);
      setSuggestionsTotal(cached.total || 0);
      setSuggestionsCount(cached.total || 0);
      restoredCacheRef.current = true;
      restoredPageRef.current = cached.page + 1 || 1;
      setLoading(false);
      const saved = cached.scrollY;
      if (saved) setTimeout(() => window.scrollTo(0, saved), 0);
      return;
    }
    // Don't reset page to 1 - use the page from URL (already in state)
    // Don't call syncUrl({ page: 1 }) - it would overwrite the URL
    fetchSuggestions(page, false);
  }, [accountKey, isCompact, pageSize, format]);

  // Next pages: append on compact, replace on desktop (pagination turns).
  useEffect(() => {
    if (!mountedRef.current) return;
    if (restoredCacheRef.current && page === restoredPageRef.current) {
      restoredCacheRef.current = false;
      restoredPageRef.current = null;
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (page === 1) return;
    if (isCompact) setLoadingMore(true);
    fetchSuggestions(page, isCompact).finally(() => setLoadingMore(false));
  }, [page]);

  const hasMore = suggestions.length < suggestionsTotal;

  // Next page pre-loads as the end approaches — no waiting at the bottom.
  const loadMore = useCallback(() => {
    if (isCompact && hasMore && !loading && !loadingMore) {
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      syncUrl({ page: nextPage }, false);
    }
  }, [isCompact, hasMore, loading, loadingMore, page, syncUrl]);

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
      // Remove from suggestions cache — request sent, no longer a suggestion
      setSuggestions((prev) => prev.filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail));
      setSuggestionsTotal((t) => Math.max(0, t - 1));
      setSuggestionsCount(Math.max(0, (suggestionsTotal || 0) - 1));
      const cached = suggestionsCache.get(accountKey) || {};
      suggestionsCache.set(accountKey, {
        ...cached,
        pageSize,
        format,
        data: (cached.data || []).filter((x) => x.suggestedUserEmail !== s.suggestedUserEmail),
        total: Math.max(0, (cached.total || 0) - 1),
      });
      message.success("Connection request sent");
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not send request");
    }
  };

  const dismiss = async (s) => {
    try {
      await api.dismissSuggestion(s.pendingRelationId);
      // Remove from suggestions cache — dismissed, no longer a suggestion
      setSuggestions((prev) => prev.filter((x) => x.pendingRelationId !== s.pendingRelationId));
      setSuggestionsTotal((t) => Math.max(0, t - 1));
      setSuggestionsCount(Math.max(0, (suggestionsTotal || 0) - 1));
      const cached = suggestionsCache.get(accountKey) || {};
      suggestionsCache.set(accountKey, {
        ...cached,
        pageSize,
        format,
        data: (cached.data || []).filter((x) => x.pendingRelationId !== s.pendingRelationId),
        total: Math.max(0, (cached.total || 0) - 1),
      });
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
    setPage(1);
    syncUrl({ page: 1 });
    fetchSuggestions(1, false);
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
            current={page}
            pageSize={pageSize}
            total={suggestionsTotal}
            showSizeChanger
            pageSizeOptions={pageSizeOptionsForTotal(suggestionsTotal, PAGE_SIZE_OPTIONS_LIMITED)}
            showQuickJumper
            size="small"
            onChange={(pg, newPageSize) => {
              const nextPageSize = Number(newPageSize);
              if (nextPageSize !== pageSize) {
                // Page size changed: reset to page 0 and update preference
                setPageSize(nextPageSize);
                setPageSizePreference(accountKey, nextPageSize);
                setPage(1);
                syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                return;
              }
              // Page changed: update page
              setPage(pg);
              syncUrl({ page: pg }, false);
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