import { dom } from "../core/dom.js";
import { state } from "../core/state.js";

function syncBodyScrollLock() {
  const hasOpenOverlay = [
    dom.transactionModal,
    dom.transactionDetailModal,
    dom.debtModal,
    dom.savingsModal,
    dom.subscriptionModal,
    dom.confirmationDialog,
  ].some((element) => element.getAttribute("aria-hidden") === "false");

  document.body.classList.toggle("overflow-hidden", hasOpenOverlay);
}

function openBottomSheet(root, panel, focusTarget) {
  window.clearTimeout(state.sheetTimers.get(root));
  root.classList.remove("invisible", "pointer-events-none");
  root.setAttribute("aria-hidden", "false");
  syncBodyScrollLock();

  window.requestAnimationFrame(() => {
    root.classList.remove("opacity-0");
    panel.classList.remove("translate-y-full");
    focusTarget?.focus();
  });
}

function closeBottomSheet(root, panel, returnFocus) {
  root.classList.add("pointer-events-none", "opacity-0");
  panel.classList.add("translate-y-full");
  root.setAttribute("aria-hidden", "true");
  syncBodyScrollLock();

  const timer = window.setTimeout(() => {
    root.classList.add("invisible");
    returnFocus?.focus();
  }, 300);

  state.sheetTimers.set(root, timer);
}

export { closeBottomSheet, openBottomSheet, syncBodyScrollLock };
