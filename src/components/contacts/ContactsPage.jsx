import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Spin, Avatar, Empty, Table, Button, Tooltip, Pagination } from "antd";
import { SearchOutlined, EditOutlined } from "@ant-design/icons";
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

  useEffect(() => {
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
  }, [category, dataSource.length]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (e) => setIsCompact(e.matches);
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
    if (category === "all") return dataSource;
    return dataSource.filter((rec) => categoryOf(rec.relation) === category);
  }, [dataSource, category]);

  const openContact = (rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.email)}`, { state: { contact: rec } });
  };

  useEffect(() => { setPage(0); }, [category, searchText]);

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
      filters: [...new Set(dataSource.map(item => item.relation).filter(Boolean))].map(r => ({
        text: r, value: r
      })),
      onFilter: (value, record) => record.relation === value,
      filterMultiple: true,
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
            icon={<EditOutlined style={{ color: "#94a3b8", fontSize: 14 }} />}
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
          <Input
            className="nw-search"
            prefix={<SearchOutlined style={{ color: "#64748b" }} />}
            placeholder="Search contacts..."
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
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
    </div>
  );
}

export default ContactsPage;