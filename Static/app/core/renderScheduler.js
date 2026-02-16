// RAF-coalesced render scheduler
// Usage:
//   const render = createRenderScheduler(() => composite());
//   render.invalidate(); // request next frame
export function createRenderScheduler(renderFn) {
  let queued = false;
  function invalidate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderFn();
    });
  }
  return { invalidate };
}
