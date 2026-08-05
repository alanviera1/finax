import {
  Timestamp,
  collection,
  db,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "../../firebase-config.js";
import {
  validAccounts,
  validDebtTypes,
} from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  escapeHtml,
  formatCurrency,
} from "../core/utils.js";
import { shortDateFormatter } from "../core/constants.js";
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
import { createDebtSettlementTransactionData } from "../services/firestore/repositories.js";
import { reserveAccountDebit } from "./transactions.js";

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const parts = String(value).split("-").map(Number);

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function addCalendarMonthsClamped(value, monthCount) {
  const date = new Date(value);
  const targetMonth = date.getMonth() + monthCount;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(
    targetYear,
    normalizedMonth + 1,
    0,
    12,
  ).getDate();

  return new Date(
    targetYear,
    normalizedMonth,
    Math.min(date.getDate(), lastTargetDay),
    12,
  );
}

function getDebtDateBounds(now = new Date()) {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
  );

  return {
    minimum: today,
    maximum: addCalendarMonthsClamped(today, 18),
  };
}

export function applyDebtDateBounds() {
  const { minimum, maximum } = getDebtDateBounds();
  const minimumValue = toDateInputValue(minimum);
  const maximumValue = toDateInputValue(maximum);

  [dom.debtDateLent, dom.debtExpectedDate].forEach((input) => {
    input.min = minimumValue;
    input.max = maximumValue;
  });

  return { minimum, maximum };
}

function getDebtDateValidationMessage(dateLent, expectedPayDate) {
  if (!dateLent || !expectedPayDate) {
    return "Selecciona ambas fechas.";
  }

  const { minimum, maximum } = getDebtDateBounds();
  const isOutsideBounds = [dateLent, expectedPayDate].some(
    (date) => date < minimum || date > maximum,
  );

  if (isOutsideBounds) {
    return "Las fechas deben estar entre hoy y los próximos 18 meses.";
  }

  if (expectedPayDate < dateLent) {
    return "La fecha esperada no puede ser anterior a la fecha inicial.";
  }

  return "";
}

function validateDebtDateInputs({ showMessage = false } = {}) {
  applyDebtDateBounds();
  const dateLent = parseDateInput(dom.debtDateLent.value);
  const expectedPayDate = parseDateInput(dom.debtExpectedDate.value);
  const message = getDebtDateValidationMessage(
    dateLent,
    expectedPayDate,
  );

  dom.debtDateLent.setCustomValidity(message);
  dom.debtExpectedDate.setCustomValidity(message);
  if (showMessage) {
    setInlineError(dom.debtFormError, message);
  }

  return !message;
}

export function handleDebtDateInput() {
  const hasBothDates =
    Boolean(dom.debtDateLent.value) &&
    Boolean(dom.debtExpectedDate.value);

  validateDebtDateInputs({ showMessage: hasBothDates });
  if (!hasBothDates) {
    setInlineError(dom.debtFormError);
  }
}

export function openDebtModal() {
  dom.debtForm.reset();
  const { minimum: today } = applyDebtDateBounds();
  const expectedDate = addCalendarMonthsClamped(today, 1);
  dom.debtDateLent.value = toDateInputValue(today);
  dom.debtExpectedDate.value = toDateInputValue(expectedDate);
  validateDebtDateInputs();
  setInlineError(dom.debtFormError);
  openBottomSheet(dom.debtModal, dom.debtPanel, dom.debtPersonName);
}

export function closeDebtModal() {
  closeBottomSheet(dom.debtModal, dom.debtPanel, dom.newDebtButton);
}

function formatDebtDate(value) {
  if (!value || typeof value.toDate !== "function") {
    return "Fecha pendiente";
  }

  return shortDateFormatter.format(value.toDate());
}

function createDebtCard(debtDocument) {
  const debt = debtDocument.data();
  const isReceivable = debt.type === "receivable";
  const tone = isReceivable
    ? {
        border: "border-emerald-400/15",
        iconBackground: "bg-emerald-400/10",
        iconText: "text-emerald-300",
        amountText: "text-emerald-300",
        icon: "fa-hand-holding-dollar",
      }
    : {
        border: "border-orange-400/15",
        iconBackground: "bg-orange-400/10",
        iconText: "text-orange-300",
        amountText: "text-orange-300",
        icon: "fa-file-invoice-dollar",
      };

  return `
    <article class="rounded-3xl border ${tone.border} bg-white/[0.05] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-md">
      <div class="flex items-start gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.iconBackground} ${tone.iconText}">
          <i class="fa-solid ${tone.icon}" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate font-semibold text-slate-100">${escapeHtml(debt.personName || "Sin nombre")}</h3>
              <p class="mt-1 text-xs text-slate-500">
                Esperado: ${escapeHtml(formatDebtDate(debt.expectedPayDate))}
              </p>
            </div>
            <p data-sensitive-amount class="whitespace-nowrap font-semibold ${tone.amountText}">
              ${formatCurrency(debt.amount)}
            </p>
          </div>
          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-xs text-slate-500">
              Desde ${escapeHtml(formatDebtDate(debt.dateLent))}
            </p>
            <div class="flex items-center gap-2">
              <button
                type="button"
                data-settle-debt="${escapeHtml(debtDocument.id)}"
                class="rounded-xl border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-400/15"
              >
                Saldar
              </button>
              <button
                type="button"
                data-delete-debt="${escapeHtml(debtDocument.id)}"
                aria-label="Eliminar deuda"
                class="cursor-pointer p-2 text-slate-600 transition-colors hover:text-rose-400"
              >
                <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function updateDebtTabButtons() {
  dom.debtTabButtons.forEach((button) => {
    const isActive = button.dataset.debtTab === state.activeDebtTab;

    button.classList.remove(
      "bg-emerald-400/10",
      "text-emerald-300",
      "bg-orange-400/10",
      "text-orange-300",
      "text-slate-500",
    );

    if (isActive) {
      button.classList.add(
        ...(state.activeDebtTab === "receivable"
          ? ["bg-emerald-400/10", "text-emerald-300"]
          : ["bg-orange-400/10", "text-orange-300"]),
      );
    } else {
      button.classList.add("text-slate-500");
    }

    button.setAttribute("aria-pressed", String(isActive));
  });
}

export function renderDebts() {
  const pendingDebts = [...state.debts.values()].filter(
    (debtDocument) => debtDocument.data().status === "pending",
  );
  const receivableDebts = pendingDebts.filter(
    (debtDocument) => debtDocument.data().type === "receivable",
  );
  const payableDebts = pendingDebts.filter(
    (debtDocument) => debtDocument.data().type === "payable",
  );

  const receivableTotal = receivableDebts.reduce(
    (total, debtDocument) => total + (Number(debtDocument.data().amount) || 0),
    0,
  );
  const payableTotal = payableDebts.reduce(
    (total, debtDocument) => total + (Number(debtDocument.data().amount) || 0),
    0,
  );

  dom.receivableDebtCount.textContent = String(receivableDebts.length);
  dom.payableDebtCount.textContent = String(payableDebts.length);
  dom.receivableDebtTotal.textContent = formatCurrency(receivableTotal);
  dom.payableDebtTotal.textContent = formatCurrency(payableTotal);
  updateDebtTabButtons();

  const visibleDebts =
    state.activeDebtTab === "receivable"
      ? receivableDebts
      : payableDebts;

  if (visibleDebts.length === 0) {
    dom.debtsList.innerHTML = `
      <div class="rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-10 text-center">
        <i class="fa-solid fa-circle-check text-2xl text-blue-300" aria-hidden="true"></i>
        <p class="mt-3 font-medium text-slate-300">No hay deudas pendientes</p>
        <p class="mt-1 text-sm text-slate-500">Los nuevos registros aparecerán aquí.</p>
      </div>
    `;
    return;
  }

  dom.debtsList.innerHTML = visibleDebts.map(createDebtCard).join("");
}

export async function handleDebtSubmit(event) {
  event.preventDefault();
  setInlineError(dom.debtFormError);

  const formData = new FormData(dom.debtForm);
  const type = String(formData.get("type"));
  const personName = String(formData.get("personName") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount")));
  const dateLent = parseDateInput(formData.get("dateLent"));
  const expectedPayDate = parseDateInput(formData.get("expectedPayDate"));
  const accountId = String(formData.get("account_id"));

  if (
    !validDebtTypes.has(type) ||
    !validAccounts.has(accountId) ||
    !personName ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !dateLent ||
    !expectedPayDate
  ) {
    setInlineError(dom.debtFormError, "Completa todos los datos correctamente.");
    return;
  }

  const dateValidationMessage = getDebtDateValidationMessage(
    dateLent,
    expectedPayDate,
  );
  if (dateValidationMessage) {
    dom.debtDateLent.setCustomValidity(dateValidationMessage);
    dom.debtExpectedDate.setCustomValidity(dateValidationMessage);
    setInlineError(dom.debtFormError, dateValidationMessage);
    return;
  }

  const isReceivable = type === "receivable";
  let releaseDebitReservation = () => {};

  if (isReceivable) {
    const reservation = reserveAccountDebit(accountId, amount);
    if (!reservation) {
      setInlineError(
        dom.debtFormError,
        "Fondos insuficientes en la cuenta seleccionada.",
      );
      return;
    }
    releaseDebitReservation = reservation;
  }

  const submitButton = dom.debtForm.querySelector('button[type="submit"]');
  const restoreButton = setButtonLoading(submitButton, "Guardando");

  try {
    const batch = writeBatch(db);
    const debtReference = doc(collection(db, "debts"));
    const transactionReference = doc(collection(db, "transactions"));
    const accountReference = doc(db, "accounts", accountId);

    batch.set(debtReference, {
      type,
      personName,
      amount,
      dateLent: Timestamp.fromDate(dateLent),
      expectedPayDate: Timestamp.fromDate(expectedPayDate),
      status: "pending",
      accountId,
    });

    batch.set(transactionReference, {
      type: isReceivable ? "expense" : "income",
      amount,
      accountId,
      category: isReceivable ? "Préstamo otorgado" : "Préstamo recibido",
      note: isReceivable
        ? `Préstamo a ${personName}`
        : `Préstamo de ${personName}`,
      createdAt: serverTimestamp(),
      source: "debt_creation",
      debtId: debtReference.id,
    });

    batch.update(accountReference, {
      balance: increment(isReceivable ? -amount : amount),
    });

    await batch.commit();
    closeDebtModal();
  } catch (error) {
    console.error("No se pudo crear la deuda.", error);
    setInlineError(
      dom.debtFormError,
      "No se pudo guardar. Inténtalo nuevamente.",
    );
  } finally {
    releaseDebitReservation();
    restoreButton();
  }
}

function getDebtSettlementTransactionId(debtId) {
  return `debt-settlement-${debtId}`;
}

export async function settleDebt(debtDocument, triggerButton) {
  const debt = debtDocument.data();
  const type = String(debt.type);
  const fullAmount = Math.abs(Number(debt.amount));

  if (
    !validDebtTypes.has(type) ||
    !Number.isFinite(fullAmount) ||
    fullAmount <= 0 ||
    debt.status !== "pending"
  ) {
    console.error("La deuda no contiene datos válidos para saldarla.");
    return;
  }

  const decision = await requestConfirmation({
    title: type === "receivable" ? "Registrar cobro" : "Registrar pago",
    message:
      type === "receivable"
        ? `${debt.personName} te pagará ${formatCurrency(fullAmount)}. Ingresa el monto cobrado y elige la cuenta.`
        : `Pagarás ${formatCurrency(fullAmount)} a ${debt.personName}. Ingresa el monto a pagar y elige la cuenta de salida.`,
    confirmLabel: "Registrar",
    requestAccount: true,
    requestAmount: true,
    prefillAmount: fullAmount,
    maxAmount: fullAmount,
  });

  if (!decision.confirmed || !validAccounts.has(decision.accountId)) {
    return;
  }

  const paymentAmount = Number(decision.amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > fullAmount) {
    showErrorToast("El monto ingresado no es válido.");
    return;
  }

  const isPartialPayment = paymentAmount < fullAmount;
  const isFullPayment = paymentAmount === fullAmount;

  let releaseDebitReservation = () => {};
  if (type === "payable") {
    const reservation = reserveAccountDebit(
      decision.accountId,
      paymentAmount,
    );
    if (!reservation) {
      return;
    }
    releaseDebitReservation = reservation;
  }

  const restoreButton = setButtonLoading(triggerButton, "");

  try {
    const batch = writeBatch(db);
    const accountReference = doc(db, "accounts", decision.accountId);
    const balanceChange = type === "receivable" ? paymentAmount : -paymentAmount;
    const personName = String(debt.personName ?? "").trim() || "persona sin nombre";

    if (isPartialPayment) {
      const newDebtAmount = fullAmount - paymentAmount;
      const partialTransactionRef = doc(
        db,
        "transactions",
        `debt-partial-${debtDocument.id}-${Date.now()}`,
      );

      batch.update(debtDocument.ref, {
        amount: newDebtAmount,
      });
      batch.update(accountReference, {
        balance: increment(balanceChange),
      });
      batch.set(partialTransactionRef, {
        type: type === "receivable" ? "income" : "expense",
        amount: paymentAmount,
        accountId: decision.accountId,
        category: type === "receivable" ? "Préstamo cobrado" : "Deuda pagada",
        note: type === "receivable"
          ? `Abono a préstamo de ${personName}`
          : `Abono a deuda con ${personName}`,
        createdAt: serverTimestamp(),
        source: "debt_partial_settlement",
        debtId: debtDocument.id,
      });

      await batch.commit();
      showToast(`Abono de ${formatCurrency(paymentAmount)} registrado. Pendiente: ${formatCurrency(newDebtAmount)}`, "success");
    } else {
      const settlementTransactionRef = doc(
        db,
        "transactions",
        getDebtSettlementTransactionId(debtDocument.id),
      );

      batch.update(debtDocument.ref, {
        status: "paid",
        paidAt: serverTimestamp(),
        settledAccountId: decision.accountId,
        settlementTransactionId: settlementTransactionRef.id,
      });
      batch.update(accountReference, {
        balance: increment(balanceChange),
      });
      batch.set(
        settlementTransactionRef,
        createDebtSettlementTransactionData(
          debt,
          debtDocument.id,
          decision.accountId,
        ),
      );

      await batch.commit();
      showToast("Deuda saldada y movimiento registrado", "success");
    }
  } catch (error) {
    console.error("No se pudo saldar la deuda.", error);
    showErrorToast("No se pudo registrar el pago. Inténtalo nuevamente.");
  } finally {
    releaseDebitReservation();
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}

async function backfillPaidDebtTransaction(debtDocument) {
  const debt = debtDocument.data();
  const accountId = String(debt.settledAccountId ?? "");
  const amount = Math.abs(Number(debt.amount));

  if (
    debt.status !== "paid" ||
    debt.settlementTransactionId ||
    !validDebtTypes.has(debt.type) ||
    !validAccounts.has(accountId) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    state.pendingDebtLedgerBackfills.has(debtDocument.id)
  ) {
    return;
  }

  state.pendingDebtLedgerBackfills.add(debtDocument.id);
  const transactionReference = doc(
    db,
    "transactions",
    getDebtSettlementTransactionId(debtDocument.id),
  );
  const historicalTimestamp =
    debt.paidAt && typeof debt.paidAt.toDate === "function"
      ? debt.paidAt
      : serverTimestamp();

  try {
    const batch = writeBatch(db);
    batch.set(
      transactionReference,
      createDebtSettlementTransactionData(
        debt,
        debtDocument.id,
        accountId,
        historicalTimestamp,
      ),
    );
    batch.update(debtDocument.ref, {
      settlementTransactionId: transactionReference.id,
      ledgerBackfilledAt: serverTimestamp(),
    });
    await batch.commit();
    console.info(
      "[Finax Ledger] Se reconstruyó el movimiento de una deuda pagada.",
      { debtId: debtDocument.id },
    );
  } catch (error) {
    console.error(
      "No se pudo reconstruir la transacción histórica de la deuda.",
      { debtId: debtDocument.id, error },
    );
  } finally {
    state.pendingDebtLedgerBackfills.delete(debtDocument.id);
  }
}

export function backfillPaidDebtTransactions(debtDocuments) {
  debtDocuments.forEach((debtDocument) => {
    void backfillPaidDebtTransaction(debtDocument);
  });
}

export async function deleteDebt(debtDocument, triggerButton) {
  const decision = await requestConfirmation({
    title: "Eliminar registro",
    message: "Se eliminará esta deuda de tus pendientes.",
    confirmLabel: "Eliminar",
    tone: "danger",
  });

  if (!decision.confirmed) return;

  const restoreButton = setButtonLoading(triggerButton, "");
  try {
    const batch = writeBatch(db);
    batch.delete(debtDocument.ref);

    const associatedTransactionsQuery = query(
      collection(db, "transactions"),
      where("debtId", "==", debtDocument.id),
    );
    const associatedTransactionsSnapshot = await getDocs(
      associatedTransactionsQuery,
    );
    associatedTransactionsSnapshot.docs.forEach((transactionDocument) => {
      batch.delete(transactionDocument.ref);
    });

    await batch.commit();
    showToast("Deuda eliminada", "success");
  } catch (error) {
    console.error("No se pudo eliminar la deuda.", error);
    showErrorToast("No se pudo eliminar. Inténtalo nuevamente.");
  } finally {
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}
