import { amountFormatter } from "./constants.js";

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

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, milliseconds));
  });
}

export { escapeHtml, formatCurrency, getAccountLabel, wait };
