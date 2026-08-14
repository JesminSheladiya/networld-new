import {
    Table,
    Button,
    Modal,
    Input,
    Space,
    Typography,
    Card,
    Layout,
    ConfigProvider,
    theme,
    Select,
    message,
    Spin,
    Tag,
    Tooltip,
    Row,
    Col,
    Avatar,
    Tabs,
} from "antd";
import { BellOutlined, ArrowRightOutlined, SearchOutlined, BulbOutlined, TeamOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { http } from "../Services/https";
import "./css/ContactsTable.css";
import { getInverseRelation } from "./UserProfile";

const { Content } = Layout;

function ContactsTable({ refreshTrigger }) {
    const [dataSource, setDataSource] = useState([]);
    const [connections, setConnections] = useState([]);
    const [relations, setRelations] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [searchText, setSearchText] = useState("");
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    const BASE = process.env.REACT_APP_API_URL?.replace("/api/contacts", "/api") || "http://localhost:8080/api";
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api/contacts";

    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [relMap, setRelMap] = useState({});
    const [sendingMap, setSendingMap] = useState({});
    const [sentMap, setSentMap] = useState({});

    const [userSuggestions, setUserSuggestions] = useState([]);
    const [userSuggestLoading, setUserSuggestLoading] = useState(false);
    const [editingSuggestionEmail, setEditingSuggestionEmail] = useState(null);
    const [editRelationValue, setEditRelationValue] = useState("");
    const [isCustomRelation, setIsCustomRelation] = useState(false);
    const [customRelationText, setCustomRelationText] = useState("");

    const [pending, setPending] = useState([]);
    const [pendingLoading, setPendingLoading] = useState(false);

    const [editingConnection, setEditingConnection] = useState(null);
    const [editConnRelValue, setEditConnRelValue] = useState("");
    const [isConnCustom, setIsConnCustom] = useState(false);
    const [connCustomText, setConnCustomText] = useState("");
    const [savingConn, setSavingConn] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            messageApi.error("Please login first!");
            return;
        }
        fetchRelations();
        fetchUserSuggestions();
        fetchPending();
    }, [refreshTrigger]);

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchConnections(searchText);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchText, refreshTrigger]);

    const fetchConnections = async (search = "") => {
        setLoading(true);
        try {
            const response = await http.get(`${BASE}/user-relations/connections`, {
                params: search.trim() ? { query: search.trim() } : {},
            });
            const mapped = response.data.map((item, idx) => ({
                key: idx,
                name: item.suggestedUserName || "",
                email: item.suggestedUserEmail || "",
                phone: item.suggestedUserPhone || "",
                profilePicture: item.suggestedUserProfilePic || null,
                relation: item.inferredRelation || "",
                relationId: item.pendingRelationId ?? null,
            }));
            setConnections(response.data);
            setDataSource(mapped);
        } catch (error) {
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                messageApi.error("Failed to load connections!");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchRelations = async () => {
        try {
            const response = await http.get(`${API_URL}/relations`);
            setRelations(response.data);
        } catch (error) {
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                messageApi.error("Failed to load relations!");
            }
        }
    };

    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setSearching(false);
            setSearchResults([]);
            return;
        }
        const handler = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await http.get(`${BASE}/user-relations/search-users?query=${encodeURIComponent(q)}`);
                setSearchResults(res.data);
            } catch { messageApi.error("Search failed!"); }
            finally { setSearching(false); }
        }, 400);
        return () => clearTimeout(handler);
    }, [query]);

    const sendUserRequest = async (email) => {
        if (!relMap[email]) { messageApi.warning("Select a relation first!"); return; }
        setSendingMap(p => ({ ...p, [email]: true }));
        try {
            await http.post(`${BASE}/user-relations/send`, { toEmail: email, relationId: relMap[email] });
            setSentMap(p => ({ ...p, [email]: true }));
            messageApi.success("Request sent!");
        } catch (e) { messageApi.error(e.response?.data?.message || "Failed!"); }
        finally { setSendingMap(p => ({ ...p, [email]: false })); }
    };

    const fetchUserSuggestions = async () => {
        setUserSuggestLoading(true);
        try {
            const res = await http.get(`${BASE}/user-relations/suggestions`);
            setUserSuggestions(res.data);
        } catch { messageApi.error("Failed to load suggestions!"); }
        finally { setUserSuggestLoading(false); }
    };

    const fetchPending = async () => {
        setPendingLoading(true);
        try {
            const p = await http.get(`${BASE}/user-relations/pending`);
            setPending(p.data);
        } catch { messageApi.error("Failed to load pending requests!"); }
        finally { setPendingLoading(false); }
    };

    const acceptPending = async (id) => { 
        try { 
            await http.post(`${BASE}/user-relations/${id}/accept`); 
            messageApi.success("Relation accepted!");
            fetchPending(); 
            fetchConnections();
            fetchUserSuggestions();
        } catch { 
            messageApi.error("Failed!"); 
        } 
    };

    const declinePending = async (id) => { 
        try { 
            await http.post(`${BASE}/user-relations/${id}/decline`); 
            fetchPending(); 
        } catch { 
            messageApi.error("Failed!"); 
        } 
    };

    const sendSuggestionRequest = async (s) => {
        try {
            await http.post(`${BASE}/user-relations/suggestions/send`, {
                otherEmail: s.suggestedUserEmail, relationName: s.inferredRelation,
            });
            setUserSuggestions(p => p.filter(x => x.suggestedUserEmail !== s.suggestedUserEmail));
            messageApi.success("Request sent!");
        } catch { messageApi.error("Failed!"); }
    };

    const dismissUserSuggestion = async (s) => {
        try {
            await http.delete(`${BASE}/user-relations/suggestions/${s.pendingRelationId}/dismiss`);
            setUserSuggestions(p => p.filter(x => x.suggestedUserEmail !== s.suggestedUserEmail));
        } catch { messageApi.error("Failed to dismiss!"); }
    };

    const handleStartEdit = (s) => {
        setEditingSuggestionEmail(s.suggestedUserEmail);
        const rel = s.inferredRelation || "";
        const isPredefined = relations.some(r => r.relationName.toLowerCase() === rel.toLowerCase());
        if (isPredefined) {
            setEditRelationValue(rel);
            setIsCustomRelation(false);
            setCustomRelationText("");
        } else {
            setEditRelationValue("Custom");
            setIsCustomRelation(true);
            setCustomRelationText(rel);
        }
    };

    const handleSaveEdit = (email) => {
        const finalRel = isCustomRelation ? customRelationText : editRelationValue;
        if (!finalRel || !finalRel.trim()) {
            messageApi.warning("Relation name cannot be empty!");
            return;
        }
        setUserSuggestions(prev => prev.map(x => {
            if (x.suggestedUserEmail === email) {
                return { ...x, inferredRelation: finalRel };
            }
            return x;
        }));
        setEditingSuggestionEmail(null);
    };

    const handleStartEditConnection = (record) => {
        setEditingConnection(record);
        const rel = record.relation || "";
        const isPredefined = relations.some(r => r.relationName.toLowerCase() === rel.toLowerCase());
        if (isPredefined) {
            setEditConnRelValue(rel);
            setIsConnCustom(false);
            setConnCustomText("");
        } else {
            setEditConnRelValue("Custom");
            setIsConnCustom(true);
            setConnCustomText(rel);
        }
    };

    const handleSaveEditConnection = async () => {
        if (!editingConnection) return;
        const finalRel = isConnCustom ? connCustomText : editConnRelValue;
        if (!finalRel || !finalRel.trim()) {
            messageApi.warning("Relation name cannot be empty!");
            return;
        }
        setSavingConn(true);
        try {
            await http.put(`${BASE}/user-relations/${editingConnection.relationId}/relation`, {
                relationName: finalRel.trim(),
            });
            messageApi.success("Relation updated!");
            setEditingConnection(null);
            fetchConnections(searchText);
            fetchUserSuggestions();
        } catch (e) {
            messageApi.error(e.response?.data?.message || "Failed to update relation!");
        } finally {
            setSavingConn(false);
        }
    };




    const filteredData = dataSource;


    const columns = [
        {
            title: "Photo",
            className: "col-photo",
            dataIndex: "profilePicture",
            key: "profilePicture",
            width: 70,
            render: (pic, record) => (
                <div className="ct-photo-cell" style={{ display: "flex", justifyContent: "center" }}>
                    <div
                        className="ct-photo-clickable"
                        style={{ cursor: pic ? "pointer" : "default" }}
                        onClick={() => {
                            if (pic) {
                                setSelectedImage(pic);
                                setImageModalVisible(true);
                            }
                        }}
                    >
                        <Tooltip title={pic ? "Click to view full image" : ""}>
                            <Avatar
                                className="ct-photo-avatar"
                                size={45}
                                src={pic || null}
                                style={{
                                    backgroundColor: pic ? "transparent" : "#3b82f6",
                                    fontSize: "18px",
                                }}
                            >
                                {!pic && record.name?.charAt(0).toUpperCase()}
                            </Avatar>
                        </Tooltip>
                    </div>
                </div>
            ),
        },
        {
            title: "Name",
            className: "col-name",
            dataIndex: "name",
            key: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: "Phone Number",
            className: "col-phone",
            dataIndex: "phone",
            key: "phone",
            sorter: (a, b) => a.phone.localeCompare(b.phone),
        },
        {
            title: "Email",
            className: "col-email",
            dataIndex: "email",
            key: "email",
            sorter: (a, b) => a.email.localeCompare(b.email),
        },
        {
            title: "Relation",
            className: "col-relation",
            dataIndex: "relation",
            key: "relation",
            filters: [...new Set(dataSource.map(item =>
                typeof item.relation === 'string' ? item.relation : item.relation?.relationName || ''
            ).filter(Boolean))].map(name => ({
                text: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
                value: name.toLowerCase(),
            })),
            filterSearch: true,
            onFilter: (value, record) => {
                const relName = typeof record.relation === 'string'
                    ? record.relation.toLowerCase()
                    : (record.relation?.relationName || '').toLowerCase();
                return relName === value;
            },
            render: (relation) => {
                if (!relation) return <span className="ct-relation-empty" style={{ color: '#334155' }}>—</span>;
                const name = typeof relation === 'string'
                    ? relation
                    : (relation.relationName || relation || `Relation ${relation.id}`);
                const label = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                const r = name.toLowerCase();
                let color = '#22d3ee', bg = 'rgba(34,211,238,0.1)', border = 'rgba(34,211,238,0.25)';
                if (r.includes('brother') || r.includes('sister')) { color = '#60a5fa'; bg = 'rgba(96,165,250,0.1)'; border = 'rgba(96,165,250,0.25)'; }
                else if (r.includes('father') || r.includes('mother')) { color = '#a78bfa'; bg = 'rgba(167,139,250,0.1)'; border = 'rgba(167,139,250,0.25)'; }
                else if (r.includes('son') || r.includes('daughter')) { color = '#34d399'; bg = 'rgba(52,211,153,0.1)'; border = 'rgba(52,211,153,0.25)'; }
                else if (r.includes('grand')) { color = '#fbbf24'; bg = 'rgba(251,191,36,0.1)'; border = 'rgba(251,191,36,0.25)'; }
                else if (r.includes('husband') || r.includes('wife')) { color = '#f472b6'; bg = 'rgba(244,114,182,0.1)'; border = 'rgba(244,114,182,0.25)'; }
                else if (r.includes('friend')) { color = '#f59e0b'; bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.25)'; }
                else if (r.includes('uncle') || r.includes('aunt')) { color = '#fb923c'; bg = 'rgba(251,146,60,0.1)'; border = 'rgba(251,146,60,0.25)'; }
                return (
                    <span className="ct-relation-chip" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        color, background: bg,
                        border: `1px solid ${border}`,
                        borderRadius: 20, padding: '3px 10px',
                        fontSize: 12, fontWeight: 600,
                        letterSpacing: 0.3, whiteSpace: 'nowrap',
                    }}>
                        {label}
                    </span>
                );
            },
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
                        onClick={() => handleStartEditConnection(record)}
                    />
                </Tooltip>
            ),
        },
    ];

    return (
        <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            {contextHolder}
            <Layout className="contacts-layout">
                <Content className="contacts-content">
                    <Card className="contacts-card">
                        <Space
                            className="contacts-header-row"
                            align="center"
                            style={{
                                marginBottom: 24,
                                width: "100%",
                                justifyContent: "space-between",
                            }}
                        >
                            <Typography.Title
                                className="ct-page-title"
                                level={3}
                                style={{ color: "#f1f5f9", margin: 0 }}
                            >
                                Net World
                            </Typography.Title>

                            <Space>
                                <Input.Search
                                    className="ct-search-contacts"
                                    placeholder="Search contacts..."
                                    allowClear
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    style={{ width: 250 }}
                                />

                                <Button
                                    className="ct-btn-suggestions"
                                    type="primary"
                                    size="middle"
                                    onClick={() => { fetchUserSuggestions(); setShowSuggestions(true); }}
                                >
                                    Relation Suggestions
                                </Button>

                            </Space>
                        </Space>

                        <Spin spinning={loading} tip="Processing..." size="large" className="spin-container">
                            <Table
                                bordered
                                columns={columns}
                                dataSource={filteredData}
                                pagination={{ pageSize: 5 }}
                                className="contacts-table"
                                size="middle"
                            />
                            {showSuggestions && (
                                <div className="suggestions-panel">
                                    <div className="suggestions-panel-header">
                                        <div className="suggestions-header-left">
                                            <div className="suggestions-icon-wrap">
                                                <TeamOutlined style={{ color: "#38bdf8", fontSize: 18 }} />
                                            </div>
                                            <div>
                                                <div className="suggestions-panel-title">Relation Discovery Hub</div>
                                                <div className="suggestions-panel-subtitle">
                                                    Find users · Get automated suggestions · Discover network connections
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            className="suggestions-close-btn"
                                            type="text"
                                            onClick={() => setShowSuggestions(false)}
                                        >
                                            Close
                                        </Button>
                                    </div>

                                    <Tabs
                                        className="discovery-tabs"
                                        size="small"
                                        defaultActiveKey="suggested"
                                        items={[
                                            {
                                                key: "find",
                                                label: (
                                                    <span className="discovery-tab-label">
                                                        <SearchOutlined style={{ fontSize: 12 }} /> Find People
                                                    </span>
                                                ),
                                                children: (
                                                    <div className="suggestions-tab-wrap">
                                                        <div className="discovery-search-bar">
                                                            <Input
                                                                className="discovery-input"
                                                                placeholder="Search by name..."
                                                                value={query}
                                                                allowClear
                                                                onChange={e => setQuery(e.target.value)}
                                                                prefix={<SearchOutlined style={{ color: "#64748b" }} />}
                                                            />
                                                        </div>

                                                        {searchResults.length === 0 ? (
                                                            <div className="discovery-empty">
                                                                <div className="discovery-empty-icon">{query.trim() ? "🔍" : "👥"}</div>
                                                                <div className="discovery-empty-text">
                                                                    {query.trim()
                                                                        ? "No users found matching your search"
                                                                        : "Search for someone to connect with"}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="suggestions-list">
                                                                <div className="discovery-results-label">RESULTS ({searchResults.length})</div>
                                                                {searchResults.map(u => (
                                                                    <div className="discovery-row" key={u.email}>
                                                                        <div className="discovery-avatar">
                                                                            {(u.name || "?").charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <div className="discovery-row-info">
                                                                            <div className="discovery-row-name">{u.name}</div>
                                                                            <div className="discovery-row-email">{u.email}</div>
                                                                        </div>
                                                                        <div className="discovery-row-actions">
                                                                            {u.relationName ? (
                                                                                <span
                                                                                    className="discovery-rel-chip"
                                                                                    style={{
                                                                                        color: "#10b981",
                                                                                        background: "rgba(16,185,129,0.1)",
                                                                                        borderColor: "rgba(16,185,129,0.3)",
                                                                                    }}
                                                                                >
                                                                                    {u.relationName.charAt(0).toUpperCase() + u.relationName.slice(1).toLowerCase()}
                                                                                </span>
                                                                            ) : u.pending === "received" ? (
                                                                                <span
                                                                                    className="discovery-sent-badge"
                                                                                    style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" }}
                                                                                >
                                                                                    Request Received
                                                                                </span>
                                                                            ) : u.pending === "sent" || sentMap[u.email] ? (
                                                                                <span className="discovery-sent-badge">✓ Sent</span>
                                                                            ) : (
                                                                                <>
                                                                                    <Select
                                                                                        className="discovery-relation-select"
                                                                                        size="small"
                                                                                        placeholder="Relation"
                                                                                        value={relMap[u.email] || undefined}
                                                                                        onChange={v => setRelMap(p => ({ ...p, [u.email]: v }))}
                                                                                        style={{ height: "auto" }}
                                                                                    >
                                                                                        {relations.map(r => (
                                                                                            <Select.Option key={r.id} value={r.id}>
                                                                                                {r.relationName.charAt(0).toUpperCase() + r.relationName.slice(1).toLowerCase()}
                                                                                            </Select.Option>
                                                                                        ))}
                                                                                    </Select>
                                                                                    <button
                                                                                        className="discovery-send-btn"
                                                                                        disabled={sendingMap[u.email]}
                                                                                        onClick={() => sendUserRequest(u.email)}
                                                                                    >
                                                                                        <ArrowRightOutlined style={{ fontSize: 12 }} />
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            },
                                            {
                                                key: "pending",
                                                label: (
                                                    <span className="discovery-tab-label">
                                                        <BellOutlined style={{ fontSize: 12 }} /> Pending Requests
                                                        {pending.length > 0 && (
                                                            <span className="discovery-badge discovery-badge-indigo">{pending.length}</span>
                                                        )}
                                                    </span>
                                                ),
                                                children: (
                                                    <div className="suggestions-tab-content">
                                                        <div className="suggestions-tab-header">
                                                            <div>
                                                                <div className="suggestions-tab-title">Pending Requests</div>
                                                                <div className="suggestions-tab-subtitle">People who want to connect with you</div>
                                                            </div>
                                                            <Button
                                                                className="discovery-refresh-btn"
                                                                size="small"
                                                                type="text"
                                                                loading={pendingLoading}
                                                                onClick={fetchPending}
                                                            >
                                                                Refresh
                                                            </Button>
                                                        </div>

                                                        {pendingLoading ? (
                                                            <div className="suggestions-loading"><Spin size="small" style={{ marginRight: 8 }} /> Loading...</div>
                                                        ) : pending.length === 0 ? (
                                                            <div className="suggestions-empty">
                                                                <div className="suggestions-empty-icon">🔔</div>
                                                                <div className="suggestions-empty-text">No pending requests</div>
                                                            </div>
                                                        ) : (
                                                            <div className="suggestion-cards-list">
                                                                {pending.map((p, i) => {
                                                                    const rel = getInverseRelation(p.inferredRelation, p.suggestedUserGender)?.toLowerCase() || "";
                                                                    let rColor = "#38bdf8", rBg = "rgba(56,189,248,0.1)", rBorder = "rgba(56,189,248,0.25)";
                                                                    if (rel.includes("brother") || rel.includes("sister")) { rColor = "#60a5fa"; rBg = "rgba(96,165,250,0.1)"; rBorder = "rgba(96,165,250,0.25)"; }
                                                                    else if (rel.includes("father") || rel.includes("mother")) { rColor = "#818cf8"; rBg = "rgba(129,140,248,0.1)"; rBorder = "rgba(129,140,248,0.25)"; }
                                                                    else if (rel.includes("son") || rel.includes("daughter")) { rColor = "#34d399"; rBg = "rgba(52,211,153,0.1)"; rBorder = "rgba(52,211,153,0.25)"; }

                                                                    const COLORS = ["#3b82f6", "#38bdf8", "#0ea5e9", "#10b981", "#f59e0b"];
                                                                    const avColor = COLORS[((p.suggestedUserName || "").charCodeAt(0) || 0) % COLORS.length];

                                                                    return (
                                                                        <div className="suggestion-card" key={i}>
                                                                            <div className="suggestion-card-left">
                                                                                <div className="suggestion-card-avatar" style={{ background: avColor }}>
                                                                                    {(p.suggestedUserName || "?").charAt(0).toUpperCase()}
                                                                                </div>
                                                                                <div className="suggestion-card-info">
                                                                                    <div className="suggestion-card-name">{p.suggestedUserName}</div>
                                                                                    <div className="suggestion-card-email">{p.suggestedUserEmail}</div>
                                                                                    <div className="suggestion-card-reason">
                                                                                        <span>{p.reason}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="suggestion-card-right">
                                                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                                    <span className="suggestion-rel-chip" style={{ color: rColor, background: rBg, border: `1px solid ${rBorder}` }}>
                                                                                        {(rel || "").toUpperCase()}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="suggestion-card-actions">
                                                                                    <Tooltip title="Accept Request">
                                                                                        <button className="suggestion-action-btn" style={{ color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }} onClick={() => acceptPending(p.pendingRelationId)}>
                                                                                            <CheckOutlined style={{ fontSize: 12 }} />
                                                                                        </button>
                                                                                    </Tooltip>
                                                                                    <Tooltip title="Decline Request">
                                                                                        <button className="suggestion-action-btn" style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }} onClick={() => declinePending(p.pendingRelationId)}>
                                                                                        <CloseOutlined style={{ fontSize: 12 }} />
                                                                                        </button>
                                                                                    </Tooltip>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            },
                                            {
                                                key: "suggested",
                                                label: (
                                                    <span className="discovery-tab-label">
                                                        <BulbOutlined style={{ fontSize: 12 }} /> Suggestions
                                                        {userSuggestions.length > 0 && (
                                                            <span className="discovery-badge discovery-badge-indigo">{userSuggestions.length}</span>
                                                        )}
                                                    </span>
                                                ),
                                                children: (
                                                    <div className="suggestions-tab-content">
                                                        <div className="suggestions-tab-header">
                                                            <div>
                                                                <div className="suggestions-tab-title">People You May Know</div>
                                                                <div className="suggestions-tab-subtitle">Auto-discovered through mutual connections</div>
                                                            </div>
                                                            <Button
                                                                className="discovery-refresh-btn"
                                                                size="small"
                                                                type="text"
                                                                loading={userSuggestLoading}
                                                                onClick={fetchUserSuggestions}
                                                            >
                                                                Refresh Suggestions
                                                            </Button>
                                                        </div>

                                                        {userSuggestLoading ? (
                                                            <div className="suggestions-loading"><Spin size="small" style={{ marginRight: 8 }} /> Loading...</div>
                                                        ) : userSuggestions.length === 0 ? (
                                                            <div className="suggestions-empty">
                                                                <div className="suggestions-empty-icon">✨</div>
                                                                <div className="suggestions-empty-text">No suggestions yet</div>
                                                            </div>
                                                        ) : (
                                                            <div className="suggestion-cards-list">
                                                                {userSuggestions.map((s, i) => {
                                                                    const rel = (s.inferredRelation || "").toLowerCase();
                                                                    let rColor = "#38bdf8", rBg = "rgba(56,189,248,0.1)", rBorder = "rgba(56,189,248,0.25)";
                                                                    if (rel.includes("brother") || rel.includes("sister")) { rColor = "#60a5fa"; rBg = "rgba(96,165,250,0.1)"; rBorder = "rgba(96,165,250,0.25)"; }
                                                                    else if (rel.includes("father") || rel.includes("mother")) { rColor = "#818cf8"; rBg = "rgba(129,140,248,0.1)"; rBorder = "rgba(129,140,248,0.25)"; }
                                                                    else if (rel.includes("son") || rel.includes("daughter")) { rColor = "#34d399"; rBg = "rgba(52,211,153,0.1)"; rBorder = "rgba(52,211,153,0.25)"; }

                                                                    const COLORS = ["#3b82f6", "#38bdf8", "#0ea5e9", "#10b981", "#f59e0b"];
                                                                    const avColor = COLORS[((s.suggestedUserName || "").charCodeAt(0) || 0) % COLORS.length];

                                                                    return (
                                                                        <div className="suggestion-card" key={i}>
                                                                            <div className="suggestion-card-left">
                                                                                <div className="suggestion-card-avatar" style={{ background: avColor }}>
                                                                                    {(s.suggestedUserName || "?").charAt(0).toUpperCase()}
                                                                                </div>
                                                                                <div className="suggestion-card-info">
                                                                                    <div className="suggestion-card-name">{s.suggestedUserName}</div>
                                                                                    <div className="suggestion-card-email">{s.suggestedUserEmail}</div>
                                                                                    <div className="suggestion-card-reason">
                                                                                        <span className="suggestion-auto-badge">AUTO</span>
                                                                                        <span>{s.reason}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="suggestion-card-right">
                                                                                {editingSuggestionEmail === s.suggestedUserEmail ? (
                                                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                                                                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                                                            <Select
                                                                                                size="small"
                                                                                                style={{ width: 130 }}
                                                                                                value={isCustomRelation ? "Custom" : editRelationValue}
                                                                                                onChange={(val) => {
                                                                                                    if (val === "Custom") {
                                                                                                        setIsCustomRelation(true);
                                                                                                    } else {
                                                                                                        setIsCustomRelation(false);
                                                                                                        setEditRelationValue(val);
                                                                                                    }
                                                                                                }}
                                                                                                options={[
                                                                                                    ...relations.map(r => ({ value: r.relationName, label: r.relationName })),
                                                                                                    { value: "Custom", label: "Custom..." }
                                                                                                ]}
                                                                                            />
                                                                                            <Button size="small" type="primary" icon={<CheckOutlined style={{ fontSize: 10 }} />} onClick={() => handleSaveEdit(s.suggestedUserEmail)} style={{ display: "flex", alignItems: "center", justifyContent: "center" }} />
                                                                                            <Button size="small" icon={<CloseOutlined style={{ fontSize: 10 }} />} onClick={() => setEditingSuggestionEmail(null)} style={{ display: "flex", alignItems: "center", justifyContent: "center" }} />
                                                                                        </div>
                                                                                        {isCustomRelation && (
                                                                                            <Input
                                                                                                size="small"
                                                                                                placeholder="Custom relation..."
                                                                                                style={{ width: 130 }}
                                                                                                value={customRelationText}
                                                                                                onChange={e => setCustomRelationText(e.target.value)}
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <>
                                                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                                            <span className="suggestion-rel-chip" style={{ color: rColor, background: rBg, border: `1px solid ${rBorder}` }}>
                                                                                                {(s.inferredRelation || "").toUpperCase()}
                                                                                            </span>
                                                                                            <Tooltip title="Edit Relation">
                                                                                                <Button
                                                                                                    size="small"
                                                                                                    type="text"
                                                                                                    icon={<EditOutlined style={{ color: "#64748b", fontSize: 12 }} />}
                                                                                                    onClick={() => handleStartEdit(s)}
                                                                                                    style={{ padding: 0, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}
                                                                                                />
                                                                                            </Tooltip>
                                                                                        </div>
                                                                                        <div className="suggestion-card-actions">
                                                                                            <Tooltip title="Send Request">
                                                                                                <button className="suggestion-action-btn suggestion-action-send" onClick={() => sendSuggestionRequest(s)}>
                                                                                                    <ArrowRightOutlined style={{ fontSize: 12 }} />
                                                                                                </button>
                                                                                            </Tooltip>
                                                                                            <Tooltip title="Dismiss">
                                                                                                <button className="suggestion-action-btn suggestion-action-dismiss" onClick={() => dismissUserSuggestion(s)}>✕</button>
                                                                                            </Tooltip>
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            },
                                        ]}
                                    />
                                </div>
                            )}

                            {/* Edit Connection Relation Modal */}
                            <Modal
                                title="Edit Relation"
                                open={!!editingConnection}
                                onCancel={() => setEditingConnection(null)}
                                onOk={handleSaveEditConnection}
                                okText="Save"
                                confirmLoading={savingConn}
                                destroyOnClose
                                centered
                            >
                                {editingConnection && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{ color: "#e2e8f0" }}>
                                            Update relation with{" "}
                                            <strong style={{ color: "#38bdf8" }}>{editingConnection.name}</strong>:
                                        </div>
                                        <Select
                                            style={{ width: "100%" }}
                                            value={isConnCustom ? "Custom" : editConnRelValue}
                                            onChange={(val) => {
                                                if (val === "Custom") {
                                                    setIsConnCustom(true);
                                                } else {
                                                    setIsConnCustom(false);
                                                    setEditConnRelValue(val);
                                                }
                                            }}
                                            options={[
                                                ...relations.map(r => ({ value: r.relationName, label: r.relationName })),
                                                { value: "Custom", label: "Custom..." },
                                            ]}
                                        />
                                        {isConnCustom && (
                                            <Input
                                                placeholder="Enter relation..."
                                                value={connCustomText}
                                                onChange={e => setConnCustomText(e.target.value)}
                                            />
                                        )}
                                    </div>
                                )}
                            </Modal>

                            {/* Image Viewer Modal - WhatsApp/Instagram DP Style */}
                            <Modal
                                title={null}
                                open={imageModalVisible}
                                onCancel={() => setImageModalVisible(false)}
                                destroyOnClose
                                maskClosable={true}
                                footer={null}
                                closable={false}
                                centered
                                className="image-viewer-modal-circle"
                            >
                                {selectedImage && (
                                    <div className="ct-image-viewer-wrapper" style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}>
                                        <img
                                            className="ct-image-viewer-img"
                                            src={selectedImage}
                                            alt="Profile full view"
                                            style={{
                                                objectFit: 'cover',
                                                borderRadius: '50%',
                                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                                border: '4px solid rgba(255, 255, 255, 0.1)'
                                            }}
                                            onClick={() => setImageModalVisible(false)}
                                        />
                                    </div>
                                )}
                            </Modal>

                        </Spin>
                    </Card>
                </Content>
            </Layout>
        </ConfigProvider>
    );
}

export default ContactsTable;