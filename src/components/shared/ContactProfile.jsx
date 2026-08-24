import { useEffect, useState } from "react";
import { Avatar, Modal } from "antd";
import { ArrowLeftOutlined, PhoneOutlined, MailOutlined, EditOutlined } from "@ant-design/icons";
import { api } from "../../Services/networld";
import RelationChip from "./RelationChip";
import EditRelationModal from "./EditRelationModal";

function ContactProfile({ contact, showBack = false, onBack }) {
  const [relations, setRelations] = useState([]);
  const [editing, setEditing] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  useEffect(() => {
    api.relations().then((res) => setRelations(res.data)).catch(() => {});
  }, []);

  return (
    <div className="nw-profile">
      {showBack && (
        <button className="nw-back-btn" onClick={onBack}>
          <ArrowLeftOutlined /> Back to Contacts
        </button>
      )}

      <div className="nw-profile-head">
        <div
          className="nw-profile-avatar-wrap"
          onClick={() => contact.profilePicture && setImageViewerOpen(true)}
          style={{ cursor: contact.profilePicture ? "pointer" : "default" }}
        >
          <Avatar
            size={104}
            src={contact.profilePicture || null}
            style={{ backgroundColor: contact.profilePicture ? "transparent" : "#2563eb", fontSize: 38 }}
          >
            {!contact.profilePicture && contact.name?.charAt(0).toUpperCase()}
          </Avatar>
        </div>
        <h1 className="nw-profile-name">{contact.name}</h1>
        <RelationChip relation={contact.relation} style={{ fontSize: 13 }} />
      </div>

      <div className="nw-profile-section">
        {contact.phone && (
          <div className="nw-profile-row">
            <span className="nw-profile-row-icon"><PhoneOutlined /></span>
            <span className="nw-profile-row-text">
              <span className="nw-profile-row-label">Phone</span>
              <span className="nw-profile-row-value">{contact.phone}</span>
            </span>
          </div>
        )}
        {contact.email && (
          <div className="nw-profile-row">
            <span className="nw-profile-row-icon"><MailOutlined /></span>
            <span className="nw-profile-row-text">
              <span className="nw-profile-row-label">Email</span>
              <span className="nw-profile-row-value">{contact.email}</span>
            </span>
          </div>
        )}
      </div>

      <div className="nw-profile-actions">
        <button className="nw-edit-btn nw-edit-btn-plain" onClick={() => setEditing(true)}>
          <EditOutlined /> Edit Relation
        </button>
      </div>

      <EditRelationModal
        contact={contact}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(newRel) => { contact.relation = newRel; }}
      />

      <Modal
        title={null}
        open={imageViewerOpen}
        onCancel={() => setImageViewerOpen(false)}
        destroyOnClose
        maskClosable
        footer={null}
        closable={false}
        centered
        className="image-viewer-modal-circle"
      >
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          <img
            src={contact.profilePicture}
            alt="Profile full view"
            style={{
              objectFit: "cover",
              borderRadius: "50%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              border: "4px solid rgba(255, 255, 255, 0.1)",
              width: "86vw",
              maxWidth: 360,
              maxHeight: 360,
            }}
            onClick={() => setImageViewerOpen(false)}
          />
        </div>
      </Modal>
    </div>
  );
}

export default ContactProfile;