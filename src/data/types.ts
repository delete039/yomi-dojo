export type JLPTLevel = "" | "N1" | "N2" | "N3" | "N4" | "N5";

export type PackKind = "builtin" | "custom";

export type SessionMode = "new" | "review" | "reinforce" | "relearn";

export type SessionResult = "correct" | "wrong" | "skipped";

export interface PackWord {
  /** Stable across packs: normalized surface + reading. */
  key: string;
  word: string;
  reading: string;
  meaning: string;
  jlpt: JLPTLevel;
  pos?: string;
  dictId?: string;
  altReadings?: string[];
  hasKanji: boolean;
  sourceGroup?: string;
  groupNumber?: number;
  addedAt: number;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  kind: PackKind;
  builtinLevel?: "N1" | "N2";
  source?: string;
  words: PackWord[];
  createdAt: number;
  updatedAt: number;
}

export interface QueueItem {
  key: string;
  mode: SessionMode;
  /** Why this word was selected, shown in the session preview. */
  reason: string;
}

/**
 * A compact copy of the word content used by an exercise session.
 *
 * Sessions and completed results keep this snapshot so editing, removing or
 * deleting a pack cannot turn an already-recorded result into stale data or
 * make "redo this group" point at the wrong word.
 */
export interface WordSnapshot {
  key: string;
  word: string;
  reading: string;
  meaning: string;
  altReadings?: string[];
}

export interface SessionComposition {
  new: number;
  review: number;
  reinforce: number;
  relearn: number;
}

export interface AnswerResult {
  wordKey: string;
  mode: SessionMode;
  result: SessionResult;
  firstTryCorrect: boolean;
  errors: number;
  hintUsed: boolean;
  skipped: boolean;
  durationMs: number;
  charsTyped: number;
  /** Physical keystrokes accepted while answering this word. */
  totalKeys?: number;
  /** Keystrokes that advanced the matcher or formed a valid pending syllable. */
  correctKeys?: number;
  /** Longest uninterrupted correct-key streak at the end of this word. */
  maxKeyCombo?: number;
  /** Consecutive correct keys carried into the next word. */
  keyStreakEnd?: number;
  answeredAt: number;
}

export type PracticeKind = "normal" | "retry" | "drill";

export interface PracticeSession {
  id: string;
  packId: string;
  packName: string;
  startedAt: number;
  updatedAt: number;
  batchSize: number;
  queue: QueueItem[];
  currentIndex: number;
  answers: AnswerResult[];
  composition: SessionComposition;
  /** Word content captured when this session was created. */
  wordSnapshots?: Record<string, WordSnapshot>;
  drillKeys?: string[];
  kind?: PracticeKind;
  retryOfSessionId?: string;
}

export interface SessionSummary {
  id: string;
  packId: string;
  packName: string;
  startedAt: number;
  endedAt: number;
  batchSize: number;
  queueSize: number;
  answers: AnswerResult[];
  composition: SessionComposition;
  total: number;
  correctFirstTry: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  /** Keystroke accuracy, matching the reference site's typing HUD. */
  typingAccuracy?: number;
  totalKeys?: number;
  correctKeys?: number;
  durationMs: number;
  kanaPerMinute: number;
  maxCombo: number;
  words: string[];
  /** Snapshot of every answered word, independent of later pack edits. */
  wordSnapshots?: Record<string, WordSnapshot>;
  kind?: PracticeKind;
  /** Set when this summary came from "redo the current group". */
  retryOfSessionId?: string;
}

export interface PackPlan {
  packId: string;
  activeSession: PracticeSession | null;
  createdAt: number;
  updatedAt: number;
  lastCompletedAt?: number;
  /** Persisted so a refresh immediately after completion reopens the result. */
  lastResultId?: string;
  lastResultAt?: number;
  /** Normal batches only; drills and retries have their own kind. */
  completedSessions: number;
}

export interface WordHistoryItem {
  at: number;
  result: SessionResult;
  mode: SessionMode;
  durationMs: number;
  errors: number;
  hintUsed: boolean;
}

export interface WordStat {
  key: string;
  word: string;
  reading: string;
  meaning: string;
  attempts: number;
  correctFirstTry: number;
  wrong: number;
  skipped: number;
  mistakes: number;
  errorRate: number;
  accuracy: number;
  totalMs: number;
  charsTyped: number;
  streak: number;
  bestStreak: number;
  stability: number;
  difficulty: number;
  mastery: number;
  lapses: number;
  firstSeenAt: number;
  lastReviewedAt: number;
  dueAt: number;
  lastResult: SessionResult;
  history: WordHistoryItem[];
}

export interface Settings {
  batchSize: number;
  dailyNewLimit: number;
  dailyGoal: number;
  showReading: boolean;
  romajiInput: boolean;
  kanaInput: boolean;
  /** Show the in-page kana / romaji keyboard instead of the native IME. */
  builtInKeyboard: boolean;
  keySound: boolean;
  speakAfterComplete: boolean;
  autoAdvance: boolean;
}

export interface AppMeta {
  key: string;
  value: unknown;
}

export interface SeedPackJson {
  id: string;
  name: string;
  level: "N1" | "N2";
  description: string;
  source: string;
  groupCount: number;
  words: [string, string, string, number, string][];
}

export interface BackupData {
  format: "yomidojo-backup";
  version: 1;
  appVersion: string;
  exportedAt: string;
  settings: Settings;
  packs: Pack[];
  plans: PackPlan[];
  wordStats: WordStat[];
  sessions: SessionSummary[];
}

export interface DictionaryEntry {
  word: string;
  reading: string;
  meaning: string;
  jlpt: JLPTLevel;
  rank: number;
  pos: string;
  dictId: string;
  altReadings: string[];
  variants: string[];
  hasKanji: boolean;
}

export interface ImportCandidate {
  word: string;
  reading: string;
  meaning: string;
  jlpt: JLPTLevel;
  group?: string;
  hasKanji: boolean;
  status: "ready" | "missing-reading" | "no-kanji" | "duplicate" | "invalid";
  message?: string;
  /** Reading was filled from the bundled dictionary, not the source row. */
  autoReading?: boolean;
}

export interface ImportParseResult {
  rows: ImportCandidate[];
  sourceLabel: string;
  warnings: string[];
  errors: string[];
}
