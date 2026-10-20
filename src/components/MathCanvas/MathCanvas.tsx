"use client";

import { useEffect, useRef, useState } from "react";
import PrintButton from "@/components/PrintButton/PrintButton";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./MathCanvas.module.css";

type GraphRole = "student" | "tutor";
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
  | { type: "state"; from: string; to: string; state: DesmosState }
  | { type: "lock-request"; from: string; to: string }
  | { type: "lock-takeover"; from: string; to: string }
  | { type: "lock-release"; from: string; to: string }
  | {
      type: "lock-state";
      from: string;
      to: "*";
      ownerId: string | null;
      ownerRole: GraphRole | null;
    }
  | {
      type: "lock-denied";
      from: string;
      to: string;
      ownerRole: GraphRole;
    };
type OutgoingGraphMessage = GraphMessage extends infer Message
  ? Message extends { from: string }
    ? Omit<Message, "from">
    : never
  : never;
type GraphParticipant = {
  role: GraphRole;
  email: string | null;
  editing: boolean;
  lockOwnerId: string | null;
  lockOwnerRole: GraphRole | null;
  hasLockState: boolean;
};
type PresenceMetadata = {
  role?: unknown;
  email?: unknown;
  editing?: unknown;
  lockOwnerId?: unknown;
  lockOwnerRole?: unknown;
};

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

function isGraphRole(value: unknown): value is GraphRole {
  return value === "student" || value === "tutor";
}

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
    typeof message.to !== "string"
  ) {
    return false;
  }

  switch (message.type) {
    case "state-request":
    case "lock-request":
    case "lock-takeover":
    case "lock-release":
      return true;
    case "state":
      return isDesmosState(message.state);
    case "lock-state":
      return (
        message.to === "*" &&
        (message.ownerId === null || typeof message.ownerId === "string") &&
        (message.ownerRole === null || isGraphRole(message.ownerRole))
      );
    case "lock-denied":
      return isGraphRole(message.ownerRole);
    default:
      return false;
  }
}

function presenceParticipant(value: PresenceMetadata): GraphParticipant | null {
  if (!isGraphRole(value.role)) {
    return null;
  }
  return {
    role: value.role,
    email: typeof value.email === "string" ? value.email : null,
    editing: value.editing === true,
    lockOwnerId:
      typeof value.lockOwnerId === "string" ? value.lockOwnerId : null,
    lockOwnerRole: isGraphRole(value.lockOwnerRole)
      ? value.lockOwnerRole
      : null,
    hasLockState:
      value.lockOwnerId === null || typeof value.lockOwnerId === "string",
  };
}

export default function MathCanvas({
  sessionId,
  sessionRole,
}: {
  sessionId: string;
  sessionRole: GraphRole;
}) {
  const calculatorRef = useRef<HTMLDivElement>(null);
  const calculatorInstanceRef = useRef<DesmosCalculator | null>(null);
  const channelRef = useRef<GraphChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const roleRef = useRef<GraphRole | null>(null);
  const participantsRef = useRef<Map<string, GraphParticipant>>(new Map());
  const coordinatorIdRef = useRef<string | null>(null);
  const lockOwnerIdRef = useRef<string | null>(null);
  const lockOwnerRoleRef = useRef<GraphRole | null>(null);
  const isEditingRef = useRef(false);
  const tutorTakeoverPendingRef = useRef(false);
  const remoteStateRef = useRef<string | null>(null);
  const pendingStateRef = useRef<DesmosState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [role, setRole] = useState<GraphRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lockOwnerId, setLockOwnerId] = useState<string | null>(null);
  const [lockOwnerRole, setLockOwnerRole] = useState<GraphRole | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isRequestingLock, setIsRequestingLock] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const requestEditLockRef = useRef<(() => Promise<void>) | null>(null);
  const releaseEditLockRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    let channel: GraphChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function sendMessage(
      message: OutgoingGraphMessage,
    ): Promise<void> {
      const currentChannel = channelRef.current;
      const from = userIdRef.current;
      if (!currentChannel || !from) {
        throw new Error("The shared graph connection is not ready.");
      }
      const result = await currentChannel.send({
        type: "broadcast",
        event: "graph-state",
        payload: { ...message, from },
      });
      if (result !== "ok") {
        throw new Error(`Unable to synchronize the graph: ${result}`);
      }
    }

    async function trackLockState(
      ownerId: string | null,
      ownerRole: GraphRole | null,
    ): Promise<void> {
      const currentChannel = channelRef.current;
      const userId = userIdRef.current;
      const currentRole = roleRef.current;
      if (!currentChannel || !userId || !currentRole) {
        throw new Error("The shared graph connection is not ready.");
      }
      const result = await currentChannel.track({
        userId,
        role: currentRole,
        email: participantsRef.current.get(userId)?.email ?? null,
        editing: ownerId === userId,
        lockOwnerId: ownerId,
        lockOwnerRole: ownerRole,
      });
      if (result !== "ok") {
        throw new Error(`Unable to update graph edit lock: ${result}`);
      }
    }

    async function publishLockState(
      ownerId: string | null,
      ownerRole: GraphRole | null,
    ): Promise<void> {
      const coordinatorId = coordinatorIdRef.current;
      const userId = userIdRef.current;
      if (!userId || coordinatorId !== userId) {
        throw new Error("Only the graph lock coordinator can change the edit lock.");
      }
      lockOwnerIdRef.current = ownerId;
      lockOwnerRoleRef.current = ownerRole;
      setLockOwnerId(ownerId);
      setLockOwnerRole(ownerRole);
      isEditingRef.current = ownerId === userId;
      setIsEditing(ownerId === userId);

      await trackLockState(ownerId, ownerRole);
      await sendMessage({
        type: "lock-state",
        to: "*",
        ownerId,
        ownerRole,
      });
      if (ownerId === null) {
        await sendCurrentGraph("*");
      }
    }

    async function sendCurrentGraph(to: string): Promise<void> {
      const userId = userIdRef.current;
      const coordinatorId = coordinatorIdRef.current;
      if (
        !userId ||
        (lockOwnerIdRef.current && lockOwnerIdRef.current !== userId) ||
        (!lockOwnerIdRef.current && coordinatorId !== userId)
      ) {
        return;
      }
      const calculator = calculatorInstanceRef.current;
      if (!calculator) {
        return;
      }
      await sendMessage({
        type: "state",
        to,
        state: calculator.getState(),
      });
    }

    async function requestEditLock(): Promise<void> {
      const userId = userIdRef.current;
      const coordinatorId = coordinatorIdRef.current;
      const currentRole = roleRef.current;
      if (!userId || !currentRole || !coordinatorId) {
        throw new Error("No participant is available to coordinate graph editing.");
      }

      if (coordinatorId === userId) {
        if (
          currentRole === "tutor" &&
          lockOwnerIdRef.current &&
          lockOwnerIdRef.current !== userId
        ) {
          setIsRequestingLock(true);
          await sendMessage({
            type: "lock-takeover",
            to: lockOwnerIdRef.current,
          });
          return;
        }
        if (!lockOwnerIdRef.current || lockOwnerIdRef.current === userId) {
          await publishLockState(userId, currentRole);
        }
        return;
      }

      setIsRequestingLock(true);
      await sendMessage({
        type: "lock-request",
        to: coordinatorId,
      });
    }

    async function releaseEditLock(): Promise<void> {
      const userId = userIdRef.current;
      const coordinatorId = coordinatorIdRef.current;
      if (!userId || !coordinatorId || lockOwnerIdRef.current !== userId) {
        return;
      }

      await sendCurrentGraph("*");
      if (coordinatorId === userId) {
        await publishLockState(null, null);
        return;
      }
      await sendMessage({ type: "lock-release", to: coordinatorId });
    }
    requestEditLockRef.current = requestEditLock;
    releaseEditLockRef.current = releaseEditLock;

    function scheduleStateBroadcast(): void {
      const calculator = calculatorInstanceRef.current;
      if (
        !calculator ||
        !channelRef.current ||
        !userIdRef.current ||
        !isEditingRef.current
      ) {
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
        void sendCurrentGraph("*").catch((error: unknown) => {
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

    function applyLockState(
      ownerId: string | null,
      ownerRole: GraphRole | null,
    ): void {
      lockOwnerIdRef.current = ownerId;
      lockOwnerRoleRef.current = ownerRole;
      const userId = userIdRef.current;
      const hasEditLock = ownerId === userId;
      isEditingRef.current = hasEditLock;
      setLockOwnerId(ownerId);
      setLockOwnerRole(ownerRole);
      setIsEditing(hasEditLock);
      if (hasEditLock) {
        tutorTakeoverPendingRef.current = false;
      }
      if (ownerId !== null) {
        setIsRequestingLock(false);
      }

      if (!hasEditLock && calculatorRef.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    }

    async function handleGraphMessage(value: unknown): Promise<void> {
      if (!active || !isGraphMessage(value)) {
        return;
      }
      const userId = userIdRef.current;
      if (
        !userId ||
        value.from === userId ||
        (value.to !== userId && value.to !== "*")
      ) {
        return;
      }

      if (value.type === "lock-state") {
        if (value.from !== coordinatorIdRef.current) {
          return;
        }
        applyLockState(value.ownerId, value.ownerRole);
        await trackLockState(value.ownerId, value.ownerRole);
        return;
      }

      if (value.type === "lock-denied") {
        setIsRequestingLock(false);
        setErrorMessage(
          `The ${value.ownerRole} is editing the graph right now.`,
        );
        return;
      }

      if (value.type === "lock-request") {
        if (userId !== coordinatorIdRef.current) {
          return;
        }
        const requester = participantsRef.current.get(value.from);
        if (!requester) {
          return;
        }
        if (
          !lockOwnerIdRef.current ||
          lockOwnerIdRef.current === value.from
        ) {
          await publishLockState(value.from, requester.role);
        } else {
          const ownerRole = lockOwnerRoleRef.current;
          if (!ownerRole) {
            throw new Error("The active graph editor role is unavailable.");
          }
          await sendMessage({
            type: "lock-denied",
            to: value.from,
            ownerRole,
          });
        }
        return;
      }

      if (value.type === "lock-takeover") {
        if (
          userIdRef.current === coordinatorIdRef.current ||
          roleRef.current !== "student" ||
          value.from !== coordinatorIdRef.current ||
          lockOwnerIdRef.current !== userId
        ) {
          return;
        }

        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        await sendCurrentGraph(value.from);
        isEditingRef.current = false;
        setIsEditing(false);
        if (calculatorRef.current?.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (value.type === "lock-release") {
        if (
          userId === coordinatorIdRef.current &&
          lockOwnerIdRef.current === value.from
        ) {
          await publishLockState(null, null);
        }
        return;
      }

      if (value.type === "state-request") {
        await sendCurrentGraph(value.from);
        return;
      }

      const canApply =
        (!isEditingRef.current &&
          (value.from === lockOwnerIdRef.current ||
            (!lockOwnerIdRef.current &&
              value.from === coordinatorIdRef.current))) ||
        (tutorTakeoverPendingRef.current &&
          roleRef.current === "tutor" &&
          value.to === userId &&
          value.from === lockOwnerIdRef.current);
      if (!canApply) {
        return;
      }

      const calculator = calculatorInstanceRef.current;
      if (!calculator) {
        pendingStateRef.current = value.state;
        return;
      }
      const currentState = JSON.stringify(calculator.getState());
      const incomingState = JSON.stringify(value.state);
      if (currentState !== incomingState) {
        remoteStateRef.current = incomingState;
        calculator.setState(value.state, { allowUndo: true });
      }
      if (
        tutorTakeoverPendingRef.current &&
        roleRef.current === "tutor" &&
        value.from === lockOwnerIdRef.current
      ) {
        const currentRole = roleRef.current;
        tutorTakeoverPendingRef.current = false;
        if (currentRole) {
          await publishLockState(userId, currentRole);
        }
      }
    }

    async function initializeCollaboration(): Promise<void> {
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
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_tutor")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        throw new Error(`Unable to verify your account role: ${profileError.message}`);
      }
      if (
        !profile ||
        !(
          profile.role === sessionRole ||
          (sessionRole === "tutor" &&
            profile.role === "admin" &&
            profile.is_tutor === true)
        )
      ) {
        throw new Error("Only student and tutor accounts can edit the shared graph.");
      }
      if (!active) {
        return;
      }

      userIdRef.current = user.id;
      roleRef.current = sessionRole;
      setRole(sessionRole);
      setUserId(user.id);

      channel = supabase
        .channel(`session:${sessionId}:graph`, {
          config: {
            private: true,
            presence: { key: user.id },
          },
        })
        .on("presence", { event: "sync" }, () => {
          if (!active || !channel) {
            return;
          }
          const currentParticipants = new Map<string, GraphParticipant>();
          for (const [participantId, instances] of Object.entries(
            channel.presenceState<PresenceMetadata>(),
          )) {
            const participant = instances
              .map(presenceParticipant)
              .find((entry) => entry !== null);
            if (participant) {
              currentParticipants.set(participantId, participant);
            }
          }
          participantsRef.current = currentParticipants;
          setIsReady(currentParticipants.has(userIdRef.current ?? ""));

          const tutorId = [...currentParticipants]
            .find(([, participant]) => participant.role === "tutor")?.[0];
          const nextCoordinatorId =
            tutorId ??
            [...currentParticipants.keys()].sort()[0] ??
            user.id;
          const coordinatorChanged =
            nextCoordinatorId !== coordinatorIdRef.current;
          coordinatorIdRef.current = nextCoordinatorId;

          const coordinator = currentParticipants.get(nextCoordinatorId);
          const editingParticipant = [...currentParticipants]
            .find(([, participant]) => participant.editing);
          const recordedOwnerId = coordinator?.hasLockState
            ? coordinator.lockOwnerId
            : editingParticipant?.[0] ?? null;
          const nextOwnerId =
            recordedOwnerId && currentParticipants.has(recordedOwnerId)
              ? recordedOwnerId
              : null;
          const nextOwnerRole = nextOwnerId
            ? coordinator?.lockOwnerRole ??
              currentParticipants.get(nextOwnerId)?.role ??
              null
            : null;
          const previousOwnerId = lockOwnerIdRef.current;
          applyLockState(nextOwnerId, nextOwnerRole);

          if (
            nextCoordinatorId === user.id &&
            (coordinatorChanged ||
              nextOwnerId !== previousOwnerId ||
              coordinator?.lockOwnerId !== nextOwnerId)
          ) {
            void publishLockState(nextOwnerId, nextOwnerRole).catch(
              (error: unknown) => {
                console.error("Unable to restore the graph edit lock", error);
                if (active) {
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to restore the graph edit lock.",
                  );
                }
              },
            );
          }
        })
        .on("broadcast", { event: "graph-state" }, ({ payload }) => {
          void handleGraphMessage(payload).catch((error: unknown) => {
            console.error("Unable to process shared graph update", error);
            if (active) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to process a shared graph update.",
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
              ?.track({
                userId: user.id,
                role: sessionRole,
                email: user.email,
                editing: false,
              })
              .then((result) => {
                if (result !== "ok") {
                  throw new Error(`Unable to publish graph presence: ${result ?? "no response"}`);
                }
                if (!active) {
                  return;
                }
                void sendMessage({
                  type: "state-request",
                  to: "*",
                }).catch((error: unknown) => {
                  console.error("Unable to request shared graph state", error);
                  if (active) {
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to request shared graph state.",
                    );
                  }
                });
              })
              .catch((error: unknown) => {
                console.error("Unable to publish graph presence", error);
                if (active) {
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to join shared graph editing.",
                  );
                }
              });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setIsReady(false);
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

      void initializeCollaboration().catch((error: unknown) => {
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
        const demoKey = "dcb31709b452b149dc269b578d5367f0";
        const apiKey =
          process.env.NEXT_PUBLIC_DESMOS_API_KEY || demoKey;
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
      requestEditLockRef.current = null;
      releaseEditLockRef.current = null;
      if (channel) {
        void channel.unsubscribe().then((status) => {
          if (status !== "ok") {
            console.error("Unable to clean up shared graph channel", status);
          }
        });
      }
    };
  }, [sessionId, sessionRole]);

  async function toggleEditLock(): Promise<void> {
    setErrorMessage("");
    if (!isEditingRef.current && role === "tutor" && lockOwnerId !== null) {
      tutorTakeoverPendingRef.current = true;
    }
    try {
      if (isEditingRef.current) {
        const releaseEditLock = releaseEditLockRef.current;
        if (!releaseEditLock) {
          throw new Error("The graph edit lock is not ready.");
        }
        await releaseEditLock();
      } else {
        const requestEditLock = requestEditLockRef.current;
        if (!requestEditLock) {
          throw new Error("The graph edit lock is not ready.");
        }
        await requestEditLock();
      }
    } catch (error: unknown) {
      tutorTakeoverPendingRef.current = false;
      console.error("Unable to change graph edit lock", error);
      setIsRequestingLock(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to change graph edit access.",
      );
    }
  }

  const remoteEditor = lockOwnerId !== null && lockOwnerId !== userId;
  const lockLabel = isEditing
    ? `You (${role}) have edit control`
    : remoteEditor
      ? `${lockOwnerRole ?? "Another participant"} is editing`
      : "Graph is read-only";

  return (
    <div
      className={[styles.container, styles.utility_d89972fe].filter(Boolean).join(" ")}
      data-printable="math-canvas"
    >
      {(isLoading || errorMessage) && (
        <div
          className={[styles.statusOverlay, styles.utility_0f2fff0a, (errorMessage ? styles.utility_1529a707 : "")].filter(Boolean).join(" ")}
          data-print-hide
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage || "Loading Desmos Graphing Calculator..."}
        </div>
      )}
      <div
        ref={calculatorRef}
        className={styles.desmosWrapper}
        id="calculator"
      />
      {!isEditing && !isLoading && (
        <div
          aria-label="Graph editing is locked"
          className={styles.utility_21617f24}
          role="presentation"
          data-print-hide
        />
      )}
      <div
        className={styles.utility_425c0bf0}
        data-print-hide
      >
        <button
          className={styles.utility_c068dff9}
          disabled={
            isLoading ||
            !role ||
            !isReady ||
            isRequestingLock ||
            (remoteEditor && !isEditing && role !== "tutor")
          }
          onClick={() => void toggleEditLock()}
          type="button"
        >
          {isRequestingLock
            ? "Requesting control..."
            : isEditing
              ? "Finish editing"
              : remoteEditor
                ? role === "tutor"
                  ? `Take control from ${lockOwnerRole ?? "participant"}`
                  : `${lockOwnerRole ?? "Participant"} editing`
                : "Take edit control"}
        </button>
        <span aria-live="polite" className={styles.utility_e0ef08ef}>
          {lockLabel}
        </span>
      </div>
      <div className={styles.utility_8a3a5e43} data-print-hide>
        <PrintButton display="math-canvas" label="Math Canvas" />
      </div>
    </div>
  );
}
