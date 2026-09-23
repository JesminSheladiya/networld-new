import { useState } from "react";
import { Switch, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { updateProfile } from "../../Services/authService";
import { useAuth } from "../../context/AuthContext";

// Privacy toggles — instant save per switch. Rendered on the profile page
// above the Danger Zone entry.
function PrivacyCard() {
  const { user, patchUser } = useAuth();
  const [privacy, setPrivacy] = useState({
    hideCover: !!user?.hideCover,
    hideConnections: !!user?.hideConnections,
    hideContactInfo: !!user?.hideContactInfo,
  });
  const [savingKey, setSavingKey] = useState(null);

  const togglePrivacy = async (key) => {
    if (savingKey) return;
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    setSavingKey(key);
    try {
      await updateProfile({ [key]: next[key] });
      patchUser({ [key]: next[key] });
      if (next.hideCover && next.hideConnections && next.hideContactInfo) {
        message.success("Full privacy enabled");
      }
    } catch (e) {
      setPrivacy(privacy);
      message.error(e.response?.data?.message || "Could not update privacy, try again");
    } finally {
      setSavingKey(null);
    }
  };

  const rows = [
    {
      key: "hideCover",
      title: "Private cover photo",
      sub: "Hide my cover photo from other users",
    },
    {
      key: "hideConnections",
      title: "Private connections",
      sub: "Hide your connections list from other users",
    },
    {
      key: "hideContactInfo",
      title: "Private contact info",
      sub: "Hide phone, email, gender and birth date from other users",
    },
  ];

  return (
    <div className="pf-card">
      <div className="pf-card-head">
        <h2 className="pf-card-title">
          <span className="pf-card-ico"><FontAwesomeIcon icon={faShieldHalved} /></span>
          Privacy
        </h2>
      </div>
      <div className="pf-privacy-rows">
        {rows.map(({ key, title, sub }) => (
          <div className="pf-privacy-row" key={key}>
            <span className="pf-privacy-text">
              <span className="pf-privacy-name">{title}</span>
              <span className="pf-privacy-sub">{sub}</span>
            </span>
            <Switch
              checked={!!privacy[key]}
              disabled={savingKey !== null}
              loading={savingKey === key}
              onChange={() => togglePrivacy(key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PrivacyCard;
