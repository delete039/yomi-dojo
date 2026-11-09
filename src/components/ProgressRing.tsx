import type { ReactNode } from "react";
import { clamp } from "../lib/utils";

interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}

export function ProgressRing({
  value,
  size = 92,
  stroke = 6,
  children,
  label,
}: ProgressRingProps) {
  const normalized = clamp(value, 0, 1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `进度 ${Math.round(normalized * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="progress-ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - normalized)}
          className="progress-ring-value"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="progress-ring-content">{children}</div>
    </div>
  );
}
