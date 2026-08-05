import { LEDGER_CACHE_READY_STORAGE_KEY } from "./constants.js";

function getStoredNumber(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function setStoredNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable in private or hardened browsing modes.
  }
}

function getStoredBoolean(key, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function setStoredBoolean(key, value) {
  try {
    localStorage.setItem(key, String(Boolean(value)));
  } catch {}
}

function isLedgerCacheReady() {
  try {
    return localStorage.getItem(LEDGER_CACHE_READY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markLedgerCacheReady() {
  try {
    localStorage.setItem(LEDGER_CACHE_READY_STORAGE_KEY, "true");
  } catch {
    // Firestore seguirá siendo la fuente de verdad aunque Storage esté bloqueado.
  }
}

export {
  getStoredBoolean,
  getStoredNumber,
  isLedgerCacheReady,
  markLedgerCacheReady,
  setStoredBoolean,
  setStoredNumber,
};
