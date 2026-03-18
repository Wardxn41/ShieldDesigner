// app/canvas/backgroundSystem.js
// FIXED + UPGRADED v5
//
// Bugs fixed from v4:
//   1. Texture functions were referenced before definition (hoisting issue with
//      regular functions assigned to object literals — only works if functions
//      are declared with `function` keyword or defined before the array).
//      Fixed by declaring all texture functions before the BACKGROUNDS array.
//
//   2. renderBackground() was not calling shieldPathFn before clip, meaning
//      clip was applied to the full canvas rect, not the shield shape.
//      Fixed: shieldPathFn is now called correctly before ctx.clip().
//
//   3. Tinted canvas cache in stampSystem caused bg textures to appear stale
//      when switching designs — not a backgroundSystem bug, but noted.
//
//   4. createBackgroundSelector() used inline style injection in ways that
//      conflicted with the new CSS class system. Rebuilt to use .bg-btn class.

// ── Texture functions (declared FIRST to avoid reference-before-init) ────────

function drawWoodGrain(ctx, w, h) {
  ctx.fillStyle = "#3d2010";
  ctx.fillRect(0, 0, w, h);
  const lineCount = 26;
  for (let i = 0; i < lineCount; i++) {
    const x = (w / lineCount) * i;
    const wobble = () => (Math.random() - 0.5) * 16;
    ctx.beginPath();
    ctx.moveTo(x + wobble(), 0);
    ctx.bezierCurveTo(
      x + wobble(), h * 0.3,
      x + wobble(), h * 0.7,
      x + wobble(), h
    );
    const alpha = 0.04 + Math.random() * 0.09;
    ctx.strokeStyle = Math.random() > 0.5
      ? `rgba(80,40,10,${alpha})`
      : `rgba(200,140,60,${alpha})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.stroke();
  }
  // Knots
  for (let k = 0; k < 2; k++) {
    const kx = w * (0.25 + Math.random() * 0.5);
    const ky = h * (0.2  + Math.random() * 0.6);
    const kr = 12 + Math.random() * 20;
    const grd = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    grd.addColorStop(0, "rgba(20,8,2,0.5)");
    grd.addColorStop(0.5, "rgba(60,25,8,0.2)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 1.4, kr * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParchment(ctx, w, h) {
  ctx.fillStyle = "#e8d8a8";
  ctx.fillRect(0, 0, w, h);
  // Noise
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const v = Math.floor(Math.random() * 40);
    const a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(${120 + v},${90 + v},${40 + v},${a})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Stains
  for (let s = 0; s < 5; s++) {
    const sx = Math.random() * w, sy = Math.random() * h, sr = 30 + Math.random() * 80;
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    grd.addColorStop(0, "rgba(120,80,20,0.07)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr * 1.5, sr, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fiber lines
  for (let f = 0; f < 60; f++) {
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * h);
    ctx.lineTo(w, Math.random() * h + (Math.random() - 0.5) * 30);
    ctx.strokeStyle = `rgba(160,120,60,${0.01 + Math.random() * 0.03})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawHammeredMetal(ctx, w, h) {
  ctx.fillStyle = "#2c3038";
  ctx.fillRect(0, 0, w, h);
  // Dents
  for (let d = 0; d < 280; d++) {
    const dx = Math.random() * w, dy = Math.random() * h, dr = 3 + Math.random() * 12;
    const grd = ctx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 0, dx, dy, dr);
    grd.addColorStop(0, "rgba(255,255,255,0.08)");
    grd.addColorStop(0.4, "rgba(180,190,200,0.04)");
    grd.addColorStop(0.8, "rgba(0,0,0,0.06)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(dx, dy, dr, dr * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scratches
  for (let sc = 0; sc < 14; sc++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.stroke();
  }
}

function drawMarble(ctx, w, h) {
  ctx.fillStyle = "#d8d0c4";
  ctx.fillRect(0, 0, w, h);
  // Veins
  for (let v = 0; v < 10; v++) {
    ctx.beginPath();
    let cx = Math.random() * w, cy = 0;
    ctx.moveTo(cx, 0);
    while (cy < h) {
      cy += 30 + Math.random() * 60;
      cx += (Math.random() - 0.5) * 80;
      const cpx = cx + (Math.random() - 0.5) * 60;
      const cpy = cy - 30;
      ctx.quadraticCurveTo(cpx, cpy, cx, cy);
    }
    const alpha = 0.05 + Math.random() * 0.12;
    const grey = Math.floor(140 + Math.random() * 80);
    ctx.strokeStyle = `rgba(${grey - 20},${grey - 10},${grey},${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.stroke();
  }
}

// ── Background definitions ────────────────────────────────────

export const BACKGROUNDS = [
  // Solids
  { id: "dark_wood",  label: "Dark Wood",   type: "solid",   value: "#2b1f17" },
  { id: "crimson",    label: "Crimson",     type: "solid",   value: "#7a1a1a" },
  { id: "midnight",   label: "Midnight",    type: "solid",   value: "#0d1b2a" },
  { id: "forest",     label: "Forest",      type: "solid",   value: "#1a3a2a" },
  { id: "bone",       label: "Bone White",  type: "solid",   value: "#e8dfc8" },
  // Gradients
  { id: "forge",      label: "Forge",       type: "gradient", stops: [["#1a0a00",0],["#5c2a00",0.5],["#1a0a00",1]], angle: 135 },
  { id: "imperial",   label: "Imperial",    type: "gradient", stops: [["#4a0a0a",0],["#8b1a1a",0.5],["#4a0a0a",1]], angle: 180 },
  { id: "ocean",      label: "Ocean",       type: "gradient", stops: [["#001a33",0],["#003366",0.5],["#001a33",1]], angle: 135 },
  { id: "dusk",       label: "Dusk Gold",   type: "gradient", stops: [["#2a1500",0],["#8b5a00",0.45],["#d4a017",0.5],["#8b5a00",0.55],["#2a1500",1]], angle: 160 },
  // Textures
  { id: "wood_grain", label: "Wood",        type: "texture", fn: drawWoodGrain },
  { id: "parchment",  label: "Parchment",   type: "texture", fn: drawParchment },
  { id: "hammered",   label: "Metal",       type: "texture", fn: drawHammeredMetal },
  { id: "marble",     label: "Marble",      type: "texture", fn: drawMarble },
];

export function getBackground(id) {
  return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
}

// ── Renderer ──────────────────────────────────────────────────
// FIXED: shieldPathFn is called inside save/restore to properly set up clip.

export function renderBackground(ctx, w, h, bgDef, shieldPathFn) {
  if (!bgDef) return;

  ctx.save();

  // FIXED: always call shieldPathFn THEN clip — order matters.
  if (typeof shieldPathFn === "function") {
    shieldPathFn(ctx);
    ctx.clip();
  }

  if (bgDef.type === "solid") {
    ctx.fillStyle = bgDef.value;
    ctx.fillRect(0, 0, w, h);

  } else if (bgDef.type === "gradient") {
    const rad = (bgDef.angle || 0) * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const grd = ctx.createLinearGradient(
      w / 2 - cos * w / 2, h / 2 - sin * h / 2,
      w / 2 + cos * w / 2, h / 2 + sin * h / 2
    );
    for (const [color, stop] of bgDef.stops) grd.addColorStop(stop, color);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

  } else if (bgDef.type === "texture") {
    // FIXED: draw texture to offscreen first, then composite — avoids
    // canvas state pollution when texture fn uses save/restore internally.
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const octx = off.getContext("2d");
    bgDef.fn(octx, w, h);
    ctx.drawImage(off, 0, 0);
  }

  ctx.restore();
}

// ── UI Builder ────────────────────────────────────────────────
// Rebuilt to use .bg-btn CSS class instead of inline style injection.

export function createBackgroundSelector({ containerId, onChange }) {
  const container = typeof containerId === "string"
    ? document.getElementById(containerId)
    : containerId;
  if (!container) return null;

  container.innerHTML = "";
  let activeId = null;

  for (const bg of BACKGROUNDS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bg-btn";
    btn.dataset.bgId = bg.id;
    btn.title = bg.label;

    // Canvas preview
    const preview = document.createElement("canvas");
    preview.width = 56; preview.height = 56;
    const pctx = preview.getContext("2d");

    // Draw preview without shield clip
    if (bg.type === "solid") {
      pctx.fillStyle = bg.value;
      pctx.fillRect(0, 0, 56, 56);
    } else if (bg.type === "gradient") {
      const rad = (bg.angle || 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const grd = pctx.createLinearGradient(
        28 - cos * 28, 28 - sin * 28,
        28 + cos * 28, 28 + sin * 28
      );
      for (const [color, stop] of bg.stops) grd.addColorStop(stop, color);
      pctx.fillStyle = grd;
      pctx.fillRect(0, 0, 56, 56);
    } else if (bg.type === "texture") {
      bg.fn(pctx, 56, 56);
    }

    const label = document.createElement("span");
    label.className = "bg-btn-label";
    label.textContent = bg.label;

    btn.appendChild(preview);
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      setActive(bg.id);
      onChange?.(bg);
    });

    btn.addEventListener("mouseenter", () => {
      if (btn.dataset.bgId !== activeId) btn.style.transform = "scale(1.06)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "";
    });

    container.appendChild(btn);
  }

  function setActive(id) {
    activeId = id;
    container.querySelectorAll(".bg-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.bgId === id);
    });
  }

  return { setActive };
}
