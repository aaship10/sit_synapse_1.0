/**
 * Live microphone dictation via AssemblyAI's streaming speech-to-text API.
 *
 * The permanent AssemblyAI key lives only on the backend (rag_pipeline/api.py,
 * ASSEMBLYAI_API_KEY in its .env) -- GET /speech/token mints a short-lived,
 * one-time-use token there and this module holds only that ephemeral token,
 * per AssemblyAI's recommended browser auth pattern.
 *
 * Saying the word "semicolon" while dictating is converted to a literal ";",
 * matching how preset symptom tags are joined -- so dictating multiple
 * symptoms in one breath ("engine overheating semicolon soft brake pedal")
 * still separates them the same way.
 *
 * Audio capture uses an AudioWorklet (public/pcm-worklet-processor.js) rather
 * than the deprecated ScriptProcessorNode. The worklet also reports each
 * chunk's RMS volume, which drives a 5-second silence auto-stop: if no sound
 * is heard for 5 seconds (from the start, or since the last sound), the
 * session closes itself instead of leaving the mic open indefinitely.
 */
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8008';
const SAMPLE_RATE = 16000;
const SILENCE_TIMEOUT_MS = 5000;
const SILENCE_RMS_THRESHOLD = 0.01;

async function fetchStreamingToken() {
  const res = await fetch(`${API_BASE}/speech/token?expires_in_seconds=60`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Could not get a speech token (HTTP ${res.status})`);
  }
  const { token } = await res.json();
  return token;
}

/** Say "semicolon" to move to the next symptom -- converts the spoken word into a literal ";" separator. */
export function applySemicolonCommand(text) {
  return text
    .replace(/\s*,?\s*\bsemicolon\b\s*,?\s*/gi, '; ')
    .replace(/\s+;/g, ';')
    .replace(/;\s*/g, '; ')
    .trim()
    .replace(/;\s*$/, '')
    .replace(/^;\s*/, '');
}

/**
 * Starts live mic transcription.
 * onPartial(text): in-progress words for the current utterance (not yet final).
 * onFinalTurn(text): a completed utterance -- append this to the symptom field.
 * onError(message): mic/permission/connection failure.
 * onSilence(): fired once, right before auto-stopping, when 5s pass with no sound.
 * Returns a controller: call .stop() to end the session and release the mic.
 */
export async function startDictation({ onPartial, onFinalTurn, onError, onSilence }) {
  const token = await fetchStreamingToken();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule('/pcm-worklet-processor.js');

  const source = audioContext.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(audioContext, 'pcm-processor', {
    processorOptions: { targetSampleRate: SAMPLE_RATE, chunkMs: 100 },
  });

  const ws = new WebSocket(
    `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&encoding=pcm_s16le&format_turns=true&token=${token}`
  );

  let stopped = false;
  let silenceTimer = null;

  const armSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      onSilence?.();
      stop();
    }, SILENCE_TIMEOUT_MS);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type !== 'Turn' || !msg.transcript) return;
    const text = applySemicolonCommand(msg.transcript);
    if (msg.end_of_turn) onFinalTurn?.(text);
    else onPartial?.(text);
  };

  ws.onerror = () => onError?.('Speech connection error.');
  ws.onclose = (event) => {
    if (!stopped && event.code !== 1000) onError?.('Speech connection closed unexpectedly.');
  };

  node.port.onmessage = (event) => {
    const { pcm, rms } = event.data;
    if (rms > SILENCE_RMS_THRESHOLD) armSilenceTimer();
    if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
  };

  source.connect(node);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Could not connect to the speech service.')), { once: true });
  });

  armSilenceTimer(); // start the 5s "no sound at all yet" countdown

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(silenceTimer);
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Terminate' }));
    } catch {
      /* already closing */
    }
    node.port.onmessage = null;
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    audioContext.close();
    setTimeout(() => ws.close(), 300);
  }

  return { stop };
}
