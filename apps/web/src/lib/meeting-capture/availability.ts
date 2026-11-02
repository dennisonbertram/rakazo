import type { MeetingRecordingPolicy } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { desktopBridge } from "../desktop";
import { useDeviceSpeech } from "../device-speech";
import { rpc } from "../rpc";

export type RecordAvailability =
  | { loaded: false }
  | { loaded: true; policy: MeetingRecordingPolicy; engine: boolean; device: boolean };

/** The server transcribes only for a provider this person agreed to send audio to, here. */
export function serverTranscribes(voice: {
  transcribe?: boolean;
  transcriptionReady?: boolean;
  transcriptionConsented?: boolean;
}): boolean {
  return (
    Boolean(voice.transcribe || voice.transcriptionReady) && voice.transcriptionConsented !== false
  );
}

/** Whether this person may start a recording here: the space policy and a speech-to-text engine. */
export function useRecordAvailability(): RecordAvailability {
  const deviceReady = useDeviceSpeech()?.state === "ready";
  const [state, setState] = useState<{
    policy: MeetingRecordingPolicy;
    server: boolean;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [voice, spaces] = await Promise.all([rpc.voice.status(), rpc.spaces.list()]);
      if (!live) return;
      const space = spaces.spaces.find((item) => item.id === spaces.current.id);
      setState({
        // A server that does not report a policy is an older one: reminding is its behavior.
        policy: space?.meetingRecording ?? "remind",
        // The server transcribes only for a provider this person agreed to send audio to, here.
        server: serverTranscribes(voice),
      });
    })().catch(() => undefined); // Without an answer Record stays hidden; the page does not need it.
    return () => {
      live = false;
    };
  }, []);
  if (!state) return { loaded: false };
  // On-device speech sends no audio anywhere, so the transcription consent does not gate it.
  return {
    loaded: true,
    policy: state.policy,
    engine: state.server || deviceReady,
    device: deviceReady,
  };
}

/** Tab audio needs getDisplayMedia with audio, which only Chrome and Edge on a computer offer. */
export function tabAudioSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getDisplayMedia) return false;
  const agent = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  return /Chrome\//.test(agent) && !/Mobile|Android/i.test(agent);
}

/** The desktop app records system audio ("Them") itself on macOS and Windows; no tab is picked. */
export function systemAudioSupported(): boolean {
  const platform = desktopBridge()?.platform;
  return platform === "darwin" || platform === "win32";
}
