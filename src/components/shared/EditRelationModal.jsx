import { useEffect, useState } from "react";
import { Modal, Select, message } from "antd";
import { api } from "../../Services/networld";
import { useRelationDisplay } from "../../context/RelationDisplayContext";

function EditRelationModal({ contact, open, onClose, onSaved }) {
  const { relOptionLabel } = useRelationDisplay();
  const [relations, setRelations] = useState([]);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [usedUnique, setUsedUnique] = useState([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([api.relations(), api.usedUniqueRelations()])
      .then(([relationsRes, usedRes]) => {
        setRelations(relationsRes.data || []);
        setUsedUnique((usedRes.data || []).map((name) => name.toLowerCase()));
      })
      .catch(() => { });
    setEditValue(contact?.relation || "");
  }, [open, contact]);

  const isCompatible = (r) =>
    !contact?.gender || !r.gender || r.gender === "N" || r.gender === contact.gender;

  const isUniqueUnavailable = (r) =>
    usedUnique.includes((r.relationName || "").toLowerCase())
      && (r.relationName || "").toLowerCase() !== (contact?.relation || "").toLowerCase();

  const saveEdit = async () => {
    if (!contact) return;
    const finalRel = editValue;
    if (!finalRel || !finalRel.trim()) {
      message.warning("Relation name cannot be empty!");
      return;
    }
    const picked = relations.find((r) => r.relationName === finalRel.trim());
    if (picked && isUniqueUnavailable(picked)) {
      message.error(`'${relOptionLabel(picked, relations)}' is already assigned in your account.`);
      return;
    }
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
          <div className="rpm-gender-hint">
            Relations for a {contact.gender === "M" ? "Male" : "Female"} profile
            <span className="rpm-count">
              {relations.filter(isCompatible).length} of {relations.length} valid
            </span>
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
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
            disabled: !isCompatible(r) || isUniqueUnavailable(r),
          }))}
        />
        <div className="relation-limit-notice">
          <span className="relation-limit-notice-icon">i</span>
          <span>
            <strong>Note:</strong> Father, Mother, Grandparents, Husband, Wife,
            Father-in-law and Mother-in-law can be selected once. All other relations
            can be selected multiple times.
          </span>
        </div>
      </div>
    </Modal>
  );
}

export default EditRelationModal;
