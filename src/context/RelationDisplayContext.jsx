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
    api.relations()
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
    relCategory,
    pickerOpen,
    openPicker,
    closePicker,
  }), [format, setFormat, relName, relCategory, pickerOpen, openPicker, closePicker]);

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
