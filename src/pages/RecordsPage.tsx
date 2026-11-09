import {
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { useApp } from "../app/AppContext";
import { Icon } from "../components/Icons";
import { Modal } from "../components/Modal";
import { WordDetailDialog } from "../components/WordDetailDialog";
import {
  Badge,
  EmptyState,
  PageHeader,
  Segmented,
  StatCard,
} from "../components/ui";
import { collectAnswerActivity } from "../data/activity";
import {
  MASTERY_LABELS,
  masteryBand,
} from "../data/srs";
import type {
  PackWord,
  SessionSummary,
  WordStat,
} from "../data/types";
import { hasKanji } from "../lib/kana";
import {
  cx,
  dayKey,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeDue,
  relativeTime,
  startOfDay,
} from "../lib/utils";

type RecordsTab = "words" | "due" | "sessions";
type WordFilter = "all" | "weak" | "due" | "mastered";
type WordSort = "weak" | "recent" | "due" | "attempts";

function computeStreak(dates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!dates.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  for (let index = 0; index < 3650; index += 1) {
    if (!dates.has(dayKey(cursor.getTime()))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function statToWord(stat: WordStat): PackWord {
  return {
    key: stat.key,
    word: stat.word,
    reading: stat.reading,
    meaning: stat.meaning,
    jlpt: "",
    hasKanji: hasKanji(stat.word),
    addedAt: stat.firstSeenAt,
  };
}

function SessionDetailDialog({
  session,
  words,
  onClose,
}: {
  session: SessionSummary;
  words: Map<string, PackWord>;
  onClose: () => void;
}) {
  return (
    <Modal
      title="练习会话详情"
      description={`${session.packName} · ${formatDateTime(session.endedAt)}`}
      size="lg"
      onClose={onClose}
    >
      <div className="session-detail">
        <div className="session-detail-stats">
          <div>
            <span>词数</span>
            <strong>{session.total}</strong>
          </div>
          <div>
            <span>一次答对</span>
            <strong>{formatPercent(session.accuracy)}</strong>
          </div>
          <div>
            <span>总用时</span>
            <strong>{formatDuration(session.durationMs)}</strong>
          </div>
          <div>
            <span>最高连击</span>
            <strong>{session.maxCombo}</strong>
          </div>
        </div>
        <div className="session-answer-list">
          {session.answers.map((answer, index) => {
            const word = words.get(answer.wordKey);
            return (
              <div className="session-answer-row" key={`${answer.wordKey}-${index}`}>
                <span className="session-answer-number">{index + 1}</span>
                <span className="session-answer-word">
                  <strong>{word?.word ?? answer.wordKey.split("|")[0]}</strong>
                  <small>{word?.reading ?? answer.wordKey.split("|")[1]}</small>
                </span>
                <span className="session-answer-meaning">
                  {word?.meaning || "—"}
                </span>
                <span className="session-answer-time">
                  {(answer.durationMs / 1000).toFixed(1)}s
                </span>
                <Badge
                  tone={
                    answer.result === "skipped"
                      ? "danger"
                      : answer.firstTryCorrect
                        ? "success"
                        : "warning"
                  }
                >
                  {answer.result === "skipped"
                    ? "跳过"
                    : answer.firstTryCorrect
                      ? "一次答对"
                      : answer.hintUsed
                        ? "用提示"
                        : `${answer.errors} 次错误`}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export function RecordsPage() {
  const { sessions, wordStats, packs, plans, settings, progressForPack } = useApp();
  const stats = useMemo(() => [...wordStats.values()], [wordStats]);
  const [tab, setTab] = useState<RecordsTab>("words");
  const [wordFilter, setWordFilter] = useState<WordFilter>("all");
  const [wordSort, setWordSort] = useState<WordSort>("weak");
  const [packFilter, setPackFilter] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [wordLimit, setWordLimit] = useState(60);
  const [detailWord, setDetailWord] = useState<PackWord | null>(null);
  const [detailSession, setDetailSession] = useState<SessionSummary | null>(null);

  const wordMap = useMemo(() => {
    const map = new Map<string, PackWord>();
    for (const pack of packs) {
      for (const word of pack.words) {
        if (!map.has(word.key)) map.set(word.key, word);
      }
    }
    return map;
  }, [packs]);

  const todayStart = startOfDay();
  const learned = stats.filter((stat) => stat.attempts > 0);
  const mastered = learned.filter((stat) => stat.mastery >= 70).length;
  const due = learned.filter((stat) => stat.dueAt <= Date.now()).length;
  const totalAttempts = learned.reduce((sum, stat) => sum + stat.attempts, 0);
  const totalFirstTry = learned.reduce(
    (sum, stat) => sum + stat.correctFirstTry,
    0,
  );
  const overallAccuracy =
    totalAttempts > 0 ? totalFirstTry / totalAttempts : 0;
  const answerActivity = useMemo(
    () => collectAnswerActivity(sessions, plans),
    [plans, sessions],
  );
  const activeDays = new Set(
    answerActivity.map((answer) => dayKey(answer.answeredAt)),
  );
  const streak = computeStreak(activeDays);
  const todayAnswers = answerActivity.filter(
    (answer) => answer.answeredAt >= todayStart,
  ).length;

  const week = useMemo(() => {
    const days: Array<{
      key: string;
      label: string;
      count: number;
      minutes: number;
      accuracy: number;
    }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = dayKey(date.getTime());
      const dayAnswers = answerActivity.filter(
        (answer) => dayKey(answer.answeredAt) === key,
      );
      const correct = dayAnswers.filter(
        (answer) => answer.firstTryCorrect && answer.result === "correct",
      ).length;
      days.push({
        key,
        label: new Intl.DateTimeFormat("zh-CN", {
          weekday: "short",
        }).format(date),
        count: dayAnswers.length,
        minutes:
          dayAnswers.reduce((sum, answer) => sum + answer.durationMs, 0) / 60_000,
        accuracy: dayAnswers.length > 0 ? correct / dayAnswers.length : 0,
      });
    }
    return days;
  }, [answerActivity]);
  const maxWeek = Math.max(1, ...week.map((day) => day.count));

  const packKeys = useMemo(() => {
    if (packFilter === "all") return null;
    const pack = packs.find((entry) => entry.id === packFilter);
    return new Set(pack?.words.map((word) => word.key) ?? []);
  }, [packFilter, packs]);

  const filteredStats = useMemo(() => {
    const now = Date.now();
    const rawQuery = deferredQuery.trim().toLowerCase();
    const rows = learned.filter((stat) => {
      if (packKeys && !packKeys.has(stat.key)) return false;
      if (wordFilter === "weak" && !(stat.errorRate >= 0.25 || stat.mastery < 40)) {
        return false;
      }
      if (wordFilter === "due" && stat.dueAt > now) return false;
      if (wordFilter === "mastered" && stat.mastery < 70) return false;
      if (!rawQuery) return true;
      return (
        stat.word.toLowerCase().includes(rawQuery) ||
        stat.reading.toLowerCase().includes(rawQuery) ||
        stat.meaning.toLowerCase().includes(rawQuery)
      );
    });
    rows.sort((a, b) => {
      if (wordSort === "recent") return b.lastReviewedAt - a.lastReviewedAt;
      if (wordSort === "due") return a.dueAt - b.dueAt;
      if (wordSort === "attempts") return b.attempts - a.attempts;
      return (
        b.errorRate - a.errorRate ||
        a.mastery - b.mastery ||
        b.attempts - a.attempts
      );
    });
    return rows;
  }, [deferredQuery, learned, packKeys, wordFilter, wordSort]);

  const dueStats = useMemo(
    () =>
      learned
        .filter((stat) => stat.dueAt <= Date.now())
        .sort((a, b) => a.dueAt - b.dueAt || b.errorRate - a.errorRate),
    [learned],
  );

  const weakStats = useMemo(
    () =>
      [...learned]
        .sort(
          (a, b) =>
            b.errorRate - a.errorRate ||
            a.mastery - b.mastery ||
            b.attempts - a.attempts,
        )
        .slice(0, 5),
    [learned],
  );

  const filterOptions: Array<{ value: WordFilter; label: string; count?: number }> = [
    { value: "all", label: "全部", count: learned.length },
    {
      value: "weak",
      label: "薄弱",
      count: learned.filter(
        (stat) => stat.errorRate >= 0.25 || stat.mastery < 40,
      ).length,
    },
    { value: "due", label: "到期", count: due },
    { value: "mastered", label: "已掌握", count: mastered },
  ];

  const openStat = (stat: WordStat) => {
    setDetailWord(wordMap.get(stat.key) ?? statToWord(stat));
  };

  return (
    <div className="page records-page">
      <PageHeader
        eyebrow="RECORDS / 记录"
        title="每一次卡住，都有迹可循。"
        description="错误率、掌握度、复习日期和完整答题历史都保存在当前浏览器。记录按「单词 + 读音」共享，不因切换词包而丢失。"
      />

      <section className="records-overview">
        <StatCard
          label="已学词条"
          value={learned.length}
          detail={`${mastered} 个掌握度 ≥ 70%`}
          icon="book"
        />
        <StatCard
          label="一次答对率"
          value={totalAttempts > 0 ? formatPercent(overallAccuracy) : "—"}
          detail={`${totalAttempts} 次累计作答`}
          icon="target"
        />
        <StatCard
          label="今日到期"
          value={due}
          detail={due > 0 ? "整包动态队列会优先复习" : "当前没有积压"}
          icon="calendar"
          accent={due > 0}
        />
        <StatCard
          label="连续学习"
          value={`${streak} 天`}
          detail={`今天已完成 ${todayAnswers} / ${settings.dailyGoal} 词`}
          icon="flame"
        />
      </section>

      <div className="records-main-grid">
        <section className="panel records-chart-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">LAST 7 DAYS / 最近 7 天</p>
              <h2>练习节奏</h2>
            </div>
            <span className="panel-meta">
              {week.reduce((sum, day) => sum + day.count, 0)} 词 ·{" "}
              {Math.round(week.reduce((sum, day) => sum + day.minutes, 0))} 分钟
            </span>
          </div>
          <div className="records-chart" aria-label="最近七天答题数量">
            {week.map((day) => (
              <div className="records-chart-day" key={day.key}>
                <span className="records-chart-value">{day.count || ""}</span>
                <div className="records-chart-track">
                  <span
                    className={cx(
                      "records-chart-bar",
                      day.key === dayKey(Date.now()) && "is-today",
                    )}
                    style={{
                      height: `${Math.max(day.count > 0 ? 10 : 2, (day.count / maxWeek) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{day.label}</strong>
                <small>
                  {day.count > 0 ? formatPercent(day.accuracy) : "—"}
                </small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel weak-words-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">WEAK SPOTS / 薄弱点</p>
              <h2>优先再看一眼</h2>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTab("words");
                setWordFilter("weak");
              }}
            >
              查看全部 <Icon name="arrow-right" size={14} />
            </button>
          </div>
          {weakStats.length > 0 ? (
            <div className="weak-word-list">
              {weakStats.map((stat) => (
                <button
                  type="button"
                  className="weak-word-row"
                  key={stat.key}
                  onClick={() => openStat(stat)}
                >
                  <span>
                    <strong>{stat.word}</strong>
                    <small>{stat.reading}</small>
                  </span>
                  <span className="weak-word-mastery">
                    <i style={{ width: `${stat.mastery}%` }} />
                  </span>
                  <span className="weak-word-rate">
                    {formatPercent(stat.errorRate)} 错误
                  </span>
                  <Icon name="chevron-right" size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <Icon name="sparkles" size={20} />
              <p>还没有足够的学习记录来判断薄弱词。</p>
            </div>
          )}
        </section>
      </div>

      <div className="records-tabs">
        <button
          type="button"
          className={cx(tab === "words" && "is-active")}
          onClick={() => setTab("words")}
        >
          词汇记录 <span>{learned.length}</span>
        </button>
        <button
          type="button"
          className={cx(tab === "due" && "is-active")}
          onClick={() => setTab("due")}
        >
          到期复习 <span>{due}</span>
        </button>
        <button
          type="button"
          className={cx(tab === "sessions" && "is-active")}
          onClick={() => setTab("sessions")}
        >
          练习会话 <span>{sessions.length}</span>
        </button>
      </div>

      {tab === "words" ? (
        <section className="panel records-list-panel">
          <div className="records-controls">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setWordLimit(60);
                }}
                placeholder="搜索单词、读音或释义"
                aria-label="搜索词汇记录"
              />
              {query ? (
                <button
                  type="button"
                  className="icon-btn icon-btn-small"
                  onClick={() => setQuery("")}
                  aria-label="清空搜索"
                >
                  <Icon name="close" size={15} />
                </button>
              ) : null}
            </div>
            <label className="inline-select">
              <Icon name="library" size={15} />
              <select
                value={packFilter}
                onChange={(event) => {
                  setPackFilter(event.target.value);
                  setWordLimit(60);
                }}
              >
                <option value="all">全部词包</option>
                {packs.map((pack) => (
                  <option value={pack.id} key={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-select">
              <Icon name="filter" size={15} />
              <select
                value={wordSort}
                onChange={(event) => setWordSort(event.target.value as WordSort)}
              >
                <option value="weak">错误率最高</option>
                <option value="recent">最近练习</option>
                <option value="due">最快到期</option>
                <option value="attempts">练习次数</option>
              </select>
            </label>
          </div>
          <div className="records-controls-secondary">
            <Segmented
              value={wordFilter}
              onChange={(value) => {
                setWordFilter(value);
                setWordLimit(60);
              }}
              options={filterOptions}
              label="筛选词汇记录"
            />
            <span className="records-result-count">
              {filteredStats.length} 个词
            </span>
          </div>

          {filteredStats.length === 0 ? (
            <EmptyState
              icon={learned.length === 0 ? "keyboard" : "filter"}
              title={learned.length === 0 ? "还没有词汇记录" : "没有符合条件的词"}
              description={
                learned.length === 0
                  ? "完成第一组打字练习后，错误率和掌握度会出现在这里。"
                  : "换一个词包、搜索词或筛选条件试试。"
              }
            />
          ) : (
            <>
              <div className="records-word-table">
                <div className="records-word-head">
                  <span>词条</span>
                  <span>练习</span>
                  <span>错误率</span>
                  <span>掌握度</span>
                  <span>下次复习</span>
                  <span />
                </div>
                {filteredStats.slice(0, wordLimit).map((stat) => (
                  <button
                    type="button"
                    className="records-word-row"
                    key={stat.key}
                    onClick={() => openStat(stat)}
                  >
                    <span className="records-word-main">
                      <strong>{stat.word}</strong>
                      <small>{stat.reading}</small>
                      <em>{stat.meaning || "暂无释义"}</em>
                    </span>
                    <span>
                      <b>{stat.attempts}</b>
                      <small>
                        {stat.bestStreak > 0 ? `最佳连击 ${stat.bestStreak}` : "—"}
                      </small>
                    </span>
                    <span
                      className={cx(
                        "records-error-rate",
                        stat.errorRate >= 0.5
                          ? "is-high"
                          : stat.errorRate >= 0.25
                            ? "is-mid"
                            : "",
                      )}
                    >
                      <b>{formatPercent(stat.errorRate)}</b>
                      <small>{stat.mistakes} 次输入错误</small>
                    </span>
                    <span className="records-mastery-cell">
                      <span className="mini-mastery">
                        <i style={{ width: `${stat.mastery}%` }} />
                      </span>
                      <small>
                        {MASTERY_LABELS[masteryBand(stat)]} · {stat.mastery}%
                      </small>
                    </span>
                    <span
                      className={cx(
                        "records-due-cell",
                        stat.dueAt <= Date.now() && "is-due",
                      )}
                    >
                      {formatRelativeDue(stat.dueAt)}
                      <small>{relativeTime(stat.lastReviewedAt)}</small>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                ))}
              </div>
              {filteredStats.length > wordLimit ? (
                <button
                  type="button"
                  className="load-more"
                  onClick={() => setWordLimit((value) => value + 60)}
                >
                  再显示 {Math.min(60, filteredStats.length - wordLimit)} 个
                  <Icon name="chevron-down" size={15} />
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "due" ? (
        <section className="panel records-list-panel">
          <div className="due-list-heading">
            <div>
              <span className="micro-label">SCHEDULED / 到期队列</span>
              <h2>{due > 0 ? `${due} 个词等待复习` : "今天的复习已清空"}</h2>
              <p>
                到期词会在下一次生成任务时优先出现，不会被固定分组顺序挡住。
              </p>
            </div>
            <div className="due-list-summary">
              <span>已掌握 {mastered}</span>
              <span>学习中 {Math.max(0, learned.length - mastered)}</span>
            </div>
          </div>
          {dueStats.length === 0 ? (
            <EmptyState
              icon="check"
              title="没有到期词"
              description="可以开始一组新词，或提前巩固掌握度最低的词。"
            />
          ) : (
            <div className="due-word-grid">
              {dueStats.map((stat) => (
                <button
                  type="button"
                  className="due-word-card"
                  key={stat.key}
                  onClick={() => openStat(stat)}
                >
                  <span className="due-word-top">
                    <strong>{stat.word}</strong>
                    <Badge tone="warning">{formatRelativeDue(stat.dueAt)}</Badge>
                  </span>
                  <span className="due-word-reading">{stat.reading}</span>
                  <span className="due-word-meta">
                    <span>{formatPercent(stat.errorRate)} 错误率</span>
                    <span>{stat.mastery}% 掌握</span>
                    <span>{stat.attempts} 次练习</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "sessions" ? (
        <section className="panel records-list-panel">
          <div className="session-list-heading">
            <div>
              <span className="micro-label">HISTORY / 历史</span>
              <h2>完成的练习会话</h2>
            </div>
            <span>
              累计 {sessions.reduce((sum, session) => sum + session.total, 0)} 词
            </span>
          </div>
          {sessions.length === 0 ? (
            <EmptyState
              icon="list"
              title="还没有完成的会话"
              description="每一组结束后，构成、正确率、用时和逐词结果都会保存在这里。"
            />
          ) : (
            <div className="session-list">
              {sessions.map((session) => (
                <button
                  type="button"
                  className="session-list-row"
                  key={session.id}
                  onClick={() => setDetailSession(session)}
                >
                  <span className="session-list-icon">
                    <Icon name="keyboard" size={19} />
                  </span>
                  <span className="session-list-main">
                    <strong>{session.packName}</strong>
                    <small>
                      {formatDateTime(session.endedAt)} · {session.total} 词 ·{" "}
                      {formatDuration(session.durationMs)}
                    </small>
                  </span>
                  <span className="session-list-composition">
                    {session.composition.new > 0 ? (
                      <Badge tone="accent">{session.composition.new} 新词</Badge>
                    ) : null}
                    {session.composition.review > 0 ? (
                      <Badge tone="warning">
                        {session.composition.review} 复习
                      </Badge>
                    ) : null}
                    {session.composition.reinforce +
                      session.composition.relearn >
                    0 ? (
                      <Badge>
                        {session.composition.reinforce +
                          session.composition.relearn}{" "}
                        巩固
                      </Badge>
                    ) : null}
                  </span>
                  <span className="session-list-score">
                    <b>{formatPercent(session.accuracy)}</b>
                    <small>一次答对</small>
                  </span>
                  <Icon name="chevron-right" size={16} />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="records-footnote">
        <Icon name="lock" size={15} />
        <p>
          学习记录位于当前浏览器的 IndexedDB，不会上传到服务器。请在设置中定期导出备份。
        </p>
        <div className="records-pack-progress">
          {packs.map((pack) => {
            const progress = progressForPack(pack.id);
            return (
              <span key={pack.id}>
                {pack.name} {Math.round((progress?.completion ?? 0) * 100)}%
              </span>
            );
          })}
        </div>
      </section>

      {detailWord ? (
        <WordDetailDialog
          word={detailWord}
          onClose={() => setDetailWord(null)}
        />
      ) : null}
      {detailSession ? (
        <SessionDetailDialog
          session={detailSession}
          words={wordMap}
          onClose={() => setDetailSession(null)}
        />
      ) : null}
    </div>
  );
}
