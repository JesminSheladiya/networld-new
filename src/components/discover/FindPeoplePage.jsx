import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Spin, Empty, Tooltip, message, Avatar } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faUsers, faXmark, faPaperPlane, faPlus } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { useRefresh } from "../shared/RefreshContext";
import { useAuth } from "../../context/AuthContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import { SEARCH_DEBOUNCE_MS, avatarColorFor } from "../../constants";
import RelationPickerModal from "../shared/RelationPickerModal";

// Survives unmounts (profile visits) within the session so going back
// restores the query + results instantly; keyed per account.
const findCache = { key: "", query: "", results: [] };

function FindPeoplePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (findCache.key !== (user?.email || "")) {
    findCache.key = user?.email || "";
    findCache.query = "";
    findCache.results = [];
  }
  const [query, setQuery] = useState(findCache.query);
  const [results, setResults] = useState(findCache.results);
  const [searching, setSearching] = useState(false);
  const [relations, setRelations] = useState([]);
  const [relMap, setRelMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});
  const [sentMap, setSentMap] = useState({});
  const [pickerEmail, setPickerEmail] = useState(null);
  const [searchSeq, setSearchSeq] = useState(0);
  const { bump } = useRefresh();
  const { relName } = useRelationDisplay();

  // Persist across unmounts (back from a profile restores instantly).
  useEffect(() => {
    findCache.query = query;
  }, [query]);
  useEffect(() => {
    findCache.results = results;
  }, [results]);

  const pickerUser = pickerEmail
    ? results.find((x) => x.email === pickerEmail)
    : null;

  useEffect(() => {
    api.relations().then((res) => setRelations(res.data || [])).catch(() => setRelations([]));
  }, []);

  // reqIdRef drops stale responses (fast typing must not overwrite newer results)
  const reqIdRef = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      reqIdRef.current += 1;
      setSearching(false);
      setResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setSearching(true);
      try {
        const res = await api.searchUsers(q);
        if (reqIdRef.current !== id) return; // stale — a newer search is in flight
        const data = res.data || [];
        setResults(data);
        // Reconcile with server: a declined request is no longer pending,
        // so drop its local "Sent" mark and bring back the selection UI
        setSentMap((prev) => {
          const next = {};
          for (const u of data) {
            if (u.pending === "sent" && prev[u.email]) next[u.email] = true;
          }
          return next;
        });
      } catch {
        if (reqIdRef.current !== id) return;
        setResults([]);
      } finally {
        if (reqIdRef.current === id) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [query, searchSeq]);

  // Instagram-style: open anyone's profile from a result row.
  const openProfile = (u) => {
    const contact = {
      key: u.email,
      name: u.name || "",
      username: u.username || "",
      email: u.email || "",
      phone: u.phone || "",
      profilePicture: u.profilePic || null,
      relation: u.relationName || "",
      relationId: null,
      gender: u.gender || null,
      birthDate: u.birthDate || null,
      bio: u.bio || "",
    };
    navigate(`/contacts/${encodeURIComponent(u.username || u.email)}`, {
      state: { contact },
    });
  };

  const sendRequest = async (email) => {    if (!relMap[email]) return;
    setSendingMap((p) => ({ ...p, [email]: true }));
    try {
      await api.send(email, relMap[email]);
      setSentMap((p) => ({ ...p, [email]: true }));
      bump();
      message.success("Connection request sent");
    } catch (e) {
      // Server is the source of truth (e.g. cross-request blocked) —
      // show its message and re-fetch so the row reflects real state.
      message.error(e?.response?.data?.message || "Could not send request");
      setSearchSeq((s) => s + 1);
      bump();
    } finally {
      setSendingMap((p) => ({ ...p, [email]: false }));
    }
  };

  return (
    <div className="nw-page">
      <div className="nw-page-head">
        <div>
          <h1 className="nw-page-title">Find People</h1>
          <p className="nw-page-subtitle">Search NetWorld and connect with people you know</p>
        </div>
      </div>

      <Input
        className="nw-search nw-search-full"
        prefix={<FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#64748b" }} />}
        placeholder="Search by name, username, phone or email..."
        allowClear={{ clearIcon: <FontAwesomeIcon icon={faXmark} style={{ color: "#64748b", fontSize: 12 }} /> }}
        size="large"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="nw-discover-panel">
        {!query.trim() ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faUsers} style={{ fontSize: 42, color: "#475569" }} />
            <span className="nw-state-text">Search for someone to connect with</span>
            <span className="nw-state-sub">Search works with names, usernames, phone numbers and email addresses</span>
          </div>
        ) : searching && results.length === 0 ? (
          <div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Searching...</span></div>
        ) : results.length === 0 ? (
          <div className="nw-state-box"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No users found" /></div>
        ) : (
          <div className="nw-discover-list">
            <div className="nw-discover-label">Results · {results.length}</div>
            {results.map((u) => (
              <div
                className="nw-find-row"
                key={u.email}
                onClick={() => openProfile(u)}
                title="View profile"
                style={{ cursor: "pointer" }}
              >
                <Avatar
                  size={40}
                  src={u.profilePic || null}
                  style={{
                    backgroundColor: u.profilePic ? "transparent" : avatarColorFor(u.name),
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {!(u.profilePic) && (u.name || "?").charAt(0).toUpperCase()}
                </Avatar>
                <div className="nw-find-info">
                  <div className="nw-find-name">
                    {u.name}
                  </div>
                  <div className="nw-find-email">{u.username ? `@${u.username}` : (u.phone || "—")}</div>
                </div>
                <div className="nw-find-actions" onClick={(e) => e.stopPropagation()}>
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
                          return found ? relName(found.relationName) : "Select Relation";
                        })()}
                      >
                        {(() => {
                          const found = relations.find((r) => r.id === relMap[u.email]);
                          return found ? relName(found.relationName) : <><FontAwesomeIcon icon={faPlus} style={{ fontSize: '10px' }} /> Select Relation</>;
                        })()}
                      </button>
                      <Tooltip title="Send Request">
                        <button
                          className="nw-send-btn"
                          disabled={sendingMap[u.email] || !relMap[u.email]}
                          onClick={() => sendRequest(u.email)}
                        >
                          <FontAwesomeIcon icon={faPaperPlane} />
                        </button>
                      </Tooltip>
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
        personGender={pickerUser?.gender}
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
