"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./MathCanvas.module.css";

type DesmosState = Record<string, unknown>;
type DesmosCalculator = {
  getState: () => DesmosState;
  setState: (state: DesmosState, options?: { allowUndo?: boolean }) => void;
  observeEvent: (eventName: "change", callback: () => void) => void;
  unobserveEvent: (eventName: "change", callback: () => void) => void;
  destroy: () => void;
};
type GraphChannel = ReturnType<
  ReturnType<typeof getSupabaseBrowserClient>["channel"]
>;
type GraphMessage =
  | { type: "state-request"; from: string; to: string }
  | { type: "state"; from: string; to: string; state: DesmosState };

declare global {
  interface Window {
    Desmos: {
      GraphingCalculator: (
        element: HTMLElement,
        options: {
          expressions: boolean;
          settingsMenu: boolean;
          zoomButtons: boolean;
          lockViewport: boolean;
        },
      ) => DesmosCalculator;
    };
  }
}

const sessionId = "demo-101";
const channelTopic = `session:${sessionId}:graph`;

function isDesmosState(value: unknown): value is DesmosState {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGraphMessage(value: unknown): value is GraphMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (
    typeof message.from !== "string" ||
    typeof message.to !== "string" ||
    (message.type !== "state-request" && message.type !== "state")
  ) {
    return false;
  }
  return message.type === "state-request" || isDesmosState(message.state);
}

export default function MathCanvas() {
  const calculatorRef = useRef<HTMLDivElement>(null);
  const calculatorInstanceRef = useRef<DesmosCalculator | null>(null);
  const channelRef = useRef<GraphChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const remoteStateRef = useRef<string | null>(null);
  const pendingStateRef = useRef<DesmosState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    let channel: GraphChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function sendState(
      type: "state" | "state-request",
      to: string,
    ): Promise<void> {
      const currentChannel = channelRef.current;
      const from = userIdRef.current;
      if (!currentChannel || !from) {
        throw new Error("The shared graph connection is not ready.");
      }

      const payload: GraphMessage =
        type === "state"
          ? {
              type,
              from,
              to,
              state: calculatorInstanceRef.current?.getState() ?? {},
            }
          : { type, from, to };
      const result = await currentChannel.send({
        type: "broadcast",
        event: "graph-state",
        payload,
      });
      if (result !== "ok") {
        throw new Error(`Unable to synchronize the graph: ${result}`);
      }
    }

    function scheduleStateBroadcast(): void {
      const calculator = calculatorInstanceRef.current;
      if (!calculator || !channelRef.current || !userIdRef.current) {
        return;
      }

      const serializedState = JSON.stringify(calculator.getState());
      if (serializedState === remoteStateRef.current) {
        remoteStateRef.current = null;
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void sendState("state", "*").catch((error: unknown) => {
          console.error("Unable to synchronize Desmos graph changes", error);
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Unable to synchronize graph changes.",
            );
          }
        });
      }, 150);
    }

    async function startCollaboration(): Promise<void> {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        throw new Error(`Unable to verify your sign-in: ${userError.message}`);
      }
      if (!user) {
        throw new Error("Sign in to edit the shared graph.");
      }

      userIdRef.current = user.id;
      channel = supabase
        .channel(channelTopic, {
          config: { private: true },
        })
        .on("broadcast", { event: "graph-state" }, ({ payload }) => {
          if (
            !active ||
            !isGraphMessage(payload) ||
            payload.from === user.id ||
            (payload.to !== user.id && payload.to !== "*")
          ) {
            return;
          }

          if (payload.type === "state-request") {
            void sendState("state", payload.from).catch((error: unknown) => {
              console.error("Unable to send the shared graph state", error);
              if (active) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "Unable to send the shared graph state.",
                );
              }
            });
            return;
          }

          const calculator = calculatorInstanceRef.current;
          if (!calculator) {
            pendingStateRef.current = payload.state;
            return;
          }

          const currentState = JSON.stringify(calculator.getState());
          const incomingState = JSON.stringify(payload.state);
          if (currentState !== incomingState) {
            remoteStateRef.current = incomingState;
            calculator.setState(payload.state, { allowUndo: true });
          }
        })
        .subscribe((status, subscriptionError) => {
          if (!active) {
            return;
          }
          if (status === "SUBSCRIBED") {
            void sendState("state-request", "*").then(() => {
              if (active) {
                setErrorMessage("");
              }
            }).catch((error: unknown) => {
              console.error("Unable to initialize shared graph state", error);
              if (active) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "Unable to initialize the shared graph.",
                );
              }
            });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.error("Shared graph channel disconnected", subscriptionError);
            setErrorMessage(
              subscriptionError?.message ??
                "The shared graph connection was interrupted. Please reload the page.",
            );
          }
        });
      channelRef.current = channel;
    }

    function initializeCalculator(): void {
      const element = calculatorRef.current;
      if (!active || !element || !window.Desmos) {
        return;
      }

      const calculator = window.Desmos.GraphingCalculator(element, {
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        lockViewport: false,
      });
      calculatorInstanceRef.current = calculator;
      calculator.observeEvent("change", scheduleStateBroadcast);
      setIsLoading(false);

      if (pendingStateRef.current) {
        const state = pendingStateRef.current;
        pendingStateRef.current = null;
        const serializedState = JSON.stringify(state);
        remoteStateRef.current = serializedState;
        calculator.setState(state, { allowUndo: true });
      }

      void startCollaboration().catch((error: unknown) => {
        console.error("Unable to connect shared Desmos graph", error);
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to connect to the shared graph.",
          );
        }
      });
    }

    if (window.Desmos) {
      initializeCalculator();
    } else {
      let script = document.querySelector<HTMLScriptElement>(
        'script[data-desmos-calculator="true"]',
      );
      if (!script) {
        script = document.createElement("script");
        const apiKey =
          process.env.NEXT_PUBLIC_DESMOS_API_KEY ||
          "dcb31709b452b149dc269b578d5367f0";
        script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${apiKey}`;
        script.async = true;
        script.dataset.desmosCalculator = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", initializeCalculator);
      script.addEventListener("error", () => {
        if (active) {
          setErrorMessage("Unable to load the Desmos Graphing Calculator.");
        }
      });
    }

    return () => {
      active = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      calculatorInstanceRef.current?.unobserveEvent(
        "change",
        scheduleStateBroadcast,
      );
      calculatorInstanceRef.current?.destroy();
      calculatorInstanceRef.current = null;
      channelRef.current = null;
      if (channel) {
        void channel.unsubscribe().then((status) => {
          if (status !== "ok") {
            console.error("Unable to clean up shared graph channel", status);
          }
        });
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      {(isLoading || errorMessage) && (
        <div
          className={`${styles.statusOverlay} ${errorMessage ? "text-red-300" : ""}`}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage || "Loading Desmos Graphing Calculator..."}
        </div>
      )}
      <div
        ref={calculatorRef}
        className={styles.desmosWrapper}
        id="calculator"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
