import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-regular-svg-icons";
import { api } from "../../Services/networld";
import { mapConnectionToContact } from "../../utils/contactMapper";
import { useRefresh } from "../shared/RefreshContext";
import ContactProfile from "../shared/ContactProfile";

function ContactDetailPage() {
  const navigate = useNavigate();
  const { email } = useParams();
  const location = useLocation();
  const { bump } = useRefresh();

  const decodedEmail = email ? decodeURIComponent(email) : "";
  const seed = location.state?.contact;
  const hasSeed = !!seed && seed.email === decodedEmail;

  // List snapshot paints instantly; fresh server data replaces it below —
  // the screen is never stuck showing a stale contact.
  const [contact, setContact] = useState(() => (hasSeed ? seed : null));
  const [loading, setLoading] = useState(() => !hasSeed);

  useEffect(() => {
    let cancelled = false;
    const urlSeed = location.state?.contact;
    if (urlSeed && urlSeed.email === decodedEmail) {
      setContact(urlSeed);
      setLoading(false);
    } else {
      setContact(null);
      setLoading(true);
    }
    api.connections()
      .then((res) => {
        if (cancelled) return;
        const found = (res.data || []).find(
          (c) => c.suggestedUserEmail === decodedEmail
        );
        // Keep the seed if the request fails or finds nothing mid-flight —
        // only an explicit "not found" clears a seedless view.
        if (found) setContact(mapConnectionToContact(found, 0));
        else if (!urlSeed || urlSeed.email !== decodedEmail) setContact(null);
      })
      .catch(() => {
        if (!cancelled && (!urlSeed || urlSeed.email !== decodedEmail)) {
          setContact(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedEmail]);

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
