import { useMemo, useRef, useState, useEffect } from "react";
import { Modal } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { formatBirthDateWithAge, formatLongDate } from "../../utils/dateUtils";

const DEFAULT_DRAFT = new Date(2000, 0, 1);

const SnapColumn = ({ items, value, onChange, itemHeight = 40, width = '33%' }) => {
  const ref = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTopStart = useRef(0);

  // Snap scroll sync to value
  useEffect(() => {
    if (ref.current) {
      const idx = items.findIndex(it => it.value === value);
      if (idx !== -1) {
        const syncScroll = () => {
          if (!ref.current) return;
          const currentIdx = Math.round(ref.current.scrollTop / itemHeight);
          if (currentIdx !== idx) {
            isProgrammaticScroll.current = true;
            // Use instant scroll (behavior: auto) for immediate alignment, 
            // especially important on mobile when modal opens
            ref.current.scrollTo({ top: idx * itemHeight, behavior: 'auto' });
            clearTimeout(scrollTimeout.current);
            scrollTimeout.current = setTimeout(() => {
              isProgrammaticScroll.current = false;
            }, 100);
          }
        };
        syncScroll();
        // Retry shortly after to ensure mobile modal transition didn't swallow it
        const t = setTimeout(syncScroll, 50);
        const t2 = setTimeout(syncScroll, 200);
        return () => { clearTimeout(t); clearTimeout(t2); };
      }
    }
  }, [value, items, itemHeight]);

  const handleScroll = (e) => {
    if (isProgrammaticScroll.current) return;
    const idx = Math.round(e.target.scrollTop / itemHeight);
    if (items[idx] && items[idx].value !== value) {
      onChange(items[idx].value);
    }
  };

  const handlePointerDown = (e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    scrollTopStart.current = ref.current.scrollTop;
    ref.current.style.scrollSnapType = 'none';
    try { ref.current.setPointerCapture(e.pointerId); } catch (err) { }
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const dy = e.clientY - startY.current;
    ref.current.scrollTop = scrollTopStart.current - dy;
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    ref.current.style.scrollSnapType = 'y mandatory';
    try { ref.current.releasePointerCapture(e.pointerId); } catch (err) { }

    // Snap to nearest item when released
    const idx = Math.round(ref.current.scrollTop / itemHeight);
    ref.current.scrollTo({ top: idx * itemHeight, behavior: 'smooth' });
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        height: itemHeight * 5, // show 5 items
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none', // hide scrollbar Firefox
        msOverflowStyle: 'none', // hide scrollbar IE
        width,
        position: 'relative',
        userSelect: 'none'
      }}
      className="snap-column hide-scrollbar"
    >
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <div style={{ height: itemHeight * 2 }} /> {/* Padding top */}
      {items.map((item, idx) => {
        const isSelected = item.value === value;
        return (
          <div
            key={item.value}
            style={{
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'center',
              opacity: isSelected ? 1 : 0.35,
              fontWeight: isSelected ? 600 : 500,
              fontSize: isSelected ? 18 : 15,
              color: isSelected ? '#fff' : '#64748b',
              transition: 'all 0.15s ease',
              cursor: 'pointer'
            }}
            onClick={() => {
              isProgrammaticScroll.current = true;
              ref.current.scrollTo({ top: idx * itemHeight, behavior: 'smooth' });
              onChange(item.value);
              setTimeout(() => { isProgrammaticScroll.current = false; }, 300);
            }}
          >
            {item.label}
          </div>
        );
      })}
      <div style={{ height: itemHeight * 2 }} /> {/* Padding bottom */}
    </div>
  );
};

export default function ScrollDatePicker({ value, onChange, placeholder = "Birth Date (optional)" }) {
  const validValue = value && dayjs(value).isValid() ? dayjs(value) : null;
  const valueKey = validValue ? validValue.format("YYYY-MM-DD") : "";

  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(DEFAULT_DRAFT);

  const bounds = useMemo(() => {
    const now = new Date();
    const min = new Date(now.getFullYear() - 149, now.getMonth(), now.getDate());
    return { min, max: now, minYear: now.getFullYear() - 149, maxYear: now.getFullYear() };
  }, []);

  useEffect(() => {
    if (open) {
      setDraftDate(validValue ? validValue.toDate() : DEFAULT_DRAFT);
    }
  }, [open, validValue]);

  const draftKey = dayjs(draftDate).format("YYYY-MM-DD");

  const years = useMemo(() => {
    const arr = [];
    for (let i = bounds.maxYear; i >= bounds.minYear; i--) {
      arr.push({ value: i, label: String(i) });
    }
    return arr;
  }, [bounds]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2000, i, 1);
      return { value: i, label: d.toLocaleString('en-US', { month: 'short' }) };
    });
  }, []);

  const daysInMonth = new Date(draftDate.getFullYear(), draftDate.getMonth() + 1, 0).getDate();
  const days = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => ({ value: i + 1, label: String(i + 1).padStart(2, '0') }));
  }, [daysInMonth]);

  const handleChange = (type, val) => {
    const newDate = new Date(draftDate);
    if (type === 'year') newDate.setFullYear(val);
    if (type === 'month') newDate.setMonth(val);
    if (type === 'day') newDate.setDate(val);

    // clamp days if month changes (e.g. Jan 31 -> Feb 28)
    const newDaysInMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
    if (newDate.getDate() > newDaysInMonth) {
      newDate.setDate(newDaysInMonth);
    }

    // clamp to bounds
    if (newDate > bounds.max) setDraftDate(bounds.max);
    else if (newDate < bounds.min) setDraftDate(bounds.min);
    else setDraftDate(newDate);
  };

  return (
    <>
      <div className="sdp-field" onClick={() => setOpen(true)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}>
        <span className={validValue ? "sdp-head-val" : "sdp-head-ph"}>
          {validValue ? formatBirthDateWithAge(valueKey) : placeholder}
        </span>
        <CalendarOutlined className="auth-input-icon" />
      </div>
      <Modal
        className="sdp-modal"
        title={<span style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 700 }}>Select Birth Date</span>}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={360}
        styles={{
          content: {
            background: "linear-gradient(160deg, rgba(37, 99, 235, 0.2) 0%, rgba(15, 26, 49, 0.78) 52%, rgba(9, 14, 26, 0.88) 100%)",
            border: "1px solid rgba(147, 197, 253, 0.32)",
            borderRadius: 16,
            padding: 0,
            overflow: "hidden",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 16px 48px rgba(0, 0, 0, 0.55), 0 0 28px rgba(37, 99, 235, 0.16)",
            backdropFilter: "blur(22px) saturate(150%)",
            WebkitBackdropFilter: "blur(22px) saturate(150%)"
          },
          header: {
            background: "transparent",
            borderBottom: "1px solid rgba(148,163,184,0.12)",
            padding: "16px 20px",
            margin: 0,
            textAlign: "center"
          },
          body: { background: "transparent", padding: "12px 18px 14px" },
          mask: { backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" },
        }}
      >
        <div className="sdp-preview" style={{
          textAlign: "center", color: "#f1f5f9", fontSize: 21, fontWeight: 800, letterSpacing: "0.3px", padding: "6px 0 16px"
        }}>
          {formatBirthDateWithAge(draftKey) || "—"}
        </div>

        {/* Custom Wheel Picker */}
        <div style={{ display: 'flex', borderTop: '1px solid rgba(148,163,184,0.14)', borderBottom: '1px solid rgba(148,163,184,0.14)', position: 'relative' }}>
          {/* Selection overlay box */}
          <div style={{
            position: 'absolute', top: '50%', left: 12, right: 12,
            height: 40, marginTop: -20,
            background: 'linear-gradient(90deg, rgba(59,130,246,0) 0%, rgba(59,130,246,0.15) 50%, rgba(59,130,246,0) 100%)',
            borderTop: '1px solid rgba(59,130,246,0.3)',
            borderBottom: '1px solid rgba(59,130,246,0.3)',
            pointerEvents: 'none',
          }} />

          <SnapColumn items={days} value={draftDate.getDate()} onChange={(v) => handleChange('day', v)} width="30%" />
          <SnapColumn items={months} value={draftDate.getMonth()} onChange={(v) => handleChange('month', v)} width="40%" />
          <SnapColumn items={years} value={draftDate.getFullYear()} onChange={(v) => handleChange('year', v)} width="30%" />
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 4px 4px', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              onChange?.(null);
              setOpen(false);
            }}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
              color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              onChange?.(dayjs(draftDate));
              setOpen(false);
            }}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
              color: '#fff', background: 'linear-gradient(135deg, rgba(59,130,246,0.85), rgba(37,99,235,0.85))',
              border: 'none', boxShadow: '0 4px 14px rgba(37,99,235,0.3)', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Save
          </button>
        </div>
      </Modal>
    </>
  );
}
