import type { ReactNode } from "react";

export type IconName =
  | "activity"
  | "arrow"
  | "bolt"
  | "camera"
  | "check"
  | "chevron"
  | "clock"
  | "document"
  | "help"
  | "info"
  | "list"
  | "microphone"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "spark"
  | "warning";

const paths: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  bolt: <path d="M13 2 4.5 13H11l-1 9L19.5 11H13l0-9Z" />,
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3v11H4V7Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v5h4M9 12h7M9 16h7" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.9.4-.9 1.1-.9 2M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r=".7" fill="currentColor" />
      <circle cx="4.5" cy="12" r=".7" fill="currentColor" />
      <circle cx="4.5" cy="18" r=".7" fill="currentColor" />
    </>
  ),
  microphone: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M19 7V3l-2 2a8 8 0 1 0 2 11M19 3h-4" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  spark: (
    <path d="m12 3 1.3 4.7L18 9l-4.7 1.3L12 15l-1.3-4.7L6 9l4.7-1.3L12 3ZM18.5 15l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <img
      className="brand-mark"
      src="/bintu-mark.png"
      alt=""
      width={large ? 72 : 36}
      height={large ? 72 : 36}
    />
  );
}

export function MicIcon() {
  return <Icon name="microphone" />;
}

export function CameraIcon() {
  return <Icon name="camera" />;
}
