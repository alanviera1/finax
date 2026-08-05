import { confirmationToneClasses } from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { formatCurrency } from "../core/utils.js";
import { syncBodyScrollLock } from "./bottomSheet.js";
import { setInlineError } from "./modalHelpers.js";

function setConfirmationTone(tone) {
  dom.confirmationAccept.classList.remove(...confirmationToneClasses);
  dom.confirmationIcon.classList.remove(
    "bg-blue-400/10",
    "text-blue-300",
    "bg-rose-400/10",
    "text-rose-300",
  );

  if (tone === "danger") {
    dom.confirmationAccept.classList.add(
      "border-rose-300/20",
      "bg-rose-500/15",
      "text-rose-300",
    );
    dom.confirmationIcon.classList.add("bg-rose-400/10", "text-rose-300");
    dom.confirmationIcon.innerHTML =
      '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
    return;
  }

  dom.confirmationAccept.classList.add(
    "border-blue-300/20",
    "bg-blue-500/15",
    "text-blue-300",
  );
  dom.confirmationIcon.classList.add("bg-blue-400/10", "text-blue-300");
  dom.confirmationIcon.innerHTML =
    '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>';
}

function requestConfirmation({
  title,
  message,
  confirmLabel = "Confirmar",
  tone = "default",
  requestAccount = false,
  requestAmount = false,
  accountLabel = "Cuenta",
  amountLabel = "Monto",
  prefillAmount = null,
  maxAmount = null,
}) {
  window.clearTimeout(state.confirmationTimer);
  state.confirmationTimer = null;

  if (state.confirmationResolver) {
    state.confirmationResolver({
      confirmed: false,
      accountId: null,
      amount: null,
    });
    state.confirmationResolver = null;
  }

  dom.confirmationTitle.textContent = title;
  dom.confirmationMessage.textContent = message;
  dom.confirmationAccept.textContent = confirmLabel;
  dom.confirmationAccountField.classList.toggle("hidden", !requestAccount);
  dom.confirmationAccountLabel.textContent = accountLabel;
  dom.confirmationAccount.value = "yape";
  dom.confirmationAmountField.classList.toggle("hidden", !requestAmount);
  dom.confirmationAmountLabel.textContent = amountLabel;
  dom.confirmationAmount.value =
    prefillAmount && Number.isFinite(Number(prefillAmount))
      ? String(Number(prefillAmount))
      : "";
  state.maxConfirmationAmount =
    maxAmount != null && Number.isFinite(Number(maxAmount))
      ? Number(maxAmount)
      : null;
  setInlineError(dom.confirmationFormError);
  setConfirmationTone(tone);

  dom.confirmationDialog.classList.remove("invisible", "pointer-events-none");
  dom.confirmationDialog.setAttribute("aria-hidden", "false");
  syncBodyScrollLock();

  window.requestAnimationFrame(() => {
    dom.confirmationDialog.classList.remove("opacity-0");
    dom.confirmationPanel.classList.remove(
      "translate-y-2",
      "scale-95",
      "opacity-0",
    );
    (requestAmount ? dom.confirmationAmount : dom.confirmationAccept).focus();
  });

  return new Promise((resolve) => {
    state.confirmationResolver = resolve;
  });
}

function closeConfirmation(result) {
  const resolver = state.confirmationResolver;
  state.confirmationResolver = null;
  state.maxConfirmationAmount = null;

  dom.confirmationDialog.classList.add("pointer-events-none", "opacity-0");
  dom.confirmationDialog.setAttribute("aria-hidden", "true");
  dom.confirmationPanel.classList.add(
    "translate-y-2",
    "scale-95",
    "opacity-0",
  );
  syncBodyScrollLock();

  window.clearTimeout(state.confirmationTimer);
  state.confirmationTimer = window.setTimeout(() => {
    dom.confirmationDialog.classList.add("invisible");
    state.confirmationTimer = null;
  }, 200);

  resolver?.(result);
}

function acceptConfirmation() {
  const requestsAmount = !dom.confirmationAmountField.classList.contains(
    "hidden",
  );
  const amount = Number.parseFloat(dom.confirmationAmount.value);

  if (requestsAmount && (!Number.isFinite(amount) || amount <= 0)) {
    setInlineError(
      dom.confirmationFormError,
      "Ingresa un monto mayor a S/. 0.00.",
    );
    dom.confirmationAmount.focus();
    return;
  }

  if (
    requestsAmount &&
    state.maxConfirmationAmount != null &&
    amount > state.maxConfirmationAmount
  ) {
    setInlineError(
      dom.confirmationFormError,
      `El monto no puede superar ${formatCurrency(state.maxConfirmationAmount)}.`,
    );
    dom.confirmationAmount.focus();
    return;
  }

  closeConfirmation({
    confirmed: true,
    accountId: dom.confirmationAccountField.classList.contains("hidden")
      ? null
      : dom.confirmationAccount.value,
    amount: requestsAmount ? amount : null,
  });
}

function cancelConfirmation() {
  closeConfirmation({ confirmed: false, accountId: null, amount: null });
}

export {
  acceptConfirmation,
  cancelConfirmation,
  requestConfirmation,
};
