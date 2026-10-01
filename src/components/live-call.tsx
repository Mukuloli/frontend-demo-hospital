"use client";

import { useCallback, useEffect, useRef } from "react";
import { BarVisualizer, LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useVoiceAssistant } from "@livekit/components-react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

type Props = {
  credentials: { server_url: string; token: string };
  onEnd: () => void;
  onError: (message: string) => void;
  onStatus: (state: string) => void;
};

/** Generates a phone-style ring tone using Web Audio API */
function useRingtone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const playBurst = () => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      gain.gain.value = 0.08;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
    };

    playBurst();
    intervalRef.current = setInterval(playBurst, 2800);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { start, stop };
}

function CallContent({ onEnd, onStatus }: Omit<Props, "credentials" | "onError">) {
  const { state, audioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const ring = useRingtone();

  useEffect(() => { onStatus(state); }, [state, onStatus]);

  useEffect(() => {
    if (state === "connecting" || state === "initializing") {
      ring.start();
    } else {
      ring.stop();
    }
  }, [state, ring]);

  useEffect(() => {
    if (state !== "connecting") return;
    const timer = setTimeout(() => onStatus("Unable to connect right now. Please contact reception for help."), 20000);
    return () => clearTimeout(timer);
  }, [state, onStatus]);

  return <div className="live-controls">
    {audioTrack && <BarVisualizer state={state} trackRef={audioTrack} barCount={5} className="live-bars" />}
    <button className="round-control" onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)} aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}>
      {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
    </button>
    <button className="end-button" onClick={onEnd}><PhoneOff size={18} /> End call</button>
  </div>;
}

export default function LiveCall(props: Props) {
  return <LiveKitRoom token={props.credentials.token} serverUrl={props.credentials.server_url} connect audio video={false}
    onDisconnected={props.onEnd} onError={e => props.onError(e.message)}>
    <RoomAudioRenderer />
    <CallContent {...props} />
  </LiveKitRoom>;
}
