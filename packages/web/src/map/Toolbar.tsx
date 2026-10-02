import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Tool } from "../table/TableProvider.tsx";
import { useTable } from "../table/TableProvider.tsx";
import type { GridType } from "@topper/shared";
import { GRID_SIZE_MAX, GRID_SIZE_MIN, clampGridSize } from "./align.ts";
import { NumberField } from "./NumberField.tsx";
import { PaletteEditor } from "./PaletteEditor.tsx";
import { nextPaletteColor, usePaintPalette } from "./palette.ts";

const GRID_TYPE_OPTIONS: Array<{ id: GridType; label: string }> = [
  { id: "square", label: "Square grid" },
  { id: "hexFlat", label: "Flat hex grid" },
  { id: "hexPointy", label: "Pointy hex grid" },
];

const TOOLS: Array<{
  id: Tool;
  label: string;
  ariaLabel?: string;
  shortcut: string;
  aliases?: string[];
  gmOnly?: boolean;
  hint: string;
}> = [
  { id: "select", label: "Move", shortcut: "V", aliases: ["m"], hint: "Select and drag tokens · Ctrl-drag pans" },
  { id: "fill", label: "Fill", shortcut: "F", gmOnly: true, hint: "Drag a rectangle · Click a cell · Shift-click flood · Right-click erases · Tab cycles color" },
  { id: "edge", label: "Edge", shortcut: "E", gmOnly: true, hint: "Drag a straight wall · Click an edge · Shift-drag a rectangle · Right-click erases · Tab cycles color" },
  { id: "token", label: "Token", ariaLabel: "Place token", shortcut: "T", hint: "Click the map to place a token" },
];

function IconMove() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 3.2v13.6M3.2 10h13.6M6.2 6.2 3.2 10l3 3.8M13.8 6.2l3 3.8-3 3.8M6.2 3.5 10 2.4l3.8 1.1M6.2 16.5 10 17.6l3.8-1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFill() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4.2 11.2 10.4 5l4.4 4.4-7.4 7.4H4.2v-5.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 6.2 12.8 2.6c.6-.6 1.6-.6 2.2 0l.8.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M4.2 16.6h4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconEdge() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 15.5V5.8c0-.6.4-1 1-1h4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M9.6 4.8h5.4c.6 0 1 .4 1 1V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="4" cy="15.5" r="1.35" fill="currentColor" />
      <circle cx="9.6" cy="4.8" r="1.35" fill="currentColor" />
      <circle cx="16" cy="15" r="1.35" fill="currentColor" />
    </svg>
  );
}

function IconToken() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="8.1" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.6 14.2c.7-2 2-3 3.4-3s2.7 1 3.4 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPin({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={
          filled
            ? "M8 3.6h4.2l.8 4.2 2.2 1.6v1.4H11v5.2l-.8 1.4-.8-1.4V10.8H4.8V9.4l2.2-1.6L8 3.6Z"
            : "M8.1 3.8h3.8l.7 4 2.1 1.5v1.2h-3.2v5.1L10 17l-.5-1.4V10.5H4.3V9.3l2.1-1.5.7-4Z"
        }
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGridSquare() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconGridFlat() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <polygon
        points="17,10 13.5,16.1 6.5,16.1 3,10 6.5,3.9 13.5,3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGridPointy() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <polygon
        points="10,3 16.1,6.5 16.1,13.5 10,17 3.9,13.5 3.9,6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GridTypeIcon({ type }: { type: GridType }) {
  if (type === "hexFlat") return <IconGridFlat />;
  if (type === "hexPointy") return <IconGridPointy />;
  return <IconGridSquare />;
}

function IconMap() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.6 5.4 8 3.8l4 1.6 4.4-1.6v11.2L12 16.6l-4-1.6-4.4 1.6V5.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 3.8v11.2M12 5.4v11.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8.2 8.1a1.8 1.8 0 1 1 2.4 2.2c-.6.3-.9.7-.9 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.1" r="0.8" fill="currentColor" />
    </svg>
  );
}

function IconPlace() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.8" y="2.8" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7.9" y="2.8" width="4.2" height="4.2" rx="1" fill="currentColor" />
      <rect x="13" y="2.8" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.8" y="7.9" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="7.9" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.8" y="13" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7.9" y="13" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="13" width="4.2" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3.2" y="3.2" width="6" height="6" rx="1.4" fill="currentColor" />
      <rect x="10.8" y="3.2" width="6" height="6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3.2" y="10.8" width="6" height="6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10.8" y="10.8" width="6" height="6" rx="1.4" fill="currentColor" />
    </svg>
  );
}

type ToolbarPlacement =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

const PLACEMENT_KEY = "topper.toolbar.placement";

const PLACEMENTS: Array<{ id: ToolbarPlacement; label: string; col: number; row: number }> = [
  { id: "top-left", label: "Top left", col: 1, row: 1 },
  { id: "top", label: "Top center", col: 2, row: 1 },
  { id: "top-right", label: "Top right", col: 3, row: 1 },
  { id: "left", label: "Left center", col: 1, row: 2 },
  { id: "right", label: "Right center", col: 3, row: 2 },
  { id: "bottom-left", label: "Bottom left", col: 1, row: 3 },
  { id: "bottom", label: "Bottom center", col: 2, row: 3 },
  { id: "bottom-right", label: "Bottom right", col: 3, row: 3 },
];

function isToolbarPlacement(value: string | null): value is ToolbarPlacement {
  return PLACEMENTS.some((item) => item.id === value);
}

function readPlacement(): ToolbarPlacement {
  try {
    const value = window.localStorage.getItem(PLACEMENT_KEY);
    if (isToolbarPlacement(value)) return value;
  } catch {
    /* ignore */
  }
  return "top";
}

function isVerticalPlacement(placement: ToolbarPlacement) {
  return placement === "left" || placement === "right";
}

function nearPlacement(placement: ToolbarPlacement, x: number, y: number, width: number, height: number) {
  const edge = 72;
  const corner = 240;
  switch (placement) {
    case "top":
      return y < edge;
    case "bottom":
      return y > height - edge;
    case "left":
      return x < edge;
    case "right":
      return x > width - edge;
    case "top-left":
      return y < edge && x < corner;
    case "top-right":
      return y < edge && x > width - corner;
    case "bottom-left":
      return y > height - edge && x < corner;
    case "bottom-right":
      return y > height - edge && x > width - corner;
  }
}

function snapPlacement(x: number, y: number, width: number, height: number): ToolbarPlacement {
  const xNorm = x / Math.max(1, width);
  const yNorm = y / Math.max(1, height);
  const xBand = xNorm < 0.28 ? "left" : xNorm > 0.72 ? "right" : "center";
  const yBand = yNorm < 0.28 ? "top" : yNorm > 0.72 ? "bottom" : "center";
  if (xBand === "center" && yBand === "center") {
    const options = [
      { id: "top" as const, d: yNorm },
      { id: "bottom" as const, d: 1 - yNorm },
      { id: "left" as const, d: xNorm },
      { id: "right" as const, d: 1 - xNorm },
    ];
    options.sort((a, b) => a.d - b.d);
    return options[0]?.id ?? "top";
  }
  if (xBand === "center") return yBand === "top" ? "top" : "bottom";
  if (yBand === "center") return xBand === "left" ? "left" : "right";
  return `${yBand}-${xBand}` as ToolbarPlacement;
}

const ICONS: Record<Tool, () => ReactNode> = {
  select: IconMove,
  fill: IconFill,
  edge: IconEdge,
  token: IconToken,
};

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function Toolbar({
  paintColor,
  setPaintColor,
  mapBusy,
  aligning = false,
  hasMapImage = false,
  onUploadMap,
  onClearImage,
  onStartAlign,
  onStopAlign,
}: {
  paintColor: string | null;
  setPaintColor: (color: string | null) => void;
  mapBusy: boolean;
  aligning?: boolean;
  hasMapImage?: boolean;
  onUploadMap: (file: File | undefined) => void;
  onClearImage?: () => void;
  onStartAlign?: () => void;
  onStopAlign?: () => void;
}) {
  const { snapshot, send, tool, setTool } = useTable();
  const isGm = snapshot?.table.role === "gm";
  const map = snapshot?.map;
  const drawing = Boolean(isGm && (tool === "fill" || tool === "edge"));
  const tools = useMemo(() => TOOLS.filter((item) => !item.gmOnly || isGm), [isGm]);
  const activeTool = tools.find((item) => item.id === tool) ?? tools[0];
  const { colors, presetId, applyPreset, setColorAt, addColor, removeColorAt } = usePaintPalette();

  const dockRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pickingImage = useRef(false);
  const placementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const snapPreviewRef = useRef<ToolbarPlacement | null>(null);
  const [finePointer, setFinePointer] = useState(true);
  const [hoverToolbar, setHoverToolbar] = useState(false);
  const [nearEdge, setNearEdge] = useState(true);
  const [focusInside, setFocusInside] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [placement, setPlacement] = useState<ToolbarPlacement>(readPlacement);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [snapPreview, setSnapPreview] = useState<ToolbarPlacement | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [idleHidden, setIdleHidden] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [flash, setFlash] = useState<Tool | null>(null);
  const [colorFlash, setColorFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; label: string; shortcut: string } | null>(null);

  const vertical = isVerticalPlacement(placement);
  const stayOpen =
    pinned ||
    hoverToolbar ||
    focusInside ||
    settingsOpen ||
    placementOpen ||
    helpOpen ||
    paletteOpen ||
    dragging ||
    (!mapBusy && (nearEdge || !idleHidden));
  const receded = !stayOpen;

  const ping = useCallback(() => {
    setIdleHidden(false);
    setNudge((n) => n + 1);
  }, []);

  const chooseTool = useCallback(
    (next: Tool, source: "pointer" | "keyboard") => {
      setTool(next);
      ping();
      if (source !== "keyboard") return;
      const meta = TOOLS.find((item) => item.id === next);
      setFlash(next);
      setToast({
        id: Date.now(),
        label: meta?.label ?? next,
        shortcut: meta?.shortcut ?? "",
      });
      window.setTimeout(() => setFlash((current) => (current === next ? null : current)), 520);
      window.setTimeout(
        () =>
          setToast((current) =>
            current && current.label === (meta?.label ?? next) ? null : current,
          ),
        900,
      );
    },
    [ping, setTool],
  );

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLACEMENT_KEY, placement);
    } catch {
      /* ignore */
    }
  }, [placement]);

  useEffect(() => {
    if (paintColor === null) return;
    const hex = paintColor.toLowerCase();
    if (colors.includes(hex)) {
      if (paintColor !== hex) setPaintColor(hex);
      return;
    }
    setPaintColor(colors[0] ?? null);
  }, [colors, paintColor, setPaintColor]);

  function openPaletteEditor() {
    setPlacementOpen(false);
    setSettingsOpen(false);
    setHelpOpen(false);
    setPaletteOpen(true);
    ping();
  }

  function handleSetColor(index: number, color: string) {
    const previous = colors[index];
    setColorAt(index, color);
    if (previous && paintColor?.toLowerCase() === previous) setPaintColor(color.toLowerCase());
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const stage = dockRef.current?.closest(".map-board");
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      setNearEdge(inside && nearPlacement(placement, x, y, rect.width, rect.height));
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [placement]);

  useEffect(() => {
    if (!finePointer) {
      setIdleHidden(false);
      return;
    }
    if (
      pinned ||
      hoverToolbar ||
      focusInside ||
      settingsOpen ||
      placementOpen ||
      helpOpen ||
      paletteOpen ||
      nearEdge ||
      dragging ||
      mapBusy
    ) {
      setIdleHidden(false);
      return;
    }
    const timer = window.setTimeout(() => setIdleHidden(true), 1600);
    return () => window.clearTimeout(timer);
  }, [
    finePointer,
    pinned,
    hoverToolbar,
    focusInside,
    settingsOpen,
    placementOpen,
    helpOpen,
    paletteOpen,
    nearEdge,
    dragging,
    mapBusy,
    nudge,
  ]);

  useEffect(() => {
    if (!settingsOpen && !placementOpen) return;
    function onPointer(e: PointerEvent) {
      if (pickingImage.current) return;
      const target = e.target as Node;
      if (settingsRef.current?.contains(target) || placementRef.current?.contains(target)) return;
      setSettingsOpen(false);
      setPlacementOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [settingsOpen, placementOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (placementOpen) {
          setPlacementOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (tool !== "select") chooseTool("select", "keyboard");
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((open) => !open);
        setPaletteOpen(false);
        setNudge((n) => n + 1);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Tab" && drawing) {
        e.preventDefault();
        const next = nextPaletteColor(colors, paintColor, e.shiftKey ? -1 : 1);
        setPaintColor(next);
        ping();
        setColorFlash(next);
        window.setTimeout(() => setColorFlash((current) => (current === next ? null : current)), 400);
        return;
      }
      const key = e.key.toLowerCase();
      const match = tools.find(
        (item) => item.shortcut.toLowerCase() === key || item.aliases?.includes(key),
      );
      if (!match) return;
      e.preventDefault();
      chooseTool(match.id, "keyboard");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseTool, colors, drawing, helpOpen, paintColor, paletteOpen, ping, placementOpen, setPaintColor, settingsOpen, tool, tools]);

  const syncThumb = useCallback(() => {
    const cluster = clusterRef.current;
    const thumbEl = thumbRef.current;
    if (!cluster || !thumbEl) return;
    const active = cluster.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) return;
    if (isVerticalPlacement(placement)) {
      thumbEl.style.transform = `translateY(${active.offsetTop}px)`;
      thumbEl.style.height = `${active.offsetHeight}px`;
      thumbEl.style.width = "";
    } else {
      thumbEl.style.transform = `translateX(${active.offsetLeft}px)`;
      thumbEl.style.width = `${active.offsetWidth}px`;
      thumbEl.style.height = "";
    }
    thumbEl.style.opacity = "1";
  }, [placement]);

  useLayoutEffect(() => {
    syncThumb();
  }, [tool, tools.length, receded, mapBusy, helpOpen, settingsOpen, placement, map, syncThumb]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncThumb());
    observer.observe(cluster);
    for (const node of cluster.querySelectorAll(".tool-btn, .tool-label, .tool-copy")) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [syncThumb, tools.length, map]);

  useEffect(() => {
    const thumbEl = thumbRef.current;
    if (!thumbEl) return;
    thumbEl.classList.add("is-tracking");
    let frame = 0;
    const tick = () => {
      syncThumb();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    const settle = () => {
      window.cancelAnimationFrame(frame);
      syncThumb();
      thumbEl.classList.remove("is-tracking");
    };
    const timer = window.setTimeout(settle, 450);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      thumbEl.classList.remove("is-tracking");
    };
  }, [receded, mapBusy, map, placement, syncThumb]);

  function choosePlacement(next: ToolbarPlacement) {
    setPlacement(next);
    setPlacementOpen(false);
    ping();
  }

  function updateDragFromPointer(clientX: number, clientY: number) {
    const stage = dockRef.current?.closest(".map-board");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const next = snapPlacement(x, y, rect.width, rect.height);
    setDragPoint({ x, y });
    snapPreviewRef.current = next;
    setSnapPreview(next);
  }

  function onGripPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onGripPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.moved = true;
    setDragging(true);
    setPlacementOpen(false);
    setSettingsOpen(false);
    setPaletteOpen(false);
    updateDragFromPointer(e.clientX, e.clientY);
  }

  function onGripPointerUp() {
    const drag = dragRef.current;
    const next = snapPreviewRef.current;
    dragRef.current = null;
    snapPreviewRef.current = null;
    if (drag?.moved && next) {
      setPlacement(next);
      ping();
    } else if (!drag?.moved) {
      setSettingsOpen(false);
      setPlacementOpen((open) => !open);
    }
    setDragging(false);
    setDragPoint(null);
    setSnapPreview(null);
  }

  if (!map) return null;

  return (
    <>
      {dragging ? (
        <div className="toolbar-snap-overlay" aria-hidden="true">
          {PLACEMENTS.map((item) => (
            <div
              key={item.id}
              className={`toolbar-snap ${snapPreview === item.id ? "is-hot" : ""}`}
              data-placement={item.id}
            />
          ))}
        </div>
      ) : null}
    <div
      className={`toolbar-shell ${receded ? "is-receded" : "is-expanded"} ${mapBusy ? "is-busy" : ""} ${
        vertical ? "is-vertical" : ""
      } ${dragging ? "is-dragging" : ""}`}
      data-placement={placement}
      style={
        dragging && dragPoint
          ? { top: dragPoint.y, left: dragPoint.x, right: "auto", bottom: "auto", transform: "translate(-50%, -50%)" }
          : undefined
      }
      onFocusCapture={(e) => {
        const target = e.target as HTMLElement;
        setFocusInside(
          target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT",
        );
      }}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (
          next &&
          e.currentTarget.contains(next) &&
          (next.tagName === "INPUT" || next.tagName === "TEXTAREA" || next.tagName === "SELECT")
        ) {
          return;
        }
        setFocusInside(false);
      }}
    >
      <div
        ref={dockRef}
        className={`toolbar ${drawing ? "has-drawer" : ""}`}
        onPointerEnter={() => setHoverToolbar(true)}
        onPointerLeave={() => setHoverToolbar(false)}
      >
        <div className="toolbar-row">
          <div ref={clusterRef} className="toolbar-tools" role="toolbar" aria-label="Map tools">
            <span ref={thumbRef} className="toolbar-thumb" />
            {tools.map((item) => {
              const Icon = ICONS[item.id];
              const active = tool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`tool-btn ${active ? "is-active" : ""} ${flash === item.id ? "is-flashed" : ""}`}
                  aria-pressed={active}
                  aria-keyshortcuts={item.shortcut}
                  aria-label={item.ariaLabel ?? item.label}
                  onClick={() => chooseTool(item.id, "pointer")}
                >
                  <Icon />
                  <span className="tool-copy">
                    <span className="tool-label">{item.label}</span>
                    <kbd className="tool-kbd">{item.shortcut}</kbd>
                  </span>
                  <span className="tool-tip">
                    {item.ariaLabel ?? item.label} <kbd>{item.shortcut}</kbd>
                  </span>
                </button>
              );
            })}
          </div>
          {isGm ? (
            <div className="toolbar-side">
              <div ref={settingsRef} className="toolbar-popover-anchor">
                <button
                  type="button"
                  className={`tool-icon ${settingsOpen ? "is-active" : ""}`}
                  aria-expanded={settingsOpen}
                  aria-label="Map settings"
                  onClick={() => {
                    setPlacementOpen(false);
                    setPaletteOpen(false);
                    setSettingsOpen((open) => !open);
                  }}
                >
                  <IconMap />
                  <span className="tool-tip">Map settings</span>
                </button>
                <input
                  ref={imageInputRef}
                  className="toolbar-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  tabIndex={-1}
                  onChange={(evt) => {
                    pickingImage.current = false;
                    void onUploadMap(evt.target.files?.[0]);
                    evt.target.value = "";
                    setSettingsOpen(false);
                  }}
                  onCancel={() => {
                    pickingImage.current = false;
                  }}
                />
                {settingsOpen ? (
                  <div className="toolbar-popover">
                    <p className="toolbar-setting-label">Background</p>
                    <button
                      type="button"
                      className="toolbar-setting toolbar-setting-btn"
                      onClick={() => {
                        pickingImage.current = true;
                        imageInputRef.current?.click();
                        window.setTimeout(() => {
                          if (document.hasFocus()) pickingImage.current = false;
                        }, 500);
                      }}
                    >
                      <span>{hasMapImage ? "Replace image" : "Add image"}</span>
                      <span className="toolbar-file">{hasMapImage ? "Replace" : "Optional"}</span>
                    </button>
                    {hasMapImage ? (
                      <button
                        type="button"
                        className="toolbar-setting toolbar-setting-btn"
                        onClick={() => {
                          onClearImage?.();
                          setSettingsOpen(false);
                        }}
                      >
                        <span>Remove image</span>
                        <span className="toolbar-file is-clear">Clear</span>
                      </button>
                    ) : null}
                    {hasMapImage || aligning ? (
                      <button
                        type="button"
                        className={`toolbar-setting toolbar-setting-btn ${aligning ? "is-aligning" : ""}`}
                        onClick={() => {
                          if (aligning) onStopAlign?.();
                          else onStartAlign?.();
                          setSettingsOpen(false);
                        }}
                      >
                        <span>{aligning ? "Done aligning" : "Align grid"}</span>
                        <span className="toolbar-file">{aligning ? "Esc" : "Drag"}</span>
                      </button>
                    ) : null}
                    <div className="toolbar-setting-rule" />
                    <p className="toolbar-setting-label">Grid</p>
                    <div className="toolbar-setting">
                      <span>Shape</span>
                      <div className="toolbar-grid-types" role="group" aria-label="Grid type">
                        {GRID_TYPE_OPTIONS.map((option) => {
                          const active = (map.gridType ?? "square") === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={active ? "is-active" : ""}
                              aria-label={option.label}
                              aria-pressed={active}
                              onClick={() => send({ type: "update_map", patch: { gridType: option.id } })}
                            >
                              <GridTypeIcon type={option.id} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <label className="toolbar-setting">
                      <span>Size</span>
                      <NumberField
                        min={GRID_SIZE_MIN}
                        max={GRID_SIZE_MAX}
                        value={map.gridSize}
                        onCommit={(next) =>
                          send({ type: "update_map", patch: { gridSize: clampGridSize(next) } })
                        }
                      />
                    </label>
                    <div className="toolbar-setting-rule" />
                    <button
                      type="button"
                      className="toolbar-setting toolbar-setting-btn"
                      onClick={() => send({ type: "update_map", patch: { snap: !map.snap } })}
                    >
                      <span>Snap to grid</span>
                      <span className={`toolbar-switch ${map.snap ? "on" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="toolbar-side">
            <button
              type="button"
              className={`tool-icon ${pinned ? "is-active" : ""}`}
              aria-pressed={pinned}
              aria-label={pinned ? "Unpin toolbar" : "Keep toolbar visible"}
              onClick={() => setPinned((value) => !value)}
            >
              <IconPin filled={pinned} />
              <span className="tool-tip">{pinned ? "Unpin" : "Keep visible"}</span>
            </button>
            <div ref={placementRef} className="toolbar-popover-anchor">
              <button
                type="button"
                className={`tool-icon ${placementOpen ? "is-active" : ""}`}
                aria-expanded={placementOpen}
                aria-label="Toolbar position"
                onClick={() => {
                  setPaletteOpen(false);
                  setSettingsOpen(false);
                  setPlacementOpen((open) => !open);
                }}
              >
                <IconPlace />
                <span className="tool-tip">Toolbar position</span>
              </button>
              {placementOpen ? (
                <div className="toolbar-popover toolbar-placement-pop">
                  <p className="toolbar-placement-label">Position</p>
                  <div className="toolbar-placement" role="group" aria-label="Toolbar position">
                    {PLACEMENTS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`toolbar-placement-btn ${placement === item.id ? "is-active" : ""}`}
                        style={{ gridColumn: item.col, gridRow: item.row }}
                        aria-label={item.label}
                        aria-pressed={placement === item.id}
                        onClick={() => choosePlacement(item.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`tool-icon ${helpOpen ? "is-active" : ""}`}
              aria-expanded={helpOpen}
              aria-label="Keyboard shortcuts"
              onClick={() => {
                setPaletteOpen(false);
                setHelpOpen((open) => !open);
              }}
            >
              <IconHelp />
              <span className="tool-tip">
                Shortcuts <kbd>?</kbd>
              </span>
            </button>
          </div>
        </div>
        <div className={`toolbar-drawer ${drawing ? "open" : ""}`}>
          <div className="toolbar-drawer-inner">
            <div className="toolbar-palette">
              <button
                type="button"
                className={`swatch erase ${paintColor === null ? "active" : ""}`}
                aria-label="Erase"
                title="Erase"
                onClick={() => setPaintColor(null)}
              />
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`swatch ${paintColor === color ? "active" : ""} ${colorFlash === color ? "is-flashed" : ""}`}
                  style={{ background: color }}
                  aria-label={color}
                  title={color}
                  onClick={() => setPaintColor(color)}
                />
              ))}
              <button
                type="button"
                className={`swatch edit ${paletteOpen ? "active" : ""}`}
                aria-label="Edit colors"
                aria-expanded={paletteOpen}
                title="Edit colors"
                onClick={() => {
                  if (paletteOpen) {
                    setPaletteOpen(false);
                    return;
                  }
                  openPaletteEditor();
                }}
              >
                <IconPalette />
              </button>
            </div>
            <p className="toolbar-hint">{activeTool?.hint} · Ctrl-drag pans</p>
          </div>
        </div>
        <button
          type="button"
          className="toolbar-grip"
          aria-label="Drag to move toolbar"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerUp}
        />
      </div>
      {toast ? (
        <div className="toolbar-toast" key={toast.id}>
          <span>{toast.label}</span>
          <kbd>{toast.shortcut}</kbd>
        </div>
      ) : null}
      {paletteOpen ? (
        <PaletteEditor
          colors={colors}
          presetId={presetId}
          onSelectPreset={applyPreset}
          onSetColor={handleSetColor}
          onAddColor={(color) => {
            addColor(color);
            setPaintColor(color.toLowerCase());
          }}
          onRemoveColor={removeColorAt}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      {helpOpen ? (
        <div className="toolbar-cheatsheet" role="dialog" aria-label="Keyboard shortcuts">
          <p>Shortcuts</p>
          <ul>
            {tools.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <kbd>{item.shortcut}</kbd>
              </li>
            ))}
            <li>
              <span>Back to Move</span>
              <kbd>Esc</kbd>
            </li>
            <li>
              <span>Pan</span>
              <kbd>Ctrl</kbd>
            </li>
            {isGm ? (
              <li>
                <span>Next color</span>
                <kbd>Tab</kbd>
              </li>
            ) : null}
            {isGm ? (
              <li>
                <span>Previous color</span>
                <kbd>⇧Tab</kbd>
              </li>
            ) : null}
            {isGm ? (
              <li>
                <span>Previous scene</span>
                <kbd>[</kbd>
              </li>
            ) : null}
            {isGm ? (
              <li>
                <span>Next scene</span>
                <kbd>]</kbd>
              </li>
            ) : null}
            <li>
              <span>This list</span>
              <kbd>?</kbd>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
    </>
  );
}
