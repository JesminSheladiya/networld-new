import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox, Input, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { deleteAccount, requestDeleteOtp, verifyOtp } from "../../Services/authService";
import { useAuth } from "../../context/AuthContext";
import { useRateLimitBlock } from "../../hooks/useRateLimitBlock";
import ConfirmPopup from "../shared/ConfirmPopup";
import "../css/profile-page.css";
import "../css/Auth.css";

// Dedicated danger-zone page (linked from the profile dropdown).
// Warning → acknowledge checkbox → type username → email OTP →
// button → confirm popup → DELETE with OTP.
function DeleteAccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── OTP state (same 6-box pattern as register / forgot-password) ──
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);
  const otpCardRef = useRef(null);
  const [otpSent, setOtpSent] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Auto-verify: Delete enables only when the typed code is actually right.
  const [otpVerified, setOtpVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [otpError, setOtpError] = useState("");
  const lastCheckedRef = useRef("");
  // Keep send/resend cooldown and OTP verification limits independent.
  const sendLimit = useRateLimitBlock();
  const verifyLimit = useRateLimitBlock();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const otpCode = otpDigits.join("");

  // Instant check: as soon as 6 digits are in, verify against the server.
  // One call per distinct code; editing clears the previous result.
  useEffect(() => {
    if (!otpSent) return;
    if (otpCode.length < 6) {
      if (otpVerified || otpError) {
        setOtpVerified(false);
        setOtpError("");
      }
      lastCheckedRef.current = "";
      return;
    }
    if (otpCode === lastCheckedRef.current || checking) return;
    lastCheckedRef.current = otpCode;
    setChecking(true);
    setOtpError("");
    const email = (user?.email || "").trim();
    verifyOtp(email, otpCode)
      .then(() => {
        setOtpVerified(true);
        setOtpError("");
      })
      .catch((e) => {
        setOtpVerified(false);
        if (verifyLimit.trigger(e, undefined, { silent: true })) {
          setOtpError("");
          return;
        }
        setOtpError(e.response?.data?.error || e.response?.data?.message || "Invalid OTP.");
        otpRefs.current[5]?.focus();
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, otpSent, checking]);

  const expected = (user?.username || "").trim();
  // Same username rules as register/edit, but dots stay typable —
  // invalid input only shows an error, it is never stripped mid-typing.
  const normalizeConfirm = (v) =>
    (v || "").toLowerCase().replace(/\s+/g, "_");
  const USERNAME_PATTERN = /^(?!\.)(?!.*\.$)[a-z0-9._]+$/;
  const typed = normalizeConfirm(confirmText);
  const confirmError =
    typed !== "" && !USERNAME_PATTERN.test(typed)
      ? "Lowercase a-z, 0-9, _ and . only; can't start/end with ."
      : "";
  const matched =
    expected !== "" &&
    confirmError === "" &&
    typed === expected.toLowerCase();
  const canArm = agreed && matched;
  // Delete is armed only after intent is confirmed AND the typed code
  // is verified right — a merely complete (but wrong) code keeps it off.
  const canDelete = canArm && otpVerified && !deleting;

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile", { replace: true });
  };

  const handleSendOtp = async () => {
    if (!canArm || sendLoading || sendLimit.blockedSeconds > 0 || (otpSent && cooldown > 0)) return;
    setSendLoading(true);
    try {
      const res = await requestDeleteOtp();
      if (res?.delivered === false) {
        message.error("Email could not be delivered. Please try again.");
        return;
      }
      message.success(`OTP sent to ${user?.email || "your email"}.`);
      sendLimit.clear();
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpVerified(false);
      setOtpError("");
      lastCheckedRef.current = "";
      setOtpSent(true);
      setCooldown(60);
      // Card opens on success — focus the first box and bring it into view.
      setTimeout(() => {
        otpRefs.current[0]?.focus();
        otpCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    } catch (e) {
      if (sendLimit.trigger(e, undefined, { silent: true })) {
        setOtpError("");
        return;
      }
      message.error(e.response?.data?.error || e.response?.data?.message || "Failed to send OTP!");
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

  const doDelete = async () => {
    if (!canDelete) return;
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteAccount(otpCode);
      message.success("Your account has been deleted.");
      logout();
      navigate("/login", { replace: true });
    } catch (e) {
      if (verifyLimit.trigger(e)) {
        setDeleting(false);
        return;
      }
      message.error(e.response?.data?.error || e.response?.data?.message || "Could not delete account, try again");
      setDeleting(false);
    }
  };

  return (
    <div className="nw-page pf-page pf-narrow-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <div className="pf-card pf-danger-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title pf-danger-title">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              style={{ marginRight: 8 }}
            />
            Delete account
          </h2>
        </div>
        <div className="pf-danger-body">
          <p className="pf-danger-text">
            Account deletion is permanent and cannot be undone for {" "}
            <strong>@{expected || "your account"}</strong>
            {user?.email ? ` (${user.email})` : ""}.
          </p>
          <p className="pf-danger-text">The following data will be permanently removed:</p>
          <ul className="pf-danger-list">
            <li>Profile details (name, bio, and photos)</li>
            <li>Connections and pending requests</li>
            <li>Saved contacts</li>
            <li>Account history and settings</li>
          </ul>

          <label className="pf-danger-check">
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            >
              I understand that deleting my account is permanent and cannot
              be reversed.
            </Checkbox>
          </label>

          <p className="pf-danger-text">
            Just to be sure, type your username{" "}
            <strong className="pf-danger-code">{expected}</strong> below:
          </p>
          <div className="pf-danger-form">
            <Input
              className="auth-input"
              placeholder={`Type "${expected}" to confirm`}
              size="large"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={!agreed}
              value={confirmText}
              style={{
                padding: "12px 4px 12px 12px",
              }}
              onChange={(e) => setConfirmText(normalizeConfirm(e.target.value))}
              suffix={
                <button
                  type="button"
                  className="pf-primary-btn pf-inline-otp-btn"
                   disabled={!canArm || sendLoading || sendLimit.blockedSeconds > 0 || (otpSent && cooldown > 0)}
                  onClick={handleSendOtp}
                >
                   {sendLimit.blockedSeconds > 0
                     ? sendLimit.blockedLabel
                     : sendLoading
                       ? "Sending..."
                     : !otpSent
                       ? "Send OTP"
                       : cooldown > 0
                         ? `Resend in ${cooldown}s`
                         : "Resend"}
                </button>
              }
            />
            {confirmError !== "" && (
              <div className="auth-username-status auth-err">{confirmError}</div>
            )}
            {sendLimit.blockedSeconds > 0 && (
              <div className="auth-username-status auth-err" role="alert">
                {sendLimit.blockedMessageLive || "OTP limit reached."}
              </div>
            )}

            {otpSent && (
              <div ref={otpCardRef}>
                <div className="pf-danger-otp-flex">
                  <p className="pf-danger-text">
                    Enter the 6-digit code we sent to{" "}
                    <strong className="pf-break-any">{user?.email || "your email"}</strong>:
                  </p>
                  <div className="pf-danger-otp-side">
                    <div className="auth-otp-boxes" onPaste={handleOtpPaste}>
                      {otpDigits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => (otpRefs.current[i] = el)}
                          className={`auth-otp-box${otpVerified ? " verified" : ""}`}
                          value={d}
                           disabled={verifyLimit.blockedSeconds > 0 || otpVerified}
                          inputMode="numeric"
                          maxLength={1}
                          autoComplete="one-time-code"
                          aria-label={`OTP digit ${i + 1}`}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        />
                      ))}
                    </div>
                    <div className="auth-otp-foot">
                      {checking ? (
                        <span className="auth-otp-status">Checking…</span>
                      ) : otpError ? (
                        <span className="auth-otp-err">{otpError}</span>
                      ) : otpVerified ? (
                        <span className="auth-otp-ok">✓ Verified — you can delete now.</span>
                      ) : verifyLimit.blockedSeconds > 0 ? (
                        <span className="auth-otp-err">{verifyLimit.blockedMessageLive}</span>
                      ) : (
                        <span className="auth-otp-status">Type the 6-digit code</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="pf-danger-actions-row">
              <button
                type="button"
                className="pf-ghost-btn"
                onClick={goBack}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pf-danger-btn"
                disabled={!canDelete}
                onClick={() => setConfirmOpen(true)}
              >
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmPopup
        open={confirmOpen}
        title="Delete your account?"
        message={`This will permanently delete @${expected} and everything with it. Are you sure you want to delete this account?`}
        okText="Yes, delete it"
        onCancel={() => setConfirmOpen(false)}
        onOk={doDelete}
      />
    </div>
  );
}

export default DeleteAccountPage;
