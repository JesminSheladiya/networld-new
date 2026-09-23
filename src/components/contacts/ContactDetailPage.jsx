import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-regular-svg-icons";
import { api } from "../../Services/networld";
import { mapConnectionToContact, matchesContactSlug, seedMatchesSlug } from "../../utils/contactMapper";
import { toDataUrl } from "../../utils/imageUtils";
import { useRefresh } from "../shared/RefreshContext";
import { useAuth } from "../../context/AuthContext";
import ContactProfile from "../shared/ContactProfile";
import ProfilePage from "../profile/ProfilePage";

function ContactDetailPage() {
  const navigate = useNavigate();
  const { username } = useParams();
  const location = useLocation();
  const { bump } = useRefresh();
  const { user: me } = useAuth();

  const slug = username ? decodeURIComponent(username) : "";
  // Own account opened from anywhere (e.g. someone's connections list) —
  // show the own profile with its Edit button, Instagram-style.
  const isOwnProfile =
    !!me &&
    (slug.toLowerCase() === (me.username || "").toLowerCase() ||
      (!!me.email && slug === me.email));
  const seed = location.state?.contact;
  const hasSeed = seedMatchesSlug(seed, slug);

  // List snapshot paints instantly; fresh server data replaces it below —
  // the screen is never stuck showing a stale contact.
  const [contact, setContact] = useState(() => (hasSeed ? seed : null));
  const [loading, setLoading] = useState(() => !hasSeed);
  // True once server data lands — sensitive sections stay gated until then
  // so a stale seed can never flash private details (backend is the truth).
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (isOwnProfile) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setFresh(false);
    const urlSeed = location.state?.contact;
    if (seedMatchesSlug(urlSeed, slug)) {
      setContact(urlSeed);
      setLoading(false);
    } else {
      setContact(null);
      setLoading(true);
    }
    (async () => {
      try {
        const res = await api.connections();
        if (cancelled) return;
        const found = (res.data || []).find((c) => matchesContactSlug(c, slug));
        if (found) {
          setContact(mapConnectionToContact(found, 0));
          setFresh(true);
          return;
        }
        // Not a connection — resolve any app user so profiles open from
        // Find/Requests/Suggestions too (Instagram-style public profile).
        const r2 = await api.searchUsers(slug);
        if (cancelled) return;
        const list = r2.data || [];
        const exact =
          list.find((u) => (u.username || "").toLowerCase() === slug.toLowerCase()) ||
          list.find((u) => u.email === slug);
if (exact) {
            setContact({
              key: 0,
              name: exact.name || "",
              username: exact.username || "",
              email: exact.email || "",
              phone: exact.phone || "",
              profilePicture: toDataUrl(exact.profilePic || null),
              coverImage: toDataUrl(exact.coverImage || null),
              coverHidden: !!exact.coverHidden,
              relation: exact.relationName || "",
              relationId: null,
              gender: exact.gender || null,
              birthDate: exact.birthDate || null,
              bio: exact.bio || "",
              contactInfoHidden: !!exact.contactInfoHidden,
            });
            setFresh(true);
        } else if (!seedMatchesSlug(urlSeed, slug)) {
          setContact(null);
        }
      } catch {
        if (!cancelled && !seedMatchesSlug(location.state?.contact, slug)) {
          setContact(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isOwnProfile]);

  if (isOwnProfile) {
    return <ProfilePage hidePassword />;
  }

  if (loading) {
    return (
      <div className="nw-page"><div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading contact...</span></div></div>
    );
  }

  if (!contact) {
    return (
      <div className="nw-page">
        <div className="nw-state-box">
          <FontAwesomeIcon icon={faUser} style={{ fontSize: 40, color: "#475569" }} />
          <span className="nw-state-text">Contact not found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="nw-page nw-detail-page">
      <ContactProfile
        contact={contact}
        fresh={fresh}
        showBack
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/contacts", { replace: true });
        }}
        onRelationSaved={(newRel) => {
          // Detail reflects it now; the list refetches via refresh bump so
          // going back shows it there too — no reload round-trip anywhere.
          setContact((prev) => (prev ? { ...prev, relation: newRel } : prev));
          bump();
        }}
      />
    </div>
  );
}

export default ContactDetailPage;
