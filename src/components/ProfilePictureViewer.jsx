function ProfilePictureViewer({ open, onClose, src, name }) {
    if (!open) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 2000,
                background: "rgba(0,0,0,0.92)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
        >
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                style={{
                    position: "fixed",
                    top: 16,
                    right: 16,
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontSize: 18,
                    cursor: "pointer",
                    zIndex: 2001,
                }}
            >
                ✕
            </span>
            {src && (
                <img
                    src={src}
                    alt="Profile full view"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        objectFit: "contain",
                        width: "min(480px, 100%)",
                        height: "auto",
                        maxHeight: "80vh",
                        display: "block",
                        background: "#000",
                        borderRadius: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
                    }}
                />
            )}
        </div>
    );
}

export default ProfilePictureViewer;
