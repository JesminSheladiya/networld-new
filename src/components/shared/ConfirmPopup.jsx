import { Modal } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// Reusable glass confirm popup (theme-wise, left-aligned).
// Props: open, title, message, okText, cancelText, okIcon, onOk, onCancel
function ConfirmPopup({
  open,
  title,
  message,
  okText = "Confirm",
  cancelText = "Cancel",
  okIcon = null,
  onOk,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      closable={false}
      maskClosable={true}
      centered
      width={380}
      className="nw-confirm-modal"
    >
      <div className="nw-confirm-card">
        <div className="nw-confirm-head">
          <div className="nw-confirm-text">
            <div className="nw-confirm-title">{title}</div>
            {message && <div className="nw-confirm-sub">{message}</div>}
          </div>
        </div>
        <div className="nw-confirm-actions">
          <button className="nw-confirm-btn nw-confirm-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button className="nw-confirm-btn nw-confirm-ok" onClick={onOk}>
            {okIcon && <FontAwesomeIcon icon={okIcon} />}
            {okText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmPopup;
