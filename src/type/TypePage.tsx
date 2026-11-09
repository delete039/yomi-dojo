import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "../app/AppContext";
import { navigate } from "../app/router";
import { Icon } from "../components/Icons";
import { getSessionGroupNumbers, isDrillLikeSummary } from "../data/session";
import { cx } from "../lib/utils";
import { TypeDesktopHeader, TypeMobileNav } from "./TypeChrome";
import { TypeImportPanel } from "./TypeImportPanel";
import { TypePackPicker } from "./TypePackPicker";
import { TypeResult } from "./TypeResult";
import { TypeSession } from "./TypeSession";
import { TypeSettingsPanel } from "./TypeSettingsPanel";
import { TypeTopbar } from "./TypeTopbar";
import "./type.css";

type Overlay = "pack" | "settings" | "import" | null;

interface QueueProblem {
  title: string;
  message: string;
  kind: "limit" | "words" | "empty" | "error";
}

const RESULT_FRESH_MS = 24 * 60 * 60 * 1000;

export function TypePage() {
  const {
    packs,
    sessions,
    selectedPack,
    selectedPackId,
    selectedPlan,
    settings,
    selectPack,
    startSession,
    startDrill,
    previewQueue,
    progressForPack,
  } = useApp();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [viewedSummaryId, setViewedSummaryId] = useState<string | null>(null);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [queueProblem, setQueueProblem] = useState<QueueProblem | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const autoAttemptRef = useRef("");

  useEffect(() => {
    if (switchTarget && selectedPackId === switchTarget) setSwitchTarget(null);
  }, [selectedPackId, switchTarget]);

  useEffect(() => {
    setViewedSummaryId(null);
    setQueueProblem(null);
  }, [selectedPackId]);

  useEffect(() => {
    if (!overlay) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOverlay(null);
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [overlay]);

  const lastSummary = useMemo(() => {
    if (!selectedPlan?.lastResultId) return null;
    return sessions.find((summary) => summary.id === selectedPlan.lastResultId) ?? null;
  }, [selectedPlan?.lastResultId, sessions]);

  const freshLastSummary = useMemo(() => {
    if (!lastSummary) return null;
    const at = selectedPlan?.lastResultAt ?? lastSummary.endedAt;
    return Date.now() - at <= RESULT_FRESH_MS ? lastSummary : null;
  }, [lastSummary, selectedPlan?.lastResultAt]);

  const viewedSummary = useMemo(
    () => {
      if (!viewedSummaryId) return null;
      const summary =
        sessions.find((entry) => entry.id === viewedSummaryId) ?? null;
      // A selected pack can change immediately after a mutation. Never pair a
      // result from the previous pack with the newly selected pack for a
      // single render.
      if (summary && selectedPackId && summary.packId !== selectedPackId) {
        return null;
      }
      return summary;
    },
    [selectedPackId, sessions, viewedSummaryId],
  );

  const showResult = selectedPlan
    ? viewedSummary ?? (!selectedPlan.activeSession ? freshLastSummary : null)
    : viewedSummary;

  const problemForQueue = useCallback((packId?: string): QueueProblem => {
    const pack = packId
      ? packs.find((item) => item.id === packId) ?? null
      : selectedPack;
    if (!pack) {
      return {
        title: "还没有词包",
        message: "先导入或创建一个词包，再开始看汉字打读音。",
        kind: "words",
      };
    }
    const progress = progressForPack(pack.id);
    const preview = previewQueue(pack.id, settings.batchSize);
    if ((progress?.typable ?? 0) === 0) {
      return {
        title: "这个词包没有可打的词",
        message:
          "打字练习只取带汉字且有读音的词。可以到词库添加词汇，或换一个词包。",
        kind: "words",
      };
    }
    if (preview?.limitedByNewLimit) {
      return {
        title: "今天的新词已经够了",
        message: `每日新词上限是 ${settings.dailyNewLimit} 个。可以调整上限、复习已有词，或等明天再继续。`,
        kind: "limit",
      };
    }
    return {
      title: "暂时没有可生成的题",
      message:
        "当前词的复习时间都还没到，或队列被学习设置限制。可以调整每日新词上限，或稍后重试。",
      kind: "empty",
    };
  }, [
    packs,
    previewQueue,
    progressForPack,
    selectedPack,
    settings.batchSize,
    settings.dailyNewLimit,
  ]);

  const autoStart = useCallback(async () => {
    if (!selectedPack) return;
    setStarting(true);
    setQueueProblem(null);
    try {
      const session = await startSession();
      if (!session) setQueueProblem(problemForQueue());
    } catch (error) {
      setQueueProblem({
        title: "这一队没有生成出来",
        message: error instanceof Error ? error.message : "发生未知错误。",
        kind: "error",
      });
    } finally {
      setStarting(false);
    }
  }, [problemForQueue, selectedPack, startSession]);

  useEffect(() => {
    if (!selectedPack) return;
    if (selectedPlan?.activeSession || showResult) {
      setStarting(false);
      return;
    }
    const attemptKey = [
      selectedPack.id,
      settings.batchSize,
      settings.dailyNewLimit,
      selectedPlan?.lastResultId ?? "",
      retryNonce,
    ].join(":");
    if (autoAttemptRef.current === attemptKey) return;
    autoAttemptRef.current = attemptKey;
    void autoStart();
  }, [
    autoStart,
    retryNonce,
    selectedPack,
    selectedPlan?.activeSession,
    selectedPlan?.lastResultId,
    settings.batchSize,
    settings.dailyNewLimit,
    showResult,
  ]);

  const selectForTyping = async (packId: string) => {
    setSwitchTarget(packId);
    setViewedSummaryId(null);
    setQueueProblem(null);
    try {
      await selectPack(packId);
      setOverlay(null);
    } catch (error) {
      setSwitchTarget(null);
      throw error;
    }
  };

  const startNewGroup = useCallback(async (packId?: string) => {
    const targetPackId = packId ?? selectedPack?.id;
    if (!targetPackId) throw new Error("请先选择一个词包。");
    setStarting(true);
    try {
      const session = await startSession({ forceNew: true, packId: targetPackId });
      if (!session) throw new Error(problemForQueue(targetPackId).message);
      setQueueProblem(null);
      setViewedSummaryId(null);
    } finally {
      setStarting(false);
    }
  }, [problemForQueue, selectedPack, startSession]);

  const drillWeak = async (keys: string[]) => {
    if (!showResult) throw new Error("没有可以加练的结算。");
    if (keys.length === 0) throw new Error("这一组没有需要加练的词。");
    await startDrill(keys, {
      kind: "drill",
      packId: showResult.packId,
      wordSnapshots: showResult.wordSnapshots,
    });
    setViewedSummaryId(null);
  };

  const redoGroup = async () => {
    if (!showResult) throw new Error("没有可以重打的组。");
    const keys = showResult.answers.map((answer) => answer.wordKey);
    if (keys.length === 0) throw new Error("这一组没有可重打的词。");
    await startDrill(keys, {
      kind: "retry",
      packId: showResult.packId,
      retryOfSessionId: showResult.id,
      wordSnapshots: showResult.wordSnapshots,
    });
    setViewedSummaryId(null);
  };

  const togglePack = () => {
    setOverlay((current) => (current === "pack" ? null : "pack"));
  };

  const toggleSettings = () => {
    setOverlay((current) => (current === "settings" ? null : "settings"));
  };

  const switching = Boolean(switchTarget && switchTarget !== selectedPackId);
  const hasActiveSession = Boolean(selectedPlan?.activeSession);
  const hasNextGroup = Boolean(
    selectedPack &&
      previewQueue(selectedPack.id, settings.batchSize)?.queue.length,
  );
  const groupNumbers = useMemo(
    () => getSessionGroupNumbers(sessions, showResult?.packId),
    [sessions, showResult?.packId],
  );
  const resultIsDrillLike = useMemo(
    () => (showResult ? isDrillLikeSummary(sessions, showResult) : false),
    [sessions, showResult],
  );
  const resultGroupNumber = showResult
    ? resultIsDrillLike
      ? 0
      : groupNumbers.get(showResult.id) ?? 1
    : 1;
  const previousBestSecs = useMemo(() => {
    if (!showResult) return undefined;
    if (resultIsDrillLike) return undefined;
    const groupNumber = groupNumbers.get(showResult.id);
    if (!groupNumber) return undefined;
    let best: number | undefined;
    for (const summary of sessions) {
      if (summary.id === showResult.id || summary.packId !== showResult.packId) {
        continue;
      }
      if ((summary.kind ?? "normal") === "drill") continue;
      if (groupNumbers.get(summary.id) !== groupNumber) continue;
      const secs = Math.max(1, Math.round(summary.durationMs / 1000));
      best = best === undefined ? secs : Math.min(best, secs);
    }
    return best;
  }, [groupNumbers, resultIsDrillLike, sessions, showResult]);
  const loading =
    !switching &&
    !showResult &&
    !queueProblem &&
    (starting || Boolean(selectedPack && !selectedPlan?.activeSession));

  return (
    <div className="ty-app">
      <TypeDesktopHeader />
      <main className="ty-main">
        <div className="ty-container">
          <TypeTopbar
            onBack={() => navigate("home")}
            settingsOpen={overlay === "settings"}
            onToggleSettings={toggleSettings}
          />

          <div className="ty-pack-trigger-wrap">
            <button
              type="button"
              className={cx("ty-pack-trigger", overlay === "pack" && "is-open")}
              onClick={togglePack}
              aria-expanded={overlay === "pack"}
              aria-controls="ty-pack-panel"
            >
              <span>我的词</span>
              <Icon name="chevron-down" size={16} strokeWidth={2} />
            </button>
          </div>

          {overlay === "pack" ? (
            <TypePackPicker
              onClose={() => setOverlay(null)}
              onSelectPack={selectForTyping}
              onStartGroup={startNewGroup}
              onOpenSummary={(summary) => {
                setViewedSummaryId(summary.id);
                setOverlay(null);
              }}
              onOpenImport={() => setOverlay("import")}
            />
          ) : null}

          {overlay === "settings" ? <TypeSettingsPanel /> : null}

          {overlay === "import" ? (
            <TypeImportPanel
              onClose={() => setOverlay("pack")}
              onSaved={() => {
                setViewedSummaryId(null);
                setQueueProblem(null);
                setOverlay(null);
              }}
            />
          ) : null}

          {switching || loading ? (
            <div className="ty-loading" aria-live="polite">
              <span className="ty-spinner" />
              <span>{switching ? "正在切换词包…" : "正在准备下一题…"}</span>
            </div>
          ) : null}

          {!switching && selectedPack && selectedPlan?.activeSession && !showResult ? (
            <TypeSession
              key={selectedPlan.activeSession.id}
              session={selectedPlan.activeSession}
              pack={selectedPack}
              suspended={overlay !== null}
              onFinished={(summary) => {
                setViewedSummaryId(summary.id);
                setOverlay(null);
              }}
            />
          ) : null}

          {!switching && showResult && selectedPack ? (
            <TypeResult
              key={showResult.id}
              summary={showResult}
              pack={selectedPack}
              groupNumber={resultGroupNumber}
              isDrillLike={resultIsDrillLike}
              previousBestSecs={previousBestSecs}
              hasNextGroup={hasNextGroup}
              hasActiveSession={hasActiveSession}
              onResumeActive={() => setViewedSummaryId(null)}
              onNextGroup={startNewGroup}
              onRedoGroup={redoGroup}
              onDrillWeak={drillWeak}
            />
          ) : null}

          {!switching && !showResult && queueProblem ? (
            <section className="ty-empty-state">
              <span className="ty-empty-icon">
                <Icon
                  name={queueProblem.kind === "limit" ? "clock" : "alert"}
                  size={23}
                />
              </span>
              <h1>{queueProblem.title}</h1>
              <p>{queueProblem.message}</p>
              <div className="ty-empty-actions">
                {queueProblem.kind === "limit" ? (
                  <button
                    type="button"
                    className="ty-accent-button"
                    onClick={() => navigate("settings")}
                  >
                    调整学习设置
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ty-accent-button"
                    onClick={() => navigate("library")}
                  >
                    打开词库
                  </button>
                )}
                <button
                  type="button"
                  className="ty-quiet-button"
                  onClick={() => {
                    setQueueProblem(null);
                    setRetryNonce((value) => value + 1);
                  }}
                >
                  重试
                </button>
                <button type="button" className="ty-quiet-button" onClick={togglePack}>
                  切换词包
                </button>
              </div>
            </section>
          ) : null}

          {!selectedPack && !switching && packs.length === 0 ? (
            <section className="ty-empty-state">
              <span className="ty-empty-icon">
                <Icon name="library" size={24} />
              </span>
              <h1>还没有可以练习的词包</h1>
              <p>导入自己的词表，或创建词包后再开始打字。</p>
              <button
                type="button"
                className="ty-accent-button"
                onClick={() => navigate("library")}
              >
                打开词库
              </button>
            </section>
          ) : null}
        </div>
      </main>
      <TypeMobileNav />
    </div>
  );
}
