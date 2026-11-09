import { useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import {
  entryToAddPayload,
  searchDictionary,
} from "../data/dictionary";
import type { DictionaryEntry, PackWord } from "../data/types";
import { useDictionary } from "../hooks/useDictionary";
import { makeWordKey } from "../lib/kana";
import { cx } from "../lib/utils";
import { DictionaryDetailDialog } from "./DictionaryDetailDialog";
import { Icon } from "./Icons";
import { Badge, EmptyState } from "./ui";

const SUGGESTIONS = ["勉強", "約束", "懐かしい", "仕方", "届ける", "穏やか"];

export function DictionaryBrowser({
  onManualAdd,
}: {
  onManualAdd: (query: string) => void;
}) {
  const { packs, selectedPackId, addWordsToPack, notify, wordStats } = useApp();
  const { dictionary, loading, error, retry } = useDictionary(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [targetPackId, setTargetPackId] = useState(
    selectedPackId ?? packs[0]?.id ?? "",
  );
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const targetPack = packs.find((pack) => pack.id === targetPackId) ?? null;
  const packKeys = useMemo(
    () => new Set(targetPack?.words.map((word) => word.key) ?? []),
    [targetPack],
  );
  const results = useMemo(
    () => (dictionary ? searchDictionary(dictionary, deferredQuery, 60) : []),
    [deferredQuery, dictionary],
  );

  const addEntry = async (entry: DictionaryEntry) => {
    if (!targetPack) {
      notify("请先选择目标词包。", "error");
      return;
    }
    const payload = entryToAddPayload(entry);
    const word: PackWord = {
      ...payload,
      key: makeWordKey(payload.word, payload.reading),
      addedAt: Date.now(),
    };
    try {
      const changed = await addWordsToPack(targetPack.id, [word]);
      notify(
        changed > 0
          ? `已将「${entry.word}」加入「${targetPack.name}」。`
          : "这个词已经在词包中。",
        changed > 0 ? "success" : "info",
      );
    } catch (addError) {
      notify(addError instanceof Error ? addError.message : "添加失败。", "error");
    }
  };

  if (loading) {
    return (
      <div className="dictionary-page-loading">
        <span className="spinner" />
        <h2>正在建立本地词典索引</h2>
        <p>约 4 MB，首次加载后会由浏览器缓存。</p>
        <div className="skeleton-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (error || !dictionary) {
    return (
      <EmptyState
        icon="alert"
        title="词典加载失败"
        description={error ?? "无法读取词典文件。"}
        action={
          <button type="button" className="btn btn-primary" onClick={retry}>
            重新加载
          </button>
        }
      />
    );
  }

  return (
    <div className="dictionary-browser">
      <div className="dictionary-search-hero">
        <div className="dictionary-search-row">
          <Icon name="search" size={23} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任意日语词、读音、罗马字或中文释义"
            aria-label="搜索离线词典"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setQuery("")}
              aria-label="清空"
            >
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>
        <div className="dictionary-search-meta">
          <span>{dictionary.meta.count.toLocaleString("zh-CN")} 条常用词与 JLPT 词条</span>
          <label className="inline-select">
            <span>添加至</span>
            <select
              value={targetPackId}
              onChange={(event) => setTargetPackId(event.target.value)}
            >
              {packs.length === 0 ? <option value="">请先创建词包</option> : null}
              {packs.map((pack) => (
                <option value={pack.id} key={pack.id}>
                  {pack.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!query ? (
        <div className="dictionary-welcome">
          <div className="dictionary-intro-grid">
            <article className="dictionary-intro-card">
              <span className="dictionary-intro-icon">
                <Icon name="book" size={24} />
              </span>
              <h2>不只是一个词包</h2>
              <p>
                输入汉字、假名、罗马字，甚至中文释义，都能找到对应词条。找到后可直接加入任意词包。
              </p>
            </article>
            <article className="dictionary-intro-card">
              <span className="dictionary-intro-icon">
                <Icon name="database" size={24} />
              </span>
              <h2>本地离线检索</h2>
              <p>
                词典数据随应用提供，查询不依赖账号或服务器。离线词典不含例句，释义、词性、JLPT
                与频度信息完整保留。
              </p>
            </article>
          </div>
          <div className="suggestion-block">
            <span className="micro-label">随便查一个</span>
            <div className="suggestion-chips">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  type="button"
                  className="chip"
                  key={suggestion}
                  onClick={() => setQuery(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className="popular-words">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">COMMON / 高频</p>
                <h2>从高频词开始</h2>
              </div>
            </div>
            <div className="popular-word-grid">
              {dictionary.entries
                .filter((entry) => entry.hasKanji)
                .slice(0, 8)
                .map((entry) => (
                  <button
                    type="button"
                    className="popular-word"
                    key={entry.dictId}
                    onClick={() => setDetailEntry(entry)}
                  >
                    <strong>{entry.word}</strong>
                    <span>{entry.reading}</span>
                    <small>{entry.meaning.split("；")[0]}</small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon="search"
          title={`没有找到「${query}」`}
          description="可能是生僻词、专有名词，或不在离线词典的 30,566 条词目中。你仍可以手动创建。"
          action={
            <button type="button" className="btn btn-primary" onClick={() => onManualAdd(query)}>
              <Icon name="plus" size={16} /> 手动创建词条
            </button>
          }
        />
      ) : (
        <div className="dictionary-result-section">
          <div className="result-count">
            {results.length >= 60 ? "显示前 60 条结果" : `${results.length} 个结果`}
            <span>点击词条查看完整释义</span>
          </div>
          <div className="dictionary-result-list">
            {results.map((entry) => {
              const key = makeWordKey(entry.word, entry.reading);
              const exists = packKeys.has(key);
              const stat = wordStats.get(key);
              return (
                <article className="dictionary-result-row" key={entry.dictId}>
                  <button
                    type="button"
                    className="dictionary-result-main"
                    onClick={() => setDetailEntry(entry)}
                  >
                    <span className="dictionary-result-word">
                      <strong>{entry.word}</strong>
                      <small>{entry.reading}</small>
                    </span>
                    <span className="dictionary-result-meaning">{entry.meaning}</span>
                    <span className="dictionary-result-tags">
                      {entry.jlpt ? <Badge tone="accent">{entry.jlpt}</Badge> : null}
                      {entry.pos ? <Badge>{entry.pos}</Badge> : null}
                      {stat?.attempts ? <Badge tone="success">已学 {stat.mastery}%</Badge> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={cx("btn btn-sm", exists ? "btn-ghost" : "btn-secondary")}
                    onClick={() => void addEntry(entry)}
                    disabled={exists || !targetPack}
                  >
                    <Icon name={exists ? "check" : "plus"} size={15} />
                    {exists ? "已在词包" : "加入"}
                  </button>
                </article>
              );
            })}
          </div>
          <p className="dictionary-license-note">
            词典来自 JMdict / Tomoshi 开放数据，许可 CC BY-SA 4.0。详见设置中的数据许可。
          </p>
        </div>
      )}

      {detailEntry ? (
        <DictionaryDetailDialog
          entry={detailEntry}
          defaultPackId={targetPackId}
          onClose={() => setDetailEntry(null)}
        />
      ) : null}
    </div>
  );
}
