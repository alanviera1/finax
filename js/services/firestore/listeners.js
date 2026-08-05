import {
  collection,
  db,
  onSnapshot,
  orderBy,
  query,
  where,
} from "../../../firebase-config.js";
import { state } from "../../core/state.js";
import { isLedgerCacheReady, markLedgerCacheReady } from "../../core/storage.js";
import { calculateLedgerBalance } from "../analytics.js";

function resetRecentTransactionsState() {
  state.recentTransactionsLoaded = false;
  state.recentTransactionsCursor = null;
  state.recentTransactionsHasMore = false;
  state.recentLoadedTransactions = [];
  state.recentLoadedTransactionIds.clear();
}

function listenToAccounts({
  onBalanceSummary,
  onProcessDueSubscriptions,
} = {}) {
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
      onBalanceSummary?.();
      onProcessDueSubscriptions?.();
    },
    (error) => {
      state.accountsReady = false;
      console.error("No se pudieron escuchar las cuentas.", error);
    },
  );
}

function listenToTransactions({
  onBalanceSummary,
  onTransactionDetailChange,
  onEmptyTransactions,
  onLoadRecentPage,
  onSyncRecentList,
  onUpdateLoadMore,
  onProcessDueSubscriptions,
} = {}) {
  onSnapshot(
    collection(db, "transactions"),
    { includeMetadataChanges: true },
    (snapshot) => {
      state.transactions = new Map(
        snapshot.docs.map((transactionDocument) => [
          transactionDocument.id,
          transactionDocument,
        ]),
      );
      state.transactionsReady = true;

      const ledgerCacheIsTrusted =
        !snapshot.metadata.fromCache || isLedgerCacheReady();

      if (!snapshot.metadata.fromCache) {
        markLedgerCacheReady();
      }
      if (ledgerCacheIsTrusted) {
        state.ledgerBalance = calculateLedgerBalance(snapshot.docs);
        state.ledgerBalanceReady = true;
        onBalanceSummary?.();
      }

      if (
        state.transactionDetailId &&
        !state.transactions.has(state.transactionDetailId)
      ) {
        onTransactionDetailChange?.();
      }

      if (snapshot.empty) {
        onEmptyTransactions?.();
        resetRecentTransactionsState();
        onUpdateLoadMore?.();
        onProcessDueSubscriptions?.();
        return;
      }

      if (!state.recentTransactionsLoaded) {
        state.recentTransactionsLoaded = true;
        onLoadRecentPage?.({ reset: true });
      } else {
        onSyncRecentList?.(snapshot.docs);
      }
      onProcessDueSubscriptions?.();
    },
    (error) => {
      state.transactionsReady = false;
      console.error("No se pudieron escuchar las transacciones.", error);
    },
  );
}

function listenToExpenseAnalysis({ onExpenseAnalysis } = {}) {
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
      onExpenseAnalysis?.();
    },
    (error) => {
      console.error("No se pudo construir el análisis de gastos.", error);
    },
  );
}

function listenToDebts({
  onDebtsChange,
  onDebtAlertsChange,
  onDebtBackfill,
} = {}) {
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
      onDebtsChange?.();
      onDebtAlertsChange?.();
      onDebtBackfill?.(snapshot.docs);
    },
    (error) => {
      console.error("No se pudieron escuchar las deudas.", error);
    },
  );
}

function listenToSavingsGoals({ onSavingsGoalsChange } = {}) {
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
      onSavingsGoalsChange?.();
    },
    (error) => {
      console.error("No se pudieron escuchar las metas de ahorro.", error);
    },
  );
}

function listenToSubscriptions({
  onSubscriptionsChange,
  onProcessDueSubscriptions,
} = {}) {
  onSnapshot(
    collection(db, "subscriptions"),
    { includeMetadataChanges: true },
    (snapshot) => {
      state.subscriptions = new Map(
        snapshot.docs.map((subscriptionDocument) => [
          subscriptionDocument.id,
          subscriptionDocument,
        ]),
      );
      state.subscriptionsReady = true;
      onSubscriptionsChange?.();
      onProcessDueSubscriptions?.();
    },
    (error) => {
      state.subscriptionsReady = false;
      console.error("No se pudieron escuchar los gastos fijos.", error);
    },
  );
}

export {
  listenToAccounts,
  listenToDebts,
  listenToExpenseAnalysis,
  listenToSavingsGoals,
  listenToSubscriptions,
  listenToTransactions,
};
