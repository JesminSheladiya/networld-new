import { useState, useEffect, useRef } from "react";
import { Form, Input, Card, message, Typography, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { faAt, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { LockOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { register, checkUsernameAvailable, suggestUsernames } from "../Services/authService";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "./NetworkBackground";
import ScrollDatePicker from "./shared/ScrollDatePicker";
import { birthDateValidator, toBirthDateParam } from "../utils/dateUtils";
import "./css/Auth.css";
import "./css/profile-page.css";

const { Title } = Typography;

const USERNAME_RE = /^(?!\.)(?!.*\.$)[a-z0-9._]+$/;
const isUsernameFormatOk = (v) => !!v && v.length <= 30 && USERNAME_RE.test(v);

function Register() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const firstInputRef = useRef(null);
  const [form] = Form.useForm();

  // Same as profile update — stays disabled until every required field is filled.
  const values = Form.useWatch([], form);
  const registerReady = Boolean(
    values?.name?.trim() &&
      values?.username?.trim() &&
      values?.email?.trim() &&
      values?.phone?.trim() &&
      values?.password &&
      values?.confirmPassword &&
      values?.gender
  );

  // Live username availability + IG-style suggestions dropdown (debounced).
  const usernameValue = Form.useWatch("username", form);
  const fullNameValue = Form.useWatch("name", form);
  const [usernameStatus, setUsernameStatus] = useState(null); // checking | available | taken | null
  const [suggestions, setSuggestions] = useState([]);
  const [userFocused, setUserFocused] = useState(false);

  useEffect(() => {
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
  }, [usernameValue]);

  useEffect(() => {
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
        // Best-effort — never block the form.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [usernameValue, fullNameValue]);

  const showSuggestDrop =
    userFocused &&
    (usernameValue || "").trim() !== "" &&
    usernameStatus === "taken";

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const onFinish = async (values) => {
    const username = (values.username || "").trim();
    if (!isUsernameFormatOk(username)) {
      message.error("Username: lowercase a-z, 0-9, _ and . only; max 30 chars; can't start/end with .");
      return;
    }
    if (usernameStatus === "taken") {
      message.error("This username is already taken. Try one of the suggestions below.");
      return;
    }
    setLoading(true);
    try {
      const data = await register(
        username,
        values.email,
        values.phone,
        values.password,
        values.name.trim(),
        values.gender,
        toBirthDateParam(values.birthDate)
      );
      message.success(`Welcome, ${(data.fullName || "").trim().split(/\s+/)[0] || data.username}! Registration successful.`);
      authLogin();
      navigate("/contacts", { replace: true });
    } catch (error) {
      message.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Registration failed!"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <NetworkBackground />
      <div className="auth-vignette" />
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <Card className="auth-card auth-card-register">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <Title className="auth-title" level={2}>
            NetWorld Register
          </Title>
        </div>

        <Form form={form} className="auth-form" name="register" onFinish={onFinish} autoComplete="off" layout="vertical">
          <div className="auth-form-grid">
          <Form.Item
            className="auth-field"
            name="name"
            rules={[
              { required: true, message: "Please enter your full name!" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const words = value.trim().split(/\s+/);
                  if (words.length < 2)
                    return Promise.reject("Please enter at least 2 words (First Last)!");
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<FontAwesomeIcon icon={faUser} className="auth-input-icon" />}
              placeholder="Enter Name"
              size="large"
              ref={firstInputRef}
              autoComplete="name"
            />
          </Form.Item>

          <div className="auth-suggest-wrap">
          <Form.Item
            className="auth-field"
            name="username"
            normalize={(v) => (v ? v.toLowerCase().replace(/\s+/g, "_") : v)}
            rules={[
              { required: true, message: "Please enter username!" },
              { max: 30, message: "Max 30 characters!" },
              {
                pattern: /^(?!\.)(?!.*\.$)[a-z0-9._]+$/,
                message: "Lowercase a-z, 0-9, _ and . only; can't start/end with .",
              },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<FontAwesomeIcon icon={faAt} className="auth-input-icon" />}
              placeholder="Username"
              size="large"
              autoComplete="username"
              onFocus={() => setUserFocused(true)}
              onBlur={() => setUserFocused(false)}
            />
          </Form.Item>
          {(usernameValue || "").trim() !== "" && usernameStatus === "checking" && (
            <div className="auth-username-status auth-checking">Checking availability…</div>
          )}
          {(usernameValue || "").trim() !== "" && usernameStatus === "available" && (
            <div className="auth-username-status auth-ok">✓ Username available</div>
          )}
          {showSuggestDrop && (
            <div className="auth-suggest-drop">
              <div className="auth-suggest-error">
                This username is already taken. Try one below:
              </div>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="auth-suggest-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    form.setFieldsValue({ username: s });
                    setUserFocused(false);
                  }}
                >
                  <FontAwesomeIcon icon={faAt} className="auth-input-icon" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          )}
          </div>
          </div>

          <div className="auth-form-grid">
          <Form.Item
            className="auth-field"
            name="email"
            rules={[
              { required: true, message: "Please enter email!" },
              { type: "email", message: "Please enter a valid email!" },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<FontAwesomeIcon icon={faEnvelope} className="auth-input-icon" />}
              placeholder="Email"
              size="large"
              autoComplete="email"
              inputMode="email"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="phone"
            rules={[
              { required: true, message: "Please enter phone!" },
              { pattern: /^[0-9]{10}$/, message: "Phone must be 10 digits!" },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<PhoneOutlined className="auth-input-icon" />}
              placeholder="Phone (10 digits)"
              size="large"
            />
          </Form.Item>
          </div>

          <div className="auth-form-grid">
          <Form.Item
            className="auth-field"
            name="password"
            rules={[
              { required: true, message: "Please enter password!" },
              { min: 8, message: "Password must be at least 8 characters!" },
            ]}
          >
            <Input.Password
              className="auth-input"
              prefix={<LockOutlined className="auth-input-icon" />}
              placeholder="Password"
              size="large"
              iconRender={(visible) => (
                <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" style={{ color: '#3b82f6', cursor: 'pointer' }} />
              )}
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Please confirm password!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject("Passwords do not match!");
                },
              }),
            ]}
          >
            <Input.Password
              className="auth-input"
              prefix={<LockOutlined className="auth-input-icon" />}
              placeholder="Confirm Password"
              size="large"
              iconRender={(visible) => (
                <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" style={{ color: '#3b82f6', cursor: 'pointer' }} />
              )}
            />
          </Form.Item>
          </div>

          <div className="auth-form-grid">
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

          <Form.Item
            className="auth-field"
            name="birthDate"
            rules={[birthDateValidator()]}
          >
            <ScrollDatePicker placeholder="Birth Date (optional)" />
          </Form.Item>
          </div>

          <Form.Item className="auth-field auth-submit">
            <button
              type="submit"
              className="pf-primary-btn"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!registerReady || loading}
            >
              {loading ? "Registering..." : "Register"}
            </button>
          </Form.Item>
        </Form>

        <div className="auth-footer">
          <Typography.Text className="auth-footer-text">
            Already have an account?{" "}
            <button type="button" className="auth-switch-link" onClick={() => navigate("/login", { replace: true })}>
              Login here
            </button>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Register;