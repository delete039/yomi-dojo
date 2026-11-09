import { useEffect, useState } from "react";
import { Icon } from "../components/Icons";
import {
  KANA_GRID,
  ROMAJI_GRID,
  applyKanaMark,
  type KanaMark,
} from "../lib/kanaKeyboard";
import { unlockAudio } from "../lib/audio";
import { cx } from "../lib/utils";

export type TypeKeyboardMode = "kana" | "romaji";

interface TypeKeyboardProps {
  mode: TypeKeyboardMode;
  resetKey: string;
  kanaEnabled: boolean;
  romajiEnabled: boolean;
  disabled: boolean;
  canBackspace: boolean;
  onModeChange: (mode: TypeKeyboardMode) => void;
  onKana: (kana: string) => void;
  onRomaji: (key: string) => void;
  onBackspace: () => void;
  onClose: () => void;
}

const MARK_LABELS: Record<KanaMark, string> = {
  dakuten: "゛",
  handakuten: "゜",
  small: "小",
};

export function TypeKeyboard({
  mode,
  resetKey,
  kanaEnabled,
  romajiEnabled,
  disabled,
  canBackspace,
  onModeChange,
  onKana,
  onRomaji,
  onBackspace,
  onClose,
}: TypeKeyboardProps) {
  const [mark, setMark] = useState<KanaMark | null>(null);

  useEffect(() => {
    setMark(null);
  }, [mode, resetKey]);

  const pressKana = (base: string) => {
    if (disabled) return;
    onKana(applyKanaMark(base, mark));
    setMark(null);
  };

  const toggleMark = (next: KanaMark) => {
    if (disabled) return;
    setMark((current) => (current === next ? null : next));
  };

  return (
    <section
      className="ty-keyboard"
      role="group"
      aria-label="网页内置键盘"
      onPointerDown={unlockAudio}
    >
      <div className="ty-keyboard-head">
        <div className="ty-keyboard-title">
          <Icon name="keyboard" size={16} strokeWidth={2} />
          <span>网页键盘</span>
        </div>
        <div className="ty-keyboard-tabs" aria-label="键盘布局">
          <button
            type="button"
            className={cx("ty-keyboard-tab", mode === "kana" && "is-active")}
            aria-pressed={mode === "kana"}
            data-mode="kana"
            disabled={!kanaEnabled}
            title={kanaEnabled ? "五十音键盘" : "已在设置中关闭假名输入"}
            onClick={() => onModeChange("kana")}
          >
            あ かな
          </button>
          <button
            type="button"
            className={cx("ty-keyboard-tab", mode === "romaji" && "is-active")}
            aria-pressed={mode === "romaji"}
            data-mode="romaji"
            disabled={!romajiEnabled}
            title={romajiEnabled ? "罗马字键盘" : "已在设置中关闭罗马字输入"}
            onClick={() => onModeChange("romaji")}
          >
            A 罗马字
          </button>
        </div>
        <button
          type="button"
          className="ty-keyboard-close"
          aria-label="收起内置键盘"
          onClick={onClose}
        >
          <Icon name="close" size={17} strokeWidth={2} />
        </button>
      </div>

      {mode === "kana" ? (
        <>
          <div className="ty-keyboard-grid">
            {KANA_GRID.flatMap((row, rowIndex) =>
              row.map((kana, columnIndex) =>
                kana ? (
                  <button
                    type="button"
                    className="ty-key"
                    key={`${rowIndex}-${columnIndex}`}
                    data-key={kana}
                    aria-label={`假名 ${kana}`}
                    disabled={disabled}
                    onClick={() => pressKana(kana)}
                  >
                    {kana}
                  </button>
                ) : (
                  <span
                    className="ty-key-blank"
                    key={`${rowIndex}-${columnIndex}`}
                    aria-hidden="true"
                  />
                ),
              ),
            )}
          </div>
          <div className="ty-keyboard-actions">
            {(Object.keys(MARK_LABELS) as KanaMark[]).map((item) => (
              <button
                type="button"
                className={cx(
                  "ty-key",
                  "ty-key-mod",
                  mark === item && "is-active",
                )}
                key={item}
                data-mark={item}
                aria-pressed={mark === item}
                aria-label={
                  item === "dakuten"
                    ? "浊音，例如 か 变 が"
                    : item === "handakuten"
                      ? "半浊音，例如 は 变 ぱ"
                      : "小假名，例如 や 变 ゃ"
                }
                disabled={disabled}
                onClick={() => toggleMark(item)}
              >
                {MARK_LABELS[item]}
              </button>
            ))}
            <button
              type="button"
              className="ty-key"
              data-key="ー"
              aria-label="长音 ー"
              disabled={disabled}
              onClick={() => pressKana("ー")}
            >
              ー
            </button>
            <button
              type="button"
              className="ty-key"
              data-key="ん"
              aria-label="假名 ん"
              disabled={disabled}
              onClick={() => pressKana("ん")}
            >
              ん
            </button>
            <button
              type="button"
              className="ty-key ty-key-backspace"
              data-key="backspace"
              aria-label="退格，清除未完成的罗马字"
              disabled={disabled || !canBackspace}
              onClick={onBackspace}
            >
              ⌫
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ty-keyboard-grid ty-keyboard-grid-romaji">
            {ROMAJI_GRID.map((row, rowIndex) => (
              <div className="ty-keyboard-row" key={rowIndex}>
                {row.map((letter) => (
                  <button
                    type="button"
                    className="ty-key"
                    key={letter}
                    data-key={letter}
                    aria-label={`字母 ${letter.toUpperCase()}`}
                    disabled={disabled}
                    onClick={() => onRomaji(letter)}
                  >
                    {letter.toUpperCase()}
                  </button>
                ))}
              </div>
            ))}
            <div className="ty-keyboard-row ty-keyboard-row-punctuation">
              <button
                type="button"
                className="ty-key"
                data-key="'"
                aria-label="撇号"
                disabled={disabled}
                onClick={() => onRomaji("'")}
              >
                '
              </button>
              <button
                type="button"
                className="ty-key"
                data-key="-"
                aria-label="长音"
                disabled={disabled}
                onClick={() => onRomaji("-")}
              >
                ー
              </button>
              <button
                type="button"
                className="ty-key ty-key-backspace"
                data-key="backspace"
                aria-label="退格，清除未完成的罗马字"
                disabled={disabled || !canBackspace}
                onClick={onBackspace}
              >
                ⌫
              </button>
            </div>
          </div>
        </>
      )}

      <p className="ty-keyboard-hint">
        {mode === "kana"
          ? "゛ ゜ 小 会作用于下一个假名 · 长音按 ー"
          : "字母按罗马字输入 · 长音按 ー（-）"}
      </p>
    </section>
  );
}
