import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Select, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faAt } from "@fortawesome/free-solid-svg-icons";
import { faEnvelope, faUser } from "@fortawesome/free-regular-svg-icons";
import { PhoneOutlined } from "@ant-design/icons";
import {
  updateProfile,
  checkUsernameAvailable,
  suggestUsernames,
  getUsernameChangeInfo,
} from "../../Services/authService";
import { useAuth } from "../../context/AuthContext";
import { BIO_MAX_LENGTH } from "../../constants";
import ScrollDatePicker from "../shared/ScrollDatePicker";
import {
  birthDateValidator,
  toBirthDateParam,
  toBirthDatePickerValue,
} from "../../utils/dateUtils";
import "../css/profile-page.css";
import "../css/Auth.css";

// Username format: max 30 chars, lowercase a-z / 0-9 / _ / . only,
// cannot start or end with a period.
const USERNAME_RE = /^(?!\.)(?!.*\.$)[a-z0-9._]+$/;
const isUsernameFormatOk = (v) => !!v && v.length <= 30 && USERNAME_RE.test(v);

// Standalone edit page — opened from the header "Edit Profile" button.
// All editable details (username, name, gender, birth date, bio) save
// together in one update call. Email/phone are identity fields and
// stay read-only.
function EditProfilePage() {
  const { user, patchUser } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const bioValue = Form.useWatch("bio", form);
  const bioLen = (bioValue || "").length;

  // Save stays disabled until something actually changes.
  const allValues = Form.useWatch([], form);
  const isDirty = useMemo(() => {
    if (!allValues) return false;
    const norm = (v) => (v || "").toString().trim();
    if (norm(allValues.username).toLowerCase() !== norm(user?.username).toLowerCase())
      return true;
    if (norm(allValues.fullName) !== norm(user?.fullName)) return true;
    if ((allValues.gender || "") !== (user?.gender || "")) return true;
    const watchedBirth = allValues.birthDate
      ? toBirthDateParam(allValues.birthDate)
      : null;
    if ((watchedBirth || null) !== (user?.birthDate || null)) return true;
    if (norm(allValues.bio) !== norm(user?.bio)) return true;
    return false;
  }, [allValues, user]);

  // Live username availability + suggestions (debounced).
  const usernameValue = Form.useWatch("username", form);
  const fullNameValue = Form.useWatch("fullName", form);
  const [usernameStatus, setUsernameStatus] = useState(null); // checking | available | taken | null
  const [suggestions, setSuggestions] = useState([]);

  // Weekly username-change budget (max 2 per rolling 7 days).
  const [changeInfo, setChangeInfo] = useState(null);
  const usernameLocked = !!changeInfo && changeInfo.changesLeft <= 0;

  // Nothing shows by default — status, suggestions and budget appear
  // only when the typed username actually differs from the current one.
  const currentUsername = (user?.username || "").trim().toLowerCase();
  const typedUsername = (usernameValue || "").trim().toLowerCase();
  const isUsernameChanged = typedUsername !== "" && typedUsername !== currentUsername;

  useEffect(() => {
    getUsernameChangeInfo()
      .then((info) => setChangeInfo(info))
      .catch(() => setChangeInfo(null)); // best-effort — server still enforces
  }, []);

  useEffect(() => {
    if (!isUsernameChanged || usernameLocked) {
      setUsernameStatus(null);
      return;
    }
    const v = (usernameValue || "").trim();
    if (!v || !isUsernameFormatOk(v)) {
      setUsernameStatus(null);
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(v);
        setUsernameStatus(res?.available ? "available" : "taken");
      } catch {
        setUsernameStatus(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [usernameValue, usernameLocked, isUsernameChanged]);

  useEffect(() => {
    if (!isUsernameChanged || usernameLocked) {
      setSuggestions([]);
      return;
    }
    // "_" back to space so the server can offer "_", "." and compact variants.
    const rawBase = (usernameValue || "").trim() || (fullNameValue || "");
    const base = rawBase.replace(/_/g, " ");
    if (!base.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const list = await suggestUsernames(base, 5);
        const current = (usernameValue || "").trim();
        setSuggestions(
          Array.isArray(list) ? list.filter((s) => s !== current) : []
        );
      } catch {
        // Suggestions are best-effort — never block the form.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [usernameValue, fullNameValue, usernameLocked, isUsernameChanged]);

  const save = async (values) => {
    const username = (values.username || "").trim();
    const usernameChanged =
      username.toLowerCase() !== (user?.username || "").toLowerCase();
    if (!isUsernameFormatOk(username)) {
      message.error("Username: lowercase a-z, 0-9, _ and . only; max 30 chars; can't start/end with .");
      return;
    }
    if (usernameChanged && usernameLocked) {
      message.error("No username changes left this week — try again later.");
      return;
    }
    if (usernameStatus === "taken") {
      message.error("Username already taken — pick a suggestion below");
      return;
    }
    const bio = (values.bio || "").trim();
    if (bio.length > BIO_MAX_LENGTH) {
      message.error(`Bio must be ${BIO_MAX_LENGTH} characters or less`);
      return;
    }
    setSaving(true);
    try {
      const birthDate = values.birthDate
        ? toBirthDateParam(values.birthDate)
        : user?.birthDate;
      await updateProfile({
        ...(usernameChanged ? { username } : {}),
        fullName: values.fullName,
        gender: values.gender,
        ...(values.birthDate ? { birthDate } : {}),
        bio,
      });
      patchUser({
        ...(usernameChanged ? { username } : {}),
        fullName: values.fullName,
        gender: values.gender,
        birthDate,
        bio: bio === "" ? null : bio,
      });
      message.success("Profile updated");
      navigate("/profile", { replace: true });
    } catch (e) {
      message.error(e.response?.data?.message || "Update failed, try again");
    } finally {
      setSaving(false);
    }
  };

  // Smart back — returns to the previous page without piling up
  // history (same pattern as contact detail). Falls back to /profile
  // when the edit page was opened directly (no history).
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile", { replace: true });
  };

  return (
    <div className="nw-page pf-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">Edit profile</h2>
        </div>
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          className="pf-form-edit auth-form"
          autoComplete="off"
          initialValues={{
            username: user?.username,
            fullName: user?.fullName,
            gender: user?.gender,
            birthDate: toBirthDatePickerValue(user?.birthDate),
            bio: user?.bio || "",
          }}
        >
          {/* Row 1: Username + Full name */}
          <div className="pf-form-grid">
            <Form.Item
              className="auth-field pf-username-item"
              name="username"
              normalize={(v) => (v ? v.toLowerCase().replace(/\s+/g, "_") : v)}
              rules={[
                { required: true, message: "Please enter username!" },
                { max: 30, message: "Max 30 characters!" },
                {
                  pattern: USERNAME_RE,
                  message:
                    "Lowercase a-z, 0-9, _ and . only; can't start/end with .",
                },
              ]}
            >
              <Input
                className="auth-input"
                prefix={<FontAwesomeIcon icon={faAt} className="auth-input-icon" />}
                placeholder="Username"
                size="large"
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              className="auth-field pf-fullname-item"
              name="fullName"
              rules={[{ required: true, message: "Please enter full name!" }]}
            >
              <Input
                className="auth-input"
                prefix={<FontAwesomeIcon icon={faUser} className="auth-input-icon" />}
                placeholder="Full name"
                size="large"
                autoComplete="name"
              />
            </Form.Item>
            {/* Username feedback lives inside the row: full-width under the
                row on desktop, directly under username when stacked ≤600px */}
            <div className="pf-username-feedback">
              {isUsernameChanged && usernameStatus === "checking" && (
                <div className="pf-username-status pf-checking">
                  Checking availability…
                </div>
              )}
              {isUsernameChanged && usernameStatus === "available" && (
                <div className="pf-username-status pf-ok">✓ Username available</div>
              )}
              {isUsernameChanged && usernameStatus === "taken" && !usernameLocked && (
                <div className="pf-username-status pf-err">
                  This username is already taken. Try one of the suggestions below.
                </div>
              )}
              {isUsernameChanged &&
                suggestions.length > 0 &&
                usernameStatus !== "available" &&
                !usernameLocked && (
                  <div className="pf-suggest-row">
                    <span className="pf-suggest-label">Suggestions:</span>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="pf-suggest-chip"
                        onClick={() => form.setFieldsValue({ username: s })}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              {isUsernameChanged && changeInfo && changeInfo.changesLeft > 0 && (
                <div className="pf-username-status pf-budget">
                  {changeInfo.changesLeft} of {changeInfo.maxPerWeek} username
                  changes left this week
                </div>
              )}
              {isUsernameChanged && changeInfo && changeInfo.changesLeft <= 0 && (
                <div className="pf-username-status pf-err">
                  No username changes left this week
                  {changeInfo.nextAvailableAt
                    ? ` — try again after ${new Date(
                      changeInfo.nextAvailableAt
                    ).toLocaleDateString()}`
                    : ""}
                </div>
              )}
            </div>
          </div>
          {/* Row 2: Phone + Email */}
          <div className="pf-form-grid">
            <Form.Item className="auth-field">
              <Input
                className="auth-input"
                prefix={<PhoneOutlined className="auth-input-icon" />}
                placeholder="Phone"
                value={user?.phone || ""}
                disabled
                size="large"
              />
            </Form.Item>
            <Form.Item className="auth-field">
              <Input
                className="auth-input"
                prefix={<FontAwesomeIcon icon={faEnvelope} className="auth-input-icon" />}
                placeholder="Email"
                value={user?.email || ""}
                disabled
                size="large"
                inputMode="email"
              />
            </Form.Item>
          </div>
          {/* Row 3: Gender + Birth date */}
          <div className="pf-form-grid">
            <Form.Item
              className="auth-field"
              name="gender"
              rules={[{ required: true, message: "Please select gender!" }]}
            >
              <Select
                className="auth-input"
                placeholder="Gender"
                size="large"
                options={[
                  { value: "M", label: "Male" },
                  { value: "F", label: "Female" },
                ]}
              />
            </Form.Item>
            <Form.Item className="auth-field" name="birthDate" rules={[birthDateValidator()]}>
              <ScrollDatePicker placeholder="Birth Date" />
            </Form.Item>
          </div>
          {/* Row 4: About, full width */}
          <Form.Item className="auth-field" name="bio">
            <Input.TextArea
              className="pf-textarea"
              rows={4}
              maxLength={BIO_MAX_LENGTH}
              placeholder="Write a short bio..."
            />
          </Form.Item>
          <div className="pf-bio-count">
            {bioLen} / {BIO_MAX_LENGTH}
          </div>
          <Form.Item className="auth-field auth-submit" style={{ marginBottom: 0 }}>
            <div className="pf-form-actions">
              <button type="button" className="pf-ghost-btn" onClick={goBack}>
                Cancel
              </button>
              <button type="submit" className="pf-primary-btn" disabled={saving || !isDirty}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}

export default EditProfilePage;
