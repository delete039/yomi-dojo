let context: AudioContext | null = null;
let keyNoise: AudioBuffer | null = null;
let unlocked = false;

function createContext(): AudioContext | null {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  const audio = new AudioContextClass();
  // Backgrounding the tab or locking a phone can suspend the context without
  // tearing it down. Invalidate the primed flag so the next gesture re-arms it.
  audio.addEventListener("statechange", () => {
    if (audio.state !== "running") unlocked = false;
  });
  return audio;
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context || context.state === "closed") {
    context = createContext();
    keyNoise = null;
  }
  if (!context) return null;
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function getKeyNoise(audio: AudioContext): AudioBuffer {
  if (keyNoise) return keyNoise;
  const length = Math.max(1, Math.floor(audio.sampleRate * 0.05));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    channel[index] =
      (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3);
  }
  keyNoise = buffer;
  return buffer;
}

/**
 * Prime Web Audio during the first direct touch/click. Some mobile browsers
 * keep a context created later by a soft-keyboard input event suspended.
 */
export function unlockAudio(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "running" && unlocked) return;
  try {
    const source = audio.createBufferSource();
    source.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    source.connect(audio.destination);
    source.start(0);
    unlocked = true;
  } catch {
    // Scheduling can fail while the context is interrupted. The next gesture
    // retries once the browser has resumed it.
    unlocked = false;
  }
  if (audio.state !== "running") {
    void audio.resume().catch(() => {
      unlocked = false;
    });
  }
}

export function playKey(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  const source = audio.createBufferSource();
  source.buffer = getKeyNoise(audio);
  source.playbackRate.value = 0.9 + Math.random() * 0.25;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2600 + Math.random() * 900;
  filter.Q.value = 1.2;

  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.5, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  source.connect(filter).connect(noiseGain).connect(audio.destination);
  source.start(now);

  const body = audio.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(190, now);
  body.frequency.exponentialRampToValueAtTime(70, now + 0.05);
  const bodyGain = audio.createGain();
  bodyGain.gain.setValueAtTime(0.35, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  body.connect(bodyGain).connect(audio.destination);
  body.start(now);
  body.stop(now + 0.07);
}

export function playSuccess(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [
    [1046.5, 0],
    [1568, 0.06],
  ].forEach(([frequency, delay]) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.22, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.45);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.5);
  });
}

export function playError(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [0, 0.07].forEach((delay, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = index ? 140 : 180;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.4, now + delay + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.09);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.1);
  });
}

export function speakJapanese(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const japaneseVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (japaneseVoice) utterance.voice = japaneseVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function vibrateError(): void {
  try {
    navigator.vibrate?.(30);
  } catch {
    // Vibration is an optional enhancement and may be blocked by the browser.
  }
}
