import { useState, useEffect, useCallback } from "react";

// Real connectivity check — navigator.onLine alone can lie (e.g. wifi with
// no internet), so a failed same-origin request also means offline.
async function probeConnection() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    await fetch(`${window.location.origin}/favicon.ico`, {
      method: "HEAD",
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      setOnline(await probeConnection());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const onDown = () => setOnline(false);
    const onUp = () => {
      recheck();
    };
    window.addEventListener("offline", onDown);
    window.addEventListener("online", onUp);
    return () => {
      window.removeEventListener("offline", onDown);
      window.removeEventListener("online", onUp);
    };
  }, [recheck]);

  return { online, checking, recheck };
}
