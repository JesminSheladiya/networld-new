import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { message } from 'antd';
import { api } from '../Services/networld';
import { updateProfile } from '../Services/authService';
import { useAuth } from './AuthContext';
import { STORAGE_KEYS } from '../constants';

const STORAGE_KEY = STORAGE_KEYS.RELATION_FORMAT;

const FIELD_BY_FORMAT = {
  english: 'englishRelation',
  indian: 'indianRelation',
};

// Stored 'generic' choices from before the format was removed map to
// English. Anything unknown also falls back to English (default), while
// null stays null so the first-login popup still appears.
const normalizeFormat = (f) => (f == null ? null : (f === 'indian' ? 'indian' : 'english'));

const RelationDisplayContext = createContext(null);

export function RelationDisplayProvider({ children }) {
  const { isAuthenticated, user, patchUser } = useAuth();
  // Server (DB) is the source of truth; device localStorage is only the
  // legacy fallback. Popup appears only when neither has a choice.
  const [format, setFormatState] = useState(() =>
    normalizeFormat(user?.relationFormat ?? localStorage.getItem(STORAGE_KEY)));
  const [master, setMaster] = useState({});
  const [masterLower, setMasterLower] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const pushedLocalRef = useRef(false);

  // Logout clears local state; next login re-syncs from the server, so a
  // saved choice never pops up again (any device/browser).
  useEffect(() => {
    if (!isAuthenticated) {
      setFormatState(null);
      setPickerOpen(false);
      pushedLocalRef.current = false;
    }
  }, [isAuthenticated]);

  // Server wins; a legacy local-only choice is pushed to the DB once.
  useEffect(() => {
    if (!isAuthenticated) return;
    const server = normalizeFormat(user?.relationFormat ?? null);
    if (server) {
      try { localStorage.setItem(STORAGE_KEY, server); } catch { /* ignore */ }
      setFormatState((prev) => (prev === server ? prev : server));
      return;
    }
    const local = normalizeFormat(localStorage.getItem(STORAGE_KEY));
    if (local) {
      setFormatState((prev) => (prev === local ? prev : local));
      if (!pushedLocalRef.current) {
        pushedLocalRef.current = true;
        updateProfile({ relationFormat: local })
          .catch(() => { pushedLocalRef.current = false; });
      }
    } else {
      setFormatState((prev) => (prev === null ? prev : null));
    }
  }, [isAuthenticated, user?.relationFormat]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Full map (hidden engine rows like Brother/Grandfather carry their own
    // indian names) so chips never fall back to English. Pickers
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

  // Optimistic local update + DB persist (own row, allowlisted
  // server-side). On failure the choice is rolled back so the popup
  // reappears instead of silently diverging from the server.
  const setFormat = useCallback((f) => {
    const norm = normalizeFormat(f);
    if (!norm) return;
    try { localStorage.setItem(STORAGE_KEY, norm); } catch { /* ignore */ }
    setFormatState(norm);
    if (isAuthenticated) {
      patchUser({ relationFormat: norm });
      updateProfile({ relationFormat: norm }).catch(() => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        setFormatState(null);
        message.error("Could not save display preference, try again");
      });
    }
  }, [isAuthenticated, patchUser]);

  const relName = useCallback((name) => {
    if (!name) return name;
    const row = master[name] || masterLower[(name || "").toLowerCase()];
    const field = FIELD_BY_FORMAT[format || 'english'];
    return row?.[field] || name;
  }, [master, masterLower, format]);

  // Unique, always-understandable picker labels. Several rows share one
  // display name in Indian format (e.g. "Bhatija" on Nephew and Brother
  // Son). A colliding row gets its precise English name appended — English
  // is unique across every row, so the result is collision-free in both
  // languages. If English already contains the display name, use English
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
