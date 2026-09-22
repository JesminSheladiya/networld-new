import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox, Input, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { deleteAccount } from "../../Services/authService";
import { useAuth } from "../../context/AuthContext";
import ConfirmPopup from "../shared/ConfirmPopup";
import "../css/profile-page.css";
import "../css/Auth.css";

// Dedicated danger-zone page (linked from the profile dropdown).
// Warning → acknowledge checkbox → type username → button → confirm popup.
function DeleteAccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const expected = (user?.username || "").trim();
  const matched =
    expected !== "" &&
    confirmText.trim().toLowerCase() === expected.toLowerCase();
  const canArm = agreed && matched;

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile", { replace: true });
  };

  const doDelete = async () => {
    if (!canArm || deleting) return;
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteAccount();
      message.success("Your account has been deleted.");
      logout();
      navigate("/login", { replace: true });
    } catch (e) {
      message.error(e.response?.data?.message || "Could not delete account, try again");
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
              disabled={!agreed}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
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
                disabled={!canArm || deleting}
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
