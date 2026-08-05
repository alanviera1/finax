import { PRIVACY_MODE_STORAGE_KEY } from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { setStoredBoolean } from "../core/storage.js";

function setPrivacyMode(enabled) {
  state.privacyMode = Boolean(enabled);
  document.body.classList.toggle("privacy-mode", state.privacyMode);
  dom.privacyToggle.setAttribute("aria-pressed", String(state.privacyMode));
  dom.privacyToggle.setAttribute(
    "aria-label",
    state.privacyMode
      ? "Desactivar modo privacidad"
      : "Activar modo privacidad",
  );
  dom.privacyToggle.title = state.privacyMode
    ? "Desactivar modo privacidad"
    : "Activar modo privacidad";
  dom.privacyToggleIcon.classList.toggle("fa-eye", !state.privacyMode);
  dom.privacyToggleIcon.classList.toggle("fa-eye-slash", state.privacyMode);
  setStoredBoolean(PRIVACY_MODE_STORAGE_KEY, state.privacyMode);
}

function togglePrivacyMode() {
  setPrivacyMode(!state.privacyMode);
}

function renderHeaderDate() {
  const formattedDate = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  dom.headerDate.textContent =
    formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
}

export { renderHeaderDate, setPrivacyMode, togglePrivacyMode };
