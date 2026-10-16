import { useCallback, useEffect, useState } from "react";
import { message } from "antd";
import { getRateLimitInfo, formatCountdown } from "../utils/rateLimit";

// Countdown state for 429 blocks. trigger(error) shows the backend
// message, starts the timer and returns true when it handled a 429.
export function useRateLimitBlock() {
  const [blockedSeconds, setBlockedSeconds] = useState(0);

  useEffect(() => {
    if (blockedSeconds <= 0) return;
    const t = setTimeout(() => setBlockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [blockedSeconds]);

  const trigger = useCallback((error, fallback) => {
    const info = getRateLimitInfo(error);
    if (!info.limited) {
      if (fallback) message.error(fallback);
      return false;
    }
    setBlockedSeconds((prev) => Math.max(prev, info.retryAfter));
    message.error(info.message, 5);
    return true;
  }, []);

  const blockedLabel = blockedSeconds > 0
    ? `Try again in ${formatCountdown(blockedSeconds)}`
    : "";

  return { blockedSeconds, blockedLabel, trigger, setBlockedSeconds };
}
