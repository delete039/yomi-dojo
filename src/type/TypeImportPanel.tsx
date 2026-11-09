import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import { loadDictionary } from "../data/dictionary";
import {
  candidatesToPackWords,
  parseImportFile,
  parsePastedText,
  revalidateCandidates,
} from "../data/importers";
import type { ImportCandidate, ImportParseResult } from "../data/types";
import { cx } from "../lib/utils";
import { Icon } from "../components/Icons";

export function TypeImportPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (packId: string) => void;
}) {
  const { createPack, notify, settings } = useApp();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportCandidate[] | null>(null);
  const [autoIndexes, setAutoIndexes] = useState<Set<number>>(new Set());
  const [noKanjiCount, setNoKanjiCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const validCount = useMemo(() => {
    if (!rows) return 0;
    return candidatesToPackWords(rows, {
      skipNoKanji: true,
      skipDuplicates: true,
    }).length;
  }, [rows]);

  // Derive these from the live rows so fixing one row cannot hide another
  // row that is empty or contains a non-kana reading.
  const missingReadingCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((row) => row.status === "missing-reading").length;
  }, [rows]);

  const invalidCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((row) => row.status === "invalid").length;
  }, [rows]);

  const duplicateRowCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((row) => row.status === "duplicate").length;
  }, [rows]);

  const blockingCount =
    missingReadingCount + invalidCount + duplicateRowCount;

  const applyParsed = (result: ImportParseResult) => {
    const skipped = result.rows.filter((row) => row.status === "no-kanji").length;
    const duplicates = result.rows.filter((row) => row.status === "duplicate").length;
    // Duplicate rows are shown as a count rather than as editable rows. This
    // keeps the preview count equal to the number that will actually be saved.
    const usable = result.rows.filter(
      (row) => row.status !== "no-kanji" && row.status !== "duplicate",
    );
    const nextAuto = new Set<number>();
    usable.forEach((row, index) => {
      if (row.autoReading) nextAuto.add(index);
    });
    setRows(usable);
    setAutoIndexes(nextAuto);
    setNoKanjiCount(skipped);
    setDuplicateCount(duplicates);
    if (usable.length === 0) {
      setError(
        duplicates > 0 && skipped === 0
          ? "这些词都已经在词包或本次输入中，没有新的可导入词条。"
          : skipped > 0
          ? "没有可练习的词：输入内容都没有汉字。"
          : result.errors[0] ?? "没有读出可导入的词。",
      );
    }
  };

  const parse = async () => {
    if (!text.trim()) {
      setError("请先粘贴词汇，每行一个词。");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const dictionary = await loadDictionary();
      const result = parsePastedText(text, {
        dictionary,
        sourceLabel: "打字页内联导入",
      });
      applyParsed(result);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "词汇解析失败。");
    } finally {
      if (aliveRef.current) setParsing(false);
    }
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    setError(null);
    try {
      const dictionary = await loadDictionary();
      const result = await parseImportFile(file, {
        dictionary,
        sourceLabel: file.name,
      });
      applyParsed(result);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "文件解析失败。");
    } finally {
      if (aliveRef.current) setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateRow = (
    index: number,
    field: "reading" | "meaning",
    value: string,
  ) => {
    if (!rows) return;
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row,
    );
    setRows(revalidateCandidates(next, new Set()));
    if (field === "reading") {
      setAutoIndexes((current) => {
        const nextAuto = new Set(current);
        nextAuto.delete(index);
        return nextAuto;
      });
    }
  };

  const save = async () => {
    if (!rows) return;
    if (blockingCount > 0) {
      setError("还有词条需要处理，请补齐或修正后再保存。");
      return;
    }
    const words = candidatesToPackWords(rows, {
      skipNoKanji: true,
      skipDuplicates: true,
    });
    if (words.length === 0) {
      setError("没有可保存的词条，请补全读音后再试。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pack = await createPack(
        name.trim() || "我的词包",
        `从打字页导入，共 ${words.length} 个词。`,
        words,
      );
      notify(`已创建「${pack.name}」，导入 ${words.length} 个词条。`, "success");
      onSaved(pack.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "词包保存失败。");
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  };

  return (
    <section id="ty-import-panel" className="ty-import-panel" aria-label="导入词包">
      <div className="ty-import-head">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="词包名字"
          maxLength={60}
          aria-label="词包名字"
        />
        <button
          type="button"
          className="ty-icon-link"
          onClick={onClose}
          aria-label="不导入了"
          title="不导入了"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {!rows ? (
        <>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            rows={7}
            autoFocus
            placeholder={
              "一行一个词，读音和释义可以不写：\n侮る\n荷\tに\t负担\n拍子, ひょうし, 节拍"
            }
            aria-label="待导入词汇"
          />
          {error ? <p className="ty-inline-error">{error}</p> : null}
          <div className="ty-import-actions">
            <button
              type="button"
              className="ty-file-link"
              disabled={parsing}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="file" size={14} />
              选择文件
            </button>
            <input
              ref={fileRef}
              className="ty-hidden-file"
              type="file"
              accept=".xlsx,.csv,.tsv,.json,.txt,text/plain,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void parseFile(file);
              }}
              aria-label="选择要导入的词表文件"
              tabIndex={-1}
            />
            <button
              type="button"
              className="ty-accent-button"
              disabled={parsing || !text.trim()}
              onClick={() => void parse()}
            >
              {parsing ? (
                <>
                  <span className="ty-spinner" /> 正在查读音…
                </>
              ) : (
                "下一步"
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="ty-import-summary">
            {rows.length} 个词
            {autoIndexes.size > 0 ? (
              <>
                ，<b>{autoIndexes.size} 个读音是自动标的</b>，请看一眼
              </>
            ) : null}
            {noKanjiCount > 0 ? `，${noKanjiCount} 行没有汉字，跳过了` : ""}
            {duplicateCount > 0 ? `，${duplicateCount} 行重复，已合并` : ""}
            {missingReadingCount > 0
              ? `，${missingReadingCount} 行还缺读音`
              : ""}
            {invalidCount > 0 ? `，${invalidCount} 行读音无效` : ""}
            {duplicateRowCount > 0
              ? `，${duplicateRowCount} 行编辑后重复`
              : ""}
            {rows.length > 0 ? `，保存后按每 ${settings.batchSize} 个词一组` : ""}
          </p>
          <div className="ty-import-rows">
            {rows.map((row, index) => (
              <div
                className={cx(
                  "ty-import-row",
                  (row.status === "missing-reading" ||
                    row.status === "invalid" ||
                    row.status === "duplicate") &&
                    "has-error",
                )}
                key={`${index}-${row.word}`}
              >
                <span className="ty-import-word" lang="ja">
                  {row.word}
                </span>
                <input
                  className={cx(autoIndexes.has(index) && "is-auto-reading")}
                  value={row.reading}
                  onChange={(event) => updateRow(index, "reading", event.target.value)}
                  placeholder="假名"
                  aria-label={`第 ${index + 1} 行读音`}
                  aria-invalid={
                    row.status === "missing-reading" ||
                    row.status === "invalid" ||
                    row.status === "duplicate" ||
                    undefined
                  }
                  lang="ja"
                />
                {row.status === "invalid" || row.status === "duplicate" ? (
                  <span className="ty-import-row-error" role="status">
                    {row.message ||
                      (row.status === "duplicate"
                        ? "本次导入中已有同一词条。"
                        : "读音必须是平假名或片假名。")}
                  </span>
                ) : (
                  <span className="ty-import-meaning" title={row.meaning}>
                    {row.meaning || "暂无释义"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {error ? <p className="ty-inline-error">{error}</p> : null}
          <div className="ty-import-actions">
            <button
              type="button"
              className="ty-quiet-button"
              onClick={() => {
                setRows(null);
                setError(null);
              }}
            >
              改列表
            </button>
            <button
              type="button"
              className="ty-accent-button"
              disabled={saving || validCount === 0 || blockingCount > 0}
              onClick={() => void save()}
            >
              {saving ? (
                <>
                  <span className="ty-spinner" /> 保存中…
                </>
              ) : (
                <>
                  <Icon name="check" size={15} /> 保存
                </>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
