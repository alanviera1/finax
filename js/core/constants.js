const BUILD_ID = "20260805-bootstrap-v1";
const NATIVE_DEBT_NOTIFICATION_KEY = "finax-debt-alert-shown";
const LEDGER_CACHE_READY_STORAGE_KEY = "finax-ledger-cache-ready-v1";
const PRIVACY_MODE_STORAGE_KEY = "finax-privacy-mode-enabled";
const RECURRING_SUBSCRIPTION_ACCOUNT_ID = "yape";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_TRANSACTIONS_PAGE_SIZE = 10;
const GEMINI_REQUEST_TIMEOUT_MS = 18000;
const MAX_AUDIO_RECORDING_DURATION_MS = 20000;
const MAX_INLINE_AUDIO_BYTES = 4 * 1024 * 1024;
const AUDIO_RECORDING_MIME_TYPES = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
]);
const GEMINI_MIN_REQUEST_INTERVAL_MS = 20000;
const GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60000;
const GEMINI_COOLDOWN_STORAGE_KEY = "finax-gemini-cooldown-until";
const GEMINI_LAST_REQUEST_STORAGE_KEY = "finax-gemini-last-request";
const GEMINI_ROAST_INTERVAL_MS = 10 * 60 * 1000;
const GEMINI_LAST_ROAST_STORAGE_KEY = "finax-gemini-last-roast";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const validTransactionTypes = new Set(["income", "expense", "transfer"]);
const validAccounts = new Set(["yape", "efectivo"]);
const validDebtTypes = new Set(["receivable", "payable"]);
const SMART_TRANSACTION_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["expense", "income", "transfer"],
    },
    amount: {
      type: "number",
      minimum: 0.01,
    },
    account: {
      type: "string",
      enum: ["Yape", "Efectivo"],
    },
    category: {
      type: "string",
      enum: [
        "Social",
        "Fitness",
        "Personal",
        "Otros",
        "Trabajo",
        "Propinas",
      ],
    },
  },
  required: ["type", "amount", "account", "category"],
});
const AUDIO_TRANSACTION_RESPONSE_SCHEMA = Object.freeze({
  ...SMART_TRANSACTION_RESPONSE_SCHEMA,
  properties: {
    ...SMART_TRANSACTION_RESPONSE_SCHEMA.properties,
    understood: {
      type: "boolean",
    },
    amount: {
      type: "number",
      minimum: 0,
    },
    note: {
      type: "string",
      maxLength: 500,
    },
  },
  required: [
    ...SMART_TRANSACTION_RESPONSE_SCHEMA.required,
    "understood",
    "note",
  ],
});
const AUDIT_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    bullets: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string",
        maxLength: 140,
      },
    },
  },
  required: ["bullets"],
});

const categoriesByType = Object.freeze({
  income: ["Trabajo", "Propinas", "Ahorro", "Otros"],
  expense: ["Social", "Fitness", "Personal", "Ahorro", "Otros"],
  transfer: [],
});

const categoryIcons = Object.freeze({
  Trabajo: "fa-briefcase",
  Propinas: "fa-hand-holding-dollar",
  "Préstamo cobrado": "fa-hand-holding-dollar",
  "Deuda pagada": "fa-file-invoice-dollar",
  Ahorro: "fa-piggy-bank",
  Social: "fa-user-group",
  Fitness: "fa-dumbbell",
  Personal: "fa-user",
  Ingresos: "fa-arrow-trend-up",
  Otros: "fa-layer-group",
});

const analysisPeriodOptions = Object.freeze([
  { id: "current", label: "Este mes", monthOffset: 0 },
  { id: "previous", label: "Mes anterior", monthOffset: -1 },
  { id: "months-ago-2", label: "Hace 2 meses", monthOffset: -2 },
  { id: "months-ago-3", label: "Hace 3 meses", monthOffset: -3 },
  { id: "months-ago-4", label: "Hace 4 meses", monthOffset: -4 },
  { id: "months-ago-5", label: "Hace 5 meses", monthOffset: -5 },
  { id: "months-ago-6", label: "Hace 6 meses", monthOffset: -6 },
  { id: "history", label: "Histórico", monthOffset: null },
]);

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

const transactionDetailDateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "full",
  timeStyle: "medium",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export {
  AUDIO_RECORDING_MIME_TYPES,
  AUDIO_TRANSACTION_RESPONSE_SCHEMA,
  AUDIT_RESPONSE_SCHEMA,
  BUILD_ID,
  GEMINI_API_URL,
  GEMINI_COOLDOWN_STORAGE_KEY,
  GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  GEMINI_LAST_REQUEST_STORAGE_KEY,
  GEMINI_LAST_ROAST_STORAGE_KEY,
  GEMINI_MIN_REQUEST_INTERVAL_MS,
  GEMINI_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_ROAST_INTERVAL_MS,
  LEDGER_CACHE_READY_STORAGE_KEY,
  MAX_AUDIO_RECORDING_DURATION_MS,
  MAX_INLINE_AUDIO_BYTES,
  MILLISECONDS_PER_DAY,
  NATIVE_DEBT_NOTIFICATION_KEY,
  PRIVACY_MODE_STORAGE_KEY,
  RECENT_TRANSACTIONS_PAGE_SIZE,
  RECURRING_SUBSCRIPTION_ACCOUNT_ID,
  SMART_TRANSACTION_RESPONSE_SCHEMA,
  activeNavClasses,
  activeTypeClasses,
  allTypeStateClasses,
  amountFormatter,
  analysisPeriodOptions,
  categoriesByType,
  categoryIcons,
  confirmationToneClasses,
  inactiveNavClasses,
  inactiveTypeClasses,
  shortDateFormatter,
  toastToneClasses,
  transactionDateFormatter,
  transactionDetailDateFormatter,
  validAccounts,
  validDebtTypes,
  validTransactionTypes,
};
