import {
  collection,
  db,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
} from "../../../firebase-config.js";
import {
  RECENT_TRANSACTIONS_PAGE_SIZE,
  RECURRING_SUBSCRIPTION_ACCOUNT_ID,
  validAccounts,
} from "../../core/constants.js";

function getRecentTransactionsQuery(cursor) {
  const baseQuery = query(
    collection(db, "transactions"),
    orderBy("createdAt", "desc"),
  );
  return cursor
    ? query(
        baseQuery,
        startAfter(cursor),
        limit(RECENT_TRANSACTIONS_PAGE_SIZE),
      )
    : query(baseQuery, limit(RECENT_TRANSACTIONS_PAGE_SIZE));
}

function createDebtSettlementTransactionData(
  debt,
  debtId,
  accountId,
  createdAt = serverTimestamp(),
) {
  const isReceivable = debt.type === "receivable";
  const personName =
    String(debt.personName ?? "").trim() || "persona sin nombre";

  return {
    type: isReceivable ? "income" : "expense",
    amount: Math.abs(Number(debt.amount)),
    accountId,
    category: isReceivable ? "Préstamo cobrado" : "Deuda pagada",
    note: isReceivable
      ? `Cobro de préstamo de ${personName}`
      : `Pago de deuda a ${personName}`,
    createdAt,
    source: "debt_settlement",
    debtId,
  };
}

function createSavingsGoalMovementTransactionData(
  goal,
  goalId,
  accountId,
  amount,
  movement,
  createdAt = serverTimestamp(),
) {
  const isContribution = movement === "contribute";
  const goalName = String(goal.goalName ?? "").trim() || "meta sin nombre";

  return {
    type: isContribution ? "expense" : "income",
    amount,
    accountId,
    category: "Ahorro",
    note: `${isContribution ? "Aporte a meta" : "Retiro de meta"}: ${goalName}`,
    createdAt,
    source: "savings_goal_movement",
    savingsGoalId: goalId,
    movement,
  };
}

function getRecurringPeriodKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRecurringSubscriptionTransactionId(subscriptionId, period) {
  return `subscription-${subscriptionId}-${period}`;
}

function getSubscriptionAccountId(subscription) {
  const accountId = String(
    subscription.accountId ?? RECURRING_SUBSCRIPTION_ACCOUNT_ID,
  );

  return validAccounts.has(accountId)
    ? accountId
    : RECURRING_SUBSCRIPTION_ACCOUNT_ID;
}

function getSubscriptionChargeDay(dayOfMonth, date = new Date()) {
  const normalizedDay = Number(dayOfMonth);
  const lastDayOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();

  if (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > 31) {
    return null;
  }

  return Math.min(normalizedDay, lastDayOfMonth);
}

function isSubscriptionDue(subscription, date = new Date()) {
  if (subscription.active === false) {
    return false;
  }

  const chargeDay = getSubscriptionChargeDay(subscription.dayOfMonth, date);
  return chargeDay !== null && date.getDate() >= chargeDay;
}

function createRecurringSubscriptionTransactionData(
  subscription,
  subscriptionId,
  period,
) {
  const name = String(subscription.name ?? "").trim() || "Gasto fijo";

  return {
    type: "expense",
    amount: Math.abs(Number(subscription.amount)),
    accountId: getSubscriptionAccountId(subscription),
    category: subscription.category,
    note: `Pago recurrente: ${name}`,
    createdAt: serverTimestamp(),
    source: "recurring_subscription",
    subscriptionId,
    recurringPeriod: period,
  };
}

async function chargeSubscriptionInTransaction({
  transactionReference,
  accountReference,
  amount,
  transactionData,
}) {
  return runTransaction(
    db,
    async (firestoreTransaction) => {
      const existingTransaction = await firestoreTransaction.get(
        transactionReference,
      );

      if (existingTransaction.exists()) {
        return false;
      }

      const accountSnapshot = await firestoreTransaction.get(
        accountReference,
      );
      const balance = Number(accountSnapshot.data()?.balance);

      if (!accountSnapshot.exists() || !Number.isFinite(balance)) {
        throw new Error("La cuenta principal no está disponible.");
      }

      if (balance < amount) {
        throw new Error("Saldo insuficiente para el gasto fijo.");
      }

      firestoreTransaction.update(accountReference, {
        balance: increment(-amount),
      });
      firestoreTransaction.set(transactionReference, transactionData);

      return true;
    },
  );
}

export {
  chargeSubscriptionInTransaction,
  createDebtSettlementTransactionData,
  createRecurringSubscriptionTransactionData,
  createSavingsGoalMovementTransactionData,
  getRecentTransactionsQuery,
  getRecurringPeriodKey,
  getRecurringSubscriptionTransactionId,
  getSubscriptionAccountId,
  getSubscriptionChargeDay,
  isSubscriptionDue,
};
