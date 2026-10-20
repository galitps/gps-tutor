"use client";


import styles from "./SessionChat.module.css";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionParticipants } from "@/components/SessionParticipants/SessionParticipants";
import PrintButton from "@/components/PrintButton/PrintButton";

type ChatRole = "student" | "tutor";
type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};
type SessionChannel = ReturnType<
  ReturnType<typeof getSupabaseBrowserClient>["channel"]
>;

function isChatMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sender_id === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.created_at === "string"
  );
}

function addMessage(
  currentMessages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  if (currentMessages.some(({ id }) => id === message.id)) {
    return currentMessages;
  }

  return [...currentMessages, message].sort(
    (first, second) =>
      new Date(first.created_at).getTime() -
      new Date(second.created_at).getTime(),
  );
}

export default function SessionChat({
  sessionId,
  sessionRole,
}: {
  sessionId: string;
  sessionRole: ChatRole;
}) {
  const [role, setRole] = useState<ChatRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "checking" | "signed-out" | "connecting" | "connected" | "error"
  >("checking");
  const { participantEmails } = useSessionParticipants();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const channelRef = useRef<SessionChannel | null>(null);
  const peerRole = role === "student" ? "tutor" : "student";

  useEffect(() => {
    let active = true;
    let sessionChannel: SessionChannel | null = null;

    async function connect() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(`Unable to verify your sign-in: ${userError.message}`);
      }
      if (!user) {
        if (active) {
          setConnectionStatus("signed-out");
        }
        return;
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
        throw new Error("This session is available to student and tutor accounts only.");
      }
      if (!active) {
        return;
      }

      setRole(sessionRole);
      setUserId(user.id);
      setConnectionStatus("connecting");

      sessionChannel = supabase
        .channel(`session:${sessionId}`, {
          config: { private: true },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "session_messages",
            filter: `session_id=eq.${sessionId}`,
          },
          ({ new: newMessage }) => {
            if (!active || !isChatMessage(newMessage)) {
              return;
            }

            setMessages((currentMessages) => addMessage(currentMessages, newMessage));
          },
        );

      channelRef.current = sessionChannel;
      sessionChannel.subscribe((status, subscriptionError) => {
        if (!active) {
          return;
        }

        if (status === "SUBSCRIBED") {
          void (async () => {
            const { data: chatHistory, error: historyError } = await supabase
              .from("session_messages")
              .select("id, sender_id, content, created_at")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: true });

            if (historyError) {
              throw new Error(`Unable to load chat history: ${historyError.message}`);
            }
            if (!active) {
              return;
            }

            for (const message of chatHistory ?? []) {
              if (isChatMessage(message)) {
                setMessages((currentMessages) => addMessage(currentMessages, message));
              }
            }
            setConnectionStatus("connected");
          })().catch((error: unknown) => {
            console.error("Unable to connect to tutoring chat", error);
            if (active) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "An unexpected error prevented the chat from connecting.",
              );
              setConnectionStatus("error");
            }
          });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Tutoring chat channel disconnected", subscriptionError);
          setErrorMessage(
            subscriptionError?.message ??
              "The tutoring chat connection was interrupted. Please reload the page.",
          );
          setConnectionStatus("error");
        }
      });
    }

    connect().catch((error: unknown) => {
      console.error("Unable to initialize tutoring chat", error);
      if (active) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "An unexpected error prevented the chat from connecting.",
        );
        setConnectionStatus("error");
      }
    });

    return () => {
      active = false;
      channelRef.current = null;
      if (sessionChannel) {
        void sessionChannel.unsubscribe().then((status) => {
          if (status !== "ok") {
            console.error("Unable to clean up tutoring chat channel", status);
          }
        });
      }
    };
  }, [sessionId, sessionRole]);

  async function handleSend(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !userId || !role || connectionStatus !== "connected") {
      return;
    }

    setErrorMessage("");
    setIsSending(true);
    try {
      const { data: message, error } = await getSupabaseBrowserClient()
        .from("session_messages")
        .insert({ session_id: sessionId, sender_id: userId, content })
        .select("id, sender_id, content, created_at")
        .single();

      if (error) {
        throw new Error(`Unable to send your message: ${error.message}`);
      }
      if (!isChatMessage(message)) {
        throw new Error("The chat did not return the saved message.");
      }

      setMessages((currentMessages) => addMessage(currentMessages, message));
      setDraft("");
    } catch (error: unknown) {
      console.error("Unable to send tutoring chat message", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error prevented your message from being sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (connectionStatus === "checking" || connectionStatus === "connecting") {
    return (
      <section
        className={styles.utility_caf71e34}
        data-printable="chat"
      >
        <div className={styles.utility_1eb54dfc}>
          <h2 className={styles.utility_65f0c2de}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className={styles.utility_771662c5} role="status">
          {connectionStatus === "checking" ? "Checking your sign-in..." : "Connecting to session chat..."}
        </p>
      </section>
    );
  }

  if (connectionStatus === "signed-out") {
    return (
      <section
        className={styles.utility_caf71e34}
        data-printable="chat"
      >
        <div className={styles.utility_1eb54dfc}>
          <h2 className={styles.utility_65f0c2de}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p className={styles.utility_771662c5}>
          Sign in as a student or tutor to join this chat.
        </p>
        <Link className={styles.utility_9325e48a} href="/">
          Go to sign in
        </Link>
      </section>
    );
  }

  if (!role || !userId) {
    return (
      <section
        className={styles.utility_caf71e34}
        data-printable="chat"
      >
        <div className={styles.utility_1eb54dfc}>
          <h2 className={styles.utility_65f0c2de}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className={styles.utility_e3189795} role="alert">
          {errorMessage || "Unable to verify your tutoring session."}
        </p>
        <Link className={styles.utility_9325e48a} href="/">
          Return to sign in
        </Link>
      </section>
    );
  }

  return (
    <section
      className={styles.utility_7c015883}
      data-printable="chat"
    >
      <div className={styles.utility_2f314fe2}>
        <div className={styles.utility_0a400a51}>
          <span className={styles.utility_451f34ab}>
            Student: {participantEmails.student ?? "waiting"}
          </span>
          <span className={styles.utility_451f34ab}>
            Tutor: {participantEmails.tutor ?? "waiting"}
          </span>
        </div>
        <span className={styles.utility_7f2a3b5d}>
          <span
            aria-hidden="true"
            className={[styles.utility_7efd8137, (connectionStatus === "connected" ? styles.utility_6f845a7c : styles.utility_177b8260)].filter(Boolean).join(" ")}
          />
          {connectionStatus === "connected" ? "Connected" : "Connection issue"}
        </span>
        <PrintButton display="chat" label="chat" />
      </div>

      <div
        aria-live="polite"
        className={styles.utility_db0c72e6}
        data-chat-messages
        role="log"
        aria-label="Session chat messages"
      >
        {messages.length === 0 ? (
          <p className={styles.utility_be9ed4e9}>No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              data-chat-message
              className={[styles.utility_a3acd195, (message.sender_id === userId ? styles.utility_8edadd74 : styles.utility_2e7b46b6)].filter(Boolean).join(" ")}
            >
              <p className={styles.utility_4eaebe87}>
                {message.sender_id === userId ? role : peerRole}
              </p>
              <p className={styles.utility_170cee3f}>{message.content}</p>
            </div>
          ))
        )}
      </div>

      <form
        className={styles.utility_a4fa6ef5}
        data-print-hide
        onSubmit={handleSend}
      >
        <input
          aria-label="Message in session chat"
          className={styles.utility_4c0449f9}
          disabled={connectionStatus !== "connected" || isSending}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message..."
          value={draft}
        />
        <button
          aria-label="Send message"
          className={styles.utility_eb6b19d1}
          disabled={!draft.trim() || connectionStatus !== "connected" || isSending}
          type="submit"
        >
          <Send aria-hidden="true" size={14} />
        </button>
      </form>

      {errorMessage && (
        <p aria-live="polite" className={styles.utility_0e186f5b} role="alert" data-print-hide>
          {errorMessage}
        </p>
      )}
    </section>
  );
}
