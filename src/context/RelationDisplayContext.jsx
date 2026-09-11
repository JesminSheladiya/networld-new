import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { api } from '../Services/networld';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'nw-relation-format';

const FIELD_BY_FORMAT = {
  english: 'englishRelation',
  indian: 'indianRelation',
  generic: 'genericRelation',
};

const RelationDisplayContext = createContext(null);

export function RelationDisplayProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [format, setFormatState] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [master, setMaster] = useState({});
  const [masterLower, setMasterLower] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Logout clears the choice so the popup shows again on next login
  useEffect(() => {
    if (!isAuthenticated) {
      setFormatState(null);
      setPickerOpen(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Full map (hidden engine rows like Brother/Grandfather carry their own
    // indian/generic names) so chips never fall back to English. Pickers
    // keep using the filtered list — this is display-only.
    api.relationsAll()
      .catch(() => api.relations())
      .then((res) => {
        const map = {};
        const lower = {};
        for (const r of res.data || []) {
          map[r.relationName] = r;
          lower[(r.relationName || "").toLowerCase()] = r;
        }
        setMaster(map);
        setMasterLower(lower);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const setFormat = useCallback((f) => {
    localStorage.setItem(STORAGE_KEY, f);
    setFormatState(f);
  }, []);

  const relName = useCallback((name) => {
    if (!name) return name;
    const row = master[name] || masterLower[(name || "").toLowerCase()];
    const field = FIELD_BY_FORMAT[format || 'english'];
    return row?.[field] || name;
  }, [master, masterLower, format]);

  // Unique, always-understandable picker labels. Several rows share one
  // display name in Indian/Generic format (Indian "Jija (Samanya)" vs
  // "Jija (Behen ke Pati)"; Generic "Brother-in-law" x7). A colliding row
  // gets its precise English name appended — English is unique across
  // every row, so the result is collision-free in all three languages.
  // If English already contains the display name (e.g. Generic
  // "Brother-in-law" vs English "Brother-in-law (General)"), use English
  // alone instead of nesting brackets. Future rows are covered
  // automatically (no per-name list to maintain).
  const relOptionLabel = useCallback((row, rows) => {
    if (!row) return "";
    const field = FIELD_BY_FORMAT[format || 'english'];
    const base = row?.[field] || row.relationName;
    const dup = (rows || []).some((o) => o !== row
      && ((o?.[field] || o.relationName) === base));
    if (!dup) return base;
    const en = row.englishRelation || row.relationName;
    if (!en || en === base) return base;
    return en.startsWith(base + " (") ? en : `${base} (${en})`;
  }, [format]);

  // Tab category from master metadata; tiny fallback for synthetic names
  const relCategory = useCallback((name) => {
    if (!name) return "others";
    const row = master[name] || masterLower[(name || "").toLowerCase()];
    if (row?.relationCategory) {
      const c = row.relationCategory;
      if (c === "INLAW") return "inlaws";
      if (c === "OTHER") return "others";
      return "family";
    }
    const r = name.toLowerCase();
    if (r.includes("in-law")) return "inlaws";
    if (r.includes("nati")) return "family";
    return "others";
  }, [master, masterLower]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const value = useMemo(() => ({
    format: format || 'english',
    hasChosen: !!format,
    setFormat,
    relName,
    relOptionLabel,
    relCategory,
    pickerOpen,
    openPicker,
    closePicker,
  }), [format, setFormat, relName, relOptionLabel, relCategory, pickerOpen, openPicker, closePicker]);

  return (
    <RelationDisplayContext.Provider value={value}>
      {children}
    </RelationDisplayContext.Provider>
  );
}

export function useRelationDisplay() {
  const ctx = useContext(RelationDisplayContext);
  if (!ctx) throw new Error('useRelationDisplay must be used within RelationDisplayProvider');
  return ctx;
}
