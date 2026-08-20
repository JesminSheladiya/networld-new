import { createContext, useContext, useState, useCallback } from "react";

const RefreshContext = createContext({
  key: 0,
  bump: () => {},
  pendingCount: 0,
  setPendingCount: () => {},
  suggestionsCount: 0,
  setSuggestionsCount: () => {},
});

export function RefreshProvider({ children }) {
  const [key, setKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [suggestionsCount, setSuggestionsCount] = useState(0);

  const bump = useCallback(() => setKey((k) => k + 1), []);

  return (
    <RefreshContext.Provider
      value={{
        key,
        bump,
        pendingCount,
        setPendingCount,
        suggestionsCount,
        setSuggestionsCount,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

export const useRefresh = () => useContext(RefreshContext);