import {
  collection,
  db,
  doc,
  getDocs,
  increment,
  query,
  where,
  writeBatch,
} from "../../firebase-config.js";
import { validAccounts } from "../core/constants.js";
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
import { createSavingsGoalMovementTransactionData } from "../services/firestore/repositories.js";
import { reserveAccountDebit } from "./transactions.js";

export function openSavingsModal() {
  dom.savingsForm.reset();
  setInlineError(dom.savingsFormError);
  openBottomSheet(
    dom.savingsModal,
    dom.savingsPanel,
    dom.savingsGoalName,
  );
}

export function closeSavingsModal() {
  closeBottomSheet(
    dom.savingsModal,
    dom.savingsPanel,
    dom.newSavingsGoalButton,
  );
}

export async function deleteSavingsGoal(goalDocument, triggerButton) {
  const decision = await requestConfirmation({
    title: "Eliminar meta de ahorro",
    message: "La meta se eliminará permanentemente.",
    confirmLabel: "Eliminar",
    tone: "danger",
  });

  if (!decision.confirmed) return;

  const restoreButton = setButtonLoading(triggerButton, "");
  try {
    const batch = writeBatch(db);
    batch.delete(goalDocument.ref);

    const associatedTransactionsQuery = query(
      collection(db, "transactions"),
      where("savingsGoalId", "==", goalDocument.id),
    );
    const associatedTransactionsSnapshot = await getDocs(
      associatedTransactionsQuery,
    );
    associatedTransactionsSnapshot.docs.forEach((transactionDocument) => {
      batch.delete(transactionDocument.ref);
    });

    await batch.commit();
    showToast("Meta de ahorro eliminada", "success");
  } catch (error) {
    console.error("No se pudo eliminar la meta de ahorro.", error);
    showErrorToast("No se pudo eliminar. Inténtalo nuevamente.");
  } finally {
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}

function createSavingsGoalCard(goalDocument) {
  const goal = goalDocument.data();
  const targetAmount = Math.max(0, Number(goal.targetAmount) || 0);
  const currentSaved = Math.max(0, Number(goal.currentSaved) || 0);
  const monthlyContribution = Math.max(
    0,
    Number(goal.monthlyContribution) || 0,
  );
  const remainingAmount = Math.max(0, targetAmount - currentSaved);
  const progress =
    targetAmount > 0
      ? Math.min(100, (currentSaved / targetAmount) * 100)
      : 0;
  const roundedProgress = Math.round(progress);
  const estimatedMonths =
    monthlyContribution > 0
      ? Math.ceil(remainingAmount / monthlyContribution)
      : null;

  let estimateText = "Define un aporte mensual para estimar el plazo.";
  if (remainingAmount <= 0 && targetAmount > 0) {
    estimateText = "¡Meta alcanzada! Tu ahorro ya llegó al objetivo.";
  } else if (estimatedMonths !== null) {
    estimateText = `A este ritmo, lo lograrás en ${estimatedMonths} ${
      estimatedMonths === 1 ? "mes" : "meses"
    }.`;
  }

  return `
    <article class="overflow-hidden rounded-3xl border border-blue-400/15 bg-white/[0.05] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.25),0_0_30px_rgba(59,130,246,0.06),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
      <div class="flex items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-blue-300 shadow-[0_8px_24px_rgba(59,130,246,0.1)]">
          <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="truncate font-semibold text-white">${escapeHtml(goal.goalName || "Meta sin nombre")}</h2>
              <p data-sensitive-amount class="mt-1 text-sm text-slate-400">
                <span class="font-semibold text-blue-300">${formatCurrency(currentSaved)}</span>
                <span class="font-normal text-slate-400">de ${formatCurrency(targetAmount)}</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-xl border border-blue-400/15 bg-blue-400/[0.08] px-2.5 py-1 text-xs font-semibold text-blue-300">
                ${roundedProgress}%
              </span>
              <button
                type="button"
                data-delete-goal="${escapeHtml(goalDocument.id)}"
                aria-label="Eliminar meta"
                class="cursor-pointer p-1.5 text-slate-600 transition-colors hover:text-rose-400"
              >
                <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="mt-5 h-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-slate-950/70"
        role="progressbar"
        aria-label="Progreso de ${escapeHtml(goal.goalName || "la meta")}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${roundedProgress}"
      >
        <div
          class="h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-300 shadow-[0_0_16px_rgba(59,130,246,0.55)] transition-[width] duration-500"
          style="width: ${progress.toFixed(2)}%"
        ></div>
      </div>

      <div class="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
        <i class="fa-regular fa-clock mt-0.5 text-blue-300/70" aria-hidden="true"></i>
        <p>${escapeHtml(estimateText)}</p>
      </div>

      <div class="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          data-withdraw-goal="${escapeHtml(goalDocument.id)}"
          ${currentSaved <= 0 ? "disabled" : ""}
          class="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <i class="fa-solid fa-arrow-up-from-bracket mr-2 text-slate-500" aria-hidden="true"></i>
          Retirar
        </button>
        <button
          type="button"
          data-contribute-goal="${escapeHtml(goalDocument.id)}"
          class="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 shadow-[0_8px_24px_rgba(59,130,246,0.1)] transition hover:bg-blue-500/15 active:scale-[0.98]"
        >
          <i class="fa-solid fa-plus mr-2" aria-hidden="true"></i>
          Aportar
        </button>
      </div>
    </article>
  `;
}

export function renderSavingsGoals() {
  const savingsGoals = [...state.savingsGoals.values()].sort((first, second) =>
    String(first.data().goalName ?? "").localeCompare(
      String(second.data().goalName ?? ""),
      "es",
      { sensitivity: "base" },
    ),
  );

  if (savingsGoals.length === 0) {
    dom.savingsGoalsList.innerHTML = `
      <div class="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-12 text-center shadow-[0_18px_45px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-400/[0.08] text-xl text-blue-300">
          <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i>
        </div>
        <p class="mt-4 font-medium text-slate-200">Tu primera meta empieza aquí</p>
        <p class="mt-1 text-sm leading-6 text-slate-500">Crea un objetivo y convierte cada aporte en progreso visible.</p>
      </div>
    `;
    return;
  }

  dom.savingsGoalsList.innerHTML = savingsGoals
    .map(createSavingsGoalCard)
    .join("");
}

export async function handleSavingsGoalSubmit(event) {
  event.preventDefault();
  setInlineError(dom.savingsFormError);

  const formData = new FormData(dom.savingsForm);
  const goalName = String(formData.get("goalName") ?? "").trim();
  const targetAmount = Number.parseFloat(
    String(formData.get("targetAmount")),
  );
  const monthlyContribution = Number.parseFloat(
    String(formData.get("monthlyContribution")),
  );

  if (
    !goalName ||
    !Number.isFinite(targetAmount) ||
    targetAmount <= 0 ||
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution <= 0
  ) {
    setInlineError(
      dom.savingsFormError,
      "Completa la meta con montos mayores a S/. 0.00.",
    );
    return;
  }

  const submitButton = dom.savingsForm.querySelector(
    'button[type="submit"]',
  );
  const restoreButton = setButtonLoading(submitButton, "Creando");

  try {
    const batch = writeBatch(db);
    const goalReference = doc(collection(db, "savings_goals"));

    batch.set(goalReference, {
      goalName,
      targetAmount,
      monthlyContribution,
      currentSaved: 0,
    });

    await batch.commit();
    closeSavingsModal();
  } catch (error) {
    console.error("No se pudo crear la meta de ahorro.", error);
    setInlineError(
      dom.savingsFormError,
      "No se pudo crear la meta. Inténtalo nuevamente.",
    );
  } finally {
    restoreButton();
  }
}

export async function moveSavingsGoal(goalDocument, movement, triggerButton) {
  const goal = goalDocument.data();
  const isContribution = movement === "contribute";
  const currentSaved = Math.max(0, Number(goal.currentSaved) || 0);
  const decision = await requestConfirmation({
    title: isContribution ? "Aportar a la meta" : "Retirar de la meta",
    message: isContribution
      ? `Elige de qué cuenta saldrá el aporte para “${goal.goalName || "esta meta"}”.`
      : `Elige la cuenta que recibirá el retiro de “${goal.goalName || "esta meta"}”.`,
    confirmLabel: isContribution ? "Aportar" : "Retirar",
    requestAccount: true,
    requestAmount: true,
    accountLabel: isContribution ? "Cuenta de origen" : "Cuenta de destino",
    amountLabel: isContribution ? "Monto a aportar" : "Monto a retirar",
  });

  if (
    !decision.confirmed ||
    !validAccounts.has(decision.accountId) ||
    !Number.isFinite(decision.amount) ||
    decision.amount <= 0
  ) {
    return;
  }

  if (!isContribution && decision.amount > currentSaved) {
    await requestConfirmation({
      title: "Monto no disponible",
      message: `Puedes retirar como máximo ${formatCurrency(currentSaved)} de esta meta.`,
      confirmLabel: "Entendido",
    });
    return;
  }

  let releaseDebitReservation = () => {};
  if (isContribution) {
    const reservation = reserveAccountDebit(
      decision.accountId,
      decision.amount,
    );
    if (!reservation) {
      return;
    }
    releaseDebitReservation = reservation;
  }

  const restoreButton = setButtonLoading(
    triggerButton,
    isContribution ? "Aportando" : "Retirando",
  );

  try {
    const batch = writeBatch(db);
    const accountReference = doc(
      db,
      "accounts",
      decision.accountId,
    );
    const transactionReference = doc(collection(db, "transactions"));

    batch.update(accountReference, {
      balance: increment(isContribution ? -decision.amount : decision.amount),
    });
    batch.update(goalDocument.ref, {
      currentSaved: increment(
        isContribution ? decision.amount : -decision.amount,
      ),
    });
    batch.set(
      transactionReference,
      createSavingsGoalMovementTransactionData(
        goal,
        goalDocument.id,
        decision.accountId,
        decision.amount,
        movement,
      ),
    );

    await batch.commit();
    showToast(
      isContribution
        ? "Aporte y movimiento registrados"
        : "Retiro y movimiento registrados",
      "success",
    );
  } catch (error) {
    console.error(
      isContribution
        ? "No se pudo registrar el aporte."
        : "No se pudo registrar el retiro.",
      error,
    );
  } finally {
    releaseDebitReservation();
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}
