// app/canvas/shapeRegistry.js
// Modular shield shape system. Each shape defines:
//   - id, label, aspectRatio
//   - path(ctx, w, h): draws the canvas path
//   Adding new shapes = adding an entry here, nothing else to change.

export const SHIELD_SHAPES = [
  {
    id: "scutum",
    label: "Roman Scutum",
    icon: "▬",
    aspectRatio: 620 / 800, // tall rectangle
    description: "Rectangular curved legionary shield",
    path(ctx, w, h) {
      const left   = w * 0.18, right  = w * 0.82;
      const top    = h * 0.03, bottom = h * 0.97;
      const rx = w * 0.13,    ry = h * 0.09;
      ctx.beginPath();
      ctx.moveTo(left + rx, top);
      ctx.lineTo(right - rx, top);
      ctx.quadraticCurveTo(right, top, right, top + ry);
      ctx.lineTo(right, bottom - ry);
      ctx.quadraticCurveTo(right, bottom, right - rx, bottom);
      ctx.lineTo(left + rx, bottom);
      ctx.quadraticCurveTo(left, bottom, left, bottom - ry);
      ctx.lineTo(left, top + ry);
      ctx.quadraticCurveTo(left, top, left + rx, top);
      ctx.closePath();
    },
  },
  {
    id: "oval",
    label: "Oval Shield",
    icon: "⬭",
    aspectRatio: 620 / 800,
    description: "Classical oval infantry shield",
    path(ctx, w, h) {
      const cx = w / 2, cy = h / 2;
      const rx = w * 0.38, ry = h * 0.46;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.closePath();
    },
  },
  {
    id: "round",
    label: "Round Shield (Clipeus)",
    icon: "⬤",
    aspectRatio: 1,
    description: "Classic circular Roman clipeus",
    path(ctx, w, h) {
      const cx = w / 2, cy = h / 2;
      const r = Math.min(w, h) * 0.44;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
    },
  },
  {
    id: "kite",
    label: "Kite Shield",
    icon: "◆",
    aspectRatio: 580 / 860,
    description: "Elongated Norman-style kite shield",
    path(ctx, w, h) {
      const cx = w / 2;
      const top    = h * 0.03;
      const bottom = h * 0.97;
      const midY   = h * 0.38;
      const leftW  = w * 0.20, rightW = w * 0.80;
      const tipX   = cx;

      ctx.beginPath();
      // Flat top with rounded corners
      ctx.moveTo(leftW + w * 0.08, top);
      ctx.lineTo(rightW - w * 0.08, top);
      ctx.quadraticCurveTo(rightW, top, rightW, top + h * 0.06);
      // Right side curves inward toward tip
      ctx.quadraticCurveTo(rightW, midY, tipX + w * 0.04, bottom - h * 0.06);
      ctx.quadraticCurveTo(tipX, bottom, tipX, bottom);
      ctx.quadraticCurveTo(tipX - w * 0.04, bottom - h * 0.06, leftW, midY);
      ctx.quadraticCurveTo(leftW, top + h * 0.06, leftW + w * 0.08, top);
      ctx.closePath();
    },
  },
];

export function getShape(id) {
  return SHIELD_SHAPES.find(s => s.id === id) || SHIELD_SHAPES[0];
}
