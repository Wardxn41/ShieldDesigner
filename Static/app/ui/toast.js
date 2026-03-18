// app/ui/toast.js
// Lightweight toast notification system.
// Usage: import { showToast } from "./toast.js";
//        showToast("Saved ✓", "success");
//        showToast("Error saving design", "error");

let container = null;

function getContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.id = "toast-container";
  container.style.cssText = `
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 8px;
    z-index: 999;
    pointer-events: none;
  `;
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = "success", durationMs = 2400) {
  const c = getContainer();
  const toast = document.createElement("div");

  const colors = {
    success: { bg: "rgba(30,22,16,0.97)", border: "rgba(214,168,75,0.75)", icon: "✓", iconColor: "#d6a84b" },
    error:   { bg: "rgba(30,14,14,0.97)", border: "rgba(200,60,60,0.75)",  icon: "✕", iconColor: "#e05555" },
    info:    { bg: "rgba(20,20,32,0.97)", border: "rgba(100,140,220,0.75)", icon: "i", iconColor: "#7aadee" },
  };
  const style = colors[type] || colors.info;

  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px 10px 14px;
    border-radius: 14px;
    background: ${style.bg};
    border: 1px solid ${style.border};
    box-shadow: 0 8px 28px rgba(0,0,0,0.45);
    color: #f2e7d6;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    font-size: 13px;
    font-weight: 700;
    pointer-events: none;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(12px) scale(0.96);
    transition: opacity 0.18s ease, transform 0.18s ease;
  `;

  const iconEl = document.createElement("span");
  iconEl.textContent = style.icon;
  iconEl.style.cssText = `
    width: 20px; height: 20px;
    border-radius: 50%;
    background: ${style.border};
    color: ${style.iconColor};
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 900; flex-shrink: 0;
  `;

  const textEl = document.createElement("span");
  textEl.textContent = message;

  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  c.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0) scale(1)";
    });
  });

  // Animate out then remove
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px) scale(0.96)";
    setTimeout(() => toast.remove(), 220);
  }, durationMs);
}
