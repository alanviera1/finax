import {
  collection,
  db,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "../../firebase-config.js";
import {
  RECURRING_SUBSCRIPTION_ACCOUNT_ID,
  categoriesByType,
} from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  escapeHtml,
  formatCurrency,
} from "../core/utils.js";
import {
  closeBottomSheet,
  openBottomSheet,
} from "../ui/bottomSheet.js";
import { requestConfirmation } from "../ui/confirmation.js";
import {
  setButtonLoading,
  setInlineError,
} from "../ui/modalHelpers.js";
import { showErrorToast, showToast } from "../ui/toast.js";
import {
  chargeSubscriptionInTransaction,
  createRecurringSubscriptionTransactionData,
  getRecurringPeriodKey,
  getRecurringSubscriptionTransactionId,
  getSubscriptionAccountId,
  isSubscriptionDue,
} from "../services/firestore/repositories.js";

export function openSubscriptionModal() {
  dom.subscriptionForm.reset();
  setInlineError(dom.subscriptionFormError);
  openBottomSheet(
    dom.subscriptionModal,
    dom.subscriptionPanel,
    dom.subscriptionName,
  );
}

export function closeSubscriptionModal() {
  closeBottomSheet(
    dom.subscriptionModal,
    dom.subscriptionPanel,
    dom.newSubscriptionButton,
  );
}

export async function deleteSubscription(subscriptionDocument, triggerButton) {
  const decision = await requestConfirmation({
    title: "Eliminar gasto fijo",
    message: "Este gasto recurrente se eliminará de tu automatización.",
    confirmLabel: "Eliminar",
    tone: "danger",
  });

  if (!decision.confirmed) return;

  const restoreButton = setButtonLoading(triggerButton, "");
  try {
    await deleteDoc(subscriptionDocument.ref);
    showToast("Gasto fijo eliminado", "success");
  } catch (error) {
    console.error("No se pudo eliminar el gasto fijo.", error);
    showErrorToast("No se pudo eliminar. Inténtalo nuevamente.");
  } finally {
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}

function createSubscriptionCard(subscriptionDocument) {
  const subscription = subscriptionDocument.data();
  const isActive = subscription.active !== false;
  const amount = Math.abs(Number(subscription.amount)) || 0;
  const configuredDay = Number(subscription.dayOfMonth);
  const chargeDay =
    Number.isInteger(configuredDay) && configuredDay >= 1 && configuredDay <= 31
      ? configuredDay
      : null;
  const name = String(subscription.name ?? "").trim() || "Gasto fijo";

  return `
    <article class="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/25 p-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        isActive
          ? "bg-blue-400/10 text-blue-300"
          : "bg-slate-500/10 text-slate-500"
      }">
        <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold text-slate-200">${escapeHtml(name)}</h3>
            <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(subscription.category || "Otros")} · día ${chargeDay ?? "—"}</p>
          </div>
          <p data-sensitive-amount class="whitespace-nowrap text-sm font-semibold ${
            isActive ? "text-blue-300" : "text-slate-500"
          }">${formatCurrency(amount)}</p>
        </div>
        <div class="mt-2 flex items-center justify-between gap-3">
          <span class="text-[11px] font-medium ${
            isActive ? "text-emerald-300/80" : "text-slate-500"
          }">${isActive ? "Activo" : "Pausado"}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-toggle-subscription="${escapeHtml(subscriptionDocument.id)}"
              aria-pressed="${String(isActive)}"
              class="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-blue-400/30 hover:text-blue-300"
            >
              ${isActive ? "Pausar" : "Reactivar"}
            </button>
            <button
              type="button"
              data-delete-subscription="${escapeHtml(subscriptionDocument.id)}"
              aria-label="Eliminar gasto fijo"
              class="cursor-pointer p-1.5 text-slate-600 transition-colors hover:text-rose-400"
            >
              <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function renderSubscriptions() {
  const subscriptions = [...state.subscriptions.values()].sort(
    (firstDocument, secondDocument) => {
      const first = firstDocument.data();
      const second = secondDocument.data();
      const dayDifference =
        (Number(first.dayOfMonth) || 32) - (Number(second.dayOfMonth) || 32);

      return dayDifference || String(first.name ?? "").localeCompare(
        String(second.name ?? ""),
        "es",
        { sensitivity: "base" },
      );
    },
  );

  if (subscriptions.length === 0) {
    dom.subscriptionsList.innerHTML = `
      <div class="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-slate-500">
        Aún no tienes gastos fijos configurados.
      </div>
    `;
    return;
  }

  dom.subscriptionsList.innerHTML = subscriptions
    .map(createSubscriptionCard)
    .join("");
}

export async function handleSubscriptionSubmit(event) {
  event.preventDefault();
  setInlineError(dom.subscriptionFormError);

  const formData = new FormData(dom.subscriptionForm);
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const amount = Number.parseFloat(String(formData.get("amount")));
  const dayOfMonth = Number(formData.get("dayOfMonth"));

  if (
    !name ||
    !categoriesByType.expense.includes(category) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(dayOfMonth) ||
    dayOfMonth < 1 ||
    dayOfMonth > 31
  ) {
    setInlineError(
      dom.subscriptionFormError,
      "Completa nombre, categoría, monto y un día válido.",
    );
    return;
  }

  if (state.subscriptionSubmitting) {
    return;
  }

  const submitButton = dom.subscriptionForm.querySelector(
    'button[type="submit"]',
  );
  state.subscriptionSubmitting = true;
  const restoreButton = setButtonLoading(submitButton, "Activando");

  try {
    const batch = writeBatch(db);
    const subscriptionReference = doc(collection(db, "subscriptions"));

    batch.set(subscriptionReference, {
      name,
      category,
      amount,
      dayOfMonth,
      accountId: RECURRING_SUBSCRIPTION_ACCOUNT_ID,
      active: true,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    closeSubscriptionModal();
    showToast("Gasto fijo activado.", "success");
  } catch (error) {
    console.error("No se pudo crear el gasto fijo.", error);
    setInlineError(
      dom.subscriptionFormError,
      "No se pudo guardar el gasto fijo. Inténtalo nuevamente.",
    );
  } finally {
    state.subscriptionSubmitting = false;
    restoreButton();
  }
}

export async function setSubscriptionActive(subscriptionDocument, triggerButton) {
  const subscription = subscriptionDocument.data();
  const isActive = subscription.active !== false;
  const restoreButton = setButtonLoading(
    triggerButton,
    isActive ? "Pausando" : "Activando",
  );

  try {
    const batch = writeBatch(db);
    batch.update(subscriptionDocument.ref, { active: !isActive });
    await batch.commit();
    showToast(
      isActive ? "Gasto fijo pausado." : "Gasto fijo reactivado.",
      "success",
    );
  } catch (error) {
    console.error("No se pudo actualizar el gasto fijo.", error);
  } finally {
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}

async function chargeDueSubscription(subscriptionDocument, now = new Date()) {
  const subscription = subscriptionDocument.data();
  const amount = Math.abs(Number(subscription.amount));
  const category = String(subscription.category ?? "");
  const accountId = getSubscriptionAccountId(subscription);
  const period = getRecurringPeriodKey(now);
  const transactionId = getRecurringSubscriptionTransactionId(
    subscriptionDocument.id,
    period,
  );

  if (
    !isSubscriptionDue(subscription, now) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !categoriesByType.expense.includes(category) ||
    state.transactions.has(transactionId) ||
    state.pendingSubscriptionCharges.has(transactionId)
  ) {
    return;
  }

  state.pendingSubscriptionCharges.add(transactionId);

  try {
    const transactionReference = doc(db, "transactions", transactionId);
    const accountReference = doc(
      db,
      "accounts",
      accountId,
    );
    const wasCharged = await chargeSubscriptionInTransaction({
      transactionReference,
      accountReference,
      amount,
      transactionData: createRecurringSubscriptionTransactionData(
        subscription,
        subscriptionDocument.id,
        period,
      ),
    });

    if (wasCharged) {
      const name = String(subscription.name ?? "").trim() || "Gasto fijo";
      showToast(`Pago recurrente registrado: ${name}.`, "success");
    }
  } catch (error) {
    console.error(
      "No se pudo registrar el pago recurrente.",
      { subscriptionId: subscriptionDocument.id, error },
    );
  } finally {
    state.pendingSubscriptionCharges.delete(transactionId);
  }
}

export function processDueSubscriptions(now = new Date()) {
  if (
    !state.accountsReady ||
    !state.transactionsReady ||
    !state.subscriptionsReady
  ) {
    return;
  }

  state.subscriptions.forEach((subscriptionDocument) => {
    void chargeDueSubscription(subscriptionDocument, now);
  });
}
