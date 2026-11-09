import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useApp } from "../app/AppContext";
import { loadDictionary } from "../data/dictionary";
import {
  candidatesToPackWords,
  parseImportFile,
  parsePastedText,
  revalidateCandidates,
} from "../data/importers";
import type { ImportCandidate, ImportParseResult } from "../data/types";
import { useDictionary } from "../hooks/useDictionary";
import { cx } from "../lib/utils";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Badge, EmptyState, Field, Toggle } from "./ui";

const STATUS_LABEL: Record<ImportCandidate["status"], string> = {
  ready: "可导入",
  "missing-reading": "缺读音",
  "no-kanji": "无汉字",
  duplicate: "重复",
  invalid: "需修正",
};

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").slice(0, 60);
}

export function ImportDialog({
  defaultPackId,
  onClose,
}: {
  defaultPackId?: string;
  onClose: () => void;
}) {
  const {
    packs,
    selectedPackId,
    createPack,
    addWordsToPack,
    selectPack,
    notify,
  } = useApp();
  const initialPackId = defaultPackId ?? selectedPackId ?? packs[0]?.id ?? "";
  const [targetMode, setTargetMode] = useState<"existing" | "new">(
    packs.length > 0 ? "existing" : "new",
  );
  const [targetPackId, setTargetPackId] = useState(initialPackId);
  const [newName, setNewName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [skipNoKanji, setSkipNoKanji] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { dictionary } = useDictionary(true);

  const targetPack = packs.find((pack) => pack.id === targetPackId) ?? null;
  const existingKeys = useMemo(
    () =>
      new Set(
        targetMode === "existing" && targetPack
          ? targetPack.words.map((word) => word.key)
          : [],
      ),
    [targetMode, targetPack],
  );

  useEffect(() => {
    if (candidates.length === 0) return;
    setCandidates((current) => revalidateCandidates(current, existingKeys));
  }, [existingKeys]);

  const pickFile = (nextFile: File | null) => {
    setFile(nextFile);
    setError(null);
    if (nextFile && !newName) setNewName(baseName(nextFile.name));
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    pickFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  };

  const parseSource = useCallback(async () => {
    if (!file && !pastedText.trim()) {
      setError("请选择文件或粘贴词汇内容。");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      let loadedDictionary = dictionary;
      if (!loadedDictionary) {
        try {
          loadedDictionary = await loadDictionary();
        } catch {
          loadedDictionary = null;
        }
      }
      const options = {
        dictionary: loadedDictionary ?? undefined,
        existingKeys,
        sourceLabel: file?.name ?? "粘贴内容",
      };
      const result = file
        ? await parseImportFile(file, options)
        : parsePastedText(pastedText, options);
      if (result.errors.length > 0 && result.rows.length === 0) {
        setError(result.errors.join(" "));
        setParseResult(result);
        setCandidates([]);
      } else {
        setParseResult(result);
        setCandidates(result.rows);
        if (!newName && file) setNewName(baseName(file.name));
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "解析失败。");
    } finally {
      setParsing(false);
    }
  }, [dictionary, existingKeys, file, newName, pastedText]);

  const updateCandidate = (
    index: number,
    field: "word" | "reading" | "meaning",
    value: string,
  ) => {
    const next = candidates.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...candidate, [field]: value } : candidate,
    );
    setCandidates(revalidateCandidates(next, existingKeys));
  };

  const removeCandidate = (index: number) => {
    setCandidates((current) =>
      revalidateCandidates(
        current.filter((_, candidateIndex) => candidateIndex !== index),
        existingKeys,
      ),
    );
  };

  const counts = useMemo(() => {
    const result = {
      ready: 0,
      missing: 0,
      noKanji: 0,
      duplicate: 0,
      invalid: 0,
    };
    for (const candidate of candidates) {
      if (candidate.status === "ready") result.ready += 1;
      else if (candidate.status === "missing-reading") result.missing += 1;
      else if (candidate.status === "no-kanji") result.noKanji += 1;
      else if (candidate.status === "duplicate") result.duplicate += 1;
      else result.invalid += 1;
    }
    return result;
  }, [candidates]);

  const importableWords = useMemo(
    () => candidatesToPackWords(candidates, { skipNoKanji, skipDuplicates }),
    [candidates, skipDuplicates, skipNoKanji],
  );
  const importCount = importableWords.length;

  const confirmImport = async () => {
    if (targetMode === "new" && !newName.trim()) {
      setError("请填写新词包名称。");
      return;
    }
    if (targetMode === "existing" && !targetPack) {
      setError("请选择目标词包。");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const words = importableWords;
      if (words.length === 0) throw new Error("没有符合导入条件的词条。");
      if (targetMode === "new") {
        const pack = await createPack(
          newName.trim(),
          `从 ${parseResult?.sourceLabel || "文件"} 导入，共 ${words.length} 词。`,
          words,
        );
        notify(`已创建「${pack.name}」，导入 ${words.length} 个词条。`, "success");
      } else if (targetPack) {
        const changed = await addWordsToPack(targetPack.id, words, {
          updateExisting,
        });
        if (changed === 0) throw new Error("没有新增词条；重复项已全部跳过。");
        await selectPack(targetPack.id);
        notify(`已向「${targetPack.name}」导入 ${changed} 个词条。`, "success");
      }
      onClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败。");
    } finally {
      setImporting(false);
    }
  };

  const resetPreview = () => {
    setParseResult(null);
    setCandidates([]);
    setError(null);
  };

  return (
    <Modal
      title={parseResult ? "校对导入词条" : "导入词包"}
      description={
        parseResult
          ? "读音和释义可以直接修改。缺读音的行不会导入，重复项可按需处理。"
          : "支持 Excel (.xlsx)、CSV、TSV、JSON 和纯文本。缺少读音时会自动查词典补全。"
      }
      onClose={onClose}
      size="lg"
      className="import-modal"
      footer={
        parseResult ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={resetPreview}>
              <Icon name="arrow-left" size={16} />
              重选来源
            </button>
            <div className="footer-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void confirmImport()}
                disabled={importing || importCount === 0}
              >
                <Icon name="download" size={16} />
                {importing ? "导入中…" : `导入 ${importCount} 个词条`}
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void parseSource()}
              disabled={parsing}
            >
              {parsing ? (
                <>
                  <span className="spinner spinner-small" /> 解析中…
                </>
              ) : (
                <>
                  <Icon name="file" size={16} /> 解析预览
                </>
              )}
            </button>
          </>
        )
      }
    >
      {!parseResult ? (
        <div className="import-source">
          <div className="import-target">
            <div className="dialog-tabs" role="tablist" aria-label="导入目标">
              <button
                type="button"
                className={cx(targetMode === "existing" && "is-active")}
                onClick={() => setTargetMode("existing")}
                role="tab"
                aria-selected={targetMode === "existing"}
                disabled={packs.length === 0}
              >
                加入现有词包
              </button>
              <button
                type="button"
                className={cx(targetMode === "new" && "is-active")}
                onClick={() => setTargetMode("new")}
                role="tab"
                aria-selected={targetMode === "new"}
              >
                新建词包
              </button>
            </div>
            {targetMode === "existing" ? (
              <label className="inline-select">
                <span>目标</span>
                <select
                  value={targetPackId}
                  onChange={(event) => setTargetPackId(event.target.value)}
                >
                  {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}（{pack.words.length} 词）
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Field label="新词包名称" htmlFor="import-pack-name">
                <input
                  id="import-pack-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="例：N2 阅读生词"
                  maxLength={60}
                />
              </Field>
            )}
          </div>

          <div
            className={cx("dropzone", dragging && "is-dragging", file && "has-file")}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.json,.txt"
              onChange={onFileInput}
              hidden
            />
            {file ? (
              <div className="selected-file">
                <span className="selected-file-icon">
                  <Icon name="file" size={24} />
                </span>
                <div>
                  <strong>{file.name}</strong>
                  <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => pickFile(null)}
                  aria-label="移除文件"
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
            ) : (
              <>
                <span className="dropzone-icon">
                  <Icon name="upload" size={25} />
                </span>
                <div>
                  <strong>拖入文件，或点击选择</strong>
                  <p>Excel .xlsx · CSV · TSV · JSON · TXT</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </button>
              </>
            )}
          </div>

          <div className="paste-divider">
            <span>或直接粘贴</span>
          </div>

          <textarea
            className="paste-area"
            rows={7}
            value={pastedText}
            onChange={(event) => {
              setPastedText(event.target.value);
              if (event.target.value) pickFile(null);
            }}
            placeholder={"侮る\n荷\tに\t负担\n拍子, ひょうし, 节拍"}
            disabled={Boolean(file)}
          />

          <div className="import-hints">
            <div>
              <strong>每行一个词</strong>
              <code>侮る</code>
            </div>
            <div>
              <strong>制表符 / 逗号</strong>
              <code>荷　に　负担</code>
            </div>
            <div>
              <strong>表头自动识别</strong>
              <code>单词,读音,释义</code>
            </div>
          </div>

          {error ? (
            <p className="form-error">
              <Icon name="alert" size={15} /> {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="import-preview">
          <div className="preview-summary">
            <div className="preview-stat">
              <strong>{candidates.length}</strong>
              <span>解析词条</span>
            </div>
            <div className="preview-stat is-good">
              <strong>{counts.ready}</strong>
              <span>可直接导入</span>
            </div>
            <div className="preview-stat">
              <strong>{counts.duplicate}</strong>
              <span>重复</span>
            </div>
            <div className="preview-stat">
              <strong>{counts.missing + counts.invalid}</strong>
              <span>需处理</span>
            </div>
            <div className="preview-stat">
              <strong>{counts.noKanji}</strong>
              <span>无汉字</span>
            </div>
          </div>

          {parseResult.warnings.length > 0 || parseResult.errors.length > 0 ? (
            <div className="parse-notices">
              {[...parseResult.errors, ...parseResult.warnings].map((message) => (
                <p key={message}>
                  <Icon name="alert" size={14} /> {message}
                </p>
              ))}
            </div>
          ) : null}

          <div className="preview-options">
            <Toggle
              checked={skipNoKanji}
              onChange={setSkipNoKanji}
              label="跳过无汉字词条"
              description="无汉字词不进入打字练习；关闭后会保留在词包中。"
            />
            <Toggle
              checked={skipDuplicates}
              onChange={setSkipDuplicates}
              label="跳过重复词条"
              description="按「单词 + 读音」判断；同一个词可在多个词包中共用记录。"
            />
            {!skipDuplicates && targetMode === "existing" ? (
              <Toggle
                checked={updateExisting}
                onChange={setUpdateExisting}
                label="用导入释义更新已有词条"
                description="不会重置该词的练习记录。"
              />
            ) : null}
          </div>

          {candidates.length === 0 ? (
            <EmptyState
              icon="alert"
              title="没有解析到词条"
              description="请检查文件格式，或返回重新选择来源。"
            />
          ) : (
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>单词</th>
                    <th>读音</th>
                    <th>释义</th>
                    <th>状态</th>
                    <th>
                      <span className="sr-only">移除</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate, index) => (
                    <tr
                      key={`${index}-${candidate.word}-${candidate.reading}`}
                      className={cx(`status-${candidate.status}`)}
                    >
                      <td>{index + 1}</td>
                      <td>
                        <input
                          value={candidate.word}
                          onChange={(event) =>
                            updateCandidate(index, "word", event.target.value)
                          }
                          aria-label={`第 ${index + 1} 行单词`}
                        />
                      </td>
                      <td>
                        <input
                          value={candidate.reading}
                          onChange={(event) =>
                            updateCandidate(index, "reading", event.target.value)
                          }
                          aria-label={`第 ${index + 1} 行读音`}
                          placeholder="假名"
                        />
                      </td>
                      <td>
                        <input
                          value={candidate.meaning}
                          onChange={(event) =>
                            updateCandidate(index, "meaning", event.target.value)
                          }
                          aria-label={`第 ${index + 1} 行释义`}
                          placeholder="可选"
                        />
                      </td>
                      <td>
                        <Badge
                          tone={
                            candidate.status === "ready"
                              ? "success"
                              : candidate.status === "duplicate"
                                ? "muted"
                                : candidate.status === "no-kanji"
                                  ? "warning"
                                  : "danger"
                          }
                          className="status-badge"
                          >
                          {STATUS_LABEL[candidate.status]}
                        </Badge>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn icon-btn-small"
                          onClick={() => removeCandidate(index)}
                          aria-label={`移除第 ${index + 1} 行`}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error ? (
            <p className="form-error">
              <Icon name="alert" size={15} /> {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
