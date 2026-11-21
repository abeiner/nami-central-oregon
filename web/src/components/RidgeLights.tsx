import { useEffect, useRef } from 'react';
import { ridge } from './ridge';

/**
 * The hero: the Cascade skyline drawn with 5,000 points of light, one for each
 * person NAMI Central Oregon is on track to reach. Half are lit first (2025),
 * then all of them (2026). When a business name is given, sparks rise from the
 * mountains and write it in the sky above them.
 */

const TOTAL = 5000;
const MAX_SPARKS = 4200;

interface Light {
  x: number;
  y: number;
  order: number; // 0..1, when it switches on
  tone: 0 | 1 | 2; // snow, sky, town
  size: number;
  phase: number;
}

interface Spark {
  x: number;
  y: number;
  tx: number;
  ty: number;
  phase: number;
  ease: number;
  /** true while heading back down to the mountains to disappear */
  leaving: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split words into n lines of similar length. */
function splitLines(words: string[], n: number): string[] {
  if (n <= 1) return [words.join(' ')];
  const total = words.join(' ').length;
  const target = total / n;
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && out.length < n - 1 && Math.abs(cur.length - target) <= Math.abs(next.length - target)) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

const FAMILY = "'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif";
const LINE = 0.98;

/** Lay the name out as large as the box allows, then sample it into points. */
function writeName(name: string, box: Box): { pts: { x: number; y: number }[]; glow: HTMLCanvasElement | null } {
  const clean = name.trim().slice(0, 44);
  if (!clean || box.w < 80 || box.h < 50) return { pts: [], glow: null };
  const w = Math.round(box.w);
  const h = Math.round(box.h);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return { pts: [], glow: null };

  const words = clean.split(/\s+/);
  let best = { lines: [clean], size: 0 };
  for (let n = 1; n <= Math.min(3, words.length); n++) {
    const lines = splitLines(words, n);
    c.font = `800 100px ${FAMILY}`;
    const widest = Math.max(...lines.map((l) => c.measureText(l).width));
    const size = Math.min(190, (w * 0.98 * 100) / widest, h / (lines.length * LINE));
    if (size > best.size) best = { lines, size };
  }
  const { lines, size } = best;
  const centered = w < 520;
  const lh = size * LINE;
  const top = (h - lh * lines.length) / 2 + lh / 2;
  const paint = (g: CanvasRenderingContext2D) => {
    g.font = `800 ${size}px ${FAMILY}`;
    g.textBaseline = 'middle';
    g.textAlign = centered ? 'center' : 'left';
    lines.forEach((l, i) => g.fillText(l, centered ? w / 2 : 0, top + i * lh));
  };
  c.fillStyle = '#fff';
  paint(c);

  const data = c.getImageData(0, 0, w, h).data;
  let filled = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i]! > 128) filled += 4;
  // Offset every other row (a honeycomb) so strokes read as bulbs, not a pixel grid.
  const step = Math.max(2.7, Math.sqrt((filled * 1.14) / MAX_SPARKS));
  const pts: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = step / 2; y < h; y += step * 0.87, row++) {
    for (let x = row % 2 ? step : step / 2; x < w; x += step) {
      const xi = Math.min(w - 1, Math.round(x));
      const yi = Math.min(h - 1, Math.round(y));
      if (data[(yi * w + xi) * 4 + 3]! > 120) pts.push({ x: box.x + x, y: box.y + y });
    }
  }

  // A soft halo of the same lettering, drawn under the sparks so the name reads at a glance.
  const pad = 40;
  const glow = document.createElement('canvas');
  glow.width = w + pad * 2;
  glow.height = h + pad * 2;
  const g = glow.getContext('2d');
  if (g) {
    g.translate(pad, pad);
    g.shadowColor = '#ff8a55';
    g.shadowBlur = 26;
    g.fillStyle = '#ffb48a';
    paint(g);
  }
  return { pts: pts.slice(0, MAX_SPARKS), glow };
}

interface Props {
  name: string;
  /** Element whose box marks the open sky where the name is written. */
  stage: React.RefObject<HTMLElement>;
  /** Receives the number of lit lights as it changes. */
  counter: React.RefObject<HTMLElement>;
}

export default function RidgeLights({ name, stage, counter }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef(name);
  const retarget = useRef<() => void>(() => {});

  useEffect(() => {
    nameRef.current = name;
    retarget.current();
  }, [name]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const still = new URLSearchParams(window.location.search).has('still');
    const reduce = still || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = mulberry(20261);
    const lights: Light[] = [];
    let sparks: Spark[] = [];
    let glow: HTMLCanvasElement | null = null;
    let glowBox: Box = { x: 0, y: 0, w: 0, h: 0 };
    let glowAt = 0;
    let W = 0;
    let H = 0;
    let raf = 0;
    let visible = true;
    let started = 0;
    let lastShown = -1;
    const pointer = { x: -999, y: -999 };

    const build = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ridgeH = Math.min(H * 0.31, W < 700 ? 190 : 285);
      const rr = mulberry(77);
      const fresh = lights.length === 0;
      for (let i = 0; i < TOTAL; i++) {
        const xn = rr();
        const top = H - ridge(xn) * ridgeH;
        // denser near the skyline so the silhouette reads
        const t = Math.pow(rr(), 1.9);
        const y = top + t * (H - top) * 0.97 + 1;
        const rel = (H - y) / ridgeH; // height above the valley floor
        const tone: Light['tone'] = rel > 0.6 ? 0 : rel > 0.25 ? 1 : 2;
        if (fresh) lights.push({ x: xn * W, y, order: rand(), tone, size: 1 + rand() * 1.2, phase: rand() * 6.283 });
        else Object.assign(lights[i]!, { x: xn * W, y, tone });
      }
      assign(true);
    };

    const assign = (instant = false) => {
      const st = stage.current;
      let pts: { x: number; y: number }[] = [];
      glow = null;
      if (st) {
        const hr = host.getBoundingClientRect();
        const sr = st.getBoundingClientRect();
        glowBox = { x: sr.left - hr.left, y: sr.top - hr.top, w: sr.width, h: sr.height };
        const out = writeName(nameRef.current, glowBox);
        pts = out.pts;
        glow = out.glow;
      }
      glowAt = performance.now();
      const next: Spark[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const old = sparks[i];
        if (old && !old.leaving) {
          old.tx = p.x;
          old.ty = p.y;
          next.push(old);
        } else {
          // rise from a light somewhere on the mountains
          const from = lights[Math.floor(rand() * TOTAL)]!;
          next.push({ x: from.x, y: from.y, tx: p.x, ty: p.y, phase: rand() * 6.283, ease: 0.03 + rand() * 0.07, leaving: false });
        }
      }
      // sparks no longer needed drift back down and go out
      for (let i = pts.length; i < sparks.length; i++) {
        const s = sparks[i]!;
        const to = lights[Math.floor(rand() * TOTAL)]!;
        s.tx = to.x;
        s.ty = to.y;
        s.leaving = true;
        if (!instant && !reduce) next.push(s);
      }
      sparks = next;
      if (instant || reduce) {
        sparks = sparks.filter((s) => !s.leaving);
        sparks.forEach((s) => {
          s.x = s.tx;
          s.y = s.ty;
        });
        glowAt = -1e6;
      }
      if (reduce) draw(performance.now());
    };
    retarget.current = () => assign(false);

    const TONES = ['#eef4ff', '#8fc0f2', '#ffc66a'];
    const litAt = (ms: number) => {
      if (reduce) return TOTAL;
      const t = ms / 1000;
      const e = (v: number) => 1 - Math.pow(1 - Math.min(Math.max(v, 0), 1), 3);
      if (t < 1.9) return Math.round(2500 * e(t / 1.9));
      if (t < 2.8) return 2500;
      return Math.round(2500 + 2500 * e((t - 2.8) / 2.2));
    };

    const draw = (now: number) => {
      if (!started) started = now;
      const lit = litAt(now - started);
      const share = lit / TOTAL;
      if (counter.current && lit !== lastShown) {
        counter.current.textContent = lit.toLocaleString('en-US');
        lastShown = lit;
      }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const time = reduce ? 1 : now / 1000;

      for (let tone = 0; tone < 3; tone++) {
        ctx.fillStyle = TONES[tone]!;
        for (let i = 0; i < TOTAL; i++) {
          const l = lights[i]!;
          if (l.tone !== tone) continue;
          let a = l.order <= share ? 0.62 + 0.38 * Math.sin(time * 1.3 + l.phase) : 0.14;
          let s = l.size;
          const dx = l.x - pointer.x;
          const dy = l.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            const k = 1 - d2 / 14000;
            a = Math.min(1, a + k * 0.7);
            s += k * 1.8;
          }
          ctx.globalAlpha = a;
          ctx.fillRect(l.x - s / 2, l.y - s / 2, s, s);
        }
      }

      // the name: a soft halo first, then the sparks themselves
      if (glow) {
        const k = Math.min(1, Math.max(0, (now - glowAt - 500) / 1400));
        if (k > 0) {
          ctx.globalAlpha = 0.3 * k;
          ctx.drawImage(glow, glowBox.x - 40, glowBox.y - 40);
        }
      }
      let anyLeft = false;
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i]!;
        s.x += (s.tx - s.x) * s.ease;
        s.y += (s.ty - s.y) * s.ease;
        if (s.leaving) {
          if (Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) < 6) continue;
          anyLeft = true;
        }
        const tw = s.leaving ? 0.45 : 0.74 + 0.26 * Math.sin(time * 2.1 + s.phase);
        const jx = Math.sin(time * 0.9 + s.phase) * 0.3;
        const jy = Math.cos(time * 1.1 + s.phase * 1.7) * 0.3;
        ctx.globalAlpha = 0.09 * tw;
        ctx.fillStyle = '#ff9466';
        ctx.fillRect(s.x + jx - 3.4, s.y + jy - 3.4, 6.8, 6.8);
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#fff3e2';
        ctx.fillRect(s.x + jx - 1.05, s.y + jy - 1.05, 2.1, 2.1);
      }
      if (!anyLeft && sparks.some((s) => s.leaving)) sparks = sparks.filter((s) => !s.leaving);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      if (visible) draw(now);
      raf = requestAnimationFrame(loop);
    };

    build();
    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(loop);

    // Lettering is measured with the display face, so lay it out again once that has loaded.
    document.fonts?.ready.then(() => assign(reduce)).catch(() => {});

    const ro = new ResizeObserver(() => {
      build();
      if (reduce) draw(performance.now());
    });
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(host);
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const leave = () => {
      pointer.x = pointer.y = -999;
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, [stage, counter]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
