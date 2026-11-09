import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useApp } from "../app/AppContext";
import { Icon } from "../components/Icons";
import { ConfirmDialog } from "../components/Modal";
import { PageHeader, Toggle } from "../components/ui";
import {
  getStorageEstimate,
  requestPersistentStorage,
} from "../data/repository";
import { DEFAULT_SETTINGS } from "../data/settings";
import type { Settings } from "../data/types";
import {
  dayKey,
  downloadText,
  safeFileName,
} from "../lib/utils";

type ConfirmAction = "builtins" | "learning" | "everything" | null;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  children,
  tone,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <section
      className={`panel settings-section${tone === "danger" ? " settings-section-danger" : ""}`}
      id={id}
    >
      <header className="settings-section-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function NumberSetting({
  label,
  description,
  value,
  min,
  max,
  suffix,
  onSave,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = async () => {
    const parsed = Number(draft);
    const next = Math.min(
      max,
      Math.max(min, Number.isFinite(parsed) ? Math.round(parsed) : value),
    );
    setDraft(String(next));
    if (next === value) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-number-row">
      <div className="settings-row-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <label className="number-setting">
        <button
          type="button"
          onClick={() => {
            const next = Math.max(min, (Number(draft) || value) - 1);
            setDraft(String(next));
          }}
          aria-label={`减少${label}`}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          disabled={saving}
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => {
            const next = Math.min(max, (Number(draft) || value) + 1);
            setDraft(String(next));
          }}
          aria-label={`增加${label}`}
        >
          +
        </button>
        <span>{suffix}</span>
      </label>
    </div>
  );
}

export function SettingsPage() {
  const {
    settings,
    updateSettings,
    makeBackup,
    restoreBackup,
    notify,
    resetBuiltins,
    clearLearning,
    resetEverything,
    sessions,
    packs,
    wordStats,
  } = useApp();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [restoreFile, setRestoreFile] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [storage, setStorage] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
  } | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const refreshStorage = async () => {
    try {
      setStorage(await getStorageEstimate());
    } catch {
      setStorage(null);
    }
  };

  useEffect(() => {
    void refreshStorage();
  }, []);

  const patch = async (next: Partial<Settings>) => {
    try {
      await updateSettings(next);
    } catch (error) {
      notify(error instanceof Error ? error.message : "设置保存失败。", "error");
    }
  };

  const saveNumber = async (
    key: "batchSize" | "dailyNewLimit" | "dailyGoal",
    value: number,
  ) => {
    try {
      await updateSettings({ [key]: value });
      notify("设置已保存。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "设置保存失败。", "error");
      throw error;
    }
  };

  const toggleInputMode = async (
    key: "romajiInput" | "kanaInput",
    checked: boolean,
  ) => {
    const next = { ...settings, [key]: checked };
    if (!next.romajiInput && !next.kanaInput) {
      notify("罗马字和假名输入至少保留一种。", "error");
      return;
    }
    await patch({ [key]: checked });
  };

  const exportBackup = async () => {
    setBusy("export");
    try {
      const backup = await makeBackup();
      const date = dayKey(Date.now());
      downloadText(
        JSON.stringify(backup, null, 2),
        `yomidojo-backup-${date}.json`,
        "application/json;charset=utf-8",
      );
      notify(
        `备份已导出：${backup.packs.length} 个词包、${backup.wordStats.length} 条词汇记录。`,
        "success",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "导出备份失败。", "error");
    } finally {
      setBusy(null);
    }
  };

  const pickBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("备份文件超过 100 MB，已拒绝读取。");
      }
      const text = await file.text();
      setRestoreFile({ name: file.name, text });
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法读取备份文件。", "error");
    }
  };

  const confirmRestore = async () => {
    if (!restoreFile) return;
    setBusy("restore");
    try {
      await restoreBackup(restoreFile.text);
      setRestoreFile(null);
      await refreshStorage();
      notify("备份已恢复，词包、设置和学习记录已替换。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "恢复备份失败。", "error");
    } finally {
      setBusy(null);
    }
  };

  const persistStorage = async () => {
    setBusy("persist");
    try {
      const granted = await requestPersistentStorage();
      await refreshStorage();
      notify(
        granted
          ? "已启用持久存储，浏览器更不容易清理学习数据。"
          : "浏览器未授予持久存储；请定期导出备份。",
        granted ? "success" : "info",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法申请持久存储。", "error");
    } finally {
      setBusy(null);
    }
  };

  const runDestructive = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setBusy(action);
    try {
      if (action === "builtins") {
        await resetBuiltins();
        notify("内置 N1 / N2 词包已恢复；其他自定义词包未改动。", "success");
      } else if (action === "learning") {
        await clearLearning();
        notify("全部词汇记录、会话和未完成组已清空。", "success");
      } else {
        await resetEverything();
        notify("已清空全部数据并恢复初始内置词包。", "success");
      }
      setConfirmAction(null);
      await refreshStorage();
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作失败。", "error");
    } finally {
      setBusy(null);
    }
  };

  const restoreDefaults = async () => {
    try {
      await updateSettings(DEFAULT_SETTINGS);
      notify("练习设置已恢复默认值。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "恢复默认设置失败。", "error");
    }
  };

  const storageRatio =
    storage && storage.quota > 0
      ? Math.min(1, storage.usage / storage.quota)
      : 0;
  const backupDate = new Date().toLocaleDateString("zh-CN");

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="SETTINGS / 设置"
        title="设置"
        description="调整每组词数、输入方式与本地数据备份。所有数据只保存在当前浏览器。"
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void restoreDefaults()}
          >
            <Icon name="rotate" size={16} /> 恢复默认设置
          </button>
        }
      />

      <div className="settings-layout">
        <aside className="settings-index">
          <span className="micro-label">ON THIS PAGE</span>
          <a href="#settings-learning">学习与队列</a>
          <a href="#settings-typing">打字体验</a>
          <a href="#settings-backup">备份与恢复</a>
          <a href="#settings-storage">本地存储</a>
          <a href="#settings-danger">危险操作</a>
          <a href="#settings-about">数据与许可</a>
          <div className="settings-local-badge">
            <Icon name="lock" size={15} />
            <span>
              LOCAL ONLY
              <small>IndexedDB</small>
            </span>
          </div>
        </aside>

        <div className="settings-content">
          <SettingsSection
            id="settings-learning"
            eyebrow="QUEUE / 队列"
            title="学习与队列"
            description="每组词数只在开始新组时生效；已经开始的组保持原有队列。"
          >
            <NumberSetting
              label="每组词数"
              description="动态队列会优先放到期复习，再放新词，最后用薄弱词补齐。"
              value={settings.batchSize}
              min={1}
              max={200}
              suffix="词"
              onSave={(value) => saveNumber("batchSize", value)}
            />
            <NumberSetting
              label="每日新词上限"
              description="设为 0 表示不限。达到上限后仍会正常安排复习和巩固词。"
              value={settings.dailyNewLimit}
              min={0}
              max={500}
              suffix={settings.dailyNewLimit === 0 ? "不限" : "词 / 天"}
              onSave={(value) => saveNumber("dailyNewLimit", value)}
            />
            <NumberSetting
              label="每日练习目标"
              description="用于首页和记录页的目标进度，不限制实际练习量。"
              value={settings.dailyGoal}
              min={1}
              max={500}
              suffix="词 / 天"
              onSave={(value) => saveNumber("dailyGoal", value)}
            />
            <div className="settings-explainer">
              <Icon name="sparkles" size={18} />
              <p>
                队列按整包实时生成：到期词优先，其次是有上限的新词，空位由掌握度最低的未来词补齐。
                切换词包不会覆盖其他词包的未完成组。
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="settings-typing"
            eyebrow="TYPING / 输入"
            title="打字体验"
            description="输入变化会立即保存，下一题起生效。"
          >
            <Toggle
              checked={settings.showReading}
              onChange={(checked) => void patch({ showReading: checked })}
              label="题目中显示读音"
              description="默认隐藏读音。开启后读音始终可见，本组所有词都会按“看了读音”记录，不计入一次打对。"
            />
            <Toggle
              checked={settings.romajiInput}
              onChange={(checked) => void toggleInputMode("romajiInput", checked)}
              label="允许罗马字输入"
              description="例如 kanji、konnichiwa。"
            />
            <Toggle
              checked={settings.kanaInput}
              onChange={(checked) => void toggleInputMode("kanaInput", checked)}
              label="允许直接输入假名"
              description="支持日语输入法直接输入 かんじ。"
            />
            <Toggle
              checked={settings.builtInKeyboard}
              onChange={(checked) =>
                void patch({ builtInKeyboard: checked })
              }
              label="使用网页内置键盘"
              description="在打字页显示可点击的五十音 / 罗马字键盘，不再调出系统输入法。练习中也可以随时开关。"
            />
            <Toggle
              checked={settings.keyboardMode === "romaji"}
              onChange={(checked) =>
                void patch({ keyboardMode: checked ? "romaji" : "kana" })
              }
              label="网页键盘默认使用罗马字"
              description="默认显示 26 键罗马字键盘；关闭则默认显示假名九宫格。练习中切换布局后会记住，并作为下次默认。"
            />
            <Toggle
              checked={settings.keySound}
              onChange={(checked) => void patch({ keySound: checked })}
              label="按键与答题音效"
              description="使用浏览器本地合成的轻量提示音，不加载音频文件。"
            />
            <Toggle
              checked={settings.speakAfterComplete}
              onChange={(checked) => void patch({ speakAfterComplete: checked })}
              label="完成后朗读读音"
              description="调用系统日语语音；设备没有日语语音时可能不发声。"
            />
            <Toggle
              checked={settings.autoAdvance}
              onChange={(checked) => void patch({ autoAdvance: checked })}
              label="答对后自动进入下一词"
              description="关闭后需要按 Enter 或点击“下一个词”。"
            />
          </SettingsSection>

          <SettingsSection
            id="settings-backup"
            eyebrow="BACKUP / 备份"
            title="备份与恢复"
            description="导出文件包含设置、全部词包、词包计划、词汇记录和已完成会话。离线词典与内置词包源文件不重复写入。"
          >
            <div className="backup-summary">
              <div>
                <span>当前数据</span>
                <strong>
                  {packs.length} 词包 · {wordStats.size} 词汇记录
                </strong>
                <small>{sessions.length} 个已完成会话</small>
              </div>
              <div>
                <span>建议</span>
                <strong>每月或大量导入后</strong>
                <small>清除浏览器数据会同时删除学习记录</small>
              </div>
            </div>
            <div className="backup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void exportBackup()}
                disabled={busy !== null}
              >
                {busy === "export" ? (
                  <>
                    <span className="spinner spinner-small" /> 正在生成…
                  </>
                ) : (
                  <>
                    <Icon name="download" size={17} /> 导出 JSON 备份
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => backupInputRef.current?.click()}
                disabled={busy !== null}
              >
                <Icon name="upload" size={17} /> 从备份恢复
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => void pickBackup(event)}
              />
            </div>
            <p className="settings-note">
              今天 {backupDate}。恢复操作会替换当前浏览器中的全部数据，建议先导出一份当前备份。
            </p>
          </SettingsSection>

          <SettingsSection
            id="settings-storage"
            eyebrow="STORAGE / 存储"
            title="本地存储"
            description="浏览器可能在空间不足时清理站点数据。持久存储可以减少这种情况，但无法替代备份。"
          >
            <div className="storage-card">
              <div className="storage-meter-copy">
                <span>IndexedDB 使用量</span>
                <strong>
                  {storage
                    ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
                    : "正在读取…"}
                </strong>
              </div>
              <div className="storage-meter">
                <span style={{ width: `${Math.max(0.5, storageRatio * 100)}%` }} />
              </div>
              <div className="storage-status">
                <span
                  className={
                    storage?.persisted ? "storage-badge is-good" : "storage-badge"
                  }
                >
                  <Icon
                    name={storage?.persisted ? "check" : "cloud"}
                    size={15}
                  />
                  {storage?.persisted ? "持久存储已启用" : "普通站点存储"}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void persistStorage()}
                  disabled={busy !== null || storage?.persisted}
                >
                  {busy === "persist" ? "申请中…" : "申请持久存储"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void refreshStorage()}
                >
                  <Icon name="rotate" size={14} /> 刷新
                </button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="settings-danger"
            eyebrow="CAUTION / 注意"
            title="危险操作"
            description="以下操作不可撤销。执行前请先导出备份。"
            tone="danger"
          >
            <div className="danger-action-row">
              <div>
                <strong>恢复内置 N1 / N2 词包</strong>
                <p>
                  用应用内置版本替换 N1、N2 的词条和说明，结束这两个词包的未完成组；
                  自定义词包与所有词汇记录保留。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmAction("builtins")}
              >
                恢复内置词包
              </button>
            </div>
            <div className="danger-action-row">
              <div>
                <strong>清空全部学习记录</strong>
                <p>
                  删除错误率、掌握度、复习日期、会话历史和所有未完成组；词包本身保留。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost-danger"
                onClick={() => setConfirmAction("learning")}
              >
                清空学习记录
              </button>
            </div>
            <div className="danger-action-row">
              <div>
                <strong>恢复出厂状态</strong>
                <p>
                  删除所有词包、自定义词条、学习记录和设置，重新建立 N1 / N2 初始数据。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmAction("everything")}
              >
                全部重置
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            id="settings-about"
            eyebrow="ABOUT / 关于"
            title="数据来源与许可"
            description="読み道場是独立实现的本地学习工具，不使用参考网站的私有接口、账号或资源。"
          >
            <div className="about-grid">
              <div>
                <span className="about-icon">
                  <Icon name="database" size={21} />
                </span>
                <h3>离线词典</h3>
                <p>
                  30,566 条常用与 JLPT 词条，衍生自 JMdict 与 Tomoshi 字典开放数据。
                </p>
                <p className="about-license">
                  许可：CC BY-SA 4.0 · EDRDG / Tomoshi（Y1Z）
                </p>
              </div>
              <div>
                <span className="about-icon">
                  <Icon name="book" size={21} />
                </span>
                <h3>内置词包</h3>
                <p>
                  N1 与 N2 高频打字词包来自用户提供的 JLPT 词汇表，只抽取适合“看汉字打读音”的带汉字词条。
                </p>
                <p className="about-license">
                  可在词库中自由搜索、增删、导入和导出。
                </p>
              </div>
              <div>
                <span className="about-icon">
                  <Icon name="lock" size={21} />
                </span>
                <h3>隐私</h3>
                <p>
                  没有登录、统计脚本或外部请求。词典文件随站点提供，学习数据保存在浏览器 IndexedDB。
                </p>
                <p className="about-license">唯一的数据出口由你主动导出的 JSON 备份。</p>
              </div>
            </div>
            <div className="about-links">
              <a
                href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project"
                target="_blank"
                rel="noreferrer"
              >
                JMdict / EDRDG <Icon name="external" size={14} />
              </a>
              <a
                href="https://github.com/tomoshi-app/tomoshi-dict-data"
                target="_blank"
                rel="noreferrer"
              >
                Tomoshi dictionary data <Icon name="external" size={14} />
              </a>
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 4.0 <Icon name="external" size={14} />
              </a>
            </div>
            <footer className="about-footer">
              <span>読み道場 / YOMI DOJO · v1.0.0</span>
              <span>Local-first Japanese reading trainer</span>
            </footer>
          </SettingsSection>
        </div>
      </div>

      {confirmAction ? (
        <ConfirmDialog
          title={
            confirmAction === "builtins"
              ? "恢复内置词包？"
              : confirmAction === "learning"
                ? "清空全部学习记录？"
                : "恢复出厂状态？"
          }
          description={
            confirmAction === "builtins"
              ? "N1 / N2 内容会被应用内置版本替换，这两个词包的未完成组会结束。自定义词包和词汇记录保留。"
              : confirmAction === "learning"
                ? "错误率、掌握度、复习计划、会话历史和未完成组都会删除。词包内容保留，此操作不可撤销。"
                : "所有词包、设置、学习记录都会删除，并恢复 N1 / N2 初始数据。此操作不可撤销。"
          }
          confirmLabel={
            confirmAction === "builtins"
              ? "恢复内置词包"
              : confirmAction === "learning"
                ? "清空学习记录"
                : "全部重置"
          }
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runDestructive()}
        >
          {confirmAction === "everything" ? (
            <p className="dialog-warning-box">
              <Icon name="alert" size={16} />
              如果没有备份，自定义词包和全部学习记录将永久丢失。
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {restoreFile ? (
        <ConfirmDialog
          title="用备份替换当前数据？"
          description={`文件：${restoreFile.name}`}
          confirmLabel={busy === "restore" ? "正在恢复…" : "确认恢复"}
          danger
          onCancel={() => {
            if (busy !== "restore") setRestoreFile(null);
          }}
          onConfirm={() => void confirmRestore()}
        >
          <p className="dialog-warning-box">
            <Icon name="alert" size={16} />
            当前浏览器里的词包、设置和学习记录会被备份内容整体替换。建议先导出当前备份。
          </p>
          <p className="dialog-file-name">
            <Icon name="file" size={15} />
            {safeFileName(restoreFile.name)}
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
