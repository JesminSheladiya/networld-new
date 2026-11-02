import { useState, useEffect, useCallback } from "react";
import { estimateDownlinkMbps } from "../Services/connectionMonitor";
import { PAGE_SIZE_OPTIONS, getMaxPageSizeForDownlink } from "../constants";

// Hook that returns the current network-estimated downlink and the recommended
// page size that the backend will NOT clamp down.
//
// Use this to automatically select a page size that matches connection quality:
//   • Fast networks (5G/WiFi): up to 100 rows per page
//   • Medium networks (4G/3G): up to 50 rows per page
//   • Slow networks (2G): up to 30 rows per page
//   • Very slow networks: up to 20 rows per page
export function useNetworkPageSize() {
  const [downlinkMbps, setDownlinkMbps] = useState(() =>
    estimateDownlinkMbps()
  );
  const [effectiveType, setEffectiveType] = useState(() => {
    const d = estimateDownlinkMbps();
    if (d < 0.5) return "slow-2g";
    if (d < 1.5) return "2g";
    if (d < 5) return "3g";
    if (d < 20) return "4g";
    return "5g";
  });
  const [pageSize, setPageSize] = useState(() => {
    const maxAllowed = getMaxPageSizeForDownlink(downlinkMbps);
    const options = PAGE_SIZE_OPTIONS.map(Number).sort((a, b) => a - b);
    for (let i = options.length - 1; i >= 0; i--) {
      if (options[i] <= maxAllowed) return options[i];
    }
    return 50;
  });

  // Recompute whenever new RTT samples arrive (on every API call via interceptors).
  // We recompute on mount and whenever downlink changes significantly.
  useEffect(() => {
    const nextDownlink = estimateDownlinkMbps();
    const nextType =
      nextDownlink < 0.5 ? "slow-2g" :
      nextDownlink < 1.5 ? "2g" :
      nextDownlink < 5 ? "3g" :
      nextDownlink < 20 ? "4g" : "5g";
    const maxAllowed = getMaxPageSizeForDownlink(nextDownlink);
    const options = PAGE_SIZE_OPTIONS.map(Number).sort((a, b) => a - b);
    let nextSize = 50;
    for (let i = options.length - 1; i >= 0; i--) {
      if (options[i] <= maxAllowed) {
        nextSize = options[i];
        break;
      }
    }
    setDownlinkMbps(nextDownlink);
    setEffectiveType(nextType);
    setPageSize(nextSize);
  }, [downlinkMbps]); // re-run when downlink estimate updates

  const refresh = useCallback(() => {
    setDownlinkMbps(estimateDownlinkMbps());
  }, []);

  return { downlinkMbps, effectiveType, pageSize, refresh };
}
