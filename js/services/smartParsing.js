import { categoriesByType } from "../core/constants.js";
import { formatCurrency } from "../core/utils.js";

export function parsePlainJson(value) {
  const normalized = String(value ?? "").trim();
  const fencedObjectMatch = normalized.match(
    /```(?:json)?\s*(\{[\s\S]*\})\s*```/i,
  );
  const objectMatch =
    fencedObjectMatch ?? normalized.match(/\{[\s\S]*\}/);

  if (!objectMatch) {
    const missingObjectError = new SyntaxError(
      "La respuesta de Gemini no contiene un objeto JSON.",
    );
    missingObjectError.responsePreview = normalized.slice(0, 240);
    throw missingObjectError;
  }

  const jsonSource = String(
    fencedObjectMatch ? fencedObjectMatch[1] : objectMatch[0],
  ).trim();

  try {
    return JSON.parse(jsonSource);
  } catch (error) {
    const parseError = new SyntaxError(
      "El objeto JSON devuelto por Gemini no es válido.",
      { cause: error },
    );
    parseError.responsePreview = jsonSource.slice(0, 240);
    throw parseError;
  }
}

export function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeSmartTransactionType(value) {
  const aliases = {
    expense: "expense",
    gasto: "expense",
    egreso: "expense",
    income: "income",
    ingreso: "income",
    transfer: "transfer",
    transferencia: "transfer",
    traslado: "transfer",
  };

  return aliases[normalizeText(value)] ?? "";
}

export function normalizeSmartAmount(value) {
  if (typeof value === "number") {
    return value;
  }

  let normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!normalized) {
    return Number.NaN;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastPeriod = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastPeriod >= 0) {
    normalized =
      lastComma > lastPeriod
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimalPlaces = normalized.length - lastComma - 1;
    normalized =
      decimalPlaces === 3
        ? normalized.replace(/,/g, "")
        : normalized.replace(",", ".");
  }

  return Number(normalized);
}

export function compactAiText(value, maxLength) {
  const normalized = String(value ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/^[-•\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const provisional = normalized.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = provisional.lastIndexOf(" ");
  const safeCut =
    lastSpace >= Math.floor(maxLength * 0.6)
      ? provisional.slice(0, lastSpace)
      : provisional;
  return `${safeCut.trimEnd()}…`;
}

export function normalizeAccountId(value) {
  const normalized = normalizeText(value);
  if (normalized === "yape") {
    return "yape";
  }
  if (normalized === "efectivo") {
    return "efectivo";
  }
  return null;
}

export function normalizeSmartCategory(type, value) {
  const categoryMap = {
    social: "Social",
    fitness: "Fitness",
    personal: "Personal",
    otros: "Otros",
    trabajo: "Trabajo",
    propinas: "Propinas",
  };
  const category = categoryMap[normalizeText(value)] ?? "Otros";

  if (type === "income") {
    return categoriesByType.income.includes(category)
      ? category
      : "Otros";
  }
  if (type === "expense") {
    return categoriesByType.expense.includes(category)
      ? category
      : "Otros";
  }
  return "";
}

export function parseSmartTransactionLocally(value) {
  const normalized = normalizeText(value);
  const amountMatch =
    normalized.match(
      /(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(?:soles?|pen))?/,
    ) ?? [];
  const amount = normalizeSmartAmount(amountMatch[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const hasYape = /\byape\b/.test(normalized);
  const hasCash = /\b(?:efectivo|cash)\b/.test(normalized);
  const looksLikeTransfer =
    /\b(?:transferi|transfiero|pase|paso|movi|muevo|cambie)\b/.test(
      normalized,
    ) &&
    (hasYape || hasCash);
  const looksLikeIncome =
    /\b(?:recibi|cobre|cobro|gane|ganancia|ingreso|sueldo|salario|propina|me pagaron|me depositaron)\b/.test(
      normalized,
    );
  const looksLikeExpense =
    /\b(?:gaste|gasto|pague|pago|compre|compra|costo|salio|retire)\b/.test(
      normalized,
    );

  if (looksLikeTransfer) {
    const yapeIsSource =
      /\b(?:de|desde)\s+(?:mi\s+)?yape\b/.test(normalized) ||
      /\byape\s+(?:a|hacia)\s+(?:efectivo|cash)\b/.test(normalized);
    const sourceAccountId = yapeIsSource ? "yape" : "efectivo";
    return {
      type: "transfer",
      amount,
      sourceAccountId,
      destinationAccountId:
        sourceAccountId === "yape" ? "efectivo" : "yape",
    };
  }

  if (looksLikeIncome) {
    const category = /\bpropina/.test(normalized)
      ? "Propinas"
      : /\b(?:sueldo|salario|trabajo|cobre|me pagaron)\b/.test(
            normalized,
          )
        ? "Trabajo"
        : "Otros";
    return {
      type: "income",
      amount,
      accountId: hasYape ? "yape" : "efectivo",
      category,
      note: "",
    };
  }

  if (!looksLikeExpense) {
    return null;
  }

  let category = "Otros";
  if (
    /\b(?:amigos?|fiesta|discoteca|bar|cerveza|trago|salida|cine|cita)\b/.test(
      normalized,
    )
  ) {
    category = "Social";
  } else if (
    /\b(?:gym|gimnasio|fitness|proteina|deporte|entrenamiento)\b/.test(
      normalized,
    )
  ) {
    category = "Fitness";
  } else if (
    /\b(?:menu|comida|almuerzo|cena|desayuno|ropa|taxi|pasaje|farmacia|delivery)\b/.test(
      normalized,
    )
  ) {
    category = "Personal";
  }

  return {
    type: "expense",
    amount,
    accountId: hasYape ? "yape" : "efectivo",
    category,
    note: String(value).trim().slice(0, 500),
  };
}

export function buildLocalExpenseRoast(amount, category) {
  if (category === "Social") {
    return `Tu vida social acaba de alejar tu meta otros ${formatCurrency(amount)}.`;
  }
  return `${formatCurrency(amount)} menos para tu meta; al menos el gasto fue memorable.`;
}
