import { useEffect, useState } from "react";
import { Input, Spin, Empty } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faArrowRight, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import RelationPickerModal from "../shared/RelationPickerModal";

function FindPeoplePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [relations, setRelations] = useState([]);
  const [relMap, setRelMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});
  const [sentMap, setSentMap] = useState({});
  const [pickerEmail, setPickerEmail] = useState(null);
  const { bump } = useRefresh();
  const { relName } = useRelationDisplay();

  const pickerUser = pickerEmail
    ? results.find((x) => x.email === pickerEmail)
    : null;

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
      bump();
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
        prefix={<FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#64748b" }} />}
        placeholder="Search by name or email..."
        allowClear={{ clearIcon: <FontAwesomeIcon icon={faXmark} style={{ color: "#64748b", fontSize: 12 }} /> }}
        size="large"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="nw-discover-panel">
        {searching ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Searching...</span></div>
        ) : !query.trim() ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faUsers} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">Search for someone to connect with</span>
            <span className="nw-state-sub">Search works with both names and email addresses</span>
          </div>
        ) : results.length === 0 ? (
          <div className="nw-state-box"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No users found" /></div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">Results · {results.length}</div>
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
                    <span className="nw-find-chip-connected">{relName(u.relationName)}</span>
                  ) : u.pending === "received" ? (
                    <span className="nw-find-chip-received">Request Received</span>
                  ) : u.pending === "sent" || sentMap[u.email] ? (
                    <span className="nw-find-chip-sent">✓ Sent</span>
                  ) : (
                    <>
                      <button
                        className="nw-relation-pick-btn"
                        onClick={() => setPickerEmail(u.email)}
                        title={(() => {
                          const found = relations.find((r) => r.id === relMap[u.email]);
                          return found ? relName(found.relationName) : "Select relation";
                        })()}
                      >
                        {(() => {
                          const found = relations.find((r) => r.id === relMap[u.email]);
                          return found ? relName(found.relationName) : "Relation";
                        })()}
                      </button>
                      <button
                        className="nw-send-btn"
                        disabled={sendingMap[u.email] || !relMap[u.email]}
                        onClick={() => sendRequest(u.email)}
                        title="Send request"
                      >
                        <FontAwesomeIcon icon={faArrowRight} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RelationPickerModal
        open={pickerEmail !== null}
        title="Select Relation"
        personName={pickerUser?.name}
        value={pickerEmail ? relMap[pickerEmail] : undefined}
        idMode
        onClose={() => setPickerEmail(null)}
        onPick={(v) => {
          const email = pickerEmail;
          setPickerEmail(null);
          if (email) setRelMap((p) => ({ ...p, [email]: v }));
        }}
      />
    </div>
  );
}

export default FindPeoplePage;
