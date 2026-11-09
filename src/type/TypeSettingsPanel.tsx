import type { ReactNode } from "react";
import { useApp } from "../app/AppContext";
import type { Settings } from "../data/types";
import { cx } from "../lib/utils";

type BooleanSettingKey =
  | "showReading"
  | "builtInKeyboard"
  | "keySound"
  | "speakAfterComplete";

function TypeSettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="ty-setting-row">
      <span className="ty-setting-label">{label}</span>
      <div className="ty-segment" role="radiogroup" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function TypeSettingsPanel() {
  const { settings, updateSettings, notify } = useApp();

  const change = (patch: Partial<Settings>) => {
    void updateSettings(patch).catch((error: unknown) => {
      notify(
        error instanceof Error ? error.message : "设置保存失败，请重试。",
        "error",
      );
    });
  };

  const booleanButton = (
    key: BooleanSettingKey,
    value: boolean,
    label: string,
  ) => {
    const active = settings[key] === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        className={cx("ty-segment-option", active && "is-active")}
        onClick={() => change({ [key]: value })}
      >
        {label}
      </button>
    );
  };

  return (
    <section id="ty-settings-panel" className="ty-settings-panel" aria-label="打字设置">
      <TypeSettingRow label="读音">
        {booleanButton("showReading", true, "显示读音")}
        {booleanButton("showReading", false, "不显示")}
      </TypeSettingRow>
      <TypeSettingRow label="键盘">
        {booleanButton("builtInKeyboard", false, "系统键盘")}
        {booleanButton("builtInKeyboard", true, "网页内置")}
      </TypeSettingRow>
      <TypeSettingRow label="按键音">
        {booleanButton("keySound", true, "开")}
        {booleanButton("keySound", false, "关")}
      </TypeSettingRow>
      <TypeSettingRow label="发音">
        {booleanButton("speakAfterComplete", false, "不读")}
        {booleanButton("speakAfterComplete", true, "打完读出来")}
      </TypeSettingRow>
    </section>
  );
}
