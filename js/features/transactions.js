import {
  collection,
  db,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  writeBatch,
} from "../../firebase-config.js";
import {
  GEMINI_LAST_ROAST_STORAGE_KEY,
  GEMINI_MIN_REQUEST_INTERVAL_MS,
  GEMINI_ROAST_INTERVAL_MS,
  RECENT_TRANSACTIONS_PAGE_SIZE,
  activeTypeClasses,
  allTypeStateClasses,
  categoriesByType,
  categoryIcons,
  inactiveTypeClasses,
  transactionDateFormatter,
  transactionDetailDateFormatter,
  validAccounts,
  validTransactionTypes,
} from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  getStoredNumber,
  setStoredNumber,
} from "../core/storage.js";
import {
  escapeHtml,
  formatCurrency,
  getAccountLabel,
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
import { getRecentTransactionsQuery } from "../services/firestore/repositories.js";
import {
  getTransactionSortTimestamp,
  roundCurrencyAmount,
} from "../services/analytics.js";
import {
  getGeminiCooldownRemaining,
  requestGemini,
} from "../services/gemini.js";
import {
  buildLocalExpenseRoast,
  compactAiText,
} from "../services/smartParsing.js";

export function reserveAccountDebit(accountId, amount) {
  if (
    !state.accountsReady ||
    !validAccounts.has(accountId) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showErrorToast(
      `No se pudo verificar el saldo de ${getAccountLabel(accountId)}.`,
    );
    return null;
  }

  const balance = Number(state.accountBalances[accountId]) || 0;
  const pendingDebit =
    Number(state.pendingAccountDebits[accountId]) || 0;
  const availableBalance = Math.max(0, balance - pendingDebit);

  if (amount > availableBalance) {
    showErrorToast(
      `Saldo insuficiente en ${getAccountLabel(accountId)}`,
    );
    return null;
  }

  state.pendingAccountDebits[accountId] = pendingDebit + amount;
  let isReleased = false;

  return () => {
    if (isReleased) {
      return;
    }

    isReleased = true;
    state.pendingAccountDebits[accountId] = Math.max(
      0,
      (Number(state.pendingAccountDebits[accountId]) || 0) - amount,
    );
  };
}

function updateCategoryOptions(type) {
  const categories = categoriesByType[type] ?? [];

  dom.transactionCategory.innerHTML = "";
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    dom.transactionCategory.append(option);
  });
}

function updateTransactionTypeButtons(type) {
  document
    .querySelectorAll("#transaction-modal [data-transaction-type]")
    .forEach((button) => {
      const isActive = button.dataset.transactionType === type;

      button.classList.remove(...allTypeStateClasses);
      button.classList.add(
        ...(isActive ? activeTypeClasses[type] : inactiveTypeClasses),
      );
      button.setAttribute("aria-pressed", String(isActive));
    });
}

export function setTransactionType(type) {
  const selectedType = validTransactionTypes.has(type) ? type : "expense";
  const isTransfer = selectedType === "transfer";

  dom.transactionType.value = selectedType;
  updateTransactionTypeButtons(selectedType);
  updateCategoryOptions(selectedType);

  dom.standardTransactionFields.classList.toggle("hidden", isTransfer);
  dom.transferSwapField.classList.toggle("hidden", !isTransfer);
  dom.transactionNoteField.classList.toggle(
    "hidden",
    selectedType !== "expense",
  );
  dom.transactionCategory.required = !isTransfer;
  dom.transactionAccount.required = !isTransfer;

  if (isTransfer) {
    dom.transferSourceAccount.value = "efectivo";
    dom.transferDestinationAccount.value = "yape";
    renderTransferAccounts();
  }

  setInlineError(dom.transactionFormError);
}

function renderTransferAccounts() {
  dom.transferSourceLabel.textContent = getAccountLabel(
    dom.transferSourceAccount.value,
  );
  dom.transferDestinationLabel.textContent = getAccountLabel(
    dom.transferDestinationAccount.value,
  );
}

export function swapTransferAccounts() {
  const previousSource = dom.transferSourceAccount.value;

  dom.transferSourceAccount.value = dom.transferDestinationAccount.value;
  dom.transferDestinationAccount.value = previousSource;
  renderTransferAccounts();

  const icon = dom.transferSwapButton.querySelector("i");
  icon?.classList.toggle("rotate-180");
}

export function openTransactionModal() {
  dom.transactionForm.reset();
  setTransactionType("expense");
  dom.fab.setAttribute("aria-expanded", "true");
  openBottomSheet(
    dom.transactionModal,
    dom.transactionPanel,
    dom.transactionAmount,
  );
}

export function closeTransactionModal() {
  dom.fab.setAttribute("aria-expanded", "false");
  closeBottomSheet(dom.transactionModal, dom.transactionPanel, dom.fab);
}

function getTransactionTheme(transaction) {
  if (transaction.type === "transfer") {
    return {
      border: "border-blue-400/15",
      barBackground: "bg-blue-400",
      iconBorder: "border-blue-400/20",
      iconBackground: "bg-blue-400/10",
      iconText: "text-blue-300",
      amountText: "text-blue-300",
      glow: "shadow-[0_0_12px_rgba(96,165,250,0.75)]",
      cardGlow:
        "shadow-[0_18px_45px_rgba(0,0,0,0.25),0_0_28px_rgba(59,130,246,0.05),inset_0_1px_0_rgba(255,255,255,0.08)]",
    };
  }

  if (transaction.type === "income") {
    return {
      border: "border-emerald-400/15",
      barBackground: "bg-emerald-400",
      iconBorder: "border-emerald-400/20",
      iconBackground: "bg-emerald-400/10",
      iconText: "text-emerald-300",
      amountText: "text-emerald-400",
      glow: "shadow-[0_0_12px_rgba(52,211,153,0.75)]",
      cardGlow:
        "shadow-[0_18px_45px_rgba(0,0,0,0.25),0_0_28px_rgba(16,185,129,0.05),inset_0_1px_0_rgba(255,255,255,0.08)]",
    };
  }

  if (transaction.category === "Fitness" || transaction.category === "Otros") {
    return {
      border: "border-orange-400/15",
      barBackground: "bg-orange-400",
      iconBorder: "border-orange-400/20",
      iconBackground: "bg-orange-400/10",
      iconText: "text-orange-300",
      amountText: "text-orange-400",
      glow: "shadow-[0_0_12px_rgba(251,146,60,0.75)]",
      cardGlow:
        "shadow-[0_18px_45px_rgba(0,0,0,0.25),0_0_28px_rgba(249,115,22,0.05),inset_0_1px_0_rgba(255,255,255,0.08)]",
    };
  }

  return {
    border: "border-rose-400/15",
    barBackground: "bg-rose-400",
    iconBorder: "border-rose-400/20",
    iconBackground: "bg-rose-400/10",
    iconText: "text-rose-300",
    amountText: "text-rose-400",
    glow: "shadow-[0_0_12px_rgba(251,113,133,0.75)]",
    cardGlow:
      "shadow-[0_18px_45px_rgba(0,0,0,0.25),0_0_28px_rgba(244,63,94,0.05),inset_0_1px_0_rgba(255,255,255,0.08)]",
  };
}

function getTransactionIcon(transaction) {
  if (transaction.type === "transfer") {
    return "fa-right-left";
  }

  if (Object.hasOwn(categoryIcons, transaction.category)) {
    return categoryIcons[transaction.category];
  }

  return transaction.type === "income"
    ? "fa-arrow-trend-up"
    : "fa-arrow-trend-down";
}

function formatTransactionDate(timestamp, hasPendingWrites) {
  if (hasPendingWrites || !timestamp || typeof timestamp.toDate !== "function") {
    return "Sincronizando...";
  }

  return transactionDateFormatter.format(timestamp.toDate());
}

function formatTransactionDetailDate(timestamp, hasPendingWrites) {
  if (hasPendingWrites || !timestamp || typeof timestamp.toDate !== "function") {
    return "Sincronizando fecha y hora...";
  }

  return transactionDetailDateFormatter.format(timestamp.toDate());
}

export function openTransactionDetail(transactionDocument, triggerElement) {
  const transaction = transactionDocument.data();
  const type = String(transaction.type);
  const amount = Math.abs(Number(transaction.amount) || 0);
  const isTransfer = type === "transfer";
  const isIncome = type === "income";
  const accountId = transaction.accountId ?? transaction.account_id;
  const sourceAccountId =
    transaction.sourceAccountId ?? transaction.source_account_id;
  const destinationAccountId =
    transaction.destinationAccountId ?? transaction.destination_account_id;
  const theme = getTransactionTheme(transaction);

  dom.transactionDetailTitle.textContent = isTransfer
    ? "Transferencia"
    : isIncome
      ? "Ingreso"
      : "Gasto";
  dom.transactionDetailAmount.className =
    `mt-6 text-3xl font-bold tracking-tight ${theme.amountText}`;
  dom.transactionDetailAmount.textContent = `${
    isTransfer ? "" : isIncome ? "+ " : "− "
  }${formatCurrency(amount)}`;
  dom.transactionDetailCategory.textContent = isTransfer
    ? "No aplica"
    : String(transaction.category || "Otros");
  dom.transactionDetailAccount.textContent = isTransfer
    ? `${getAccountLabel(sourceAccountId)} → ${getAccountLabel(destinationAccountId)}`
    : getAccountLabel(accountId);
  dom.transactionDetailDate.textContent = formatTransactionDetailDate(
    transaction.createdAt,
    transactionDocument.metadata.hasPendingWrites,
  );
  dom.transactionDetailNote.textContent =
    String(transaction.note ?? "").trim() || "Sin nota";

  state.transactionDetailId = transactionDocument.id;
  state.transactionDetailTrigger = triggerElement;
  openBottomSheet(
    dom.transactionDetailModal,
    dom.transactionDetailPanel,
    dom.transactionDetailClose,
  );
}

export function closeTransactionDetail() {
  const returnFocus = state.transactionDetailTrigger?.isConnected
    ? state.transactionDetailTrigger
    : null;

  state.transactionDetailId = null;
  state.transactionDetailTrigger = null;
  closeBottomSheet(
    dom.transactionDetailModal,
    dom.transactionDetailPanel,
    returnFocus,
  );
}

function createTransactionCard(transactionDocument) {
  const transaction = transactionDocument.data();
  const theme = getTransactionTheme(transaction);
  const amount = Math.abs(Number(transaction.amount) || 0);
  const isTransfer = transaction.type === "transfer";
  const isIncome = transaction.type === "income";
  const fallbackTitle = isTransfer
    ? "Transferencia"
    : isIncome
      ? "Ingreso"
      : "Gasto";
  const title = transaction.note?.trim() || fallbackTitle;
  const accountId = transaction.accountId ?? transaction.account_id;
  const sourceAccountId =
    transaction.sourceAccountId ?? transaction.source_account_id;
  const destinationAccountId =
    transaction.destinationAccountId ?? transaction.destination_account_id;
  const metadata = isTransfer
    ? `${getAccountLabel(sourceAccountId)} → ${getAccountLabel(destinationAccountId)}`
    : `${transaction.category || "Otros"} · ${getAccountLabel(accountId)}`;
  const sign = isTransfer ? "" : isIncome ? "+ " : "− ";
  const dateLabel = formatTransactionDate(
    transaction.createdAt,
    transactionDocument.metadata.hasPendingWrites,
  );

  return `
    <article
      role="button"
      tabindex="0"
      data-view-transaction="${escapeHtml(transactionDocument.id)}"
      aria-label="Ver detalle de ${escapeHtml(fallbackTitle.toLowerCase())}"
      class="relative cursor-pointer overflow-hidden rounded-3xl border ${theme.border} bg-white/[0.055] p-4 ${theme.cardGlow} backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/25 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-blue-400/30"
    >
      <div class="absolute inset-y-5 left-0 w-0.5 rounded-full ${theme.barBackground} ${theme.glow}"></div>
      <div class="flex items-center gap-4">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${theme.iconBorder} ${theme.iconBackground} ${theme.iconText}">
          <i class="fa-solid ${getTransactionIcon(transaction)}" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="truncate font-semibold text-slate-100">${escapeHtml(title)}</h3>
              <p class="mt-1 text-sm text-slate-400">${escapeHtml(metadata)}</p>
            </div>
            <div class="flex shrink-0 items-start gap-1">
              <p data-sensitive-amount class="whitespace-nowrap pt-2 font-semibold ${theme.amountText}">
                ${sign}${formatCurrency(amount)}
              </p>
              <button
                type="button"
                data-delete-transaction="${escapeHtml(transactionDocument.id)}"
                aria-label="Eliminar transacción"
                class="cursor-pointer p-2 text-slate-600 transition-colors hover:text-rose-400"
              >
                <i class="fa-regular fa-trash-can pointer-events-none" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500">${escapeHtml(dateLabel)}</p>
        </div>
      </div>
    </article>
  `;
}

export function renderEmptyTransactions() {
  dom.transactionsList.innerHTML = `
    <div class="rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-10 text-center backdrop-blur-md">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
        <i class="fa-solid fa-receipt" aria-hidden="true"></i>
      </div>
      <p class="mt-4 font-medium text-slate-300">Aún no hay transacciones</p>
      <p class="mt-1 text-sm text-slate-500">Usa el botón central para registrar la primera.</p>
    </div>
  `;
}

export async function deleteTransaction(transactionDocument, triggerButton) {
  const transaction = transactionDocument.data();
  const amount = Math.abs(Number(transaction.amount));
  const type = String(transaction.type);

  const decision = await requestConfirmation({
    title: "Eliminar transacción",
    message:
      "El movimiento se eliminará y el saldo de las cuentas se revertirá automáticamente.",
    confirmLabel: "Eliminar",
    tone: "danger",
  });

  if (!decision.confirmed) {
    return;
  }

  if (
    !validTransactionTypes.has(type) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    console.error("La transacción no contiene datos válidos para revertirla.");
    return;
  }

  const restoreButton = setButtonLoading(triggerButton, "");
  let releaseDebitReservation = () => {};

  try {
    const batch = writeBatch(db);
    batch.delete(transactionDocument.ref);

    if (type === "transfer") {
      const sourceAccountId = String(
        transaction.sourceAccountId ?? transaction.source_account_id ?? "",
      );
      const destinationAccountId = String(
        transaction.destinationAccountId ??
          transaction.destination_account_id ??
          "",
      );

      if (
        !validAccounts.has(sourceAccountId) ||
        !validAccounts.has(destinationAccountId) ||
        sourceAccountId === destinationAccountId
      ) {
        throw new Error("Cuentas de transferencia inválidas.");
      }

      const reservation = reserveAccountDebit(
        destinationAccountId,
        amount,
      );
      if (!reservation) {
        return;
      }
      releaseDebitReservation = reservation;

      batch.update(doc(db, "accounts", sourceAccountId), {
        balance: increment(amount),
      });
      batch.update(doc(db, "accounts", destinationAccountId), {
        balance: increment(-amount),
      });
    } else {
      const accountId = String(
        transaction.accountId ?? transaction.account_id ?? "",
      );

      if (!validAccounts.has(accountId)) {
        throw new Error("Cuenta de transacción inválida.");
      }

      if (type === "income") {
        const reservation = reserveAccountDebit(accountId, amount);
        if (!reservation) {
          return;
        }
        releaseDebitReservation = reservation;
      }

      batch.update(doc(db, "accounts", accountId), {
        balance: increment(type === "expense" ? amount : -amount),
      });
    }

    await batch.commit();
  } catch (error) {
    console.error("No se pudo eliminar la transacción.", error);
  } finally {
    releaseDebitReservation();
    if (triggerButton.isConnected) {
      restoreButton();
    }
  }
}

export async function registerTransactionAtomic(transaction) {
  const type = String(transaction.type);
  const amount = Number(transaction.amount);
  const note =
    type === "expense"
      ? String(transaction.note ?? "").trim().slice(0, 500)
      : "";
  let releaseDebitReservation = () => {};

  if (
    !validTransactionTypes.has(type) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error("Tipo o monto de transacción inválido.");
  }

  try {
    const batch = writeBatch(db);
    const transactionReference = doc(collection(db, "transactions"));

    if (type === "transfer") {
      const sourceAccountId = String(transaction.sourceAccountId);
      const destinationAccountId = String(
        transaction.destinationAccountId,
      );

      if (
        !validAccounts.has(sourceAccountId) ||
        !validAccounts.has(destinationAccountId) ||
        sourceAccountId === destinationAccountId
      ) {
        throw new Error("Origen y destino deben ser cuentas diferentes.");
      }

      const reservation = reserveAccountDebit(sourceAccountId, amount);
      if (!reservation) {
        return false;
      }
      releaseDebitReservation = reservation;

      batch.set(transactionReference, {
        type,
        amount,
        sourceAccountId,
        destinationAccountId,
        note: "",
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "accounts", sourceAccountId), {
        balance: increment(-amount),
      });
      batch.update(doc(db, "accounts", destinationAccountId), {
        balance: increment(amount),
      });
    } else {
      const accountId = String(transaction.accountId);
      const category = String(transaction.category);

      if (
        !validAccounts.has(accountId) ||
        !categoriesByType[type]?.includes(category)
      ) {
        throw new Error("Cuenta o categoría de transacción inválida.");
      }

      if (type === "expense") {
        const reservation = reserveAccountDebit(accountId, amount);
        if (!reservation) {
          return false;
        }
        releaseDebitReservation = reservation;
      }

      batch.set(transactionReference, {
        type,
        amount,
        accountId,
        category,
        note,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "accounts", accountId), {
        balance: increment(type === "income" ? amount : -amount),
      });
    }

    await batch.commit();

    if (type === "expense") {
      void requestExpenseRoast({ amount, category: transaction.category });
    }

    return true;
  } finally {
    releaseDebitReservation();
  }
}

export async function handleTransactionSubmit(event) {
  event.preventDefault();

  if (state.manualTransactionSubmitting) {
    return;
  }

  setInlineError(dom.transactionFormError);

  const formData = new FormData(dom.transactionForm);
  const type = String(formData.get("type"));
  const amount = Number.parseFloat(String(formData.get("amount")));

  if (
    !validTransactionTypes.has(type) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    setInlineError(dom.transactionFormError, "Revisa el tipo y el monto.");
    return;
  }

  const transaction =
    type === "transfer"
      ? {
          type,
          amount,
          sourceAccountId: String(formData.get("source_account_id")),
          destinationAccountId: String(
            formData.get("destination_account_id"),
          ),
        }
      : {
          type,
          amount,
          accountId: String(formData.get("account_id")),
          category: String(formData.get("category")),
          note:
            type === "expense"
              ? String(formData.get("note") ?? "").trim()
              : "",
        };

  const submitButton = dom.transactionForm.querySelector(
    'button[type="submit"]',
  );
  state.manualTransactionSubmitting = true;
  const restoreButton = setButtonLoading(submitButton, "Registrando");

  try {
    const wasRegistered = await registerTransactionAtomic(transaction);
    if (wasRegistered) {
      closeTransactionModal();
    }
  } catch (error) {
    console.error("No se pudo registrar la transacción.", error);
    setInlineError(
      dom.transactionFormError,
      "No se pudo registrar. Revisa los datos e inténtalo nuevamente.",
    );
  } finally {
    state.manualTransactionSubmitting = false;
    restoreButton();
  }
}

async function requestExpenseRoast({ amount, category }) {
  if (amount <= 100 && category !== "Social") {
    return;
  }

  const now = Date.now();
  const lastAiRoastAt = getStoredNumber(
    GEMINI_LAST_ROAST_STORAGE_KEY,
  );
  const geminiWasJustUsed =
    now - state.geminiLastRequestAt <
    GEMINI_MIN_REQUEST_INTERVAL_MS * 2;
  const roastIsThrottled =
    now - lastAiRoastAt < GEMINI_ROAST_INTERVAL_MS;
  const quotaIsCoolingDown = getGeminiCooldownRemaining() > 0;

  if (
    geminiWasJustUsed ||
    roastIsThrottled ||
    quotaIsCoolingDown ||
    state.geminiPendingRequests.size > 0
  ) {
    window.setTimeout(() => {
      showToast(buildLocalExpenseRoast(amount, category), "warning");
    }, 1400);
    return;
  }

  const savingsGoalNames = [...state.savingsGoals.values()]
    .map((goalDocument) =>
      String(goalDocument.data().goalName ?? "").trim(),
    )
    .filter(Boolean);
  const additionalGoals =
    savingsGoalNames.length > 0
      ? ` y también ${savingsGoalNames.join(", ")}`
      : "";
  const prompt = `
El usuario Alan acaba de gastar ${formatCurrency(amount)} en ${category}.
Sabiendo que tiene metas de ahorro como un iPhone${additionalGoals}, escribe un consejo directo, crudo y sutilmente irónico sobre cómo esto impacta su meta.
Responde con una sola oración de máximo 120 caracteres, sin markdown, viñetas ni saltos de línea.
  `.trim();

  try {
    setStoredNumber(GEMINI_LAST_ROAST_STORAGE_KEY, now);
    const advice = await requestGemini(prompt, {
      feature: "expense-roast",
      maxOutputTokens: 256,
      thinkingLevel: "minimal",
    });
    const singleLineAdvice = compactAiText(advice, 120);

    if (singleLineAdvice) {
      showToast(singleLineAdvice, "warning");
    }
  } catch (error) {
    if (!error.isGeminiHandled) {
      console.error("No se pudo generar el consejo financiero.", error);
      window.setTimeout(() => {
        showToast(buildLocalExpenseRoast(amount, category), "warning");
      }, 400);
    }
  }
}

export function renderBalanceSummary() {
  const balances = state.accountBalances;
  const accountTotal = roundCurrencyAmount(
    Number(balances.yape) + Number(balances.efectivo),
  );

  dom.yapeBalance.textContent = formatCurrency(balances.yape);
  dom.cashBalance.textContent = formatCurrency(balances.efectivo);
  dom.totalBalance.textContent = formatCurrency(accountTotal);
}

function appendTransactionCards(transactionDocuments) {
  const fragment = document.createDocumentFragment();
  transactionDocuments.forEach((transactionDocument) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = createTransactionCard(transactionDocument);
    const card = wrapper.firstElementChild;
    if (card) {
      fragment.appendChild(card);
    }
  });
  dom.transactionsList.appendChild(fragment);
}

function insertTransactionCard(transactionDocument) {
  const timestamp = getTransactionSortTimestamp(transactionDocument);
  let insertIndex = 0;
  while (
    insertIndex < state.recentLoadedTransactions.length &&
    getTransactionSortTimestamp(
      state.recentLoadedTransactions[insertIndex],
    ) > timestamp
  ) {
    insertIndex += 1;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = createTransactionCard(transactionDocument);
  const card = wrapper.firstElementChild;
  if (!card) {
    return;
  }

  const referenceNode =
    dom.transactionsList.children[insertIndex] ?? null;
  dom.transactionsList.insertBefore(card, referenceNode);
  state.recentLoadedTransactions.splice(insertIndex, 0, transactionDocument);
  state.recentLoadedTransactionIds.add(transactionDocument.id);
}

function removeTransactionCard(transactionId) {
  const cardIndex = state.recentLoadedTransactions.findIndex(
    (transactionDocument) => transactionDocument.id === transactionId,
  );
  if (cardIndex < 0) {
    return;
  }

  dom.transactionsList.children[cardIndex]?.remove();
  state.recentLoadedTransactions.splice(cardIndex, 1);
  state.recentLoadedTransactionIds.delete(transactionId);
}

export function updateLoadMoreButton() {
  const hasCards = state.recentLoadedTransactions.length > 0;
  const showButton = hasCards && state.recentTransactionsHasMore;

  dom.loadMoreTransactionsButton.classList.toggle("hidden", !showButton);
  dom.loadMoreTransactionsButton.disabled =
    state.recentTransactionsLoadingMore;
  dom.loadMoreTransactionsIcon.className =
    state.recentTransactionsLoadingMore
      ? "fa-solid fa-circle-notch fa-spin"
      : "fa-solid fa-chevron-down";
  dom.loadMoreTransactionsLabel.textContent =
    state.recentTransactionsLoadingMore
      ? "Cargando..."
      : "Ver más transacciones";
}

export async function loadRecentTransactionsPage({ reset = false } = {}) {
  if (state.recentTransactionsLoadingMore) {
    return;
  }

  state.recentTransactionsLoadingMore = true;
  updateLoadMoreButton();

  try {
    const pageSnapshot = await getDocs(
      getRecentTransactionsQuery(
        reset ? null : state.recentTransactionsCursor,
      ),
    );
    const pageDocuments = [...pageSnapshot.docs];

    if (reset) {
      dom.transactionsList.innerHTML = "";
      state.recentLoadedTransactions = [];
      state.recentLoadedTransactionIds.clear();
    }

    const newDocuments = pageDocuments.filter(
      (transactionDocument) =>
        !state.recentLoadedTransactionIds.has(transactionDocument.id),
    );

    appendTransactionCards(newDocuments);
    newDocuments.forEach((transactionDocument) => {
      state.recentLoadedTransactionIds.add(transactionDocument.id);
      state.recentLoadedTransactions.push(transactionDocument);
    });

    state.recentTransactionsCursor =
      pageSnapshot.docs[pageSnapshot.docs.length - 1] ?? null;
    state.recentTransactionsHasMore =
      pageDocuments.length >= RECENT_TRANSACTIONS_PAGE_SIZE;
  } catch (error) {
    console.error("No se pudieron cargar las transacciones recientes.", error);
    showErrorToast("No se pudieron cargar las transacciones.");
  } finally {
    state.recentTransactionsLoadingMore = false;
    updateLoadMoreButton();
  }
}

export function syncRecentTransactionsList(snapshotDocuments) {
  const snapshotIds = new Set(
    snapshotDocuments.map((transactionDocument) => transactionDocument.id),
  );

  for (const loadedId of [...state.recentLoadedTransactionIds]) {
    if (!snapshotIds.has(loadedId)) {
      removeTransactionCard(loadedId);
    }
  }

  let hasRealCards = state.recentLoadedTransactions.length > 0;
  snapshotDocuments.forEach((transactionDocument) => {
    if (state.recentLoadedTransactionIds.has(transactionDocument.id)) {
      return;
    }
    if (!hasRealCards) {
      dom.transactionsList.innerHTML = "";
      hasRealCards = true;
    }
    insertTransactionCard(transactionDocument);
  });

  updateLoadMoreButton();
}
