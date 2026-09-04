import { useState, useEffect } from "react";
import { Modal, Form, Input, Button, message, Avatar, Upload, Select } from "antd";
import {
    UserOutlined, PhoneOutlined, LockOutlined, EditOutlined,
    CameraOutlined,
} from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { updateProfile, getUser } from "../Services/authService";

// Helper to convert a relation to its inverse (e.g., father ↔ son)
// Used by RequestsPage — do not remove.
export function getInverseRelation(rel, gender = "M") {
    if (!rel) return rel;
    const map = {
        "husband": "wife",
        "wife": "husband",
        "father": gender === "F" ? "daughter" : "son",
        "mother": gender === "F" ? "daughter" : "son",
        "son": gender === "F" ? "mother" : "father",
        "daughter": gender === "F" ? "mother" : "father",
        "father-in-law": gender === "F" ? "daughter-in-law" : "son-in-law",
        "mother-in-law": gender === "F" ? "daughter-in-law" : "son-in-law",
        "son-in-law": "father-in-law",
        "daughter-in-law": "father-in-law",
        "brother-in-law": "sister-in-law",
        "sister-in-law": "brother-in-law",
        "brother": "brother",
        "sister": "sister",
        "uncle": gender === "F" ? "niece" : "nephew",
        "aunt": gender === "F" ? "niece" : "nephew",
        "nephew": gender === "F" ? "aunt" : "uncle",
        "niece": gender === "F" ? "aunt" : "uncle",
        "grandfather": gender === "F" ? "granddaughter" : "grandson",
        "grandmother": gender === "F" ? "granddaughter" : "grandson",
        "grandson": gender === "F" ? "grandmother" : "grandfather",
        "granddaughter": gender === "F" ? "grandmother" : "grandfather",
        "cousin brother": "cousin sister",
        "cousin sister": "cousin brother",
        "cousin": "cousin",
        "friend": "friend",
    };
    const key = rel.toLowerCase();
    if (map[key]) return map[key];

    // Dynamic fallback for custom relation names
    const isFemale = gender === "F";
    if (key.includes("uncle") && key.includes("daughter")) {
        return isFemale ? "Uncle's Daughter" : "Uncle's Son";
    }
    if (key.includes("uncle") && key.includes("son")) {
        return isFemale ? "Uncle's Daughter" : "Uncle's Son";
    }
    if (key.includes("aunt") && key.includes("daughter")) {
        return isFemale ? "Aunt's Daughter" : "Aunt's Son";
    }
    if (key.includes("aunt") && key.includes("son")) {
        return isFemale ? "Aunt's Daughter" : "Aunt's Son";
    }

    // Cousin generic dynamic
    if (key.includes("cousin")) {
        return isFemale ? "Cousin Sister" : "Cousin Brother";
    }

    return rel;
}

const AVATAR_COLORS = ["#2563eb", "#0ea5e9", "#38bdf8", "#1d4ed8", "#0284c7", "#3b82f6"];
const avatarBg = (name = "") => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const UserAvatar = ({ name, pic, size = 36 }) => (
    <Avatar
        className="up-user-avatar"
        size={size}
        src={pic || null}
        style={{
            backgroundColor: pic ? "transparent" : avatarBg(name || ""),
            fontWeight: 700,
            flexShrink: 0,
            border: "2px solid rgba(147,197,253,0.25)",
        }}
    >
        {!pic && (name?.charAt(0) || "?").toUpperCase()}
    </Avatar>
);

const inputStyle = {
    background: "#0d1424", borderColor: "rgba(148,163,184,0.18)",
    color: "#f1f5f9", height: 46, borderRadius: 10, fontSize: 14,
};

const rowIconStyle = {
    width: 38, height: 38, flexShrink: 0,
    borderRadius: 11,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(37,99,235,0.1)",
    border: "1px solid rgba(37,99,235,0.2)",
    color: "#7dd3fc", fontSize: 15,
};

function UserProfile({ open, onClose, onProfileUpdate, onRelationAccepted }) {
    const user = getUser();

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [preview, setPreview] = useState(user.profilePicture || null);
    const [newImg, setNewImg] = useState(null);
    const [dpOpen, setDpOpen] = useState(false);

    // Refresh local state every time the modal opens (user may have changed)
    useEffect(() => {
        if (open) {
            setPreview(user.profilePicture || null);
            setNewImg(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleClose = () => {
        setEditing(false);
        form.resetFields();
        onClose();
    };

    const save = async (values) => {
        setSaving(true);
        try {
            const updated = await updateProfile({
                fullName: values.fullName, phone: values.phone, gender: values.gender,
                currentPassword: values.currentPassword, newPassword: values.newPassword,
                ...(newImg !== null && { profilePicture: newImg }),
            });
            message.success("Profile updated");
            setEditing(false);
            form.resetFields();
            onProfileUpdate(updated);
        } catch (e) { message.error(e.response?.data?.message || "Update failed, try again"); }
        finally { setSaving(false); }
    };

    const startEdit = () => {
        form.setFieldsValue({ fullName: user.fullName, phone: user.phone, gender: user.gender });
        setPreview(user.profilePicture || null);
        setNewImg(null);
        setEditing(true);
    };

    const infoRows = [
        { label: "Phone", value: user.phone || "—", icon: <PhoneOutlined /> },
        { label: "Username", value: user.username || "—", icon: <UserOutlined /> },
    ];

    return (
        <>
        <Modal
            className="up-modal"
            open={open}
            onCancel={handleClose}
            footer={null}
            width={500}
            centered
            closable
            title={
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#f1f5f9", fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
                    {editing
                        ? <EditOutlined style={{ color: "#38bdf8" }} />
                        : <UserOutlined style={{ color: "#38bdf8" }} />}
                    {editing ? "Edit Profile" : "My Profile"}
                </span>
            }
            styles={{
                content: {
                    background: "linear-gradient(180deg, rgba(16,26,48,0.97) 0%, rgba(13,21,38,0.97) 100%)",
                    border: "1px solid rgba(96,165,250,0.22)",
                    borderRadius: 16, padding: 0, overflow: "hidden",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.08)",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                    padding: "14px 20px", margin: 0,
                },
                body: { background: "transparent", color: "#f1f5f9", padding: "16px 20px 20px" },
                mask: { backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" },
            }}
        >
            {!editing && (
                <div className="up-profile-tab">
                    {/* Avatar + name block */}
                    <div className="up-profile-header" style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "14px",
                        background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(37,99,235,0.05))",
                        borderRadius: 12,
                        border: "1px solid rgba(59,130,246,0.18)",
                        marginBottom: 8,
                    }}>
                        <div
                            className="up-avatar-wrapper"
                            onClick={() => user.profilePicture && setDpOpen(true)}
                            style={{ position: "relative", cursor: user.profilePicture ? "pointer" : "default", flexShrink: 0 }}
                            title={user.profilePicture ? "View profile photo" : undefined}
                        >
                            <UserAvatar name={user.fullName || user.username} pic={user.profilePicture} size={56} />
                            <div className="up-online-dot" style={{
                                position: "absolute", bottom: 1, right: 1,
                                width: 14, height: 14, borderRadius: "50%",
                                background: "#10b981", border: "2px solid #0d1424",
                            }} />
                        </div>
                        <div className="up-profile-info" style={{ flex: 1, minWidth: 0 }}>
                            <div className="up-profile-fullname" style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {user.fullName || user.username}
                            </div>
                            <div className="up-profile-email" style={{ color: "#64748b", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                        </div>
                    </div>

                    {/* Info rows */}
                    <div className="up-info-rows" style={{ marginBottom: 16 }}>
                        {infoRows.map(({ label, value, icon }, i) => (
                            <div className="up-info-row" key={label} style={{
                                display: "flex", alignItems: "center", gap: 14,
                                padding: "12px 8px",
                                borderTop: i > 0 ? "1px solid rgba(148,163,184,0.08)" : "none",
                            }}>
                                <span className="up-info-icon" style={rowIconStyle}>{icon}</span>
                                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                    <span className="up-info-label" style={{ color: "#64748b", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                                        {label}
                                    </span>
                                    <span className="up-info-value" style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 500 }}>{value}</span>
                                </span>
                            </div>
                        ))}
                    </div>

                    <Button
                        className="up-btn-edit-profile"
                        block
                        icon={<EditOutlined />}
                        onClick={startEdit}
                        style={{
                            height: 44, borderRadius: 12, fontWeight: 700, fontSize: 14,
                            background: "linear-gradient(135deg, rgba(59,130,246,0.85), rgba(37,99,235,0.85))",
                            border: "none", color: "#fff",
                            boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
                        }}
                    >
                        Edit Profile
                    </Button>
                </div>
            )}

            {editing && (
                <Form className="up-edit-form" form={form} layout="vertical" onFinish={save}>
                    {/* Avatar Upload */}
                    <div className="up-edit-avatar-section" style={{ textAlign: "center", marginBottom: 18 }}>
                        <ImgCrop rotationSlider aspect={1}>
                            <Upload
                                showUploadList={false}
                                customRequest={() => { }}
                                beforeUpload={file => {
                                    if (!file.type.startsWith("image/")) { message.error("Images only!"); return Upload.LIST_IGNORE; }
                                    if (file.size > 5 * 1024 * 1024) { message.error("Max 5MB!"); return Upload.LIST_IGNORE; }
                                    const r = new FileReader();
                                    r.onload = e => { setPreview(e.target.result); setNewImg(e.target.result); };
                                    r.readAsDataURL(file); return false;
                                }}
                            >
                                <div className="up-edit-avatar-wrapper" style={{ cursor: "pointer", position: "relative", display: "inline-block" }}>
                                    <Avatar
                                        className="up-edit-avatar"
                                        size={72}
                                        src={preview || null}
                                        icon={!preview && <UserOutlined />}
                                        style={{
                                            background: preview ? "transparent" : "linear-gradient(135deg, rgba(59,130,246,0.85), rgba(37,99,235,0.85))",
                                            color: "#fff",
                                            border: "3px solid rgba(59,130,246,0.3)",
                                        }}
                                    />
                                    <div className="up-camera-icon" style={{
                                        position: "absolute", bottom: 0, right: 0,
                                        background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                        borderRadius: "50%", width: 24, height: 24,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        border: "2px solid #0d1424",
                                    }}>
                                        <CameraOutlined style={{ color: "#fff", fontSize: 11 }} />
                                    </div>
                                </div>
                            </Upload>
                        </ImgCrop>
                        {preview && (
                            <Button
                                className="up-btn-remove-photo"
                                type="link" danger size="small"
                                style={{ display: "block", margin: "6px auto 0", fontSize: 11 }}
                                onClick={() => { setPreview(null); setNewImg(""); }}
                            >
                                Remove Photo
                            </Button>
                        )}
                    </div>

                    {/* Fields */}
                    {[
                        { n: "fullName", l: "Full Name", icon: <UserOutlined />, ph: "Full name", rules: [] },
                        {
                            n: "phone", l: "Phone", icon: <PhoneOutlined />, ph: "10-digit phone",
                            rules: [{ pattern: /^[0-9]{10}$/, message: "10 digits" }]
                        },
                    ].map(({ n, l, icon, ph, rules }) => (
                        <Form.Item className="up-edit-field" key={n} name={n} rules={rules}
                            label={<span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 13 }}>{l}</span>}
                            style={{ marginBottom: 16 }}
                        >
                            <Input
                                className="auth-input up-edit-input"
                                prefix={<span style={{ color: "#3b82f6", fontSize: 15 }}>{icon}</span>}
                                placeholder={ph}
                                style={inputStyle}
                            />
                        </Form.Item>
                    ))}

                    <Form.Item className="up-edit-field" name="gender"
                        label={<span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 13 }}>Gender</span>}
                        style={{ marginBottom: 16 }}
                    >
                        <Select
                            className="auth-input up-edit-input"
                            placeholder="Select gender"
                            style={inputStyle}
                            options={[
                                { value: "M", label: "Male" },
                                { value: "F", label: "Female" },
                            ]}
                        />
                    </Form.Item>

                    {/* Password Section */}
                    <div className="up-password-section" style={{ borderTop: "1px solid rgba(148,163,184,0.12)", margin: "16px 0", paddingTop: 16 }}>
                        <div className="up-password-title" style={{ color: "#94a3b8", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, marginBottom: 12 }}>CHANGE PASSWORD</div>
                        {[
                            { n: "currentPassword", l: "Current", ph: "Current password", rules: [] },
                            { n: "newPassword", l: "New", ph: "New password", rules: [{ min: 8, message: "Min 8 chars" }] },
                        ].map(({ n, l, ph, rules }) => (
                            <Form.Item className="up-edit-field" key={n} name={n} rules={rules}
                                label={<span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 13 }}>{l}</span>}
                                style={{ marginBottom: 16 }}
                            >
                                <Input.Password
                                    className="auth-input up-edit-input"
                                    prefix={<LockOutlined style={{ color: "#3b82f6", fontSize: 15 }} />}
                                    placeholder={ph}
                                    style={inputStyle}
                                />
                            </Form.Item>
                        ))}
                    </div>

                    <div className="up-edit-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                        <Button className="up-btn-cancel auth-btn" onClick={() => { form.resetFields(); setEditing(false); }}
                            style={{ height: 40, borderRadius: 10, fontWeight: 700, fontSize: 14, letterSpacing: 0.3, borderColor: "rgba(148,163,184,0.2)", color: "#94a3b8", background: "transparent" }}>
                            Cancel
                        </Button>
                        <Button className="up-btn-save auth-btn" type="primary" htmlType="submit" loading={saving}
                            style={{ height: 40, borderRadius: 10, fontWeight: 700, fontSize: 14, letterSpacing: 0.3, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }}>
                            Save Changes
                        </Button>
                    </div>
                </Form>
            )}
        </Modal>

            <Modal
                open={dpOpen}
                onCancel={() => setDpOpen(false)}
                footer={null}
                closable={false}
                centered
                width={640}
                destroyOnClose
                maskClosable
                className="instagram-dp-modal"
                styles={{
                    mask: { backgroundColor: "rgba(0,0,0,0.92)", backdropFilter: "blur(4px)" },
                    content: { background: "transparent", boxShadow: "none", padding: 0, border: "none" },
                    body: { padding: 0, background: "transparent" },
                }}
            >
                <div
                    style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}
                    onClick={() => setDpOpen(false)}
                >
                    <img
                        src={user.profilePicture}
                        alt="Profile full view"
                        style={{
                            objectFit: "cover",
                            borderRadius: "50%",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
                            border: "3px solid rgba(255,255,255,0.12)",
                            width: "86vw",
                            height: "86vw",
                            maxWidth: 600,
                            maxHeight: 600,
                            aspectRatio: "1 / 1",
                            cursor: "pointer",
                            display: "block",
                        }}
                    />
                </div>
            </Modal>
        </>
    );
}

export default UserProfile;
