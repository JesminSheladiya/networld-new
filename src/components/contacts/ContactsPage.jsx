import { useCallback, useEffect, useRef, useState, memo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useNavigate, useLocation } from "react-router-dom";
import { Input, Spin, Avatar, Empty, Tooltip, Pagination, Modal, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlass, faXmark, faFilter, faCheck, faRotateLeft, faChevronRight, faArrowDownWideShort } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { mapConnectionToContact as mapContact } from "../../utils/contactMapper";

import RelationChip from "../shared/RelationChip";
import EditRelationModal from "../shared/EditRelationModal";
import { getPageSizePreference, setPageSizePreference, pageSizeOptionsForTotal, MQ_COMPACT, MQ_NARROW, SEARCH_DEBOUNCE_MS, avatarColorFor, formatCount } from "../../constants";
import { toDataUrl } from "../../utils/imageUtils";
import { useAuth } from "../../context/AuthContext";
import { estimateDownlinkMbps } from "../../Services/connectionMonitor";
import { useRelationDisplay } from "../../context/RelationDisplayContext";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "family", label: "Family" },
  { key: "inlaws", label: "In-Laws" },
  { key: "others", label: "Others" },
];

const contactsCache = new Map();

// Memoized row — Virtuoso mounts only the visible window, so a 10k list
// never grows the DOM and every append stays as fast as the first one.
// Markup + classes are identical to the plain list (no fixed-height box,
// page scrolls normally).
const ContactRow = memo(function ContactRow({ rec, onOpen, onEdit }) {
  return (
    <div
      className="nw-contact-row"
      onClick={() => onOpen(rec)}
      title={`View ${rec.name}'s profile`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(rec); }}
    >
      {/* Avatar is not clickable here (Instagram-style): the photo opens
          only on the profile page, never from a list. */}
      <span className="nw-contact-avatar">
        <Avatar
          size={44}
          src={toDataUrl(rec.profilePicture)}
          style={{
            backgroundColor: rec.profilePicture ? "transparent" : avatarColorFor(rec.name),
            fontSize: 17,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {!(rec.profilePicture) && (rec.name || "?")?.charAt(0).toUpperCase()}
        </Avatar>
      </span>
      <span className="nw-contact-info">
        <span className="nw-contact-name">{rec.name}</span>
        <span className="nw-contact-sub">
          {rec.username ? `@${rec.username.toLowerCase()}` : (rec.phone || "—")}
        </span>
      </span>
      <span className="nw-contact-right">
        <RelationChip relation={rec.relation} style={{ flexShrink: 0, fontSize: 11 }} />
        <span className="nw-contact-actions" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Edit relation">
            <button
              className="nw-icon-btn"
              aria-label={`Edit relation with ${rec.name}`}
              onClick={() => onEdit(rec)}
            >
              <FontAwesomeIcon icon={faPenToSquare} />
            </button>
          </Tooltip>
        </span>
      </span>
      <FontAwesomeIcon icon={faChevronRight} className="nw-contact-chevron" />
    </div>
  );
});

function ContactsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const accountKey = user?.email || "anonymous";
  const { format } = useRelationDisplay();
  const cachedContacts = contactsCache.get(accountKey);

  // Coming from Requests accept → open the tab where the contact landed
  useEffect(() => {
    const c = location.state?.category;
    if (c) {
      setSelectedRelations([]);
      setCategory(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(MQ_NARROW).matches);
  const [searchText, setSearchText] = useState(() => cachedContacts?.searchText || "");
  const [category, setCategory] = useState(() => cachedContacts?.category || "all");
  const [loading, setLoading] = useState(() => !cachedContacts);
  const [dataSource, setDataSource] = useState(() => cachedContacts?.dataSource || []);
  const [totalItems, setTotalItems] = useState(() => cachedContacts?.totalItems || 0);
  const [counts, setCounts] = useState({ all: 0, family: 0, inlaws: 0, others: 0 });
  const [relationOptions, setRelationOptions] = useState([]);
  const [editingContact, setEditingContact] = useState(null);
  // Network-based page size for mobile/compact layouts.
  // Slow networks → smaller pages (faster initial load, less data).
  // Fast networks → larger pages (fewer round-trips).
  const getNetworkPageSize = () => {
    if (!isCompact) return getPageSizePreference(accountKey);
    const downlink = estimateDownlinkMbps(); // Mbps from RTT measurement
    if (downlink < 0.5) return 20;    // Very slow (Slow 3G / 2G)
    if (downlink < 1.5) return 30;    // Slow (3G)
    if (downlink < 5) return 50;      // Medium (4G)
    return 100;                       // Fast (5G / WiFi)
  };

  const [page, setPage] = useState(() => cachedContacts?.page || 0);
  const [pageSize, setPageSize] = useState(() => {
    if (isCompact) return getNetworkPageSize();
    return getPageSizePreference(accountKey);
  });
  const [sortParam, setSortParam] = useState(() => cachedContacts?.sortParam || null);
  const [loadingMore, setLoadingMore] = useState(false);
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [selectedRelations, setSelectedRelations] = useState(() => cachedContacts?.selectedRelations || []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileQ, setMobileQ] = useState("");
  const [sortDraft, setSortDraft] = useState(null);

  // Re-evaluate page size when network or compact mode changes.
  // Poll every 30s because RTT-based downlink estimate updates automatically
  // as API responses slow down or speed up (works with DevTools throttling).
  // Also re-check when user returns to this tab (visibilitychange).
  useEffect(() => {
    if (!isCompact) return;
    const checkAndUpdate = () => {
      const next = getNetworkPageSize();
      if (next !== pageSize) {
        setPageSize(next);
        setPageSizePreference(accountKey, next);
      }
    };
    // Check on mount
    checkAndUpdate();
    // Periodic check every 30s for network changes
    const interval = setInterval(checkAndUpdate, 30000);
    // Re-check when user returns to this tab (tab switch back)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact]);

  // Sort applies only via Show — picking chips just stages the choice.
  useEffect(() => {
    if (filterOpen) setSortDraft(sortParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOpen]);

  // All tabs always visible (with counts)
  const visibleCategories = CATEGORIES;

  useEffect(() => {
    if (isNarrow) return;
    const activeIdx = visibleCategories.findIndex((c) => c.key === category);
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
  }, [category, dataSource.length, isNarrow, visibleCategories, visibleCategories.length]);

  useEffect(() => {
    const mq = window.matchMedia(MQ_COMPACT);
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(MQ_NARROW);
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Mobile tools layout (≤640px): search + filter share one row,
  // sort lives inside the filter popup.
  const [isMobileTools, setIsMobileTools] = useState(
    () => window.matchMedia("(max-width: 640px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobileTools(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Server list: paging + category + relations + sort all in backend.
  // reqIdRef drops stale responses (fast filter changes must not overwrite newer results).
  const reqIdRef = useRef(0);
  // Abort stale in-flight list requests: reqIdRef discards responses, but
  // without abort the server still executes every discarded keystroke query.
  const abortRef = useRef(null);
  const fetchList = async (pageNum, append = false) => {
    const id = ++reqIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (!append) setLoading(true);
    try {
      // Desktop searches name/username/mobile, mobile only name/username
      // (server-side via includePhone — keeps paging + counts consistent).
      const res = await api.connectionsPaged(
        pageNum, pageSize, searchText, category, selectedRelations, sortParam, !isCompact, ctrl.signal
      );
      if (id !== reqIdRef.current) return; // stale — a newer request is in flight
      const mapped = res.data.content.map(mapContact);
      const nextTotal = res.data.totalElements;
      // Backend adjusts page size based on network conditions — sync frontend state
      const actualPageSize = res.data.pageable?.size || pageSize;
      setDataSource((prev) => {
        const next = append ? [...prev, ...mapped] : mapped;
        contactsCache.set(accountKey, {
          searchText, category, selectedRelations, sortParam,
          pageSize: actualPageSize, format,
          page: pageNum, dataSource: next, totalItems: nextTotal,
        });
        return next;
      });
      if (actualPageSize !== pageSize) {
        setPageSize(actualPageSize);
        setPageSizePreference(accountKey, actualPageSize);
      }
      setTotalItems(nextTotal);
    } catch (e) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
      if (!append && id === reqIdRef.current) {
        setDataSource([]);
        setTotalItems(0);
      }
    } finally {
      if (!append && id === reqIdRef.current) setLoading(false);
    }
  };

  // Skip only the very first mount fetch (reset effect below does it)
  const firstMountRef = useRef(true);
  // True while the reset effect's own page-0 fetch is authoritative,
  // so the page effect doesn't fire a duplicate for the same page
  const resetFetchRef = useRef(false);
  const restoredCacheRef = useRef(false);
  // Tracks whether the component is still mounted — guards against
  // setState on unmounted component when navigating away mid-fetch.
  const mountedRef = useRef(true);

  // Reset + load first page when anything filter-ish changes.
  // Always fetches page 0 directly: on mobile the page effect skips page 0,
  // so delegating via setPage(0) alone would leave the stale list in place.
  // Only keystroke search waits out the debounce — mount, tab switches,
  // filters and sort fetch immediately (the connections list style: no
  // blank 350ms wait on entry).
  const prevSearchRef = useRef(searchText);
  useEffect(() => {
    const searchChanged = prevSearchRef.current !== searchText;
    prevSearchRef.current = searchText;
    const delay = searchChanged ? SEARCH_DEBOUNCE_MS : 0;
    const handler = setTimeout(() => {
      const cached = contactsCache.get(accountKey);
      const cacheMatches = !!cached
        && cached.searchText === searchText
        && cached.category === category
        && cached.pageSize === pageSize
        && cached.sortParam === sortParam
        && cached.format === format
        && JSON.stringify(cached.selectedRelations || []) === JSON.stringify(selectedRelations);
      if (cacheMatches) {
        restoredCacheRef.current = true;
        // Populate dataSource from cache so the list is visible immediately,
        // then still trigger a background refresh via the page effect below.
        setDataSource(cached.dataSource || []);
        setTotalItems(cached.totalItems ?? 0);
        setLoading(false);
        return;
      }
      setLoadingMore(false);
      firstMountRef.current = false;
      resetFetchRef.current = true;
      setPage(0);
      fetchList(0, false);
    }, delay);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, category, selectedRelations, pageSize, sortParam, isCompact, format]);

  useEffect(() => {
    setPageSize(getPageSizePreference(accountKey));
    setPage(0);
  }, [accountKey]);

  // Desktop: each pagination click replaces the list with that page.
  // Compact/mobile: appended pages feed the infinite-scroll Virtuoso list.
  // Always refetch when page changes to 0 — never leave the list stuck
  // in loading state, especially when returning from an inner profile page.
  useEffect(() => {
    if (!mountedRef.current) return;
    if (page === 0) {
      setLoading(true);
      fetchList(page, false).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    } else {
      setLoadingMore(true);
      fetchList(page, isCompact).finally(() => {
        if (mountedRef.current) setLoadingMore(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Abort in-flight request and mark unmounted when leaving the page.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Also re-fetch when user returns to this tab (visibility change).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        setPage(0);
        fetchList(0, false).finally(() => {
          if (mountedRef.current) setLoading(false);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Server counts for tabs/dropdown + relation options for filters.
  // Mount fires immediately with the list; only keystroke search is
  // debounced (same rhythm as the list fetch above).
  const prevCountSearchRef = useRef(searchText);
  useEffect(() => {
    const ctrl = new AbortController();
    const searchChanged = prevCountSearchRef.current !== searchText;
    prevCountSearchRef.current = searchText;
    const delay = searchChanged ? SEARCH_DEBOUNCE_MS : 0;
    const handler = setTimeout(async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          api.connectionCounts(searchText, !isCompact, ctrl.signal),
          api.connectionRelations(searchText, !isCompact, ctrl.signal),
        ]);
        setCounts({
          all: cRes.data?.all ?? 0,
          family: cRes.data?.family ?? 0,
          inlaws: cRes.data?.inlaws ?? 0,
          others: cRes.data?.others ?? 0,
        });
        setRelationOptions(rRes.data || []);
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
        setCounts({ all: 0, family: 0, inlaws: 0, others: 0 });
        setRelationOptions([]);
      }
    }, delay);
    return () => { clearTimeout(handler); ctrl.abort(); };
  }, [searchText, isCompact]);

  // Switching tabs starts a fresh filter context (stale relation sub-filter
  // would otherwise combine with the new tab and show confusing results)
  const changeCategory = (v) => {
    setSelectedRelations([]);
    setCategory(v);
  };

  // Server already filtered + paged; nothing left to do client-side
  const filtered = dataSource;
  const hasMore = dataSource.length < totalItems;

  // Infinite scroll only exists on compact/mobile; desktop uses the
  // pagination control below.
  const loadMore = useCallback(() => {
    if (isCompact && hasMore && !loading && !loadingMore) {
      setLoadingMore(true);
      setPage((p) => p + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact, hasMore, loading, loadingMore]);

  const openContact = useCallback((rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.username || rec.email)}`, { state: { contact: rec } });
  }, [navigate]);

  const renderCompactRow = useCallback(
    (_index, rec) => (
      <ContactRow rec={rec} onOpen={openContact} onEdit={setEditingContact} />
    ),
    [openContact]
  );

  // Same sort options on every screen (no phone sorts — numbers hidden).
  const sortOptions = [
    { value: "name,asc", label: "Name A–Z" },
    { value: "name,desc", label: "Name Z–A" },
    { value: "username,asc", label: "Username A–Z" },
    { value: "username,desc", label: "Username Z–A" },
  ];

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-title-row">
          <h1 className="nw-page-title">My Contacts</h1>
          <p className="nw-page-subtitle">
            {totalItems > 0
              ? `${totalItems.toLocaleString()} ${totalItems === 1 ? "person" : "people"} in your network`
              : "People connected with you"}
          </p>
        </div>
        <div className="nw-contact-search-top">
          <Input
            className="nw-search nw-contact-search"
            prefix={<FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#64748b" }} />}
            placeholder={isCompact ? "Search name or username..." : "Search name, username, mobile..."}
            allowClear={{ clearIcon: <FontAwesomeIcon icon={faXmark} style={{ color: "#64748b", fontSize: 12 }} /> }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {isMobileTools && (
            <Tooltip title="Filter by relation">
              <button
                className={`nw-mobile-filter-btn${selectedRelations.length > 0 ? " active" : ""}`}
                onClick={() => { setMobileQ(""); setFilterOpen(true); }}
                aria-label="Filter by relation"
              >
                <FontAwesomeIcon icon={faFilter} />
                {selectedRelations.length > 0 && (
                  <span className="nw-mobile-filter-count">{selectedRelations.length}</span>
                )}
              </button>
            </Tooltip>
          )}
        </div>
        <div className="nw-tools">
          {isNarrow ? (
            <Select
              className="nw-category-select auth-input"
              value={category}
              onChange={(v) => changeCategory(v)}
              options={visibleCategories.map((c) => ({
                value: c.key,
                label: `${c.label} (${formatCount(counts[c.key] ?? 0)})`,
              }))}
            />
          ) : (
            <div className="nw-chips" ref={chipsRef}>
              <span
                className="nw-chip-indicator"
                style={{ left: indicator.left, width: indicator.width }}
              />
              {visibleCategories.map((c, i) => (
                <button
                  key={c.key}
                  ref={(el) => (chipRefs.current[i] = el)}
                  className={category === c.key ? "nw-chip active" : "nw-chip"}
                  onClick={() => changeCategory(c.key)}
                >
                  {c.label}
                  <span className="nw-chip-count" title={counts[c.key]}>{formatCount(counts[c.key])}</span>
                </button>
              ))}
            </div>
          )}
          {!isMobileTools && (
            <div className="nw-contact-toolbar">
              <div className="nw-contact-toolbar-row">
                <Select
                  className="nw-sort-select"
                  placeholder="Sort"
                  allowClear
                  value={sortParam || undefined}
                  onChange={(v) => setSortParam(v || null)}
                  options={sortOptions}
                  suffixIcon={<FontAwesomeIcon icon={faArrowDownWideShort} style={{ color: "#64748b", fontSize: 12 }} />}
                />
                <Tooltip title="Filter by relation">
                  <button
                    className={`nw-mobile-filter-btn${selectedRelations.length > 0 ? " active" : ""}`}
                    onClick={() => { setMobileQ(""); setFilterOpen(true); }}
                    aria-label="Filter by relation"
                  >
                    <FontAwesomeIcon icon={faFilter} />
                    {selectedRelations.length > 0 && (
                      <span className="nw-mobile-filter-count">{selectedRelations.length}</span>
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
        {(selectedRelations.length > 0 || sortParam) && (
          <div className="nw-mfilter-active">
            {sortParam && (
              <button
                className="nw-mfilter-active-chip"
                onClick={() => setSortParam(null)}
                title="Clear sort"
              >
                <span className="nw-mfilter-active-label">Sort: {sortOptions.find((o) => o.value === sortParam)?.label || sortParam}</span>
                <FontAwesomeIcon icon={faXmark} className="nw-mfilter-active-x" />
              </button>
            )}
            {selectedRelations.map((r) => (
              <button
                key={r}
                className="nw-mfilter-active-chip"
                onClick={() => setSelectedRelations((prev) => prev.filter((k) => k !== r))}
              >
                <RelationChip relation={r} style={{ fontSize: 11 }} />
                <FontAwesomeIcon icon={faXmark} className="nw-mfilter-active-x" />
              </button>
            ))}
            <button className="nw-mfilter-active-clear" onClick={() => { setSelectedRelations([]); setSortParam(null); }}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Full-screen spinner only when there is nothing to show yet —
          refetches (tab switch, filter, pull of page 0) keep the old rows on
          screen like the connections list, instead of blanking every time. */}
      {loading ? (
        <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading contacts...</span></div>
      ) : filtered.length === 0 ? (
        <div className="nw-discover-panel nw-table-empty">
          <div className="nw-table-empty-inner">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searchText.trim()
                  ? "No contacts match your search"
                  : category !== "all"
                    ? `No ${(CATEGORIES.find((c) => c.key === category) || {}).label || category} contacts yet`
                    : "No contacts yet"
              }
              className="nw-empty"
            />
          </div>
        </div>
      ) : (
        <div className="nw-discover-panel">
          <div className="nw-discover-label">Contacts · <span title={totalItems}>{totalItems.toLocaleString()}</span></div>
          {isCompact ? (
            <>
              <Virtuoso
                className="nw-contact-list"
                useWindowScroll
                data={filtered}
                endReached={loadMore}
                overscan={360}
                itemContent={renderCompactRow}
              />
              {loadingMore ? (
                <div className="nw-list-loader">
                  <Spin size="small" />
                  <span>Loading more contacts...</span>
                </div>
              ) : (
                !hasMore && <div className="nw-list-end">No more contacts</div>
              )}
            </>
          ) : (
            <div className="nw-contact-list">
              {filtered.map((rec) => (
                <ContactRow
                  key={rec.email || rec.key}
                  rec={rec}
                  onOpen={openContact}
                  onEdit={setEditingContact}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!isCompact && totalItems > pageSize && (
        <div className="nw-table-pagination">
          <Pagination
            current={page + 1}
            pageSize={pageSize}
            total={totalItems}
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
            showSizeChanger
            pageSizeOptions={pageSizeOptionsForTotal(totalItems)}
            showQuickJumper
            showLessItems
            size="small"
            onChange={(pg, newPageSize) => {
              if (newPageSize !== pageSize) {
                // Size change always resets to page 1. The pageSize effect
                // also fetches page 0, so this is not a duplicate request.
                setPageSizePreference(accountKey, newPageSize);
                setPageSize(newPageSize);
                setPage(0);
                return;
              }
              setPage(pg - 1);
            }}
          />
        </div>
      )}

      <EditRelationModal
        contact={editingContact}
        open={!!editingContact}
        onClose={() => setEditingContact(null)}
        onSaved={(newRel) => {
          if (editingContact) {
            const editedEmail = editingContact.email;
            const previousRel = editingContact.relation;
            setDataSource((prev) => {
              const index = prev.findIndex((item) => item.email === editedEmail);
              if (index < 0) return prev;
              const updated = { ...prev[index], relation: newRel };
              return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
            });
            // A relation used as a filter must disappear immediately when
            // the last matching contact is edited away from it. Keep the
            // filter picker/counts in sync without waiting for a reload.
            if (previousRel && previousRel !== newRel) {
              setSelectedRelations((prev) => prev.filter((r) => r !== previousRel));
              setRelationOptions((prev) => {
                const next = prev
                  .map((item) => {
                    if (item.value === previousRel) return { ...item, count: Math.max(0, item.count - 1) };
                    if (item.value === newRel) return { ...item, count: item.count + 1 };
                    return item;
                  })
                  .filter((item) => item.count > 0);
                if (!next.some((item) => item.value === newRel)) {
                  next.push({ value: newRel, count: 1 });
                }
                return next;
              });
            }
          }
        }}
      />

      <Modal
        open={filterOpen}
        onCancel={() => setFilterOpen(false)}
        footer={null}
        centered
        width={320}
        closeIcon={<FontAwesomeIcon icon={faXmark} style={{ color: "#64748b" }} />}
        title={<span className="nw-mfilter-title"><FontAwesomeIcon icon={faFilter} className="nw-mfilter-title-icon" /> Filter by Relation</span>}
        className="nw-mfilter-modal"
      >
        <div className="nw-mfilter-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="nw-mfilter-search-icon" />
          <input
            placeholder="Search relations..."
            value={mobileQ}
            onChange={(e) => setMobileQ(e.target.value)}
          />
          {mobileQ && (
            <button className="nw-mfilter-clear-q" onClick={() => setMobileQ("")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <div className="nw-mfilter-list">
          {relationOptions.filter((o) => o.value.toLowerCase().includes(mobileQ.trim().toLowerCase())).length === 0 ? (
            <div className="nw-mfilter-empty">
              {relationOptions.length === 0 ? "No relations found" : "No match for search"}
            </div>
          ) : (
            relationOptions
              .filter((o) => o.value.toLowerCase().includes(mobileQ.trim().toLowerCase()))
              .map((o) => {
                const checked = selectedRelations.includes(o.value);
                return (
                  <button
                    key={o.value}
                    className={`nw-mfilter-item${checked ? " checked" : ""}`}
                    onClick={() =>
                      setSelectedRelations((prev) =>
                        prev.includes(o.value) ? prev.filter((k) => k !== o.value) : [...prev, o.value]
                      )
                    }
                  >
                    <span className={`nw-relation-check${checked ? " checked" : ""}`}>
                      {checked && <FontAwesomeIcon icon={faCheck} />}
                    </span>
                    <span className="nw-mfilter-item-label">
                      <RelationChip relation={o.value} style={{ fontSize: 11 }} />
                    </span>
                    <span className="nw-relation-filter-count" title={o.count}>{formatCount(o.count)}</span>
                  </button>
                );
              })
          )}
        </div>
        <div className="nw-mfilter-sort">
          <div className="nw-mfilter-section-title">Sort by</div>
          <div className="nw-msort-chips">
            {[{ value: null, label: "Default" }, ...sortOptions].map((o) => (
              <button
                key={o.value || "default"}
                className={`nw-msort-chip${(sortDraft || null) === o.value ? " active" : ""}`}
                onClick={() => setSortDraft(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="nw-mfilter-footer">
          <button className="nw-relation-filter-btn reset" onClick={() => { setSelectedRelations([]); setSortDraft(sortParam); }}>
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button className="nw-relation-filter-btn apply" onClick={() => { setSortParam(sortDraft); setFilterOpen(false); }}>
            Show{selectedRelations.length > 0 ? ` (${selectedRelations.length})` : ""}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default ContactsPage;
