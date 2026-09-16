import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, message, Upload, Dropdown } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faCakeCandles, faEye, faEyeSlash, faArrowLeft, faTrashCan, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { faEnvelope, faUser } from "@fortawesome/free-regular-svg-icons";
import { PhoneOutlined, LockOutlined } from "@ant-design/icons";
import { updateProfile } from "../../Services/authService";
import { api } from "../../Services/networld";
import { useAuth } from "../../context/AuthContext";
import { avatarColorFor } from "../../constants";
import ProfilePictureViewer from "../ProfilePictureViewer";
import ProfilePictureEditor from "../ProfilePictureEditor";
import ProfileHeader from "./ProfileHeader";
import ConfirmPopup from "../shared/ConfirmPopup";
import { formatBirthDateWithAge } from "../../utils/dateUtils";
import "../css/profile-page.css";

const GENDER_LABEL = { M: "Male", F: "Female" };

function ProfilePage() {
  const { user, patchUser } = useAuth();
  const navigate = useNavigate();
  const [pwdForm] = Form.useForm();

  // About + Contact info are display-only here — all edits happen
  // on the standalone /profile/edit page.
  const [savingPwd, setSavingPwd] = useState(false);

  // Smart back — no history pile-up (same pattern as edit/contact pages).
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/contacts", { replace: true });
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSrc, setEditorSrc] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [removePhotoOpen, setRemovePhotoOpen] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverEditorSrc, setCoverEditorSrc] = useState(null);
  const [savingCover, setSavingCover] = useState(false);
  const [removeCoverOpen, setRemoveCoverOpen] = useState(false);
  const coverFileRef = useRef(null);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  // Mutual exclusion: viewer and dropdown never open together. The timestamp
  // covers the race where the menu closes (outside click) just before the
  // cover click handler runs.
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const menuClosedAtRef = useRef(0);

  // Mobile (<=480px): icon + dropdown only — the pill doesn't fit there.
  const [isMobileCover, setIsMobileCover] = useState(
    () => window.matchMedia("(max-width: 480px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const onChange = (e) => setIsMobileCover(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openCoverViewer = () => {
    if (coverMenuOpen) return;
    if (Date.now() - menuClosedAtRef.current < 350) return;
    setCoverViewerOpen(true);
  };
  const [connCount, setConnCount] = useState(null);
  const [suggCount, setSuggCount] = useState(null);

  useEffect(() => {
    api
      .connectionCounts("")
      .then((res) => setConnCount(res.data?.all ?? 0))
      .catch(() => setConnCount(null));
    api
      .suggestions()
      .then((res) => setSuggCount(Array.isArray(res.data) ? res.data.length : 0))
      .catch(() => setSuggCount(null));
  }, []);

  const fullName = user?.fullName || user?.username || "User";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Server echoes back exactly what we send (bio trimmed, blanks cleared),
  // so merge locally — no refetch flash, no avatar reload blink.

  // Contact info is display-only — no edit/save here.

  // Update stays disabled until every password field is filled.
  const pwdValues = Form.useWatch([], pwdForm);
  const pwdReady = Boolean(
    pwdValues?.currentPassword?.trim() &&
    pwdValues?.newPassword &&
    pwdValues?.confirmPassword
  );

  const savePassword = async (values) => {
    setSavingPwd(true);
    try {
      await updateProfile({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      message.success("Password updated");
      pwdForm.resetFields();
    } catch (e) {
      message.error(e.response?.data?.message || "Update failed, try again");
    } finally {
      setSavingPwd(false);
    }
  };

  // ── Photo ──
  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleImageSelect = (file) => {
    if (!file.type.startsWith("image/")) {
      message.error("Images only!");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("Image size must be 5 MB or less.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setEditorSrc(e.target.result);
      setEditorOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditorSave = useCallback(
    async (blob) => {
      const base64 = await blobToBase64(blob);
      setEditorOpen(false);
      setEditorSrc(null);
      setSavingPhoto(true);
      try {
        await updateProfile({ profilePicture: base64 });
        patchUser({ profilePicture: base64 });
        message.success("Profile photo updated");
      } catch (e) {
        message.error(e.response?.data?.message || "Photo update failed, try again");
      } finally {
        setSavingPhoto(false);
      }
    },
    [patchUser]
  );

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false);
    setEditorSrc(null);
  }, []);

  const confirmRemovePhoto = async () => {
    setRemovePhotoOpen(false);
    setSavingPhoto(true);
    try {
      await updateProfile({ profilePicture: "" });
      patchUser({ profilePicture: "" });
      message.success("Profile photo removed");
    } catch (e) {
      message.error(e.response?.data?.message || "Photo removal failed, try again");
    } finally {
      setSavingPhoto(false);
    }
  };

  // ── Cover ── same flow as profile photo, fixed 3:1 crop
  const handleCoverSelect = (file) => {
    if (!file.type.startsWith("image/")) {
      message.error("Images only!");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("Image size must be 5 MB or less.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCoverEditorSrc(e.target.result);
      setCoverEditorOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCoverSave = useCallback(
    async (blob) => {
      const base64 = await blobToBase64(blob);
      setCoverEditorOpen(false);
      setCoverEditorSrc(null);
      setSavingCover(true);
      try {
        await updateProfile({ coverImage: base64 });
        patchUser({ coverImage: base64 });
        message.success("Cover photo updated");
      } catch (e) {
        message.error(e.response?.data?.message || "Cover update failed, try again");
      } finally {
        setSavingCover(false);
      }
    },
    [patchUser]
  );

  const handleCoverClose = useCallback(() => {
    setCoverEditorOpen(false);
    setCoverEditorSrc(null);
  }, []);

  const confirmRemoveCover = async () => {
    setRemoveCoverOpen(false);
    setSavingCover(true);
    try {
      await updateProfile({ coverImage: "" });
      patchUser({ coverImage: "" });
      message.success("Cover photo removed");
    } catch (e) {
      message.error(e.response?.data?.message || "Cover removal failed, try again");
    } finally {
      setSavingCover(false);
    }
  };

  // Cover menu actions (same look as the avatar dropdown menu)
  const closeCoverMenu = () => {
    setCoverMenuOpen(false);
    menuClosedAtRef.current = Date.now();
  };

  const infoRows = [
    { label: "Phone", value: user?.phone || "—", icon: <PhoneOutlined /> },
    { label: "Email", value: user?.email || "—", icon: <FontAwesomeIcon icon={faEnvelope} /> },
    { label: "Gender", value: GENDER_LABEL[user?.gender] || "—", icon: <FontAwesomeIcon icon={faUser} /> },
    ...(user?.birthDate
      ? [{ label: "Birth Date", value: formatBirthDateWithAge(user.birthDate), icon: <FontAwesomeIcon icon={faCakeCandles} /> }]
      : []),
  ];

  return (
    <div className="nw-page pf-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>
      {/* Sketch header: cover + divider + overlapping avatar + identity + stats. */}
      <ProfileHeader
        coverImage={user?.coverImage}
        avatarSrc={user?.profilePicture}
        avatarBg={avatarColorFor(fullName)}
        avatarText={initials}
        onAvatarClick={() => setViewerOpen(true)}
        cameraControl={
          <Upload
            showUploadList={false}
            customRequest={() => { }}
            beforeUpload={(file) => {
              handleImageSelect(file);
              return Upload.LIST_IGNORE;
            }}
          >
            <button
              className="pf-camera-btn"
              aria-label="Edit profile photo"
              disabled={savingPhoto}
            >
              <FontAwesomeIcon icon={faCamera} />
            </button>
          </Upload>
        }
        name={fullName}
        username={user?.username}
        email={user?.email}
        phone={user?.phone}
        connectionsCount={connCount}
        suggestionsCount={suggCount}
        onConnectionsClick={() => navigate("/contacts")}
        onSuggestionsClick={() => navigate("/discover/suggestions")}
        belowAvatarAction={
          user?.profilePicture ? (
            <button
              className="pf-sk-remove"
              onClick={() => setRemovePhotoOpen(true)}
            >
              Remove Profile
            </button>
          ) : null
        }
        coverControl={
          <div className="pf-cover-actions">
            {user?.coverImage || isMobileCover ? (
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                popupClassName="nw-profile-popup"
                open={coverMenuOpen}
                onOpenChange={(open) => {
                  setCoverMenuOpen(open);
                  if (!open) menuClosedAtRef.current = Date.now();
                }}
                dropdownRender={() => (
                  <div className="nw-profile-dropdown pf-cover-dropdown">
                    <div className="nw-profile-actions">
                      {user?.coverImage ? (
                        <>
                          <button
                            className="nw-profile-action"
                            onClick={() => {
                              closeCoverMenu();
                              coverFileRef.current?.click();
                            }}
                          >
                            <span className="nw-profile-action-icon">
                              <FontAwesomeIcon icon={faCamera} />
                            </span>
                            <span>Edit cover</span>
                          </button>
                          <button
                            className="nw-profile-action nw-profile-logout"
                            onClick={() => {
                              closeCoverMenu();
                              setRemoveCoverOpen(true);
                            }}
                          >
                            <span className="nw-profile-action-icon">
                              <FontAwesomeIcon icon={faTrashCan} />
                            </span>
                            <span>Remove cover</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="nw-profile-action"
                          onClick={() => {
                            closeCoverMenu();
                            coverFileRef.current?.click();
                          }}
                        >
                          <span className="nw-profile-action-icon">
                            <FontAwesomeIcon icon={faCamera} />
                          </span>
                          <span>Upload cover</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              >
                <button
                  className="pf-cover-menu-btn"
                  aria-label="Cover photo options"
                  disabled={savingCover}
                >
                  <FontAwesomeIcon icon={faEllipsisVertical} />
                </button>
              </Dropdown>
            ) : (
              <button
                className="pf-cover-btn pf-edit-btn-sm"
                aria-label="Upload cover photo"
                disabled={savingCover}
                onClick={() => coverFileRef.current?.click()}
              >
                <FontAwesomeIcon icon={faCamera} className="pf-edit-icon" /> Upload cover photo
              </button>
            )}
            <input
              ref={coverFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCoverSelect(f);
                e.target.value = "";
              }}
            />
          </div>
        }
        onEditClick={() => navigate("/profile/edit")}
        onCoverClick={openCoverViewer}
      />

      <div className="pf-grid">
        <div className="pf-main">
          {/* ── About / bio card ── display-only, edits on /profile/edit */}
          <div className="pf-card pf-about-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">About</h2>
            </div>
            <p className="pf-bio-text">{user?.bio || <span className="pf-placeholder">Add a short bio so people know you better.</span>}</p>
          </div>

          {/* ── Contact info card ── display-only */}
          <div className="pf-card pf-contact-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">Contact info</h2>
            </div>
            <div className="pf-info-rows">
              {infoRows.map(({ label, value, icon }) => (
                <div className="pf-info-row" key={label}>
                  <span className="pf-info-icon">{icon}</span>
                  <span className="pf-info-text">
                    <span className="pf-info-label">{label}</span>
                    <span className="pf-info-value">{value}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pf-side">
          {/* ── Security card ── */}
          <div className="pf-card pf-password-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">Change password</h2>
            </div>
            <Form form={pwdForm} layout="vertical" onFinish={savePassword} className="pf-form">
              <Form.Item name="currentPassword" label="Current password">
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="••••••••"
                  size="middle"
                  iconRender={(visible) => (
                    <FontAwesomeIcon
                      icon={visible ? faEye : faEyeSlash}
                      className="auth-input-icon"
                      style={{ color: "#3b82f6", cursor: "pointer" }}
                    />
                  )}
                />
              </Form.Item>
              <Form.Item name="newPassword" label="New password" rules={[{ min: 8, message: "At least 8 characters!" }]}>
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="Min 8 characters"
                  size="middle"
                  iconRender={(visible) => (
                    <FontAwesomeIcon
                      icon={visible ? faEye : faEyeSlash}
                      className="auth-input-icon"
                      style={{ color: "#3b82f6", cursor: "pointer" }}
                    />
                  )}
                />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm new password"
                dependencies={["newPassword"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value && !getFieldValue("newPassword")) return Promise.resolve();
                      if (value !== getFieldValue("newPassword")) return Promise.reject("Passwords do not match!");
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="Repeat it"
                  size="middle"
                  iconRender={(visible) => (
                    <FontAwesomeIcon
                      icon={visible ? faEye : faEyeSlash}
                      className="auth-input-icon"
                      style={{ color: "#3b82f6", cursor: "pointer" }}
                    />
                  )}
                />
              </Form.Item>
              <div className="pf-actions">
                <span className="pf-hint">Use at least 8 characters — mix letters, numbers &amp; symbols.</span>
                <button type="submit" className="pf-primary-btn" disabled={!pwdReady || savingPwd}>
                  {savingPwd ? "Updating..." : "Update password"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      </div>

      <ProfilePictureViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        src={user?.profilePicture}
        name={fullName}
      />
      <ProfilePictureViewer
        open={coverViewerOpen}
        onClose={() => setCoverViewerOpen(false)}
        src={user?.coverImage}
        name={fullName}
        alt="Cover full view"
        maxWidth="min(960px, 100%)"
      />
      <ProfilePictureEditor
        open={editorOpen}
        onClose={handleEditorClose}
        onSave={handleEditorSave}
        src={editorSrc}
      />
      <ProfilePictureEditor
        open={coverEditorOpen}
        onClose={handleCoverClose}
        onSave={handleCoverSave}
        src={coverEditorSrc}
        aspect={3}
        outputWidth={1200}
        outputHeight={400}
        stageAspect={2}
        modalWidth={640}
        title="Edit cover"
      />
      <ConfirmPopup
        open={removePhotoOpen}
        title="Remove photo?"
        message="Your profile picture will be removed."
        okText="Remove"
        onCancel={() => setRemovePhotoOpen(false)}
        onOk={confirmRemovePhoto}
      />
      <ConfirmPopup
        open={removeCoverOpen}
        title="Remove cover?"
        message="Your cover photo will be removed."
        okText="Remove"
        onCancel={() => setRemoveCoverOpen(false)}
        onOk={confirmRemoveCover}
      />
    </div>
  );
}

export default ProfilePage;
