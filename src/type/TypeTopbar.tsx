import { Icon } from "../components/Icons";
import { useApp } from "../app/AppContext";

export function TypeTopbar({
  onBack,
  settingsOpen,
  onToggleSettings,
}: {
  onBack: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const { notify } = useApp();

  return (
    <header className="ty-topbar">
      <button
        type="button"
        className="ty-icon-button ty-back"
        onClick={onBack}
        aria-label="返回"
        title="返回"
      >
        <Icon name="chevron-left" size={20} strokeWidth={2} />
      </button>

      <div className="ty-mode-group" role="radiogroup" aria-label="练习模式">
        <button
          type="button"
          role="radio"
          aria-checked="true"
          className="ty-mode-option is-active"
          tabIndex={0}
        >
          看汉字打读音
        </button>
        <button
          type="button"
          role="radio"
          aria-checked="false"
          className="ty-mode-option"
          tabIndex={0}
          title="本版本只复刻「看汉字打读音」"
          aria-disabled="true"
          onClick={() =>
            notify("本版本只复刻「看汉字打读音」，句子填空暂未包含。", "info")
          }
        >
          句子填空
        </button>
      </div>

      <button
        type="button"
        className={`ty-icon-button ty-settings-button${settingsOpen ? " is-open" : ""}`}
        onClick={onToggleSettings}
        aria-label="设置"
        aria-expanded={settingsOpen}
        title="打字设置"
      >
        <Icon name="settings-2" size={20} strokeWidth={2} />
      </button>
    </header>
  );
}
