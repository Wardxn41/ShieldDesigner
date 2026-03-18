// app/canvas/shieldMask.js
// UPGRADED: accepts a shape definition from shapeRegistry.
// The shape can be swapped at runtime — just call setShape(newShape) + buildShieldMask().

import { getShape } from "./shapeRegistry.js";

export function createShieldMask(displayCanvas) {
  let shieldMask     = null;
  let shieldBoundary = null;
  let _shape = getShape("scutum"); // default

  function setShape(shapeOrId) {
    if (typeof shapeOrId === "string") {
      _shape = getShape(shapeOrId);
    } else {
      _shape = shapeOrId;
    }
  }

  function getActiveShape() { return _shape; }

  function shieldPath(ctx) {
    _shape.path(ctx, displayCanvas.width, displayCanvas.height);
  }

  function buildShieldMask() {
    const w = displayCanvas.width, h = displayCanvas.height;
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const octx = off.getContext("2d", { willReadFrequently: true });
    octx.clearRect(0, 0, w, h);
    octx.fillStyle = "rgba(255,255,255,1)";
    shieldPath(octx);
    octx.fill();

    const img = octx.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = img[i * 4 + 3] > 0 ? 1 : 0;
    shieldMask = m;

    const b = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!m[p]) continue;
        if (!m[p - 1] || !m[p + 1] || !m[p - w] || !m[p + w]) b[p] = 1;
      }
    }
    shieldBoundary = b;
  }

  function isInsideShield(x, y) {
    const w = displayCanvas.width, h = displayCanvas.height;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return shieldMask?.[y * w + x] === 1;
  }

  function isOnShieldBoundary(x, y) {
    return shieldBoundary?.[y * displayCanvas.width + x] === 1;
  }

  function clipToShield(c) { c.save(); shieldPath(c); c.clip(); }
  function unclip(c) { c.restore(); }

  return {
    shieldPath,
    buildShieldMask,
    isInsideShield,
    isOnShieldBoundary,
    clipToShield,
    unclip,
    setShape,
    getActiveShape,
    get mask() { return shieldMask; },
    get boundary() { return shieldBoundary; },
  };
}
