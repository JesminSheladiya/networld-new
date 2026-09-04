import { useEffect, useState } from "react";
import { Modal, Select, Input, message } from "antd";
import { api } from "../../Services/networld";

function EditRelationModal({ contact, open, onClose, onSaved }) {
  const [relations, setRelations] = useState([]);
  const [editValue, setEditValue] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.relations().then((res) => setRelations(res.data)).catch(() => {});
    const rel = contact?.relation || "";
    const isPredefined = res => res.some(r => r.relationName.toLowerCase() === rel.toLowerCase());
    api.relations().then((res) => {
      if (isPredefined(res.data)) {
        setEditValue(rel);
        setIsCustom(false);
        setCustomText("");
      } else {
        setEditValue("Custom");
        setIsCustom(true);
        setCustomText(rel);
      }
    }).catch(() => {
      setEditValue("Custom");
      setIsCustom(true);
      setCustomText(rel);
    });
  }, [open, contact]);

  const saveEdit = async () => {
    if (!contact) return;
    const finalRel = isCustom ? customText : editValue;
    if (!finalRel || !finalRel.trim()) {
      message.warning("Relation name cannot be empty!");
      return;
    }
    setSaving(true);
    try {
      await api.updateRelation(contact.relationId, finalRel.trim());
      message.success("Relation updated!");
      onSaved?.(finalRel.trim());
      onClose();
    } catch (e) {
      message.error(e.response?.data?.message || "Failed to update relation!");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      className="contacts-modal"
      title="Edit Relation"
      open={open}
      onCancel={onClose}
      onOk={saveEdit}
      okText="Save"
      confirmLoading={saving}
      destroyOnClose
      centered
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "#e2e8f0" }}>
          Update relation with <strong style={{ color: "#38bdf8" }}>{contact?.name}</strong>:
        </div>
        <Select
          style={{ width: "100%" }}
          value={isCustom ? "Custom" : editValue}
          onChange={(val) => {
            if (val === "Custom") setIsCustom(true);
            else { setIsCustom(false); setEditValue(val); }
          }}
          options={[
            ...relations.map((r) => ({ value: r.relationName, label: r.relationName })),
            { value: "Custom", label: "Custom..." },
          ]}
        />
        {isCustom && (
          <Input
            placeholder="Enter relation..."
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}

export default EditRelationModal;