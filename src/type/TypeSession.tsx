import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type CompositionEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useApp } from "../app/AppContext";
import { Icon } from "../components/Icons";
import type {
  AnswerResult,
  Pack,
  PackWord,
  PracticeSession,
  QueueItem,
  SessionSummary,
  WordSnapshot,
} from "../data/types";
import {
  playError,
  playKey,
  playSuccess,
  speakJapanese,
  vibrateError,
} from "../lib/audio";
import {
  TypingMatcher,
  normalizeTypingTarget,
  type TypingMatcherSnapshot,
} from "../lib/romajiMatcher";
import { cx } from "../lib/utils";

interface WordUiState {
  runtimeId: string;
  snapshot: TypingMatcherSnapshot;
  errors: number;
  hintUsed: boolean;
  errorFlash: boolean;
  ring: { from: number; to: number; sequence: number } | null;
}

/** The completed reading that flies upward while the next word is revealed. */
interface ExitOverlay {
  id: string;
  characters: string[];
}

/** When auto-advance is off, keep the completed word on screen until asked. */
interface HeldAdvance {
  word: WordSnapshot;
  item: QueueItem;
  snapshot: TypingMatcherSnapshot;
  answer: AnswerResult;
  number: number;
}

interface LiveStats {
  totalKeys: number;
  correctKeys: number;
  kana: number;
  streak: number;
}

const EXIT_OVERLAY_MS = 620;
const ERROR_FLASH_MS = 380;
const RING_MS = 460;

function readingsFor(
  word: Pick<PackWord, "reading" | "altReadings">,
): string[] {
  const readings: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeTypingTarget(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    readings.push(value);
  };
  add(word.reading);
  for (const reading of word.altReadings ?? []) add(reading);
  // こんにちは is conventionally typed as konnichiwa.
  const primary = normalizeTypingTarget(word.reading);
  if (primary.endsWith("は")) add(`${primary.slice(0, -1)}わ`);
  return readings;
}

function isKanaCharacter(value: string): boolean {
  return /^[\u3041-\u309f\u30a1-\u30ffー]$/u.test(value);
}

function isRomajiCharacter(value: string): boolean {
  return /^[a-zA-Z'-]$/.test(value);
}

function correctStreak(answers: AnswerResult[]): number {
  const last = answers.at(-1);
  return last?.keyStreakEnd ?? 0;
}

function newUiState(
  runtimeId: string,
  snapshot: TypingMatcherSnapshot,
): WordUiState {
  return {
    runtimeId,
    snapshot,
    errors: 0,
    hintUsed: false,
    errorFlash: false,
    ring: null,
  };
}

/**
 * One-word-at-a-time typing state machine.
 *
 * The visual input is a 1x1 hidden field. Desktop keys are handled at the
 * window level; the hidden field keeps mobile keyboards and IME composition
 * working without turning the exercise into a form submission.
 */
export function TypeSession({
  session,
  pack,
  suspended,
  onFinished,
}: {
  session: PracticeSession;
  pack: Pack;
  suspended: boolean;
  onFinished: (summary: SessionSummary) => void;
}) {
  const { settings, recordSessionAnswer } = useApp();
  const item = session.queue[session.currentIndex];
  const word = useMemo(
    () =>
      session.wordSnapshots?.[item?.key ?? ""] ??
      pack.words.find((entry) => entry.key === item?.key),
    [item?.key, pack.words, session.wordSnapshots],
  );
  const readings = useMemo(() => (word ? readingsFor(word) : []), [word]);
  const runtime = useMemo(() => {
    const matcher = new TypingMatcher(readings);
    const runtimeId = `${session.id}:${session.currentIndex}:${word?.key ?? "missing"}`;
    return {
      id: runtimeId,
      matcher,
      initial: matcher.snapshot(),
    };
  }, [readings, session.currentIndex, session.id, word?.key]);

  const [wordState, setWordState] = useState<WordUiState>(() =>
    newUiState(runtime.id, runtime.initial),
  );
  const [held, setHeld] = useState<HeldAdvance | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exitOverlay, setExitOverlay] = useState<ExitOverlay | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pageHidden, setPageHidden] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [, setClockTick] = useState(0);
  const [live, setLive] = useState<LiveStats>(() => ({
    totalKeys: 0,
    correctKeys: 0,
    kana: 0,
    streak: correctStreak(session.answers),
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const composingRef = useRef(false);
  const suppressNextInputRef = useRef(false);
  const submittingRef = useRef(false);
  const timerStartedRef = useRef(false);
  const totalKeysRef = useRef(0);
  const correctKeysRef = useRef(0);
  const errorsRef = useRef(0);
  const hintUsedRef = useRef(false);
  const streakRef = useRef(correctStreak(session.answers));
  const maxStreakRef = useRef(
    session.answers.reduce(
      (maximum, answer) => Math.max(maximum, answer.maxKeyCombo ?? 0),
      0,
    ),
  );
  const activeMsRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const wordOffsetRef = useRef(0);
  const errorTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const pendingAnswerRef = useRef<AnswerResult | null>(null);
  const heldRef = useRef<HeldAdvance | null>(null);

  useEffect(() => {
    heldRef.current = held;
  }, [held]);

  const activeNow = useCallback(() => {
    return (
      activeMsRef.current +
      (activeSinceRef.current === null
        ? 0
        : performance.now() - activeSinceRef.current)
    );
  }, []);

  const focusInput = useCallback(() => {
    if (submittingRef.current || saveError) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [saveError]);

  const focusFromBackground = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, a, input, textarea, select, label")
      ) {
        return;
      }
      focusInput();
    },
    [focusInput],
  );

  useEffect(
    () => () => {
      aliveRef.current = false;
      if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
      if (ringTimerRef.current !== null) window.clearTimeout(ringTimerRef.current);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const update = () => setPageHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    streakRef.current = correctStreak(session.answers);
  }, [session.answers]);

  useLayoutEffect(() => {
    setWordState(newUiState(runtime.id, runtime.initial));
    setHintVisible(false);
    setSaveError(null);
    setLive({
      totalKeys: 0,
      correctKeys: 0,
      kana: 0,
      streak: streakRef.current,
    });
    totalKeysRef.current = 0;
    correctKeysRef.current = 0;
    errorsRef.current = 0;
    hintUsedRef.current = false;
    wordOffsetRef.current = activeNow();
    pendingAnswerRef.current = null;
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (ringTimerRef.current !== null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 20);
  }, [activeNow, runtime.id, runtime.initial]);

  const paused =
    suspended || submitting || Boolean(saveError) || pageHidden || Boolean(held);

  useEffect(() => {
    if (paused) {
      if (activeSinceRef.current !== null) {
        activeMsRef.current += performance.now() - activeSinceRef.current;
        activeSinceRef.current = null;
      }
      return;
    }
    if (timerStarted && activeSinceRef.current === null) {
      activeSinceRef.current = performance.now();
    }
  }, [paused, timerStarted]);

  useEffect(() => {
    if (!timerStarted || paused) return;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [paused, timerStarted]);

  useEffect(() => {
    if (!suspended && !saveError) focusInput();
  }, [focusInput, saveError, suspended]);

  useEffect(() => {
    if (suspended) setHintVisible(false);
  }, [suspended]);

  const displayState =
    wordState.runtimeId === runtime.id
      ? wordState
      : newUiState(runtime.id, runtime.initial);
  const displaySnapshot = displayState.snapshot;
  const displayErrors = displayState.errors;
  const displayHintUsed = displayState.hintUsed;
  const activeWord = held?.word ?? word;
  const activeItem = held?.item ?? item;
  const effectiveSnapshot = held?.snapshot ?? displaySnapshot;
  const effectiveErrors = held?.answer.errors ?? displayErrors;
  const effectiveHintUsed = held?.answer.hintUsed ?? displayHintUsed;

  const lastSuccess = useMemo(() => {
    for (let index = session.answers.length - 1; index >= 0; index -= 1) {
      const answer = session.answers[index];
      if (answer.result === "correct") {
        return {
          answer,
          word:
            session.wordSnapshots?.[answer.wordKey] ??
            pack.words.find((entry) => entry.key === answer.wordKey),
        };
      }
    }
    return null;
  }, [pack.words, session.answers, session.wordSnapshots]);

  const typedPosition = effectiveSnapshot.state.position;
  const pending = held ? "" : displaySnapshot.pending;
  const revealReading = settings.showReading || hintVisible;
  const currentNumber =
    held?.number ?? Math.min(session.currentIndex + 1, session.queue.length);
  const displayTarget = held
    ? normalizeTypingTarget(held.word.reading)
    : readings.length
      ? normalizeTypingTarget(readings[0])
      : Array.from(displaySnapshot.state.target).join("");
  const displayCharacters = Array.from(displayTarget);
  const visiblePosition = held
    ? displayCharacters.length
    : Math.min(typedPosition, displayCharacters.length);

  const savedTotals = useMemo(
    () =>
      session.answers.reduce(
        (total, answer) => {
          total.keys += answer.totalKeys ?? answer.charsTyped + answer.errors;
          total.correct +=
            answer.correctKeys ??
            Math.max(
              0,
              (answer.totalKeys ?? answer.charsTyped + answer.errors) -
                answer.errors,
            );
          total.kana += answer.charsTyped;
          return total;
        },
        { keys: 0, correct: 0, kana: 0 },
      ),
    [session.answers],
  );
  const totalKeys = savedTotals.keys + live.totalKeys;
  const totalCorrect = savedTotals.correct + live.correctKeys;
  const accuracy = totalKeys > 0 ? totalCorrect / totalKeys : 1;
  const activeMs = activeNow();
  const savedDuration = useMemo(
    () =>
      session.answers.reduce(
        (total, answer) => total + Math.max(0, answer.durationMs),
        0,
      ),
    [session.answers],
  );
  const groupActiveMs = Math.max(
    0,
    savedDuration + Math.max(0, activeMs - wordOffsetRef.current),
  );
  const speed =
    groupActiveMs > 2000
      ? Math.round((savedTotals.kana + live.kana) / (groupActiveMs / 60_000))
      : 0;
  const streak = live.streak;
  const progress = session.answers.length / Math.max(1, session.queue.length);

  const markHint = useCallback(() => {
    if (hintUsedRef.current) return;
    hintUsedRef.current = true;
    setWordState((current) =>
      current.runtimeId === runtime.id
        ? { ...current, hintUsed: true }
        : current,
    );
  }, [runtime.id]);

  const revealHint = useCallback(() => {
    if (submittingRef.current || saveError || heldRef.current) return;
    setHintVisible(true);
    markHint();
  }, [markHint, saveError]);

  const hideHint = useCallback(() => setHintVisible(false), []);

  const continueHeld = useCallback(() => {
    // Never reveal the next word while the answer is still being written.
    // The held state is only a visual confirmation; the queue advance is
    // driven by the saved plan update.
    if (!heldRef.current || submittingRef.current || saveError) return;
    heldRef.current = null;
    setHeld(null);
    inputRef.current?.focus({ preventScroll: true });
  }, [saveError]);

  const showExitOverlay = useCallback((characters: string[]) => {
    setExitOverlay({
      id: `${Date.now()}-${Math.random()}`,
      characters,
    });
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      setExitOverlay(null);
      exitTimerRef.current = null;
    }, EXIT_OVERLAY_MS);
  }, []);

  const finishWord = useCallback(
    async (
      snapshot: TypingMatcherSnapshot,
      resultWord: WordSnapshot,
      resultItem: QueueItem,
      skipped: boolean,
    ) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setHintVisible(false);
      const answeredAt = Date.now();
      const errors = errorsRef.current;
      const hintUsed = hintUsedRef.current;
      const durationMs = Math.max(0, Math.round(activeNow() - wordOffsetRef.current));
      const answer: AnswerResult = {
        wordKey: resultWord.key,
        mode: resultItem.mode,
        result: skipped ? "skipped" : "correct",
        firstTryCorrect: !skipped && errors === 0 && !hintUsed,
        errors,
        hintUsed,
        skipped,
        durationMs,
        charsTyped: snapshot.state.position,
        totalKeys: totalKeysRef.current,
        correctKeys: correctKeysRef.current,
        maxKeyCombo: maxStreakRef.current,
        keyStreakEnd: streakRef.current,
        answeredAt,
      };
      pendingAnswerRef.current = answer;
      if (!settings.autoAdvance) {
        const nextHeld: HeldAdvance = {
          word: resultWord,
          item: resultItem,
          snapshot,
          answer,
          number: session.currentIndex + 1,
        };
        heldRef.current = nextHeld;
        setHeld(nextHeld);
      }

      if (!skipped) {
        showExitOverlay(Array.from(normalizeTypingTarget(resultWord.reading)));
        // The final word hands the completion sound over to the result chord
        // so the two do not stack on top of each other.
        const finalAnswer = session.answers.length + 1 >= session.queue.length;
        if (settings.keySound && !finalAnswer) playSuccess();
        if (settings.speakAfterComplete) speakJapanese(resultWord.reading);
      }

      try {
        const summary = await recordSessionAnswer(answer, session.id);
        pendingAnswerRef.current = null;
        if (!aliveRef.current) return;
        if (summary) onFinished(summary);
      } catch (error) {
        if (!aliveRef.current) return;
        setSaveError(
          error instanceof Error ? error.message : "这个词还没有保存成功。",
        );
      } finally {
        if (aliveRef.current) {
          submittingRef.current = false;
          setSubmitting(false);
        }
      }
    },
    [
      activeNow,
      onFinished,
      recordSessionAnswer,
      session.id,
      session.answers.length,
      session.queue.length,
      settings.autoAdvance,
      settings.keySound,
      settings.speakAfterComplete,
      showExitOverlay,
    ],
  );

  const registerNope = useCallback(() => {
    const slots = slotsRef.current;
    if (slots) {
      slots.classList.remove("is-nope");
      void slots.offsetWidth;
      slots.classList.add("is-nope");
    }
    setWordState((current) =>
      current.runtimeId === runtime.id
        ? { ...current, errorFlash: true }
        : current,
    );
    if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => {
      setWordState((current) =>
        current.runtimeId === runtime.id
          ? { ...current, errorFlash: false }
          : current,
      );
    }, ERROR_FLASH_MS);
  }, [runtime.id]);

  const processCharacter = useCallback(
    (raw: string, directKana: boolean) => {
      if (
        !word ||
        !item ||
        submittingRef.current ||
        saveError ||
        suspended ||
        heldRef.current
      ) {
        return;
      }
      if (directKana && !settings.kanaInput) return;
      if (!directKana && !settings.romajiInput) return;

      if (!timerStartedRef.current) {
        timerStartedRef.current = true;
        setTimerStarted(true);
      }

      const before = runtime.matcher.snapshot();
      const step = runtime.matcher.apply(raw, directKana);
      const after = runtime.matcher.snapshot();
      totalKeysRef.current += 1;

      if (!step.ok) {
        runtime.matcher.erasePending();
        const cleared = runtime.matcher.snapshot();
        errorsRef.current += 1;
        streakRef.current = 0;
        setLive((current) => ({
          ...current,
          totalKeys: current.totalKeys + 1,
          streak: 0,
        }));
        setWordState((current) =>
          current.runtimeId === runtime.id
            ? {
                ...current,
                snapshot: cleared,
                errors: current.errors + 1,
                errorFlash: true,
              }
            : current,
        );
        registerNope();
        if (settings.keySound) playError();
        vibrateError();
        return;
      }

      correctKeysRef.current += 1;
      streakRef.current += 1;
      maxStreakRef.current = Math.max(maxStreakRef.current, streakRef.current);
      const advancedBy = Math.max(0, after.state.position - before.state.position);
      setLive((current) => ({
        totalKeys: current.totalKeys + 1,
        correctKeys: current.correctKeys + 1,
        kana: current.kana + advancedBy,
        streak: streakRef.current,
      }));
      const sequence = Date.now();
      setWordState((current) => ({
        runtimeId: runtime.id,
        snapshot: after,
        errors: current.errors,
        hintUsed: hintUsedRef.current,
        errorFlash: false,
        ring:
          step.advanced
            ? {
                from: before.state.position,
                to: after.state.position,
                sequence,
              }
            : current.ring,
      }));
      if (step.advanced) {
        if (ringTimerRef.current !== null) window.clearTimeout(ringTimerRef.current);
        ringTimerRef.current = window.setTimeout(() => {
          setWordState((current) =>
            current.runtimeId === runtime.id
              ? { ...current, ring: null }
              : current,
          );
        }, RING_MS);
      }
      if (settings.keySound) playKey();
      if (step.completed) {
        void finishWord(after, word, item, false);
      }
    },
    [
      finishWord,
      item,
      registerNope,
      runtime,
      saveError,
      settings.kanaInput,
      settings.keySound,
      settings.romajiInput,
      suspended,
      word,
    ],
  );

  const skipWord = useCallback(() => {
    if (!word || !item || submittingRef.current || saveError || heldRef.current) {
      return;
    }
    runtime.matcher.erasePending();
    const snapshot = runtime.matcher.snapshot();
    void finishWord(snapshot, word, item, true);
  }, [finishWord, item, runtime, saveError, word]);

  const retrySave = useCallback(() => {
    const answer = pendingAnswerRef.current;
    if (!answer || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSaveError(null);
    void recordSessionAnswer(answer, session.id)
      .then((summary) => {
        if (!aliveRef.current) return;
        pendingAnswerRef.current = null;
        if (summary) onFinished(summary);
      })
      .catch((error: unknown) => {
        if (!aliveRef.current) return;
        setSaveError(
          error instanceof Error ? error.message : "重试保存仍然失败。",
        );
      })
      .finally(() => {
        if (aliveRef.current) {
          submittingRef.current = false;
          setSubmitting(false);
        }
      });
  }, [onFinished, recordSessionAnswer, session.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (suspended) return;

      if (saveError) {
        if (event.key === "Enter") {
          event.preventDefault();
          retrySave();
        }
        return;
      }
      if (heldRef.current) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
          event.preventDefault();
          continueHeld();
        }
        return;
      }
      if (event.isComposing || event.keyCode === 229) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === " " || event.key === "Tab") {
        event.preventDefault();
        if (!event.repeat) revealHint();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        skipWord();
        return;
      }
      if (event.key === "Backspace" && runtime.matcher.snapshot().pending) {
        event.preventDefault();
        runtime.matcher.erasePending();
        setWordState((current) =>
          current.runtimeId === runtime.id
            ? { ...current, snapshot: runtime.matcher.snapshot() }
            : current,
        );
        return;
      }
      if (event.key.length !== 1) return;
      if (isRomajiCharacter(event.key)) {
        event.preventDefault();
        processCharacter(event.key, false);
      } else if (isKanaCharacter(event.key)) {
        event.preventDefault();
        processCharacter(event.key, true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Tab") hideHint();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    continueHeld,
    hideHint,
    processCharacter,
    retrySave,
    revealHint,
    runtime,
    saveError,
    skipWord,
    suspended,
  ]);

  const processText = (value: string) => {
    for (const char of Array.from(value)) {
      if (isKanaCharacter(char)) processCharacter(char, true);
      else if (isRomajiCharacter(char)) processCharacter(char, false);
    }
  };

  const handleCompositionStart = () => {
    composingRef.current = true;
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    suppressNextInputRef.current = true;
    const value = event.currentTarget.value;
    event.currentTarget.value = "";
    processText(value);
  };

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    if (composingRef.current) return;
    const value = event.currentTarget.value;
    event.currentTarget.value = "";
    if (!value) return;
    if (suppressNextInputRef.current) {
      suppressNextInputRef.current = false;
      return;
    }
    processText(value);
  };

  const hintPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    revealHint();
  };

  const hintPointerRelease = () => hideHint();

  if (!activeWord || !activeItem) {
    return (
      <section className="ty-practice ty-state-panel" aria-live="polite">
        <p>当前组里的这个词已经从词包移除。</p>
        <button
          type="button"
          className="ty-accent-button"
          onClick={() => window.location.reload()}
        >
          重新载入
        </button>
      </section>
    );
  }

  return (
    <section
      className="ty-practice"
      data-session-id={session.id}
      onPointerDown={focusFromBackground}
    >
      <div className="ty-progress-row">
        <span>
          {currentNumber} / {session.queue.length}
        </span>
        {streak >= 5 ? (
          <span
            className={cx(
              "ty-combo",
              streak >= 10 && "is-bump",
              streak >= 30 && "is-hot",
            )}
            key={Math.floor(streak / 10)}
          >
            连击 {streak}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span>
          {speed} 假名/分 · 正确率 {Math.round(accuracy * 100)}%
        </span>
      </div>
      <div className="ty-progress-track" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="ty-last-result" aria-live="polite">
        {!held && lastSuccess?.word ? (
          <p key={`${lastSuccess.answer.wordKey}:${lastSuccess.answer.answeredAt}`}>
            <Icon name="check" size={16} strokeWidth={2} />
            <span className="ty-last-word" lang="ja">
              {lastSuccess.word.word}
            </span>
            <span className="ty-last-reading" lang="ja">
              {lastSuccess.word.reading}
            </span>
            <span className="ty-last-meaning">
              {lastSuccess.word.meaning}
            </span>
          </p>
        ) : null}
      </div>

      <div
        className="ty-question"
        key={held ? `held-${held.answer.answeredAt}` : runtime.id}
      >
        <h1 className="ty-word" lang="ja">
          {activeWord.word}
        </h1>
        {activeWord.meaning ? (
          <p className="ty-meaning">{activeWord.meaning}</p>
        ) : null}
      </div>

      <div className="ty-reading-wrap">
        {exitOverlay ? (
          <div className="ty-finish-overlay" key={exitOverlay.id} aria-hidden="true">
            <div className="ty-finish-reading">
              {exitOverlay.characters.map((character, index) => (
                <span className="ty-finish-char" key={`${character}-${index}`} lang="ja">
                  {character}
                </span>
              ))}
            </div>
            <span className="ty-spark-layer">
              {Array.from({ length: 12 }, (_, index) => {
                const angle = (index / 12) * Math.PI * 2;
                const distance = 70 + (index % 3) * 22;
                return (
                  <i
                    key={index}
                    style={
                      {
                        "--ty-dx": `${Math.cos(angle) * distance * 1.6}px`,
                        "--ty-dy": `${Math.sin(angle) * distance}px`,
                      } as CSSProperties
                    }
                  />
                );
              })}
            </span>
          </div>
        ) : null}

        <div
          ref={slotsRef}
          className="ty-reading-slots"
          key={held ? `held-${held.answer.answeredAt}` : runtime.id}
          aria-label="读音进度"
          aria-live="polite"
        >
          {displayCharacters.map((character, index) => {
            const typed = index < visiblePosition;
            const current = index === visiblePosition;
            const showCharacter = typed || revealReading;
            const ringActive =
              displayState.ring && index === displayState.ring.to - 1;
            return (
              <span className="ty-reading-slot" key={`${index}-${character}`}>
                <span
                  className={cx(
                    "ty-reading-char",
                    typed && "is-typed",
                    current && "is-current",
                    current && displayState.errorFlash && "is-error",
                    !showCharacter && "is-concealed",
                  )}
                  lang="ja"
                >
                  {showCharacter ? character : "・"}
                </span>
                {ringActive ? (
                  <i
                    className="ty-key-ring"
                    key={displayState.ring?.sequence}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={cx(
                    "ty-reading-underline",
                    typed && "is-typed",
                    current && "is-current",
                    current && displayState.errorFlash && "is-error",
                  )}
                  aria-hidden="true"
                />
                {current && pending ? (
                  <span className="ty-pending" aria-hidden="true">
                    {pending}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      <input
        ref={inputRef}
        className="ty-hidden-input"
        aria-label="在这里打读音"
        placeholder="点这里，开始输入读音"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        lang="ja"
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onInput={handleInput}
        disabled={Boolean(saveError)}
      />

      <div className="ty-hint-actions">
        {held ? (
          <button
            type="button"
            className="ty-hint-button"
            onClick={continueHeld}
            disabled={Boolean(saveError) || submitting}
          >
            <Icon name="arrow-right" size={16} strokeWidth={2} />
            {submitting ? "保存中…" : "下一个词"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={cx("ty-hint-button", hintVisible && "is-held")}
              aria-pressed={hintVisible}
              onPointerDown={hintPointerDown}
              onPointerUp={hintPointerRelease}
              onPointerLeave={hintPointerRelease}
              onPointerCancel={hintPointerRelease}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  revealHint();
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") hideHint();
              }}
            >
              <Icon name="eye" size={16} strokeWidth={2} />
              按住看读音
            </button>
            {displayErrors >= 3 ? (
              <button type="button" className="ty-hint-button" onClick={skipWord}>
                <Icon name="skip-forward" size={16} strokeWidth={2} />
                跳过
              </button>
            ) : null}
          </>
        )}
      </div>

      {saveError ? (
        <div className="ty-save-error" role="alert">
          <span>{saveError}</span>
          <button type="button" onClick={retrySave} disabled={submitting}>
            {submitting ? "正在重试…" : "重试保存"}
          </button>
        </div>
      ) : null}

      <p className="ty-shortcuts">
        {held
          ? "本词已记录 · 按 Enter 或点击「下一个词」继续"
          : "罗马字怎么拼都行 · 按住空格看读音 · Esc 跳过 · 电脑上请先切到英文输入"}
      </p>

      <span className="sr-only" aria-live="polite">
        {held
          ? "本词已完成，等待继续"
          : effectiveErrors > 0
            ? `当前词已错误 ${effectiveErrors} 次`
            : "等待输入"}
        {!held && effectiveHintUsed ? "，已使用读音提示" : ""}
      </span>
    </section>
  );
}
