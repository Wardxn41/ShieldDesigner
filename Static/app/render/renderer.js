// app/render/renderer.js
import { createRenderScheduler } from "../core/renderScheduler.js";

export function createRenderer({
  displayCanvas, guidesCanvas, dctx, gctx,
  shieldPath,
  layersSys,
  stamps,         // placeholder for later
  guides,         // object with drawGuides()
}) {
  function compositeToDisplay() {
    dctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

    dctx.save();
    shieldPath(dctx);
    dctx.clip();

    for (const layer of layersSys.layers) {
      if (!layer.visible) continue;
      dctx.drawImage(layer.canvas, 0, 0);
    }

    // stamps render (added in pass 3)
    stamps?.render?.(dctx);

    dctx.restore();

    guides.drawGuides();
  }

  const scheduler = createRenderScheduler(compositeToDisplay);
  function requestRender() { scheduler.invalidate(); }

  return { requestRender, compositeToDisplay };
}
