// Shield mask + boundary detection
// Encapsulates:
// - Path definition for the current shield shape
// - Binary mask (inside / outside)
// - Boundary pixels for outlines + guide drawing
export function createShieldMask(displayCanvas) {
  let shieldMask = null;
  let shieldBoundary = null;

  function shieldPath(c) {
    const w = displayCanvas.width;
    const h = displayCanvas.height;

    const left = w * 0.18;
    const right = w * 0.82;
    const top = h * 0.03;
    const bottom = h * 0.97;

    const rx = w * 0.13;
    const ry = h * 0.09;

    c.beginPath();
    c.moveTo(left + rx, top);
    c.lineTo(right - rx, top);
    c.quadraticCurveTo(right, top, right, top + ry);
    c.lineTo(right, bottom - ry);
    c.quadraticCurveTo(right, bottom, right - rx, bottom);
    c.lineTo(left + rx, bottom);
    c.quadraticCurveTo(left, bottom, left, bottom - ry);
    c.lineTo(left, top + ry);
    c.quadraticCurveTo(left, top, left + rx, top);
    c.closePath();
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
    for (let i = 0; i < w * h; i++) {
      m[i] = img[i * 4 + 3] > 0 ? 1 : 0;
    }
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
    const w = displayCanvas.width;
    return shieldBoundary?.[y * w + x] === 1;
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
    // exposing for debugging (optional)
    get mask() { return shieldMask; },
    get boundary() { return shieldBoundary; },
  };
}
