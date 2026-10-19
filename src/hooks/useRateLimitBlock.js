import { useCallback, useEffect, useState } from "react";
import { message } from "antd";
import { getRateLimitInfo, formatCountdown, formatCountdownLong } from "../utils/rateLimit";

// Countdown state for 429 blocks. trigger(error) shows the backend
// message, starts the timer and returns true when it handled a 429.
export function useRateLimitBlock() {
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [blockedSeconds, setBlockedSeconds] = useState(0);
  const [blockedMessage, setBlockedMessage] = useState("");

  useEffect(() => {
    if (!blockedUntil) {
      setBlockedSeconds(0);
      return undefined;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setBlockedSeconds(remaining);
      if (remaining === 0) setBlockedUntil(0);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const trigger = useCallback((error, fallback, options = {}) => {
    const info = getRateLimitInfo(error);
    if (!info.limited) {
      if (fallback) message.error(fallback);
      return false;
    }
    setBlockedUntil((prev) => Math.max(prev, Date.now() + info.retryAfter * 1000));
    setBlockedMessage(info.message);
    if (!options.silent) message.error(info.message, 5);
    return true;
  }, []);

  const blockedLabel = blockedSeconds > 0
    ? `Try again in ${formatCountdown(blockedSeconds)}`
    : "";
  const blockedMessageLive = blockedMessage
    ? (/try again in/i.test(blockedMessage)
      ? blockedMessage.replace(/try again in[^.]*\.?$/i, `Try again in ${formatCountdownLong(blockedSeconds)}.`)
      : `${blockedMessage} Try again in ${formatCountdownLong(blockedSeconds)}.`)
    : "";

  const clear = useCallback(() => {
    setBlockedUntil(0);
    setBlockedSeconds(0);
    setBlockedMessage("");
  }, []);

  return { blockedSeconds, blockedLabel, blockedMessage, blockedMessageLive, trigger, clear };
}
