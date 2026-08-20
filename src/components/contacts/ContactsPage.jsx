import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Spin, Avatar, Empty, Table, Button, Tooltip } from "antd";
import { SearchOutlined, EditOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import RelationChip from "../shared/RelationChip";
import EditRelationModal from "../shared/EditRelationModal";
import "./../../components/css/contacts-page.css";

const PAGE_SIZE = 40;

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
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [editingContact, setEditingContact] = useState(null);
  const sentinelRef = useRef(null);
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

  const fetchConnections = async (search = "") => {
    setLoading(true);
    try {
      const res = await api.connections(search);
      setDataSource(res.data.map(mapContact));
      setVisible(PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => fetchConnections(searchText), 350);
    return () => clearTimeout(handler);
  }, [searchText, refreshKey]);

  const counts = useMemo(() => {
    const c = { all: dataSource.length, family: 0, friends: 0, others: 0 };
    for (const rec of dataSource) c[categoryOf(rec.relation)] += 1;
    return c;
  }, [dataSource]);

  const filtered = useMemo(() => {
    if (category === "all") return dataSource;
    return dataSource.filter((rec) => categoryOf(rec.relation) === category);
  }, [dataSource, category]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [filtered.length]);

  const openContact = (rec) => {
    navigate(`/contacts/${encodeURIComponent(rec.email)}`, { state: { contact: rec } });
  };

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
            {dataSource.length > 0
              ? `${dataSource.length} ${dataSource.length === 1 ? "person" : "people"} in your network`
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
        <div className="nw-state-box">
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
      ) : isCompact ? (
        <div className="nw-list-pane nw-list-pane-full">
          <div className="nw-list">
            {shown.map((rec) => (
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
            {visible < filtered.length && (
              <div ref={sentinelRef} className="nw-load-more">
                <Spin size="small" /> Loading more...
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="nw-table-panel">
          <Table
            columns={tableColumns}
            dataSource={tableData}
            rowKey="_rowKey"
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `${t} contacts` }}
            className="nw-table"
            size="middle"
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