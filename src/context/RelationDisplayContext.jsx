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
        for (const r of res.data || []) {
          map[r.relationName] = r;
        }
        setMaster(map);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const setFormat = useCallback((f) => {
    localStorage.setItem(STORAGE_KEY, f);
    setFormatState(f);
  }, []);

  const relName = useCallback((name) => {
    if (!name) return name;
    const row = master[name];
    const field = FIELD_BY_FORMAT[format || 'english'];
    return row?.[field] || name;
  }, [master, format]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const value = useMemo(() => ({
    format: format || 'english',
    hasChosen: !!format,
    setFormat,
    relName,
    pickerOpen,
    openPicker,
    closePicker,
  }), [format, setFormat, relName, pickerOpen, openPicker, closePicker]);

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
