"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowUpRight,
  Circle,
  Minus,
  Pencil,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./Whiteboard.module.css";

type DrawingTool = "pen" | "line" | "rectangle" | "ellipse" | "arrow";
type Point = { x: number; y: number };
type WhiteboardItem = {
  id: string;
  userId: string;
  tool: DrawingTool;
  color: string;
  points: Point[];
};
type WhiteboardMessage =
  | { type: "request-state"; from: string; to: string }
  | { type: "state"; from: string; to: string; items: WhiteboardItem[] }
  | { type: "add"; from: string; to: "*"; item: WhiteboardItem }
  | { type: "remove"; from: string; to: "*"; id: string }
  | { type: "clear"; from: string; to: "*" };
type OutgoingWhiteboardMessage = WhiteboardMessage extends infer Message
  ? Message extends { from: string }
    ? Omit<Message, "from">
    : never
  : never;
type WhiteboardChannel = ReturnType<
  ReturnType<typeof getSupabaseBrowserClient>["channel"]
>;

const sessionId = "demo-101";
const channelTopic = `session:${sessionId}:whiteboard`;
const boardWidth = 1000;
const boardHeight = 700;
const colors = [
  "#111827",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#9333ea",
];
const tools: { value: DrawingTool; label: string; Icon: typeof Pencil }[] = [
  { value: "pen", label: "Pen", Icon: Pencil },
  { value: "line", label: "Line", Icon: Minus },
  { value: "rectangle", label: "Rectangle", Icon: Square },
  { value: "ellipse", label: "Ellipse", Icon: Circle },
  { value: "arrow", label: "Arrow", Icon: ArrowUpRight },
];

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y)
  );
}

function isWhiteboardItem(value: unknown): value is WhiteboardItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.userId === "string" &&
    typeof item.tool === "string" &&
    tools.some(({ value: tool }) => tool === item.tool) &&
    typeof item.color === "string" &&
    colors.includes(item.color) &&
    Array.isArray(item.points) &&
    item.points.length >= 2 &&
    (item.tool === "pen" || item.points.length === 2) &&
    item.points.every(isPoint)
  );
}

function isWhiteboardMessage(value: unknown): value is WhiteboardMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (
    typeof message.from !== "string" ||
    typeof message.to !== "string"
  ) {
    return false;
  }
  switch (message.type) {
    case "request-state":
      return true;
    case "state":
      return (
        Array.isArray(message.items) &&
        message.items.every(isWhiteboardItem)
      );
    case "add":
      return message.to === "*" && isWhiteboardItem(message.item);
    case "remove":
      return message.to === "*" && typeof message.id === "string";
    case "clear":
      return message.to === "*";
    default:
      return false;
  }
}

function mergeItems(
  current: WhiteboardItem[],
  incoming: WhiteboardItem[],
): WhiteboardItem[] {
  const itemsById = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!itemsById.has(item.id)) {
      itemsById.set(item.id, item);
    }
  }
  return [...itemsById.values()];
}

function itemBounds(points: Point[]) {
  const first = points[0];
  const last = points[points.length - 1];
  return {
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
    width: Math.abs(last.x - first.x),
    height: Math.abs(last.y - first.y),
  };
}

export default function Whiteboard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const channelRef = useRef<WhiteboardChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const itemsRef = useRef<WhiteboardItem[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const [activeItem, setActiveItem] = useState<WhiteboardItem | null>(null);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>("pen");
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [connectionError, setConnectionError] = useState("");
  const [isReady, setIsReady] = useState(false);

  function updateItems(nextItems: WhiteboardItem[]): void {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }

  useEffect(() => {
    let active = true;
    let channel: WhiteboardChannel | null = null;

    async function sendMessage(
      message: OutgoingWhiteboardMessage,
    ): Promise<void> {
      const currentChannel = channelRef.current;
      const from = userIdRef.current;
      if (!currentChannel || !from) {
        throw new Error("The shared whiteboard connection is not ready.");
      }
      const result = await currentChannel.send({
        type: "broadcast",
        event: "whiteboard-change",
        payload: { ...message, from },
      });
      if (result !== "ok") {
        throw new Error(`Unable to synchronize the whiteboard: ${result}`);
      }
    }

    async function handleMessage(value: unknown): Promise<void> {
      if (!active || !isWhiteboardMessage(value)) {
        return;
      }
      const userId = userIdRef.current;
      if (!userId || value.from === userId) {
        return;
      }

      if (value.type === "request-state") {
        if (value.to === userId || value.to === "*") {
          await sendMessage({
            type: "state",
            to: value.from,
            items: itemsRef.current,
          });
        }
        return;
      }
      if (value.to !== userId && value.to !== "*") {
        return;
      }

      if (value.type === "state") {
        updateItems(mergeItems(itemsRef.current, value.items));
      } else if (value.type === "add") {
        updateItems(mergeItems(itemsRef.current, [value.item]));
      } else if (value.type === "remove") {
        updateItems(itemsRef.current.filter((item) => item.id !== value.id));
      } else if (value.type === "clear") {
        updateItems([]);
      }
    }

    async function connect(): Promise<void> {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        throw new Error(`Unable to verify your sign-in: ${userError.message}`);
      }
      if (!user) {
        throw new Error("Sign in as a student or tutor to use the whiteboard.");
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        throw new Error(`Unable to verify your account role: ${profileError.message}`);
      }
      if (
        !profile ||
        (profile.role !== "student" && profile.role !== "tutor")
      ) {
        throw new Error("Only student and tutor accounts can use the whiteboard.");
      }
      if (!active) {
        return;
      }

      userIdRef.current = user.id;
      channel = supabase
        .channel(channelTopic, {
          config: {
            private: true,
            presence: { key: user.id },
          },
        })
        .on("broadcast", { event: "whiteboard-change" }, ({ payload }) => {
          void handleMessage(payload).catch((error: unknown) => {
            console.error("Unable to process whiteboard update", error);
            if (active) {
              setConnectionError(
                error instanceof Error
                  ? error.message
                  : "Unable to synchronize the whiteboard.",
              );
            }
          });
        })
        .subscribe((status, subscriptionError) => {
          if (!active) {
            return;
          }
          if (status === "SUBSCRIBED") {
            void channel
              ?.track({ userId: user.id, role: profile.role })
              .then((result) => {
                if (result !== "ok") {
                  throw new Error(`Unable to publish whiteboard presence: ${result ?? "no response"}`);
                }
                if (!active) {
                  return;
                }
                setIsReady(true);
                return sendMessage({
                  type: "request-state",
                  to: "*",
                });
              })
              .catch((error: unknown) => {
                console.error("Unable to join the shared whiteboard", error);
                if (active) {
                  setConnectionError(
                    error instanceof Error
                      ? error.message
                      : "Unable to join the shared whiteboard.",
                  );
                }
              });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setIsReady(false);
            console.error("Whiteboard channel disconnected", subscriptionError);
            setConnectionError(
              subscriptionError?.message ??
                "The whiteboard connection was interrupted. Please reload the page.",
            );
          }
        });
      channelRef.current = channel;
    }

    connect().catch((error: unknown) => {
      console.error("Unable to initialize the shared whiteboard", error);
      if (active) {
        setConnectionError(
          error instanceof Error
            ? error.message
            : "Unable to initialize the shared whiteboard.",
        );
      }
    });

    return () => {
      active = false;
      channelRef.current = null;
      userIdRef.current = null;
      if (channel) {
        void channel.unsubscribe().then((status) => {
          if (status !== "ok") {
            console.error("Unable to clean up whiteboard channel", status);
          }
        });
      }
    };
  }, []);

  function pointFromEvent(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          boardWidth,
          ((event.clientX - bounds.left) / bounds.width) * boardWidth,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          boardHeight,
          ((event.clientY - bounds.top) / bounds.height) * boardHeight,
        ),
      ),
    };
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    if (!isReady || activePointerRef.current !== null) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    const point = pointFromEvent(event);
    setActiveItem({
      id: crypto.randomUUID(),
      userId: userIdRef.current ?? "",
      tool: selectedTool,
      color: selectedColor,
      points: [point],
    });
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    if (
      activePointerRef.current !== event.pointerId ||
      !activeItem ||
      activeItem.tool !== "pen"
    ) {
      return;
    }
    const point = pointFromEvent(event);
    setActiveItem((current) =>
      current ? { ...current, points: [...current.points, point] } : current,
    );
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>): void {
    if (activePointerRef.current !== event.pointerId) {
      return;
    }
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!activeItem) {
      return;
    }

    const finalItem =
      activeItem.tool === "pen"
        ? activeItem
        : {
            ...activeItem,
            points: [activeItem.points[0], pointFromEvent(event)],
          };
    if (finalItem.tool !== "pen" || finalItem.points.length > 1) {
      updateItems(mergeItems(itemsRef.current, [finalItem]));
      void sendItem(finalItem);
    }
    setActiveItem(null);
  }

  async function sendItem(item: WhiteboardItem): Promise<void> {
    try {
      await sendMessageFromHandler({ type: "add", to: "*", item });
    } catch (error: unknown) {
      console.error("Unable to share whiteboard drawing", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Unable to share the drawing.",
      );
    }
  }

  async function sendMessageFromHandler(
    message: OutgoingWhiteboardMessage,
  ): Promise<void> {
    const channel = channelRef.current;
    const from = userIdRef.current;
    if (!channel || !from) {
      throw new Error("The shared whiteboard connection is not ready.");
    }
    const result = await channel.send({
      type: "broadcast",
      event: "whiteboard-change",
      payload: { ...message, from },
    });
    if (result !== "ok") {
      throw new Error(`Unable to synchronize the whiteboard: ${result}`);
    }
  }

  async function undoLast(): Promise<void> {
    const lastItem = itemsRef.current[itemsRef.current.length - 1];
    if (!lastItem) {
      return;
    }
    updateItems(itemsRef.current.filter((item) => item.id !== lastItem.id));
    try {
      await sendMessageFromHandler({
        type: "remove",
        to: "*",
        id: lastItem.id,
      });
    } catch (error: unknown) {
      console.error("Unable to synchronize whiteboard undo", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Unable to synchronize the undo.",
      );
    }
  }

  async function clearBoard(): Promise<void> {
    updateItems([]);
    try {
      await sendMessageFromHandler({ type: "clear", to: "*" });
    } catch (error: unknown) {
      console.error("Unable to synchronize whiteboard clear", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Unable to synchronize clearing the board.",
      );
    }
  }

  function renderItem(item: WhiteboardItem) {
    if (item.tool === "pen") {
      const points = item.points.map(({ x, y }) => `${x},${y}`).join(" ");
      return (
        <polyline
          key={item.id}
          points={points}
          fill="none"
          stroke={item.color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    const [start, end] = item.points;
    const bounds = itemBounds(item.points);
    const common = {
      key: item.id,
      fill: item.tool === "rectangle" || item.tool === "ellipse" ? "none" : undefined,
      stroke: item.color,
      strokeWidth: 4,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      vectorEffect: "non-scaling-stroke" as const,
    };
    if (item.tool === "line") {
      return <line {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
    }
    if (item.tool === "rectangle") {
      return (
        <rect
          {...common}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
        />
      );
    }
    if (item.tool === "ellipse") {
      return (
        <ellipse
          {...common}
          cx={bounds.x + bounds.width / 2}
          cy={bounds.y + bounds.height / 2}
          rx={bounds.width / 2}
          ry={bounds.height / 2}
        />
      );
    }
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowSize = 18;
    const firstWing = {
      x: end.x - arrowSize * Math.cos(angle - Math.PI / 6),
      y: end.y - arrowSize * Math.sin(angle - Math.PI / 6),
    };
    const secondWing = {
      x: end.x - arrowSize * Math.cos(angle + Math.PI / 6),
      y: end.y - arrowSize * Math.sin(angle + Math.PI / 6),
    };
    return (
      <g
        key={item.id}
        stroke={item.color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      >
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
        <polyline
          points={`${firstWing.x},${firstWing.y} ${end.x},${end.y} ${secondWing.x},${secondWing.y}`}
        />
      </g>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 p-2">
        <div aria-label="Drawing tools" className="flex items-center gap-1">
          {tools.map(({ value, label, Icon }) => (
            <button
              key={value}
              aria-label={label}
              aria-pressed={selectedTool === value}
              className={`rounded-md p-2 ${
                selectedTool === value
                  ? "bg-sky-100 text-sky-800"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setSelectedTool(value)}
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
            </button>
          ))}
        </div>

        <div className="mx-1 h-6 border-l border-slate-300" />

        <div aria-label="Drawing colors" className="flex items-center gap-1">
          {colors.map((color) => (
            <button
              key={color}
              aria-label={`Use ${color} drawing color`}
              aria-pressed={selectedColor === color}
              className={`h-6 w-6 rounded-full border-2 ${
                selectedColor === color
                  ? "border-sky-600 ring-2 ring-sky-200"
                  : "border-white shadow ring-1 ring-slate-300"
              }`}
              onClick={() => setSelectedColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label="Undo last drawing"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            disabled={!items.length || !isReady}
            onClick={() => void undoLast()}
            title="Undo last drawing"
            type="button"
          >
            <Undo2 aria-hidden="true" size={17} />
          </button>
          <button
            aria-label="Clear whiteboard"
            className="rounded-md p-2 text-slate-600 hover:bg-red-100 hover:text-red-700 disabled:opacity-40"
            disabled={!items.length || !isReady}
            onClick={() => void clearBoard()}
            title="Clear whiteboard"
            type="button"
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      {connectionError && (
        <p
          aria-live="polite"
          className="border-b border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700"
          role="alert"
        >
          {connectionError}
        </p>
      )}

      <div className={styles.board}>
        <svg
          ref={svgRef}
          aria-label="Shared drawing whiteboard"
          className="h-full w-full touch-none"
          preserveAspectRatio="none"
          role="application"
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {items.map(renderItem)}
          {activeItem && renderItem(activeItem)}
        </svg>
        {!isReady && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 top-0 bg-white/90 px-3 py-2 text-center text-xs text-slate-500"
            role="status"
          >
            {connectionError || "Connecting to shared whiteboard..."}
          </div>
        )}
      </div>
    </section>
  );
}
