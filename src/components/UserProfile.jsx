import { useState, useEffect, useCallback } from "react";
import { Modal, Form, Input, Button, message, Avatar, Upload, Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faPhone, faCamera, faLock, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { updateProfile } from "../Services/authService";
import { useAuth } from "../context/AuthContext";
import ProfilePictureViewer from "./ProfilePictureViewer";
import ProfilePictureEditor from "./ProfilePictureEditor";
import "./css/Auth.css";

// Helper to convert a relation to its inverse (e.g., father ↔ son).
// `rel` = how the recipient relates to the sender; `gender` = sender's gender.
// Returns how the sender relates to the recipient (viewer perspective).
// Covers every master relation; unknown names pass through unchanged.
// Used by RequestsPage — do not remove.
export function getInverseRelation(rel, gender = "M") {
    if (!rel) return rel;
    const F = gender === "F";
    const sonDaughter = F ? "daughter" : "son";
    const fatherMother = F ? "mother" : "father";
    const brotherSister = F ? "sister" : "brother";
    const uncleAunt = F ? "aunt" : "uncle";
    const nephewNiece = F ? "niece" : "nephew";
    const grandsonGd = F ? "granddaughter" : "grandson";
    const grandfatherGd = F ? "grandmother" : "grandfather";
    const husbandWife = F ? "wife" : "husband";
    const silDil = F ? "daughter-in-law" : "son-in-law";
    const filMil = F ? "mother-in-law" : "father-in-law";
    const bilSil = F ? "sister-in-law" : "brother-in-law";
    const cousinB = F ? "cousin sister" : "cousin brother";
    const map = {
        // spouse
        "husband": husbandWife,
        "wife": husbandWife,
        // parents / children
        "father": sonDaughter,
        "mother": sonDaughter,
        "son": fatherMother,
        "daughter": fatherMother,
        // grandparents / grandchildren (incl. paternal/maternal variants)
        "grandfather": grandsonGd,
        "grandmother": grandsonGd,
        "paternal grandfather": grandsonGd,
        "paternal grandmother": grandsonGd,
        "maternal grandfather": F ? "Daughter's Daughter" : "Daughter's Son",
        "maternal grandmother": F ? "Daughter's Daughter" : "Daughter's Son",
        "grandson": grandfatherGd,
        "granddaughter": grandfatherGd,
        "daughters son": grandfatherGd,
        "daughters daughter": grandfatherGd,
        // siblings
        "brother": brotherSister,
        "sister": brotherSister,
        "elder brother": F ? "younger sister" : "younger brother",
        "elder sister": F ? "younger sister" : "younger brother",
        "younger brother": F ? "elder sister" : "elder brother",
        "younger sister": F ? "elder sister" : "elder brother",
        // uncles / aunts (generic + paternal/maternal + elder/younger variants)
        "uncle": nephewNiece,
        "aunt": nephewNiece,
        "paternal uncle": F ? "brother daughter" : "brother son",
        "paternal aunt": F ? "brother daughter" : "brother son",
        "maternal uncle": F ? "sister daughter" : "sister son",
        "maternal aunt": F ? "sister daughter" : "sister son",
        "father elder brother": F ? "brother daughter" : "brother son",
        "father elder brother wife": F ? "brother daughter" : "brother son",
        "father younger brother wife": F ? "brother daughter" : "brother son",
        "father sister husband": F ? "brother daughter" : "brother son",
        "mother brother wife": F ? "sister daughter" : "sister son",
        "mother sister husband": F ? "sister daughter" : "sister son",
        // nephews / nieces (generic + brother's/sister's variants)
        "nephew": uncleAunt,
        "niece": uncleAunt,
        "brother son": uncleAunt,
        "brother daughter": uncleAunt,
        "sister son": uncleAunt,
        "sister daughter": uncleAunt,
        // cousins (generic + paternal/maternal + uncle's/aunt's variants)
        "cousin brother": cousinB,
        "cousin sister": cousinB,
        "paternal cousin brother": cousinB,
        "paternal cousin sister": cousinB,
        "maternal cousin brother": cousinB,
        "maternal cousin sister": cousinB,
        // in-laws
        "father-in-law": silDil,
        "mother-in-law": silDil,
        "son-in-law": filMil,
        "daughter-in-law": filMil,
        "brother-in-law": bilSil,
        "sister-in-law": bilSil,
        "brother-in-law (wifes brother)": F ? "Sister-in-law" : "Brother-in-law (Sister's Husband)",
        "sister-in-law (wifes brothers wife)": F ? "Sister-in-law" : "Brother-in-law",
        "brother-in-law (wifes sisters husband)": F ? "Sister-in-law" : "Brother-in-law (Wife's Sister's Husband)",
        "brother-in-law (sisters husband)": F ? "Sister-in-law (Wife's Sister)" : "Brother-in-law",
        "brother-in-law (husbands brother)": bilSil,
        "sister-in-law (husbands sister)": bilSil,
        "sister-in-law (wifes sister)": F ? "Sister-in-law" : "Brother-in-law (Sister's Husband)",
        // neutral
        "friend": "friend",
        // english-compositional aliases (same relations, descriptive names)
        "fathers father": grandsonGd,
        "mothers father": grandsonGd,
        "fathers mother": grandsonGd,
        "mothers mother": grandsonGd,
        "fathers brother": F ? "brother daughter" : "brother son",
        "mothers brother": F ? "sister daughter" : "sister son",
        "fathers sister": F ? "brother daughter" : "brother son",
        "mothers sister": F ? "sister daughter" : "sister son",
        "sons son": grandfatherGd,
        "sons daughter": grandfatherGd,
        "daughters son": grandfatherGd,
        "daughters daughter": grandfatherGd,
        "childs son": grandfatherGd,
        "childs daughter": grandfatherGd,
        "parents siblings son": cousinB,
        "parents siblings daughter": cousinB,
        "spouses father": silDil,
        "spouses mother": silDil,
        "daughters husband": filMil,
        "sons wife": filMil,
        "husbands brother": bilSil,
        "sisters husband": bilSil,
        "husbands sister": bilSil,
        "wifes sister": bilSil,
        "childs spouses father": F ? "Child's Spouse's Mother" : "Child's Spouse's Father",
        "childs spouses mother": F ? "Child's Spouse's Mother" : "Child's Spouse's Father",
        "husbands sisters husband": F ? "Sister-in-law" : "Brother-in-law",
        "husbands brothers wife": F ? "Husband's Brother's Wife" : "Brother-in-law",
        "husbands elder brother": F ? "Sister-in-law" : "Brother-in-law",
        "husbands elder brothers wife": F ? "Sister-in-law" : "Brother-in-law",
    };
    // match ignoring case + apostrophes ("Father's Sister" -> "father sister")
    const key = rel.toLowerCase().replace(/'/g, "");
    if (map[key]) return map[key];

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

const rowIconStyle = {
    width: 38, height: 38, flexShrink: 0,
    borderRadius: 11,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(37,99,235,0.1)",
    border: "1px solid rgba(37,99,235,0.2)",
    color: "#7dd3fc", fontSize: 15,
};

function UserProfile({ open, onClose, onProfileUpdate, onRelationAccepted }) {
    const { user, updateUser, broadcastUserUpdate } = useAuth();

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [preview, setPreview] = useState(user?.profilePicture || null);
    const [newImg, setNewImg] = useState(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorSrc, setEditorSrc] = useState(null);

    // Refresh local state every time the modal opens (user may have changed)
    useEffect(() => {
        if (open) {
            setPreview(user?.profilePicture || null);
            setNewImg(null);
        }
    }, [open, user]);

    const handleClose = () => {
        setEditing(false);
        form.resetFields();
        onClose();
    };

    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const handleImageSelect = (file) => {
        if (!file.type.startsWith("image/")) { message.error("Images only!"); return; }
        if (file.size > 5 * 1024 * 1024) { message.error("Image size must be 5 MB or less."); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            setEditorSrc(e.target.result);
            setEditorOpen(true);
        };
        reader.readAsDataURL(file);
    };

    const handleEditorSave = useCallback(async (blob) => {
        const base64 = await blobToBase64(blob);
        setPreview(base64);
        setNewImg(base64);
        setEditorOpen(false);
        setEditorSrc(null);
    }, []);

    const handleEditorClose = useCallback(() => {
        setEditorOpen(false);
        setEditorSrc(null);
    }, []);

    const save = async (values) => {
        setSaving(true);
        try {
            await updateProfile({
                fullName: values.fullName, phone: values.phone, gender: values.gender,
                currentPassword: values.currentPassword, newPassword: values.newPassword,
                ...(newImg !== null && { profilePicture: newImg }),
            });
            const freshUser = await updateUser();
            if (freshUser) {
                broadcastUserUpdate(freshUser);
            }
            message.success("Profile updated");
            setEditing(false);
            form.resetFields();
            onProfileUpdate();
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
        { label: "Phone", value: user.phone || "—", icon: <FontAwesomeIcon icon={faPhone} /> },
        { label: "Username", value: user.username || "—", icon: <FontAwesomeIcon icon={faUser} /> },
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
                        ? <FontAwesomeIcon icon={faPenToSquare} style={{ color: "#38bdf8" }} />
                        : <FontAwesomeIcon icon={faUser} style={{ color: "#38bdf8" }} />}
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
                            onClick={() => user.profilePicture && setViewerOpen(true)}
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
                        icon={<FontAwesomeIcon icon={faPenToSquare} />}
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
                <Form className="auth-form up-edit-form" form={form} layout="vertical" onFinish={save}>
                    {/* Avatar Upload */}
                    <div className="up-edit-avatar-section" style={{ textAlign: "center", marginBottom: 24 }}>
                        <Upload
                            showUploadList={false}
                            customRequest={() => { }}
                            beforeUpload={file => {
                                handleImageSelect(file);
                                return Upload.LIST_IGNORE;
                            }}
                        >
                            <div className="up-edit-avatar-wrapper" style={{ cursor: "pointer", position: "relative", display: "inline-block" }}>
                                <Avatar
                                    className="up-edit-avatar"
                                    size={72}
                                    src={preview || null}
                                        icon={!preview && <FontAwesomeIcon icon={faUser} />}
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
                                        <FontAwesomeIcon icon={faCamera} style={{ color: "#fff", fontSize: 11 }} />
                                </div>
                            </div>
                        </Upload>
                        {preview && (
                            <Button
                                className="up-btn-remove-photo"
                                type="link" danger size="small"
                                style={{ display: "block", margin: "8px auto 0", fontSize: 12 }}
                                onClick={() => { setPreview(null); setNewImg(""); }}
                            >
                                Remove Photo
                            </Button>
                        )}
                    </div>

                    {/* Fields */}
                    {[
                        { n: "fullName", l: "Full Name", icon: faUser, ph: "Full name", rules: [{ required: true, message: "Please enter full name!" }] },
                        {
                            n: "phone", l: "Phone", icon: faPhone, ph: "10-digit phone",
                            rules: [{ pattern: /^[0-9]{10}$/, message: "10 digits" }]
                        },
                    ].map(({ n, l, icon, ph, rules }) => (
                        <Form.Item className="auth-field" key={n} name={n} rules={rules}
                        >
                            <Input
                                className="auth-input"
                                prefix={<FontAwesomeIcon icon={icon} className="auth-input-icon" />}
                                placeholder={ph}
                                size="large"
                            />
                        </Form.Item>
                    ))}

                    <Form.Item className="auth-field" name="gender"
                        rules={[{ required: true, message: "Please select gender!" }]}
                    >
                        <Select
                            className="auth-input"
                            placeholder="Select gender"
                            size="large"
                            options={[
                                { value: "M", label: "Male" },
                                { value: "F", label: "Female" },
                            ]}
                        />
                    </Form.Item>

                    {/* Password Section */}
                    <div className="up-password-section" style={{ borderTop: "1px solid rgba(148,163,184,0.12)", margin: "20px 0 16px", paddingTop: 20 }}>
                        <div className="up-password-title" style={{ color: "#94a3b8", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, marginBottom: 16 }}>CHANGE PASSWORD</div>
                        {[
                            { n: "currentPassword", l: "Current Password", ph: "Current password", rules: [] },
                            { n: "newPassword", l: "New Password", ph: "New password", rules: [{ min: 8, message: "Min 8 chars" }] },
                        ].map(({ n, l, ph, rules }) => (
                            <Form.Item className="auth-field" key={n} name={n} rules={rules}
                            >
                                <Input.Password
                                    className="auth-input"
                                    prefix={<FontAwesomeIcon icon={faLock} className="auth-input-icon" />}
                                    placeholder={ph}
                                    size="large"
                                    iconRender={(visible) => (
                                      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" />
                                    )}
                                />
                            </Form.Item>
                        ))}
                    </div>

                    <div className="auth-field auth-submit" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                        <Button className="auth-btn" type="default" onClick={() => { form.resetFields(); setEditing(false); }} size="large" block>
                            Cancel
                        </Button>
                        <Button className="auth-btn" type="primary" htmlType="submit" loading={saving} size="large" block>
                            Save Changes
                        </Button>
                    </div>
                </Form>
            )}
        </Modal>

        {/* WhatsApp-style Profile Picture Viewer */}
        <ProfilePictureViewer
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            src={user.profilePicture}
            name={user.fullName || user.username}
        />

        {/* WhatsApp-style Profile Picture Editor */}
        <ProfilePictureEditor
            open={editorOpen}
            onClose={handleEditorClose}
            onSave={handleEditorSave}
            src={editorSrc}
        />
        </>
    );
}

export default UserProfile;