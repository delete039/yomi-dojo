import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Icon } from "../components/Icons";
import {
  FLICK_DIRECTIONS,
  KANA_FLICK_KEYS,
  KANA_PUNCT_KEY,
  ROMAJI_QWERTY_ROWS,
  applyKanaMark,
  flickPreviewChars,
  type FlickDirection,
  type FlickKeyDef,
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
  onHintStart: () => void;
  onHintEnd: () => void;
  onClose: () => void;
}

interface FlickPreview {
  keyId: string;
  chars: Array<{ direction: FlickDirection; char: string }>;
  active: FlickDirection;
  left: number;
  top: number;
  width: number;
  arrowLeft: number;
}

const FLICK_THRESHOLD = 14;
const PREVIEW_HEIGHT = 56;

const DIRECTION_NAMES: Record<FlickDirection, string> = {
  center: "轻点",
  left: "左滑",
  up: "上滑",
  right: "右滑",
  down: "下滑",
};

const KANA_POSITIONS: Record<string, { row: number; column: number }> = {
  a: { row: 1, column: 2 },
  ka: { row: 1, column: 3 },
  sa: { row: 1, column: 4 },
  ta: { row: 2, column: 2 },
  na: { row: 2, column: 3 },
  ha: { row: 2, column: 4 },
  ma: { row: 3, column: 2 },
  ya: { row: 3, column: 3 },
  ra: { row: 3, column: 4 },
  wa: { row: 4, column: 3 },
};

function describeKey(definition: FlickKeyDef): string {
  return FLICK_DIRECTIONS.flatMap((direction) => {
    const char = definition.chars[direction];
    return char ? `${DIRECTION_NAMES[direction]} ${char}` : [];
  }).join("，");
}

function FlickKey({
  definition,
  disabled,
  showHints = false,
  variant = "kana",
  className,
  style,
  dataKey,
  onCommit,
  onPreview,
  onPreviewEnd,
}: {
  definition: FlickKeyDef;
  disabled: boolean;
  showHints?: boolean;
  variant?: "kana" | "letter" | "symbol" | "punctuation";
  className?: string;
  style?: CSSProperties;
  dataKey?: string;
  onCommit: (character: string) => void;
  onPreview: (
    definition: FlickKeyDef,
    direction: FlickDirection,
    rect: DOMRect,
  ) => void;
  onPreviewEnd: () => void;
}) {
  const [active, setActive] = useState<FlickDirection | null>(null);
  const activeRef = useRef<FlickDirection | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    rect: DOMRect;
  } | null>(null);
  const pointerUsedRef = useRef(false);
  const lastCommitRef = useRef(0);

  const resolveDirection = (x: number, y: number): FlickDirection => {
    const start = startRef.current;
    if (!start) return "center";
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.hypot(dx, dy) < FLICK_THRESHOLD) return "center";
    const candidate: FlickDirection =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? "right"
          : "left"
        : dy >= 0
          ? "down"
          : "up";
    return definition.chars[candidate] ? candidate : "center";
  };

  const showDirection = (direction: FlickDirection) => {
    if (activeRef.current === direction) return;
    activeRef.current = direction;
    setActive(direction);
    const start = startRef.current;
    if (start) onPreview(definition, direction, start.rect);
  };

  const finish = (commit: boolean) => {
    const direction = activeRef.current ?? "center";
    startRef.current = null;
    activeRef.current = null;
    setActive(null);
    onPreviewEnd();
    if (!commit || disabled) {
      pointerUsedRef.current = false;
      return;
    }
    const character = definition.chars[direction] ?? definition.chars.center;
    lastCommitRef.current = performance.now();
    onCommit(character);
    window.setTimeout(() => {
      pointerUsedRef.current = false;
    }, 0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    unlockAudio();
    pointerUsedRef.current = true;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = "center";
    setActive("center");
    onPreview(definition, "center", startRef.current.rect);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!startRef.current) return;
    event.preventDefault();
    showDirection(resolveDirection(event.clientX, event.clientY));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!startRef.current) return;
    event.preventDefault();
    finish(true);
  };

  const onPointerCancel = () => {
    if (!startRef.current) return;
    finish(false);
  };

  const onClick = () => {
    if (disabled) return;
    if (
      pointerUsedRef.current ||
      performance.now() - lastCommitRef.current < 350
    ) {
      return;
    }
    lastCommitRef.current = performance.now();
    onCommit(definition.chars.center);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!disabled) onCommit(definition.chars.center);
  };

  return (
    <button
      type="button"
      className={cx(
        "ty-flick-key",
        `is-${variant}`,
        active && "is-pressed",
        className,
      )}
      style={style}
      data-flick={definition.id}
      data-key={dataKey ?? definition.chars.center}
      data-active-direction={active ?? undefined}
      aria-label={`${definition.label} 键，${describeKey(definition)}`}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {showHints
        ? (["up", "right", "down", "left"] as const).map((direction) => {
            const char = definition.chars[direction];
            if (!char) return null;
            return (
              <span
                className={cx(
                  "ty-flick-sub",
                  `is-${direction}`,
                  active === direction && "is-active",
                )}
                key={direction}
                aria-hidden="true"
              >
                {char}
              </span>
            );
          })
        : null}
      <span className="ty-flick-main" aria-hidden="true">
        {definition.label}
      </span>
      {definition.caption && !showHints ? (
        <span className="ty-flick-caption" aria-hidden="true">
          {definition.caption}
        </span>
      ) : null}
    </button>
  );
}

function SideKey({
  children,
  label,
  disabled,
  active,
  className,
  style,
  dataKey,
  dataMark,
  dataVoice,
  dataAction,
  dataSwitchTo,
  hold,
  onClick,
  onHoldStart,
  onHoldEnd,
}: {
  children: ReactNode;
  label: string;
  disabled: boolean;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
  dataKey?: string;
  dataMark?: string;
  dataVoice?: string;
  dataAction?: string;
  dataSwitchTo?: TypeKeyboardMode;
  hold?: boolean;
  onClick?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}) {
  const keyDownRef = useRef(false);

  const startHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hold || disabled) return;
    event.preventDefault();
    unlockAudio();
    onHoldStart?.();
  };

  const endHold = () => {
    if (!hold) return;
    onHoldEnd?.();
  };

  return (
    <button
      type="button"
      className={cx(
        "ty-side-key",
        active && "is-active",
        hold && "is-hold",
        className,
      )}
      style={style}
      data-key={dataKey}
      data-mark={dataMark}
      data-voice={dataVoice}
      data-action={dataAction}
      data-switch-to={dataSwitchTo}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={hold ? undefined : onClick}
      onPointerDown={hold ? startHold : undefined}
      onPointerUp={hold ? endHold : undefined}
      onPointerLeave={hold ? endHold : undefined}
      onPointerCancel={hold ? endHold : undefined}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={
        hold
          ? (event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              if (!keyDownRef.current && !disabled) {
                keyDownRef.current = true;
                onHoldStart?.();
              }
            }
          : undefined
      }
      onKeyUp={
        hold
          ? (event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              keyDownRef.current = false;
              onHoldEnd?.();
            }
          : undefined
      }
      onBlur={
        hold
          ? () => {
              keyDownRef.current = false;
              onHoldEnd?.();
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

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
  onHintStart,
  onHintEnd,
  onClose,
}: TypeKeyboardProps) {
  const [smallMode, setSmallMode] = useState(false);
  const [shiftMode, setShiftMode] = useState(false);
  const [voiceMode, setVoiceMode] = useState<
    Extract<KanaMark, "dakuten" | "handakuten"> | null
  >(null);
  const [preview, setPreview] = useState<FlickPreview | null>(null);
  const keyboardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSmallMode(false);
    setShiftMode(false);
    setVoiceMode(null);
    setPreview(null);
  }, [mode, resetKey]);

  const showPreview = (
    definition: FlickKeyDef,
    direction: FlickDirection,
    rect: DOMRect,
  ) => {
    const keyboard = keyboardRef.current?.getBoundingClientRect();
    if (!keyboard) return;
    const chars = flickPreviewChars(definition);
    const width = Math.min(
      270,
      Math.max(64, chars.length * (mode === "romaji" ? 34 : 36) + 20),
    );
    const center = rect.left + rect.width / 2 - keyboard.left;
    const left = Math.min(
      keyboard.width - width - 8,
      Math.max(8, center - width / 2),
    );
    const top = rect.top - keyboard.top - PREVIEW_HEIGHT - 7;
    setPreview({
      keyId: definition.id,
      chars,
      active: direction,
      left,
      top,
      width,
      arrowLeft: Math.min(width - 18, Math.max(18, center - left)),
    });
  };

  const commitKana = (character: string) => {
    let value = character;
    if (voiceMode) value = applyKanaMark(value, voiceMode);
    if (smallMode) value = applyKanaMark(value, "small");
    onKana(value);
    setSmallMode(false);
    setVoiceMode(null);
  };

  const alternateMode: TypeKeyboardMode = mode === "kana" ? "romaji" : "kana";
  const alternateEnabled =
    alternateMode === "kana" ? kanaEnabled : romajiEnabled;
  const modeLabel = alternateMode === "romaji" ? "ABC" : "あ";

  return (
    <section
      ref={keyboardRef}
      className={cx("ty-keyboard", `is-${mode}`)}
      role="group"
      aria-label={mode === "kana" ? "苹果风格假名键盘" : "苹果风格罗马字键盘"}
      data-mode={mode}
      onPointerDown={unlockAudio}
      onContextMenu={(event) => event.preventDefault()}
    >
      {preview ? (
        <div
          className={cx("ty-flick-preview", `is-${mode}`)}
          style={
            {
              left: `${preview.left}px`,
              top: `${preview.top}px`,
              width: `${preview.width}px`,
              "--arrow-left": `${preview.arrowLeft}px`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          {preview.chars.map(({ direction, char }) => (
            <span
              className={cx(
                "ty-flick-preview-char",
                direction === preview.active && "is-active",
              )}
              key={`${preview.keyId}-${direction}`}
            >
              {char}
            </span>
          ))}
        </div>
      ) : null}

      {mode === "kana" ? (
        <div className="ty-ios-kana">
          <SideKey
            label={
              alternateEnabled
                ? "切换到罗马字键盘"
                : "已在设置中关闭罗马字输入"
            }
            disabled={disabled || !alternateEnabled}
            className="ty-side-mode"
            style={{ gridArea: "1 / 1" }}
            dataSwitchTo={alternateMode}
            onClick={() => onModeChange(alternateMode)}
          >
            {modeLabel}
          </SideKey>

          <SideKey
            label="浊音和半浊音切换"
            disabled={disabled}
            active={Boolean(voiceMode)}
            className="ty-side-voice"
            style={{ gridArea: "2 / 1" }}
            dataMark="voice"
            dataVoice={voiceMode ?? "none"}
            onClick={() =>
              setVoiceMode((current) =>
                current === null
                  ? "dakuten"
                  : current === "dakuten"
                    ? "handakuten"
                    : null,
              )
            }
          >
            {voiceMode === "dakuten"
              ? "浊"
              : voiceMode === "handakuten"
                ? "半"
                : "浊/半"}
          </SideKey>

          <SideKey
            label="长音 ー"
            disabled={disabled}
            className="ty-side-long"
            style={{ gridArea: "3 / 1" }}
            dataKey="ー"
            onClick={() => commitKana("ー")}
          >
            ー
          </SideKey>

          <SideKey
            label="收起内置键盘"
            disabled={disabled}
            className="ty-side-hide"
            style={{ gridArea: "4 / 1" }}
            dataAction="hide"
            onClick={onClose}
          >
            <Icon name="chevron-down" size={17} strokeWidth={2.2} />
          </SideKey>

          {KANA_FLICK_KEYS.map((definition) => {
            const position = KANA_POSITIONS[definition.id];
            return (
              <FlickKey
                key={definition.id}
                definition={definition}
                disabled={disabled}
                variant="kana"
                style={{ gridArea: `${position.row} / ${position.column}` }}
                onCommit={commitKana}
                onPreview={showPreview}
                onPreviewEnd={() => setPreview(null)}
              />
            );
          })}

          <SideKey
            label="小假名切换"
            disabled={disabled}
            active={smallMode}
            className="ty-kana-small"
            style={{ gridArea: "4 / 2" }}
            dataMark="small"
            onClick={() => setSmallMode((current) => !current)}
          >
            小/大
          </SideKey>

          <FlickKey
            definition={KANA_PUNCT_KEY}
            disabled={disabled}
            variant="punctuation"
            style={{ gridArea: "4 / 4" }}
            onCommit={commitKana}
            onPreview={showPreview}
            onPreviewEnd={() => setPreview(null)}
          />

          <SideKey
            label="退格，清除未完成的输入"
            disabled={disabled || !canBackspace}
            className="ty-side-delete"
            style={{ gridArea: "1 / 5" }}
            dataKey="backspace"
            onClick={onBackspace}
          >
            <span className="ty-backspace-glyph" aria-hidden="true">
              ⌫
            </span>
          </SideKey>

          <SideKey
            label="按住查看读音"
            disabled={disabled}
            className="ty-side-hint"
            style={{ gridArea: "2 / 5 / span 3 / span 1" }}
            dataAction="hint"
            hold
            onHoldStart={onHintStart}
            onHoldEnd={onHintEnd}
          >
            <Icon name="eye" size={18} strokeWidth={1.9} />
            <span>读音</span>
          </SideKey>
        </div>
      ) : (
        <div className="ty-ios-romaji">
          <div className="ty-qwerty">
            {ROMAJI_QWERTY_ROWS.map((row, rowIndex) => (
              <div
                className={cx(
                  "ty-qwerty-row",
                  `ty-qwerty-row-${rowIndex + 1}`,
                )}
                key={`qwerty-row-${rowIndex + 1}`}
              >
                {rowIndex === 2 ? (
                  <SideKey
                    label={shiftMode ? "关闭大写字母" : "大写字母"}
                    disabled={disabled}
                    active={shiftMode}
                    className="ty-qwerty-shift"
                    dataKey="shift"
                    onClick={() => setShiftMode((current) => !current)}
                  >
                    <span aria-hidden="true">⇧</span>
                  </SideKey>
                ) : null}
                {row.map((letter) => {
                  const label = shiftMode ? letter.toUpperCase() : letter;
                  return (
                    <FlickKey
                      key={letter}
                      definition={{
                        id: `letter-${letter}`,
                        label,
                        chars: { center: label },
                      }}
                      disabled={disabled}
                      variant="letter"
                      className="ty-letter-key"
                      dataKey={letter}
                      onCommit={(key) => {
                        onRomaji(key);
                        setShiftMode(false);
                      }}
                      onPreview={showPreview}
                      onPreviewEnd={() => setPreview(null)}
                    />
                  );
                })}
                {rowIndex === 2 ? (
                  <SideKey
                    label="退格，清除未完成的罗马字"
                    disabled={disabled || !canBackspace}
                    className="ty-qwerty-delete"
                    dataKey="backspace"
                    onClick={onBackspace}
                  >
                    <span className="ty-backspace-glyph" aria-hidden="true">
                      ⌫
                    </span>
                  </SideKey>
                ) : null}
              </div>
            ))}
          </div>

          <div className="ty-qwerty-bottom">
            <SideKey
              label={
                alternateEnabled
                  ? "切换到假名键盘"
                  : "已在设置中关闭假名输入"
              }
              disabled={disabled || !alternateEnabled}
              className="ty-ios-bottom-key ty-ios-mode"
              dataSwitchTo={alternateMode}
              onClick={() => onModeChange(alternateMode)}
            >
              <Icon name="keyboard" size={16} strokeWidth={2} />
              <span>{modeLabel}</span>
            </SideKey>
            <SideKey
              label="撇号，用于分隔ん和后面的元音"
              disabled={disabled}
              className="ty-qwerty-extra"
              dataKey="'"
              onClick={() => onRomaji("'")}
            >
              ’
            </SideKey>
            <SideKey
              label="长音 ー"
              disabled={disabled}
              className="ty-qwerty-extra ty-qwerty-long"
              dataKey="-"
              onClick={() => onRomaji("-")}
            >
              ー
            </SideKey>
            <SideKey
              label="按住查看读音"
              disabled={disabled}
              className="ty-qwerty-bottom-key ty-qwerty-hint"
              dataAction="hint"
              hold
              onHoldStart={onHintStart}
              onHoldEnd={onHintEnd}
            >
              <Icon name="eye" size={16} strokeWidth={2} />
              <span>按住看读音</span>
            </SideKey>
            <SideKey
              label="收起内置键盘"
              disabled={disabled}
              className="ty-qwerty-bottom-key ty-qwerty-close"
              dataAction="hide"
              onClick={onClose}
            >
              <Icon name="chevron-down" size={17} strokeWidth={2.2} />
            </SideKey>
          </div>
        </div>
      )}
    </section>
  );
}
