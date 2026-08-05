import {
  activeNavClasses,
  inactiveNavClasses,
} from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { cancelConfirmation } from "../ui/confirmation.js";
import { setNotificationsOpen } from "../services/notifications.js";
import {
  closeTransactionDetail,
  closeTransactionModal,
  deleteTransaction,
  openTransactionDetail,
  setTransactionType,
  swapTransferAccounts,
} from "./transactions.js";
import {
  closeDebtModal,
  deleteDebt,
  renderDebts,
  settleDebt,
} from "./debts.js";
import {
  closeSavingsModal,
  deleteSavingsGoal,
  moveSavingsGoal,
} from "./savings.js";
import {
  closeSubscriptionModal,
  deleteSubscription,
  setSubscriptionActive,
} from "./subscriptions.js";

export function switchView(view) {
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

export function handleDocumentClick(event) {
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

  const accountButton = event.target.closest("[data-account-select]");
  if (accountButton) {
    event.preventDefault();
    const accountId = accountButton.dataset.accountSelect;
    dom.transactionAccount.value = accountId;
    document
      .querySelectorAll("#transaction-modal [data-account-select]")
      .forEach((btn) => {
        const isActive = btn.dataset.accountSelect === accountId;
        btn.setAttribute("aria-pressed", String(isActive));
        btn.classList.toggle("border-emerald-400/40", isActive);
        btn.classList.toggle("bg-emerald-400/10", isActive);
        btn.classList.toggle("text-emerald-300", isActive);
        btn.classList.toggle("border-white/10", !isActive);
        btn.classList.toggle("bg-white/[0.04]", !isActive);
        btn.classList.toggle("text-slate-400", !isActive);
      });
    return;
  }

  const debtAccountButton = event.target.closest("[data-debt-account-select]");
  if (debtAccountButton) {
    event.preventDefault();
    const accountId = debtAccountButton.dataset.debtAccountSelect;
    document.getElementById("debt-account").value = accountId;
    document
      .querySelectorAll("#debt-modal [data-debt-account-select]")
      .forEach((btn) => {
        const isActive = btn.dataset.debtAccountSelect === accountId;
        btn.setAttribute("aria-pressed", String(isActive));
        btn.classList.toggle("border-emerald-400/40", isActive);
        btn.classList.toggle("bg-emerald-400/10", isActive);
        btn.classList.toggle("text-emerald-300", isActive);
        btn.classList.toggle("border-white/10", !isActive);
        btn.classList.toggle("bg-white/[0.04]", !isActive);
        btn.classList.toggle("text-slate-400", !isActive);
      });
    return;
  }

  const confirmAccountButton = event.target.closest("[data-confirm-account-select]");
  if (confirmAccountButton) {
    event.preventDefault();
    const accountId = confirmAccountButton.dataset.confirmAccountSelect;
    document.getElementById("confirmation-account").value = accountId;
    document
      .querySelectorAll("#confirmation-dialog [data-confirm-account-select]")
      .forEach((btn) => {
        const isActive = btn.dataset.confirmAccountSelect === accountId;
        btn.setAttribute("aria-pressed", String(isActive));
        btn.classList.toggle("border-emerald-400/40", isActive);
        btn.classList.toggle("bg-emerald-400/10", isActive);
        btn.classList.toggle("text-emerald-300", isActive);
        btn.classList.toggle("border-white/10", !isActive);
        btn.classList.toggle("bg-white/[0.04]", !isActive);
        btn.classList.toggle("text-slate-400", !isActive);
      });
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

  const deleteSubscriptionButton = event.target.closest("[data-delete-subscription]");
  if (deleteSubscriptionButton) {
    const subscriptionDocument = state.subscriptions.get(
      deleteSubscriptionButton.dataset.deleteSubscription,
    );
    if (subscriptionDocument) {
      void deleteSubscription(subscriptionDocument, deleteSubscriptionButton);
    }
    return;
  }

  const deleteGoalButton = event.target.closest("[data-delete-goal]");
  if (deleteGoalButton) {
    const goalDocument = state.savingsGoals.get(
      deleteGoalButton.dataset.deleteGoal,
    );
    if (goalDocument) {
      void deleteSavingsGoal(goalDocument, deleteGoalButton);
    }
    return;
  }

  const deleteDebtButton = event.target.closest("[data-delete-debt]");
  if (deleteDebtButton) {
    const debtDocument = state.debts.get(deleteDebtButton.dataset.deleteDebt);
    if (debtDocument) {
      void deleteDebt(debtDocument, deleteDebtButton);
    }
    return;
  }

  const transactionCard = event.target.closest("[data-view-transaction]");
  if (transactionCard) {
    const transactionDocument = state.transactions.get(
      transactionCard.dataset.viewTransaction,
    );
    if (transactionDocument) {
      openTransactionDetail(transactionDocument, transactionCard);
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
    return;
  }

  const toggleSubscriptionButton = event.target.closest(
    "[data-toggle-subscription]",
  );
  if (toggleSubscriptionButton) {
    const subscriptionDocument = state.subscriptions.get(
      toggleSubscriptionButton.dataset.toggleSubscription,
    );
    if (subscriptionDocument) {
      void setSubscriptionActive(
        subscriptionDocument,
        toggleSubscriptionButton,
      );
    }
    return;
  }
}

export function handleGlobalKeydown(event) {
  if (
    ["Enter", " "].includes(event.key) &&
    event.target instanceof Element
  ) {
    const transactionCard = event.target.closest(
      "[data-view-transaction]",
    );
    const isNestedControl = event.target.closest(
      "button, a, input, select, textarea",
    );

    if (transactionCard && !isNestedControl) {
      event.preventDefault();
      const transactionDocument = state.transactions.get(
        transactionCard.dataset.viewTransaction,
      );
      if (transactionDocument) {
        openTransactionDetail(transactionDocument, transactionCard);
      }
      return;
    }
  }

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

  if (
    dom.transactionDetailModal.getAttribute("aria-hidden") === "false"
  ) {
    closeTransactionDetail();
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
    return;
  }

  if (dom.subscriptionModal.getAttribute("aria-hidden") === "false") {
    closeSubscriptionModal();
  }
}
