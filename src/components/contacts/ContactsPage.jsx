import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  };
}

function categoryOf(relation) {
  const r = (relation || "").toLowerCase();
  if (r.includes("friend")) return "friends";
  if (
    r.includes("brother") || r.includes("sister") || r.includes("father") || r.includes("mother") ||
    r.includes("son") || r.includes("daughter") || r.includes("grand") || r.includes("uncle") ||
    r.includes("aunt") || r.includes("husband") || r.includes("wife") || r.includes("in-law") ||
    r.includes("nephew") || r.includes("niece") || r.includes("cousin")
  ) return "family";
  return "others";
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "family", label: "Family" },
  { key: "friends", label: "Friends" },
  { key: "others", label: "Others" },
];

function ContactsPage() {
  const navigate = useNavigate();
  const { key: refreshKey } = useRefresh();

  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 1024px)").matches);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia("(max-width: 399px)").matches);
  const [dataSource, setDataSource] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [editingContact, setEditingContact] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const chipsRef = useRef(null);
  const chipRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [selectedRelations, setSelectedRelations] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileQ, setMobileQ] = useState("");

  useEffect(() => {
    if (isNarrow) return;
    const activeIdx = CATEGORIES.findIndex((c) => c.key === category);
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
  }, [category, dataSource.length, isNarrow]);

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

  const fetchConnections = async (search = "", pageNum = 0, size = 10) => {
    setLoading(true);
    try {
      const res = await api.connectionsPaged(pageNum, size, search);
      const mapped = res.data.content.map(mapContact);
      setDataSource(mapped);
      setTotalItems(res.data.totalElements);
    } catch {
      setDataSource([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => fetchConnections(searchText, 0, pageSize), 350);
    return () => clearTimeout(handler);
  }, [searchText, pageSize, refreshKey]);

  useEffect(() => {
    fetchConnections(searchText, page, pageSize);
  }, [page, category]);

  const counts = useMemo(() => {
    const c = { all: dataSource.length, family: 0, friends: 0, others: 0 };
    for (const rec of dataSource) c[categoryOf(rec.relation)] += 1;
    return c;
  }, [dataSource]);

  const filtered = useMemo(() => {
    let out = category === "all" ? dataSource : dataSource.filter((rec) => categoryOf(rec.relation) === category);
    if (isCompact && selectedRelations.length > 0) {
      out = out.filter((rec) => selectedRelations.includes(rec.relation));
    }
    return out;
  }, [dataSource, category, isCompact, selectedRelations]);

  const openContact = (rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.email)}`, { state: { contact: rec } });
  };

  useEffect(() => { setPage(0); }, [category, searchText, selectedRelations]);

  const relationOptions = useMemo(() => {
    const map = {};
    for (const item of dataSource) {
      const r = item.relation;
      if (!r) continue;
      map[r] = (map[r] || 0) + 1;
    }
    return Object.entries(map)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [dataSource]);

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
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name) => <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{name}</span>,
    },
    {
      title: "Phone Number",
      className: "col-phone",
      dataIndex: "phone",
      key: "phone",
      sorter: (a, b) => (a.phone || "").localeCompare(b.phone || ""),
      render: (phone) => <span style={{ color: "#94a3b8" }}>{phone || "—"}</span>,
    },
    {
      title: "Email",
      className: "col-email",
      dataIndex: "email",
      key: "email",
      sorter: (a, b) => (a.email || "").localeCompare(b.email || ""),
      render: (email) => <span style={{ color: "#94a3b8" }}>{email || "—"}</span>,
    },
    {
      title: "Relation",
      className: "col-relation",
      dataIndex: "relation",
      key: "relation",
      filterDropdown: (props) => <RelationFilterDropdown {...props} options={relationOptions} />,
      filterIcon: (filtered) => (
        <span className={`nw-filter-icon${filtered ? " active" : ""}`}>
          <FontAwesomeIcon icon={faFilter} />
          {filtered && <span className="nw-filter-dot" />}
        </span>
      ),
      onFilter: (value, record) => record.relation === value,
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

  const tableData = useMemo(() => filtered.map((rec, i) => ({ ...rec, _rowKey: i })), [filtered]);

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
              onChange={(v) => setCategory(v)}
              options={CATEGORIES.map((c) => ({
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
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.key}
                  ref={(el) => (chipRefs.current[i] = el)}
                  className={category === c.key ? "nw-chip active" : "nw-chip"}
                  onClick={() => setCategory(c.key)}
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
                    ? `No ${category} contacts yet`
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
                key={rec.key}
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
          />
        </div>
      )}
      {!loading && filtered.length > 0 && !isCompact && (
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
            setDataSource((ds) => ds.map((r) => (r.key === editingContact.key ? { ...r, relation: newRel } : r)));
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