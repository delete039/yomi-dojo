import { useState, type FormEvent } from "react";
import { useApp } from "../app/AppContext";
import type { Pack } from "../data/types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Field } from "./ui";

export function PackFormDialog({
  pack,
  onClose,
}: {
  pack?: Pack | null;
  onClose: () => void;
}) {
  const { createPack, updatePackMeta, notify } = useApp();
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("请输入词包名称。");
      return;
    }
    setSaving(true);
    try {
      if (pack) {
        await updatePackMeta(pack.id, { name, description });
        notify("词包信息已更新。", "success");
      } else {
        await createPack(name, description);
        notify(`已创建词包「${name.trim()}」。`, "success");
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={pack ? "编辑词包" : "新建词包"}
      description={
        pack
          ? "名称与说明不会影响词条和学习记录。"
          : "先创建一个空词包，再导入或从词典中添加词汇。"
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={(event) => void submit(event)}
            disabled={saving}
          >
            {saving ? "保存中…" : pack ? "保存修改" : "创建词包"}
          </button>
        </>
      }
    >
      <form className="stack-form" onSubmit={(event) => void submit(event)}>
        <Field label="词包名称" htmlFor="pack-name">
          <input
            id="pack-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例：N2 阅读生词"
            maxLength={60}
            autoFocus
          />
        </Field>
        <Field
          label="说明"
          htmlFor="pack-description"
          hint="可留空，用来记录来源或学习目标。"
        >
          <textarea
            id="pack-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="例：新闻阅读中遇到的词"
            maxLength={300}
          />
        </Field>
        {pack?.kind === "builtin" ? (
          <p className="inline-warning">
            <Icon name="alert" size={15} />
            这是内置词包；重命名不会改变词条，之后可在设置中恢复原始内容。
          </p>
        ) : null}
        {error ? (
          <p className="form-error">
            <Icon name="alert" size={15} /> {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
