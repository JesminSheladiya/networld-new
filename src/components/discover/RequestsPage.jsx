import { useEffect, useLayoutEffect, useState, useCallback, useRef, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { Spin, Button, Tooltip, message, Avatar, Pagination } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-regular-svg-icons";
import { faCheck, faXmark, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { getInverseRelation } from "../../utils/relationUtils";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import RelationChip from "../shared/RelationChip";
import ConfirmPopup from "../shared/ConfirmPopup";
import { avatarColorFor, DEFAULT_PAGE_SIZE, getPageSizePreference, setPageSizePreference, pageSizeOptionsForTotal, PAGE_SIZE_OPTIONS_LIMITED, formatCount, MQ_COMPACT } from "../../constants";
import { toDataUrl } from "../../utils/imageUtils";
import { useAuth } from "../../context/AuthContext";
import RelationPickerModal from "../shared/RelationPickerModal";

// Keep the current request lists while the user visits profiles or another
// tab. A refresh key/mutation makes the next visit fetch fresh server data.
const requestCache = new Map();

// Memoized rows — same markup as before. Virtuoso mounts only the visible
// window (contacts-page pattern), so long lists never grow the DOM.
const PendingRow = memo(function PendingRow({ p, rel, avColor, reason, onOpen, onAccept, onDecline }) {
  return (
    <div
      className="nw-req-row"
      onClick={() => onOpen(p)}
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
          <div className="nw-find-reason">{reason}</div>
        </div>
      </div>
      <div className="nw-req-right">
        <RelationChip relation={rel} style={{ fontSize: 11 }} />
        <div className="nw-req-actions" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Decline">
            <button className="nw-act-btn nw-act-decline" onClick={() => onDecline(p.pendingRelationId)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </Tooltip>
          <Tooltip title="Accept">
            <button className="nw-act-btn nw-act-accept" onClick={() => onAccept(p.pendingRelationId)}>
              <FontAwesomeIcon icon={faCheck} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

const SentRow = memo(function SentRow({ p, rel, avColor, reason, onOpen, onEdit, onCancel }) {
  return (
    <div
      className="nw-req-row"
      onClick={() => onOpen(p)}
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
          <div className="nw-find-reason">{reason}</div>
        </div>
      </div>
      <div className="nw-req-right">
        <RelationChip relation={rel} style={{ fontSize: 11 }} />
          <div className="nw-req-actions" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Edit relation">
              <button className="nw-act-btn nw-act-edit" onClick={() => onEdit(p)}>
                <FontAwesomeIcon icon={faPenToSquare} />
              </button>
            </Tooltip>
            <Tooltip title="Cancel request">
            <button className="nw-act-btn nw-act-decline" onClick={() => onCancel(p.pendingRelationId)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

function RequestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const accountKey = user?.email || "anonymous";
  const cachedRequests = requestCache.get(accountKey);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);

  // Parse URL params
  const getInitialState = () => {
    const tab = searchParams.get("tab") || "received";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = parseInt(searchParams.get("size") || String(getPageSizePreference(accountKey)), 10);
    return { tab, page, pageSize };
  };

  const initial = getInitialState();

  const [tab, setTab] = useState(initial.tab);
  const [pending, setPending] = useState(() => cachedRequests?.pending || []);
  const [pendingTotal, setPendingTotal] = useState(() => cachedRequests?.pendingTotal || 0);
  // Page is 1-indexed in URL, 0-indexed internally
  const [pendingPage, setPendingPage] = useState(initial.tab === "received" ? initial.page - 1 : 0);
  const [loading, setLoading] = useState(() => !cachedRequests?.pending);
  const [loadingMore, setLoadingMore] = useState(false);
  const [declineId, setDeclineId] = useState(null);
  const [sent, setSent] = useState(() => cachedRequests?.sent || []);
  const [sentTotal, setSentTotal] = useState(() => cachedRequests?.sentTotal || 0);
  const [sentPage, setSentPage] = useState(initial.tab === "sent" ? initial.page - 1 : 0);
  const [sentLoading, setSentLoading] = useState(() => !cachedRequests?.sent);
  const [sentLoadingMore, setSentLoadingMore] = useState(false);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [cancelId, setCancelId] = useState(null);
  const [editingSent, setEditingSent] = useState(null);
  const [sentPickerOpen, setSentPickerOpen] = useState(false);
  const { setPendingCount } = useRefresh();
  const { relName, relCategory, format } = useRelationDisplay();
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const abortPendingRef = useRef(null);
  const abortSentRef = useRef(null);
  const pendingReqRef = useRef(0);
  const sentReqRef = useRef(0);
  // Tracks whether page 0 was just fetched by the mount/refresh effect,
  // so the page-change effect doesn't skip a legitimate return to page 1.
  const pendingPageZeroFresh = useRef(false);
  const sentPageZeroFresh = useRef(false);
  // Restored-from-cache guards so the page effects don't re-fetch the
  // already-loaded pages on an in-app "back".
  const pendingRestoredRef = useRef(false);
  const pendingRestoredPageRef = useRef(null);
  const sentRestoredRef = useRef(false);
  const sentRestoredPageRef = useRef(null);
  // Pagination fix refs
  const isRenderingRef = useRef(true);
  useLayoutEffect(() => { isRenderingRef.current = false; }, []);
  const isPageSizeChangeRef = useRef(false);
  const prevPageSizeRef = useRef(null);
  useEffect(() => {
    prevPageSizeRef.current = pageSize;
  }, [pageSize]);

  useEffect(() => {
    const mq = window.matchMedia(MQ_COMPACT);
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  // Sync URL when state changes
  const syncUrl = useCallback((updates = {}, replace = true) => {
    const nextParams = new URLSearchParams();
    const nextTab = updates.tab ?? tab;
    const nextPage = updates.page ?? (nextTab === "received" ? pendingPage + 1 : sentPage + 1);
    const nextPageSize = updates.pageSize ?? pageSize;

    if (nextTab !== "received") nextParams.set("tab", nextTab);
    nextParams.set("page", String(nextPage)); // Always include page (even page=1) for explicit URL state
    nextParams.set("size", String(nextPageSize)); // Always include size so back/forward remembers it

    setSearchParams(nextParams, { replace });
  }, [tab, pendingPage, sentPage, pageSize, setSearchParams, accountKey]);

  // Handle browser back/forward — sync state from URL
  useEffect(() => {
    const next = getInitialState();
    if (next.tab !== tab) { setTab(next.tab); }
    if (next.tab === "received" && next.page - 1 !== pendingPage) { setPendingPage(next.page - 1); }
    if (next.tab === "sent" && next.page - 1 !== sentPage) { setSentPage(next.page - 1); }
    if (next.pageSize !== pageSize) { setPageSize(next.pageSize); }
  }, [searchParams]);

  // Contacts-page pattern per tab: replace on page 0, append only for mobile
  // infinite-scroll (page > 0). Desktop pagination always replaces data.
  const fetchPending = async (pageNum, isInfiniteScrollAppend = false) => {
    const id = ++pendingReqRef.current;
    if (abortPendingRef.current) abortPendingRef.current.abort();
    const ctrl = new AbortController();
    abortPendingRef.current = ctrl;
    const isReplace = !isInfiniteScrollAppend;
    if (isReplace) setLoading(true);
    try {
      const res = await api.pending(pageNum, pageSize, ctrl.signal);
      if (id !== pendingReqRef.current) return;
      const data = res.data?.content || [];
      const total = res.data?.totalElements ?? data.length;
      setPending((prev) => {
        const next = isInfiniteScrollAppend ? [...prev, ...data] : data;
        const cached = requestCache.get(accountKey) || {};
        requestCache.set(accountKey, {
          ...cached,
          pageSize,
          format,
          pending: next,
          pendingTotal: total,
          pendingPage: pageNum,
          scrollY: cached.scrollY,
        });
        return next;
      });
      setPendingTotal(total);
      setPendingCount(total);
    } catch (e) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
      if (isReplace && id === pendingReqRef.current) {
        setPending([]);
        setPendingTotal(0);
        setPendingCount(0);
      }
    } finally {
      if (isReplace && id === pendingReqRef.current) setLoading(false);
    }
  };

  const fetchSent = async (pageNum, append = false) => {
    const id = ++sentReqRef.current;
    if (abortSentRef.current) abortSentRef.current.abort();
    const ctrl = new AbortController();
    abortSentRef.current = ctrl;
    if (!append) setSentLoading(true);
    try {
      const res = await api.sent(pageNum, pageSize, ctrl.signal);
      if (id !== sentReqRef.current) return;
      const data = res.data?.content || [];
      const total = res.data?.totalElements ?? data.length;
      setSent((prev) => {
        const next = append ? [...prev, ...data] : data;
        const cached = requestCache.get(accountKey) || {};
        requestCache.set(accountKey, {
          ...cached,
          pageSize,
          format,
          sent: next,
          sentTotal: total,
          sentPage: pageNum,
          scrollY: cached.scrollY,
        });
        return next;
      });
      setSentTotal(total);
    } catch (e) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
      if (!append && id === sentReqRef.current) {
        setSent([]);
        setSentTotal(0);
      }
    } finally {
      if (!append && id === sentReqRef.current) setSentLoading(false);
    }
  };

  // Mount + refresh: immediate page-0 loads for both tabs.
  useEffect(() => {
    setLoadingMore(false);
    setSentLoadingMore(false);
    const cached = requestCache.get(accountKey);
    if (cached && cached.pageSize === pageSize && cached.format === format) {
      setPendingPage(cached.pendingPage || 0);
      setSentPage(cached.sentPage || 0);
      setPending(cached.pending || []);
      setPendingTotal(cached.pendingTotal || 0);
      setPendingCount(cached.pendingTotal || 0);
      setSent(cached.sent || []);
      setSentTotal(cached.sentTotal || 0);
      pendingPageZeroFresh.current = true;
      sentPageZeroFresh.current = true;
      pendingRestoredRef.current = true;
      pendingRestoredPageRef.current = cached.pendingPage || 0;
      sentRestoredRef.current = true;
      sentRestoredPageRef.current = cached.sentPage || 0;
      if (cached.scrollY) setTimeout(() => window.scrollTo(0, cached.scrollY), 0);
      return;
    }
    // Don't reset pages to 0 - use the pages from URL (already in state)
    // Don't call syncUrl({ page: 1 }) - it would overwrite the URL
    fetchPending(pendingPage, false);
    fetchSent(sentPage, false);
    pendingPageZeroFresh.current = true;
    sentPageZeroFresh.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, isCompact, pageSize, format]);

  useEffect(() => {
    if (pendingRestoredRef.current && pendingPage === pendingRestoredPageRef.current) {
      pendingRestoredRef.current = false;
      pendingRestoredPageRef.current = null;
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (pendingPage === 0 && pendingPageZeroFresh.current) {
      pendingPageZeroFresh.current = false;
      return;
    }
    const isInitialLoad = pendingPage === 0;
    if (isCompact && !isInitialLoad) setLoadingMore(true);
    else if (isInitialLoad) setLoading(true);
    fetchPending(pendingPage, isCompact && !isInitialLoad).finally(() => {
      if (isCompact && !isInitialLoad) setLoadingMore(false);
      else if (isInitialLoad) setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPage]);

  useEffect(() => {
    if (sentRestoredRef.current && sentPage === sentRestoredPageRef.current) {
      sentRestoredRef.current = false;
      sentRestoredPageRef.current = null;
      setLoadingMore(false);
      setSentLoading(false);
      return;
    }
    if (sentPage === 0 && sentPageZeroFresh.current) {
      sentPageZeroFresh.current = false;
      return;
    }
    const isInitialLoad = sentPage === 0;
    if (isCompact && !isInitialLoad) setSentLoadingMore(true);
    else if (isInitialLoad) setSentLoading(true);
    fetchSent(sentPage, isCompact && !isInitialLoad).finally(() => {
      if (isCompact && !isInitialLoad) setSentLoadingMore(false);
      else if (isInitialLoad) setSentLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentPage]);

  const pendingHasMore = pending.length < pendingTotal;
  const sentHasMore = sent.length < sentTotal;

  const loadMorePending = useCallback(() => {
    if (isCompact && pendingHasMore && !loading && !loadingMore) {
      const nextPage = pendingPage + 1;
      setPendingPage(nextPage);
      syncUrl({ page: nextPage + 1 }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact, pendingHasMore, loading, loadingMore, pendingPage, syncUrl]);

  const loadMoreSent = useCallback(() => {
    if (isCompact && sentHasMore && !sentLoading && !sentLoadingMore) {
      const nextPage = sentPage + 1;
      setSentPage(nextPage);
      syncUrl({ page: nextPage + 1 }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact, sentHasMore, sentLoading, sentLoadingMore, sentPage, syncUrl]);

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
  }, [tab, pendingTotal, sentTotal]);

  const refreshAll = () => {
    setPendingPage(0);
    setSentPage(0);
    syncUrl({ page: 1 }, false);
    fetchPending(0, false);
    fetchSent(0, false);
  };

  // Instagram-style: open anyone's profile from a result row.
  const openProfile = useCallback((p) => {
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
  }, [navigate]);

  const accept = async (id) => {
    const item = pending.find((x) => x.pendingRelationId === id);
    try {
      await api.accept(id);
      // Remove from local cache immediately — no full reload
      setPending((prev) => prev.filter((p) => p.pendingRelationId !== id));
      setPendingTotal((t) => Math.max(0, t - 1));
      setPendingCount(Math.max(0, (pendingTotal || 0) - 1));
      const cached = requestCache.get(accountKey) || {};
      requestCache.set(accountKey, {
        ...cached,
        pageSize,
        pending: (cached.pending || []).filter((p) => p.pendingRelationId !== id),
        pendingTotal: Math.max(0, (cached.pendingTotal || 0) - 1),
      });
      const inv = getInverseRelation(item?.inferredRelation, item?.suggestedUserGender) || "";
      const cat = categoryOfRelation(inv);
      message.success(`Accepted — added to ${categoryLabel(cat)}`);
      navigate("/contacts", { state: { category: cat } });
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not accept request");
    }
  };

  const decline = async (id) => {
    try {
      await api.decline(id);
      // Remove from local cache immediately — no full reload
      setPending((prev) => prev.filter((p) => p.pendingRelationId !== id));
      setPendingTotal((t) => Math.max(0, t - 1));
      setPendingCount(Math.max(0, (pendingTotal || 0) - 1));
      const cached = requestCache.get(accountKey) || {};
      requestCache.set(accountKey, {
        ...cached,
        pageSize,
        pending: (cached.pending || []).filter((p) => p.pendingRelationId !== id),
        pendingTotal: Math.max(0, (cached.pendingTotal || 0) - 1),
      });
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not decline request");
    }
  };

  // Sent tab: open the recipient's profile (shows the "Request Sent" chip —
  // the seed carries pending:"sent" so the strip is correct instantly, and
  // the detail refetch keeps it via search-users).
  const openSentProfile = useCallback((p) => {
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
  }, [navigate]);

  const cancelSent = async (id) => {
    try {
      await api.cancel(id);
      // Remove from local cache immediately — no full reload
      setSent((prev) => prev.filter((p) => p.pendingRelationId !== id));
      setSentTotal((t) => Math.max(0, t - 1));
      const cached = requestCache.get(accountKey) || {};
      requestCache.set(accountKey, {
        ...cached,
        pageSize,
        sent: (cached.sent || []).filter((p) => p.pendingRelationId !== id),
        sentTotal: Math.max(0, (cached.sentTotal || 0) - 1),
      });
      message.success("Request cancelled");
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not cancel request");
    }
  };

  const saveSentRelation = async (relationName) => {
    if (!editingSent || !relationName) return;
    try {
      await api.updateRelation(editingSent.pendingRelationId, relationName);
      setSent((prev) => prev.map((p) => (
        p.pendingRelationId === editingSent.pendingRelationId
          ? { ...p, inferredRelation: relationName }
          : p
      )));
      requestCache.set(accountKey, {
        ...(requestCache.get(accountKey) || {}),
        pageSize,
        format,
        sent: sent.map((p) => p.pendingRelationId === editingSent.pendingRelationId
          ? { ...p, inferredRelation: relationName }
          : p),
        sentTotal,
      });
      setEditingSent(null);
      setSentPickerOpen(false);
      message.success("Request relation updated");
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not update request relation");
    }
  };

  const renderPendingRow = useCallback(
    (_index, p) => (
      <PendingRow
        p={p}
        rel={getInverseRelation(p.inferredRelation, p.suggestedUserGender)?.toLowerCase() || ""}
        avColor={avatarColorFor(p.suggestedUserName)}
        reason={formatReason(p.reason)}
        onOpen={openProfile}
        onAccept={accept}
        onDecline={setDeclineId}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openProfile]
  );

  const renderSentRow = useCallback(
    (_index, p) => (
      <SentRow
        p={p}
        rel={(p.inferredRelation || "").toLowerCase()}
        avColor={avatarColorFor(p.suggestedUserName)}
        reason={formatSentReason(p.reason)}
        onOpen={openSentProfile}
        onEdit={(item) => { setEditingSent(item); setSentPickerOpen(true); }}
        onCancel={setCancelId}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openSentProfile]
  );

  useEffect(() => {
    return () => {
      const cached = requestCache.get(accountKey);
      if (cached) requestCache.set(accountKey, { ...cached, scrollY: window.scrollY });
    };
  }, [accountKey]);

  const isReceived = tab === "received";
  const busy = isReceived ? loading : sentLoading;

  // Tab click handlers that sync URL - always reset to page 1 when switching tabs
  const handleTabReceived = () => {
    setTab("received");
    setPendingPage(0);
    syncUrl({ tab: "received", page: 1 }, false);
  };

  const handleTabSent = () => {
    setTab("sent");
    setSentPage(0);
    syncUrl({ tab: "sent", page: 1 }, false);
  };

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
              onClick={handleTabReceived}
            >
              Received
              <span className="nw-chip-count" title={pendingTotal}>{formatCount(pendingTotal)}</span>
            </button>
            <button
              role="tab"
              aria-selected={!isReceived}
              ref={(el) => (chipRefs.current[1] = el)}
              className={!isReceived ? "nw-chip active" : "nw-chip"}
              onClick={handleTabSent}
            >
              Sent
              <span className="nw-chip-count" title={sentTotal}>{formatCount(sentTotal)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="nw-discover-panel">
        {isReceived ? (
          loading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading requests...</span></div>
        ) : pendingTotal === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faBell} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No pending requests</span>
            <span className="nw-state-sub">When someone sends you a connection request, it will show up here</span>
          </div>
        ) : (
          <div className="nw-discover-list">
             <div className="nw-discover-label">Requests · <span title={pendingTotal}>{pendingTotal.toLocaleString()}</span></div>
            {isCompact ? (
              <Virtuoso
                useWindowScroll
                data={pending}
                endReached={loadMorePending}
                overscan={360}
                itemContent={renderPendingRow}
              />
            ) : (
              pending.map((p) => (
                <PendingRow
                  key={p.pendingRelationId ?? p.suggestedUserEmail}
                  p={p}
                  rel={getInverseRelation(p.inferredRelation, p.suggestedUserGender)?.toLowerCase() || ""}
                  avColor={avatarColorFor(p.suggestedUserName)}
                  reason={formatReason(p.reason)}
                  onOpen={openProfile}
                  onAccept={accept}
                  onDecline={setDeclineId}
                />
              ))
            )}
            {isCompact && (loadingMore ? (
              <div className="nw-list-loader">
                <Spin size="small" />
                <span>Loading more requests...</span>
              </div>
            ) : (
              !pendingHasMore && <div className="nw-list-end">No more requests</div>
            ))}
            {!isCompact && pendingTotal > DEFAULT_PAGE_SIZE && (
              <div className="nw-table-pagination">
                <Pagination
                  current={pendingPage + 1}
                  pageSize={pageSize}
                  total={pendingTotal}
                  showSizeChanger
                  pageSizeOptions={pageSizeOptionsForTotal(pendingTotal, PAGE_SIZE_OPTIONS_LIMITED)}
                  showQuickJumper
                  size="small"
                  onChange={(pg, newPageSize) => {
                    // Ignore Pagination mount calls
                    if (isRenderingRef.current) return;
                    // Ignore if we're handling a pageSize change (onShowSizeChange already handled it)
                    if (isPageSizeChangeRef.current) {
                      isPageSizeChangeRef.current = false;
                      return;
                    }
                    const nextPageSize = Number(newPageSize);
                    // Use prevPageSizeRef to detect pageSize changes
                    if (nextPageSize !== prevPageSizeRef.current) {
                      isPageSizeChangeRef.current = true;
                      setPageSize(nextPageSize);
                      setPageSizePreference(accountKey, nextPageSize);
                      setPendingPage(0);
                      syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                      return;
                    }
                    // Only handle page changes here
                    setPendingPage(pg - 1);
                    syncUrl({ page: pg }, false);
                  }}
                  onShowSizeChange={(current, size) => {
                    // Ignore Pagination mount calls
                    if (isRenderingRef.current) return;
                    const nextPageSize = Number(size);
                    if (nextPageSize !== pageSize) {
                      isPageSizeChangeRef.current = true;
                      setPageSize(nextPageSize);
                      setPageSizePreference(accountKey, nextPageSize);
                      setPendingPage(0);
                      syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                    }
                  }}
                />
              </div>
            )}
          </div>
        )
        ) : sentLoading ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading sent requests...</span></div>
        ) : sentTotal === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faBell} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">No sent requests</span>
            <span className="nw-state-sub">Requests you send will stay here until accepted</span>
          </div>
        ) : (
          <div className="nw-discover-list">
           <div className="nw-discover-label">Sent · <span title={sentTotal}>{sentTotal.toLocaleString()}</span></div>
            {isCompact ? (
              <Virtuoso
                useWindowScroll
                data={sent}
                endReached={loadMoreSent}
                overscan={360}
                itemContent={renderSentRow}
              />
            ) : (
              sent.map((p) => (
                <SentRow
                  key={p.pendingRelationId ?? p.suggestedUserEmail}
                  p={p}
                  rel={(p.inferredRelation || "").toLowerCase()}
                  avColor={avatarColorFor(p.suggestedUserName)}
                  reason={formatSentReason(p.reason)}
                  onOpen={openSentProfile}
                   onEdit={(item) => { setEditingSent(item); setSentPickerOpen(true); }}
                   onCancel={setCancelId}
                />
              ))
            )}
            {isCompact && (sentLoadingMore ? (
              <div className="nw-list-loader">
                <Spin size="small" />
                <span>Loading more requests...</span>
              </div>
            ) : (
              !sentHasMore && <div className="nw-list-end">No more requests</div>
            ))}
            {!isCompact && sentTotal > DEFAULT_PAGE_SIZE && (
              <div className="nw-table-pagination">
                <Pagination
                  current={sentPage + 1}
                  pageSize={pageSize}
                  total={sentTotal}
                  showSizeChanger
                  pageSizeOptions={pageSizeOptionsForTotal(sentTotal, PAGE_SIZE_OPTIONS_LIMITED)}
                  showQuickJumper
                  size="small"
                  onChange={(pg, newPageSize) => {
                    // Ignore Pagination mount calls
                    if (isRenderingRef.current) return;
                    // Ignore if we're handling a pageSize change (onShowSizeChange already handled it)
                    if (isPageSizeChangeRef.current) {
                      isPageSizeChangeRef.current = false;
                      return;
                    }
                    const nextPageSize = Number(newPageSize);
                    // Use prevPageSizeRef to detect pageSize changes
                    if (nextPageSize !== prevPageSizeRef.current) {
                      isPageSizeChangeRef.current = true;
                      setPageSize(nextPageSize);
                      setPageSizePreference(accountKey, nextPageSize);
                      setSentPage(0);
                      syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                      return;
                    }
                    // Only handle page changes here
                    setSentPage(pg - 1);
                    syncUrl({ page: pg }, false);
                  }}
                  onShowSizeChange={(current, size) => {
                    // Ignore Pagination mount calls
                    if (isRenderingRef.current) return;
                    const nextPageSize = Number(size);
                    if (nextPageSize !== pageSize) {
                      isPageSizeChangeRef.current = true;
                      setPageSize(nextPageSize);
                      setPageSizePreference(accountKey, nextPageSize);
                      setSentPage(0);
                      syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                    }
                  }}
                />
              </div>
            )}
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

      <RelationPickerModal
        open={sentPickerOpen}
        title="Edit Request Relation"
        personName={editingSent?.suggestedUserName}
        personGender={editingSent?.suggestedUserGender}
        value={editingSent?.inferredRelation || undefined}
        currentRelation={editingSent?.inferredRelation}
        onClose={() => { setSentPickerOpen(false); setEditingSent(null); }}
        onPick={saveSentRelation}
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