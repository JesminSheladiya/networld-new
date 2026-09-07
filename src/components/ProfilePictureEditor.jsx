import { useState, useRef, useEffect, useCallback } from "react";
import { Modal, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import "./css/ProfilePictureEditor.css";

const OUTPUT_SIZE = 512;
const BOX_RATIO = 0.8; // square crop box = 80% of stage

function ProfilePictureEditor({ open, onClose, onSave, src }) {
    const [workSrc, setWorkSrc] = useState(src);
    const [origSrc, setOrigSrc] = useState(src);
    const [nat, setNat] = useState({ w: 0, h: 0 });
    const [stageSize, setStageSize] = useState(320);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const stageRef = useRef(null);
    const pointersRef = useRef(new Map());
    const pinchRef = useRef(null);
    const stRef = useRef({ zoom, pan });
    stRef.current = { zoom, pan };

    // ---- derived geometry (all in stage px) ----
    const ar = nat.w && nat.h ? nat.w / nat.h : 1;
    const baseW = ar >= 1 ? stageSize : stageSize * ar;
    const baseH = ar >= 1 ? stageSize / ar : stageSize;
    const S = stageSize * BOX_RATIO; // fixed square box
    const coverZoom = baseW && baseH ? Math.max(S / baseW, S / baseH) : 1;
    const dispW = baseW * zoom;
    const dispH = baseH * zoom;
    const boxLeft = (stageSize - S) / 2;
    const boxTop = (stageSize - S) / 2;
    const boxCx = stageSize / 2;
    const boxCy = stageSize / 2;
    const imgLeft = (stageSize - dispW) / 2 + pan.x;
    const imgTop = (stageSize - dispH) / 2 + pan.y;

    // percent crop for react-image-crop (fixed box over the image)
    const crop = dispW > 0 ? {
        unit: "%",
        aspect: 1,
        x: ((boxLeft - imgLeft) / dispW) * 100,
        y: ((boxTop - imgTop) / dispH) * 100,
        width: (S / dispW) * 100,
        height: (S / dispH) * 100,
    } : undefined;

    // proper clamp: image must always cover the fixed box
    const clampPanReal = useCallback((p, z) => {
        const dw = baseW * z;
        const dh = baseH * z;
        const left0 = (stageSize - dw) / 2;
        const top0 = (stageSize - dh) / 2;
        // imgLeft = left0 + x must stay in [boxLeft + S - dw, boxLeft]
        const minX = boxLeft + S - dw - left0;
        const maxX = boxLeft - left0;
        const minY = boxTop + S - dh - top0;
        const maxY = boxTop - top0;
        return {
            x: Math.min(maxX, Math.max(minX, p.x)),
            y: Math.min(maxY, Math.max(minY, p.y)),
        };
    }, [baseW, baseH, boxLeft, boxTop, S, stageSize]);

    const resetAll = useCallback(() => {
        const cz = baseW && baseH ? Math.max(S / baseW, S / baseH) : 1;
        setZoom(cz);
        setPan({ x: 0, y: 0 });
    }, [baseW, baseH, S]);

    useEffect(() => {
        if (open) {
            setWorkSrc(src);
            setOrigSrc(src);
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setNat({ w: 0, h: 0 });
            pointersRef.current.clear();
            pinchRef.current = null;
        }
    }, [open, src]);

    useEffect(() => {
        if (!open) return;
        const el = stageRef.current;
        if (!el) return;
        const update = () => setStageSize(el.clientWidth || 320);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [open ]);

    useEffect(() => {
        if (!open || !workSrc) return;
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            setNat({ w, h });
            const a = w / h;
            const bw = a >= 1 ? stageSize : stageSize * a;
            const bh = a >= 1 ? stageSize / a : stageSize;
            setZoom(Math.max((stageSize * BOX_RATIO) / bw, (stageSize * BOX_RATIO) / bh));
            setPan({ x: 0, y: 0 });
        };
        img.src = workSrc;
    }, [open, workSrc, stageSize]);

    // zoom IMAGE around the fixed box center (crop box never changes size)
    const zoomImage = useCallback((factor) => {
        const { zoom: z, pan: p } = stRef.current;
        const cz = Math.max(S / baseW, S / baseH);
        const nz = Math.min(cz * 8, Math.max(cz, z * factor));
        if (nz === z || !baseW) return;
        const ratio = nz / z;
        const left0 = (stageSize - baseW * z) / 2;
        const top0 = (stageSize - baseH * z) / 2;
        const imgCx = left0 + p.x;
        const imgCy = top0 + p.y;
        const nLeft = boxCx - (boxCx - imgCx) * ratio;
        const nTop = boxCy - (boxCy - imgCy) * ratio;
        const nLeft0 = (stageSize - baseW * nz) / 2;
        const nTop0 = (stageSize - baseH * nz) / 2;
        setZoom(nz);
        setPan(clampPanReal({ x: nLeft - nLeft0, y: nTop - nTop0 }, nz));
    }, [S, baseW, baseH, boxCx, boxCy, stageSize, clampPanReal]);

    useEffect(() => {
        const el = stageRef.current;
        if (!el || !open) return;
        const onWheel = (e) => {
            e.preventDefault();
            zoomImage(e.deltaY < 0 ? 1.12 : 1 / 1.12);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [open, zoomImage]);

    const onPointerDown = (e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointersRef.current.size === 2) {
            const pts = [...pointersRef.current.values()];
            pinchRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
        }
    };

    const onPointerMove = (e) => {
        const prev = pointersRef.current.get(e.pointerId);
        if (!prev) return;
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointersRef.current.size === 2) {
            const pts = [...pointersRef.current.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (pinchRef.current && pinchRef.current.dist > 0) {
                zoomImage(1 + (dist - pinchRef.current.dist) / 220);
                pinchRef.current.dist = dist;
            }
            return;
        }

        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        const { zoom: z, pan: p } = stRef.current;
        setPan(clampPanReal({ x: p.x + dx, y: p.y + dy }, z));
    };

    const endPointer = (e) => {
        pointersRef.current.delete(e.pointerId);
        pinchRef.current = null;
    };

    const handleRotate = () => {
        if (!workSrc) return;
        const img = new Image();
        img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalHeight;
            c.height = img.naturalWidth;
            const ctx = c.getContext("2d");
            ctx.translate(c.width / 2, c.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            setWorkSrc(c.toDataURL("image/jpeg", 0.92));
        };
        img.src = workSrc;
    };

    const handleReset = () => {
        setWorkSrc(origSrc || src);
        const cz = baseW && baseH ? Math.max(S / baseW, S / baseH) : 1;
        setZoom(cz);
        setPan({ x: 0, y: 0 });
    };



    const handleSave = async () => {
        if (!workSrc || !nat.w || !dispW) return;
        // fixed square box in stage px -> source px
        const sx = ((boxLeft - imgLeft) / dispW) * nat.w;
        const sy = ((boxTop - imgTop) / dispH) * nat.h;
        const sw = (S / dispW) * nat.w;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = workSrc; });
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        canvas.getContext("2d").drawImage(img, sx, sy, sw, sw, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        canvas.toBlob((blob) => { if (blob && onSave) onSave(blob); }, "image/jpeg", 0.92);
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "Enter") handleSave();
            else if (e.key === "r" || e.key === "R") handleRotate();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (!open) return null;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            centered
            width={440}
            className="ppe-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)" },
                content: { background: "transparent", boxShadow: "none", padding: 0, border: "none" },
                body: { padding: 0, background: "transparent" },
            }}
        >
            <div className="ppe-card ppe-ig">
                <div className="ppe-topbar">
                    <div className="ppe-title">Edit photo</div>
                </div>

                <div className="ppe-stage-wrap ppe-bleed">
                    <div
                        ref={stageRef}
                        className="ppe-stage ppe-lib-stage"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endPointer}
                        onPointerCancel={endPointer}
                        onDoubleClick={resetAll}
                    >
                        {workSrc && dispW > 0 && (
                            <div className="ppe-imgwrap" style={{ left: imgLeft, top: imgTop, width: dispW, height: dispH }}>
                                <ReactCrop
                                    crop={crop}
                                    onChange={() => {}}
                                    aspect={1}
                                    ruleOfThirds
                                    keepSelection
                                >
                                    <img src={workSrc} alt="Adjust" className="ppe-img" draggable={false} />
                                </ReactCrop>
                            </div>
                        )}
                    </div>
                </div>

                <div className="ppe-controls">
                    <button className="ppe-textbtn" onClick={onClose}>
                        Cancel
                    </button>
                    <div className="ppe-midbtns">
                        <Tooltip title="Rotate (R)" placement="top">
                            <button className="ppe-action" onClick={handleRotate} aria-label="Rotate">
                                <FontAwesomeIcon icon={faRotateLeft} />
                            </button>
                        </Tooltip>
                        <Tooltip title="Reset" placement="top">
                            <button className="ppe-action" onClick={handleReset} aria-label="Reset">
                                <FontAwesomeIcon icon={faArrowsRotate} />
                            </button>
                        </Tooltip>
                    </div>
                    <button className="ppe-textbtn ppe-savebtn" onClick={handleSave}>
                        Save
                    </button>
                </div>
                    <div className="ppe-hint">Drag to move &bull; Scroll / pinch to zoom</div>
            </div>
        </Modal>
    );
}

export default ProfilePictureEditor;
