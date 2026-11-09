import { useState } from "react";
import { useApp } from "../app/AppContext";
import { MASTERY_LABELS, masteryBand } from "../data/srs";
import type { Pack, PackWord } from "../data/types";
import { speakJapanese } from "../lib/audio";
import {
  cx,
  formatDateTime,
  formatPercent,
  formatRelativeDue,
  relativeTime,
} from "../lib/utils";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Badge } from "./ui";

interface WordDetailDialogProps {
  word: PackWord;
  pack?: Pack | null;
  onClose: () => void;
  onRemoved?: () => void;
}

export function WordDetailDialog({
  word,
  pack,
  onClose,
  onRemoved,
}: WordDetailDialogProps) {
  const { wordStats, removeWordFromPack, notify } = useApp();
  const stat = wordStats.get(word.key);
  const band = masteryBand(stat);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!pack) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      window.setTimeout(() => setConfirmRemove(false), 5000);
      return;
    }
    setRemoving(true);
    try {
      const discarded = await removeWordFromPack(pack.id, word.key);
      notify(
        discarded ? "词条已移除，进行中的本组已结束但记录已保留。" : "词条已从词包移除。",
        "success",
      );
      onRemoved?.();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "移除失败。", "error");
      setRemoving(false);
    }
  };

  return (
    <Modal
      title={word.word}
      description={word.meaning || "暂无释义"}
      onClose={onClose}
      size="md"
      footer={
        <>
          {pack ? (
            <button
              type="button"
              className={cx("btn", confirmRemove ? "btn-danger" : "btn-ghost-danger")}
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              <Icon name="trash" size={16} />
              {removing ? "移除中…" : confirmRemove ? "再次点击确认" : "从词包移除"}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="word-detail">
        <div className="word-detail-hero">
          <div>
            <div className="word-detail-reading">{word.reading}</div>
            <div className="word-detail-meta">
              {word.jlpt ? <Badge tone="accent">{word.jlpt}</Badge> : null}
              {word.pos ? <Badge>{word.pos}</Badge> : null}
              {word.sourceGroup ? <Badge tone="muted">{word.sourceGroup}</Badge> : null}
              {!word.hasKanji ? <Badge tone="warning">无汉字</Badge> : null}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            onClick={() => speakJapanese(word.reading)}
            title="朗读读音"
          >
            <Icon name="volume" />
            <span className="sr-only">朗读读音</span>
          </button>
        </div>

        <div className="word-detail-score">
          <div className="score-heading">
            <span>掌握度</span>
            <strong>{stat?.mastery ?? 0}%</strong>
          </div>
          <div className="mastery-bar">
            <span style={{ width: `${stat?.mastery ?? 0}%` }} />
          </div>
          <div className="score-caption">
            <Badge tone={band === "new" ? "muted" : band === "learning" ? "warning" : "success"}>
              {MASTERY_LABELS[band]}
            </Badge>
            <span>
              {stat?.attempts
                ? `${stat.attempts} 次练习 · ${formatPercent(stat.errorRate)} 未一次答对`
                : "还没有练习记录"}
            </span>
          </div>
        </div>

        <div className="detail-metrics">
          <div>
            <span>一次答对</span>
            <strong>{stat ? formatPercent(stat.accuracy) : "—"}</strong>
          </div>
          <div>
            <span>错误次数</span>
            <strong>{stat?.wrong ?? 0}</strong>
          </div>
          <div>
            <span>跳过</span>
            <strong>{stat?.skipped ?? 0}</strong>
          </div>
          <div>
            <span>下次复习</span>
            <strong>{stat ? formatRelativeDue(stat.dueAt) : "未开始"}</strong>
          </div>
        </div>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h3>最近记录</h3>
            {stat ? <span>共 {stat.attempts} 次</span> : null}
          </div>
          {stat?.history.length ? (
            <div className="history-list">
              {[...stat.history]
                .reverse()
                .slice(0, 6)
                .map((item, index) => (
                  <div className="history-row" key={`${item.at}-${index}`}>
                    <span
                      className={cx(
                        "history-result",
                        item.result === "correct" && item.errors === 0 && !item.hintUsed
                          ? "is-good"
                          : item.result === "skipped"
                            ? "is-skip"
                            : "is-bad",
                      )}
                    >
                      {item.result === "correct"
                        ? item.errors === 0 && !item.hintUsed
                          ? "一次答对"
                          : item.hintUsed
                            ? "用提示完成"
                            : "有错误"
                        : item.result === "skipped"
                          ? "跳过"
                          : "有错误"}
                    </span>
                    <span>{item.errors > 0 ? `${item.errors} 次输入错误` : "无输入错误"}</span>
                    <time dateTime={new Date(item.at).toISOString()}>
                      {relativeTime(item.at)}
                    </time>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted-copy">开始练习后，这里会记录每次结果。</p>
          )}
        </section>

        <div className="detail-footnote">
          <Icon name="database" size={15} />
          <span>
            词条标识 <code>{word.key}</code>
            {stat ? ` · 首次学习 ${formatDateTime(stat.firstSeenAt)}` : ""}
          </span>
        </div>
      </div>
    </Modal>
  );
}
