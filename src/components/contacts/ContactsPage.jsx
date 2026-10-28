import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input, Spin, Avatar, Empty, Tooltip, Pagination, Modal, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlass, faXmark, faFilter, faCheck, faRotateLeft, faChevronRight, faArrowDownWideShort } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { mapConnectionToContact as mapContact } from "../../utils/contactMapper";

import RelationChip from "../shared/RelationChip";
import EditRelationModal from "../shared/EditRelationModal";
import { getPageSizePreference, setPageSizePreference, pageSizeOptionsForTotal, PAGE_SIZE_OPTIONS_LIMITED, MQ_COMPACT, MQ_NARROW, SEARCH_DEBOUNCE_MS, avatarColorFor, formatCount } from "../../constants";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const accountKey = user?.email || "anonymous";
  const { format } = useRelationDisplay();
  const cachedContacts = contactsCache.get(accountKey);

  // Parse URL params — use searchParams from useSearchParams (react-router)
  // Lazy initialization ensures we read the URL at mount time
  const getInitialState = useCallback((params) => {
    const page = Math.max(1, parseInt(params.get("page") || "1", 10));
    const pageSize = parseInt(params.get("size") || String(getPageSizePreference(accountKey)), 10);
    const searchText = params.get("q") || "";
    const category = params.get("cat") || "all";
    const sortParam = params.get("sort") || null;
    const selectedRelations = params.get("rel") ? params.get("rel").split(",").filter(Boolean) : [];
    return { page, pageSize, searchText, category, sortParam, selectedRelations };
  }, [accountKey]);

  const initial = getInitialState(searchParams);

  // Coming from Requests accept → open the tab where the contact landed
  // This overrides URL category temporarily, then URL sync will take over
  const [urlOverride, setUrlOverride] = useState(null);
  useEffect(() => {
    const c = urlOverride;
    if (c) {
      setUrlOverride(null);
      // We'll handle this in the sync effect
    }
  }, [urlOverride]);

  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(MQ_NARROW).matches);
  const [searchText, setSearchText] = useState(initial.searchText);
  const [category, setCategory] = useState(initial.category);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState(() => cachedContacts?.dataSource || []);
  const [totalItems, setTotalItems] = useState(() => cachedContacts?.totalItems || 0);
  const [counts, setCounts] = useState(() => cachedContacts?.counts || { all: 0, family: 0, inlaws: 0, others: 0 });
  const [relationOptions, setRelationOptions] = useState(() => cachedContacts?.relationOptions || []);
  const [editingContact, setEditingContact] = useState(null);

  // Track if component has been interacted with (to ignore Pagination mount calls)
  const hasInteractedRef = useRef(false);
  const paginationChangeCountRef = useRef(0);
  const isRenderingRef = useRef(true);
  // Reset render flag after paint
  useLayoutEffect(() => { isRenderingRef.current = false; }, []);

  const getNetworkPageSize = () => {
    if (!isCompact) return getPageSizePreference(accountKey);
    const downlink = estimateDownlinkMbps();
    if (downlink < 0.5) return 20;
    if (downlink < 1.5) return 30;
    if (downlink < 5) return 50;
    return 100;
  };

  // Page is 1-indexed in URL, 0-indexed internally
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(() => {
    if (isCompact) return getNetworkPageSize();
    return initial.pageSize;
  });
  const [sortParam, setSortParam] = useState(initial.sortParam);
  const [loadingMore, setLoadingMore] = useState(false);
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [selectedRelations, setSelectedRelations] = useState(initial.selectedRelations);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileQ, setMobileQ] = useState("");
  const [sortDraft, setSortDraft] = useState(null);

  // Track effect setup count to skip Strict Mode double-mount
  const filterEffectSetupCountRef = useRef(0);

  // Sync URL when state changes — this is the single sync point
  // replace: true for automatic syncs (pagination), false for explicit user actions (search, filter, sort, category)
  const syncUrl = useCallback((updates = {}, replace = true) => {
    const nextParams = new URLSearchParams();

    const nextPage = updates.page ?? page;
    const nextPageSize = updates.pageSize ?? pageSize;
    const nextSearchText = updates.searchText ?? searchText;
    const nextCategory = updates.category ?? category;
    const nextSortParam = updates.sortParam ?? sortParam;
    const nextSelectedRelations = updates.selectedRelations ?? selectedRelations;

    nextParams.set("page", String(nextPage)); // Always include page (even page=1) for explicit URL state
    if (nextPageSize !== getPageSizePreference(accountKey)) nextParams.set("size", String(nextPageSize));
    if (nextSearchText) nextParams.set("q", nextSearchText);
    if (nextCategory !== "all") nextParams.set("cat", nextCategory);
    if (nextSortParam) nextParams.set("sort", nextSortParam);
    if (nextSelectedRelations?.length) nextParams.set("rel", nextSelectedRelations.join(","));

    setSearchParams(nextParams, { replace });
  }, [page, pageSize, searchText, category, sortParam, selectedRelations, setSearchParams, accountKey]);

  // Handle browser back/forward — sync state from URL
  const isFirstUrlSyncRef = useRef(true);
  useEffect(() => {
    // Skip first render - initial state already set from searchParams
    if (isFirstUrlSyncRef.current) {
      isFirstUrlSyncRef.current = false;
      return;
    }
    const next = getInitialState(searchParams);
    // Only update state that actually changed to avoid unnecessary fetches
    let changed = false;
    if (next.page !== page) { setPage(next.page); changed = true; }
    if (next.pageSize !== pageSize) { setPageSize(next.pageSize); changed = true; }
    if (next.searchText !== searchText) { setSearchText(next.searchText); changed = true; }
    if (next.category !== category) { setCategory(next.category); changed = true; }
    if (next.sortParam !== sortParam) { setSortParam(next.sortParam); changed = true; }
    if (JSON.stringify(next.selectedRelations) !== JSON.stringify(selectedRelations)) {
      setSelectedRelations(next.selectedRelations);
      changed = true;
    }
  }, [searchParams]);

  // Sync URL when page or pageSize changes (but not on initial mount)
  const isFirstPageSyncRef = useRef(true);
  useEffect(() => {
    if (isFirstPageSyncRef.current) {
      isFirstPageSyncRef.current = false;
      return;
    }
    syncUrl({ page, pageSize });
  }, [page, pageSize, syncUrl]);

  // Page size is chosen up front (getNetworkPageSize in the pageSize
  // initializer above). We intentionally do NOT poll/re-shuffle it here:
  // changing pageSize mid-list resets the loaded data and triggers fresh
  // fetches, which on 3G/4G looks like "everything reloads". The backend's
  // pageable.size still syncs per fetch (fetchList), so the list adapts
  // without wiping state on network fluctuations.
  useEffect(() => {
    if (!isCompact) return;
  }, [isCompact]);

  // Sort applies only via Show — picking chips just stages the choice.
  useEffect(() => {
    if (filterOpen) setSortDraft(sortParam);
  }, [filterOpen]);

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
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);
  const fetchList = async (pageNum, append = false) => {
    const id = ++reqIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (!append) setLoading(true);
    try {
      const res = await api.connectionsPaged(
        pageNum - 1, pageSize, searchText, category, selectedRelations, sortParam, !isCompact, ctrl.signal
      );
      if (id !== reqIdRef.current) return;
      const mapped = res.data.content.map(mapContact);
      const nextTotal = res.data.totalElements;
      const actualPageSize = res.data.pageable?.size || pageSize;
      setDataSource((prev) => {
        const next = append ? [...prev, ...mapped] : mapped;
        const prevCache = contactsCache.get(accountKey) || {};
        contactsCache.set(accountKey, {
          ...prevCache,
          searchText, category, selectedRelations, sortParam, isCompact,
          pageSize: actualPageSize, format,
          page: pageNum, dataSource: next, totalItems: nextTotal,
          scrollY: prevCache.scrollY,
        });
        return next;
      });
      if (actualPageSize !== pageSize) {
        setPageSize(actualPageSize);
        setPageSizePreference(accountKey, actualPageSize);
        syncUrl({ pageSize: actualPageSize });
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

  // Reset + load first page when anything filter-ish changes.
  const prevSearchRef = useRef(searchText);
  const syncUrlRef = useRef(syncUrl);
  syncUrlRef.current = syncUrl;
  useEffect(() => {
    filterEffectSetupCountRef.current++;
    // Skip first two setups (Strict Mode double-mount in dev)
    if (filterEffectSetupCountRef.current <= 2) {
      return;
    }
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
        setDataSource(cached.dataSource || []);
        setTotalItems(cached.totalItems ?? 0);
        setCounts(cached.counts || { all: 0, family: 0, inlaws: 0, others: 0 });
        setRelationOptions(cached.relationOptions || []);
        setLoading(false);
        const savedScrollY = cached.scrollY;
        if (savedScrollY) {
          setTimeout(() => window.scrollTo(0, savedScrollY), 0);
        }
        return;
      }
      setLoadingMore(false);
      setPage(1);
      syncUrlRef.current({ page: 1 });
      fetchList(1, false);
    }, delay);
    return () => clearTimeout(handler);
  }, [searchText, category, selectedRelations, pageSize, sortParam, isCompact, format]);

  // Reset page/size only when the signed-in account actually changes
  const prevAccountKeyRef = useRef(accountKey);
  useEffect(() => {
    if (prevAccountKeyRef.current === accountKey) return;
    prevAccountKeyRef.current = accountKey;
    const newPageSize = getPageSizePreference(accountKey);
    setPageSize(newPageSize);
    setPage(1);
    syncUrl({ pageSize: newPageSize, page: 1 });
  }, [accountKey, syncUrl]);

  // Desktop: each pagination click replaces the list with that page.
  // Compact/mobile: appended pages feed the infinite-scroll Virtuoso list.
  useEffect(() => {
    if (page === 1) {
      setLoading(true);
      fetchList(1, false).finally(() => {
        setLoading(false);
      });
    } else {
      setLoadingMore(true);
      fetchList(page, isCompact).finally(() => {
        setLoadingMore(false);
      });
    }
  }, [page]);

  useEffect(() => {
    return () => {
      const cached = contactsCache.get(accountKey);
      if (cached) {
        contactsCache.set(accountKey, { ...cached, scrollY: window.scrollY });
      }
      if (abortRef.current) abortRef.current.abort();
    };
  }, [accountKey]);

  const prevCountSearchRef = useRef(searchText);
  useEffect(() => {
    const ctrl = new AbortController();
    const searchChanged = prevCountSearchRef.current !== searchText;
    prevCountSearchRef.current = searchText;
    const delay = searchChanged ? SEARCH_DEBOUNCE_MS : 0;
    const handler = setTimeout(async () => {
      const cached = contactsCache.get(accountKey);
      const countsCacheMatches = !!cached
        && cached.searchText === searchText
        && cached.isCompact === isCompact
        && cached.counts
        && cached.relationOptions;
      if (countsCacheMatches) {
        setCounts(cached.counts);
        setRelationOptions(cached.relationOptions);
        return;
      }
      try {
        const [cRes, rRes] = await Promise.all([
          api.connectionCounts(searchText, !isCompact, ctrl.signal),
          api.connectionRelations(searchText, !isCompact, ctrl.signal),
        ]);
        const nextCounts = {
          all: cRes.data?.all ?? 0,
          family: cRes.data?.family ?? 0,
          inlaws: cRes.data?.inlaws ?? 0,
          others: cRes.data?.others ?? 0,
        };
        const nextRelations = rRes.data || [];
        setCounts(nextCounts);
        setRelationOptions(nextRelations);
        const prev = contactsCache.get(accountKey) || {};
        contactsCache.set(accountKey, {
          ...prev,
          searchText, isCompact,
          counts: nextCounts, relationOptions: nextRelations,
        });
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
        setCounts({ all: 0, family: 0, inlaws: 0, others: 0 });
        setRelationOptions([]);
      }
    }, delay);
    return () => { clearTimeout(handler); ctrl.abort(); };
  }, [searchText, isCompact]);

  const changeCategory = (v) => {
    setSelectedRelations([]);
    setCategory(v);
    syncUrl({ category: v, selectedRelations: [], page: 1 }, false);
  };

  const filtered = dataSource;
  const hasMore = dataSource.length < totalItems;

  const loadMore = useCallback(() => {
    if (isCompact && hasMore && !loading && !loadingMore) {
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      syncUrl({ page: nextPage }, false);
    }
  }, [isCompact, hasMore, loading, loadingMore, page, syncUrl]);

  const openContact = useCallback((rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.username || rec.email)}`, { state: { contact: rec } });
  }, [navigate]);

  const renderCompactRow = useCallback(
    (_index, rec) => (
      <ContactRow rec={rec} onOpen={openContact} onEdit={setEditingContact} />
    ),
    [openContact]
  );

  const sortOptions = [
    { value: "name,asc", label: "Name A–Z" },
    { value: "name,desc", label: "Name Z–A" },
    { value: "username,asc", label: "Username A–Z" },
    { value: "username,desc", label: "Username Z–A" },
  ];

  const handleSortChange = (v) => {
    const nextSort = v || null;
    setSortParam(nextSort);
    syncUrl({ sort: nextSort, page: 1 }, false);
  };

  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
  };

  const handleSearchSubmit = () => {
    syncUrl({ searchText, page: 1 }, false);
  };

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
            onChange={handleSearchChange}
            onPressEnter={handleSearchSubmit}
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
                  onChange={handleSortChange}
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
                onClick={() => {
                  setSortParam(null);
                  syncUrl({ sort: null, page: 1 }, false);
                }}
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
                onClick={() => {
                  const nextRelations = selectedRelations.filter((k) => k !== r);
                  setSelectedRelations(nextRelations);
                  syncUrl({ selectedRelations: nextRelations, page: 1 }, false);
                }}
              >
                <RelationChip relation={r} style={{ fontSize: 11 }} />
                <FontAwesomeIcon icon={faXmark} className="nw-mfilter-active-x" />
              </button>
            ))}
            <button className="nw-mfilter-active-clear" onClick={() => {
              setSelectedRelations([]);
              setSortParam(null);
              syncUrl({ selectedRelations: [], sort: null, page: 1 }, false);
            }}>
              Clear all
            </button>
          </div>
        )}
      </div>

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
            current={page}
            pageSize={pageSize}
            total={totalItems}
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
            showSizeChanger
            pageSizeOptions={pageSizeOptionsForTotal(totalItems, PAGE_SIZE_OPTIONS_LIMITED)}
            showQuickJumper
            showLessItems
            size="small"
            onChange={(pg, newPageSize) => {
              // Ignore Pagination mount calls (Ant Design may call onChange during render)
              if (isRenderingRef.current) return;
              const nextPageSize = Number(newPageSize);
              if (nextPageSize !== pageSize) {
                setPageSizePreference(accountKey, nextPageSize);
                setPageSize(nextPageSize);
                setPage(1);
                syncUrl({ pageSize: nextPageSize, page: 1 }, false);
                return;
              }
              setPage(pg);
              syncUrl({ page: pg }, false);
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
                        prev.includes(o.value)
                          ? prev.filter((k) => k !== o.value)
                          : [...prev, o.value]
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
          <button className="nw-relation-filter-btn reset" onClick={() => {
            setSelectedRelations([]);
            setSortDraft(sortParam);
          }}>
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button className="nw-relation-filter-btn apply" onClick={() => {
            setSortParam(sortDraft);
            syncUrl({ sort: sortDraft, selectedRelations, page: 1 }, false);
            setFilterOpen(false);
          }}>
            Show{selectedRelations.length > 0 ? ` (${selectedRelations.length})` : ""}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default ContactsPage;