import { useEffect, useRef } from "react";

/**
 * Grid constellation background (inspired by katedarby's CodePen "Animated Node Background").
 * Points are laid out on a grid with jitter; each point is linked to its 3 nearest
 * neighbours. Lines and dots brighten in zones around the cursor (spotlight effect)
 * and points drift gently with a circular ease-in-out motion.
 */
function NetworkBackground({ density = 70 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let raf = null;
    let points = [];
    let target = { x: 0, y: 0 };

    const easeInOutCirc = (t) =>
      t < 0.5
        ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
        : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

    const distSq = (a, b) => Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);

    const initPoints = () => {
      points = [];
      const cols = Math.max(6, Math.round(density / 7));
      const rows = cols * 2;

      const stepX = width / cols;
      const stepY = height / rows;

      for (let x = 0; x < width; x += stepX) {
        for (let y = 0; y < height; y += stepY) {
          const originX = x + Math.random() * stepX;
          const originY = y + Math.random() * 2 * stepY;
          const p = {
            x: originX,
            y: originY,
            originX,
            originY,
            fromX: originX,
            fromY: originY,
            targetX: originX - 50 + Math.random() * 100,
            targetY: originY - 50 + Math.random() * 100,
            t: 0,
            duration: 1 + Math.random(),
            r: 2 + Math.random() * 2,
            closest: [],
          };
          points.push(p);
        }
      }

      for (const p1 of points) {
        p1.closest = points
          .filter((p2) => p2 !== p1)
          .map((p2) => ({ p2, d: distSq(p2, p1) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
          .map((o) => o.p2);
      }
    };

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * DPR;
      canvas.height = height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      target.x = width / 2;
      target.y = height / 2;
      initPoints();
    };

    const onMouseMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };

    let last = performance.now();
    const animate = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, width, height);

      for (const p of points) {
        p.t += dt / p.duration;
        if (p.t >= 1) {
          p.t = 0;
          p.fromX = p.x;
          p.fromY = p.y;
          p.targetX = p.originX - 50 + Math.random() * 100;
          p.targetY = p.originY - 50 + Math.random() * 100;
        }

        const e = easeInOutCirc(p.t);
        p.x = p.fromX + (p.targetX - p.fromX) * e;
        p.y = p.fromY + (p.targetY - p.fromY) * e;

        const d = distSq(target, p);
        let lineAlpha;
        let dotAlpha;
        if (d < 4000) {
          lineAlpha = 0.5;
          dotAlpha = 0.9;
        } else if (d < 20000) {
          lineAlpha = 0.18;
          dotAlpha = 0.45;
        } else if (d < 40000) {
          lineAlpha = 0.04;
          dotAlpha = 0.15;
        } else {
          lineAlpha = 0;
          dotAlpha = 0;
        }

        if (lineAlpha > 0) {
          ctx.strokeStyle = `rgba(96, 165, 250, ${lineAlpha})`;
          ctx.lineWidth = 1;
          for (const c of p.closest) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(c.x, c.y);
            ctx.stroke();
          }
        }

        if (dotAlpha > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(96, 165, 250, ${dotAlpha})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(animate);
    };

    resize();
    raf = requestAnimationFrame(animate);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [density]);

  return <canvas ref={canvasRef} className="network-bg" />;
}

export default NetworkBackground;
