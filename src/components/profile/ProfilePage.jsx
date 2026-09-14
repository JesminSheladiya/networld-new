import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, message, Upload, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faPenToSquare, faCamera, faCakeCandles, faEye, faEyeSlash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { PhoneOutlined } from "@ant-design/icons";
import { updateProfile } from "../../Services/authService";
import { api } from "../../Services/networld";
import { useAuth } from "../../context/AuthContext";
import { avatarColorFor, BIO_MAX_LENGTH } from "../../constants";
import ProfilePictureViewer from "../ProfilePictureViewer";
import ProfilePictureEditor from "../ProfilePictureEditor";
import ProfileHeader from "./ProfileHeader";
import ConfirmPopup from "../shared/ConfirmPopup";
import ScrollDatePicker from "../shared/ScrollDatePicker";
import {
  formatBirthDateWithAge,
  birthDateValidator,
  toBirthDateParam,
  toBirthDatePickerValue,
} from "../../utils/dateUtils";
import "../css/profile-page.css";

const GENDER_LABEL = { M: "Male", F: "Female" };

function ProfilePage() {
  const { user, patchUser } = useAuth();
  const navigate = useNavigate();
  const [detailsForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  // Single edit mode: bio + details share one Edit / Save / Cancel.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [bioDraft, setBioDraft] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSrc, setEditorSrc] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [removePhotoOpen, setRemovePhotoOpen] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [connCount, setConnCount] = useState(null);

  useEffect(() => {
    api
      .connectionCounts("")
      .then((res) => setConnCount(res.data?.all ?? 0))
      .catch(() => setConnCount(null));
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

  useEffect(() => {
    if (editing) {
      setBioDraft(user?.bio || "");
      detailsForm.setFieldsValue({
        fullName: user?.fullName,
        phone: user?.phone,
        gender: user?.gender,
        birthDate: toBirthDatePickerValue(user?.birthDate),
      });
    }
  }, [editing, user, detailsForm]);

  const startEdit = () => setEditing(true);

  const cancelEdit = () => {
    detailsForm.resetFields();
    setEditing(false);
  };

  // One request saves bio + details together; one toast, no refetch flash.
  const saveAll = async (values) => {
    const bio = bioDraft.trim();
    if (bio.length > BIO_MAX_LENGTH) {
      message.error(`Bio must be ${BIO_MAX_LENGTH} characters or less`);
      return;
    }
    setSaving(true);
    try {
      const birthDate = values.birthDate ? toBirthDateParam(values.birthDate) : user?.birthDate;
      await updateProfile({
        bio,
        fullName: values.fullName,
        phone: values.phone,
        gender: values.gender,
        ...(values.birthDate ? { birthDate } : {}),
      });
      patchUser({
        bio: bio === "" ? null : bio,
        fullName: values.fullName,
        phone: values.phone,
        gender: values.gender,
        birthDate,
      });
      message.success("Profile updated");
      setEditing(false);
    } catch (e) {
      message.error(e.response?.data?.message || "Update failed, try again");
    } finally {
      setSaving(false);
    }
  };

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
      {/* Same header as contact profiles — owner-only slots gated below. */}
      <ProfileHeader
        coverImage={user?.coverImage}
        avatarSrc={user?.profilePicture}
        avatarBg={avatarColorFor(fullName)}
        avatarText={initials}
        onAvatarClick={() => setViewerOpen(true)}
        cameraControl={
          <Upload
            showUploadList={false}
            customRequest={() => {}}
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
        meta={[user?.email, user?.phone].filter(Boolean).join("  ·  ")}
        stat={
          connCount !== null &&
          connCount > 0 && (
            <button className="pf-stat" onClick={() => navigate("/contacts")}>
              {connCount} {connCount === 1 ? "connection" : "connections"}
            </button>
          )
        }
        actions={
          editing ? (
            <>
              <button className="pf-ghost-btn" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className="pf-primary-btn"
                onClick={() => detailsForm.submit()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button className="pf-ghost-btn" onClick={startEdit}>
                <FontAwesomeIcon icon={faPenToSquare} /> Edit profile
              </button>
              {user?.profilePicture && (
                <button
                  className="pf-ghost-btn pf-ghost-danger"
                  onClick={() => setRemovePhotoOpen(true)}
                >
                  Remove
                </button>
              )}
            </>
          )
        }
      />

      <div className="pf-grid">
        <div className="pf-main">
      {/* ── About / bio card ── */}
      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">About</h2>
          {!editing && (
            <button className="pf-edit-btn" aria-label="Edit profile" onClick={startEdit}>
              <FontAwesomeIcon icon={faPenToSquare} /> Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="pf-bio-edit">
            <Input.TextArea
              className="pf-textarea"
              rows={4}
              maxLength={BIO_MAX_LENGTH}
              showCount
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              placeholder="Write a short bio..."
            />
          </div>
        ) : (
          <p className="pf-bio-text">{user?.bio || <span className="pf-placeholder">Add a short bio so people know you better.</span>}</p>
        )}
      </div>

      {/* ── Security card ── */}
      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">Change password</h2>
        </div>
        <Form form={pwdForm} layout="vertical" onFinish={savePassword} className="pf-form">
          <Form.Item name="currentPassword" label="Current password">
            <Input.Password
              className="auth-input"
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
          <div className="pf-form-grid">
            <Form.Item name="newPassword" label="New password" rules={[{ min: 8, message: "At least 8 characters!" }]}>
              <Input.Password
                className="auth-input"
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
          </div>
          <div className="pf-actions">
            <span className="pf-hint">Use at least 8 characters — mix letters, numbers &amp; symbols.</span>
            <button type="submit" className="pf-primary-btn" disabled={!pwdReady || savingPwd}>
              {savingPwd ? "Updating..." : "Update password"}
            </button>
          </div>
        </Form>
      </div>
        </div>
        <div className="pf-side">
      {/* ── Contact info card ── */}
      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">Contact info</h2>
          {!editing && (
            <button className="pf-edit-btn" aria-label="Edit profile" onClick={startEdit}>
              <FontAwesomeIcon icon={faPenToSquare} /> Edit
            </button>
          )}
        </div>
        {editing ? (
          <Form form={detailsForm} layout="vertical" onFinish={saveAll} className="pf-form pf-form-compact">
            <Form.Item name="fullName" rules={[{ required: true, message: "Please enter full name!" }]}>
              <Input
                className="auth-input"
                prefix={<FontAwesomeIcon icon={faUser} className="auth-input-icon" />}
                placeholder="Full name"
                size="middle"
              />
            </Form.Item>
            <Form.Item
              name="phone"
              rules={[{ pattern: /^[0-9]{10}$/, message: "Phone must be 10 digits!" }]}
            >
              <Input
                className="auth-input"
                prefix={<PhoneOutlined className="auth-input-icon" />}
                placeholder="10-digit phone"
                size="middle"
              />
            </Form.Item>
            <Form.Item name="gender" rules={[{ required: true, message: "Please select gender!" }]}>
              <Select
                className="auth-input"
                placeholder="Select gender"
                size="middle"
                options={[
                  { value: "M", label: "Male" },
                  { value: "F", label: "Female" },
                ]}
              />
            </Form.Item>
            <Form.Item name="birthDate" rules={[birthDateValidator()]}>
              <ScrollDatePicker placeholder="Birth date" />
            </Form.Item>
          </Form>
        ) : (
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
            {connCount > 0 && (
              <div className="pf-info-row">
                <span className="pf-info-icon"><FontAwesomeIcon icon={faUsers} /></span>
                <span className="pf-info-text">
                  <span className="pf-info-label">Connections</span>
                  <button className="pf-stat" onClick={() => navigate("/contacts")}>
                    {connCount} {connCount === 1 ? "connection" : "connections"}
                  </button>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

        </div>
      </div>

      <ProfilePictureViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        src={user?.profilePicture}
        name={fullName}
      />
      <ProfilePictureEditor
        open={editorOpen}
        onClose={handleEditorClose}
        onSave={handleEditorSave}
        src={editorSrc}
      />
      <ConfirmPopup
        open={removePhotoOpen}
        title="Remove photo?"
        message="Your profile picture will be removed."
        okText="Remove"
        onCancel={() => setRemovePhotoOpen(false)}
        onOk={confirmRemovePhoto}
      />
    </div>
  );
}

export default ProfilePage;
