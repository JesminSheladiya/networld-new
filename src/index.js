import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/*──────────────────────────────────────────────────────────────────────────
 * window.matchMedia polyfill
 * --------------------------
 * AppShell / ContactsPage / NetworkBackground call window.matchMedia(...)
 * which is NOT a native browser API. This polyfill provides the same shape
 * they expect: returns { matches, addEventListener("change", cb),
 * removeEventListener("change", cb) } and fires "change" when the result
 * flips on window resize. Without this, rendering those pages throws and the
 * whole UI crashes (especially on a hard reload).
 *──────────────────────────────────────────────────────────────────────────*/
(function installMatchMedia() {
  if (typeof window.matchMedia === "function") return;

  // Detect prefers-reduced-motion via a tiny hidden CSS custom property.
  const style = document.createElement("style");
  style.textContent =
    "html{--nw-motion:0}" +
    "@media (prefers-reduced-motion: reduce){html{--nw-motion:1}}";
  (document.head || document.documentElement).appendChild(style);

  const parse = (q) => {
    q = String(q || "").toLowerCase();
    const out = { minW: null, maxW: null, reduced: false };
    const minm = q.match(/min-width:\s*([\d.]+)\s*px/);
    if (minm) out.minW = parseFloat(minm[1]);
    const maxm = q.match(/max-width:\s*([\d.]+)\s*px/);
    if (maxm) out.maxW = parseFloat(maxm[1]);
    out.reduced = q.indexOf("prefers-reduced-motion:") >= 0;
    return out;
  };

  const reducedMotion = () => {
    const root = document.documentElement;
    if (!root) return false;
    return (
      (getComputedStyle(root).getPropertyValue("--nw-motion") || "").trim() === "1"
    );
  };

  const evaluate = (p) => {
    const w = window.innerWidth || 0;
    if (p.minW != null && w < p.minW) return false;
    if (p.maxW != null && w > p.maxW) return false;
    if (p.reduced && reducedMotion()) return false;
    return true;
  };

  const cache = new Map();
  const all = new Set();

  class MediaQuery {
    constructor(q) {
      this.query = q;
      this.parsed = parse(q);
      this.matches = evaluate(this.parsed);
      this.listeners = new Set();
      all.add(this);
    }
    addEventListener(type, fn) {
      if (type === "change") this.listeners.add(fn);
    }
    removeEventListener(type, fn) {
      if (type === "change") this.listeners.delete(fn);
    }
    recompute() {
      const next = evaluate(this.parsed);
      if (next !== this.matches) {
        this.matches = next;
        this.listeners.forEach((fn) => {
          try { fn({ matches: next }); } catch (_) {}
        });
      }
    }
  }

  window.matchMedia = (q) => {
    const key = String(q || "");
    if (!cache.has(key)) cache.set(key, new MediaQuery(key));
    return cache.get(key);
  };

  const recomputeAll = () => all.forEach((mq) => mq.recompute());
  window.addEventListener("resize", recomputeAll);
  window.addEventListener("orientationchange", recomputeAll);
})();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
