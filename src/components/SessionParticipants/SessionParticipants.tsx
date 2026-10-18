"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SessionRole = "student" | "tutor";
export type SessionParticipantEmails = Record<SessionRole, string | null>;

type SessionParticipantsContextValue = {
  participantEmails: SessionParticipantEmails;
  setParticipantEmails: (emails: SessionParticipantEmails) => void;
};

const SessionParticipantsContext =
  createContext<SessionParticipantsContextValue | null>(null);

export function SessionParticipantsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [participantEmails, setParticipantEmails] =
    useState<SessionParticipantEmails>({ student: null, tutor: null });

  return (
    <SessionParticipantsContext.Provider
      value={{ participantEmails, setParticipantEmails }}
    >
      {children}
    </SessionParticipantsContext.Provider>
  );
}

export function useSessionParticipants(): SessionParticipantsContextValue {
  const context = useContext(SessionParticipantsContext);
  if (!context) {
    throw new Error(
      "useSessionParticipants must be used within SessionParticipantsProvider.",
    );
  }
  return context;
}
