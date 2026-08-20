export const relationTone = (relation) => {
  const r = (relation || "").toLowerCase();
  if (r.includes("brother") || r.includes("sister")) return { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.25)" };
  if (r.includes("father") || r.includes("mother")) return { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)" };
  if (r.includes("son") || r.includes("daughter")) return { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)" };
  if (r.includes("grand")) return { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" };
  if (r.includes("husband") || r.includes("wife")) return { color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.25)" };
  if (r.includes("friend")) return { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" };
  if (r.includes("uncle") || r.includes("aunt")) return { color: "#fb923c", bg: "rgba(251,146,60,0.1)", border: "rgba(251,146,60,0.25)" };
  return { color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.25)" };
};

export default function RelationChip({ relation, style }) {
  if (!relation) return <span className="nw-rel-empty">—</span>;
  const raw = typeof relation === "string" ? relation : relation.relationName || relation || `Relation ${relation.id}`;
  const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  const tone = relationTone(raw);
  return (
    <span
      className="nw-rel-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}