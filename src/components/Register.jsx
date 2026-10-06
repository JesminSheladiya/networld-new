import { useState, useEffect, useRef } from "react";
import { Form, Input, Card, message, Typography, Select, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { faAt, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { LockOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { register, checkUsernameAvailable, checkEmailAvailable, checkPhoneAvailable, suggestUsernames, updateProfile, requestOtp, verifyOtp, resendOtp } from "../Services/authService";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "./NetworkBackground";
import ScrollDatePicker from "./shared/ScrollDatePicker";
import { birthDateValidator, toBirthDateParam } from "../utils/dateUtils";
import "./css/Auth.css";
import "./css/profile-page.css";

const { Title } = Typography;

const USERNAME_RE = /^(?!\.)(?!.*\.$)[a-z0-9._]+$/;
const isUsernameFormatOk = (v) => !!v && v.length <= 30 && USERNAME_RE.test(v);
const isEmailFormatOk = (v) => !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
const isPhoneFormatOk = (v) => !!v && /^[0-9]{10}$/.test((v || "").trim());

function Register() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authLogin } = useAuth();
  const firstInputRef = useRef(null);
  const [form] = Form.useForm();

  // ── Step wizard ──
  const [step, setStep] = useState(1);
  // Step-1 fields unmount on step 2 (values drop out of `vals`), so keep
  // a snapshot taken at Next — onFinish reads step-1 data from here.
  const [step1Data, setStep1Data] = useState({ name: "", phone: "", email: "" });

  // ── OTP state (6 boxes, same 44px height as all inputs) ──
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Prefill email when redirected from login (unverified account).
  useEffect(() => {
    if (location.state?.email) {
      form.setFieldsValue({ email: location.state.email });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cooldown timer for resend.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Step-2 readiness — same rule as before, stays disabled until filled.
  const values = Form.useWatch([], form);
  const registerReady = Boolean(
    values?.username?.trim() &&
    values?.password &&
    values?.confirmPassword &&
    values?.gender
  );

  // Live username availability + IG-style suggestions dropdown (debounced).
  const usernameValue = Form.useWatch("username", form);
  const fullNameValue = Form.useWatch("name", form);
  const emailValue = Form.useWatch("email", form);
  const phoneValue = Form.useWatch("phone", form);
  const [usernameStatus, setUsernameStatus] = useState(null); // checking | available | taken | null
  const [emailStatus, setEmailStatus] = useState(null); // checking | available | taken | null
  const [phoneStatus, setPhoneStatus] = useState(null); // checking | available | taken | null
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

  // Instant email availability — same pattern as username.
  useEffect(() => {
    const v = (emailValue || "").trim();
    if (otpVerified) {
      setEmailStatus(null);
      return;
    }
    if (!v || !isEmailFormatOk(v)) {
      setEmailStatus(null);
      return;
    }
    setEmailStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await checkEmailAvailable(v);
        const available = !!res?.available;
        setEmailStatus(available ? "available" : "taken");
        if (available) {
          const errs = form.getFieldError("email") || [];
          if (errs.some((e) => /already exists/i.test(e))) {
            form.setFields([{ name: "email", errors: [] }]);
          }
        }
      } catch {
        setEmailStatus(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [emailValue, otpVerified, form]);

  // Instant phone availability — same pattern as username.
  useEffect(() => {
    const v = (phoneValue || "").trim();
    if (!v || !isPhoneFormatOk(v)) {
      setPhoneStatus(null);
      return;
    }
    setPhoneStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await checkPhoneAvailable(v);
        const available = !!res?.available;
        setPhoneStatus(available ? "available" : "taken");
        if (available) {
          // Clear a stale "taken" inline error as soon as the number becomes free.
          const errs = form.getFieldError("phone") || [];
          if (errs.some((e) => /already exists/i.test(e))) {
            form.setFields([{ name: "phone", errors: [] }]);
          }
        }
      } catch {
        setPhoneStatus(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [phoneValue, form]);

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

  const otpCode = otpDigits.join("");
  const otpComplete = otpCode.length === 6;

  const resetOtp = () => {
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpSent(false);
    setOtpVerified(false);
    setCooldown(0);
  };

  const errMsg = (error, fallback) => {
    const data = error.response?.data;
    // Jakarta @Valid failures come as { message: "Validation failed", errors: { field: msg } }.
    // Flatten so the user sees the real reason instead of a generic message.
    if (data?.errors && typeof data.errors === "object") {
      const first = Object.values(data.errors).find(Boolean);
      if (first) return first;
    }
    return data?.error || data?.message || fallback;
  };

  const handleSendOtp = async (isResend = false) => {
    try {
      const { email } = await form.validateFields(["email"]);
      if (!isEmailFormatOk(email)) {
        message.error("Please enter a valid email!");
        return;
      }
      if (emailStatus === "taken") {
        form.setFields([{ name: "email", errors: ["Email already exists. Please login."] }]);
        message.error("Email already exists. Please login.");
        return;
      }
      if (emailStatus === "checking") {
        message.error("Checking email availability, please wait...");
        return;
      }
      setSendLoading(true);
      if (isResend) {
        await resendOtp(email.trim());
        message.success("OTP resent to your email.");
      } else {
        await requestOtp(email.trim());
        message.success("OTP sent to your email.");
      }
      if (!isResend) {
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpVerified(false);
      }
      setOtpSent(true);
      setCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (error) {
      if (error?.errorFields) return; // antd validation, message shown inline
      const msg = errMsg(error, "Failed to send OTP!");
      message.error(msg);
      if (/already exists|already sent|please login/i.test(msg)) {
        form.setFields([{ name: "email", errors: [msg] }]);
      }
    } finally {
      setSendLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    const d = val.replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[idx] = d;
      return next;
    });
    if (d && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const nums = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!nums) return;
    e.preventDefault();
    setOtpDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) next[i] = nums[i] || next[i] || "";
      return next;
    });
    otpRefs.current[Math.min(nums.length, 5)]?.focus();
  };

  const handleVerifyOtp = async () => {
    const email = (form.getFieldValue("email") || "").trim();
    if (!isEmailFormatOk(email)) {
      message.error("Please enter a valid email first!");
      return;
    }
    if (!otpComplete) {
      message.error("Please enter the 6-digit OTP!");
      return;
    }
    setVerifyLoading(true);
    try {
      await verifyOtp(email, otpCode);
      setOtpVerified(true);
      message.success("Email verified!");
    } catch (error) {
      message.error(errMsg(error, "OTP verification failed!"));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleNext = async () => {
    console.log('[Register] handleNext called', { step, otpVerified, otpSent });
    try {
      // Get email directly from form since it may be disabled after OTP verification
      const email = (form.getFieldValue("email") || "").trim();
      console.log('[Register] handleNext email from form:', email);
      const v = await form.validateFields(["name", "phone"]);
      if (!v.name || v.name.trim().split(/\s+/).length < 2) {
        message.error("Please enter at least 2 words (First Last)!");
        return;
      }
      // Validate email format manually since field may be disabled
      if (!email || !isEmailFormatOk(email)) {
        form.setFields([{ name: "email", errors: ["Please enter a valid email!"] }]);
        message.error("Please enter a valid email!");
        return;
      }
      // Instant checks — surface taken numbers/emails here, not only on Register.
      if (phoneStatus === "taken") {
        form.setFields([{ name: "phone", errors: ["Phone already exists."] }]);
        message.error("Phone already exists.");
        return;
      }
      if (emailStatus === "taken") {
        form.setFields([{ name: "email", errors: ["Email already exists. Please login."] }]);
        message.error("Email already exists. Please login.");
        return;
      }
      if (phoneStatus === "checking" || emailStatus === "checking") {
        message.error("Checking availability, please wait...");
        return;
      }
      if (!otpVerified) {
        message.error("Please verify email OTP first!");
        return;
      }
      setStep1Data({
        name: (v.name || "").trim(),
        phone: (v.phone || "").trim(),
        email,
      });
      setStep(2);
    } catch {
      // antd shows field errors inline
    }
  };

  const onFinish = async (vals) => {
    console.log('[Register] onFinish called', { vals, otpVerified, step, usernameStatus, emailStatus, phoneStatus, registerReady: Boolean(vals?.username?.trim() && vals?.password && vals?.confirmPassword && vals?.gender) });
    if (!otpVerified) {
      message.error("Please verify email OTP first!");
      setStep(1);
      return;
    }
    const username = (vals.username || "").trim();
    if (!isUsernameFormatOk(username)) {
      message.error("Username: lowercase a-z, 0-9, _ and . only; max 30 chars; can't start/end with .");
      return;
    }
    if (usernameStatus === "taken") {
      message.error("This username is already taken. Try one of the suggestions below.");
      return;
    }
    // Re-check instant statuses in case user jumped to Step-2 before debounce finished.
    if (emailStatus === "taken" || phoneStatus === "taken") {
      const field = emailStatus === "taken" ? "email" : "phone";
      const msg = emailStatus === "taken" ? "Email already exists. Please login." : "Phone already exists.";
      form.setFields([{ name: field, errors: [msg] }]);
      message.error(msg);
      setStep(1);
      return;
    }
    // Step-1 fields are unmounted on step 2, so they are missing from
    // `vals` — read them from the snapshot (form store as fallback).
    const email = (form.getFieldValue("email") || step1Data.email || "").trim();
    const name = (vals.name || step1Data.name || "").trim();
    const phone = vals.phone || step1Data.phone || "";
    if (!name || name.split(/\s+/).length < 2 || !phone || !email) {
      message.error("Step-1 details are missing — please go back and fill them again.");
      setStep(1);
      return;
    }
    setLoading(true);
    try {
      const data = await register(
        username,
        email,
        phone,
        vals.password,
        name,
        vals.gender,
        toBirthDateParam(vals.birthDate)
      );
      // Set contact info private by default after registration
      try {
        await updateProfile({ hideContactInfo: true });
      } catch (e) {
        // Non-blocking: privacy update failed but registration succeeded
        console.warn("Could not set default privacy:", e);
      }
      message.success(`Welcome, ${(data.fullName || "").trim().split(/\s+/)[0] || data.username}! Registration successful.`);
      authLogin();
      navigate("/contacts", { replace: true });
    } catch (error) {
      const fieldErrors = error.response?.data?.errors;
      if (fieldErrors && typeof fieldErrors === "object") {
        // Show each backend validation error inline on its field.
        // Backend calls it fullName, the form field is named "name".
        const entries = Object.entries(fieldErrors).map(([name, msg]) => [
          name.toLowerCase() === "fullname" ? "name" : name,
          msg,
        ]);
        form.setFields(entries.map(([name, msg]) => ({ name, errors: [msg] })));
        const firstMsg = entries.map(([, msg]) => msg).find(Boolean) || "Validation failed!";
        message.error(firstMsg);
        const names = entries.map(([n]) => n.toLowerCase());
        if (names.some((n) => ["phone", "email", "name", "fullname"].includes(n))) setStep(1);
        else if (names.includes("birthdate")) form.setFieldsValue({ birthDate: undefined });
        return;
      }
      const msg = errMsg(error, "Registration failed!");
      message.error(msg);
      const lower = msg.toLowerCase();
      if (lower.includes("phone")) {
        form.setFields([{ name: "phone", errors: [msg] }]);
        setStep(1);
      } else if (lower.includes("email")) {
        form.setFields([{ name: "email", errors: [msg] }]);
        setStep(1);
      } else if (lower.includes("username") || lower.includes("taken")) {
        form.setFields([{ name: "username", errors: [msg] }]);
      } else if (lower.includes("full name") || lower.includes("name")) {
        form.setFields([{ name: "name", errors: [msg] }]);
        setStep(1);
      } else if (/verify|otp|expired/i.test(msg)) {
        setStep(1);
      }
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
          <div className="auth-steps-top">
            <div className={`auth-step-item ${step === 1 ? "active" : ""}`}>
              <span className="auth-step-num">1</span>
              <span className="auth-step-text">Verify Email</span>
            </div>
            <span className="auth-step-line" />
            <div className={`auth-step-item ${step === 2 ? "active" : ""}`}>
              <span className="auth-step-num">2</span>
              <span className="auth-step-text">Account</span>
            </div>
          </div>

          {step === 1 && (
            <>
              <Form.Item
                className="auth-field"
                name="name"
                normalize={(v) =>
                  v
                    ? v
                      .replace(/^\s+/, "")
                      .replace(/\s+/g, " ")
                      .replace(/(^|\s)([a-z])/g, (m, sp, ch) => sp + ch.toUpperCase())
                    : v
                }
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

              <Form.Item
                className="auth-field"
                name="phone"
                normalize={(v) => (v || "").replace(/\D/g, "").slice(0, 10)}
                rules={[
                  { required: true, message: "Please enter phone!" },
                  { pattern: /^[0-9]{10}$/, message: "Phone must be 10 digits!" },
                  {
                    validator: (_, value) => {
                      if (!value || !isPhoneFormatOk(value)) return Promise.resolve();
                      if (phoneStatus === "taken")
                        return Promise.reject("Phone already exists.");
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input
                  className="auth-input"
                  prefix={<PhoneOutlined className="auth-input-icon" />}
                  placeholder="Phone (10 digits)"
                  size="large"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                />
              </Form.Item>
              {(phoneValue || "").trim() !== "" && phoneStatus === "checking" && (
                <div className="auth-username-status auth-checking">Checking phone…</div>
              )}
              {(phoneValue || "").trim() !== "" && phoneStatus === "available" && (
                <div className="auth-username-status auth-ok">✓ Phone available</div>
              )}
              {(phoneValue || "").trim() !== "" && phoneStatus === "taken" && (
                <div className="auth-username-status auth-err">Phone already exists.</div>
              )}

              <Form.Item
                className="auth-field"
                name="email"
                rules={[
                  { required: true, message: "Please enter email!" },
                  { type: "email", message: "Please enter a valid email!" },
                  {
                    validator: (_, value) => {
                      if (!value || !isEmailFormatOk(value)) return Promise.resolve();
                      if (otpVerified) return Promise.resolve();
                      if (emailStatus === "taken")
                        return Promise.reject("Email already exists. Please login.");
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input
                  className="auth-input"
                  prefix={<FontAwesomeIcon icon={faEnvelope} className="auth-input-icon" />}
                  placeholder="Email"
                  size="large"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={otpVerified}
                  onChange={() => {
                    // A changed email invalidates the sent OTP — request a new one.
                    if (otpSent) resetOtp();
                  }}
                />
              </Form.Item>
              {(emailValue || "").trim() !== "" && emailStatus === "checking" && !otpVerified && (
                <div className="auth-username-status auth-checking">Checking email…</div>
              )}
              {(emailValue || "").trim() !== "" && emailStatus === "available" && !otpVerified && (
                <div className="auth-username-status auth-ok">✓ Email available</div>
              )}
              {(emailValue || "").trim() !== "" && emailStatus === "taken" && !otpVerified && (
                <div className="auth-username-status auth-err">Email already exists. Please login.</div>
              )}

              {!otpVerified && (
                <Tooltip
                  title={
                    !otpSent && !isEmailFormatOk(emailValue || "")
                      ? "Type your email first"
                      : emailStatus === "taken"
                        ? "This email is already registered"
                        : otpSent && cooldown > 0
                          ? `Wait ${cooldown}s to resend`
                          : ""
                  }
                >
                  <span className="auth-tip-full">
                    <button
                      type="button"
                      className="pf-primary-btn auth-otp-send-btn auth-send-full"
                      disabled={sendLoading || emailStatus === "taken" || (!otpSent && !isEmailFormatOk(emailValue || "")) || (otpSent && cooldown > 0)}
                      onClick={() => handleSendOtp(otpSent)}
                    >
                      {sendLoading
                        ? "Sending..."
                        : !otpSent
                          ? "Send OTP"
                          : cooldown > 0
                            ? `Resend in ${cooldown}s`
                            : "Resend code"}
                    </button>
                  </span>
                </Tooltip>
              )}

              <div className="auth-otp">
                <div className="auth-otp-row">
                  <div className="auth-otp-boxes" onPaste={handleOtpPaste}>
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpRefs.current[i] = el)}
                        className={`auth-otp-box ${otpVerified ? "verified" : ""}`}
                        value={d}
                        disabled={!otpSent || otpVerified}
                        inputMode="numeric"
                        maxLength={1}
                        autoComplete="one-time-code"
                        aria-label={`OTP digit ${i + 1}`}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      />
                    ))}
                  </div>
                  {!otpVerified && (
                    <Tooltip
                      title={
                        !otpSent
                          ? "Send OTP first"
                          : !otpComplete
                            ? "Enter the 6-digit code first"
                            : ""
                      }
                    >
                      <span className="auth-tip-stretch">
                        <button
                          type="button"
                          className="pf-primary-btn auth-otp-verify-btn"
                          disabled={!otpSent || !otpComplete || verifyLoading}
                          onClick={handleVerifyOtp}
                        >
                          {verifyLoading ? "Verifying..." : "Verify"}
                        </button>
                      </span>
                    </Tooltip>
                  )}
                </div>
                {otpVerified && (
                  <div className="auth-otp-foot">
                    <span className="auth-otp-ok">✓ Email verified — you can continue.</span>
                  </div>
                )}
              </div>

              <Form.Item className="auth-field auth-submit">
                <div className="auth-nav-row auth-nav-end">
                  <Tooltip
                    title={
                      phoneStatus === "taken"
                        ? "This phone is already registered"
                        : emailStatus === "taken"
                          ? "This email is already registered"
                          : !otpVerified
                            ? !otpSent
                              ? "Send OTP first"
                              : "Verify OTP first"
                            : ""
                    }
                  >
                    <span className="auth-tip-inline">
                      <button
                        type="button"
                        className="pf-primary-btn auth-next-btn"
                        disabled={!otpVerified || phoneStatus === "taken" || emailStatus === "taken"}
                        onClick={handleNext}
                      >
                        Next
                      </button>
                    </span>
                  </Tooltip>
                </div>
              </Form.Item>
            </>
          )}

          {step === 2 && (
            <>
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
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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

              <Form.Item
                className="auth-field"
                name="password"
                validateFirst
                rules={[
                  { required: true, message: "Please enter password!" },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/,
                    message: "Password must include at least one letter, one number and one symbol.",
                  },
                  { min: 8, message: "Password must be at least 8 characters long." },
                ]}
              >
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="Password"
                  size="large"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  iconRender={(visible) => (
                    <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" style={{ color: '#3b82f6', cursor: 'pointer' }} />
                  )}
                />
              </Form.Item>

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

              <Form.Item className="auth-field auth-submit">
                <div className="auth-nav-row">
                  <button
                    type="button"
                    className="auth-back-btn"
                    onClick={() => setStep(1)}
                  >Back
                  </button>
                  <Tooltip
                    title={
                      usernameStatus === "taken"
                        ? "This username is taken — try a suggestion"
                        : !registerReady
                          ? "Fill all required fields first"
                          : ""
                    }
                  >
                    <span className="auth-tip-inline">
                      <button
                        type="submit"
                        className="pf-primary-btn auth-next-btn"
                        disabled={!registerReady || loading || usernameStatus === "taken"}
                      >
                        {loading ? "Registering..." : "Register"}
                      </button>
                    </span>
                  </Tooltip>
                </div>
              </Form.Item>
            </>
          )}
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
