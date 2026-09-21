/** Coordinates input finalization; persistence remains the caller's responsibility. */
window.SmartInput = (() => {
  function create({ target, type = "single", onReadyToSave }) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    const tag = type === "single" ? "INPUT" : type === "multi" ? "TEXTAREA" : null;
    if (!element || !tag || element.tagName !== tag || typeof onReadyToSave !== "function") {
      throw new Error("SmartInput requires a matching input/textarea, a valid type, and an onReadyToSave callback.");
    }
    let saving = false, entering = false, destroyed = false;

    function executeSave(reason, relatedTarget = null) {
      if (saving || destroyed || element.disabled || element.readOnly) return Promise.resolve();
      saving = true;
      try {
        const result = onReadyToSave(element.value.trim(), { element, reason, relatedTarget });
        if (result?.then) return Promise.resolve(result).finally(() => { saving = false; });
        saving = false;
        return Promise.resolve(result);
      } catch (error) {
        saving = false;
        return Promise.reject(error);
      }
    }

    function report(error) {
      showToast(error.message || "Unable to save changes. Please try again.", "error");
    }

    function handleBlur(event) {
      if (!entering) executeSave("blur", event.relatedTarget).catch(report);
    }

    function handleKeyDown(event) {
      if (type !== "single" || event.key !== "Enter" || event.isComposing || event.repeat) return;
      event.preventDefault();
      entering = true;
      try {
        executeSave("enter").catch(report);
        element.blur();
      } finally { entering = false; }
    }

    function destroy() {
      destroyed = true;
      element.removeEventListener("blur", handleBlur);
      element.removeEventListener("keydown", handleKeyDown);
    }

    element.addEventListener("blur", handleBlur);
    element.addEventListener("keydown", handleKeyDown);
    return { element, triggerSave: () => executeSave("manual").catch(report), destroy };
  }
  return { create };
})();
