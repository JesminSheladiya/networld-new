import { useEffect, useState } from "react";
import { Modal, Select, message } from "antd";
import { api } from "../../Services/networld";
import { useRelationDisplay } from "../../context/RelationDisplayContext";

const GENDER_LABEL = { M: "Male", F: "Female" };

function RelationPickerModal({ open, title = "Edit Relation", personName, personGender, value, currentRelation, idMode = false, onClose, onPick }) {
  const { relOptionLabel } = useRelationDisplay();
  const [relations, setRelations] = useState([]);
  const [val, setVal] = useState(value);
  const [usedUnique, setUsedUnique] = useState([]);

  useEffect(() => {
    if (open) {
      Promise.all([api.relations(), api.usedUniqueRelations()])
        .then(([relationsRes, usedRes]) => {
          setRelations(relationsRes.data || []);
          setUsedUnique((usedRes.data || []).map((name) => name.toLowerCase()));
        })
        .catch(() => { });
      setVal(value);
    }
  }, [open, value]);

  const isCompatible = (r) =>
    !personGender || !r.gender || r.gender === "N" || r.gender === personGender;

  const isUniqueUnavailable = (r) => {
    if (!usedUnique.includes((r.relationName || "").toLowerCase())) return false;
    if (!currentRelation) return true;
    return (r.relationName || "").toLowerCase() !== currentRelation.toLowerCase();
  };

  // Show all relations; incompatible ones are disabled (greyed out)
  const visible = relations;

  const handlePick = () => {
    if (val === undefined || val === null || val === "") return;
    const picked = relations.find((r) => (idMode ? r.id : r.relationName) === val);
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
    onPick?.(val);
    onClose?.();
  };

  return (
    <Modal
      styles={{ header: { backgroundColor: "transparent" } }}
      className="contacts-modal"
      title={title}
      open={open}
      onCancel={onClose}
      onOk={handlePick}
      okText="Select"
      okButtonProps={{ disabled: val === undefined || val === null || val === "" }}
      destroyOnClose
      centered
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "#e2e8f0" }}>
          {personName ? (
            <>Select relation for <strong style={{ color: "#38bdf8" }}>{personName}</strong>:</>
          ) : (
            <>Choose a relation from the list:</>
          )}
        </div>
        {personGender && GENDER_LABEL[personGender] && (
          <div className="rpm-gender-hint">
            Relations for a {GENDER_LABEL[personGender]} profile
            <span className="rpm-count">
              {visible.filter(isCompatible).length} of {relations.length} valid
            </span>
          </div>
        )}
        <Select
          style={{ width: "100%" }}
          placeholder="Choose a relation"
          value={val}
          onChange={(v) => setVal(v)}
          showSearch
          filterOption={(input, option) =>
            (option?.searchText || "").includes(input.trim().toLowerCase())
          }
          options={visible.map((r) => ({
            value: idMode ? r.id : r.relationName,
            label: relOptionLabel(r, relations),
            // Search across every name form so "samdhan", "saas",
            // "father-in-law" etc. all find their rows in any language mode.
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

export default RelationPickerModal;
