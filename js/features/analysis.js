import {
  AUDIT_RESPONSE_SCHEMA,
  analysisPeriodOptions,
  categoriesByType,
} from "../core/constants.js";
import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  escapeHtml,
  formatCurrency,
} from "../core/utils.js";
import { setButtonLoading } from "../ui/modalHelpers.js";
import { showToast } from "../ui/toast.js";
import {
  filterExpensesByPeriod,
  getAnalysisPeriodOption,
} from "../services/analytics.js";
import { requestGemini } from "../services/gemini.js";
import {
  compactAiText,
  parsePlainJson,
} from "../services/smartParsing.js";

function renderExpenseAnalysis(expenses) {
  const categories = ["Social", "Fitness", "Personal", "Ahorro", "Otros"];
  const categoryTotals = {
    Social: 0,
    Fitness: 0,
    Personal: 0,
    Ahorro: 0,
    Otros: 0,
  };

  expenses.forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount));
    if (!Number.isFinite(amount)) {
      return;
    }

    const category = Object.hasOwn(
      categoryTotals,
      transaction.category,
    )
      ? transaction.category
      : "Otros";
    categoryTotals[category] += amount;
  });

  const values = categories.map((category) => categoryTotals[category]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const hasExpenses = total > 0;

  dom.analysisExpenseTotal.textContent = formatCurrency(total);
  dom.analysisEmptyState.classList.toggle("hidden", hasExpenses);
  dom.analysisChartCanvas.classList.toggle("invisible", !hasExpenses);

  if (!hasExpenses) {
    state.expenseChart?.destroy();
    state.expenseChart = null;
    return;
  }

  if (!window.Chart) {
    console.error("Chart.js no está disponible.");
    dom.analysisEmptyState.classList.remove("hidden");
    dom.analysisChartCanvas.classList.add("invisible");
    return;
  }

  if (state.expenseChart) {
    state.expenseChart.data.datasets[0].data = values;
    state.expenseChart.update();
    return;
  }

  state.expenseChart = new window.Chart(dom.analysisChartCanvas, {
    type: "doughnut",
    data: {
      labels: categories,
      datasets: [
        {
          data: values,
          backgroundColor: [
            "rgba(34, 211, 238, 0.78)",
            "rgba(52, 211, 153, 0.78)",
            "rgba(251, 113, 133, 0.78)",
            "rgba(96, 165, 250, 0.78)",
            "rgba(168, 85, 247, 0.78)",
          ],
          hoverBackgroundColor: [
            "rgba(34, 211, 238, 0.95)",
            "rgba(52, 211, 153, 0.95)",
            "rgba(251, 113, 133, 0.95)",
            "rgba(96, 165, 250, 0.95)",
            "rgba(168, 85, 247, 0.95)",
          ],
          borderWidth: 0,
          hoverBorderWidth: 0,
          spacing: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      animation: {
        duration: 450,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#cbd5e1",
            padding: 18,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.94)",
          borderColor: "rgba(148, 163, 184, 0.18)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${context.label}: ${formatCurrency(context.parsed)}`;
            },
          },
        },
      },
    },
  });
}

export function refreshExpenseAnalysis() {
  state.filteredExpenseTransactions = filterExpensesByPeriod(
    state.expenseTransactions,
    state.analysisPeriod,
  );
  renderExpenseAnalysis(state.filteredExpenseTransactions);
  dom.analysisAiPanel.classList.add("hidden");
  dom.analysisAiContent.innerHTML = "";
}

export function updateAnalysisPeriodButtons() {
  dom.analysisPeriodButtons.forEach((button) => {
    const isActive = button.dataset.analysisPeriod === state.analysisPeriod;

    button.classList.remove(
      "border-blue-400/30",
      "bg-blue-500/15",
      "text-blue-200",
      "border-white/10",
      "bg-white/[0.04]",
      "text-slate-400",
    );
    button.classList.add(
      ...(isActive
        ? ["border-blue-400/30", "bg-blue-500/15", "text-blue-200"]
        : ["border-white/10", "bg-white/[0.04]", "text-slate-400"]),
    );
    button.setAttribute("aria-pressed", String(isActive));
  });
}

export function handleAnalysisPeriodChange(period) {
  state.analysisPeriod = analysisPeriodOptions.some(
    (option) => option.id === period,
  )
    ? period
    : "current";
  updateAnalysisPeriodButtons();
  refreshExpenseAnalysis();
}

export async function generateAiAnalysis() {
  if (state.aiAnalysisRunning) {
    return;
  }

  const expenses = state.filteredExpenseTransactions;
  if (expenses.length === 0) {
    showToast("No hay gastos en este periodo para analizar.", "info");
    return;
  }

  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    return;
  }

  state.aiAnalysisRunning = true;
  const restoreButton = setButtonLoading(
    dom.analysisAiButton,
    "Analizando",
  );
  const periodLabel = getAnalysisPeriodOption(state.analysisPeriod).label;
  const categoryTotals = expenses.reduce((totals, transaction) => {
    const category = categoriesByType.expense.includes(
      transaction.category,
    )
      ? transaction.category
      : "Otros";
    totals[category] =
      (totals[category] ?? 0) +
      Math.abs(Number(transaction.amount) || 0);
    return totals;
  }, {});
  const expenseSummary = {
    cantidad: expenses.length,
    total: Object.values(categoryTotals).reduce(
      (sum, amount) => sum + amount,
      0,
    ),
    porCategoria: categoryTotals,
    mayoresGastos: [...expenses]
      .sort(
        (first, second) =>
          Math.abs(Number(second.amount) || 0) -
          Math.abs(Number(first.amount) || 0),
      )
      .slice(0, 5)
      .map((transaction) => ({
        categoria: transaction.category || "Otros",
        monto: Math.abs(Number(transaction.amount) || 0),
        detalle: String(transaction.note || "").slice(0, 40),
      })),
  };
  const savingsData = [...state.savingsGoals.values()].slice(0, 5).map(
    (goalDocument) => {
      const goal = goalDocument.data();
      return {
        meta: goal.goalName,
        ahorrado: Number(goal.currentSaved) || 0,
        objetivo: Number(goal.targetAmount) || 0,
        aporteMensual: Number(goal.monthlyContribution) || 0,
      };
    },
  );
  const prompt = `
Eres un auditor financiero. Analiza este resumen del periodo "${periodLabel}":
${JSON.stringify(expenseSummary)}

Contexto de ahorro:
${JSON.stringify(savingsData)}

Devuelve un objeto JSON con "bullets", un arreglo de exactamente 3 textos:
1. El mayor punto de fuga.
2. Ritmo de ahorro.
3. Una sugerencia accionable.
Cada viñeta debe ocupar una línea y tener máximo 130 caracteres.
No uses markdown, subtítulos, introducción, despedida ni campos adicionales.
  `.trim();

  try {
    const response = await requestGemini(prompt, {
      feature: "monthly-audit",
      expectJson: true,
      jsonSchema: AUDIT_RESPONSE_SCHEMA,
      maxOutputTokens: 1024,
      thinkingLevel: "minimal",
    });
    const parsedResponse = parsePlainJson(response);
    const bullets = Array.isArray(parsedResponse.bullets)
      ? parsedResponse.bullets
          .map((bullet) => compactAiText(bullet, 140))
          .filter(Boolean)
          .slice(0, 3)
      : [];

    if (bullets.length !== 3) {
      throw new Error(
        "Gemini no devolvió las tres conclusiones requeridas.",
      );
    }

    dom.analysisAiContent.innerHTML = bullets
      .map(
        (bullet, index) => `
          <li class="flex min-w-0 items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-xs font-bold text-blue-300">${index + 1}</span>
            <p class="min-w-0 flex-1 whitespace-pre-line break-words [overflow-wrap:anywhere]">${escapeHtml(bullet)}</p>
          </li>
        `,
      )
      .join("");
    dom.analysisAiPanel.classList.remove("hidden");
  } catch (error) {
    if (!error.isGeminiHandled) {
      console.error("No se pudo generar el diagnóstico.", error);
    }
  } finally {
    state.aiAnalysisRunning = false;
    restoreButton();
  }
}
