import { useState, useEffect } from "react";
import { Modal, Button } from "antd";
import { useAuth } from "../../context/AuthContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import "./RelationFormatPopup.css";

const OPTIONS = [
  {
    key: "english",
    title: "English Relation",
    example: "Father's Father",
  },
  {
    key: "indian",
    title: "Indian Relation",
    example: "Dada",
  },
  {
    key: "generic",
    title: "Generic Relation",
    example: "Paternal Grandfather",
  },
];

function RelationFormatPopup() {
  const { isAuthenticated } = useAuth();
  const { hasChosen, setFormat, pickerOpen, closePicker, format } = useRelationDisplay();
  const [picked, setPicked] = useState("indian");

  const open = (isAuthenticated && !hasChosen) || pickerOpen;

  useEffect(() => {
    if (open) setPicked(format);
  }, [open, format]);

  if (!open) return null;
  const manual = pickerOpen && hasChosen;

  const handleSave = () => {
    setFormat(picked);
    closePicker();
  };

  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      maskClosable={false}
      centered
      width={420}
      className="rfp-modal"
    >
      <div className="rfp-card">
        <div className="rfp-title">How should relations appear?</div>
        <div className="rfp-sub">Choose a display style  you can see names like:</div>
        <div className="rfp-options">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              className={`rfp-option${picked === o.key ? " selected" : ""}`}
              onClick={() => setPicked(o.key)}
            >
              <span className={`rfp-radio${picked === o.key ? " on" : ""}`} />
              <span className="rfp-option-text">
                <span className="rfp-option-title">{o.title}</span>
                <span className="rfp-option-example">e.g.: {o.example}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="rfp-actions">
          {manual && (
            <Button size="large" className="rfp-cancel" onClick={closePicker}>
              Cancel
            </Button>
          )}
          <Button
            type="primary"
            block={!manual}
            size="large"
            className="rfp-save"
            onClick={handleSave}
          >
            {manual ? "Save" : "Continue"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default RelationFormatPopup;
