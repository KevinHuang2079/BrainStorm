import { useEffect, useRef } from 'react';

const MANA_COLORS = {
  W: '#d6cc9a',
  U: '#0a4f85',
  B: '#5e5248', 
  R: '#a61b22', 
  G: '#005a30',
};
const MANA_KEYS = ['W', 'U', 'B', 'R', 'G'];

export const DEFAULTS = {
  nodeCount:    19,  
  connectDist:  150,   
  minRadius:    2,   
  maxRadius:    3,   
  dotOpacity:   0.55,
  edgeOpacity:  0.65, 
  speed:        0.11, 
  pulseAmount:  1, 
};

function makeNodes(w, h, opts) {
  const { nodeCount, minRadius, maxRadius, speed } = opts;
  return Array.from({ length: nodeCount }, () => {
    const m = 0.07;
    return {
      x:      (m + Math.random() * (1 - m * 2)) * w,
      y:      (m + Math.random() * (1 - m * 2)) * h,
      vx:     (Math.random() - 0.5) * speed,
      vy:     (Math.random() - 0.5) * speed * 0.7,
      key:    MANA_KEYS[Math.floor(Math.random() * 5)],
      radius: minRadius + Math.random() * (maxRadius - minRadius),
      phase:  Math.random() * Math.PI * 2,
      pulse:  0.3 + Math.random() * 0.5,
    };
  });
}

export default function ArcaneBackground({
  nodeCount   = DEFAULTS.nodeCount,
  connectDist = DEFAULTS.connectDist,
  minRadius   = DEFAULTS.minRadius,
  maxRadius   = DEFAULTS.maxRadius,
  dotOpacity  = DEFAULTS.dotOpacity,
  edgeOpacity = DEFAULTS.edgeOpacity,
  speed       = DEFAULTS.speed,
  pulseAmount = DEFAULTS.pulseAmount,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId, nodes = [], t = 0;

    const opts = { nodeCount, minRadius, maxRadius, speed };

    function resize() {
      canvas.width  = window.innerWidth  * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      nodes = makeNodes(window.innerWidth, window.innerHeight, opts);
    }
    resize();

    // Pre-parse hex colors into r,g,b for alpha composition
    function hexToRgb(hex) {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const RGB = {};
    for (const k of MANA_KEYS) {
      RGB[k] = hexToRgb(MANA_COLORS[k]);
    }

    function draw() {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      t += 0.008;

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0.05 * w || n.x > 0.95 * w) n.vx *= -1;
        if (n.y < 0.05 * h || n.y > 0.95 * h) n.vy *= -1;
      }

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= connectDist) continue;
          const fade = 1 - dist / connectDist;

          // Blend the two node colors for the edge
          const [ar, ag, ab] = RGB[a.key];
          const [br, bg, bb] = RGB[b.key];
          const r = Math.round((ar + br) / 2);
          const g = Math.round((ag + bg) / 2);
          const b2 = Math.round((ab + bb) / 2);
          const alpha = fade * edgeOpacity;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r},${g},${b2},${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          // Travelling spark
          if (fade > 0.45 && Math.random() < 0.004) {
            const p  = Math.sin(t * 1.1 + i * 0.7 + j * 0.5) * 0.5 + 0.5;
            const px = a.x + (b.x - a.x) * p;
            const py = a.y + (b.y - a.y) * p;
            ctx.beginPath();
            ctx.arc(px, py, 1.3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b2},0.85)`;
            ctx.fill();
          }
        }
      }

      // Dots
      for (const n of nodes) {
        const pulse = pulseAmount * (0.5 + 0.5 * Math.sin(t * n.pulse + n.phase));
        const alpha = Math.min(1, dotOpacity * (1 - pulseAmount * 0.25) + pulse * dotOpacity);
        const [r, g, b] = RGB[n.key];

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [nodeCount, connectDist, minRadius, maxRadius, dotOpacity, edgeOpacity, speed, pulseAmount]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none',
      }}
    />
  );
}