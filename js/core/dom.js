const dom = {};

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
  dom.privacyToggle = getRequiredElement("#privacy-toggle");
  dom.privacyToggleIcon = getRequiredElement("#privacy-toggle-icon");
  dom.totalBalance = getRequiredElement("#total-balance");
  dom.yapeBalance = getRequiredElement("#yape-balance");
  dom.cashBalance = getRequiredElement("#cash-balance");
  dom.transactionsList = getRequiredElement("#recent-transactions-list");
  dom.loadMoreTransactionsButton = getRequiredElement(
    "#load-more-transactions-button",
  );
  dom.loadMoreTransactionsIcon = getRequiredElement(
    "#load-more-transactions-icon",
  );
  dom.loadMoreTransactionsLabel = getRequiredElement(
    "#load-more-transactions-label",
  );
  dom.smartTransactionForm = getRequiredElement(
    "#smart-transaction-form",
  );
  dom.smartTransactionInput = getRequiredElement(
    "#smart-transaction-input",
  );
  dom.smartMicrophoneButton = getRequiredElement(
    "#smart-microphone-button",
  );
  dom.smartMicrophoneIcon = getRequiredElement(
    "#smart-microphone-icon",
  );
  dom.smartMicrophoneLabel = getRequiredElement(
    "#smart-microphone-label",
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
  dom.transactionDetailModal = getRequiredElement(
    "#transaction-detail-modal",
  );
  dom.transactionDetailPanel = getRequiredElement(
    "#transaction-detail-panel",
  );
  dom.transactionDetailTitle = getRequiredElement(
    "#transaction-detail-title",
  );
  dom.transactionDetailAmount = getRequiredElement(
    "#transaction-detail-amount",
  );
  dom.transactionDetailCategory = getRequiredElement(
    "#transaction-detail-category",
  );
  dom.transactionDetailAccount = getRequiredElement(
    "#transaction-detail-account",
  );
  dom.transactionDetailDate = getRequiredElement(
    "#transaction-detail-date",
  );
  dom.transactionDetailNote = getRequiredElement(
    "#transaction-detail-note",
  );
  dom.transactionDetailClose = getRequiredElement(
    "#transaction-detail-close",
  );
  dom.transactionDetailCloseButtons = document.querySelectorAll(
    "[data-transaction-detail-close]",
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

  dom.subscriptionModal = getRequiredElement("#subscription-modal");
  dom.subscriptionPanel = getRequiredElement("#subscription-modal-panel");
  dom.subscriptionForm = getRequiredElement("#subscription-form");
  dom.subscriptionName = getRequiredElement("#subscription-name");
  dom.subscriptionFormError = getRequiredElement(
    "#subscription-form-error",
  );
  dom.subscriptionCloseButtons = document.querySelectorAll(
    "[data-subscription-modal-close]",
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
  dom.analysisPeriodButtons = document.querySelectorAll(
    "[data-analysis-period]",
  );
  dom.exportTransactionsButton = getRequiredElement(
    "#export-transactions-button",
  );
  dom.analysisAiButton = getRequiredElement("#analysis-ai-button");
  dom.analysisAiPanel = getRequiredElement("#analysis-ai-panel");
  dom.analysisAiContent = getRequiredElement("#analysis-ai-content");
  dom.newSubscriptionButton = getRequiredElement("#new-subscription-button");
  dom.subscriptionsList = getRequiredElement("#subscriptions-list");

  dom.toast = getRequiredElement("#app-toast");
  dom.toastIcon = getRequiredElement("#app-toast-icon");
  dom.toastMessage = getRequiredElement("#app-toast-message");
}

export { bindDom, dom, getRequiredElement };
