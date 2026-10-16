import { useState, useRef, useEffect, useCallback } from "react";
import { Modal, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import "./css/ProfilePictureEditor.css";

const BOX_RATIO = 0.8; // square crop box = 80% of stage (aspect === 1 path)

// Fixed-ratio crop editor (drag to move, scroll/pinch to zoom).
// Defaults are the profile-photo flow (1:1 box, 512x512 output).
// Cover flow passes aspect={3} etc. — geometry below generalizes to
// any box via BW/BH; the square path is byte-for-byte the old behavior.
function ProfilePictureEditor({
    open,
    onClose,
    onSave,
    src,
    aspect = 1,
    outputWidth = 512,
    outputHeight = 512,
    stageAspect = 1,
    modalWidth = 440,
    title = "Edit photo",
}) {
    const [workSrc, setWorkSrc] = useState(src);
    const [origSrc, setOrigSrc] = useState(src);
    const [nat, setNat] = useState({ w: 0, h: 0 });
    const [stageW, setStageW] = useState(320);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const stageRef = useRef(null);
    const pointersRef = useRef(new Map());
    const pinchRef = useRef(null);
    const stRef = useRef({ zoom, pan });
    stRef.current = { zoom, pan };

    const stageH = stageW / (stageAspect || 1);

    // ---- crop box (stage px, centered) ----
    const S = stageW * BOX_RATIO;
    let BW = S;
    let BH = S;
    if (aspect !== 1) {
        BW = stageW * 0.92;
        BH = BW / aspect;
        if (BH > stageH * 0.9) {
            BH = stageH * 0.9;
            BW = BH * aspect;
        }
    }

    // ---- derived geometry (all in stage px) ----
    // image fitted into the stage (contain)
    const fitScale = nat.w && nat.h ? Math.min(stageW / nat.w, stageH / nat.h) : 0;
    const baseW = fitScale ? nat.w * fitScale : 0;
    const baseH = fitScale ? nat.h * fitScale : 0;
    const dispW = baseW * zoom;
    const dispH = baseH * zoom;
    const boxLeft = (stageW - BW) / 2;
    const boxTop = (stageH - BH) / 2;
    const boxCx = stageW / 2;
    const boxCy = stageH / 2;
    const imgLeft = (stageW - dispW) / 2 + pan.x;
    const imgTop = (stageH - dispH) / 2 + pan.y;

    // percent crop for react-image-crop (fixed box over the image)
    const crop = dispW > 0 ? {
        unit: "%",
        aspect,
        x: ((boxLeft - imgLeft) / dispW) * 100,
        y: ((boxTop - imgTop) / dispH) * 100,
        width: (BW / dispW) * 100,
        height: (BH / dispH) * 100,
    } : undefined;

    // proper clamp: image must always cover the fixed box
    const clampPanReal = useCallback((p, z) => {
        const dw = baseW * z;
        const dh = baseH * z;
        const left0 = (stageW - dw) / 2;
        const top0 = (stageH - dh) / 2;
        // imgLeft = left0 + x must stay in [boxLeft + BW - dw, boxLeft]
        const minX = boxLeft + BW - dw - left0;
        const maxX = boxLeft - left0;
        const minY = boxTop + BH - dh - top0;
        const maxY = boxTop - top0;
        return {
            x: Math.min(maxX, Math.max(minX, p.x)),
            y: Math.min(maxY, Math.max(minY, p.y)),
        };
    }, [baseW, baseH, boxLeft, boxTop, BW, BH, stageW, stageH]);

    const coverZoom = baseW && baseH ? Math.max(BW / baseW, BH / baseH) : 1;
    const resetAll = useCallback(() => {
        setZoom(coverZoom);
        setPan({ x: 0, y: 0 });
    }, [coverZoom]);

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
        const update = () => setStageW(el.clientWidth || 320);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [open]);

    useEffect(() => {
        if (!open || !workSrc) return;
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            setNat({ w, h });
            const sc = Math.min(stageW / w, (stageW / (stageAspect || 1)) / h);
            setZoom(Math.max((BW / (w * sc)) || 1, (BH / (h * sc)) || 1));
            setPan({ x: 0, y: 0 });
        };
        img.src = workSrc;
    }, [open, workSrc, stageW, stageAspect, BW, BH]);

    // zoom IMAGE around the fixed box center (crop box never changes size)
    const zoomImage = useCallback((factor) => {
        const { zoom: z, pan: p } = stRef.current;
        const cz = Math.max(BW / baseW, BH / baseH);
        const nz = Math.min(cz * 8, Math.max(cz, z * factor));
        if (nz === z || !baseW) return;
        const ratio = nz / z;
        const left0 = (stageW - baseW * z) / 2;
        const top0 = (stageH - baseH * z) / 2;
        const imgCx = left0 + p.x;
        const imgCy = top0 + p.y;
        const nLeft = boxCx - (boxCx - imgCx) * ratio;
        const nTop = boxCy - (boxCy - imgCy) * ratio;
        const nLeft0 = (stageW - baseW * nz) / 2;
        const nTop0 = (stageH - baseH * nz) / 2;
        setZoom(nz);
        setPan(clampPanReal({ x: nLeft - nLeft0, y: nTop - nTop0 }, nz));
    }, [BW, BH, baseW, baseH, boxCx, boxCy, stageW, stageH, clampPanReal]);

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
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            setWorkSrc(c.toDataURL("image/jpeg", 0.92));
        };
        img.src = workSrc;
    };

    const handleReset = () => {
        setWorkSrc(origSrc || src);
        setZoom(coverZoom);
        setPan({ x: 0, y: 0 });
    };



    const handleSave = async () => {
        if (!workSrc || !nat.w || !dispW) return;
        // fixed box in stage px -> source px
        const sx = ((boxLeft - imgLeft) / dispW) * nat.w;
        const sy = ((boxTop - imgTop) / dispH) * nat.h;
        const sw = (BW / dispW) * nat.w;
        const sh = (BH / dispH) * nat.h;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = workSrc; });
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
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
            maskClosable={false}
            centered
            width={modalWidth}
            className="ppe-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)" },
                content: { background: "transparent", boxShadow: "none", padding: 0, border: "none" },
                body: { padding: 0, background: "transparent" },
            }}
        >
            <div className="ppe-card ppe-ig">
                <div className="ppe-topbar">
                    <div className="ppe-title">{title}</div>
                </div>

                <div className="ppe-stage-wrap ppe-bleed">
                    <div
                        ref={stageRef}
                        className="ppe-stage ppe-lib-stage"
                        style={{ aspectRatio: `${stageAspect || 1} / 1` }}
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
                                    onChange={() => { }}
                                    aspect={aspect}
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
