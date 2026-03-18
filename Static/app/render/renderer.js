// app/render/renderer.js
// UPGRADED: respects per-layer opacity when compositing

import { createRenderScheduler } from "../core/renderScheduler.js";

export function createRenderer({
  displayCanvas, guidesCanvas, dctx, gctx,
  shieldPath,
  layersSys,
  stamps,
  guides,
}) {
  function compositeToDisplay() {
    dctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    dctx.save();
    shieldPath(dctx);
    dctx.clip();

    for (const layer of layersSys.layers) {
      if (!layer.visible) continue;
      dctx.globalAlpha = layer.opacity ?? 1;
      dctx.drawImage(layer.canvas, 0, 0);
    }
    dctx.globalAlpha = 1;

    stamps?.render?.(dctx);
    dctx.restore();
    guides.drawGuides();
  }

  const scheduler = createRenderScheduler(compositeToDisplay);
  function requestRender() { scheduler.invalidate(); }

  return { requestRender, compositeToDisplay };
}
