import { toastToneClasses } from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";

function showToast(message, tone = "info") {
  window.clearTimeout(state.toastTimer);
  const normalizedMessage = String(message ?? "").trim();
  dom.toastMessage.textContent = normalizedMessage;
  dom.toast.classList.remove(...toastToneClasses);
  dom.toastIcon.classList.remove(...toastToneClasses);

  const tones = {
    error: {
      container: ["border-rose-400/20", "text-rose-200"],
      icon: ["bg-rose-400/10", "text-rose-300"],
      markup:
        '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>',
    },
    success: {
      container: ["border-emerald-400/20", "text-emerald-200"],
      icon: ["bg-emerald-400/10", "text-emerald-300"],
      markup:
        '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>',
    },
    warning: {
      container: ["border-amber-400/20", "text-amber-100"],
      icon: ["bg-amber-400/10", "text-amber-300"],
      markup:
        '<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i>',
    },
    info: {
      container: ["border-blue-400/20", "text-blue-100"],
      icon: ["bg-blue-400/10", "text-blue-300"],
      markup:
        '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>',
    },
  };
  const selectedTone = tones[tone] ?? tones.info;

  dom.toast.classList.add(...selectedTone.container);
  dom.toastIcon.classList.add(...selectedTone.icon);
  dom.toastIcon.innerHTML = selectedTone.markup;
  dom.toast.classList.remove("invisible");

  window.requestAnimationFrame(() => {
    dom.toast.classList.remove("-translate-y-3", "opacity-0");
  });

  const visibleDuration = Math.min(
    9000,
    Math.max(3600, 2400 + normalizedMessage.length * 34),
  );

  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.add("-translate-y-3", "opacity-0");
    state.toastTimer = window.setTimeout(() => {
      dom.toast.classList.add("invisible");
      state.toastTimer = null;
    }, 200);
  }, visibleDuration);
}

function showErrorToast(message) {
  showToast(message, "error");
}

export { showErrorToast, showToast };
