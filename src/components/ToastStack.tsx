import { Icon } from "./Icons";
import { cx } from "../lib/utils";
import { useApp } from "../app/AppContext";

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={cx("toast", `toast-${toast.tone}`)}
          onClick={() => dismissToast(toast.id)}
        >
          <Icon
            name={
              toast.tone === "success"
                ? "check"
                : toast.tone === "error"
                  ? "alert"
                  : "sparkles"
            }
            size={17}
          />
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
