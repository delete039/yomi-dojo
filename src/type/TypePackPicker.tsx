import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import { ConfirmDialog } from "../components/Modal";
import { Icon } from "../components/Icons";
import type { Pack, SessionSummary } from "../data/types";
import { cx, formatDuration } from "../lib/utils";

function groupTime(summary: SessionSummary): string {
  const totalSeconds = Math.max(0, Math.round(summary.durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function normalSummaries(sessions: SessionSummary[], packId: string): SessionSummary[] {
  return sessions
    .filter((summary) => summary.packId === packId && (summary.kind ?? "normal") === "normal")
    .sort((a, b) => a.endedAt - b.endedAt);
}

export function TypePackPicker({
  onClose,
  onSelectPack,
  onStartGroup,
  onOpenSummary,
  onOpenImport,
}: {
  onClose: () => void;
  onSelectPack: (packId: string) => Promise<void>;
  onStartGroup: () => Promise<void>;
  onOpenSummary: (summary: SessionSummary) => void;
  onOpenImport: () => void;
}) {
  const {
    packs,
    plans,
    sessions,
    selectedPack,
    selectedPackId,
    settings,
    progressForPack,
    deletePack,
    notify,
  } = useApp();
  const [switching, setSwitching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const aliveRef = useRef(true);

  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const orderedPacks = useMemo(() => {
    const rank = (pack: Pack) =>
      pack.kind === "custom" ? 0 : pack.builtinLevel === "N2" ? 1 : 2;
    return [...packs].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.createdAt - b.createdAt ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
  }, [packs]);
  const customPacks = useMemo(
    () => orderedPacks.filter((pack) => pack.kind === "custom"),
    [orderedPacks],
  );
  const minePack =
    selectedPack?.kind === "custom" ? selectedPack : (customPacks[0] ?? null);

  const plan = selectedPack
    ? plans.find((item) => item.packId === selectedPack.id)
    : null;
  const progress = selectedPack ? progressForPack(selectedPack.id) : null;
  const completed = selectedPack
    ? normalSummaries(sessions, selectedPack.id)
    : [];
  const activeSession = plan?.activeSession ?? null;
  const activeIsNormal = (activeSession?.kind ?? "normal") === "normal";
  const activeIndex = activeSession ? completed.length + 1 : null;
  const typable = progress?.typable ?? 0;
  const estimatedGroups =
    typable === 0
      ? 0
      : Math.ceil(typable / Math.max(1, settings.batchSize));
  const groupCount = Math.max(
    estimatedGroups,
    completed.length + 1,
    activeIndex ?? 0,
  );
  const groupCells = Array.from(
    { length: Math.min(400, groupCount) },
    (_, index) => index + 1,
  );

  const select = async (pack: Pack) => {
    if (pack.id === selectedPackId) {
      onClose();
      return;
    }
    setSwitching(true);
    try {
      await onSelectPack(pack.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "切换词包失败。", "error");
    } finally {
      if (aliveRef.current) setSwitching(false);
    }
  };

  const startNext = async () => {
    setStarting(true);
    try {
      await onStartGroup();
      if (aliveRef.current) onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法生成下一组。", "error");
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedPack || selectedPack.kind === "builtin") return;
    setDeleting(true);
    try {
      await deletePack(selectedPack.id);
      setDeleteOpen(false);
      notify("词包已删除，已有词的掌握记录仍然保留。", "success");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除词包失败。", "error");
    } finally {
      if (aliveRef.current) setDeleting(false);
    }
  };

  return (
    <>
      <section
        id="ty-pack-panel"
        className="ty-pack-panel"
        aria-label="词包选择"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="ty-pack-chips" aria-label="全部词包">
          <button
            type="button"
            className="ty-chip ty-chip-mine"
            onClick={() => {
              if (minePack) void select(minePack);
              else onOpenImport();
            }}
            disabled={switching}
            aria-pressed={minePack?.id === selectedPackId}
            title={
              minePack
                ? `打开「${minePack.name}」`
                : "还没有自己的词包，先导入一个"
            }
          >
            我的词
          </button>
          {orderedPacks.map((pack) => (
            <button
              type="button"
              key={pack.id}
              className={cx("ty-chip", pack.id === selectedPackId && "is-active")}
              onClick={() => void select(pack)}
              disabled={switching}
              aria-pressed={pack.id === selectedPackId}
            >
              {pack.name}
            </button>
          ))}
          <button type="button" className="ty-chip ty-chip-import" onClick={onOpenImport}>
            <Icon name="plus" size={14} />
            导入词包
          </button>
        </div>

        {selectedPack ? (
          <>
            <div className="ty-pack-meta">
              <span>
                {typable} 个词 · {estimatedGroups} 组 · 打完 {completed.length} 组
              </span>
              <div className="ty-pack-meta-actions">
                {selectedPack.kind === "custom" ? (
                  <button
                    type="button"
                    className="ty-icon-link ty-icon-link-danger"
                    onClick={() => setDeleteOpen(true)}
                    title="删除这个词包"
                    aria-label="删除这个词包"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            {activeSession && !activeIsNormal ? (
              <div className="ty-drill-notice">
                <span>
                  {activeSession.kind === "retry" ? "本组重打" : "薄弱词加练"}进行中
                  · {activeSession.currentIndex + 1} / {activeSession.queue.length}
                </span>
                <button type="button" onClick={onClose}>
                  继续
                </button>
              </div>
            ) : null}

            {typable > 0 ? (
              <div className="ty-group-grid" aria-label="练习组">
                {groupCells.map((groupNumber) => {
                  const summary = completed[groupNumber - 1];
                  const isActive =
                    activeIsNormal && groupNumber === activeIndex;
                  const isNext =
                    !activeSession && groupNumber === completed.length + 1;
                  if (!summary && !isActive && !isNext) {
                    return (
                      <span
                        className="ty-group-cell is-planned"
                        key={`planned-${groupNumber}`}
                        aria-hidden="true"
                      >
                        <span>{groupNumber}</span>
                      </span>
                    );
                  }
                  return (
                    <button
                      type="button"
                      key={groupNumber}
                      className={cx(
                        "ty-group-cell",
                        summary && "is-complete",
                        isActive && "is-active",
                        isNext && "is-next",
                      )}
                      disabled={starting || switching}
                      aria-label={
                        summary
                          ? `查看第 ${groupNumber} 组结果`
                          : isActive
                            ? `继续第 ${groupNumber} 组`
                            : `生成第 ${groupNumber} 组`
                      }
                      title={
                        summary
                          ? `${formatDuration(summary.durationMs)} · 正确率 ${Math.round(
                              (summary.typingAccuracy ?? summary.accuracy) * 100,
                            )}%`
                          : isActive
                            ? "继续当前组"
                            : "生成下一组"
                      }
                      onClick={() => {
                        if (summary) {
                          onOpenSummary(summary);
                          onClose();
                        } else if (isActive) {
                          onClose();
                        } else if (isNext) {
                          void startNext();
                        }
                      }}
                    >
                      <span>{groupNumber}</span>
                      {summary ? <small>{groupTime(summary)}</small> : null}
                      {isActive ? <small>进行中</small> : null}
                      {isNext ? <small>下一组</small> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="ty-panel-message">
                这个词包还没有带汉字和读音的词。
              </p>
            )}
          </>
        ) : (
          <p className="ty-panel-message">先选择一个词包，或导入自己的词表。</p>
        )}
      </section>

      {deleteOpen && selectedPack ? (
        <ConfirmDialog
          title={`删除「${selectedPack.name}」？`}
          description="词包和未完成的本组会删除；已学词的错误率、掌握度与复习计划会保留。"
          confirmLabel={deleting ? "删除中…" : "删除词包"}
          danger
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  );
}
