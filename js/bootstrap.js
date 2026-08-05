import { BUILD_ID, PRIVACY_MODE_STORAGE_KEY } from "./core/constants.js";
import { state } from "./core/state.js";
import { bindDom, dom } from "./core/dom.js";
import { getStoredBoolean } from "./core/storage.js";
import {
  acceptConfirmation,
  cancelConfirmation,
} from "./ui/confirmation.js";
import {
  renderHeaderDate,
  setPrivacyMode,
  togglePrivacyMode,
} from "./ui/header.js";
import { exportTransactionsCsv } from "./services/analytics.js";
import {
  initializeAudioRecorder,
  toggleAudioRecording,
} from "./services/audio.js";
import {
  listenToAccounts,
  listenToDebts,
  listenToExpenseAnalysis,
  listenToSavingsGoals,
  listenToSubscriptions,
  listenToTransactions,
} from "./services/firestore/listeners.js";
import {
  initializeNativeNotifications,
  registerServiceWorkerAfterLoad,
  renderDebtAlerts,
  updateDebtAlerts,
} from "./services/notifications.js";
import {
  closeTransactionDetail,
  closeTransactionModal,
  handleTransactionSubmit,
  loadRecentTransactionsPage,
  openTransactionModal,
  registerTransactionAtomic,
  renderBalanceSummary,
  renderEmptyTransactions,
  setTransactionType,
  syncRecentTransactionsList,
  updateLoadMoreButton,
} from "./features/transactions.js";
import { handleSmartTransactionSubmit } from "./features/smartTransaction.js";
import {
  applyDebtDateBounds,
  backfillPaidDebtTransactions,
  closeDebtModal,
  handleDebtDateInput,
  handleDebtSubmit,
  openDebtModal,
  renderDebts,
} from "./features/debts.js";
import {
  closeSavingsModal,
  handleSavingsGoalSubmit,
  openSavingsModal,
  renderSavingsGoals,
} from "./features/savings.js";
import {
  closeSubscriptionModal,
  handleSubscriptionSubmit,
  openSubscriptionModal,
  processDueSubscriptions,
  renderSubscriptions,
} from "./features/subscriptions.js";
import {
  generateAiAnalysis,
  handleAnalysisPeriodChange,
  refreshExpenseAnalysis,
  updateAnalysisPeriodButtons,
} from "./features/analysis.js";
import {
  handleDocumentClick,
  handleGlobalKeydown,
  switchView,
} from "./features/navigation.js";

function initializeApp() {
  if (state.initialized) {
    return;
  }

  bindDom();
  state.initialized = true;
  document.documentElement.dataset.finaxBuild = BUILD_ID;
  setPrivacyMode(getStoredBoolean(PRIVACY_MODE_STORAGE_KEY));

  dom.fab.addEventListener("click", openTransactionModal);
  dom.newDebtButton.addEventListener("click", openDebtModal);
  dom.newSavingsGoalButton.addEventListener("click", openSavingsModal);
  dom.newSubscriptionButton.addEventListener("click", openSubscriptionModal);
  dom.privacyToggle.addEventListener("click", togglePrivacyMode);
  dom.exportTransactionsButton.addEventListener("click", exportTransactionsCsv);
  dom.transactionForm.addEventListener("submit", handleTransactionSubmit);
  dom.smartTransactionForm.addEventListener(
    "submit",
    handleSmartTransactionSubmit,
  );
  dom.smartMicrophoneButton.addEventListener(
    "click",
    () =>
      toggleAudioRecording({
        registerTransaction: registerTransactionAtomic,
      }),
  );
  dom.debtForm.addEventListener("submit", handleDebtSubmit);
  dom.debtDateLent.addEventListener("input", handleDebtDateInput);
  dom.debtExpectedDate.addEventListener("input", handleDebtDateInput);
  dom.savingsForm.addEventListener("submit", handleSavingsGoalSubmit);
  dom.subscriptionForm.addEventListener("submit", handleSubscriptionSubmit);
  dom.analysisPeriodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleAnalysisPeriodChange(button.dataset.analysisPeriod);
    });
  });
  dom.analysisAiButton.addEventListener("click", generateAiAnalysis);
  dom.transactionCloseButtons.forEach((button) => {
    button.addEventListener("click", closeTransactionModal);
  });
  dom.transactionDetailCloseButtons.forEach((button) => {
    button.addEventListener("click", closeTransactionDetail);
  });
  dom.loadMoreTransactionsButton.addEventListener("click", () => {
    void loadRecentTransactionsPage();
  });
  dom.debtCloseButtons.forEach((button) => {
    button.addEventListener("click", closeDebtModal);
  });
  dom.savingsCloseButtons.forEach((button) => {
    button.addEventListener("click", closeSavingsModal);
  });
  dom.subscriptionCloseButtons.forEach((button) => {
    button.addEventListener("click", closeSubscriptionModal);
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
  initializeAudioRecorder();
  applyDebtDateBounds();
  setTransactionType("expense");
  switchView("home");
  renderDebts();
  renderDebtAlerts();
  renderSavingsGoals();
  renderSubscriptions();
  renderEmptyTransactions();
  updateAnalysisPeriodButtons();
  refreshExpenseAnalysis();

  listenToAccounts({
    onBalanceSummary: renderBalanceSummary,
    onProcessDueSubscriptions: processDueSubscriptions,
  });
  listenToTransactions({
    onBalanceSummary: renderBalanceSummary,
    onTransactionDetailChange: closeTransactionDetail,
    onEmptyTransactions: renderEmptyTransactions,
    onLoadRecentPage: loadRecentTransactionsPage,
    onSyncRecentList: syncRecentTransactionsList,
    onUpdateLoadMore: updateLoadMoreButton,
    onProcessDueSubscriptions: processDueSubscriptions,
  });
  listenToExpenseAnalysis({
    onExpenseAnalysis: refreshExpenseAnalysis,
  });
  listenToDebts({
    onDebtsChange: renderDebts,
    onDebtAlertsChange: () =>
      updateDebtAlerts({
        onNotificationClick: () => switchView("debts"),
      }),
    onDebtBackfill: backfillPaidDebtTransactions,
  });
  listenToSavingsGoals({
    onSavingsGoalsChange: renderSavingsGoals,
  });
  listenToSubscriptions({
    onSubscriptionsChange: renderSubscriptions,
    onProcessDueSubscriptions: processDueSubscriptions,
  });
  void initializeNativeNotifications({
    onNotificationClick: () => switchView("debts"),
  });
  registerServiceWorkerAfterLoad();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
