import {
  GEMINI_API_URL,
  GEMINI_COOLDOWN_STORAGE_KEY,
  GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  GEMINI_LAST_REQUEST_STORAGE_KEY,
  GEMINI_MIN_REQUEST_INTERVAL_MS,
  GEMINI_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS,
  SMART_TRANSACTION_RESPONSE_SCHEMA,
} from "../core/constants.js";

import { GEMINI_API_KEY } from "../core/secrets.js";
import { state } from "../core/state.js";
import {
  getStoredNumber,
  setStoredNumber,
} from "../core/storage.js";
import { wait } from "../core/utils.js";
import { showToast } from "../ui/toast.js";

function createGeminiRequestKey(prompt, feature) {
  let hash = 2166136261;
  const source = `${feature}:${prompt}`;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${feature}:${(hash >>> 0).toString(36)}`;
}

function setGeminiCooldown(durationMs) {
  const safeDuration = Math.max(
    GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS,
    Number(durationMs) || 0,
  );
  state.geminiCooldownUntil = Math.max(
    state.geminiCooldownUntil,
    Date.now() + safeDuration,
  );
  setStoredNumber(
    GEMINI_COOLDOWN_STORAGE_KEY,
    state.geminiCooldownUntil,
  );
}

export function getGeminiCooldownRemaining() {
  state.geminiCooldownUntil = Math.max(
    state.geminiCooldownUntil,
    getStoredNumber(GEMINI_COOLDOWN_STORAGE_KEY),
  );
  return Math.max(0, state.geminiCooldownUntil - Date.now());
}

function createGeminiCooldownError(remainingMs) {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const message = `IA en pausa por cuota gratuita. Reintenta en ${seconds} s.`;
  showToast(message, "info");
  const error = new Error(message);
  error.isGeminiHandled = true;
  error.geminiErrorType = "cooldown";
  error.retryAfterMs = remainingMs;
  return error;
}

function parseRetryAfterMs(retryAfterHeader, retryDelay) {
  const numericSeconds = Number(retryAfterHeader);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return numericSeconds * 1000;
  }

  const retryDate = Date.parse(String(retryAfterHeader || ""));
  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  const durationMatch = String(retryDelay || "").match(
    /^(\d+(?:\.\d+)?)s$/,
  );
  if (durationMatch) {
    return Number(durationMatch[1]) * 1000;
  }

  return GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

function runWithGeminiLock(callback) {
  if (navigator.locks?.request) {
    return navigator.locks.request(
      "finax-gemini-api",
      { mode: "exclusive" },
      callback,
    );
  }

  return callback();
}

export function requestGemini(
  prompt,
  {
    feature = "general",
    dedupeKey = "",
    ...requestOptions
  } = {},
) {
  const requestKey =
    dedupeKey || createGeminiRequestKey(String(prompt), feature);
  const pendingRequest = state.geminiPendingRequests.get(requestKey);

  if (pendingRequest) {
    console.info("[Finax IA] Solicitud duplicada reutilizada.", {
      feature,
      requestKey,
    });
    return pendingRequest;
  }

  const scheduledRequest = state.geminiQueueTail
    .catch(() => undefined)
    .then(() =>
      runWithGeminiLock(async () => {
        const cooldownRemaining = getGeminiCooldownRemaining();
        if (cooldownRemaining > 0) {
          throw createGeminiCooldownError(cooldownRemaining);
        }

        state.geminiLastRequestAt = Math.max(
          state.geminiLastRequestAt,
          getStoredNumber(GEMINI_LAST_REQUEST_STORAGE_KEY),
        );
        const intervalRemaining = Math.max(
          0,
          GEMINI_MIN_REQUEST_INTERVAL_MS -
            (Date.now() - state.geminiLastRequestAt),
        );
        if (intervalRemaining > 0) {
          await wait(intervalRemaining);
        }

        const requestId = ++state.geminiRequestSequence;
        state.geminiLastRequestAt = Date.now();
        setStoredNumber(
          GEMINI_LAST_REQUEST_STORAGE_KEY,
          state.geminiLastRequestAt,
        );
        console.info("[Finax IA] Enviando solicitud.", {
          requestId,
          feature,
          model: GEMINI_MODEL,
        });

        return performGeminiRequest(prompt, {
          ...requestOptions,
          feature,
          requestId,
        });
      }),
    );

  state.geminiPendingRequests.set(requestKey, scheduledRequest);
  state.geminiQueueTail = scheduledRequest.catch(() => undefined);
  scheduledRequest.then(
    () => state.geminiPendingRequests.delete(requestKey),
    () => state.geminiPendingRequests.delete(requestKey),
  );
  return scheduledRequest;
}

async function performGeminiRequest(
  prompt,
  {
    expectJson = false,
    jsonSchema = null,
    maxOutputTokens = 512,
    thinkingLevel = expectJson ? "minimal" : "low",
    inlineData = null,
    feature = "general",
    requestId = 0,
  } = {},
) {
  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    const offlineError = new Error(
      "Gemini no está disponible sin conexión.",
    );
    offlineError.isGeminiHandled = true;
    offlineError.geminiErrorType = "offline";
    throw offlineError;
  }

  const contentParts = [{ text: String(prompt) }];

  if (inlineData) {
    const mimeType = String(inlineData.mimeType ?? "").trim();
    const data = String(inlineData.data ?? "").trim();

    if (!mimeType.startsWith("audio/") || !data) {
      const mediaError = new TypeError(
        "Los datos de audio para Gemini no son válidos.",
      );
      mediaError.geminiErrorType = "invalid-media";
      throw mediaError;
    }

    contentParts.push({
      inlineData: {
        mimeType,
        data,
      },
    });
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    GEMINI_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: contentParts,
          },
        ],
        generationConfig: {
          maxOutputTokens: Math.min(
            Math.max(Math.trunc(Number(maxOutputTokens) || 1), 1),
            1024,
          ),
          thinkingConfig: {
            thinkingLevel: ["minimal", "low", "medium", "high"].includes(
              thinkingLevel,
            )
              ? thinkingLevel
              : "low",
          },
          ...(expectJson || jsonSchema
            ? {
                responseMimeType: "application/json",
                responseJsonSchema:
                  jsonSchema ?? SMART_TRANSACTION_RESPONSE_SCHEMA,
              }
            : {}),
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const responseBody = await response.text().catch(() => "");
      let errorPayload = null;
      try {
        errorPayload = JSON.parse(responseBody);
      } catch {
        // Some gateways return plain text or HTML error pages.
      }

      const errorDetails = Array.isArray(errorPayload?.error?.details)
        ? errorPayload.error.details
        : [];
      const errorInfo = errorDetails.find(
        (detail) =>
          typeof detail === "object" &&
          detail !== null &&
          String(detail["@type"] || "").endsWith(
            "google.rpc.ErrorInfo",
          ),
      );
      const retryInfo = errorDetails.find(
        (detail) =>
          typeof detail === "object" &&
          detail !== null &&
          String(detail["@type"] || "").endsWith(
            "google.rpc.RetryInfo",
          ),
      );
      const quotaFailure = errorDetails.find(
        (detail) =>
          typeof detail === "object" &&
          detail !== null &&
          String(detail["@type"] || "").endsWith(
            "google.rpc.QuotaFailure",
          ),
      );
      const httpError = new Error(
        `Gemini respondió con HTTP ${response.status} ${response.statusText}.`,
      );
      httpError.geminiErrorType = "http";
      httpError.httpStatus = response.status;
      httpError.responseBody = responseBody.slice(0, 600);
      httpError.googleReason = errorInfo?.reason ?? null;
      httpError.googleMessage = errorPayload?.error?.message ?? null;
      httpError.retryAfterMs = parseRetryAfterMs(
        retryAfterHeader,
        retryInfo?.retryDelay,
      );
      httpError.quotaViolations = Array.isArray(
        quotaFailure?.violations,
      )
        ? quotaFailure.violations
        : [];

      if (response.status === 429) {
        setGeminiCooldown(httpError.retryAfterMs);
      }
      throw httpError;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const responseError = new Error(
        "Gemini devolvió una respuesta que no es JSON válido.",
        { cause: error },
      );
      responseError.geminiErrorType = "invalid-response";
      throw responseError;
    }

    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text || candidate?.finishReason === "MAX_TOKENS") {
      const emptyResponseError = new Error(
        candidate?.finishReason === "MAX_TOKENS"
          ? "Gemini agotó el límite antes de completar la respuesta."
          : "Gemini no devolvió contenido utilizable.",
      );
      emptyResponseError.geminiErrorType = "invalid-response";
      emptyResponseError.finishReason = candidate?.finishReason ?? null;
      throw emptyResponseError;
    }

    console.info("[Finax IA] Solicitud completada.", {
      requestId,
      feature,
      finishReason: candidate?.finishReason ?? "UNKNOWN",
    });
    return text;
  } catch (error) {
    console.error("La solicitud a Gemini falló.", error);

    let toastMessage;
    let toastTone = "error";

    if (!navigator.onLine) {
      toastMessage = "IA no disponible sin conexión";
      toastTone = "info";
    } else if (error.geminiErrorType === "http") {
      const httpContext = {
        400: "petición inválida",
        401: "clave no autorizada",
        403: "clave sin permisos",
        404: "modelo no disponible",
        429: "cuota agotada",
      };
      const contextLabel =
        error.googleReason === "ACCESS_TOKEN_TYPE_UNSUPPORTED"
          ? "tipo de clave incompatible o sin vincular"
          : httpContext[error.httpStatus];
      if (error.httpStatus === 429) {
        const retrySeconds = Math.max(
          1,
          Math.ceil(
            (error.retryAfterMs ||
              GEMINI_DEFAULT_RATE_LIMIT_COOLDOWN_MS) / 1000,
          ),
        );
        toastMessage = `Límite gratuito temporal. Reintenta en ${retrySeconds} s.`;
        toastTone = "info";
        console.warn("[Finax IA] Cuota limitada por Google.", {
          feature,
          requestId,
          retryAfterMs: error.retryAfterMs,
          violations: error.quotaViolations,
        });
      } else {
        toastMessage = `Error IA: HTTP ${error.httpStatus}${
          contextLabel ? ` (${contextLabel})` : ""
        }`;
      }
    } else if (error.name === "AbortError") {
      toastMessage = "Error IA: tiempo de espera agotado";
    } else if (error instanceof TypeError) {
      toastMessage = "Fallo de conexión API";
    } else if (error.geminiErrorType === "invalid-response") {
      toastMessage =
        error.finishReason === "MAX_TOKENS"
          ? "La IA devolvió una respuesta incompleta. Inténtalo otra vez."
          : "Error IA: respuesta inválida";
    } else {
      const safeMessage = String(error.message || "fallo desconocido")
        .replace(/\s+/g, " ")
        .slice(0, 90);
      toastMessage = `Error IA: ${safeMessage}`;
    }

    showToast(toastMessage, toastTone);
    const handledError = new Error(toastMessage, {
      cause: error,
    });
    handledError.isGeminiHandled = true;
    handledError.geminiErrorType =
      error.geminiErrorType ?? "request";
    handledError.httpStatus = error.httpStatus ?? null;
    handledError.googleReason = error.googleReason ?? null;
    handledError.retryAfterMs = error.retryAfterMs ?? null;
    throw handledError;
  } finally {
    window.clearTimeout(timeout);
  }
}
