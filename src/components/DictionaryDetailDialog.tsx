import { useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import { entryToAddPayload } from "../data/dictionary";
import type { DictionaryEntry, PackWord } from "../data/types";
import { speakJapanese } from "../lib/audio";
import { makeWordKey } from "../lib/kana";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Badge } from "./ui";

export function DictionaryDetailDialog({
  entry,
  defaultPackId,
  onClose,
}: {
  entry: DictionaryEntry;
  defaultPackId?: string;
  onClose: () => void;
}) {
  const { packs, selectedPackId, addWordsToPack, notify, wordStats } = useApp();
  const [targetPackId, setTargetPackId] = useState(
    defaultPackId ?? selectedPackId ?? packs[0]?.id ?? "",
  );
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const pack = packs.find((item) => item.id === targetPackId);
  const key = makeWordKey(entry.word, entry.reading);
  const existing = useMemo(
    () => Boolean(pack?.words.some((word) => word.key === key)),
    [pack, key],
  );
  const stat = wordStats.get(key);
  const senses = entry.meaning.split("｜").map((sense) => sense.trim()).filter(Boolean);

  const add = async () => {
    if (!pack) return;
    setAdding(true);
    try {
      const payload = entryToAddPayload(entry);
      const word: PackWord = {
        ...payload,
        key,
        addedAt: Date.now(),
      };
      const count = await addWordsToPack(pack.id, [word]);
      if (count > 0) {
        setAdded(true);
        notify(`已将「${entry.word}」加入「${pack.name}」。`, "success");
      } else {
        notify("这个词已经在词包中。", "info");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "添加失败。", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      title={entry.word}
      description={entry.reading}
      onClose={onClose}
      size="md"
      footer={
        <>
          <label className="inline-select">
            <span>加入</span>
            <select
              value={targetPackId}
              onChange={(event) => {
                setTargetPackId(event.target.value);
                setAdded(false);
              }}
            >
              {packs.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void add()}
            disabled={adding || existing || added || !pack}
          >
            <Icon name={existing || added ? "check" : "plus"} size={16} />
            {adding ? "添加中…" : existing || added ? "已在词包" : "加入词包"}
          </button>
        </>
      }
    >
      <div className="word-detail dictionary-detail">
        <div className="word-detail-hero">
          <div className="dictionary-detail-title">
            <span className="dictionary-detail-word">{entry.word}</span>
            <span className="dictionary-detail-reading">{entry.reading}</span>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            onClick={() => speakJapanese(entry.reading)}
            title="朗读读音"
          >
            <Icon name="volume" />
            <span className="sr-only">朗读读音</span>
          </button>
        </div>

        <div className="word-detail-meta">
          {entry.jlpt ? <Badge tone="accent">{entry.jlpt}</Badge> : null}
          {entry.pos ? <Badge>{entry.pos}</Badge> : null}
          {entry.rank > 0 ? <Badge tone="muted">频度 #{entry.rank}</Badge> : null}
          {stat?.attempts ? (
            <Badge tone="success">已学 {stat.mastery}%</Badge>
          ) : null}
        </div>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h3>中文释义</h3>
          </div>
          <ol className="sense-list">
            {senses.map((sense, index) => (
              <li key={sense}>
                <span>{index + 1}</span>
                {sense}
              </li>
            ))}
          </ol>
        </section>

        {entry.altReadings.length > 0 || entry.variants.length > 0 ? (
          <div className="dictionary-variants">
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
          </div>
        ) : null}

        <p className="detail-footnote">
          <Icon name="database" size={15} />
          JMdict 词条 #{entry.dictId} · 离线词典
        </p>
      </div>
    </Modal>
  );
}
