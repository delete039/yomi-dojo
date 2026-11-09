import { useState } from "react";
import { useApp } from "../app/AppContext";
import { AddWordDialog } from "../components/AddWordDialog";
import { DictionaryBrowser } from "../components/DictionaryBrowser";
import { Icon } from "../components/Icons";
import { ImportDialog } from "../components/ImportDialog";
import { PackBrowser } from "../components/PackBrowser";
import { PackFormDialog } from "../components/PackFormDialog";
import { PageHeader } from "../components/ui";
import { cx } from "../lib/utils";

type LibraryTab = "packs" | "dictionary";

export function LibraryPage() {
  const { selectedPackId } = useApp();
  const [tab, setTab] = useState<LibraryTab>("packs");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualMode, setManualMode] = useState<"search" | "manual">("search");

  const openManual = (query: string) => {
    setManualQuery(query);
    setManualMode("manual");
    setAddOpen(true);
  };

  return (
    <div className="page library-page">
      <PageHeader
        eyebrow="LIBRARY / 词库"
        title="词汇与词包"
        description="用整包动态队列学习，按词包保存各自进度；同一个词在多个词包中共用掌握记录。"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={16} /> 新建词包
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={16} /> 导入词表
            </button>
            <button type="button" className="btn btn-primary" onClick={() => {
              setManualQuery("");
              setManualMode("search");
              setAddOpen(true);
            }}>
              <Icon name="search" size={16} /> 添加词汇
            </button>
          </>
        }
      />

      <div className="library-tabs" role="tablist" aria-label="词库视图">
        <button
          type="button"
          role="tab"
          className={cx(tab === "packs" && "is-active")}
          aria-selected={tab === "packs"}
          onClick={() => setTab("packs")}
        >
          <strong>我的词包</strong>
        </button>
        <button
          type="button"
          role="tab"
          className={cx(tab === "dictionary" && "is-active")}
          aria-selected={tab === "dictionary"}
          onClick={() => setTab("dictionary")}
        >
          <strong>查词词典</strong>
        </button>
      </div>

      {tab === "packs" ? (
        <PackBrowser />
      ) : (
        <DictionaryBrowser
          onManualAdd={openManual}
        />
      )}

      {createOpen ? <PackFormDialog onClose={() => setCreateOpen(false)} /> : null}
      {importOpen ? (
        <ImportDialog
          defaultPackId={selectedPackId ?? undefined}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
      {addOpen ? (
        <AddWordDialog
          defaultPackId={selectedPackId ?? undefined}
          initialQuery={manualQuery}
          initialMode={manualMode}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  );
}
