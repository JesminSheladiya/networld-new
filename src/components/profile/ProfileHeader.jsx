import { Avatar } from "antd";

// Shared profile header — identical structure for own + contact profiles
// (Facebook/Instagram style: cover, overlapping avatar, identity block).
// Owner-only things (camera upload, edit/remove actions) are passed in
// as slots, so they render only where provided.
function ProfileHeader({
  coverImage,
  avatarSrc,
  avatarBg = "#3b82f6",
  avatarText = "?",
  avatarSize = 120,
  onAvatarClick,
  cameraControl = null,
  name,
  meta = "",
  stat = null,
  actions = null,
}) {
  const clickable = !!avatarSrc && !!onAvatarClick;
  return (
    <div className="pf-card pf-head-card">
      <div
        className="pf-cover"
        style={coverImage ? { backgroundImage: `url(${coverImage})` } : undefined}
      />
      <div className="pf-head-body">
        <div className="pf-head-row">
          <div
            className="pf-avatar-wrap"
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
          <div className="pf-head-main">
            <h1 className="pf-name">{name}</h1>
            {meta && <div className="pf-meta">{meta}</div>}
            {stat && <div className="pf-stat-row">{stat}</div>}
            {actions && <div className="pf-head-actions">{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;
