import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "library"
  | "chart"
  | "settings"
  | "play"
  | "arrow-left"
  | "arrow-right"
  | "search"
  | "plus"
  | "upload"
  | "download"
  | "volume"
  | "volume-off"
  | "eye"
  | "eye-off"
  | "check"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "edit"
  | "trash"
  | "pause"
  | "clock"
  | "flame"
  | "target"
  | "keyboard"
  | "sparkles"
  | "book"
  | "rotate"
  | "database"
  | "lock"
  | "help"
  | "more"
  | "external"
  | "file"
  | "cloud"
  | "award"
  | "list"
  | "calendar"
  | "filter"
  | "alert"
  | "settings-2"
  | "skip-forward"
  | "rotate-ccw";

const PATHS: Record<IconName, string[]> = {
  home: ["M3 10.8 12 3l9 7.8", "M5 9.5V21h14V9.5", "M9.5 21v-6h5v6"],
  library: [
    "M4 4.5h5v15H4z",
    "M10.5 4.5h4v15h-4z",
    "m16.2 5 3.2-.8 3.2 14.3-3.2.8z",
  ],
  chart: ["M4 20V9", "M10 20V4", "M16 20v-7", "M22 20H2"],
  settings: [
    "M12 15.3A3.3 3.3 0 1 0 12 8.7a3.3 3.3 0 0 0 0 6.6Z",
    "M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6v.2H10v-.2a1.8 1.8 0 0 0-1.1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1L4 17.1l.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H2.8v-4H3a1.8 1.8 0 0 0 1.6-1.1 1.8 1.8 0 0 0-.4-2L4 6.8 6.8 4l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3V2.8h4V3a1.8 1.8 0 0 0 1.1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1L20 6.9l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1.1h.2v4h-.2A1.8 1.8 0 0 0 19.4 15Z",
  ],
  play: ["M8 5.5v13l11-6.5z"],
  "arrow-left": ["m15 5-7 7 7 7", "M8 12h12"],
  "arrow-right": ["m9 5 7 7-7 7", "M4 12h12"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m16 16 5 5"],
  plus: ["M12 5v14", "M5 12h14"],
  upload: ["M12 16V4", "m7 9 5-5 5 5", "M4 16v4h16v-4"],
  download: ["M12 4v12", "m7 11 5 5 5-5", "M4 20h16"],
  volume: ["M5 10v4h3l4 4V6L8 10H5Z", "M16 8.5a5 5 0 0 1 0 7", "M18.6 5.5a9 9 0 0 1 0 13"],
  "volume-off": ["M5 10v4h3l4 4V6L8 10H5Z", "m16 9 5 6", "m21 9-5 6"],
  eye: ["M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  "eye-off": ["m3 3 18 18", "M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1", "M6.1 7.2A17 17 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4.3-.9", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  check: ["m4.5 12.5 5 5 10-11"],
  close: ["M5 5l14 14", "M19 5 5 19"],
  "chevron-right": ["m9 5 7 7-7 7"],
  "chevron-down": ["m5 9 7 7 7-7"],
  "chevron-left": ["m15 5-7 7 7 7"],
  edit: ["M4 20h4L20 8l-4-4L4 16v4Z", "m13.5 6.5 4 4"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 14h10l1-14", "M10 11v6", "M14 11v6"],
  pause: ["M8 5v14", "M16 5v14"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  flame: ["M12 22c4 0 7-2.7 7-6.7 0-3.2-2-5.2-4.2-7.6-.7 1.9-1.6 2.8-2.7 3.3.2-3.5-1.4-6.3-3.1-8-0.1 4.4-4 6.8-4 12.3C5 19.3 8 22 12 22Z"],
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  keyboard: ["M3 6h18v12H3z", "M7 10h.01", "M11 10h.01", "M15 10h.01", "M7 14h.01", "M11 14h6"],
  sparkles: ["m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z", "m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z", "m5 14 .6 2.4L8 17l-2.4.6L5 20l-.6-2.4L2 17l2.4-.6L5 14Z"],
  book: ["M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4V4Z", "M20 4h-4a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h4V4Z"],
  rotate: ["M20 7v5h-5", "M4 17v-5h5", "M6.1 8.2A7 7 0 0 1 19 10.4", "M17.9 15.8A7 7 0 0 1 5 13.6"],
  database: ["M4 6c0 2 3.6 3.5 8 3.5S20 8 20 6 16.4 2.5 12 2.5 4 4 4 6Z", "M4 6v6c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V6", "M4 12v6c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5v-6"],
  lock: ["M5 10h14v11H5z", "M8 10V7a4 4 0 0 1 8 0v3"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.8.3-.9 1-.9 1.8", "M12 17h.01"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  external: ["M14 4h6v6", "m20 4-9 9", "M19 14v5H5V5h5"],
  file: ["M6 2h8l4 4v16H6z", "M14 2v5h5"],
  cloud: ["M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 .5 7H7Z"],
  award: ["M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "m8 14-2 8 6-3 6 3-2-8"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  calendar: ["M4 6h16v15H4z", "M8 3v6", "M16 3v6", "M4 10h16"],
  filter: ["M3 5h18", "M6 12h12", "M10 19h4"],
  alert: ["M12 3 2.5 20h19L12 3Z", "M12 9v5", "M12 17h.01"],
  "settings-2": [
    "M14 17H5",
    "M19 7h-9",
    "M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  ],
  "skip-forward": ["M5 4l10 8-10 8V4Z", "M19 5v14"],
  "rotate-ccw": [
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
    "M3 3v5h5",
  ],
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  filled?: boolean;
}

export function Icon({ name, size = 20, filled = false, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[name].map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}
