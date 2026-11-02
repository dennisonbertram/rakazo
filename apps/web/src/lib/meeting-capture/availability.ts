import type { MeetingRecordingPolicy } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { rpc } from "../rpc";

export type RecordAvailability =
  | { loaded: false }
  | { loaded: true; policy: MeetingRecordingPolicy; engine: boolean };

/** Whether this person may start a recording here: the space policy and a speech-to-text engine. */
export function useRecordAvailability(): RecordAvailability {
  const [state, setState] = useState<RecordAvailability>({ loaded: false });
  useEffect(() => {
    let live = true;
    void (async () => {
      const [voice, spaces] = await Promise.all([rpc.voice.status(), rpc.spaces.list()]);
      if (!live) return;
      const space = spaces.spaces.find((item) => item.id === spaces.current.id);
      setState({
        loaded: true,
        // A server that does not report a policy is an older one: reminding is its behavior.
        policy: space?.meetingRecording ?? "remind",
        // The server transcribes only for a provider this person agreed to send audio to, here.
        engine:
          Boolean(voice.transcribe || voice.transcriptionReady) &&
          voice.transcriptionConsented !== false,
      });
    })().catch(() => undefined); // Without an answer Record stays hidden; the page does not need it.
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Tab audio needs getDisplayMedia with audio, which only Chrome and Edge on a computer offer. */
export function tabAudioSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getDisplayMedia) return false;
  const agent = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  return /Chrome\//.test(agent) && !/Mobile|Android/i.test(agent);
}
