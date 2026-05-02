"use client";

import { useMemo, useState } from "react";
import { SessionCard } from "./session-card";
import type { CoachingSessionListItem } from "@/lib/queries/coaching";

interface Props {
  sessions: CoachingSessionListItem[];
  driverName: string;
  isAdmin: boolean;
}

export function CoachingSessionList({ sessions, driverName, isAdmin }: Props) {
  const [showVoided, setShowVoided] = useState(false);

  const { active, voided } = useMemo(() => {
    const active: CoachingSessionListItem[] = [];
    const voided: CoachingSessionListItem[] = [];
    for (const s of sessions) {
      (s.voided_at ? voided : active).push(s);
    }
    return { active, voided };
  }, [sessions]);

  const visible = showVoided ? sessions : active;
  const hasVoided = voided.length > 0;

  return (
    <div className="space-y-3">
      {visible.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          driverName={driverName}
          isAdmin={isAdmin}
        />
      ))}

      {hasVoided && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setShowVoided((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            {showVoided
              ? `Hide ${voided.length} voided ${voided.length === 1 ? "session" : "sessions"}`
              : `Show ${voided.length} voided ${voided.length === 1 ? "session" : "sessions"}`}
          </button>
        </div>
      )}
    </div>
  );
}
