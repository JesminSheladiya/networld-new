import { useEffect, useRef } from "react";

/**
 * NetworkBackground — a black & white dot-matrix world map.
 *
 * Continents are drawn as a subtle field of small white dots over a black page.
 * The map always fills the FULL height of the screen (cover-fit, aspect kept)
 * and, when it is wider than the screen (tablets / mobiles / small devices), it
 * slowly scrolls from side to side so the whole world drifts past in slow
 * motion. A subset of the land dots act as interactive nodes: hovering near a
 * country makes the nearby nodes glow brighter and connect with white edges.
 */
const MAP_SRC = `${process.env.PUBLIC_URL || ""}/textures/world.jpg`;

// major world cities → slightly bigger white "hub" dots
const CITIES = [
  ["New York", 40.71, -74.01],
  ["Los Angeles", 34.05, -118.24],
  ["San Francisco", 37.77, -122.42],
  ["Toronto", 43.65, -79.38],
  ["Mexico City", 19.43, -99.13],
  ["São Paulo", -23.55, -46.63],
  ["Buenos Aires", -34.6, -58.38],
  ["London", 51.51, -0.13],
  ["Paris", 48.86, 2.35],
  ["Madrid", 40.42, -3.7],
  ["Berlin", 52.52, 13.4],
  ["Istanbul", 41.01, 28.98],
  ["Moscow", 55.76, 37.62],
  ["Cairo", 30.04, 31.24],
  ["Lagos", 6.52, 3.38],
  ["Nairobi", -1.29, 36.82],
  ["Johannesburg", -26.2, 28.05],
  ["Dubai", 25.2, 55.27],
  ["Karachi", 24.86, 67.01],
  ["Mumbai", 19.08, 72.88],
  ["Delhi", 28.61, 77.21],
  ["Kolkata", 22.57, 88.36],
  ["Bangalore", 12.97, 77.59],
  ["Singapore", 1.35, 103.82],
  ["Jakarta", -6.21, 106.85],
  ["Hong Kong", 22.32, 114.17],
  ["Shanghai", 31.23, 121.47],
  ["Beijing", 39.9, 116.4],
  ["Tokyo", 35.68, 139.69],
  ["Sydney", -33.87, 151.21],
];

// slow continuous slide speed (px/s) — proportional to screen height
const SCROLL_SPEED_RATIO = 0.02;

// vertical crop: keep only the inhabited band (cut Arctic & Antarctic ice)
const LAT_TOP = 78;
const LAT_BOTTOM = -58;
const V_MIN = (90 - LAT_TOP) / 180; // texture v of the top of the band
const V_MAX = (90 - LAT_BOTTOM) / 180; // texture v of the bottom of the band

function NetworkBackground({ density = 70 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const reducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let raf = null;
    let baseImg = null;
    let matrixCanvas = null; // pre-rendered dot-matrix (full cover-size map)
    let drawW = 0; // prerender width
    let drawH = 0; // prerender height
    let particles = []; // land nodes {x, y} in prerender space
    let cities = []; // hub dots {x, y} in prerender space
    let lvx = 0; // last source-window origin (x) for pointer math
    let lvy = 0;

    const mouse = { x: -9999, y: -9999, inside: false };
    let cluster = [];
    let activeIdx = -1;
    let clusterEdges = [];

    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const getImage = async () => {
      if (!baseImg) baseImg = await loadImage(MAP_SRC);
      return baseImg;
    };

    const isLand = (r, g, b) => r + g > b * 1.45;

    // world-wrapping screen X for a prerender-space coordinate
    const sxOf = (x) => {
      let sx = (x - lvx) % drawW;
      if (sx < 0) sx += drawW;
      return sx;
    };

    /* ── pre-render the dot-matrix world (full map, cover-fit) ─ */
    let setupSeq = 0;
    const setup = async () => {
      const seq = ++setupSeq;
      try {
        const img = await getImage();
        if (seq !== setupSeq) return;
        const iw = img.width;
        const ih = img.height;

        // cover-fit: the ice-cropped band always fills the full screen height
        const bandH = (V_MAX - V_MIN) * ih;
        const s = Math.max(W / iw, H / bandH);
        drawW = Math.ceil(iw * s);
        drawH = Math.ceil(bandH * s);

        const step = Math.max(4, Math.min(10, Math.round(Math.min(W, H) / 160)));
        const dotR = Math.max(0.8, step * 0.26);
        const gw = Math.ceil(drawW / step);
        const gh = Math.ceil(drawH / step);

        // land mask at grid resolution (cropped band, poles excluded)
        const mc = document.createElement("canvas");
        mc.width = gw;
        mc.height = gh;
        const mctx = mc.getContext("2d");
        mctx.drawImage(img, 0, V_MIN * ih, iw, bandH, 0, 0, gw, gh);
        const mdata = mctx.getImageData(0, 0, gw, gh).data;

        // pre-render: one subtle white dot per land cell across the whole map
        const pc = document.createElement("canvas");
        pc.width = drawW;
        pc.height = drawH;
        const pctx = pc.getContext("2d");
        const landCells = [];
        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            const i = (gy * gw + gx) * 4;
            if (isLand(mdata[i], mdata[i + 1], mdata[i + 2])) {
              landCells.push(gy * gw + gx);
              pctx.beginPath();
              pctx.arc(gx * step + step / 2, gy * step + step / 2, dotR, 0, Math.PI * 2);
              pctx.fillStyle = "rgba(96, 165, 250, 0.28)";
              pctx.fill();
            }
          }
        }
        if (seq !== setupSeq) return;
        matrixCanvas = pc;

        // interactive nodes = random subset of land dots (prerender space)
        const target = Math.max(350, Math.min(1400, Math.round(density * 13)));
        particles = [];
        if (landCells.length) {
          for (let k = 0; k < target; k++) {
            const cell = landCells[Math.floor(Math.random() * landCells.length)];
            const gx = cell % gw;
            const gy = Math.floor(cell / gw);
            particles.push({ x: gx * step + step / 2, y: gy * step + step / 2 });
          }
        }

        cities = CITIES.map(([, lat, lon]) => {
          const v = (90 - lat) / 180;
          return {
            x: ((lon + 180) / 360) * drawW,
            y: ((v - V_MIN) / (V_MAX - V_MIN)) * drawH,
          };
        });
      } catch (err) {
        // map failed to load → keep the plain black page (graceful)
      }
    };

    /* ── sizing ────────────────────────────────────────────── */
    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * DPR));
      canvas.height = Math.max(1, Math.round(H * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      setup();
    };

    /* ── hover → rebuild active cluster (land nodes only) ───── */
    const R_FACTOR = 0.1;
    const MAX_MEMBERS = 10;

    const buildCluster = () => {
      cluster = [];
      clusterEdges = [];
      activeIdx = -1;
      if (!matrixCanvas || !mouse.inside || !particles.length) return;

      const R = Math.min(W, H) * R_FACTOR;
      const R2 = R * R;

      let bestD = Infinity;
      const found = [];
      for (let i = 0; i < particles.length; i++) {
        // wrap-aware screen position (only the currently visible tile)
        const sy = particles[i].y - lvy;
        if (sy < 0 || sy >= H) continue;
        const sx = sxOf(particles[i].x);
        if (sx < 0 || sx >= W) continue;
        const dx = sx - mouse.x;
        const dy = sy - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          activeIdx = i;
        }
        if (d2 < R2) found.push({ i, d: Math.sqrt(d2) });
      }
      if (activeIdx < 0 || bestD > R2) {
        activeIdx = -1;
        return;
      }
      found.sort((a, b) => a.d - b.d);
      const members = found.slice(0, MAX_MEMBERS).map((o) => o.i);
      if (members.indexOf(activeIdx) === -1) members.unshift(activeIdx);
      cluster = members;

      const edge = (a, b, maxD) => {
        const d = Math.hypot(
          particles[a].x - particles[b].x,
          particles[a].y - particles[b].y
        );
        if (d <= maxD) clusterEdges.push([a, b, d / maxD]);
      };
      const meshD = R * 0.62;
      for (const m of members) {
        if (m !== activeIdx) edge(activeIdx, m, R);
      }
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          edge(members[a], members[b], meshD);
        }
      }
    };

    /* ── events ────────────────────────────────────────────── */
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.inside = true;
      buildCluster();
    };
    const onLeave = () => {
      mouse.inside = false;
      cluster = [];
      clusterEdges = [];
      activeIdx = -1;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);

    /* ── render ────────────────────────────────────────────── */
    const draw = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, W, H);

      if (matrixCanvas) {
        const extra = Math.max(0, drawW - W);
        let vx;
        if (!reducedMotion) {
          // continuous right-to-left slide, seamlessly looping (world wraps:
          // the map's left edge is the same meridian as its right edge)
          const t = now / 1000;
          const speed = H * SCROLL_SPEED_RATIO; // px/s
          vx = (t * speed) % drawW;
        } else {
          vx = extra / 2; // static, centred
        }
        const vy = Math.max(0, (drawH - H) / 2);
        lvx = vx;
        lvy = vy;
        // visible window, wrapped seamlessly when we pass the map's edge
        const firstW = Math.min(W, drawW - vx);
        if (firstW > 0) {
          ctx.drawImage(matrixCanvas, vx, vy, firstW, H, 0, 0, firstW, H);
        }
        const rest = W - firstW;
        if (rest > 0) {
          ctx.drawImage(matrixCanvas, 0, vy, rest, H, firstW, 0, rest, H);
        }
      }

      // soft blue spotlight
      if (mouse.inside && cluster.length > 1) {
        const R = Math.min(W, H) * R_FACTOR;
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, R * 1.8);
        g.addColorStop(0, "rgba(96, 165, 250, 0.05)");
        g.addColorStop(1, "rgba(96, 165, 250, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, R * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // blue edges — nodes connect on hover (only over countries)
      if (clusterEdges.length) {
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        for (const [a, b, nd] of clusterEdges) {
          const alpha = 0.42 * (1 - nd * 0.7);
          if (alpha <= 0.02) continue;
          ctx.strokeStyle = `rgba(96, 165, 250, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(sxOf(particles[a].x), particles[a].y - lvy);
          ctx.lineTo(sxOf(particles[b].x), particles[b].y - lvy);
          ctx.stroke();
        }
      }

      // city hubs
      for (const c of cities) {
        const cx = sxOf(c.x);
        const cy = c.y - lvy;
        if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(147, 197, 253, 0.75)";
        ctx.fill();
      }

      // hovered cluster nodes
      for (let k = 0; k < cluster.length; k++) {
        const i = cluster[k];
        const isActive = i === activeIdx;
        ctx.beginPath();
        ctx.arc(
          sxOf(particles[i].x),
          particles[i].y - lvy,
          isActive ? 3 : 2,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "rgba(191, 219, 254, 0.85)";
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    /* ── init ──────────────────────────────────────────────── */
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return <canvas ref={canvasRef} className="network-bg" />;
}

export default NetworkBackground;