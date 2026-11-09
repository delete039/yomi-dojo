import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { useApp } from "../app/AppContext";
import { entryToAddPayload, searchDictionary } from "../data/dictionary";
import type { DictionaryEntry, JLPTLevel, PackWord } from "../data/types";
import { useDictionary } from "../hooks/useDictionary";
import { hasKanji, isKanaOnly, makeWordKey } from "../lib/kana";
import { cx } from "../lib/utils";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Badge, EmptyState, Field } from "./ui";

export function AddWordDialog({
  defaultPackId,
  initialQuery = "",
  initialMode = "search",
  onClose,
}: {
  defaultPackId?: string;
  initialQuery?: string;
  initialMode?: "search" | "manual";
  onClose: () => void;
}) {
  const { packs, selectedPackId, addWordsToPack, notify } = useApp();
  const [targetPackId, setTargetPackId] = useState(
    defaultPackId ?? selectedPackId ?? packs[0]?.id ?? "",
  );
  const [mode, setMode] = useState<"search" | "manual">(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const { dictionary, loading, error, retry } = useDictionary(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualWord, setManualWord] = useState(initialMode === "manual" ? initialQuery : "");
  const [manualReading, setManualReading] = useState("");
  const [manualMeaning, setManualMeaning] = useState("");
  const [manualLevel, setManualLevel] = useState<JLPTLevel>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pack = packs.find((item) => item.id === targetPackId) ?? null;
  const packKeys = useMemo(
    () => new Set(pack?.words.map((word) => word.key) ?? []),
    [pack],
  );
  const results = useMemo(
    () => (dictionary ? searchDictionary(dictionary, deferredQuery, 50) : []),
    [dictionary, deferredQuery],
  );

  const addEntry = async (entry: DictionaryEntry) => {
    if (!pack) {
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
      const changed = await addWordsToPack(pack.id, [word]);
      if (changed > 0) {
        notify(
          payload.hasKanji
            ? `已将「${payload.word}」加入「${pack.name}」。`
            : `已将「${payload.word}」加入词包；无汉字词不会进入打字队列。`,
          "success",
        );
      } else {
        notify("这个词已经在词包中。", "info");
      }
    } catch (addError) {
      notify(addError instanceof Error ? addError.message : "添加失败。", "error");
    }
  };

  const addManual = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const wordText = manualWord.normalize("NFC").trim();
    const readingText = manualReading.normalize("NFC").replace(/\s/g, "").trim();
    if (!wordText) {
      setFormError("请输入单词。");
      return;
    }
    if (!readingText) {
      setFormError("请输入假名读音。");
      return;
    }
    if (!isKanaOnly(readingText)) {
      setFormError("读音只能使用平假名或片假名。");
      return;
    }
    if (!pack) {
      setFormError("请先选择目标词包。");
      return;
    }
    const key = makeWordKey(wordText, readingText);
    if (packKeys.has(key)) {
      setFormError("词包中已经存在同一词条。");
      return;
    }
    setSaving(true);
    try {
      const word: PackWord = {
        key,
        word: wordText,
        reading: readingText,
        meaning: manualMeaning.trim(),
        jlpt: manualLevel,
        hasKanji: hasKanji(wordText),
        addedAt: Date.now(),
      };
      await addWordsToPack(pack.id, [word]);
      notify(`已将「${wordText}」加入「${pack.name}」。`, "success");
      onClose();
    } catch (addError) {
      setFormError(addError instanceof Error ? addError.message : "添加失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="添加词汇"
      description="搜索离线词典，或手动创建词典未收录的词条。"
      onClose={onClose}
      size="lg"
      className="add-word-modal"
    >
      <div className="dialog-toolbar">
        <div className="dialog-tabs" role="tablist" aria-label="添加方式">
          <button
            type="button"
            className={cx(mode === "search" && "is-active")}
            onClick={() => setMode("search")}
            role="tab"
            aria-selected={mode === "search"}
          >
            词典搜索
          </button>
          <button
            type="button"
            className={cx(mode === "manual" && "is-active")}
            onClick={() => setMode("manual")}
            role="tab"
            aria-selected={mode === "manual"}
          >
            手动创建
          </button>
        </div>
        <label className="inline-select">
          <span>加入</span>
          <select value={targetPackId} onChange={(event) => setTargetPackId(event.target.value)}>
            {packs.length === 0 ? <option value="">请先创建词包</option> : null}
            {packs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === "search" ? (
        <>
          <div className="dictionary-search">
            <Icon name="search" size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入汉字、假名、罗马字或中文释义"
              autoFocus
              aria-label="搜索词典"
            />
            {query ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
              >
                <Icon name="close" size={17} />
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="dictionary-loading">
              <span className="spinner" />
              <p>正在载入 30,566 条离线词典…</p>
            </div>
          ) : error ? (
            <EmptyState
              icon="alert"
              title="词典加载失败"
              description={error}
              action={
                <button type="button" className="btn btn-secondary" onClick={retry}>
                  重新加载
                </button>
              }
            />
          ) : !query ? (
            <div className="search-intro">
              <span className="search-intro-icon">
                <Icon name="book" size={24} />
              </span>
              <div>
                <h3>从公开词典中查找</h3>
                <p>支持按单词、读音或中文释义检索。词典未收录的词可切换到「手动创建」。</p>
                <div className="suggestion-chips">
                  {["勉強", "約束", "懐かしい", "仕方"].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chip"
                      onClick={() => setQuery(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon="search"
              title="词典中没有找到"
              description="可以换一种写法检索，或手动创建这个词条。"
              action={
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setManualWord(query);
                    setMode("manual");
                  }}
                >
                  手动添加「{query}」
                </button>
              }
            />
          ) : (
            <div className="dictionary-results">
              <div className="result-count">
                找到 {results.length} 个结果 <span>按相关度排序</span>
              </div>
              <div className="dictionary-list">
                {results.map((entry) => {
                  const key = makeWordKey(entry.word, entry.reading);
                  const exists = packKeys.has(key);
                  const expanded = expandedId === entry.dictId;
                  return (
                    <article className="dictionary-row" key={entry.dictId}>
                      <div className="dictionary-row-main">
                        <div className="dictionary-word">
                          <strong>{entry.word}</strong>
                          <span>{entry.reading}</span>
                        </div>
                        <div className="dictionary-tags">
                          {entry.jlpt ? <Badge tone="accent">{entry.jlpt}</Badge> : null}
                          {entry.pos ? <Badge>{entry.pos}</Badge> : null}
                          {entry.rank > 0 ? (
                            <span className="rank-tag">频度 #{entry.rank}</span>
                          ) : null}
                        </div>
                        <p className={cx("dictionary-meaning", expanded && "is-expanded")}>
                          {entry.meaning}
                        </p>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setExpandedId(expanded ? null : entry.dictId)}
                        >
                          {expanded ? "收起" : "详情"}
                          <Icon
                            name="chevron-down"
                            size={14}
                            className={cx(expanded && "rotate-180")}
                          />
                        </button>
                        {expanded ? (
                          <div className="dictionary-extra">
                            {entry.altReadings.length > 0 ? (
                              <p>
                                <span>其他读音</span>
                                {entry.altReadings.join("、")}
                              </p>
                            ) : null}
                            {entry.variants.length > 0 ? (
                              <p>
                                <span>其他写法</span>
                                {entry.variants.join("、")}
                              </p>
                            ) : null}
                            <p>
                              <span>词条编号</span>
                              {entry.dictId}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={cx("btn btn-sm", exists ? "btn-ghost" : "btn-secondary")}
                        onClick={() => void addEntry(entry)}
                        disabled={exists || !pack}
                      >
                        {exists ? (
                          <>
                            <Icon name="check" size={15} /> 已在词包
                          </>
                        ) : (
                          <>
                            <Icon name="plus" size={15} /> 加入
                          </>
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <form className="manual-word-form" onSubmit={(event) => void addManual(event)}>
          <div className="form-grid two">
            <Field label="单词" htmlFor="manual-word">
              <input
                id="manual-word"
                value={manualWord}
                onChange={(event) => setManualWord(event.target.value)}
                placeholder="例：懐かしい"
                autoFocus
              />
            </Field>
            <Field label="读音" htmlFor="manual-reading">
              <input
                id="manual-reading"
                value={manualReading}
                onChange={(event) => setManualReading(event.target.value)}
                placeholder="なつかしい"
              />
            </Field>
          </div>
          <Field label="中文释义" htmlFor="manual-meaning" hint="可留空，之后仍可正常练习。">
            <textarea
              id="manual-meaning"
              rows={3}
              value={manualMeaning}
              onChange={(event) => setManualMeaning(event.target.value)}
              placeholder="怀念的；令人怀念的"
            />
          </Field>
          <Field label="JLPT 等级" htmlFor="manual-level">
            <select
              id="manual-level"
              value={manualLevel}
              onChange={(event) => setManualLevel(event.target.value as JLPTLevel)}
            >
              <option value="">未标注</option>
              <option value="N1">N1</option>
              <option value="N2">N2</option>
              <option value="N3">N3</option>
              <option value="N4">N4</option>
              <option value="N5">N5</option>
            </select>
          </Field>
          {manualWord && !hasKanji(manualWord) ? (
            <p className="inline-warning">
              <Icon name="alert" size={15} />
              这个词没有汉字，可保存到词包，但不会进入打字练习。
            </p>
          ) : null}
          {formError ? (
            <p className="form-error">
              <Icon name="alert" size={15} /> {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "保存中…" : "加入词包"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
