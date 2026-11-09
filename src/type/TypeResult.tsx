import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import { navigate } from "../app/router";
import { Icon } from "../components/Icons";
import { isTypableWord } from "../data/session";
import type { Pack, SessionSummary, WordSnapshot } from "../data/types";
import { playFinish } from "../lib/audio";
import { shuffle } from "../lib/utils";

function clock(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function CountUp({
  value,
  format,
}: {
  value: number;
  format: (current: number) => string;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(value);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 700);
      setCurrent(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(current)}</>;
}

function durationSeconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}

function recordClock(seconds: number): string {
  return clock(seconds);
}

interface WeakEntry {
  key: string;
  word: string;
  reading: string;
  meaning: string;
  label: string;
  tone: "hint" | "error";
  errors: number;
  skipped: boolean;
  removed: boolean;
  replayable: boolean;
}

function isValidSnapshot(snapshot: WordSnapshot | undefined): boolean {
  return Boolean(
    snapshot &&
      snapshot.key &&
      snapshot.word.trim() &&
      snapshot.reading.trim(),
  );
}

/**
 * Same-route completion state. It intentionally has no hero, ring or separate
 * result page: the reference site keeps the type header and inline panels.
 */
export function TypeResult({
  summary,
  pack,
  groupNumber,
  isDrillLike,
  previousBestSecs,
  hasNextGroup,
  hasActiveSession,
  onResumeActive,
  onNextGroup,
  onRedoGroup,
  onDrillWeak,
}: {
  summary: SessionSummary;
  pack: Pack;
  groupNumber: number;
  isDrillLike: boolean;
  /** Fastest earlier run of the same pack group, in whole seconds. */
  previousBestSecs?: number;
  hasNextGroup: boolean;
  hasActiveSession: boolean;
  onResumeActive: () => void;
  onNextGroup: () => Promise<void>;
  onRedoGroup: () => Promise<void>;
  onDrillWeak: (keys: string[]) => Promise<void>;
}) {
  const { settings, wordStats } = useApp();
  const [busy, setBusy] = useState<"next" | "redo" | "drill" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const weak = useMemo(() => {
    const answers = new Map(summary.answers.map((answer) => [answer.wordKey, answer]));
    return summary.words
      .map((key): WeakEntry | null => {
        const snapshot = summary.wordSnapshots?.[key];
        const packWord = pack.words.find((entry) => entry.key === key);
        const stat = wordStats.get(key);
        const word: WordSnapshot | undefined =
          snapshot ??
          packWord ??
          (stat
            ? {
                key: stat.key,
                word: stat.word,
                reading: stat.reading,
                meaning: stat.meaning,
              }
            : undefined);
        const answer = answers.get(key);
        if (!answer) return null;
        const skipped = answer.result === "skipped";
        const label = skipped
          ? "跳过"
          : answer.hintUsed && answer.errors === 0
            ? "看了"
            : `错 ${Math.max(1, answer.errors)}`;
        return {
          key,
          word: word?.word || key.split("|")[0] || "未知词条",
          reading: word?.reading || "",
          meaning: packWord
            ? word?.meaning || "暂无释义"
            : [word?.meaning, "词条已移除，学习记录仍保留"]
                .filter(Boolean)
                .join(" · "),
          label,
          tone:
            !skipped && answer.hintUsed && answer.errors === 0
              ? "hint"
              : "error",
          errors: answer.errors,
          skipped,
          removed: !packWord,
          replayable:
            isValidSnapshot(snapshot) ||
            Boolean(packWord && isTypableWord(packWord)),
        };
      })
      .filter((entry): entry is WeakEntry => Boolean(entry))
      .sort((a, b) => {
        if (a.skipped !== b.skipped) return a.skipped ? -1 : 1;
        return b.errors - a.errors;
      });
  }, [pack.words, summary.answers, summary.words, summary.wordSnapshots, wordStats]);

  const weakCount = summary.words.length;
  const drillableWeak = weak.filter((entry) => entry.replayable);
  const canRedoGroup = useMemo(() => {
    const keys = Array.from(
      new Set(summary.answers.map((answer) => answer.wordKey)),
    );
    if (keys.length === 0) return false;
    return keys.every((key) => {
      if (isValidSnapshot(summary.wordSnapshots?.[key])) return true;
      const word = pack.words.find((entry) => entry.key === key);
      return Boolean(word && isTypableWord(word));
    });
  }, [pack.words, summary.answers, summary.wordSnapshots]);

  const accuracy = summary.typingAccuracy ?? summary.accuracy;

  useEffect(() => {
    if (settings.keySound) playFinish();
    // The result chord is intentionally played once when the result opens.
  }, []);

  const run = async (kind: "next" | "redo" | "drill") => {
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === "next") await onNextGroup();
      else if (kind === "redo") await onRedoGroup();
      else await onDrillWeak(shuffle(drillableWeak.map((entry) => entry.key)));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "暂时无法生成下一组练习。",
      );
    } finally {
      setBusy(null);
    }
  };

  const canStartNext = hasNextGroup;
  const redoLabel =
    !isDrillLike && groupNumber > 0
      ? `第 ${groupNumber} 组再打一遍`
      : "再来一组";
  const primaryAction = canStartNext ? "next" : "redo";
  const redoUnavailable = !canRedoGroup && summary.answers.length > 0;
  const redoButtonLabel = canRedoGroup ? redoLabel : "本组无法重打";
  const seconds = Math.max(1, Math.round(summary.durationMs / 1000));
  const record =
    !isDrillLike && groupNumber > 0
      ? (() => {
          const prev = previousBestSecs;
          if (!prev) {
            return {
              text: `第一次打完第 ${groupNumber} 组，用时就是纪录`,
              fresh: false,
            };
          }
          if (seconds < prev) {
            return {
              text: `新纪录！比之前最快的 ${recordClock(prev)} 快了 ${prev - seconds} 秒`,
              fresh: true,
            };
          }
          return {
            text:
              seconds === prev
                ? `第 ${groupNumber} 组最快 ${recordClock(prev)}，追平了`
                : `第 ${groupNumber} 组最快 ${recordClock(prev)}，这次慢了 ${seconds - prev} 秒`,
            fresh: false,
          };
        })()
      : null;

  return (
    <section className="ty-result">
      <div className="ty-result-metrics">
        <article style={{ animationDelay: "0ms" }}>
          <strong>
            <CountUp
              value={durationSeconds(summary.durationMs)}
              format={clock}
            />
          </strong>
          <span>用时</span>
        </article>
        <article style={{ animationDelay: "70ms" }}>
          <strong>
            <CountUp
              value={Math.round(summary.kanaPerMinute)}
              format={(current) => String(Math.round(current))}
            />
          </strong>
          <span>假名/分</span>
        </article>
        <article style={{ animationDelay: "140ms" }}>
          <strong>
            <CountUp
              value={accuracy * 100}
              format={(current) => `${Math.round(current)}%`}
            />
          </strong>
          <span>正确率</span>
        </article>
        <article style={{ animationDelay: "210ms" }}>
          <strong>
            <CountUp
              value={Math.round(summary.maxCombo)}
              format={(current) => String(Math.round(current))}
            />
          </strong>
          <span>最高连击</span>
        </article>
      </div>

      {record ? (
        <p
          className={`ty-result-record${record.fresh ? " is-new" : ""}`}
          style={{ animationDelay: "320ms" }}
        >
          {record.text}
        </p>
      ) : null}

      <div className="ty-result-weak">
        <h2>
          {weakCount > 0
            ? `打错或看了读音的 ${weakCount} 个`
            : `${summary.total} 个全部一次打对`}
        </h2>
        {weakCount > 0 ? (
          <ul className="ty-weak-list">
            {weak.map((entry, index) => (
              <li
                className={`ty-weak-row${entry.removed ? " is-missing" : ""}`}
                key={entry.key}
                style={{ animationDelay: `${300 + index * 50}ms` }}
              >
                <strong lang="ja">{entry.word}</strong>
                <span className="ty-weak-reading" lang="ja">
                  {entry.reading}
                </span>
                <span className="ty-weak-meaning" title={entry.meaning}>
                  {entry.meaning || "暂无释义"}
                </span>
                <span
                  className={`ty-weak-tag${entry.tone === "hint" ? " is-hint" : ""}`}
                >
                  {entry.label}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {actionError ? (
        <div className="ty-result-error" role="alert">
          <span>
            <Icon name="alert" size={15} strokeWidth={2} /> {actionError}
          </span>
          <button type="button" onClick={() => navigate("settings")}>
            查看学习设置
          </button>
        </div>
      ) : null}

      <div className="ty-result-actions">
        {hasActiveSession ? (
          <button type="button" className="ty-accent-button" onClick={onResumeActive}>
            <Icon name="play" size={15} filled />
            继续当前组
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`ty-accent-button ty-${primaryAction}-button`}
              disabled={
                busy !== null ||
                (primaryAction === "redo" && !canRedoGroup)
              }
              title={
                primaryAction === "redo" && !canRedoGroup
                  ? "本组词条已无法恢复，不能按原顺序重打。"
                  : undefined
              }
              onClick={() => void run(primaryAction)}
            >
              {busy === primaryAction ? (
                <>
                  <span className="ty-spinner" /> 正在生成…
                </>
              ) : (
                <>
                  <Icon
                    name={primaryAction === "next" ? "chevron-right" : "rotate-ccw"}
                    size={18}
                    strokeWidth={2}
                  />
                  {primaryAction === "next" ? "下一组" : redoButtonLabel}
                </>
              )}
            </button>
            {canStartNext ? (
              <button
                type="button"
                className="ty-secondary-button ty-redo-button"
                disabled={busy !== null || !canRedoGroup}
                title={
                  canRedoGroup
                    ? undefined
                    : "本组词条已无法恢复，不能按原顺序重打。"
                }
                onClick={() => void run("redo")}
              >
                {busy === "redo" ? (
                  "正在生成…"
                ) : (
                  <>
                    <Icon name="rotate-ccw" size={18} strokeWidth={2} />
                    {redoButtonLabel}
                  </>
                )}
              </button>
            ) : null}
            {drillableWeak.length > 0 ? (
              <button
                type="button"
                className="ty-outline-button"
                disabled={busy !== null}
                onClick={() => void run("drill")}
              >
                {busy === "drill"
                  ? "正在生成…"
                  : drillableWeak.length === weakCount
                    ? `只练这 ${weakCount} 个`
                    : `只练仍可用的 ${drillableWeak.length} 个`}
              </button>
            ) : null}
          </>
        )}
      </div>
      {!hasActiveSession && redoUnavailable ? (
        <p className="ty-result-note" role="status">
          本组词条已无法恢复，不能按原顺序重打。
        </p>
      ) : null}
    </section>
  );
}
