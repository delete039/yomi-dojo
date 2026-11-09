import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import { navigate } from "../app/router";
import type { PackWord } from "../data/types";
import { MASTERY_LABELS, masteryBand } from "../data/srs";
import { queryToReading } from "../lib/kana";
import {
  cx,
  formatPercent,
  formatRelativeDue,
  relativeTime,
} from "../lib/utils";
import { AddWordDialog } from "./AddWordDialog";
import { ConfirmDialog } from "./Modal";
import { Icon } from "./Icons";
import { ImportDialog } from "./ImportDialog";
import { PackFormDialog } from "./PackFormDialog";
import { ProgressRing } from "./ProgressRing";
import { Badge, EmptyState, Segmented } from "./ui";
import { WordDetailDialog } from "./WordDetailDialog";

type StatusFilter = "all" | "new" | "learning" | "due" | "mastered";

function groupLabel(word: PackWord): string {
  return word.sourceGroup?.trim() || (word.groupNumber ? `第 ${word.groupNumber} 组` : "未分组");
}

export function PackBrowser() {
  const {
    packs,
    plans,
    selectedPackId,
    selectPack,
    wordStats,
    progressForPack,
    deletePack,
    notify,
  } = useApp();
  const [browsedPackId, setBrowsedPackId] = useState(
    selectedPackId ?? packs[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [displayLimit, setDisplayLimit] = useState(90);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailWord, setDetailWord] = useState<PackWord | null>(null);

  useEffect(() => {
    if (packs.length === 0) {
      if (browsedPackId) setBrowsedPackId("");
      return;
    }
    if (!packs.some((pack) => pack.id === browsedPackId)) {
      setBrowsedPackId(selectedPackId ?? packs[0].id);
    }
  }, [browsedPackId, packs, selectedPackId]);

  useEffect(() => {
    if (selectedPackId && packs.some((item) => item.id === selectedPackId)) {
      setBrowsedPackId(selectedPackId);
    }
  }, [packs, selectedPackId]);

  const pack = packs.find((item) => item.id === browsedPackId) ?? null;
  const plan = plans.find((item) => item.packId === pack?.id);
  const progress = pack ? progressForPack(pack.id) : null;
  const isSelected = pack?.id === selectedPackId;

  const groups = useMemo(() => {
    if (!pack) return [];
    const counts = new Map<string, { count: number; number: number }>();
    for (const word of pack.words) {
      const label = groupLabel(word);
      const existing = counts.get(label);
      if (existing) existing.count += 1;
      else counts.set(label, { count: 1, number: word.groupNumber ?? 9999 });
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => a.number - b.number || a.label.localeCompare(b.label, "ja"));
  }, [pack]);

  useEffect(() => {
    setDisplayLimit(90);
  }, [deferredQuery, statusFilter, groupFilter, browsedPackId]);

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
    setGroupFilter("all");
  }, [browsedPackId]);

  const filteredWords = useMemo(() => {
    if (!pack) return [];
    const now = Date.now();
    const rawQuery = deferredQuery.trim().toLowerCase();
    const kanaQuery = rawQuery ? queryToReading(rawQuery).toLowerCase() : "";
    return pack.words.filter((word) => {
      if (groupFilter !== "all" && groupLabel(word) !== groupFilter) return false;
      const stat = wordStats.get(word.key);
      if (statusFilter === "new" && stat?.attempts) return false;
      if (statusFilter === "learning" && (!stat?.attempts || stat.mastery >= 70)) return false;
      if (statusFilter === "due" && (!stat?.attempts || stat.dueAt > now)) return false;
      if (statusFilter === "mastered" && (!stat?.attempts || stat.mastery < 70)) return false;
      if (!rawQuery) return true;
      return (
        word.word.toLowerCase().includes(rawQuery) ||
        word.reading.toLowerCase().includes(rawQuery) ||
        word.reading.toLowerCase().includes(kanaQuery) ||
        word.meaning.toLowerCase().includes(rawQuery) ||
        (word.sourceGroup ?? "").toLowerCase().includes(rawQuery)
      );
    });
  }, [deferredQuery, groupFilter, pack, statusFilter, wordStats]);

  const visibleWords = filteredWords.slice(0, displayLimit);

  const startPractice = async () => {
    if (!pack) return;
    try {
      if (!isSelected) await selectPack(pack.id);
      navigate("practice");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法切换到该词包。", "error");
    }
  };

  const confirmDelete = async () => {
    if (!pack) return;
    const name = pack.name;
    const nextPack = packs.find((item) => item.id !== pack.id);
    try {
      await deletePack(pack.id);
      setBrowsedPackId(nextPack?.id ?? "");
      setDeleteOpen(false);
      notify(`词包「${name}」已删除，词汇掌握记录仍保留。`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除失败。", "error");
    }
  };

  if (packs.length === 0) {
    return (
      <>
        <EmptyState
          icon="library"
          title="还没有词包"
          description="新建一个词包，或导入 Excel / CSV / JSON 词表。"
          action={
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                新建词包
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>
                导入词表
              </button>
            </div>
          }
        />
        {createOpen ? <PackFormDialog onClose={() => setCreateOpen(false)} /> : null}
        {importOpen ? <ImportDialog onClose={() => setImportOpen(false)} /> : null}
      </>
    );
  }

  return (
    <div className="pack-browser">
      <aside className="pack-list-panel">
        <div className="pack-list-heading">
          <div>
            <span className="micro-label">LIBRARY</span>
            <strong>{packs.length} 个词包</strong>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setCreateOpen(true)}
            aria-label="新建词包"
            title="新建词包"
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="pack-list">
          {packs.map((item) => {
            const itemProgress = progressForPack(item.id);
            const itemPlan = plans.find((entry) => entry.packId === item.id);
            return (
              <button
                type="button"
                key={item.id}
                className={cx(
                  "pack-list-item",
                  item.id === browsedPackId && "is-browsed",
                  item.id === selectedPackId && "is-current",
                )}
                onClick={() => setBrowsedPackId(item.id)}
              >
                <span className={cx("pack-list-badge", item.kind === "custom" && "is-custom")}>
                  {item.builtinLevel ?? "自"}
                </span>
                <span className="pack-list-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.words.length} 词 · {Math.round((itemProgress?.completion ?? 0) * 100)}%
                  </small>
                </span>
                <span className="pack-list-side">
                  {itemPlan?.activeSession ? (
                    <span className="active-dot" title="有进行中的一组" />
                  ) : null}
                  {(itemProgress?.due ?? 0) > 0 ? (
                    <span className="due-count">{itemProgress?.due}</span>
                  ) : (
                    <Icon name="chevron-right" size={15} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="pack-list-add"
          onClick={() => setImportOpen(true)}
        >
          <Icon name="upload" size={16} />
          导入新词包
        </button>
      </aside>

      {pack ? (
        <section className="pack-detail">
          <header className="pack-detail-header">
            <div className="pack-detail-title">
              <div className="pack-detail-badges">
                {pack.builtinLevel ? (
                  <Badge tone="accent">{pack.builtinLevel} 高频</Badge>
                ) : (
                  <Badge>自定义词包</Badge>
                )}
                {isSelected ? <Badge tone="success">当前学习词包</Badge> : null}
                {plan?.activeSession ? <Badge tone="warning">有一组未完成</Badge> : null}
              </div>
              <h2>{pack.name}</h2>
              <p>{pack.description || "还没有写说明。"}</p>
            </div>
            <div className="pack-detail-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditOpen(true)}
                title="编辑词包信息"
                aria-label="编辑词包信息"
              >
                <Icon name="edit" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                onClick={() => setDeleteOpen(true)}
                title="删除词包"
                aria-label="删除词包"
              >
                <Icon name="trash" size={18} />
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void startPractice()}>
                <Icon name="play" size={16} filled />
                {plan?.activeSession
                  ? "继续本组"
                  : isSelected
                    ? "开始一组"
                    : "切换并开始"}
              </button>
            </div>
          </header>

          <div className="pack-overview">
            <div className="pack-overview-ring">
              <ProgressRing value={progress?.completion ?? 0} size={104} stroke={6}>
                <strong>{Math.round((progress?.completion ?? 0) * 100)}%</strong>
                <span>已学</span>
              </ProgressRing>
            </div>
            <div className="pack-overview-stats">
              <div>
                <span>词条总数</span>
                <strong>{progress?.total ?? 0}</strong>
                <small>{progress?.typable ?? 0} 个可练</small>
              </div>
              <div>
                <span>已学习</span>
                <strong>{progress?.learned ?? 0}</strong>
                <small>{progress?.due ?? 0} 个到期</small>
              </div>
              <div>
                <span>已掌握</span>
                <strong>{progress?.mastered ?? 0}</strong>
                <small>掌握度 ≥ 70%</small>
              </div>
              <div>
                <span>一次答对率</span>
                <strong>
                  {progress?.accuracy ? formatPercent(progress.accuracy) : "—"}
                </strong>
                <small>平均掌握 {progress?.averageMastery ?? 0}%</small>
              </div>
            </div>
            <div className="pack-overview-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={16} /> 添加词汇
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={16} /> 导入
              </button>
            </div>
          </div>

          <div className="pack-controls">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索词包内的单词、读音或释义"
                aria-label="搜索词包"
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
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              label="按学习状态筛选"
              options={[
                { value: "all", label: "全部" },
                { value: "new", label: "新词" },
                { value: "learning", label: "学习中" },
                { value: "due", label: "到期" },
                { value: "mastered", label: "已掌握" },
              ]}
            />
            {groups.length > 1 ? (
              <label className="inline-select group-filter">
                <Icon name="filter" size={15} />
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  aria-label="按来源分组筛选"
                >
                  <option value="all">来源：全部 {groups.length} 组</option>
                  {groups.map((group) => (
                    <option value={group.label} key={group.label}>
                      {group.label}（{group.count}）
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="pack-word-summary">
            <span>
              {filteredWords.length === pack.words.length
                ? `共 ${pack.words.length} 个词条`
                : `筛选出 ${filteredWords.length} 个词条`}
            </span>
            <span>
              {pack.source ? `来源：${pack.source}` : "来源：用户导入"}
            </span>
          </div>

          {filteredWords.length === 0 ? (
            <EmptyState
              icon={pack.words.length === 0 ? "plus" : "search"}
              title={pack.words.length === 0 ? "这个词包还是空的" : "没有符合条件的词"}
              description={
                pack.words.length === 0
                  ? "从词典添加，或导入 Excel / CSV / JSON 词表。"
                  : "试试清除搜索词或切换筛选条件。"
              }
              action={
                pack.words.length === 0 ? (
                  <div className="empty-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
                      添加词汇
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>
                      导入词表
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("all");
                      setGroupFilter("all");
                    }}
                  >
                    重置筛选
                  </button>
                )
              }
            />
          ) : (
            <div className="word-table">
              <div className="word-table-head" aria-hidden="true">
                <span>词条</span>
                <span>释义</span>
                <span>掌握度</span>
                <span>错误率</span>
                <span>下次复习</span>
                <span />
              </div>
              {visibleWords.map((word) => {
                const stat = wordStats.get(word.key);
                const band = masteryBand(stat);
                const due = stat?.attempts ? formatRelativeDue(stat.dueAt) : "未开始";
                return (
                  <button
                    type="button"
                    className="word-table-row"
                    key={word.key}
                    onClick={() => setDetailWord(word)}
                  >
                    <span className="word-cell-word">
                      <strong>{word.word}</strong>
                      <small>{word.reading}</small>
                      {!word.hasKanji ? <Badge tone="warning">无汉字</Badge> : null}
                    </span>
                    <span className="word-cell-meaning">{word.meaning || "暂无释义"}</span>
                    <span className="word-cell-mastery">
                      <span className="mini-mastery">
                        <i style={{ width: `${stat?.mastery ?? 0}%` }} />
                      </span>
                      <small>{MASTERY_LABELS[band]}</small>
                    </span>
                    <span className="word-cell-error">
                      {stat?.attempts ? formatPercent(stat.errorRate) : "—"}
                    </span>
                    <span
                      className={cx(
                        "word-cell-due",
                        Boolean(stat?.attempts && stat.dueAt <= Date.now()) && "is-due",
                      )}
                    >
                      {due}
                      {stat?.lastReviewedAt ? (
                        <small>{relativeTime(stat.lastReviewedAt)}</small>
                      ) : null}
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                );
              })}
            </div>
          )}

          {filteredWords.length > displayLimit ? (
            <button
              type="button"
              className="load-more"
              onClick={() => setDisplayLimit((value) => value + 120)}
            >
              再显示 {Math.min(120, filteredWords.length - displayLimit)} 个
              <Icon name="chevron-down" size={15} />
            </button>
          ) : null}
        </section>
      ) : (
        <EmptyState icon="library" title="选择一个词包" />
      )}

      {addOpen && pack ? (
        <AddWordDialog defaultPackId={pack.id} onClose={() => setAddOpen(false)} />
      ) : null}
      {importOpen ? (
        <ImportDialog defaultPackId={pack?.id} onClose={() => setImportOpen(false)} />
      ) : null}
      {editOpen && pack ? <PackFormDialog pack={pack} onClose={() => setEditOpen(false)} /> : null}
      {createOpen ? <PackFormDialog onClose={() => setCreateOpen(false)} /> : null}
      {deleteOpen && pack ? (
        <ConfirmDialog
          title={`删除「${pack.name}」？`}
          description="词包与未完成的本组会被删除；所有词的错误率、掌握度和复习计划会保留。"
          confirmLabel="删除词包"
          danger
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
      {detailWord && pack ? (
        <WordDetailDialog
          word={detailWord}
          pack={pack}
          onClose={() => setDetailWord(null)}
        />
      ) : null}
    </div>
  );
}
