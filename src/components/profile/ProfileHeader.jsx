import { Avatar } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";

// Shared profile header — sketch layout:
// cover on top, full-width divider line, avatar overlapping the line
// on the left, identity (name/email/phone) next to avatar,
// stats (Connections / Suggestions) on the right,
// optional red text action centered under the avatar.
function ProfileHeader({
  coverImage,
  avatarSrc,
  avatarBg = "#3b82f6",
  avatarText = "?",
  avatarSize = 120,
  onAvatarClick,
  cameraControl = null,
  name,
  username,
  email = "",
  phone = "",
  meta = "",
  connectionsCount = null,
  suggestionsCount = null,
  onConnectionsClick,
  onSuggestionsClick,
  stat = null,
  actions = null,
  belowAvatarAction = null,
  onEditClick,  // NEW: edit profile click handler
  coverControl = null, // owner-only cover upload/edit button (bottom-right)
  onCoverClick, // cover fullscreen viewer
}) {
  const clickable = !!avatarSrc && !!onAvatarClick;
  const coverClickable = !!coverImage && !!onCoverClick;
  const showStats =
    connectionsCount !== null ||
    suggestionsCount !== null ||
    stat !== null;
  return (
    <div className="pf-card pf-head-card pf-sk-card">
      <div
        className={`pf-cover pf-sk-cover${coverImage ? " pf-cover-has-image" : ""}`}
        style={coverImage ? { backgroundImage: `url(${coverImage})` } : undefined}
        onClick={
          coverClickable
            ? (e) => {
                // Cover menu clicks stay on their own trigger.
                if (e.target.closest(".pf-cover-actions")) return;
                onCoverClick();
              }
            : undefined
        }
        role={coverClickable ? "button" : undefined}
        aria-label={coverClickable ? "View cover photo" : undefined}
        tabIndex={coverClickable ? 0 : undefined}
        onKeyDown={
          coverClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onCoverClick();
              }
            : undefined
        }
      >
        {coverControl}
      </div>
      {/* Divider line — avatar sits centered on it */}
      <div className="pf-sk-divider">
        <div className="pf-sk-row">
          <div className="pf-sk-left">
            <div
              className="pf-avatar-wrap pf-sk-avatar"
              onClick={
                clickable
                  ? (e) => {
                      // Camera/upload clicks must reach their own trigger
                      // (file dialog) — everything else opens the viewer.
                      if (e.target.closest(".pf-camera-btn")) return;
                      onAvatarClick();
                    }
                  : undefined
              }
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <Avatar
                size={avatarSize}
                src={avatarSrc || null}
                style={{
                  backgroundColor: avatarSrc ? "transparent" : avatarBg,
                  fontSize: 42,
                  fontWeight: 700,
                  color: "#fff",
                  border: "4px solid #0d1526",
                }}
              >
                {!avatarSrc && avatarText}
              </Avatar>
              {cameraControl}
            </div>
            {(belowAvatarAction || actions) && (
              <div className="pf-sk-under">
                {belowAvatarAction}
                {actions}
              </div>
            )}
          </div>
          <div className="pf-sk-identity">
            <h1 className="pf-name">{name}</h1>
            {username && <div className="pf-sk-username">@{username}</div>}
            {meta && <div className="pf-meta">{meta}</div>}
            {onEditClick && (
              <button
                className="pf-edit-btn-sm"
                onClick={onEditClick}
                aria-label="Edit profile"
              >
                <FontAwesomeIcon icon={faPenToSquare} className="pf-edit-icon" /> Edit Profile
              </button>
            )}
          </div>
          {showStats && (
            <div className="pf-sk-stats">
              {connectionsCount !== null && (
                <button
                  className="pf-sk-stat"
                  onClick={onConnectionsClick}
                  disabled={!onConnectionsClick}
                >
                  <span className="pf-sk-stat-num">{connectionsCount}</span>
                  <span className="pf-sk-stat-label">Connections</span>
                </button>
              )}
              {suggestionsCount !== null && (
                <button
                  className="pf-sk-stat"
                  onClick={onSuggestionsClick}
                  disabled={!onSuggestionsClick}
                >
                  <span className="pf-sk-stat-num">{suggestionsCount}</span>
                  <span className="pf-sk-stat-label">Suggestions</span>
                </button>
              )}
              {stat && <div className="pf-sk-stat-custom">{stat}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;
