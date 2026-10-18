"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
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
        className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4"
        data-printable="chat"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className="mt-3 text-sm text-slate-400" role="status">
          {connectionStatus === "checking" ? "Checking your sign-in..." : "Connecting to session chat..."}
        </p>
      </section>
    );
  }

  if (connectionStatus === "signed-out") {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4"
        data-printable="chat"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Sign in as a student or tutor to join this chat.
        </p>
        <Link className="mt-3 text-sm font-medium text-sky-300 hover:text-sky-200" href="/">
          Go to sign in
        </Link>
      </section>
    );
  }

  if (!role || !userId) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4"
        data-printable="chat"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Session chat</h2>
          <PrintButton display="chat" label="chat" />
        </div>
        <p aria-live="polite" className="mt-3 text-sm text-red-300" role="alert">
          {errorMessage || "Unable to verify your tutoring session."}
        </p>
        <Link className="mt-3 text-sm font-medium text-sky-300 hover:text-sky-200" href="/">
          Return to sign in
        </Link>
      </section>
    );
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
      data-printable="chat"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          <span className="break-all">
            Student: {participantEmails.student ?? "waiting"}
          </span>
          <span className="break-all">
            Tutor: {participantEmails.tutor ?? "waiting"}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${connectionStatus === "connected" ? "bg-emerald-400" : "bg-red-400"}`}
          />
          {connectionStatus === "connected" ? "Connected" : "Connection issue"}
        </span>
        <PrintButton display="chat" label="chat" />
      </div>

      <div
        aria-live="polite"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        data-chat-messages
        role="log"
        aria-label="Session chat messages"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              data-chat-message
              className={`max-w-[95%] rounded-lg px-3 py-2 text-xs ${
                message.sender_id === userId
                  ? "ml-auto bg-sky-900/60 text-sky-100"
                  : "bg-slate-800 text-slate-200"
              }`}
            >
              <p className="mb-0.5 text-[10px] font-medium capitalize text-slate-400">
                {message.sender_id === userId ? role : peerRole}
              </p>
              <p className="break-words">{message.content}</p>
            </div>
          ))
        )}
      </div>

      <form
        className="flex gap-2 border-t border-slate-800 p-3"
        data-print-hide
        onSubmit={handleSend}
      >
        <input
          aria-label="Message in session chat"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500 disabled:opacity-50"
          disabled={connectionStatus !== "connected" || isSending}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message..."
          value={draft}
        />
        <button
          aria-label="Send message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-700 text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!draft.trim() || connectionStatus !== "connected" || isSending}
          type="submit"
        >
          <Send aria-hidden="true" size={14} />
        </button>
      </form>

      {errorMessage && (
        <p aria-live="polite" className="mx-3 mb-3 rounded-md bg-red-950/60 px-3 py-2 text-xs text-red-200" role="alert" data-print-hide>
          {errorMessage}
        </p>
      )}
    </section>
  );
}
