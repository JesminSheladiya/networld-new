import { useEffect, useState } from "react";
import { Modal, Select } from "antd";
import { api } from "../../Services/networld";
import { useRelationDisplay } from "../../context/RelationDisplayContext";

function RelationPickerModal({ open, title = "Edit Relation", personName, value, idMode = false, onClose, onPick }) {
  const { relName } = useRelationDisplay();
  const [relations, setRelations] = useState([]);
  const [val, setVal] = useState(value);

  useEffect(() => {
    if (open) {
      api.relations().then((res) => setRelations(res.data || [])).catch(() => {});
      setVal(value);
    }
  }, [open, value]);

  const handlePick = () => {
    if (val === undefined || val === null || val === "") return;
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
        <Select
          style={{ width: "100%" }}
          placeholder="Choose a relation"
          value={val}
          onChange={(v) => setVal(v)}
          showSearch
          optionFilterProp="label"
          options={relations.map((r) => ({
            value: idMode ? r.id : r.relationName,
            label: relName(r.relationName),
          }))}
        />
      </div>
    </Modal>
  );
}

export default RelationPickerModal;
