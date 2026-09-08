import { useEffect, useState } from "react";
import { Modal, Select, message } from "antd";
import { api } from "../../Services/networld";

function EditRelationModal({ contact, open, onClose, onSaved }) {
  const [relations, setRelations] = useState([]);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.relations().then((res) => setRelations(res.data)).catch(() => {});
    setEditValue(contact?.relation || "");
  }, [open, contact]);

  const saveEdit = async () => {
    if (!contact) return;
    const finalRel = editValue;
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
          value={editValue}
          onChange={(val) => setEditValue(val)}
          options={relations.map((r) => ({ value: r.relationName, label: r.relationName }))}
        />
      </div>
    </Modal>
  );
}

export default EditRelationModal;