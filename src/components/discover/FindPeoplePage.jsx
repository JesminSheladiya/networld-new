import { useEffect, useState } from "react";
import { Input, Spin, Select, Empty } from "antd";
import { SearchOutlined, ArrowRightOutlined, TeamOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import "./../../components/css/discover-pages.css";

function FindPeoplePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [relations, setRelations] = useState([]);
  const [relMap, setRelMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});
  const [sentMap, setSentMap] = useState({});

  useEffect(() => {
    api.relations().then((res) => setRelations(res.data || [])).catch(() => setRelations([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearching(false);
      setResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchUsers(q);
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [query]);

  const sendRequest = async (email) => {
    if (!relMap[email]) return;
    setSendingMap((p) => ({ ...p, [email]: true }));
    try {
      await api.send(email, relMap[email]);
      setSentMap((p) => ({ ...p, [email]: true }));
    } catch (e) {
      // error handled silently
      console.error(e);
    } finally {
      setSendingMap((p) => ({ ...p, [email]: false }));
    }
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div>
          <h1 className="nw-page-title">Find People</h1>
          <p className="nw-page-subtitle">Search the Net World and connect with people you know</p>
        </div>
      </div>

      <Input
        className="nw-search nw-search-full"
        prefix={<SearchOutlined style={{ color: "#64748b" }} />}
        placeholder="Search by name or email..."
        allowClear
        size="large"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="nw-discover-panel">
        {searching ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Searching...</span></div>
        ) : !query.trim() ? (
          <div className="nw-state-box">
            <TeamOutlined style={{ fontSize: 40, color: "#475569" }} />
            <span className="nw-state-text">Search for someone to connect with</span>
          </div>
        ) : results.length === 0 ? (
          <div className="nw-state-box"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No users found" /></div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">RESULTS ({results.length})</div>
            {results.map((u) => (
              <div className="nw-find-row" key={u.email}>
                <div className="nw-find-avatar">
                  {(u.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="nw-find-info">
                  <div className="nw-find-name">{u.name}</div>
                  <div className="nw-find-email">{u.email}</div>
                </div>
                <div className="nw-find-actions">
                  {u.relationName ? (
                    <span className="nw-find-chip-connected">{u.relationName}</span>
                  ) : u.pending === "received" ? (
                    <span className="nw-find-chip-received">Request Received</span>
                  ) : u.pending === "sent" || sentMap[u.email] ? (
                    <span className="nw-find-chip-sent">✓ Sent</span>
                  ) : (
                    <>
                      <Select
                        className="nw-relation-select"
                        size="small"
                        placeholder="Relation"
                        value={relMap[u.email] || undefined}
                        onChange={(v) => setRelMap((p) => ({ ...p, [u.email]: v }))}
                      >
                        {relations.map((r) => (
                          <Select.Option key={r.id} value={r.id}>
                            {r.relationName.charAt(0).toUpperCase() + r.relationName.slice(1).toLowerCase()}
                          </Select.Option>
                        ))}
                      </Select>
                      <button
                        className="nw-send-btn"
                        disabled={sendingMap[u.email] || !relMap[u.email]}
                        onClick={() => sendRequest(u.email)}
                        title="Send request"
                      >
                        <ArrowRightOutlined />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FindPeoplePage;