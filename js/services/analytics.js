import { analysisPeriodOptions } from "../core/constants.js";
import { state } from "../core/state.js";
import { getAccountLabel } from "../core/utils.js";
import { showToast } from "../ui/toast.js";

function roundCurrencyAmount(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateLedgerBalance(transactionDocuments) {
  const total = transactionDocuments.reduce(
    (balance, transactionDocument) => {
      const transaction = transactionDocument.data();
      const amount = Math.abs(Number(transaction.amount));

      if (!Number.isFinite(amount) || amount <= 0) {
        return balance;
      }

      if (transaction.type === "income") {
        return balance + amount;
      }

      if (transaction.type === "expense") {
        return balance - amount;
      }

      // Las transferencias solo mueven dinero entre Yape y Efectivo.
      return balance;
    },
    0,
  );

  return roundCurrencyAmount(total);
}

function getTransactionSortTimestamp(transactionDocument) {
  const transaction = transactionDocument.data();
  const timestamp = transaction.createdAt ?? transaction.date;

  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().getTime();
  }

  const parsedTimestamp = Date.parse(String(timestamp ?? ""));
  if (Number.isFinite(parsedTimestamp)) {
    return parsedTimestamp;
  }

  return transactionDocument.metadata.hasPendingWrites
    ? Number.MAX_SAFE_INTEGER
    : 0;
}

function getTransactionExportDate(transactionDocument) {
  const transaction = transactionDocument.data();
  const timestamp = transaction.createdAt ?? transaction.date;

  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return transactionDocument.metadata.hasPendingWrites
    ? "Pendiente de sincronización"
    : "";
}

function getTransactionExportAccount(transaction) {
  if (transaction.type === "transfer") {
    const sourceAccountId =
      transaction.sourceAccountId ?? transaction.source_account_id;
    const destinationAccountId =
      transaction.destinationAccountId ?? transaction.destination_account_id;

    return `${getAccountLabel(sourceAccountId)} → ${getAccountLabel(destinationAccountId)}`;
  }

  return getAccountLabel(transaction.accountId ?? transaction.account_id);
}

function escapeCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportTransactionsCsv() {
  const transactionDocuments = [...state.transactions.values()].sort(
    (firstDocument, secondDocument) =>
      getTransactionSortTimestamp(secondDocument) -
      getTransactionSortTimestamp(firstDocument),
  );

  if (transactionDocuments.length === 0) {
    showToast("No hay transacciones para exportar.", "info");
    return;
  }

  const headers = ["Fecha", "Tipo", "Categoría", "Cuenta", "Nota", "Monto"];
  const rows = transactionDocuments.map((transactionDocument) => {
    const transaction = transactionDocument.data();
    const amount = Math.abs(Number(transaction.amount));

    return [
      getTransactionExportDate(transactionDocument),
      transaction.type ?? "",
      transaction.type === "transfer"
        ? "Transferencia"
        : transaction.category ?? "",
      getTransactionExportAccount(transaction),
      transaction.note ?? "",
      Number.isFinite(amount) ? amount.toFixed(2) : "",
    ];
  });
  const csv = `\uFEFF${[headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const exportUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = exportUrl;
  downloadLink.download = "finax-export.csv";
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(exportUrl), 0);
  showToast("Exportación CSV descargada.", "success");
}

function getExpenseDate(transaction) {
  const timestamp = transaction.createdAt ?? transaction.date;

  if (timestamp instanceof Date) {
    return Number.isFinite(timestamp.getTime()) ? timestamp : null;
  }

  if (timestamp && typeof timestamp.toDate === "function") {
    const convertedDate = timestamp.toDate();
    return convertedDate instanceof Date &&
      Number.isFinite(convertedDate.getTime())
      ? convertedDate
      : null;
  }

  if (timestamp && typeof timestamp.toMillis === "function") {
    const convertedDate = new Date(timestamp.toMillis());
    return Number.isFinite(convertedDate.getTime()) ? convertedDate : null;
  }

  if (
    timestamp &&
    (typeof timestamp === "string" || typeof timestamp === "number")
  ) {
    const parsedDate = new Date(timestamp);
    return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
  }

  if (transaction.hasPendingWrites) {
    return new Date();
  }

  return null;
}

function getAnalysisPeriodDateRange(period, now) {
  const referenceDate =
    now instanceof Date && Number.isFinite(now.getTime())
      ? now
      : new Date();

  if (period === "history") {
    return { startDate: null, endDate: new Date(referenceDate.getTime()) };
  }

  const selectedPeriod = analysisPeriodOptions.find(
    (option) => option.id === period,
  );
  const dynamicPeriodMatch = /^months-ago-(\d+)$/.exec(period);
  const offset =
    selectedPeriod?.monthOffset ??
    (dynamicPeriodMatch ? -Number(dynamicPeriodMatch[1]) : 0);
  const targetMonthIndex = referenceDate.getMonth() + offset;

  const startDate = new Date(
    referenceDate.getFullYear(),
    targetMonthIndex,
    1,
    0,
    0,
    0,
    0,
  );
  const endDate = new Date(
    referenceDate.getFullYear(),
    targetMonthIndex + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return { startDate, endDate };
}

function filterExpensesByPeriod(expenses, period, now = new Date()) {
  const { startDate, endDate } = getAnalysisPeriodDateRange(period, now);

  return expenses.filter((transaction) => {
    const date = getExpenseDate(transaction);
    if (!date) {
      return false;
    }

    const timestamp = date.getTime();

    if (period === "history") {
      return timestamp <= endDate.getTime();
    }

    return (
      timestamp >= startDate.getTime() && timestamp <= endDate.getTime()
    );
  });
}

function getAnalysisPeriodOption(period) {
  return (
    analysisPeriodOptions.find((option) => option.id === period) ??
    analysisPeriodOptions[0]
  );
}

export {
  calculateLedgerBalance,
  escapeCsvValue,
  exportTransactionsCsv,
  filterExpensesByPeriod,
  getAnalysisPeriodDateRange,
  getAnalysisPeriodOption,
  getExpenseDate,
  getTransactionExportAccount,
  getTransactionExportDate,
  getTransactionSortTimestamp,
  roundCurrencyAmount,
};
