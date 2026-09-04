import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Spin } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import ContactProfile from "../shared/ContactProfile";

function ContactDetailPage() {
  const navigate = useNavigate();
  const { email } = useParams();
  const location = useLocation();

  const [contact, setContact] = useState(location.state?.contact || null);
  const [loading, setLoading] = useState(!contact);

  const decodedEmail = email ? decodeURIComponent(email) : "";

  useEffect(() => {
    if (contact) return;
    api.connections()
      .then((res) => {
        const found = res.data.find((c) => c.suggestedUserEmail === decodedEmail);
        if (found) {
          setContact({
            key: 0,
            name: found.suggestedUserName || "",
            email: found.suggestedUserEmail || "",
            phone: found.suggestedUserPhone || "",
            profilePicture: found.suggestedUserProfilePic || null,
            relation: found.inferredRelation || "",
            relationId: found.pendingRelationId ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="nw-page"><div className="nw-state-box"><Spin size="large" /><span className="nw-state-text">Loading contact...</span></div></div>
    );
  }

  if (!contact) {
    return (
      <div className="nw-page">
        <div className="nw-state-box">
          <UserOutlined style={{ fontSize: 40, color: "#475569" }} />
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
      />
    </div>
  );
}

export default ContactDetailPage;