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
        className={styles.contentPanel}
        data-printable="chat"
      >
        <div className={styles.spacedRow}>
          <h2 className={styles.sessionChatHeading}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className={styles.helperText} role="status">
          {connectionStatus === "checking" ? "Checking your sign-in..." : "Connecting to session chat..."}
        </p>
      </section>
    );
  }

  if (connectionStatus === "signed-out") {
    return (
      <section
        className={styles.contentPanel}
        data-printable="chat"
      >
        <div className={styles.spacedRow}>
          <h2 className={styles.sessionChatHeading}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p className={styles.helperText}>
          Sign in as a student or tutor to join this chat.
        </p>
        <Link className={styles.textLink} href="/">
          Go to sign in
        </Link>
      </section>
    );
  }

  if (!role || !userId) {
    return (
      <section
        className={styles.contentPanel}
        data-printable="chat"
      >
        <div className={styles.spacedRow}>
          <h2 className={styles.sessionChatHeading}>Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className={styles.errorMessage} role="alert">
          {errorMessage || "Unable to verify your tutoring session."}
        </p>
        <Link className={styles.textLink} href="/">
          Return to sign in
        </Link>
      </section>
    );
  }

  return (
    <section
      className={styles.borderedContentPanel}
      data-printable="chat"
    >
      <div className={styles.chatHeader}>
        <div className={styles.participantList}>
          <span className={styles.caption}>
            Student: {participantEmails.student ?? "waiting"}
          </span>
          <span className={styles.caption}>
            Tutor: {participantEmails.tutor ?? "waiting"}
          </span>
        </div>
        <span className={styles.mutedCaption}>
          <span
            aria-hidden="true"
            className={[styles.presenceIndicator, (connectionStatus === "connected" ? styles.successCaption : styles.dangerCaption)].filter(Boolean).join(" ")}
          />
          {connectionStatus === "connected" ? "Connected" : "Connection issue"}
        </span>
        <PrintButton display="chat" label="chat" />
      </div>

      <div
        aria-live="polite"
        className={styles.chatMessageList}
        data-chat-messages
        role="log"
        aria-label="Session chat messages"
      >
        {messages.length === 0 ? (
          <p className={styles.emptyChatMessage}>No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              data-chat-message
              className={[styles.chatMessageBubble, (message.sender_id === userId ? styles.outgoingMessageBubble : styles.incomingMessageBubble)].filter(Boolean).join(" ")}
            >
              <p className={styles.messageSenderLabel}>
                {message.sender_id === userId ? role : peerRole}
              </p>
              <p className={styles.bodyText}>{message.content}</p>
            </div>
          ))
        )}
      </div>

      <form
        className={styles.formLayout}
        data-print-hide
        onSubmit={handleSend}
      >
        <input
          aria-label="Message in session chat"
          className={styles.formControl}
          disabled={connectionStatus !== "connected" || isSending}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message..."
          value={draft}
        />
        <button
          aria-label="Send message"
          className={styles.primaryButton}
          disabled={!draft.trim() || connectionStatus !== "connected" || isSending}
          type="submit"
        >
          <Send aria-hidden="true" size={14} />
        </button>
      </form>

      {errorMessage && (
        <p aria-live="polite" className={styles.dangerErrorMessage} role="alert" data-print-hide>
          {errorMessage}
        </p>
      )}
    </section>
  );
}
