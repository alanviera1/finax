import { escapeHtml } from "../core/utils.js";

function setInlineError(element, message = "") {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setButtonLoading(button, label) {
  const originalContent = button.innerHTML;

  button.disabled = true;
  button.classList.add("pointer-events-none", "opacity-60");
  button.innerHTML = `
    <i class="fa-solid fa-circle-notch fa-spin ${label ? "mr-2" : ""}" aria-hidden="true"></i>
    ${label ? escapeHtml(label) : ""}
  `;

  return () => {
    button.disabled = false;
    button.classList.remove("pointer-events-none", "opacity-60");
    button.innerHTML = originalContent;
  };
}

export { setButtonLoading, setInlineError };
