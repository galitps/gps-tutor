"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getIceServers } from "@/lib/webrtc/ice-servers";
import { useSessionParticipants } from "@/components/SessionParticipants/SessionParticipants";
import { clearLoginMode } from "@/lib/auth/login-mode";
import styles from "./VideoInterface.module.css";

type CallRole = "student" | "tutor";
type CallStatus =
  | "checking"
  | "ready"
  | "waiting"
  | "connecting"
  | "connected"
  | "error";
type Participant = {
  userId: string;
  role: CallRole;
  email: string | null;
  inCall: boolean;
};
type PresenceMetadata = {
  role?: unknown;
  email?: unknown;
  inCall?: unknown;
};
type CallSignal =
  | {
      from: string;
      to: string;
      type: "offer" | "answer";
      sdp: RTCSessionDescriptionInit;
    }
  | {
      from: string;
      to: string;
      type: "candidate";
      candidate: RTCIceCandidateInit;
    }
  | { from: string; to: string; type: "hangup" };
type OutgoingSignal =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit }
  | { type: "hangup" };
type RealtimeChannel = ReturnType<
  ReturnType<typeof getSupabaseBrowserClient>["channel"]
>;

function isCallRole(value: unknown): value is CallRole {
  return value === "student" || value === "tutor";
}

function isSessionDescription(value: unknown): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === "offer" || candidate.type === "answer") &&
    (candidate.sdp === undefined || typeof candidate.sdp === "string")
  );
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.candidate === "string";
}

function isCallSignal(value: unknown): value is CallSignal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.from !== "string" ||
    typeof candidate.to !== "string"
  ) {
    return false;
  }

  if (candidate.type === "hangup") {
    return true;
  }
  if (
    candidate.type === "offer" ||
    candidate.type === "answer"
  ) {
    return isSessionDescription(candidate.sdp);
  }
  return candidate.type === "candidate" && isIceCandidate(candidate.candidate);
}

function emailId(email: string | null): string {
  if (!email) {
    return "email unavailable";
  }
  return email.split("@", 1)[0] || email;
}

function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Allow camera and microphone access in your browser, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera or microphone was found on this device.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Your camera or microphone is already in use by another app.";
    }
  }
  return error instanceof Error
    ? error.message
    : "Unable to start your camera and microphone.";
}

export default function VideoInterface({
  sessionId,
  sessionRole,
}: {
  sessionId: string;
  sessionRole: CallRole;
}) {
  const [role, setRole] = useState<CallRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participants, setParticipants] = useState<
    Partial<Record<CallRole, Participant>>
  >({});
  const [callStatus, setCallStatus] = useState<CallStatus>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { setParticipantEmails } = useSessionParticipants();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const emailRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const roleRef = useRef<CallRole | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const peerInCallRef = useRef(false);
  const inCallRef = useRef(false);
  const offerStartedRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sendSignalRef = useRef<((signal: OutgoingSignal) => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const closePeerConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingCandidatesRef.current = [];
    offerStartedRef.current = false;
    setRemoteStream(null);
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  useEffect(() => {
    let active = true;
    let sessionChannel: RealtimeChannel | null = null;

    async function sendSignal(signal: OutgoingSignal): Promise<void> {
      const currentChannel = channelRef.current;
      const from = userIdRef.current;
      const to = peerIdRef.current;
      if (!currentChannel || !from || !to) {
        throw new Error("The other participant is not connected to the session.");
      }

      const result = await currentChannel.send({
        type: "broadcast",
        event: "webrtc-signal",
        payload: { ...signal, from, to },
      });
      if (result !== "ok") {
        throw new Error(`Unable to send call signaling data: ${result}`);
      }
    }
    sendSignalRef.current = sendSignal;

    function createPeerConnection(): RTCPeerConnection {
      if (peerConnectionRef.current) {
        return peerConnectionRef.current;
      }
      const stream = localStreamRef.current;
      if (!stream) {
        throw new Error("Start your camera and microphone before joining the call.");
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: getIceServers(),
      });
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });
      peerConnection.ontrack = (event) => {
        const [streamFromPeer] = event.streams;
        if (streamFromPeer) {
          setRemoteStream(streamFromPeer);
        }
      };
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            type: "candidate",
            candidate: event.candidate.toJSON(),
          }).catch((error: unknown) => {
            console.error("Unable to send WebRTC ICE candidate", error);
            if (active) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to establish the call connection.",
              );
              setCallStatus("error");
            }
          });
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (!active) {
          return;
        }
        if (peerConnection.connectionState === "connected") {
          setErrorMessage("");
          setCallStatus("connected");
        } else if (peerConnection.connectionState === "failed") {
          setErrorMessage(
            "The call could not connect. Check the ICE server configuration or network restrictions.",
          );
          setCallStatus("error");
        } else if (
          peerConnection.connectionState === "connecting" ||
          peerConnection.connectionState === "new"
        ) {
          setCallStatus("connecting");
        }
      };

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    }

    async function flushPendingCandidates(
      peerConnection: RTCPeerConnection,
    ): Promise<void> {
      const candidates = pendingCandidatesRef.current.splice(0);
      for (const candidate of candidates) {
        await peerConnection.addIceCandidate(candidate);
      }
    }

    async function startTutorOffer(): Promise<void> {
      if (
        roleRef.current !== "tutor" ||
        !inCallRef.current ||
        !peerInCallRef.current ||
        !peerIdRef.current ||
        peerConnectionRef.current ||
        offerStartedRef.current
      ) {
        return;
      }

      offerStartedRef.current = true;
      setCallStatus("connecting");
      try {
        const peerConnection = createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (!peerConnection.localDescription) {
          throw new Error("The browser did not create a call offer.");
        }
        await sendSignal({
          type: "offer",
          sdp: peerConnection.localDescription,
        });
      } catch (error: unknown) {
        console.error("Unable to start tutoring call", error);
        offerStartedRef.current = false;
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to start the call.",
          );
          setCallStatus("error");
        }
        closePeerConnection();
      }
    }

    async function handleSignal(payload: unknown): Promise<void> {
      if (!isCallSignal(payload)) {
        return;
      }
      const currentUserId = userIdRef.current;
      if (
        !currentUserId ||
        payload.from === currentUserId ||
        payload.to !== currentUserId ||
        (peerIdRef.current && payload.from !== peerIdRef.current)
      ) {
        return;
      }

      if (payload.type === "hangup") {
        inCallRef.current = false;
        closePeerConnection();
        stopLocalStream();
        setCallStatus("waiting");
        const currentUserId = userIdRef.current;
        const currentRole = roleRef.current;
        if (sessionChannel && currentUserId && currentRole) {
          const result = await sessionChannel.track({
            userId: currentUserId,
            role: currentRole,
            email: emailRef.current,
            inCall: false,
          });
          if (result !== "ok") {
            throw new Error(`Unable to update call presence after hangup: ${result}`);
          }
        }
        return;
      }

      if (!localStreamRef.current) {
        return;
      }

      try {
        if (payload.type === "offer") {
          if (roleRef.current !== "student") {
            return;
          }
          const peerConnection = createPeerConnection();
          await peerConnection.setRemoteDescription(payload.sdp);
          await flushPendingCandidates(peerConnection);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          if (!peerConnection.localDescription) {
            throw new Error("The browser did not create a call answer.");
          }
          await sendSignal({
            type: "answer",
            sdp: peerConnection.localDescription,
          });
          setCallStatus("connecting");
        } else if (payload.type === "answer") {
          const peerConnection = peerConnectionRef.current;
          if (
            roleRef.current !== "tutor" ||
            !peerConnection ||
            peerConnection.signalingState !== "have-local-offer"
          ) {
            return;
          }
          await peerConnection.setRemoteDescription(payload.sdp);
          await flushPendingCandidates(peerConnection);
        } else if (payload.type === "candidate") {
          const peerConnection = peerConnectionRef.current;
          if (!peerConnection?.remoteDescription) {
            pendingCandidatesRef.current.push(payload.candidate);
          } else {
            await peerConnection.addIceCandidate(payload.candidate);
          }
        }
      } catch (error: unknown) {
        console.error("Unable to process WebRTC signaling data", error);
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to establish the call connection.",
          );
          setCallStatus("error");
        }
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
        throw new Error("Sign in as a student or tutor to join the session.");
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

      userIdRef.current = user.id;
      roleRef.current = sessionRole;
      emailRef.current = user.email ?? null;
      setRole(sessionRole);
      setEmail(user.email ?? null);

      sessionChannel = supabase
        .channel(`session:${sessionId}:call`, {
          config: {
            private: true,
            presence: { key: user.id },
          },
        })
        .on("presence", { event: "sync" }, () => {
          if (!active || !sessionChannel) {
            return;
          }

          const presence =
            sessionChannel.presenceState<PresenceMetadata>();
          const currentParticipants: Partial<Record<CallRole, Participant>> = {};
          for (const [participantId, instances] of Object.entries(presence)) {
            if (participantId === user.id) {
              continue;
            }
            for (const instance of instances) {
              if (!isCallRole(instance.role)) {
                continue;
              }
              const existing = currentParticipants[instance.role];
              currentParticipants[instance.role] = {
                userId: participantId,
                role: instance.role,
                email:
                  typeof instance.email === "string"
                    ? instance.email
                    : existing?.email ?? null,
                inCall: instance.inCall === true || existing?.inCall === true,
              };
            }
          }
          setParticipants(currentParticipants);
          setParticipantEmails({
            student:
              sessionRole === "student"
                ? user.email ?? null
                : currentParticipants.student?.email ?? null,
            tutor:
              sessionRole === "tutor"
                ? user.email ?? null
                : currentParticipants.tutor?.email ?? null,
          });

          const otherRole = sessionRole === "student" ? "tutor" : "student";
          const peer = currentParticipants[otherRole];
          peerIdRef.current = peer?.userId ?? null;
          peerInCallRef.current = peer?.inCall ?? false;

          if (inCallRef.current) {
            if (peer?.inCall) {
              if (sessionRole === "tutor") {
                void startTutorOffer();
              }
            } else if (!peerConnectionRef.current) {
              setCallStatus("waiting");
            }
          }
        })
        .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
          void handleSignal(payload).catch((error: unknown) => {
            console.error("Unable to handle WebRTC signal", error);
            if (active) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to update the call connection.",
              );
              setCallStatus("error");
            }
          });
        });

      channelRef.current = sessionChannel;
      sessionChannel.subscribe((status, subscriptionError) => {
        if (!active) {
          return;
        }
        if (status === "SUBSCRIBED") {
          void sessionChannel
            ?.track({
              userId: user.id,
              role: sessionRole,
              email: user.email,
              inCall: false,
            })
            .then((result) => {
              if (result !== "ok") {
                throw new Error(`Unable to publish call presence: ${result ?? "no response"}`);
              }
              if (active) {
                setCallStatus("ready");
              }
            })
            .catch((error: unknown) => {
              console.error("Unable to publish call presence", error);
              if (active) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "Unable to join the call session.",
                );
                setCallStatus("error");
              }
            });
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error("WebRTC signaling channel disconnected", subscriptionError);
          setErrorMessage(
            subscriptionError?.message ??
              "The call signaling connection was interrupted. Please reload the page.",
          );
          setCallStatus("error");
        }
      });
    }

    connect().catch((error: unknown) => {
      console.error("Unable to initialize call controls", error);
      if (active) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to initialize the camera and microphone.",
        );
        setCallStatus("error");
      }
    });

    return () => {
      active = false;
      channelRef.current = null;
      sendSignalRef.current = null;
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (sessionChannel) {
        void sessionChannel.unsubscribe().then((status) => {
          if (status !== "ok") {
            console.error("Unable to clean up call signaling channel", status);
          }
        });
      }
    };
  }, [
    closePeerConnection,
    sessionId,
    sessionRole,
    setParticipantEmails,
    stopLocalStream,
  ]);

  async function startCall(): Promise<void> {
    if (isStarting || localStreamRef.current) {
      return;
    }
    setErrorMessage("");
    setIsStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone access requires HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      inCallRef.current = true;
      setCallStatus("waiting");

      const channel = channelRef.current;
      const userId = userIdRef.current;
      const currentRole = roleRef.current;
      if (!channel || !userId || !currentRole) {
        throw new Error("The call signaling connection is not ready. Please try again.");
      }
      const result = await channel.track({
        userId,
        role: currentRole,
        email,
        inCall: true,
      });
      if (result !== "ok") {
        throw new Error(`Unable to publish call presence: ${result}`);
      }
      if (currentRole === "tutor" && peerInCallRef.current) {
        // The presence event can arrive before the local track update resolves.
        setCallStatus("connecting");
      }
    } catch (error: unknown) {
      console.error("Unable to start camera and microphone", error);
      const presenceNeedsReset = inCallRef.current;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      inCallRef.current = false;
      setCallStatus("error");
      let message = mediaErrorMessage(error);
      const channel = channelRef.current;
      const userId = userIdRef.current;
      const currentRole = roleRef.current;
      if (presenceNeedsReset && channel && userId && currentRole) {
        try {
          const result = await channel.track({
            userId,
            role: currentRole,
            email,
            inCall: false,
          });
          if (result !== "ok") {
            throw new Error(`Unable to clear call presence: ${result}`);
          }
        } catch (resetError: unknown) {
          console.error("Unable to clear call presence after call start failed", resetError);
          message += ` Call presence could not be cleared: ${
            resetError instanceof Error ? resetError.message : "unknown error"
          }`;
        }
      }
      setErrorMessage(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function endCall(notifyPeer = true): Promise<void> {
    inCallRef.current = false;
    closePeerConnection();
    stopLocalStream();
    setErrorMessage("");
    setCallStatus("waiting");

    let hangupError = "";
    if (notifyPeer && peerIdRef.current) {
      try {
        const sendSignal = sendSignalRef.current;
        if (!sendSignal) {
          throw new Error("The call signaling connection is unavailable.");
        }
        await sendSignal({ type: "hangup" });
      } catch (error: unknown) {
        console.error("Unable to notify the other participant that the call ended", error);
        hangupError =
          error instanceof Error
            ? `The call ended locally, but the other participant could not be notified: ${error.message}`
            : "The call ended locally, but the other participant could not be notified.";
      }
    }
    if (hangupError) {
      setErrorMessage(hangupError);
      setCallStatus("error");
    }

    const channel = channelRef.current;
    const userId = userIdRef.current;
    const currentRole = roleRef.current;
    if (channel && userId && currentRole) {
      try {
        const result = await channel.track({
          userId,
          role: currentRole,
          email,
          inCall: false,
        });
        if (result !== "ok") {
          throw new Error(`Unable to update call presence after ending call: ${result}`);
        }
      } catch (error: unknown) {
        console.error("Unable to update call presence after ending call", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to update call presence after ending the call.",
        );
        setCallStatus("error");
      }
    }
  }

  async function endCallAndSignOut(): Promise<void> {
    setIsSigningOut(true);
    await endCall();

    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        throw new Error(`Call ended, but sign-out failed: ${error.message}`);
      }
      clearLoginMode();
      window.location.replace("/");
    } catch (error: unknown) {
      console.error("Unable to sign out after ending call", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The call ended, but sign-out failed. Please try again.",
      );
      setCallStatus("error");
      setIsSigningOut(false);
    }
  }

  function toggleMute(): void {
    const enabled = isMuted;
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = enabled));
    setIsMuted(!enabled);
  }

  function toggleVideo(): void {
    const enabled = isVideoOff;
    localStreamRef.current
      ?.getVideoTracks()
      .forEach((track) => (track.enabled = enabled));
    setIsVideoOff(!enabled);
  }

  const callStatusText: Record<CallStatus, string> = {
    checking: "Checking sign-in...",
    ready: "Ready to join",
    waiting: "Waiting for the other participant",
    connecting: "Connecting call...",
    connected: "Call connected",
    error: errorMessage || "Call unavailable",
  };

  function participantLabel(tileRole: CallRole): string {
    if (tileRole === role) {
      return `${emailId(email)} (${tileRole})`;
    }
    const participant = participants[tileRole];
    return participant
      ? `${emailId(participant.email)} (${tileRole})`
      : `waiting (${tileRole})`;
  }

  if (!role && callStatus === "error") {
    return (
      <section className={styles.utility_7bd9cb86}>
        <p aria-live="polite" className={styles.utility_33489aae} role="alert">
          {errorMessage}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.utility_f3e6ce6e}>
      <p
        aria-live="polite"
        className={[styles.utility_415c96d2, (callStatus === "error" ? styles.utility_1529a707 : styles.utility_8d44cef3)].filter(Boolean).join(" ")}
        role={callStatus === "error" ? "alert" : "status"}
        title={callStatusText[callStatus]}
      >
        {callStatusText[callStatus]}
      </p>

      <div className={styles.utility_69026345}>
        {(["student", "tutor"] as const).map((tileRole) => {
          const isLocal = tileRole === role;
          const stream = isLocal ? localStream : remoteStream;
          const videoOff = isLocal ? isVideoOff : !stream;
          return (
            <div
              key={tileRole}
              className={styles.utility_f8b7da2b}
            >
              {stream && !videoOff ? (
                <video
                  ref={isLocal ? localVideoRef : remoteVideoRef}
                  autoPlay
                  className={[styles.utility_9f049a30, (isLocal ? "" : styles.utility_76fc8214)].filter(Boolean).join(" ")}
                  muted={isLocal}
                  playsInline
                />
              ) : (
                <div className={styles.utility_7e67af05}>
                  <VideoOff aria-hidden="true" className={styles.utility_3a33b9b0} />
                  <span className={styles.utility_7d2ed93d}>
                    {isLocal && !localStream
                      ? "Camera off"
                      : tileRole === role
                        ? "Camera off"
                        : "Waiting for video"}
                  </span>
                </div>
              )}
              <div className={styles.utility_b0b2f4e0}>
                {participantLabel(tileRole)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.utility_a3536e51}>
        <button
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          className={[styles.utility_794f783d, (isMuted ? styles.utility_7e9fdc4a : styles.utility_8650cac1)].filter(Boolean).join(" ")}
          disabled={!localStream}
          onClick={toggleMute}
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
          type="button"
        >
          {isMuted ? <MicOff aria-hidden="true" className={styles.utility_a7e4e66f} /> : <Mic aria-hidden="true" className={styles.utility_a7e4e66f} />}
        </button>

        <button
          aria-label={isVideoOff ? "Turn camera on" : "Turn camera off"}
          className={[styles.utility_794f783d, (isVideoOff ? styles.utility_7e9fdc4a : styles.utility_8650cac1)].filter(Boolean).join(" ")}
          disabled={!localStream}
          onClick={toggleVideo}
          title={isVideoOff ? "Turn camera on" : "Turn camera off"}
          type="button"
        >
          {isVideoOff ? <VideoOff aria-hidden="true" className={styles.utility_a7e4e66f} /> : <Video aria-hidden="true" className={styles.utility_a7e4e66f} />}
        </button>

        {!localStream && (
          <button
            aria-label="Start call"
            className={styles.utility_47bb3102}
            disabled={!role || isStarting || callStatus === "checking"}
            onClick={() => void startCall()}
            title="Start camera and microphone"
            type="button"
          >
            {isStarting ? (
              <LoaderCircle aria-hidden="true" className={styles.utility_afd31a31} />
            ) : (
              <Phone aria-hidden="true" className={styles.utility_a7e4e66f} />
            )}
          </button>
        )}
        <button
          aria-label="End call and sign out"
          className={styles.utility_2e26fd2f}
          disabled={isSigningOut}
          onClick={() => void endCallAndSignOut()}
          title="End call and sign out"
          type="button"
        >
          {isSigningOut ? (
            <LoaderCircle aria-hidden="true" className={styles.utility_afd31a31} />
          ) : (
            <PhoneOff aria-hidden="true" className={styles.utility_a7e4e66f} />
          )}
        </button>
      </div>
    </section>
  );
}
