// Symmetry helper: expand a point into symmetric points based on mode.
export function getSymmetryPoints(p, dims, mode = "none") {
  const { w, h } = dims;
  const cx = w / 2, cy = h / 2;

  const base = { x: p.x, y: p.y };
  const mx = { x: (2 * cx - p.x), y: p.y };
  const my = { x: p.x, y: (2 * cy - p.y) };
  const mxy = { x: (2 * cx - p.x), y: (2 * cy - p.y) };

  if (mode === "none") return [base];
  if (mode === "mirrorX") return [base, mx];
  if (mode === "mirrorY") return [base, my];
  if (mode === "mirrorXY") return [base, mx, my, mxy];

  const steps = mode === "radial8" ? 8 : 4;
  const angStep = (Math.PI * 2) / steps;
  const dx = p.x - cx;
  const dy = p.y - cy;

  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = angStep * i;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    pts.push({ x: cx + rx, y: cy + ry });
  }
  return pts;
}
