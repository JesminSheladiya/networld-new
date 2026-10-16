import { useState, useEffect, useRef } from "react";
import { Form, Input, Card, message, Typography, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { forgotRequest, verifyOtp, forgotReset } from "../Services/authService";
import { useRateLimitBlock } from "../hooks/useRateLimitBlock";
import NetworkBackground from "./NetworkBackground";
import "./css/Auth.css";
import "./css/profile-page.css";

const { Title } = Typography;

const isEmailFormatOk = (v) => !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || "").trim());

function ForgotPassword() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { blockedSeconds, blockedLabel, trigger } = useRateLimitBlock();

  const emailValue = Form.useWatch("email", form);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const otpCode = otpDigits.join("");
  const otpComplete = otpCode.length === 6;

  const errMsg = (error, fallback) => {
    const data = error.response?.data;
    if (data?.errors && typeof data.errors === "object") {
      const first = Object.values(data.errors).find(Boolean);
      if (first) return first;
    }
    return data?.error || data?.message || fallback;
  };

  const handleSend = async () => {
    try {
      const { email } = await form.validateFields(["email"]);
      if (!isEmailFormatOk(email)) {
        message.error("Please enter a valid email!");
        return;
      }
      setSendLoading(true);
      const res = await forgotRequest(email.trim());
      if (res?.delivered === false) {
        message.error("Email could not be delivered. Please check the address and try again.");
        return;
      }
      message.success(otpSent ? "OTP resent to your email." : "OTP sent to your email.");
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpVerified(false);
      setOtpSent(true);
      setCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (error) {
      if (error?.errorFields) return;
      if (trigger(error)) return;
      message.error(errMsg(error, "Failed to send OTP!"));
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

  const handleVerify = async () => {
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
      message.success("OTP verified — set a new password.");
    } catch (error) {
      if (trigger(error)) return;
      message.error(errMsg(error, "OTP verification failed!"));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      const vals = await form.validateFields(["email", "newPassword", "confirmPassword"]);
      const email = (vals.email || "").trim();
      if (!otpVerified) {
        message.error("Please verify the OTP first!");
        return;
      }
      if (vals.newPassword !== vals.confirmPassword) {
        form.setFields([{ name: "confirmPassword", errors: ["Passwords do not match!"] }]);
        return;
      }
      setResetLoading(true);
      await forgotReset(email, otpCode, vals.newPassword);
      message.success("Password reset successful. Please login.");
      navigate("/login", { replace: true });
    } catch (error) {
      if (error?.errorFields) return;
      if (trigger(error)) return;
      message.error(errMsg(error, "Password reset failed!"));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <NetworkBackground />
      <div className="auth-vignette" />
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <Card className="auth-card auth-card-login">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <Title className="auth-title" level={2}>
            Reset Password
          </Title>
        </div>

        <Form form={form} className="auth-form" name="forgot" autoComplete="off" layout="vertical">
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
              placeholder="Registered email"
              size="large"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={otpVerified}
              onChange={() => {
                if (otpSent) {
                  setOtpDigits(["", "", "", "", "", ""]);
                  setOtpSent(false);
                  setOtpVerified(false);
                  setCooldown(0);
                }
              }}
            />
          </Form.Item>

          {!otpVerified && (
            <Tooltip
              title={
                !isEmailFormatOk(emailValue || "")
                  ? "Type your email first"
                  : otpSent && cooldown > 0
                    ? `Wait ${cooldown}s to resend`
                    : ""
              }
            >
              <span className="auth-tip-full">
                <button
                  type="button"
                  className="pf-primary-btn auth-otp-send-btn auth-send-full"
                  disabled={sendLoading || blockedSeconds > 0 || !isEmailFormatOk(emailValue || "") || (otpSent && cooldown > 0)}
                  onClick={handleSend}
                >
                  {blockedSeconds > 0
                    ? blockedLabel
                    : sendLoading
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

          {(otpSent || otpVerified) && (
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
                  <span className="auth-tip-stretch">
                    <button
                      type="button"
                      className="pf-primary-btn auth-otp-verify-btn"
                      disabled={!otpSent || !otpComplete || verifyLoading || blockedSeconds > 0}
                      onClick={handleVerify}
                    >
                      {blockedSeconds > 0 ? blockedLabel : verifyLoading ? "Verifying..." : "Verify"}
                    </button>
                  </span>
                )}
              </div>
              {otpVerified && (
                <div className="auth-otp-foot">
                  <span className="auth-otp-ok">✓ OTP verified — set a new password.</span>
                </div>
              )}
            </div>
          )}

          {otpVerified && (
            <>
              <Form.Item
                className="auth-field"
                name="newPassword"
                style={{ marginTop: 12 }}
                rules={[
                  { required: true, message: "Please enter new password!" },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/,
                    message: "Must include a letter, a number and a symbol.",
                  },
                  { min: 8, message: "At least 8 characters." },
                ]}
              >
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="New password"
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
                dependencies={["newPassword"]}
                rules={[
                  { required: true, message: "Please confirm password!" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                      return Promise.reject("Passwords do not match!");
                    },
                  }),
                ]}
              >
                <Input.Password
                  className="auth-input"
                  prefix={<LockOutlined className="auth-input-icon" />}
                  placeholder="Confirm new password"
                  size="large"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  iconRender={(visible) => (
                    <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" style={{ color: '#3b82f6', cursor: 'pointer' }} />
                  )}
                />
              </Form.Item>

              <Form.Item className="auth-field auth-submit">
                <button
                  type="button"
                  className="pf-primary-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={resetLoading || blockedSeconds > 0}
                  onClick={handleReset}
                >
                  {blockedSeconds > 0 ? blockedLabel : resetLoading ? "Resetting..." : "Reset Password"}
                </button>
              </Form.Item>
            </>
          )}
        </Form>

        <div className="auth-footer">
          <Typography.Text className="auth-footer-text">
            Remembered it?{" "}
            <button type="button" className="auth-switch-link" onClick={() => navigate("/login", { replace: true })}>
              Back to login
            </button>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default ForgotPassword;
