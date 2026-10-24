import { useCallback, useEffect, useState, useRef, memo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { Avatar, Spin, Input, Empty } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faUsers, faChevronRight, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LockOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import { avatarColorFor, DEFAULT_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../../constants";
import { mapConnectionToContact, matchesContactSlug, seedMatchesSlug } from "../../utils/contactMapper";
import { toDataUrl } from "../../utils/imageUtils";
import "../css/profile-page.css";

// Standalone connections list — opened from the header stat on mobile
// (Instagram-style list page). Paged (50/page infinite scroll): the old
// unbounded fetch shipped the whole graph with photos on every open —
// fine at 100 rows, stalled on 4G at 10k, impossible at 1M.
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

// Keep connections per slug so in-app back preserves data + scroll (like contacts).
const connectionsCache = new Map();

// Memoized row — same markup as before. Virtuoso mounts only the visible
// window (contacts-page pattern), so long lists never grow the DOM.
const ConnRow = memo(function ConnRow({ c, onOpen }) {
  return (
    <div
      className="pf-conn-row"
      onClick={() => onOpen(c)}
      title={`View ${c.name || "profile"}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(c); }}
    >
      <Avatar
        size={44}
        src={toDataUrl(c.profilePicture)}
        style={{
          backgroundColor: c.profilePicture
            ? "transparent"
            : avatarColorFor(c.name || "?"),
          fontSize: 17,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {!c.profilePicture && (c.name || "?").charAt(0).toUpperCase()}
      </Avatar>
      <span className="pf-info-text">
        <span className="pf-info-value">{c.name || "Unknown"}</span>
        <span className="pf-info-label">
          {c.username ? `@${c.username.toLowerCase()}` : c.email}
        </span>
      </span>
      <span className="pf-conn-right">
        <FontAwesomeIcon icon={faChevronRight} className="pf-conn-chevron" />
      </span>
    </div>
  );
});

function UserConnectionsPage() {
  const navigate = useNavigate();
  const { username } = useParams();
  const location = useLocation();

  const slug = username ? decodeURIComponent(username) : "";
  const seedContact = location.state?.contact;
  const [email, setEmail] = useState(() =>
    seedMatchesSlug(seedContact, slug) ? seedContact.email || "" : ""
  );
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const restoredRef = useRef(false);

  // Resolve slug → email without downloading the whole graph: a bounded
  // paged query first (matches when the target is already a connection),
  // then the typeahead fallback for strangers.
  useEffect(() => {
    const cached = connectionsCache.get(slug);
    if (cached) {
      restoredRef.current = true;
      setEmail(cached.email || "");
      setItems(cached.items || []);
      setTotal(cached.total ?? 0);
      setPage(cached.page || 0);
      setSearchText(cached.searchText || "");
      setSearchQuery(cached.searchQuery || "");
      setLoading(false);
      if (cached.scrollY) setTimeout(() => window.scrollTo(0, cached.scrollY), 0);
      return () => {
        const c = connectionsCache.get(slug);
        if (c) connectionsCache.set(slug, { ...c, scrollY: window.scrollY });
      };
    }
    let cancelled = false;
    restoredRef.current = false;
    setEmail(seedMatchesSlug(seedContact, slug) ? seedContact.email || "" : "");
    setItems([]);
    setTotal(null);
    setPage(0);
    setSearchText("");
    setSearchQuery("");
    setLoading(true);
    (async () => {
      try {
        let em = seedMatchesSlug(seedContact, slug) ? seedContact.email : "";
        if (!em) {
          const res = await api.connectionsPaged(0, 5, slug, "all", [], null, false);
          if (cancelled) return;
          const found = (res.data?.content || []).find((c) => matchesContactSlug(c, slug));
          if (found) {
            em = found.suggestedUserEmail;
          } else {
            const r2 = await api.searchUsers(slug);
            if (cancelled) return;
            const list = r2.data || [];
            const exact =
              list.find((u) => (u.username || "").toLowerCase() === slug.toLowerCase()) ||
              list.find((u) => u.email === slug);
            em = exact?.email || "";
          }
        }
        if (cancelled) return;
        setEmail(em || "");
        if (!em) setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Paged list for the resolved email.
  useEffect(() => {
    if (!email) return;
    if (restoredRef.current) {
      restoredRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        if (page === 0) setLoading(true);
        else setLoadingMore(true);
        const res = await api.connectionsOf(email, page, PAGE_SIZE, searchQuery, ctrl.signal);
        if (cancelled) return;
        const data = res.data || {};
        const mapped = Array.isArray(data.items)
          ? data.items.map((item, i) => mapConnectionToContact(item, page * PAGE_SIZE + i))
          : [];
        const nextTotal = data.total ?? 0;
        setTotal(nextTotal);
        setItems((prev) => {
          const next = page === 0 ? mapped : [...prev, ...mapped];
          const c = connectionsCache.get(slug) || {};
          connectionsCache.set(slug, { ...c, email, items: next, total: nextTotal, page, searchText, searchQuery, scrollY: c.scrollY });
          return next;
        });
      } catch (e) {
        if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
        if (page === 0) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [email, page, searchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(0);
      setSearchQuery(searchText.trim().replace(/\s+/g, " "));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [searchText]);

  const hasMore = total != null && items.length < total;

  // Next page pre-loads as the end approaches (contacts-page pattern).
  const loadMore = useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      setPage((p) => p + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore]);

  const openProfile = useCallback((c) => {
    navigate(`/contacts/${encodeURIComponent(c.username || c.email)}`, {
      state: { contact: c },
    });
  }, [navigate]);

  const renderRow = useCallback(
    (_index, c) => <ConnRow c={c} onOpen={openProfile} />,
    [openProfile]
  );

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/contacts", { replace: true });
  };

  const ownerName = seedMatchesSlug(seedContact, slug)
    ? seedContact.name || "User"
    : "User";

  const connTotal = total;
  const connItems = items;
  const connLocked = connTotal > 0 && connItems.length === 0 && !loading && !hasMore;

  return (
    <div className="nw-page pf-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <Input
        className="nw-search nw-search-full pf-connections-search"
        prefix={<FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#64748b" }} />}
        placeholder="Search connections by name or username..."
        allowClear={{ clearIcon: <FontAwesomeIcon icon={faXmark} style={{ color: "#64748b", fontSize: 12 }} /> }}
        size="large"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />

      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">{ownerName}&rsquo;s connections</h2>
          {connTotal != null && (
            <span className="pf-count-pill" title={connTotal}>
              {connTotal.toLocaleString()} {connTotal === 1 ? "connection" : "connections"}
            </span>
          )}
        </div>
        {loading && items.length === 0 ? (
          <div className="nw-state-box">
            <Spin size="large" />
            <span className="nw-state-text">Loading connections...</span>
          </div>
        ) : connLocked ? (
          <div className="nw-state-box">
            <LockOutlined style={{ fontSize: 32, color: "#475569" }} />
            <span className="nw-state-text">Connections are private</span>
            <span className="nw-state-sub">{ownerName} has chosen to keep connections hidden</span>
          </div>
        ) : items.length === 0 && !hasMore ? (
          <div className="nw-state-box">
            {searchQuery ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No connections found" />
            ) : (
              <>
                <FontAwesomeIcon icon={faUsers} style={{ fontSize: 40, color: "#475569" }} />
                <span className="nw-state-text">No connections yet</span>
              </>
            )}
          </div>
          ) : (
          <div className="pf-conn-list">
            <Virtuoso
              useWindowScroll
              data={connItems}
              endReached={loadMore}
              overscan={360}
              itemContent={renderRow}
            />
            {loadingMore && (
              <div className="nw-list-loader">
                <Spin size="small" />
                <span>Loading more connections...</span>
              </div>
            )}
            {!hasMore && items.length > 0 && <div className="nw-list-end">No more connections</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserConnectionsPage;
