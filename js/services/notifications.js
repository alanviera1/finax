import {
  MILLISECONDS_PER_DAY,
  NATIVE_DEBT_NOTIFICATION_KEY,
  validDebtTypes,
} from "../core/constants.js";

import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, formatCurrency } from "../core/utils.js";

function getStartOfDay(value) {
  const date =
    value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function createDebtAlert(debtDocument, today) {
  const debt = debtDocument.data();
  if (
    debt.status !== "pending" ||
    !validDebtTypes.has(debt.type)
  ) {
    return null;
  }

  const expectedDate = getStartOfDay(debt.expectedPayDate);
  if (!expectedDate) {
    return null;
  }

  const daysUntilDue = Math.round(
    (expectedDate.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
  );
  const personName = String(debt.personName || "Sin nombre");
  const amount = Math.abs(Number(debt.amount) || 0);
  let message = "";

  if (debt.type === "payable") {
    if (daysUntilDue > 3) {
      return null;
    }

    if (daysUntilDue < 0) {
      const overdueDays = Math.abs(daysUntilDue);
      message = `Vencido hace ${overdueDays} ${
        overdueDays === 1 ? "día" : "días"
      }: Pago a ${personName}`;
    } else if (daysUntilDue === 0) {
      message = `Vence hoy: Pago a ${personName}`;
    } else if (daysUntilDue === 1) {
      message = `Vence mañana: Pago a ${personName}`;
    } else {
      message = `Vence en ${daysUntilDue} días: Pago a ${personName}`;
    }
  } else {
    if (daysUntilDue > 0) {
      return null;
    }

    if (daysUntilDue === 0) {
      message = `Cobrar hoy: ${formatCurrency(amount)} de ${personName}`;
    } else {
      const overdueDays = Math.abs(daysUntilDue);
      message = `Cobro vencido hace ${overdueDays} ${
        overdueDays === 1 ? "día" : "días"
      }: ${formatCurrency(amount)} de ${personName}`;
    }
  }

  return {
    id: debtDocument.id,
    type: debt.type,
    daysUntilDue,
    message,
  };
}

export function renderDebtAlerts() {
  const alertCount = state.debtAlerts.length;
  const hasAlerts = alertCount > 0;

  dom.notificationsIndicator.classList.toggle("hidden", !hasAlerts);
  dom.notificationsCount.textContent = String(alertCount);
  dom.notificationsCount.classList.toggle("hidden", !hasAlerts);
  dom.notificationsButton.setAttribute(
    "aria-label",
    hasAlerts
      ? `Notificaciones, ${alertCount} ${
          alertCount === 1 ? "alerta activa" : "alertas activas"
        }`
      : "Notificaciones, sin alertas activas",
  );

  if (!hasAlerts) {
    dom.notificationsList.innerHTML = `
      <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center">
        <i class="fa-regular fa-circle-check text-xl text-emerald-300" aria-hidden="true"></i>
        <p class="mt-2 text-sm font-medium text-slate-300">Todo está al día</p>
        <p class="mt-1 text-xs text-slate-500">No hay pagos o cobros que requieran atención.</p>
      </div>
    `;
    return;
  }

  dom.notificationsList.innerHTML = state.debtAlerts
    .map((alert) => {
      const isPayable = alert.type === "payable";
      return `
        <article class="flex items-start gap-3 rounded-2xl border ${
          isPayable ? "border-orange-400/15" : "border-emerald-400/15"
        } bg-white/[0.045] p-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isPayable
              ? "bg-orange-400/10 text-orange-300"
              : "bg-emerald-400/10 text-emerald-300"
          }">
            <i class="fa-solid ${
              isPayable ? "fa-clock" : "fa-hand-holding-dollar"
            }" aria-hidden="true"></i>
          </span>
          <p class="pt-1.5 text-sm leading-5 text-slate-200">${escapeHtml(alert.message)}</p>
        </article>
      `;
    })
    .join("");
}

export function setNotificationsOpen(isOpen) {
  state.notificationsOpen = Boolean(isOpen);
  dom.notificationsPanel.classList.toggle(
    "hidden",
    !state.notificationsOpen,
  );
  dom.notificationsButton.setAttribute(
    "aria-expanded",
    String(state.notificationsOpen),
  );
}

function sessionHasNativeDebtNotification() {
  try {
    return sessionStorage.getItem(NATIVE_DEBT_NOTIFICATION_KEY) === "true";
  } catch (error) {
    console.warn("sessionStorage no está disponible.", error);
    return false;
  }
}

function rememberNativeDebtNotification() {
  try {
    sessionStorage.setItem(NATIVE_DEBT_NOTIFICATION_KEY, "true");
  } catch (error) {
    console.warn("No se pudo guardar el estado de la notificación.", error);
  }
}

function maybeSendNativeDebtNotification(onNotificationClick) {
  if (
    state.debtAlerts.length === 0 ||
    state.notificationPermission !== "granted" ||
    state.nativeNotificationShown ||
    sessionHasNativeDebtNotification()
  ) {
    return;
  }

  state.nativeNotificationShown = true;
  rememberNativeDebtNotification();

  try {
    const notification = new Notification("Finax", {
      body:
        "Tienes deudas por vencer o cobros programados para hoy.",
      tag: "finax-debt-alerts",
    });

    notification.addEventListener("click", () => {
      window.focus();
      onNotificationClick();
      notification.close();
    });
  } catch (error) {
    console.warn("No se pudo mostrar la notificación nativa.", error);
  }
}

export function updateDebtAlerts({ onNotificationClick = () => {} } = {}) {
  const today = getStartOfDay(new Date());
  if (!today) {
    return;
  }

  state.debtAlerts = [...state.debts.values()]
    .map((debtDocument) => createDebtAlert(debtDocument, today))
    .filter(Boolean)
    .sort((first, second) => first.daysUntilDue - second.daysUntilDue);

  renderDebtAlerts();
  maybeSendNativeDebtNotification(onNotificationClick);
}

export async function initializeNativeNotifications({
  onNotificationClick = () => {},
} = {}) {
  if (!("Notification" in window)) {
    state.notificationPermission = "unsupported";
    return;
  }

  state.notificationPermission = Notification.permission;
  if (Notification.permission === "default") {
    try {
      state.notificationPermission =
        await Notification.requestPermission();
    } catch (error) {
      console.warn("No se pudo solicitar permiso de notificaciones.", error);
    }
  }

  maybeSendNativeDebtNotification(onNotificationClick);
}

export function registerServiceWorkerAfterLoad() {
  if (!("serviceWorker" in navigator)) {
    console.info("Service Worker no compatible con este navegador.");
    return;
  }

  const register = async () => {
    if (state.serviceWorkerRegistrationStarted) {
      return;
    }

    state.serviceWorkerRegistrationStarted = true;

    try {
      const serviceWorkerUrl = new URL("./sw.js", window.location.href);
      const registration = await navigator.serviceWorker.register(
        serviceWorkerUrl.href,
        {
          scope: "./",
          updateViaCache: "none",
        },
      );

      console.info(
        "PWA lista. Service Worker registrado:",
        registration.scope,
      );
    } catch (error) {
      console.error("No se pudo registrar el Service Worker.", error);
    }
  };

  if (document.readyState === "complete") {
    window.setTimeout(() => void register(), 0);
    return;
  }

  window.addEventListener("load", () => void register(), { once: true });
}
