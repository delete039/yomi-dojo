import { cx } from "../lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("brand", compact && "brand-compact", className)} aria-label="読み道場">
      <span className="brand-mark" aria-hidden="true">
        <span>読</span>
      </span>
      {!compact ? (
        <span className="brand-copy">
          <strong>読み道場</strong>
          <small>YOMI DOJO</small>
        </span>
      ) : null}
    </span>
  );
}
