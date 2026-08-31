import { useState, useEffect } from "react";
import { Modal, Form, Input, Button, message, Avatar, Upload, Tabs, Spin, Select } from "antd";
import {
    UserOutlined, PhoneOutlined, LockOutlined, EditOutlined,
    CameraOutlined, CheckOutlined, CloseOutlined,
    BellOutlined
} from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { updateProfile, getUser } from "../Services/authService";
import { http } from "../Services/https";

// Helper to convert a relation to its inverse (e.g., father ↔ son)
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


const BASE = process.env.REACT_APP_API_URL?.replace("/api/contacts", "/api") || "http://localhost:8080/api";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
const avatarBg = (name = "") => COLORS[(name.charCodeAt(0) || 0) % COLORS.length];

const relStyle = (rel = "") => {
    const r = rel.toLowerCase();
    if (r.includes("brother") || r.includes("sister")) return { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)" };
    if (r.includes("father") || r.includes("mother")) return { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)" };
    if (r.includes("son") || r.includes("daughter")) return { color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)" };
    if (r.includes("grand")) return { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)" };
    if (r.includes("husband") || r.includes("wife")) return { color: "#f472b6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.3)" };
    return { color: "#22d3ee", bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.3)" };
};

const RelChip = ({ rel }) => {
    if (!rel) return null;
    const s = relStyle(rel);
    return (
        <span className="up-rel-chip" style={{
            color: s.color, background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
            whiteSpace: "nowrap", letterSpacing: 0.3,
        }}>
            {rel.charAt(0).toUpperCase() + rel.slice(1).toLowerCase()}
        </span>
    );
};

const UserAvatar = ({ name, pic, size = 36 }) => (
    <Avatar
        className="up-user-avatar"
        size={size}
        src={pic || null}
        style={{
            backgroundColor: pic ? "transparent" : avatarBg(name || ""),
            fontWeight: 700,
            flexShrink: 0,
            border: "2px solid rgba(255,255,255,0.08)",
        }}
    >
        {!pic && (name?.charAt(0) || "?").toUpperCase()}
    </Avatar>
);

const PersonRow = ({ name, email, pic, rel, reason, actions }) => (
    <div className="up-person-row" style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        marginBottom: 6,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        transition: "all 0.2s",
    }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.06)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
    >
        <UserAvatar name={name} pic={pic} />
        <div className="up-person-info" style={{ flex: 1, minWidth: 0 }}>
            <div className="up-person-name" style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
            </div>
            {reason
                ? <div className="up-person-reason" style={{ color: "#64748b", fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</div>
                : email && <div className="up-person-email" style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>{email}</div>
            }
        </div>
        {rel && <RelChip rel={rel} />}
        {actions && <div className="up-person-actions" style={{ display: "flex", gap: 6, flexShrink: 0 }}>{actions}</div>}
    </div>
);

const ActionBtn = ({ onClick, accept }) => (
    <button className={`up-action-btn ${accept ? "up-action-btn-accept" : "up-action-btn-decline"}`} onClick={onClick} style={{
        width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 13, border: "none",
        background: accept ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)",
        color: accept ? "#10b981" : "#ef4444",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
    }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
    >
        {accept ? <CheckOutlined style={{ fontSize: 12 }} /> : <CloseOutlined style={{ fontSize: 12 }} />}
    </button>
);

const EmptyState = ({ icon, text }) => (
    <div className="up-empty-state" style={{ textAlign: "center", padding: "32px 0", color: "#334155" }}>
        <div className="up-empty-icon" style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{icon}</div>
        <div className="up-empty-text" style={{ fontSize: 12, color: "#475569" }}>{text}</div>
    </div>
);

const SectionLabel = ({ children }) => (
    <div className="up-section-label" style={{
        fontSize: 10, fontWeight: 700, color: "#334155",
        letterSpacing: 1.2, textTransform: "uppercase",
        marginBottom: 8, marginTop: 4,
    }}>
        {children}
    </div>
);

const inputStyle = {
    background: "#0d1117", borderColor: "rgba(99,102,241,0.3)",
    color: "#f8fafc", height: 40, borderRadius: 8, fontSize: 13,
};

function UserProfile({ open, onClose, onProfileUpdate, onRelationAccepted }) {
    const user = getUser();

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [preview, setPreview] = useState(user.profilePicture || null);
    const [newImg, setNewImg] = useState(null);
    const [dpOpen, setDpOpen] = useState(false);

    useEffect(() => {
        // Nothing here for now
    }, [open]);

    const save = async (values) => {
        setSaving(true);
        try {
            const updated = await updateProfile({
                fullName: values.fullName, phone: values.phone, gender: values.gender,
                currentPassword: values.currentPassword, newPassword: values.newPassword,
                ...(newImg !== null && { profilePicture: newImg }),
            });
            message.success("Saved!"); setEditing(false); onProfileUpdate(updated);
        } catch (e) { message.error(e.response?.data?.message || "Failed!"); }
        finally { setSaving(false); }
    };

    /* ── Stat badge ── */
    const StatBadge = ({ count, label, color }) => (
        <div className="up-stat-badge" style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "8px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            minWidth: 64,
        }}>
            <span className="up-stat-count" style={{ fontSize: 18, fontWeight: 800, color }}>{count}</span>
            <span className="up-stat-label" style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{label}</span>
        </div>
    );

    const tabItems = [
        /* ── PROFILE TAB ── */
        {
            key: "profile",
            label: (
                <span className="up-tab-label-profile" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <UserOutlined style={{ fontSize: 12 }} /> Profile
                </span>
            ),
            children: (
                <div className="up-profile-tab">
                    {/* Avatar + name block */}
                    <div className="up-profile-header" style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "12px 14px",
                        background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))",
                        borderRadius: 12,
                        border: "1px solid rgba(99,102,241,0.12)",
                        marginBottom: 14,
                    }}>
                        <div
                            className="up-avatar-wrapper"
                            onClick={() => user.profilePicture && setDpOpen(true)}
                            style={{ position: "relative", cursor: user.profilePicture ? "pointer" : "default" }}
                            title={user.profilePicture ? "View profile photo" : undefined}
                        >
                            <UserAvatar name={user.fullName || user.username} pic={user.profilePicture} size={52} />
                            <div className="up-online-dot" style={{
                                position: "absolute", bottom: 0, right: -2,
                                width: 14, height: 14, borderRadius: "50%",
                                background: "#10b981", border: "2px solid #0a0e1a",
                            }} />
                        </div>
                        <div className="up-profile-info" style={{ flex: 1, minWidth: 0 }}>
                            <div className="up-profile-fullname" style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                                {user.fullName || user.username}
                            </div>
                            <div className="up-profile-email" style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>{user.email}</div>
                            <div className="up-profile-role" style={{
                                display: "inline-block", marginTop: 5,
                                background: "rgba(99,102,241,0.15)", color: "#818cf8",
                                borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 600,
                            }}>
                                {user.role || "USER"}
                            </div>
                        </div>
                    </div>

                    {/* Info rows */}
                    <div className="up-info-rows" style={{ marginBottom: 14 }}>
                        {[
                            ["Phone", user.phone || "—", "📞"],
                            ["Username", user.username, "👤"],
                        ].map(([l, v, icon]) => (
                            <div className="up-info-row" key={l} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                                fontSize: 12,
                            }}>
                                <span className="up-info-label" style={{ color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 11 }}>{icon}</span>{l}
                                </span>
                                <span className="up-info-value" style={{ color: "#94a3b8", fontWeight: 500 }}>{v}</span>
                            </div>
                        ))}
                    </div>

                    {/* Stats */}
                    <div className="up-stats-row" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        <StatBadge count={0} label="Requests" color="#f59e0b" />
                    </div>

                    <Button
                        className="up-btn-edit-profile"
                        size="small"
                        icon={<EditOutlined />}
                        style={{
                            borderRadius: 8, borderColor: "rgba(99,102,241,0.4)",
                            color: "#a78bfa", background: "rgba(99,102,241,0.08)",
                            fontSize: 12,
                        }}
                        onClick={() => {
                            form.setFieldsValue({ fullName: user.fullName, phone: user.phone, gender: user.gender });
                            setPreview(user.profilePicture || null);
                            setNewImg(null);
                            setEditing(true);
                        }}
                    >
                        Edit Profile
                    </Button>
                </div>
            ),
        },


    ];

    return (
        <>
        <Modal
            className="up-modal"
            open={open}
            onCancel={() => { setEditing(false); onClose(); }}
            footer={null}
            width={500}
            centered
            closable
            title={
                <span style={{ color: "#a78bfa", fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
                    {editing ? "✏️ Edit Profile" : "👤 My Profile"}
                </span>
            }
            styles={{
                content: {
                    background: "#0a0e1a",
                    border: "1px solid rgba(99,102,241,0.2)",
                    borderRadius: 14, padding: 0,
                    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
                },
                header: {
                    background: "#0a0e1a",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    padding: "12px 18px", margin: 0,
                },
                body: { background: "#0a0e1a", color: "#f8fafc", padding: "14px 18px 18px" },
                mask: { backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" },
            }}
        >
            {!editing && (
                <Tabs
                    className="up-tabs"
                    items={tabItems}
                    size="small"
                    tabBarStyle={{
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        marginBottom: 14,
                        fontSize: 12,
                    }}
                />
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
                                        size={70}
                                        src={preview || null}
                                        icon={!preview && <UserOutlined />}
                                        style={{
                                            background: preview ? "transparent" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                                            color: "#fff",
                                            border: "3px solid rgba(99,102,241,0.3)",
                                        }}
                                    />
                                    <div className="up-camera-icon" style={{
                                        position: "absolute", bottom: 0, right: 0,
                                        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                                        borderRadius: "50%", width: 22, height: 22,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        border: "2px solid #0a0e1a",
                                    }}>
                                        <CameraOutlined style={{ color: "#fff", fontSize: 10 }} />
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
                            label={<span style={{ color: "#64748b", fontSize: 11 }}>{l}</span>}
                            style={{ marginBottom: 12 }}
                        >
                            <Input className="up-edit-input" prefix={<span style={{ color: "#6366f1" }}>{icon}</span>} placeholder={ph} style={inputStyle} />
                        </Form.Item>
                    ))}

                    <Form.Item className="up-edit-field" name="gender"
                        label={<span style={{ color: "#64748b", fontSize: 11 }}>Gender</span>}
                        style={{ marginBottom: 12 }}
                    >
                        <Select
                            className="up-edit-input"
                            placeholder="Select gender"
                            style={inputStyle}
                            options={[
                                { value: "M", label: "Male" },
                                { value: "F", label: "Female" },
                            ]}
                        />
                    </Form.Item>

                    {/* Password Section */}
                    <div className="up-password-section" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "12px 0", paddingTop: 12 }}>
                        <div className="up-password-title" style={{ color: "#334155", fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>CHANGE PASSWORD</div>
                        {[
                            { n: "currentPassword", l: "Current", ph: "Current password", rules: [] },
                            { n: "newPassword", l: "New", ph: "New password", rules: [{ min: 8, message: "Min 8 chars" }] },
                        ].map(({ n, l, ph, rules }) => (
                            <Form.Item className="up-edit-field" key={n} name={n} rules={rules}
                                label={<span style={{ color: "#64748b", fontSize: 11 }}>{l}</span>}
                                style={{ marginBottom: 12 }}
                            >
                                <Input.Password className="up-edit-input" prefix={<LockOutlined style={{ color: "#6366f1" }} />} placeholder={ph} style={inputStyle} />
                            </Form.Item>
                        ))}
                    </div>

                    <div className="up-edit-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button className="up-btn-cancel" size="small" onClick={() => setEditing(false)}
                            style={{ borderRadius: 8, borderColor: "rgba(255,255,255,0.1)", color: "#64748b" }}>
                            Cancel
                        </Button>
                        <Button className="up-btn-save" size="small" type="primary" htmlType="submit" loading={saving}
                            style={{ borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none" }}>
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
                width={540}
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
                            maxWidth: 500,
                            maxHeight: 500,
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