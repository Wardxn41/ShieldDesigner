// Static/app/core/saveManager.js
// FIX: cancel() method prevents stale canvas data being written to a newly-switched design.

export function createSaveManager({
  getActiveDesignId,
  getLayersForSave,
  getStampsForSave,
  getForceFull,
  clearDirtyFlags,
  saveDesign,
  touchDesignLocal,
  refreshDesignListThrottled,
  debounceMs = 500,
}) {
  let saveTimer = null;
  let saveInFlight = null;
  let pendingSave = false;

  async function runSaveOnce() {
    if (saveInFlight) return;
    const id = getActiveDesignId();
    if (!id) return;

    touchDesignLocal?.(id);

    saveInFlight = (async () => {
      try {
        await saveDesign(
          id,
          getLayersForSave(),
          getStampsForSave(),
          { forceFull: !!getForceFull?.() }
        );
        clearDirtyFlags?.();
        refreshDesignListThrottled?.();
      } finally {
        saveInFlight = null;
      }
    })();

    await saveInFlight;

    if (pendingSave) {
      pendingSave = false;
      await runSaveOnce();
    }
  }

  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    if (saveInFlight) {
      pendingSave = true;
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      runSaveOnce();
    }, debounceMs);
  }

  // Cancel any queued (but not yet fired) save.
  // Call BEFORE switching activeDesignId to prevent old canvas data
  // being written into the incoming design.
  function cancel() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingSave = false;
  }

  return { saveDebounced, runSaveOnce, cancel };
}
