import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { setButtonLoading } from "../ui/modalHelpers.js";
import { showErrorToast, showToast } from "../ui/toast.js";
import { buildTransactionFromAiPayload } from "../services/audio.js";
import { requestGemini } from "../services/gemini.js";
import {
  normalizeText,
  parsePlainJson,
  parseSmartTransactionLocally,
} from "../services/smartParsing.js";
import { registerTransactionAtomic } from "./transactions.js";

export async function handleSmartTransactionSubmit(event) {
  event.preventDefault();

  if (
    state.smartTransactionSubmitting ||
    state.audioStarting ||
    state.audioRecording ||
    state.audioProcessing
  ) {
    if (state.audioRecording) {
      showToast("Detén la grabación para procesar el movimiento.", "info");
    }
    return;
  }

  const naturalLanguageInput = dom.smartTransactionInput.value.trim();

  if (!naturalLanguageInput) {
    showErrorToast("Describe el movimiento que deseas registrar.");
    dom.smartTransactionInput.focus();
    return;
  }

  const localTransaction = parseSmartTransactionLocally(
    naturalLanguageInput,
  );
  if (!localTransaction && !navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    return;
  }

  state.smartTransactionSubmitting = true;
  const restoreButton = setButtonLoading(
    dom.smartTransactionSubmit,
    "",
  );

  try {
    let transaction = localTransaction;
    let usedGemini = false;

    if (!transaction) {
      const prompt = `
Convierte el texto del usuario en una transacción financiera.
Devuelve únicamente un objeto JSON válido que cumpla exactamente este formato:
{"type":"expense|income|transfer","amount":15.5,"account":"Yape|Efectivo","category":"Social|Fitness|Personal|Otros|Trabajo|Propinas"}

Reglas:
- Usa expense para gastos, income para ingresos y transfer para movimientos entre cuentas.
- En una transferencia, "account" es la cuenta de origen; la cuenta de destino será la otra cuenta.
- Si no se menciona cuenta, usa Efectivo.
- Para ingresos usa Trabajo, Propinas u Otros.
- Para transferencias usa Otros como categoría.
- "amount" siempre debe ser un número positivo, sin símbolo de moneda.
- No uses markdown, explicaciones, null ni propiedades adicionales.

TEXTO DEL USUARIO:
${JSON.stringify(naturalLanguageInput)}
      `.trim();
      const rawResponse = await requestGemini(prompt, {
        feature: "smart-transaction",
        dedupeKey: `smart:${normalizeText(naturalLanguageInput)}`,
        expectJson: true,
        maxOutputTokens: 512,
        thinkingLevel: "minimal",
      });
      transaction = buildTransactionFromAiPayload(
        parsePlainJson(rawResponse),
        naturalLanguageInput,
      );
      usedGemini = true;
    }

    const wasRegistered = await registerTransactionAtomic(transaction);
    if (wasRegistered) {
      dom.smartTransactionInput.value = "";
      showToast(
        usedGemini
          ? "Transacción registrada con IA"
          : "Transacción registrada al instante",
        "success",
      );
    }
  } catch (error) {
    console.error("No se pudo interpretar el registro inteligente.", error);
    if (!error.isGeminiHandled) {
      showErrorToast(
        "No pude interpretar el movimiento. Intenta ser más específico.",
      );
    }
  } finally {
    state.smartTransactionSubmitting = false;
    restoreButton();
  }
}
