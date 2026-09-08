import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "./css/ProfilePictureViewer.css";

function ProfilePictureViewer({ open, onClose, src, name }) {
    const [scale, setScale] = useState(1);
    const [rotate, setRotate] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imgRef = useRef(null);
    const containerRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const resetTransform = useCallback(() => {
        setScale(1);
        setRotate(0);
        setPosition({ x: 0, y: 0 });
    }, []);

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        e.preventDefault();
    };

    const handleTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    };

    useEffect(() => {
        const handleMove = (clientX, clientY) => {
            if (!isDragging) return;
            setPosition({ x: clientX - dragStart.x, y: clientY - dragStart.y });
        };

        const handleMouseMove = (e) => handleMove(e.clientX, e.clientY);
        const handleTouchMove = (e) => {
            // Only hijack the gesture while actively dragging the viewer image.
            // Otherwise the page must scroll normally (mobile).
            if (e.touches.length !== 1 || !isDragging) return;
            if (containerRef.current && !containerRef.current.contains(e.target)) return;
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault();
        };

        const handleUp = () => setIsDragging(false);

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleUp);
        window.addEventListener("touchmove", handleTouchMove, { passive: false });
        window.addEventListener("touchend", handleUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleUp);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("touchend", handleUp);
        };
    }, [isDragging, dragStart]);

    useEffect(() => {
        const handleWheel = (e) => {
            if (!containerRef.current || !containerRef.current.contains(e.target)) return;
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                setScale(s => Math.min(Math.max(s - e.deltaY * 0.001, 0.25), 5));
            } else {
                setPosition(p => ({
                    x: p.x - e.deltaX,
                    y: p.y - e.deltaY
                }));
            }
        };
        window.addEventListener("wheel", handleWheel, { passive: false });
        return () => window.removeEventListener("wheel", handleWheel);
    }, []);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
            resetTransform();
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [open, resetTransform]);

    const handleKeyDown = (e) => {
        if (!open) return;
        switch (e.key) {
            case "Escape":
                if (isFullscreen) setIsFullscreen(false);
                else onClose();
                break;
            case "=":
            case "+":
                setScale(s => Math.min(s + 0.25, 5));
                break;
            case "-":
                setScale(s => Math.max(s - 0.25, 0.25));
                break;
            case "r":
                setRotate(r => (r + 90) % 360);
                break;
            case "0":
                resetTransform();
                break;
            case "f":
                setIsFullscreen(!isFullscreen);
                break;
        }
    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, isFullscreen, onClose, resetTransform]);

    if (!open) return null;

    const transform = `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotate}deg)`;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            centered={!isFullscreen}
            width={isFullscreen ? "100vw" : 720}
            className={`ppv-modal ${isFullscreen ? "ppv-fullscreen" : ""}`}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.95)", backdropFilter: "blur(4px)" },
                content: {
                    background: "transparent",
                    boxShadow: "none",
                    padding: 0,
                    border: "none",
                    borderRadius: isFullscreen ? 0 : 12,
                    maxWidth: isFullscreen ? "100vw" : 720,
                },
                body: { padding: 0, background: "transparent" },
            }}
        >
            <div className="ppv-container" ref={containerRef}>
                <div className="ppv-header">
                    <div className="ppv-title">{name}</div>
                    <div className="ppv-actions">
                        <button className="ppv-close-btn" onClick={() => isFullscreen ? setIsFullscreen(false) : onClose()} aria-label="Close">
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>
                </div>
                <div className="ppv-image-wrapper" style={{ transform: isFullscreen ? "none" : undefined }}>
                    <img
                        ref={imgRef}
                        src={src}
                        alt={name}
                        className="ppv-image"
                        style={{
                            transform,
                            transformOrigin: "center center",
                            cursor: isDragging ? "grabbing" : "grab",
                        }}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        draggable="false"
                    />
                </div>
            </div>
        </Modal>
    );
}

export default ProfilePictureViewer;