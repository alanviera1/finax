import {
  AUDIO_RECORDING_MIME_TYPES,
  AUDIO_TRANSACTION_RESPONSE_SCHEMA,
  MAX_AUDIO_RECORDING_DURATION_MS,
  MAX_INLINE_AUDIO_BYTES,
  validTransactionTypes,
} from "../core/constants.js";

import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { showErrorToast, showToast } from "../ui/toast.js";
import { requestGemini } from "./gemini.js";
import {
  normalizeAccountId,
  normalizeSmartAmount,
  normalizeSmartCategory,
  normalizeSmartTransactionType,
  parsePlainJson,
} from "./smartParsing.js";

function getMicrophoneSetupErrorMessage(error) {
  if (error?.code === "insecure-context") {
    return "El micrófono requiere HTTPS o abrir la app desde localhost.";
  }

  const messages = {
    NotAllowedError:
      "El navegador bloqueó el micrófono. Habilítalo para este sitio.",
    SecurityError:
      "El navegador bloqueó el micrófono por seguridad.",
    NotFoundError: "No se encontró ningún micrófono en el dispositivo.",
    DevicesNotFoundError:
      "No se encontró ningún micrófono en el dispositivo.",
    NotReadableError:
      "El micrófono está siendo usado por otra aplicación.",
    TrackStartError:
      "El micrófono está siendo usado por otra aplicación.",
    OverconstrainedError:
      "El micrófono disponible no cumple los requisitos del navegador.",
  };

  return (
    messages[error?.name] ??
    "No se pudo iniciar el micrófono. Revisa los permisos del navegador."
  );
}

function setAudioCaptureUi(mode = "idle") {
  const isStarting = mode === "starting";
  const isRecording = mode === "recording";
  const isProcessing = mode === "processing";
  const isBusy = isStarting || isRecording || isProcessing;

  dom.smartMicrophoneButton.classList.remove(
    "w-10",
    "w-auto",
    "px-3",
    "border-rose-400/40",
    "bg-rose-400/10",
    "text-rose-300",
    "border-blue-400/40",
    "bg-blue-400/10",
    "text-blue-300",
    "animate-pulse",
  );
  dom.smartMicrophoneButton.classList.add(
    ...(isBusy ? ["w-auto", "px-3"] : ["w-10"]),
  );
  dom.smartMicrophoneLabel.classList.toggle("hidden", !isBusy);
  dom.smartMicrophoneButton.disabled = isStarting || isProcessing;
  dom.smartMicrophoneButton.setAttribute(
    "aria-pressed",
    String(isRecording),
  );
  dom.smartMicrophoneButton.toggleAttribute("aria-busy", isProcessing);

  if (isRecording) {
    dom.smartMicrophoneButton.classList.add(
      "border-rose-400/40",
      "bg-rose-400/10",
      "text-rose-300",
      "animate-pulse",
    );
    dom.smartMicrophoneButton.setAttribute(
      "aria-label",
      "Detener grabación",
    );
    dom.smartMicrophoneIcon.className =
      "fa-solid fa-stop shrink-0";
    dom.smartMicrophoneLabel.textContent = "Grabando...";
    return;
  }

  if (isStarting) {
    dom.smartMicrophoneButton.classList.add(
      "border-blue-400/40",
      "bg-blue-400/10",
      "text-blue-300",
    );
    dom.smartMicrophoneButton.setAttribute(
      "aria-label",
      "Activando micrófono",
    );
    dom.smartMicrophoneIcon.className =
      "fa-solid fa-circle-notch fa-spin shrink-0";
    dom.smartMicrophoneLabel.textContent = "Activando...";
    return;
  }

  if (isProcessing) {
    dom.smartMicrophoneButton.classList.add(
      "border-blue-400/40",
      "bg-blue-400/10",
      "text-blue-300",
    );
    dom.smartMicrophoneButton.setAttribute(
      "aria-label",
      "Procesando audio",
    );
    dom.smartMicrophoneIcon.className =
      "fa-solid fa-circle-notch fa-spin shrink-0";
    dom.smartMicrophoneLabel.textContent = "Procesando audio...";
    return;
  }

  dom.smartMicrophoneButton.setAttribute(
    "aria-label",
    "Grabar movimiento por voz",
  );
  dom.smartMicrophoneIcon.className =
    "fa-solid fa-microphone shrink-0";
  dom.smartMicrophoneLabel.textContent = "";
}

function getSupportedAudioMimeType() {
  if (
    typeof window.MediaRecorder !== "function" ||
    typeof window.MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }

  return (
    AUDIO_RECORDING_MIME_TYPES.find((mimeType) =>
      window.MediaRecorder.isTypeSupported(mimeType),
    ) ?? ""
  );
}

function normalizeAudioMimeType(value) {
  const mimeType = String(value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mimeType.startsWith("audio/") ? mimeType : "audio/webm";
}

function stopMicrophoneTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function clearAudioCaptureState(recorder, stream) {
  window.clearTimeout(state.audioStopTimer);
  state.audioStopTimer = null;
  stopMicrophoneTracks(stream);

  if (state.mediaRecorder === recorder) {
    state.mediaRecorder = null;
    state.microphoneStream = null;
    state.audioChunks = [];
    state.audioStarting = false;
    state.audioRecording = false;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const dataUrl = String(reader.result ?? "");
      const separatorIndex = dataUrl.indexOf(",");

      if (separatorIndex < 0) {
        reject(new Error("No se pudo codificar el audio."));
        return;
      }

      resolve(dataUrl.slice(separatorIndex + 1));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("No se pudo leer el audio."));
    });
    reader.readAsDataURL(blob);
  });
}

function writeWavText(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodePcm16Wav(channelData, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = channelData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeWavText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeWavText(view, 8, "WAVE");
  writeWavText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeWavText(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  channelData.forEach((sample) => {
    const clampedSample = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      offset,
      clampedSample < 0
        ? clampedSample * 0x8000
        : clampedSample * 0x7fff,
      true,
    );
    offset += bytesPerSample;
  });

  return new Blob([buffer], { type: "audio/wav" });
}

async function convertRecordedAudioToWav(blob) {
  const AudioContextConstructor =
    window.AudioContext || window.webkitAudioContext;

  if (typeof AudioContextConstructor !== "function") {
    throw new Error(
      "El navegador no puede preparar audio compatible con Gemini.",
    );
  }

  const audioContext = new AudioContextConstructor();
  try {
    const decodedAudio = await audioContext.decodeAudioData(
      await blob.arrayBuffer(),
    );
    const monoSamples = new Float32Array(decodedAudio.length);

    for (
      let channelIndex = 0;
      channelIndex < decodedAudio.numberOfChannels;
      channelIndex += 1
    ) {
      const channelSamples = decodedAudio.getChannelData(channelIndex);
      for (
        let sampleIndex = 0;
        sampleIndex < channelSamples.length;
        sampleIndex += 1
      ) {
        monoSamples[sampleIndex] +=
          channelSamples[sampleIndex] /
          decodedAudio.numberOfChannels;
      }
    }

    return encodePcm16Wav(monoSamples, decodedAudio.sampleRate);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export function buildTransactionFromAiPayload(payload, fallbackNote = "") {
  if (payload?.understood === false) {
    throw new Error("No se entendió el movimiento del audio.");
  }

  const type = normalizeSmartTransactionType(payload?.type);
  const amount = normalizeSmartAmount(payload?.amount);
  const accountId =
    normalizeAccountId(payload?.account) ?? "efectivo";

  if (
    !validTransactionTypes.has(type) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !accountId
  ) {
    throw new Error("Gemini devolvió una transacción incompleta.");
  }

  if (type === "transfer") {
    return {
      type,
      amount,
      sourceAccountId: accountId,
      destinationAccountId:
        accountId === "yape" ? "efectivo" : "yape",
    };
  }

  return {
    type,
    amount,
    accountId,
    category: normalizeSmartCategory(type, payload?.category),
    note:
      type === "expense"
        ? String(payload?.note || fallbackNote).trim().slice(0, 500)
        : "",
  };
}

async function processRecordedAudio(
  blob,
  sourceMimeType,
  recordingId,
  { registerTransaction } = {},
) {
  state.audioProcessing = true;
  setAudioCaptureUi("processing");

  if (!blob.size) {
    state.audioProcessing = false;
    setAudioCaptureUi();
    showErrorToast("No se capturó audio. Inténtalo nuevamente.");
    return;
  }

  if (blob.size > MAX_INLINE_AUDIO_BYTES) {
    state.audioProcessing = false;
    setAudioCaptureUi();
    showErrorToast("El audio es demasiado largo. Graba un movimiento más breve.");
    return;
  }

  try {
    if (!navigator.onLine) {
      showToast("IA no disponible sin conexión", "info");
      return;
    }

    const geminiAudioBlob = await convertRecordedAudioToWav(blob);
    if (geminiAudioBlob.size > MAX_INLINE_AUDIO_BYTES) {
      throw new Error(
        "El audio convertido supera el límite seguro de la aplicación.",
      );
    }

    const audioData = await blobToBase64(geminiAudioBlob);
    const prompt = `
Escucha este audio en español y extrae un único movimiento financiero.
Devuelve únicamente JSON válido con este formato exacto:
{"understood":true,"type":"expense|income|transfer","amount":15.5,"account":"Yape|Efectivo","category":"Social|Fitness|Personal|Otros|Trabajo|Propinas","note":"detalle breve del gasto"}

Reglas:
- Si el audio no contiene un movimiento claro, usa understood=false, amount=0 y valores válidos en los demás campos.
- Usa expense para gastos, income para ingresos y transfer para movimientos entre cuentas.
- En transfer, account es la cuenta de origen y la cuenta de destino será la otra.
- Si no se menciona cuenta, usa Efectivo.
- Para ingresos usa Trabajo, Propinas u Otros; para gastos usa Social, Fitness, Personal u Otros.
- Para transferencias usa Otros. La nota debe quedar vacía en ingresos y transferencias.
- Conserva en note el detalle específico completo del gasto, con máximo 500 caracteres.
- No uses markdown, explicaciones, null ni propiedades adicionales.
    `.trim();
    const rawResponse = await requestGemini(prompt, {
      feature: "audio-transaction",
      dedupeKey: `audio:${recordingId}:${blob.size}`,
      expectJson: true,
      jsonSchema: AUDIO_TRANSACTION_RESPONSE_SCHEMA,
      maxOutputTokens: 512,
      thinkingLevel: "minimal",
      inlineData: {
        mimeType: geminiAudioBlob.type,
        data: audioData,
      },
    });
    const transaction = buildTransactionFromAiPayload(
      parsePlainJson(rawResponse),
    );
    const wasRegistered = await registerTransaction(transaction);

    if (wasRegistered) {
      dom.smartTransactionInput.value = "";
      showToast("Movimiento por voz registrado", "success");
    }
  } catch (error) {
    console.error("No se pudo procesar el movimiento por voz.", {
      error,
      sourceMimeType,
      sourceBytes: blob.size,
    });
    if (!error.isGeminiHandled) {
      showErrorToast(
        error.message === "No se entendió el movimiento del audio."
          ? "No pude interpretar el audio. Habla más cerca del micrófono."
          : "No pude registrar el audio. Inténtalo nuevamente.",
      );
    }
  } finally {
    state.audioProcessing = false;
    setAudioCaptureUi();
  }
}

function stopAudioRecording() {
  const recorder = state.mediaRecorder;

  if (!recorder || recorder.state === "inactive") {
    return;
  }

  state.audioRecording = false;
  state.audioProcessing = true;
  window.clearTimeout(state.audioStopTimer);
  state.audioStopTimer = null;
  setAudioCaptureUi("processing");

  try {
    recorder.stop();
  } catch (error) {
    console.error("No se pudo detener MediaRecorder.", error);
    clearAudioCaptureState(recorder, state.microphoneStream);
    state.audioProcessing = false;
    setAudioCaptureUi();
    showErrorToast("No se pudo completar la grabación.");
  }
}

async function startAudioRecording({ registerTransaction } = {}) {
  if (
    state.audioRecording ||
    state.audioStarting ||
    state.audioProcessing ||
    state.smartTransactionSubmitting
  ) {
    return;
  }

  if (!navigator.onLine) {
    showToast("IA no disponible sin conexión", "info");
    return;
  }

  if (!window.isSecureContext) {
    const insecureContextError = new Error(
      "El contexto actual no permite capturar audio.",
    );
    insecureContextError.code = "insecure-context";
    showErrorToast(getMicrophoneSetupErrorMessage(insecureContextError));
    return;
  }

  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof window.MediaRecorder !== "function"
  ) {
    showErrorToast("La grabación de audio no es compatible con este navegador.");
    return;
  }

  let stream = null;
  let recorder = null;
  state.audioStarting = true;
  setAudioCaptureUi("starting");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const preferredMimeType = getSupportedAudioMimeType();
    try {
      recorder = new window.MediaRecorder(stream, {
        ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
        audioBitsPerSecond: 32000,
      });
    } catch (configurationError) {
      console.warn(
        "MediaRecorder rechazó la configuración preferida; usando valores del navegador.",
        configurationError,
      );
      recorder = new window.MediaRecorder(stream);
    }

    const chunks = [];
    const recordingId = ++state.audioRecordingSequence;
    const outputMimeType = normalizeAudioMimeType(
      recorder.mimeType || preferredMimeType,
    );
    let recorderFailed = false;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener("error", (event) => {
      recorderFailed = true;
      console.error("MediaRecorder no pudo capturar el audio.", {
        error: event.error,
        name: event.error?.name,
        message: event.error?.message,
        mimeType: outputMimeType,
      });
      clearAudioCaptureState(recorder, stream);
      state.audioProcessing = false;
      setAudioCaptureUi();
      showErrorToast("El navegador interrumpió la grabación de audio.");
    });
    recorder.addEventListener("stop", () => {
      clearAudioCaptureState(recorder, stream);

      if (recorderFailed) {
        return;
      }

      const audioBlob = new Blob(chunks, { type: outputMimeType });
      void processRecordedAudio(audioBlob, outputMimeType, recordingId, {
        registerTransaction,
      });
    });

    state.mediaRecorder = recorder;
    state.microphoneStream = stream;
    state.audioChunks = chunks;
    state.audioStarting = false;
    state.audioRecording = true;
    recorder.start(1000);
    setAudioCaptureUi("recording");
    state.audioStopTimer = window.setTimeout(
      stopAudioRecording,
      MAX_AUDIO_RECORDING_DURATION_MS,
    );
  } catch (error) {
    clearAudioCaptureState(recorder, stream);
    console.error("No se pudo iniciar MediaRecorder.", {
      error,
      name: error?.name,
      message: error?.message,
      isSecureContext: window.isSecureContext,
    });
    state.audioStarting = false;
    state.audioRecording = false;
    state.audioProcessing = false;
    setAudioCaptureUi();
    showErrorToast(getMicrophoneSetupErrorMessage(error));
  }
}

export function toggleAudioRecording({ registerTransaction } = {}) {
  if (state.audioRecording) {
    stopAudioRecording();
    return;
  }

  void startAudioRecording({ registerTransaction });
}

export function initializeAudioRecorder() {
  const isSupported =
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window.MediaRecorder === "function";

  if (isSupported) {
    setAudioCaptureUi();
    return;
  }

  dom.smartMicrophoneButton.disabled = true;
  dom.smartMicrophoneButton.classList.add(
    "cursor-not-allowed",
    "opacity-35",
  );
  dom.smartMicrophoneButton.setAttribute(
    "aria-label",
    "Grabación no compatible con este navegador",
  );
}
