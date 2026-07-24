import {
  Timestamp,
  collection,
  db,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "./firebase-config.js";

const BUILD_ID = "20260724-gemini-auth-v2";
const NATIVE_DEBT_NOTIFICATION_KEY = "finax-debt-alert-shown";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 18000;
const GEMINI_API_KEY =
  "";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const validTransactionTypes = new Set(["income", "expense", "transfer"]);
const validAccounts = new Set(["yape", "efectivo"]);
const validDebtTypes = new Set(["receivable", "payable"]);

const categoriesByType = Object.freeze({
  income: ["Trabajo", "Propinas", "Otros"],
  expense: ["Social", "Fitness", "Personal", "Otros"],
  transfer: [],
});

const categoryIcons = Object.freeze({
  Trabajo: "fa-briefcase",
  Propinas: "fa-hand-holding-dollar",
  Social: "fa-user-group",
  Fitness: "fa-dumbbell",
  Personal: "fa-user",
  Ingresos: "fa-arrow-trend-up",
  Otros: "fa-layer-group",
});

const inactiveTypeClasses = [
  "border-white/10",
  "bg-white/[0.04]",
  "text-slate-400",
  "opacity-50",
];

const activeTypeClasses = Object.freeze({
  income: [
    "border-emerald-400/40",
    "bg-emerald-400/10",
    "text-emerald-300",
    "opacity-100",
  ],
  expense: [
    "border-rose-400/40",
    "bg-rose-400/10",
    "text-rose-300",
    "opacity-100",
  ],
  transfer: [
    "border-blue-400/40",
    "bg-blue-400/10",
    "text-blue-300",
    "opacity-100",
  ],
});

const allTypeStateClasses = [
  ...inactiveTypeClasses,
  ...activeTypeClasses.income,
  ...activeTypeClasses.expense,
  ...activeTypeClasses.transfer,
];

const activeNavClasses = ["text-blue-400"];
const inactiveNavClasses = ["text-slate-500"];
const confirmationToneClasses = [
  "border-blue-300/20",
  "bg-blue-500/15",
  "text-blue-300",
  "border-rose-300/20",
  "bg-rose-500/15",
  "text-rose-300",
];
const toastToneClasses = [
  "border-rose-400/20",
  "text-rose-200",
  "bg-rose-400/10",
  "text-rose-300",
  "border-emerald-400/20",
  "text-emerald-200",
  "bg-emerald-400/10",
  "text-emerald-300",
  "border-amber-400/20",
  "text-amber-100",
  "bg-amber-400/10",
  "text-amber-300",
  "border-blue-400/20",
  "text-blue-100",
  "bg-blue-400/10",
  "text-blue-300",
];

const amountFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const transactionDateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dom = {};
const state = {
  initialized: false,
  activeView: "home",
  activeDebtTab: "receivable",
  transactions: new Map(),
  debts: new Map(),
  savingsGoals: new Map(),
  expenseTransactions: [],
  filteredExpenseTransactions: [],
  analysisPeriod: "current",
  accountBalances: {
    yape: 0,
    efectivo: 0,
  },
  pendingAccountDebits: {
    yape: 0,
    efectivo: 0,
  },
  accountsReady: false,
  debtAlerts: [],
  notificationsOpen: false,
  notificationPermission: "default",
  nativeNotificationShown: false,
  sheetTimers: new WeakMap(),
  confirmationResolver: null,
  confirmationTimer: null,
  toastTimer: null,
  expenseChart: null,
  speechRecognition: null,
  speechListening: false,
  serviceWorkerRegistrationStarted: false,
};

function getRequiredElement(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`No se encontró el elemento requerido: ${selector}`);
  }

  return element;
}

function bindDom() {
  dom.homeView = getRequiredElement("#home-view");
  dom.debtsView = getRequiredElement("#debts-view");
  dom.analysisView = getRequiredElement("#analysis-view");
  dom.savingsView = getRequiredElement("#savings-view");
  dom.navButtons = document.querySelectorAll("[data-nav-view]");
  dom.fab = getRequiredElement("#transaction-fab");

  dom.headerDate = getRequiredElement("#header-date");
  dom.notificationsButton = getRequiredElement("#notifications-button");
  dom.notificationsIndicator = getRequiredElement(
    "#notifications-indicator",
  );
  dom.notificationsPanel = getRequiredElement("#notifications-panel");
  dom.notificationsCount = getRequiredElement("#notifications-count");
  dom.notificationsList = getRequiredElement("#notifications-list");
  dom.totalBalance = getRequiredElement("#total-balance");
  dom.yapeBalance = getRequiredElement("#yape-balance");
  dom.cashBalance = getRequiredElement("#cash-balance");
  dom.transactionsList = getRequiredElement("#recent-transactions-list");
  dom.smartTransactionForm = getRequiredElement(
    "#smart-transaction-form",
  );
  dom.smartTransactionInput = getRequiredElement(
    "#smart-transaction-input",
  );
  dom.smartMicrophoneButton = getRequiredElement(
    "#smart-microphone-button",
  );
  dom.smartTransactionSubmit = getRequiredElement(
    "#smart-transaction-submit",
  );

  dom.transactionModal = getRequiredElement("#transaction-modal");
  dom.transactionPanel = getRequiredElement("#transaction-modal-panel");
  dom.transactionForm = getRequiredElement("#transaction-form");
  dom.transactionAmount = getRequiredElement("#transaction-amount");
  dom.transactionType = getRequiredElement("#transaction-type");
  dom.standardTransactionFields = getRequiredElement(
    "#standard-transaction-fields",
  );
  dom.transactionAccount = getRequiredElement("#transaction-account");
  dom.transactionCategoryField = getRequiredElement(
    "#transaction-category-field",
  );
  dom.transactionCategory = getRequiredElement("#transaction-category");
  dom.transferSwapField = getRequiredElement("#transfer-swap-field");
  dom.transferSourceAccount = getRequiredElement("#transfer-source-account");
  dom.transferDestinationAccount = getRequiredElement(
    "#transfer-destination-account",
  );
  dom.transferSourceLabel = getRequiredElement("#transfer-source-label");
  dom.transferDestinationLabel = getRequiredElement(
    "#transfer-destination-label",
  );
  dom.transferSwapButton = getRequiredElement("#swap-transfer-accounts");
  dom.transactionNoteField = getRequiredElement("#transaction-note-field");
  dom.transactionFormError = getRequiredElement("#transaction-form-error");
  dom.transactionCloseButtons = document.querySelectorAll(
    "[data-transaction-modal-close]",
  );

  dom.newDebtButton = getRequiredElement("#new-debt-button");
  dom.debtsList = getRequiredElement("#debts-list");
  dom.debtTabButtons = document.querySelectorAll("[data-debt-tab]");
  dom.receivableDebtCount = getRequiredElement("#receivable-debt-count");
  dom.payableDebtCount = getRequiredElement("#payable-debt-count");
  dom.receivableDebtTotal = getRequiredElement("#receivable-debt-total");
  dom.payableDebtTotal = getRequiredElement("#payable-debt-total");

  dom.debtModal = getRequiredElement("#debt-modal");
  dom.debtPanel = getRequiredElement("#debt-modal-panel");
  dom.debtForm = getRequiredElement("#debt-form");
  dom.debtPersonName = getRequiredElement("#debt-person-name");
  dom.debtDateLent = getRequiredElement("#debt-date-lent");
  dom.debtExpectedDate = getRequiredElement("#debt-expected-date");
  dom.debtFormError = getRequiredElement("#debt-form-error");
  dom.debtCloseButtons = document.querySelectorAll("[data-debt-modal-close]");

  dom.newSavingsGoalButton = getRequiredElement(
    "#new-savings-goal-button",
  );
  dom.savingsGoalsList = getRequiredElement("#savings-goals-list");
  dom.savingsModal = getRequiredElement("#savings-modal");
  dom.savingsPanel = getRequiredElement("#savings-modal-panel");
  dom.savingsForm = getRequiredElement("#savings-goal-form");
  dom.savingsGoalName = getRequiredElement("#savings-goal-name");
  dom.savingsFormError = getRequiredElement("#savings-form-error");
  dom.savingsCloseButtons = document.querySelectorAll(
    "[data-savings-modal-close]",
  );

  dom.confirmationDialog = getRequiredElement("#confirmation-dialog");
  dom.confirmationPanel = getRequiredElement("#confirmation-dialog-panel");
  dom.confirmationTitle = getRequiredElement("#confirmation-title");
  dom.confirmationMessage = getRequiredElement("#confirmation-message");
  dom.confirmationIcon = getRequiredElement("#confirmation-icon");
  dom.confirmationAccountField = getRequiredElement(
    "#confirmation-account-field",
  );
  dom.confirmationAccountLabel = getRequiredElement(
    "#confirmation-account-label",
  );
  dom.confirmationAccount = getRequiredElement("#confirmation-account");
  dom.confirmationAmountField = getRequiredElement(
    "#confirmation-amount-field",
  );
  dom.confirmationAmountLabel = getRequiredElement(
    "#confirmation-amount-label",
  );
  dom.confirmationAmount = getRequiredElement("#confirmation-amount");
  dom.confirmationFormError = getRequiredElement(
    "#confirmation-form-error",
  );
  dom.confirmationAccept = getRequiredElement("#confirmation-accept");
  dom.confirmationCancelButtons = document.querySelectorAll(
    "[data-confirm-cancel]",
  );

  dom.analysisExpenseTotal = getRequiredElement("#analysis-expense-total");
  dom.analysisChartCanvas = getRequiredElement("#expense-category-chart");
  dom.analysisEmptyState = getRequiredElement("#analysis-empty-state");
  dom.analysisPeriodSelect = getRequiredElement("#analysis-period-select");
  dom.analysisAiButton = getRequiredElement("#analysis-ai-button");
  dom.analysisAiPanel = getRequiredElement("#analysis-ai-panel");
  dom.analysisAiContent = getRequiredElement("#analysis-ai-content");

  dom.toast = getRequiredElement("#app-toast");
  dom.toastIcon = getRequiredElement("#app-toast-icon");
  dom.toastMessage = getRequiredElement("#app-toast-message");
}

function formatCurrency(value) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return `S/. ${amountFormatter.format(safeValue)}`;
}

function escapeHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
}

function getAccountLabel(accountId) {
  const labels = {
    yape: "Yape",
    efectivo: "Efectivo",
  };

  return Object.hasOwn(labels, accountId) ? labels[accountId] : "Cuenta";
}

function showToast(message, tone = "info") {
  window.clearTimeout(state.toastTimer);
  dom.toastMessage.textContent = message;
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

  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.add("-translate-y-3", "opacity-0");
    state.toastTimer = window.setTimeout(() => {
      dom.toast.classList.add("invisible");
      state.toastTimer = null;
    }, 200);
  }, 3200);
}

function showErrorToast(message) {
  showToast(message, "error");
}

async function requestGemini(prompt, { expectJson = false } = {}) {
  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    const offlineError = new Error(
      "Gemini no está disponible sin conexión.",
    );
    offlineError.isGeminiHandled = true;
    offlineError.geminiErrorType = "offline";
    throw offlineError;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    GEMINI_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: expectJson ? 0.1 : 0.65,
          maxOutputTokens: expectJson ? 180 : 320,
          ...(expectJson
            ? { responseMimeType: "application/json" }
            : {}),
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      let errorPayload = null;
      try {
        errorPayload = JSON.parse(responseBody);
      } catch {
        // Some gateways return plain text or HTML error pages.
      }

      const errorDetails = Array.isArray(errorPayload?.error?.details)
        ? errorPayload.error.details
        : [];
      const errorInfo = errorDetails.find(
        (detail) =>
          typeof detail === "object" &&
          detail !== null &&
          String(detail["@type"] || "").endsWith(
            "google.rpc.ErrorInfo",
          ),
      );
      const httpError = new Error(
        `Gemini respondió con HTTP ${response.status} ${response.statusText}.`,
      );
      httpError.geminiErrorType = "http";
      httpError.httpStatus = response.status;
      httpError.responseBody = responseBody.slice(0, 600);
      httpError.googleReason = errorInfo?.reason ?? null;
      httpError.googleMessage = errorPayload?.error?.message ?? null;
      throw httpError;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const responseError = new Error(
        "Gemini devolvió una respuesta que no es JSON válido.",
        { cause: error },
      );
      responseError.geminiErrorType = "invalid-response";
      throw responseError;
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const emptyResponseError = new Error(
        "Gemini no devolvió contenido utilizable.",
      );
      emptyResponseError.geminiErrorType = "invalid-response";
      throw emptyResponseError;
    }

    return text;
  } catch (error) {
    console.error("La solicitud a Gemini falló.", error);

    let toastMessage;
    let toastTone = "error";

    if (!navigator.onLine) {
      toastMessage = "IA no disponible sin conexión";
      toastTone = "info";
    } else if (error.geminiErrorType === "http") {
      const httpContext = {
        400: "petición inválida",
        401: "clave no autorizada",
        403: "clave sin permisos",
        404: "modelo no disponible",
        429: "cuota agotada",
      };
      const contextLabel =
        error.googleReason === "ACCESS_TOKEN_TYPE_UNSUPPORTED"
          ? "tipo de clave incompatible o sin vincular"
          : httpContext[error.httpStatus];
      toastMessage = `Error IA: HTTP ${error.httpStatus}${
        contextLabel ? ` (${contextLabel})` : ""
      }`;
    } else if (error.name === "AbortError") {
      toastMessage = "Error IA: tiempo de espera agotado";
    } else if (error instanceof TypeError) {
      toastMessage = "Fallo de conexión API";
    } else if (error.geminiErrorType === "invalid-response") {
      toastMessage = "Error IA: respuesta inválida";
    } else {
      const safeMessage = String(error.message || "fallo desconocido")
        .replace(/\s+/g, " ")
        .slice(0, 90);
      toastMessage = `Error IA: ${safeMessage}`;
    }

    showToast(toastMessage, toastTone);
    const handledError = new Error(toastMessage, {
      cause: error,
    });
    handledError.isGeminiHandled = true;
    handledError.geminiErrorType =
      error.geminiErrorType ?? "request";
    handledError.httpStatus = error.httpStatus ?? null;
    handledError.googleReason = error.googleReason ?? null;
    throw handledError;
  } finally {
    window.clearTimeout(timeout);
  }
}

function parsePlainJson(value) {
  const normalized = String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(normalized);
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeAccountId(value) {
  const normalized = normalizeText(value);
  if (normalized === "yape") {
    return "yape";
  }
  if (normalized === "efectivo") {
    return "efectivo";
  }
  return null;
}

function normalizeSmartCategory(type, value) {
  const categoryMap = {
    social: "Social",
    fitness: "Fitness",
    personal: "Personal",
    otros: "Otros",
    trabajo: "Trabajo",
  };
  const category = categoryMap[normalizeText(value)] ?? "Otros";

  if (type === "income") {
    return category === "Trabajo" ? "Trabajo" : "Otros";
  }
  if (type === "expense") {
    return categoriesByType.expense.includes(category)
      ? category
      : "Otros";
  }
  return "";
}

function initializeSpeechRecognition() {
  const SpeechRecognitionConstructor =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionConstructor) {
    dom.smartMicrophoneButton.disabled = true;
    dom.smartMicrophoneButton.classList.add(
      "cursor-not-allowed",
      "opacity-35",
    );
    dom.smartMicrophoneButton.setAttribute(
      "aria-label",
      "Dictado no compatible con este navegador",
    );
    return;
  }

  const recognition = new SpeechRecognitionConstructor();
  recognition.lang = "es-PE";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    state.speechListening = true;
    dom.smartMicrophoneButton.classList.add(
      "border-rose-400/40",
      "bg-rose-400/10",
      "text-rose-300",
      "animate-pulse",
    );
    dom.smartMicrophoneButton.setAttribute("aria-label", "Detener dictado");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) {
      dom.smartTransactionInput.value = transcript;
      dom.smartTransactionInput.focus();
    }
  });

  recognition.addEventListener("error", (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech") {
      showErrorToast("No se pudo usar el micrófono.");
    }
  });

  recognition.addEventListener("end", () => {
    state.speechListening = false;
    dom.smartMicrophoneButton.classList.remove(
      "border-rose-400/40",
      "bg-rose-400/10",
      "text-rose-300",
      "animate-pulse",
    );
    dom.smartMicrophoneButton.setAttribute(
      "aria-label",
      "Dictar movimiento",
    );
  });

  state.speechRecognition = recognition;
}

function toggleSpeechRecognition() {
  if (!state.speechRecognition) {
    showErrorToast("El dictado por voz no está disponible.");
    return;
  }

  try {
    if (state.speechListening) {
      state.speechRecognition.stop();
    } else {
      state.speechRecognition.start();
    }
  } catch (error) {
    console.error("No se pudo cambiar el estado del dictado.", error);
    showErrorToast("No se pudo iniciar el micrófono.");
  }
}

function reserveAccountDebit(accountId, amount) {
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

function renderDebtAlerts() {
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

function setNotificationsOpen(isOpen) {
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

function maybeSendNativeDebtNotification() {
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
      switchView("debts");
      notification.close();
    });
  } catch (error) {
    console.warn("No se pudo mostrar la notificación nativa.", error);
  }
}

function updateDebtAlerts() {
  const today = getStartOfDay(new Date());
  if (!today) {
    return;
  }

  state.debtAlerts = [...state.debts.values()]
    .map((debtDocument) => createDebtAlert(debtDocument, today))
    .filter(Boolean)
    .sort((first, second) => first.daysUntilDue - second.daysUntilDue);

  renderDebtAlerts();
  maybeSendNativeDebtNotification();
}

async function initializeNativeNotifications() {
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

  maybeSendNativeDebtNotification();
}

function registerServiceWorkerAfterLoad() {
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

function renderHeaderDate() {
  const formattedDate = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  dom.headerDate.textContent =
    formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
}

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

function syncBodyScrollLock() {
  const hasOpenOverlay = [
    dom.transactionModal,
    dom.debtModal,
    dom.savingsModal,
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

function setTransactionType(type) {
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

function swapTransferAccounts() {
  const previousSource = dom.transferSourceAccount.value;

  dom.transferSourceAccount.value = dom.transferDestinationAccount.value;
  dom.transferDestinationAccount.value = previousSource;
  renderTransferAccounts();

  const icon = dom.transferSwapButton.querySelector("i");
  icon?.classList.toggle("rotate-180");
}

function openTransactionModal() {
  dom.transactionForm.reset();
  setTransactionType("expense");
  dom.fab.setAttribute("aria-expanded", "true");
  openBottomSheet(
    dom.transactionModal,
    dom.transactionPanel,
    dom.transactionAmount,
  );
}

function closeTransactionModal() {
  dom.fab.setAttribute("aria-expanded", "false");
  closeBottomSheet(dom.transactionModal, dom.transactionPanel, dom.fab);
}

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

  return Number.isNaN(date.getTime()) ? null : date;
}

function openDebtModal() {
  dom.debtForm.reset();
  const today = new Date();
  const expectedDate = new Date(today);
  expectedDate.setMonth(expectedDate.getMonth() + 1);
  dom.debtDateLent.value = toDateInputValue(today);
  dom.debtExpectedDate.value = toDateInputValue(expectedDate);
  setInlineError(dom.debtFormError);
  openBottomSheet(dom.debtModal, dom.debtPanel, dom.debtPersonName);
}

function closeDebtModal() {
  closeBottomSheet(dom.debtModal, dom.debtPanel, dom.newDebtButton);
}

function openSavingsModal() {
  dom.savingsForm.reset();
  setInlineError(dom.savingsFormError);
  openBottomSheet(
    dom.savingsModal,
    dom.savingsPanel,
    dom.savingsGoalName,
  );
}

function closeSavingsModal() {
  closeBottomSheet(
    dom.savingsModal,
    dom.savingsPanel,
    dom.newSavingsGoalButton,
  );
}

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
  dom.confirmationAmount.value = "";
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
    <article class="relative overflow-hidden rounded-3xl border ${theme.border} bg-white/[0.055] p-4 ${theme.cardGlow} backdrop-blur-md">
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
              <p class="whitespace-nowrap pt-2 font-semibold ${theme.amountText}">
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

function renderEmptyTransactions() {
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

async function deleteTransaction(transactionDocument, triggerButton) {
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

async function registerTransactionAtomic(transaction) {
  const type = String(transaction.type);
  const amount = Number(transaction.amount);
  const note =
    type === "expense"
      ? String(transaction.note ?? "").trim().slice(0, 80)
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

async function handleTransactionSubmit(event) {
  event.preventDefault();
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
    restoreButton();
  }
}

async function handleSmartTransactionSubmit(event) {
  event.preventDefault();
  const naturalLanguageInput = dom.smartTransactionInput.value.trim();

  if (!naturalLanguageInput) {
    showErrorToast("Describe el movimiento que deseas registrar.");
    dom.smartTransactionInput.focus();
    return;
  }

  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    return;
  }

  const restoreButton = setButtonLoading(
    dom.smartTransactionSubmit,
    "",
  );

  try {
    const prompt = `
Extrae una transacción financiera del texto delimitado abajo.
Responde ESTRICTAMENTE con un único objeto JSON plano, sin markdown, comentarios ni texto adicional:
{"type":"expense|income|transfer","amount":number,"account":"Yape|Efectivo","category":"Social|Fitness|Personal|Otros|Trabajo"}

Reglas:
- Usa expense para gastos, income para ingresos y transfer para movimientos entre cuentas.
- En una transferencia, "account" es la cuenta de origen; la cuenta de destino será la otra cuenta.
- Si no se menciona cuenta, usa Efectivo.
- Para ingresos usa Trabajo u Otros.
- Para transferencias usa Otros como categoría.

TEXTO DEL USUARIO:
"""${naturalLanguageInput}"""
    `.trim();
    const rawResponse = await requestGemini(prompt, { expectJson: true });
    const parsedResponse = parsePlainJson(rawResponse);
    const type = normalizeText(parsedResponse.type);
    const amount = Number(parsedResponse.amount);
    const accountId = normalizeAccountId(parsedResponse.account);

    if (
      !validTransactionTypes.has(type) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !accountId
    ) {
      throw new Error("Gemini devolvió una transacción incompleta.");
    }

    const transaction =
      type === "transfer"
        ? {
            type,
            amount,
            sourceAccountId: accountId,
            destinationAccountId:
              accountId === "yape" ? "efectivo" : "yape",
          }
        : {
            type,
            amount,
            accountId,
            category: normalizeSmartCategory(
              type,
              parsedResponse.category,
            ),
            note:
              type === "expense"
                ? naturalLanguageInput.slice(0, 80)
                : "",
          };

    const wasRegistered = await registerTransactionAtomic(transaction);
    if (wasRegistered) {
      dom.smartTransactionInput.value = "";
      showToast("Transacción registrada con IA", "success");
    }
  } catch (error) {
    console.error("No se pudo interpretar el registro inteligente.", error);
    if (!error.isGeminiHandled) {
      showErrorToast(
        "No pude interpretar el movimiento. Intenta ser más específico.",
      );
    }
  } finally {
    restoreButton();
  }
}

async function requestExpenseRoast({ amount, category }) {
  if (amount <= 100 && category !== "Social") {
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
Sabiendo que tiene metas de ahorro como un iPhone${additionalGoals}, dale un consejo de 1 línea, directo, crudo y sutilmente irónico sobre cómo esto impacta su meta.
Responde solo con esa línea.
  `.trim();

  try {
    const advice = await requestGemini(prompt);
    const singleLineAdvice = advice
      .replace(/^[-*•\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (singleLineAdvice) {
      showToast(singleLineAdvice, "warning");
    }
  } catch (error) {
    if (!error.isGeminiHandled) {
      console.error("No se pudo generar el consejo financiero.", error);
    }
  }
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
            <p class="whitespace-nowrap font-semibold ${tone.amountText}">
              ${formatCurrency(debt.amount)}
            </p>
          </div>
          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-xs text-slate-500">
              Desde ${escapeHtml(formatDebtDate(debt.dateLent))}
            </p>
            <button
              type="button"
              data-settle-debt="${escapeHtml(debtDocument.id)}"
              class="rounded-xl border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-400/15"
            >
              Saldar
            </button>
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

function renderDebts() {
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

async function handleDebtSubmit(event) {
  event.preventDefault();
  setInlineError(dom.debtFormError);

  const formData = new FormData(dom.debtForm);
  const type = String(formData.get("type"));
  const personName = String(formData.get("personName") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount")));
  const dateLent = parseDateInput(formData.get("dateLent"));
  const expectedPayDate = parseDateInput(formData.get("expectedPayDate"));

  if (
    !validDebtTypes.has(type) ||
    !personName ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !dateLent ||
    !expectedPayDate
  ) {
    setInlineError(dom.debtFormError, "Completa todos los datos correctamente.");
    return;
  }

  const submitButton = dom.debtForm.querySelector('button[type="submit"]');
  const restoreButton = setButtonLoading(submitButton, "Guardando");

  try {
    const batch = writeBatch(db);
    const debtReference = doc(collection(db, "debts"));

    batch.set(debtReference, {
      type,
      personName,
      amount,
      dateLent: Timestamp.fromDate(dateLent),
      expectedPayDate: Timestamp.fromDate(expectedPayDate),
      status: "pending",
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
    restoreButton();
  }
}

async function settleDebt(debtDocument, triggerButton) {
  const debt = debtDocument.data();
  const type = String(debt.type);
  const amount = Math.abs(Number(debt.amount));

  if (
    !validDebtTypes.has(type) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    debt.status !== "pending"
  ) {
    console.error("La deuda no contiene datos válidos para saldarla.");
    return;
  }

  const decision = await requestConfirmation({
    title: type === "receivable" ? "Registrar cobro" : "Registrar pago",
    message:
      type === "receivable"
        ? `${debt.personName} te pagará ${formatCurrency(amount)}. Elige la cuenta que recibirá el dinero.`
        : `Pagarás ${formatCurrency(amount)} a ${debt.personName}. Elige la cuenta de salida.`,
    confirmLabel: "Saldar",
    requestAccount: true,
  });

  if (!decision.confirmed || !validAccounts.has(decision.accountId)) {
    return;
  }

  let releaseDebitReservation = () => {};
  if (type === "payable") {
    const reservation = reserveAccountDebit(
      decision.accountId,
      amount,
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
    const balanceChange = type === "receivable" ? amount : -amount;

    batch.update(debtDocument.ref, {
      status: "paid",
      paidAt: serverTimestamp(),
      settledAccountId: decision.accountId,
    });
    batch.update(accountReference, {
      balance: increment(balanceChange),
    });

    await batch.commit();
  } catch (error) {
    console.error("No se pudo saldar la deuda.", error);
  } finally {
    releaseDebitReservation();
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
              <p class="mt-1 text-sm text-slate-400">
                ${formatCurrency(currentSaved)} de ${formatCurrency(targetAmount)}
              </p>
            </div>
            <span class="rounded-xl border border-blue-400/15 bg-blue-400/[0.08] px-2.5 py-1 text-xs font-semibold text-blue-300">
              ${roundedProgress}%
            </span>
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

function renderSavingsGoals() {
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

async function handleSavingsGoalSubmit(event) {
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

async function moveSavingsGoal(goalDocument, movement, triggerButton) {
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

    batch.update(accountReference, {
      balance: increment(isContribution ? -decision.amount : decision.amount),
    });
    batch.update(goalDocument.ref, {
      currentSaved: increment(
        isContribution ? decision.amount : -decision.amount,
      ),
    });

    await batch.commit();
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

function switchView(view) {
  const selectedView = ["home", "debts", "analysis", "savings"].includes(view)
    ? view
    : "home";
  state.activeView = selectedView;
  setNotificationsOpen(false);

  dom.homeView.classList.toggle("hidden", selectedView !== "home");
  dom.debtsView.classList.toggle("hidden", selectedView !== "debts");
  dom.analysisView.classList.toggle("hidden", selectedView !== "analysis");
  dom.savingsView.classList.toggle("hidden", selectedView !== "savings");
  dom.fab.classList.toggle("hidden", selectedView !== "home");

  dom.navButtons.forEach((button) => {
    const isActive = button.dataset.navView === selectedView;
    button.classList.remove(...activeNavClasses, ...inactiveNavClasses);
    button.classList.add(...(isActive ? activeNavClasses : inactiveNavClasses));

    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (selectedView === "analysis") {
    window.requestAnimationFrame(() => {
      state.expenseChart?.resize();
    });
  }
}

function handleDocumentClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const notificationsButton = event.target.closest(
    "#notifications-button",
  );
  if (notificationsButton) {
    setNotificationsOpen(!state.notificationsOpen);
    return;
  }

  if (
    state.notificationsOpen &&
    !event.target.closest("#notifications-panel")
  ) {
    setNotificationsOpen(false);
  }

  const typeButton = event.target.closest(
    "#transaction-modal [data-transaction-type]",
  );
  if (typeButton) {
    event.preventDefault();
    setTransactionType(typeButton.dataset.transactionType);
    return;
  }

  const swapButton = event.target.closest("[data-swap-transfer-accounts]");
  if (swapButton) {
    event.preventDefault();
    swapTransferAccounts();
    return;
  }

  const navButton = event.target.closest("[data-nav-view]");
  if (navButton) {
    switchView(navButton.dataset.navView);
    return;
  }

  const debtTabButton = event.target.closest("[data-debt-tab]");
  if (debtTabButton) {
    state.activeDebtTab =
      debtTabButton.dataset.debtTab === "payable" ? "payable" : "receivable";
    renderDebts();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-transaction]");
  if (deleteButton) {
    const transactionDocument = state.transactions.get(
      deleteButton.dataset.deleteTransaction,
    );
    if (transactionDocument) {
      void deleteTransaction(transactionDocument, deleteButton);
    }
    return;
  }

  const settleButton = event.target.closest("[data-settle-debt]");
  if (settleButton) {
    const debtDocument = state.debts.get(settleButton.dataset.settleDebt);
    if (debtDocument) {
      void settleDebt(debtDocument, settleButton);
    }
    return;
  }

  const contributeButton = event.target.closest("[data-contribute-goal]");
  if (contributeButton) {
    const goalDocument = state.savingsGoals.get(
      contributeButton.dataset.contributeGoal,
    );
    if (goalDocument) {
      void moveSavingsGoal(goalDocument, "contribute", contributeButton);
    }
    return;
  }

  const withdrawButton = event.target.closest("[data-withdraw-goal]");
  if (withdrawButton && !withdrawButton.disabled) {
    const goalDocument = state.savingsGoals.get(
      withdrawButton.dataset.withdrawGoal,
    );
    if (goalDocument) {
      void moveSavingsGoal(goalDocument, "withdraw", withdrawButton);
    }
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (dom.confirmationDialog.getAttribute("aria-hidden") === "false") {
    cancelConfirmation();
    return;
  }

  if (state.notificationsOpen) {
    setNotificationsOpen(false);
    return;
  }

  if (dom.transactionModal.getAttribute("aria-hidden") === "false") {
    closeTransactionModal();
    return;
  }

  if (dom.debtModal.getAttribute("aria-hidden") === "false") {
    closeDebtModal();
    return;
  }

  if (dom.savingsModal.getAttribute("aria-hidden") === "false") {
    closeSavingsModal();
  }
}

function listenToAccounts() {
  onSnapshot(
    collection(db, "accounts"),
    (snapshot) => {
      const balances = { yape: 0, efectivo: 0 };

      snapshot.forEach((accountDocument) => {
        if (Object.hasOwn(balances, accountDocument.id)) {
          const balance = Number(accountDocument.data().balance);
          balances[accountDocument.id] = Number.isFinite(balance) ? balance : 0;
        }
      });

      state.accountBalances = balances;
      state.accountsReady = true;
      dom.yapeBalance.textContent = formatCurrency(balances.yape);
      dom.cashBalance.textContent = formatCurrency(balances.efectivo);
      dom.totalBalance.textContent = formatCurrency(
        balances.yape + balances.efectivo,
      );
    },
    (error) => {
      state.accountsReady = false;
      console.error("No se pudieron escuchar las cuentas.", error);
    },
  );
}

function listenToTransactions() {
  const recentTransactionsQuery = query(
    collection(db, "transactions"),
    orderBy("createdAt", "desc"),
    limit(5),
  );

  onSnapshot(
    recentTransactionsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      state.transactions = new Map(
        snapshot.docs.map((transactionDocument) => [
          transactionDocument.id,
          transactionDocument,
        ]),
      );

      if (snapshot.empty) {
        renderEmptyTransactions();
        return;
      }

      dom.transactionsList.innerHTML = snapshot.docs
        .map(createTransactionCard)
        .join("");
    },
    (error) => {
      console.error("No se pudieron escuchar las transacciones.", error);
    },
  );
}

function getExpenseDate(transaction) {
  if (
    transaction.createdAt &&
    typeof transaction.createdAt.toDate === "function"
  ) {
    return transaction.createdAt.toDate();
  }

  if (transaction.hasPendingWrites) {
    return new Date();
  }

  return null;
}

function filterExpensesByPeriod(expenses, period, now = new Date()) {
  const periodOffsets = {
    current: 0,
    previous: -1,
    "two-months-ago": -2,
  };
  const maximumDate = now.getTime();

  if (period === "history") {
    return expenses.filter((transaction) => {
      const date = getExpenseDate(transaction);
      return date && date.getTime() <= maximumDate;
    });
  }

  const offset = Object.hasOwn(periodOffsets, period)
    ? periodOffsets[period]
    : 0;
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth() + offset,
    1,
  );
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth() + offset + 1,
    1,
  );

  return expenses.filter((transaction) => {
    const date = getExpenseDate(transaction);
    if (!date) {
      return false;
    }

    const timestamp = date.getTime();
    return (
      timestamp >= startDate.getTime() &&
      timestamp < endDate.getTime() &&
      timestamp <= maximumDate
    );
  });
}

function renderExpenseAnalysis(expenses) {
  const categories = ["Social", "Fitness", "Personal", "Otros"];
  const categoryTotals = {
    Social: 0,
    Fitness: 0,
    Personal: 0,
    Otros: 0,
  };

  expenses.forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount));
    if (!Number.isFinite(amount)) {
      return;
    }

    const category = Object.hasOwn(
      categoryTotals,
      transaction.category,
    )
      ? transaction.category
      : "Otros";
    categoryTotals[category] += amount;
  });

  const values = categories.map((category) => categoryTotals[category]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const hasExpenses = total > 0;

  dom.analysisExpenseTotal.textContent = formatCurrency(total);
  dom.analysisEmptyState.classList.toggle("hidden", hasExpenses);
  dom.analysisChartCanvas.classList.toggle("invisible", !hasExpenses);

  if (!hasExpenses) {
    state.expenseChart?.destroy();
    state.expenseChart = null;
    return;
  }

  if (!window.Chart) {
    console.error("Chart.js no está disponible.");
    dom.analysisEmptyState.classList.remove("hidden");
    dom.analysisChartCanvas.classList.add("invisible");
    return;
  }

  if (state.expenseChart) {
    state.expenseChart.data.datasets[0].data = values;
    state.expenseChart.update();
    return;
  }

  state.expenseChart = new window.Chart(dom.analysisChartCanvas, {
    type: "doughnut",
    data: {
      labels: categories,
      datasets: [
        {
          data: values,
          backgroundColor: [
            "rgba(34, 211, 238, 0.78)",
            "rgba(52, 211, 153, 0.78)",
            "rgba(251, 113, 133, 0.78)",
            "rgba(96, 165, 250, 0.78)",
          ],
          hoverBackgroundColor: [
            "rgba(34, 211, 238, 0.95)",
            "rgba(52, 211, 153, 0.95)",
            "rgba(251, 113, 133, 0.95)",
            "rgba(96, 165, 250, 0.95)",
          ],
          borderWidth: 0,
          hoverBorderWidth: 0,
          spacing: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      animation: {
        duration: 450,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#cbd5e1",
            padding: 18,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.94)",
          borderColor: "rgba(148, 163, 184, 0.18)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${context.label}: ${formatCurrency(context.parsed)}`;
            },
          },
        },
      },
    },
  });
}

function refreshExpenseAnalysis() {
  state.filteredExpenseTransactions = filterExpensesByPeriod(
    state.expenseTransactions,
    state.analysisPeriod,
  );
  renderExpenseAnalysis(state.filteredExpenseTransactions);
  dom.analysisAiPanel.classList.add("hidden");
  dom.analysisAiContent.innerHTML = "";
}

function handleAnalysisPeriodChange() {
  const validPeriods = new Set([
    "current",
    "previous",
    "two-months-ago",
    "history",
  ]);
  state.analysisPeriod = validPeriods.has(dom.analysisPeriodSelect.value)
    ? dom.analysisPeriodSelect.value
    : "current";
  dom.analysisPeriodSelect.value = state.analysisPeriod;
  refreshExpenseAnalysis();
}

function parseAuditBullets(response) {
  const normalized = String(response)
    .replace(/\r/g, "")
    .replace(/\s+(?=\d+[.)]\s)/g, "\n")
    .replace(/\*\*/g, "")
    .trim();
  const bullets = normalized
    .split(/\n+/)
    .map((line) =>
      line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim(),
    )
    .filter(Boolean)
    .slice(0, 3);

  return bullets.length > 0 ? bullets : [normalized];
}

async function generateAiAnalysis() {
  const expenses = state.filteredExpenseTransactions;
  if (expenses.length === 0) {
    showToast("No hay gastos en este periodo para analizar.", "info");
    return;
  }

  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    return;
  }

  const restoreButton = setButtonLoading(
    dom.analysisAiButton,
    "Analizando",
  );
  const periodLabel =
    dom.analysisPeriodSelect.selectedOptions[0]?.textContent ??
    "Periodo seleccionado";
  const expenseData = expenses.map((transaction) => ({
    fecha:
      getExpenseDate(transaction)?.toLocaleDateString("es-PE") ??
      "Sin fecha",
    categoria: transaction.category || "Otros",
    monto: Math.abs(Number(transaction.amount) || 0),
    detalle: String(transaction.note || "").slice(0, 60),
  }));
  const savingsData = [...state.savingsGoals.values()].map(
    (goalDocument) => {
      const goal = goalDocument.data();
      return {
        meta: goal.goalName,
        ahorrado: Number(goal.currentSaved) || 0,
        objetivo: Number(goal.targetAmount) || 0,
        aporteMensual: Number(goal.monthlyContribution) || 0,
      };
    },
  );
  const prompt = `
Eres un auditor financiero. Analiza estos gastos de este mes (${periodLabel}):
${JSON.stringify(expenseData)}

Contexto de ahorro:
${JSON.stringify(savingsData)}

Dame exactamente 3 viñetas muy breves:
1. El mayor punto de fuga.
2. Ritmo de ahorro.
3. Una sugerencia accionable.
No agregues introducción ni despedida.
  `.trim();

  try {
    const response = await requestGemini(prompt);
    const bullets = parseAuditBullets(response);
    dom.analysisAiContent.innerHTML = bullets
      .map(
        (bullet, index) => `
          <li class="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-xs font-bold text-blue-300">${index + 1}</span>
            <p>${escapeHtml(bullet)}</p>
          </li>
        `,
      )
      .join("");
    dom.analysisAiPanel.classList.remove("hidden");
  } catch (error) {
    if (!error.isGeminiHandled) {
      console.error("No se pudo generar el diagnóstico.", error);
    }
  } finally {
    restoreButton();
  }
}

function listenToExpenseAnalysis() {
  const expenseQuery = query(
    collection(db, "transactions"),
    where("type", "==", "expense"),
  );

  onSnapshot(
    expenseQuery,
    (snapshot) => {
      state.expenseTransactions = snapshot.docs.map(
        (transactionDocument) => ({
          id: transactionDocument.id,
          ...transactionDocument.data(),
          hasPendingWrites:
            transactionDocument.metadata.hasPendingWrites,
        }),
      );
      refreshExpenseAnalysis();
    },
    (error) => {
      console.error("No se pudo construir el análisis de gastos.", error);
    },
  );
}

function listenToDebts() {
  const debtsQuery = query(
    collection(db, "debts"),
    orderBy("dateLent", "desc"),
  );

  onSnapshot(
    debtsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      state.debts = new Map(
        snapshot.docs.map((debtDocument) => [
          debtDocument.id,
          debtDocument,
        ]),
      );
      renderDebts();
      updateDebtAlerts();
    },
    (error) => {
      console.error("No se pudieron escuchar las deudas.", error);
    },
  );
}

function listenToSavingsGoals() {
  onSnapshot(
    collection(db, "savings_goals"),
    { includeMetadataChanges: true },
    (snapshot) => {
      state.savingsGoals = new Map(
        snapshot.docs.map((goalDocument) => [
          goalDocument.id,
          goalDocument,
        ]),
      );
      renderSavingsGoals();
    },
    (error) => {
      console.error("No se pudieron escuchar las metas de ahorro.", error);
    },
  );
}

function initializeApp() {
  if (state.initialized) {
    return;
  }

  bindDom();
  state.initialized = true;
  document.documentElement.dataset.finaxBuild = BUILD_ID;

  dom.fab.addEventListener("click", openTransactionModal);
  dom.newDebtButton.addEventListener("click", openDebtModal);
  dom.newSavingsGoalButton.addEventListener("click", openSavingsModal);
  dom.transactionForm.addEventListener("submit", handleTransactionSubmit);
  dom.smartTransactionForm.addEventListener(
    "submit",
    handleSmartTransactionSubmit,
  );
  dom.smartMicrophoneButton.addEventListener(
    "click",
    toggleSpeechRecognition,
  );
  dom.debtForm.addEventListener("submit", handleDebtSubmit);
  dom.savingsForm.addEventListener("submit", handleSavingsGoalSubmit);
  dom.analysisPeriodSelect.addEventListener(
    "change",
    handleAnalysisPeriodChange,
  );
  dom.analysisAiButton.addEventListener("click", generateAiAnalysis);
  dom.transactionCloseButtons.forEach((button) => {
    button.addEventListener("click", closeTransactionModal);
  });
  dom.debtCloseButtons.forEach((button) => {
    button.addEventListener("click", closeDebtModal);
  });
  dom.savingsCloseButtons.forEach((button) => {
    button.addEventListener("click", closeSavingsModal);
  });
  dom.confirmationCancelButtons.forEach((button) => {
    button.addEventListener("click", cancelConfirmation);
  });
  dom.confirmationAccept.addEventListener("click", acceptConfirmation);
  dom.confirmationAmount.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      acceptConfirmation();
    }
  });
  document.addEventListener("click", handleDocumentClick, { capture: true });
  document.addEventListener("keydown", handleGlobalKeydown);

  renderHeaderDate();
  initializeSpeechRecognition();
  setTransactionType("expense");
  switchView("home");
  renderDebts();
  renderDebtAlerts();
  renderSavingsGoals();
  renderEmptyTransactions();
  refreshExpenseAnalysis();

  listenToAccounts();
  listenToTransactions();
  listenToExpenseAnalysis();
  listenToDebts();
  listenToSavingsGoals();
  void initializeNativeNotifications();
  registerServiceWorkerAfterLoad();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
