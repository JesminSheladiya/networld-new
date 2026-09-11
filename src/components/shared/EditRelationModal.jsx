import { useEffect, useState } from "react";
import { Modal, Select, message } from "antd";
import { api } from "../../Services/networld";
import { useRelationDisplay } from "../../context/RelationDisplayContext";

function EditRelationModal({ contact, open, onClose, onSaved }) {
  const { relOptionLabel } = useRelationDisplay();
  const [relations, setRelations] = useState([]);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.relations().then((res) => setRelations(res.data)).catch(() => { });
    setEditValue(contact?.relation || "");
  }, [open, contact]);

  const isCompatible = (r) =>
    !contact?.gender || !r.gender || r.gender === "N" || r.gender === contact.gender;

  const saveEdit = async () => {
    if (!contact) return;
    const finalRel = editValue;
    if (!finalRel || !finalRel.trim()) {
      message.warning("Relation name cannot be empty!");
      return;
    }
    const picked = relations.find((r) => r.relationName === finalRel.trim());
    if (picked && !isCompatible(picked)) {
      message.error(
        `'${relOptionLabel(picked, relations)}' can only be sent to ` +
        (picked.gender === "F" ? "female" : "male") + " users. Request not sent."
      );
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
      styles={{ header: { backgroundColor: "transparent" } }}
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
        {contact?.gender && (contact.gender === "M" || contact.gender === "F") && (
          <div className="rpm-gender-hint" style={{ marginBottom: 12 }}>
            Relations for a {contact.gender === "M" ? "Male" : "Female"} profile
          </div>
        )}
        <Select
          style={{ width: "100%" }}
          value={editValue}
          onChange={(val) => setEditValue(val)}
          showSearch
          placeholder="Choose a relation"
          filterOption={(input, option) =>
            (option?.searchText || "").includes(input.trim().toLowerCase())
          }
          options={relations.map((r) => ({
            value: r.relationName,
            label: relOptionLabel(r, relations),
            searchText: [
              r.relationName,
              r.englishRelation,
              r.indianRelation,
              r.genericRelation,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
            disabled: !isCompatible(r),
          }))}
        />
      </div>
    </Modal>
  );
}

export default EditRelationModal;