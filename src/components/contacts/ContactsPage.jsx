import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input, Spin, Avatar, Empty, Table, Button, Tooltip, Pagination, Modal, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlass, faXmark, faFilter, faCheck, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import RelationChip from "../shared/RelationChip";
import EditRelationModal from "../shared/EditRelationModal";

function mapContact(item, idx) {
  return {
    key: idx,
    name: item.suggestedUserName || "",
    email: item.suggestedUserEmail || "",
    phone: item.suggestedUserPhone || "",
    profilePicture: item.suggestedUserProfilePic || null,
    relation: item.inferredRelation || "",
    relationId: item.pendingRelationId ?? null,
    gender: item.suggestedUserGender || null,
    birthDate: item.suggestedUserBirthDate || null,
  };
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "family", label: "Family" },
  { key: "inlaws", label: "In-Laws" },
  { key: "others", label: "Others" },
];

function ContactsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { key: refreshKey, bump } = useRefresh();

  // Coming from Requests accept → open the tab where the contact landed
  useEffect(() => {
    const c = location.state?.category;
    if (c) {
      setSelectedRelations([]);
      setCategory(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 1024px)").matches);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia("(max-width: 399px)").matches);
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [counts, setCounts] = useState({ all: 0, family: 0, inlaws: 0, others: 0 });
  const [relationOptions, setRelationOptions] = useState([]);
  const [editingContact, setEditingContact] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortParam, setSortParam] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef(null);
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [selectedRelations, setSelectedRelations] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileQ, setMobileQ] = useState("");

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
  }, [category, dataSource.length, isNarrow, visibleCategories.length]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 399px)");
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Server list: paging + category + relations + sort all in backend.
  // reqIdRef drops stale responses (fast filter changes must not overwrite newer results).
  const reqIdRef = useRef(0);
  const fetchList = async (pageNum, append = false) => {
    const id = ++reqIdRef.current;
    if (!append) setLoading(true);
    try {
      const res = await api.connectionsPaged(
        pageNum, pageSize, searchText, category, selectedRelations, sortParam
      );
      if (id !== reqIdRef.current) return; // stale — a newer request is in flight
      const mapped = res.data.content.map(mapContact);
      setDataSource((prev) => (append ? [...prev, ...mapped] : mapped));
      setTotalItems(res.data.totalElements);
    } catch {
      if (!append && id === reqIdRef.current) {
        setDataSource([]);
        setTotalItems(0);
      }
    } finally {
      if (!append && id === reqIdRef.current) setLoading(false);
    }
  };

  // Latest page value for timeouts (avoids stale closures)
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  // Skip only the very first mount fetch (reset effect below does it)
  const firstMountRef = useRef(true);
  // True while the reset effect's own page-0 fetch is authoritative,
  // so the page effect doesn't fire a duplicate for the same page
  const resetFetchRef = useRef(false);

  // Reset + load first page when anything filter-ish changes.
  // Always fetches page 0 directly: on mobile the page effect skips page 0,
  // so delegating via setPage(0) alone would leave the stale list in place.
  useEffect(() => {
    const handler = setTimeout(() => {
      setLoadingMore(false);
      firstMountRef.current = false;
      resetFetchRef.current = true;
      setPage(0);
      fetchList(0, false);
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, category, selectedRelations, pageSize, sortParam, refreshKey, isCompact]);

  // Desktop page turns — including back to first page
  useEffect(() => {
    if (isCompact) return;
    if (page === 0 && (firstMountRef.current || resetFetchRef.current)) {
      firstMountRef.current = false;
      resetFetchRef.current = false;
      return;
    }
    resetFetchRef.current = false;
    fetchList(page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Mobile: append next page
  useEffect(() => {
    if (!isCompact || page === 0) return;
    setLoadingMore(true);
    fetchList(page, true).finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Server counts for tabs/dropdown + relation options for filters
  useEffect(() => {
    const handler = setTimeout(async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          api.connectionCounts(searchText),
          api.connectionRelations(searchText),
        ]);
        setCounts({
          all: cRes.data?.all ?? 0,
          family: cRes.data?.family ?? 0,
          inlaws: cRes.data?.inlaws ?? 0,
          others: cRes.data?.others ?? 0,
        });
        setRelationOptions(rRes.data || []);
      } catch {
        setCounts({ all: 0, family: 0, inlaws: 0, others: 0 });
        setRelationOptions([]);
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [searchText, refreshKey]);

  // Switching tabs starts a fresh filter context (stale relation sub-filter
  // would otherwise combine with the new tab and show confusing results)
  const changeCategory = (v) => {
    setSelectedRelations([]);
    setCategory(v);
  };

  // Server already filtered + paged; nothing left to do client-side
  const filtered = dataSource;
  const hasMore = dataSource.length < totalItems;

  // Mobile: infinite scroll sentinel
  useEffect(() => {
    if (!isCompact || !hasMore) return;
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore) setPage((p) => p + 1);
      },
      { rootMargin: "240px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isCompact, hasMore, dataSource.length, loading, loadingMore]);

  const openContact = (rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.email)}`, { state: { contact: rec } });
  };

  const sortOrderFor = (key) => {
    if (!sortParam) return null;
    const [f, d] = sortParam.split(",");
    return f === key ? (d === "asc" ? "ascend" : "descend") : null;
  };

  function RelationFilterDropdown({ setSelectedKeys, selectedKeys, confirm, clearFilters, options }) {
    const [q, setQ] = useState("");
    const opts = options || [];
    const list = opts.filter((o) =>
      o.value.toLowerCase().includes(q.trim().toLowerCase())
    );
    const toggle = (v) => {
      const next = selectedKeys.includes(v)
        ? selectedKeys.filter((k) => k !== v)
        : [...selectedKeys, v];
      setSelectedKeys(next);
    };
    return (
      <div className="nw-relation-filter" onClick={(e) => e.stopPropagation()}>
        <div className="nw-relation-filter-head">
          <span className="nw-relation-filter-title">
            <FontAwesomeIcon icon={faFilter} className="nw-relation-filter-title-icon" />
            Filter by Relation
          </span>
          {selectedKeys.length > 0 && (
            <span className="nw-relation-filter-badge">{selectedKeys.length} selected</span>
          )}
        </div>
        <div className="nw-relation-filter-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="nw-relation-filter-search-icon" />
          <input
            autoFocus
            placeholder="Search relations..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="nw-relation-filter-clear-q" onClick={() => setQ("")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <div className="nw-relation-filter-list">
          {list.length === 0 ? (
            <div className="nw-relation-filter-empty">
              {opts.length === 0 ? "No relations found" : "No match for search"}
            </div>
          ) : (
            list.map((o) => {
              const checked = selectedKeys.includes(o.value);
              return (
                <button
                  key={o.value}
                  className={`nw-relation-filter-item${checked ? " checked" : ""}`}
                  onClick={() => toggle(o.value)}
                >
                  <span className={`nw-relation-check${checked ? " checked" : ""}`}>
                    {checked && <FontAwesomeIcon icon={faCheck} />}
                  </span>
                  <span className="nw-relation-filter-item-label">
                    <RelationChip relation={o.value} style={{ fontSize: 11 }} />
                  </span>
                  <span className="nw-relation-filter-count">{o.count}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="nw-relation-filter-footer">
          <button
            className="nw-relation-filter-btn reset"
            onClick={() => {
              setQ("");
              if (clearFilters) clearFilters();
              confirm();
            }}
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button
            className="nw-relation-filter-btn apply"
            onClick={() => confirm()}
          >
            Apply{selectedKeys.length > 0 ? ` (${selectedKeys.length})` : ""}
          </button>
        </div>
      </div>
    );
  }

  const tableColumns = [
    {
      title: "Photo",
      className: "col-photo",
      dataIndex: "profilePicture",
      key: "profilePicture",
      width: 70,
      render: (pic, record) => (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Avatar
            size={42}
            src={pic || null}
            style={{ backgroundColor: pic ? "transparent" : "#3b82f6", fontSize: 17 }}
          >
            {!pic && record.name?.charAt(0).toUpperCase()}
          </Avatar>
        </div>
      ),
    },
    {
      title: "Name",
      className: "col-name",
      dataIndex: "name",
      key: "name",
      sorter: true,
      sortOrder: sortOrderFor("name"),
      render: (name) => <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{name}</span>,
    },
    {
      title: "Phone Number",
      className: "col-phone",
      dataIndex: "phone",
      key: "phone",
      sorter: true,
      sortOrder: sortOrderFor("phone"),
      render: (phone) => <span style={{ color: "#94a3b8" }}>{phone || "—"}</span>,
    },
    {
      title: "Email",
      className: "col-email",
      dataIndex: "email",
      key: "email",
      sorter: true,
      sortOrder: sortOrderFor("email"),
      render: (email) => <span style={{ color: "#94a3b8" }}>{email || "—"}</span>,
    },
    {
      title: "Relation",
      className: "col-relation",
      dataIndex: "relation",
      key: "relation",
      sorter: true,
      sortOrder: sortOrderFor("relation"),
      filteredValue: selectedRelations,
      filterDropdown: (props) => <RelationFilterDropdown {...props} options={relationOptions} />,
      filterIcon: (filtered) => (
        <span className={`nw-filter-icon${filtered ? " active" : ""}`}>
          <FontAwesomeIcon icon={faFilter} />
          {filtered && <span className="nw-filter-dot" />}
        </span>
      ),
      filterMultiple: true,
      filterDropdownProps: { overlayClassName: "nw-relation-filter-overlay" },
      render: (relation) => <RelationChip relation={relation} style={{ fontSize: 12 }} />,
    },
    {
      title: "Actions",
      className: "col-actions",
      key: "actions",
      width: 70,
      render: (_, record) => (
        <Tooltip title="Edit Relation">
          <Button
            size="small"
            type="text"
            icon={<FontAwesomeIcon icon={faPenToSquare} style={{ color: "#94a3b8", fontSize: 14 }} />}
            onClick={() => setEditingContact(record)}
          />
        </Tooltip>
      ),
    },
  ];

  const tableData = useMemo(
    () => filtered.map((rec, i) => ({ ...rec, _rowKey: `${page}-${i}` })),
    [filtered, page]
  );

  const handleTableChange = (pag, filters, sorter) => {
    setSelectedRelations(filters.relation || []);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    setSortParam(s && s.order ? `${s.columnKey},${s.order === "ascend" ? "asc" : "desc"}` : null);
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div className="nw-title-row">
          <h1 className="nw-page-title">My Contacts</h1>
          <p className="nw-page-subtitle">
            {totalItems > 0
              ? `${totalItems} ${totalItems === 1 ? "person" : "people"} in your network`
              : "People connected with you"}
          </p>
        </div>
        <div className="nw-tools">
          {isNarrow ? (
            <Select
              className="nw-category-select auth-input"
              value={category}
              onChange={(v) => changeCategory(v)}
              options={visibleCategories.map((c) => ({
                value: c.key,
                label: `${c.label} (${counts[c.key] ?? 0})`,
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
                  <span className="nw-chip-count">{counts[c.key]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="nw-search-row">
            <Input
              className="nw-search"
              prefix={<FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#64748b" }} />}
              placeholder="Search contacts..."
              allowClear={{ clearIcon: <FontAwesomeIcon icon={faXmark} style={{ color: "#64748b", fontSize: 12 }} /> }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {isCompact && (
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
            )}
          </div>
        </div>
        {isCompact && selectedRelations.length > 0 && (
          <div className="nw-mfilter-active">
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
            <button className="nw-mfilter-active-clear" onClick={() => setSelectedRelations([])}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading contacts...</span></div>
      ) : filtered.length === 0 ? (
        <div className="nw-table-panel nw-table-empty">
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
      ) : isCompact ? (
        <div className="nw-list-pane nw-list-pane-full">
          <div className="nw-list">
            {filtered.map((rec) => (
              <button
                className="nw-list-row"
                key={rec.email || rec.key}
                onClick={() => openContact(rec)}
              >
                <Avatar
                  size={44}
                  src={rec.profilePicture || null}
                  style={{ backgroundColor: rec.profilePicture ? "transparent" : "#3b82f6", fontSize: 17, flexShrink: 0 }}
                >
                  {!rec.profilePicture && rec.name?.charAt(0).toUpperCase()}
                </Avatar>
                <span className="nw-list-info">
                  <span className="nw-list-name">{rec.name}</span>
                  <span className="nw-list-sub">{rec.phone || rec.email}</span>
                </span>
                <RelationChip relation={rec.relation} style={{ flexShrink: 0, fontSize: 11 }} />
              </button>
            ))}
          </div>
          {hasMore && <div ref={loaderRef} className="nw-list-sentinel" aria-hidden="true" />}
          {loadingMore ? (
            <div className="nw-list-loader">
              <Spin size="small" />
              <span>Loading more contacts...</span>
            </div>
          ) : (
            !hasMore && <div className="nw-list-end">No more contacts</div>
          )}
        </div>
      ) : (
        <div className="nw-table-panel">
          <Table
            columns={tableColumns}
            dataSource={tableData}
            rowKey="_rowKey"
            pagination={false}
            className="nw-table"
            size="middle"
            onChange={handleTableChange}
          />
        </div>
      )}
      {!loading && !isCompact && totalItems > pageSize && (
        <div className="nw-table-pagination">
          <Pagination
            current={page + 1}
            pageSize={pageSize}
            total={totalItems}
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
            showSizeChanger
            pageSizeOptions={["10", "20", "50", "100"]}
            showQuickJumper
            showLessItems
            size="small"
            onChange={(pg, newPageSize) => {
              setPage(pg - 1);
              if (newPageSize !== pageSize) setPageSize(newPageSize);
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
            editingContact.relation = newRel;
            bump();
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
                    <span className="nw-relation-filter-count">{o.count}</span>
                  </button>
                );
              })
          )}
        </div>
        <div className="nw-mfilter-footer">
          <button className="nw-relation-filter-btn reset" onClick={() => setSelectedRelations([])}>
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button className="nw-relation-filter-btn apply" onClick={() => setFilterOpen(false)}>
            Show{selectedRelations.length > 0 ? ` (${selectedRelations.length})` : ""}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default ContactsPage;