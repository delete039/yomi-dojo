import { useMemo } from "react";
import { useApp } from "../app/AppContext";
import { navigate } from "../app/router";
import { Icon } from "../components/Icons";
import { ProgressRing } from "../components/ProgressRing";
import { Badge, EmptyState, StatCard } from "../components/ui";
import { collectAnswerActivity } from "../data/activity";
import { MASTERY_LABELS, masteryBand } from "../data/srs";
import {
  cx,
  dayKey,
  formatDuration,
  formatPercent,
  relativeTime,
  startOfDay,
} from "../lib/utils";

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

export function HomePage() {
  const {
    sessions,
    wordStats,
    packs,
    plans,
    settings,
    selectedPack,
    selectedPlan,
    selectPack,
    progressForPack,
    notify,
  } = useApp();

  const todayStart = startOfDay();
  const answerActivity = useMemo(
    () => collectAnswerActivity(sessions, plans),
    [plans, sessions],
  );
  const todayAnswers = useMemo(
    () => answerActivity.filter((answer) => answer.answeredAt >= todayStart),
    [answerActivity, todayStart],
  );
  const activeDays = useMemo(
    () => new Set(answerActivity.map((answer) => dayKey(answer.answeredAt))),
    [answerActivity],
  );
  const streak = computeStreak(activeDays);
  const selectedProgress = selectedPack ? progressForPack(selectedPack.id) : null;
  const totalDue = useMemo(
    () => packs.reduce((sum, pack) => sum + (progressForPack(pack.id)?.due ?? 0), 0),
    // progressForPack reads the latest snapshot through a ref.
    [packs, progressForPack],
  );
  const learnedStats = useMemo(
    () => [...wordStats.values()].filter((stat) => stat.attempts > 0),
    [wordStats],
  );
  const mastered = learnedStats.filter((stat) => stat.mastery >= 70).length;
  const totalAttempts = learnedStats.reduce((sum, stat) => sum + stat.attempts, 0);
  const totalCorrect = learnedStats.reduce((sum, stat) => sum + stat.correctFirstTry, 0);
  const overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

  const week = useMemo(() => {
    const days: Array<{ key: string; label: string; date: Date; count: number; minutes: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = dayKey(date.getTime());
      const dayAnswers = answerActivity.filter(
        (answer) => dayKey(answer.answeredAt) === key,
      );
      const minutes =
        dayAnswers.reduce((sum, answer) => sum + answer.durationMs, 0) / 60_000;
      days.push({
        key,
        label: new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date),
        date,
        count: dayAnswers.length,
        minutes,
      });
    }
    return days;
  }, [answerActivity]);
  const maxWeek = Math.max(1, ...week.map((day) => day.count));

  const recent = sessions.slice(0, 3);
  const todayGoal = settings.dailyGoal;
  const goalProgress = Math.min(1, todayAnswers.length / Math.max(1, todayGoal));

  const openPractice = async (packId?: string) => {
    if (!packId && !selectedPack) {
      navigate("library");
      return;
    }
    if (packId && packId !== selectedPack?.id) {
      try {
        await selectPack(packId);
      } catch (error) {
        notify(error instanceof Error ? error.message : "无法切换词包。", "error");
        return;
      }
    }
    navigate("practice");
  };

  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="page home-page">
      <header className="home-heading">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>今天，继续练一组读音。</h1>
        </div>
        <p className="home-heading-note">
          到期复习优先，新词按每日上限加入，空余位置由薄弱词补齐。
        </p>
      </header>

      <section className="hero-grid">
        <article className="today-card">
          <div className="today-card-head">
            <div>
              <span className="micro-label">TODAY / 今日</span>
              <h2>{selectedPack ? selectedPack.name : "选择一个词包"}</h2>
            </div>
            <Badge tone={selectedPlan?.activeSession ? "accent" : "neutral"}>
              {selectedPlan?.activeSession ? "进行中" : "待开始"}
            </Badge>
          </div>

          <div className="today-card-main">
            <div className="today-ring-block">
              <ProgressRing
                value={goalProgress}
                size={124}
                stroke={7}
                label={`今日目标完成 ${Math.round(goalProgress * 100)}%`}
              >
                <strong>{todayAnswers.length}</strong>
                <span>/ {todayGoal} 词</span>
              </ProgressRing>
            </div>
            <div className="today-details">
              <div>
                <span>到期复习</span>
                <strong>{selectedProgress?.due ?? 0}</strong>
              </div>
              <div>
                <span>词包进度</span>
                <strong>{Math.round((selectedProgress?.completion ?? 0) * 100)}%</strong>
              </div>
              <div>
                <span>词包掌握度</span>
                <strong>{selectedProgress?.averageMastery ?? 0}%</strong>
              </div>
            </div>
          </div>

          <div className="today-card-footer">
            <span className="today-note">
              {selectedPlan?.activeSession
                ? `上一组还剩 ${Math.max(0, selectedPlan.activeSession.queue.length - selectedPlan.activeSession.currentIndex)} 个词`
                : todayAnswers.length >= todayGoal
                  ? "今日目标已达成，可以继续巩固。"
                  : `再练 ${Math.max(0, todayGoal - todayAnswers.length)} 个词完成今日目标。`}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void openPractice()}
              disabled={!selectedPack}
            >
              <Icon name="play" size={16} filled />
              {selectedPlan?.activeSession ? "继续本组" : "开始练习"}
            </button>
          </div>
        </article>

        <aside className="hero-side">
          <div className="home-aside-card">
            <span className="micro-label">QUEUE / 队列</span>
            <strong>按整包动态生成</strong>
            <p>每个词包独立保存进度，切换后仍可从原来的那一组继续。</p>
          </div>
          <button type="button" className="quick-action" onClick={() => navigate("library")}>
            <span className="quick-action-icon">
              <Icon name="search" size={20} />
            </span>
            <span>
              <strong>查一个词</strong>
              <small>从离线词典检索读音、释义并加入词包</small>
            </span>
            <Icon name="arrow-right" size={17} />
          </button>
        </aside>
      </section>

      <section className="stats-grid" aria-label="学习统计">
        <StatCard
          label="全部到期"
          value={totalDue}
          detail={totalDue > 0 ? "优先复习，不让它越积越多" : "今天的复习已清空"}
          icon="clock"
          accent={totalDue > 0}
        />
        <StatCard
          label="已掌握"
          value={mastered}
          detail={`${learnedStats.length} 个词已有练习记录`}
          icon="award"
        />
        <StatCard
          label="总体一次答对"
          value={totalAttempts > 0 ? formatPercent(overallAccuracy) : "—"}
          detail={`${totalAttempts} 次累计练习`}
          icon="target"
        />
        <StatCard
          label="连续学习"
          value={`${streak} 天`}
          detail={streak > 0 ? "保持节奏比突击更重要" : "今天开始第一天"}
          icon="flame"
        />
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PACKS / 词包</p>
            <h2>你的学习进度</h2>
          </div>
          <button type="button" className="text-button" onClick={() => navigate("library")}>
            管理词库 <Icon name="arrow-right" size={15} />
          </button>
        </div>
        {packs.length > 0 ? (
          <div className="pack-card-grid">
            {packs.map((pack) => {
              const progress = progressForPack(pack.id);
              const active = selectedPack?.id === pack.id;
              return (
                <article className={cx("pack-card", active && "is-active")} key={pack.id}>
                  <div className="pack-card-head">
                    <div className="pack-card-title">
                      {pack.builtinLevel ? (
                        <span className="pack-level">{pack.builtinLevel}</span>
                      ) : (
                        <span className="pack-level pack-level-custom">自</span>
                      )}
                      <div>
                        <h3>{pack.name}</h3>
                        <p>{pack.words.length} 个词</p>
                      </div>
                    </div>
                    <ProgressRing value={progress?.completion ?? 0} size={48} stroke={3}>
                      <span>{Math.round((progress?.completion ?? 0) * 100)}</span>
                    </ProgressRing>
                  </div>
                  <div className="pack-card-metrics">
                    <span>
                      <b>{progress?.due ?? 0}</b> 待复习
                    </span>
                    <span>
                      <b>{progress?.mastered ?? 0}</b> 已掌握
                    </span>
                    <span>
                      <b>{progress?.accuracy ? formatPercent(progress.accuracy) : "—"}</b> 正确率
                    </span>
                  </div>
                  <div className="pack-card-actions">
                    <button
                      type="button"
                      className={cx("btn", active ? "btn-primary" : "btn-secondary")}
                      onClick={() => void openPractice(pack.id)}
                    >
                      {active ? "开始本组" : "切换并学习"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void selectPack(pack.id).then(() => navigate("library"));
                      }}
                    >
                      查看词包
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="library"
            title="还没有词包"
            description="创建词包后即可开始学习。"
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate("library")}>
                前往词库
              </button>
            }
          />
        )}
      </section>

      <section className="home-lower-grid">
        <article className="panel weekly-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">RHYTHM / 节奏</p>
              <h2>最近 7 天</h2>
            </div>
            <span className="panel-meta">
              {week.reduce((sum, day) => sum + day.count, 0)} 次练习
            </span>
          </div>
          <div className="weekly-chart">
            {week.map((day) => (
              <div className="week-day" key={day.key}>
                <div className="week-bar-track">
                  <div
                    className={cx("week-bar", day.key === dayKey(Date.now()) && "is-today")}
                    style={{ height: `${Math.max(day.count > 0 ? 12 : 3, (day.count / maxWeek) * 100)}%` }}
                    title={`${day.count} 次 · ${Math.round(day.minutes)} 分钟`}
                  />
                </div>
                <span>{day.label}</span>
                <small>{day.count || "—"}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel recent-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">LOG / 最近</p>
              <h2>练习记录</h2>
            </div>
            <button type="button" className="text-button" onClick={() => navigate("records")}>
              全部 <Icon name="arrow-right" size={14} />
            </button>
          </div>
          {recent.length > 0 ? (
            <div className="recent-list">
              {recent.map((session) => (
                <button
                  type="button"
                  className="recent-row"
                  key={session.id}
                  onClick={() => navigate("records")}
                >
                  <span className="recent-icon">
                    <Icon name="keyboard" size={17} />
                  </span>
                  <span className="recent-copy">
                    <strong>{session.packName}</strong>
                    <small>
                      {session.total} 词 · {formatDuration(session.durationMs)} ·{" "}
                      {relativeTime(session.endedAt)}
                    </small>
                  </span>
                  <span className="recent-score">{formatPercent(session.accuracy)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <Icon name="list" size={20} />
              <p>完成第一组后，这里会出现记录。</p>
            </div>
          )}
        </article>
      </section>

      {learnedStats.length > 0 ? (
        <section className="panel weak-ribbon">
          <div className="weak-ribbon-copy">
            <span className="weak-ribbon-icon">
              <Icon name="sparkles" size={19} />
            </span>
            <div>
              <strong>最需要再看一眼的词</strong>
              <p>
                {learnedStats
                  .slice()
                  .sort((a, b) => b.errorRate - a.errorRate || a.mastery - b.mastery)
                  .slice(0, 3)
                  .map((stat) => stat.word)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="weak-ribbon-side">
            <span>{MASTERY_LABELS[masteryBand(learnedStats[0])]}</span>
            <button type="button" className="text-button" onClick={() => navigate("records")}>
              查看薄弱词 <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
