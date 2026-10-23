"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Alignment } from "@/lib/align";
import type { TimedWord } from "./word-feedback";
import { localeFor } from "@/content/voices";

export interface SpeechConfig {
  mode: "server" | "browser" | "none";
  provider: string;
  pronunciation: boolean;
  simulated: boolean;
}

export interface SpeakingAttemptResult {
  id: string;
  transcript: string;
  provider: string;
  providerLabel: string;
  assessmentType: "PRONUNCIATION_ASSESSMENT" | "TRANSCRIPT_COMPARISON" | "SELF_REVIEW";
  isSimulated: boolean;
  matchScore: number | null;
  alignment: Alignment | null;
  timings: TimedWord[];
  pronunciation: {
    accuracy?: number;
    fluency?: number;
    completeness?: number;
    prosody?: number;
    overall?: number;
    words?: { word: string; accuracy: number; errorType?: string }[];
  } | null;
  feedback: { summary: string; tips: string[]; caveat: string };
  audioUrl: string | null;
}


type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function Recorder({
  language,
  targetText,
  context,
  sourceId,
  speech,
  onResult,
  maxSeconds = 30,
  compact = false,
}: {
  language: string;
  targetText?: string;
  context: "SENTENCE" | "EXERCISE" | "FREE" | "CONVERSATION";
  sourceId?: string;
  speech: SpeechConfig;
  onResult: (r: SpeakingAttemptResult) => void;
  maxSeconds?: number;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "processing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(16).fill(0));
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recogRef = useRef<SR | null>(null);
  const transcriptRef = useRef<string>("");
  const startedAt = useRef(0);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    try {
      recogRef.current?.stop();
    } catch {}
  }, []);

  useEffect(() => () => {
    cleanup();
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [cleanup, localUrl]);

  const upload = useCallback(
    async (blob: Blob, durationMs: number) => {
      setState("processing");
      const form = new FormData();
      form.append("audio", blob, "recording");
      form.append("language", language);
      form.append("context", context);
      form.append("durationMs", String(durationMs));
      if (targetText) form.append("targetText", targetText);
      if (sourceId) form.append("sourceId", sourceId);
      if (transcriptRef.current) form.append("browserTranscript", transcriptRef.current);
      try {
        const res = await api<{ attempt: SpeakingAttemptResult }>("/api/speech/attempts", { form });
        setState("done");
        onResult(res.attempt);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "We couldn't process your recording. Please try again.");
        setState("idle");
      }
    },
    [language, context, targetText, sourceId, onResult],
  );

  const stop = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Your browser doesn't support audio recording. Try a recent version of Chrome, Edge, Firefox or Safari.");
      return;
    }
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (err) {
      const name = (err as DOMException).name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow microphone access for this site in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : "We couldn't start the microphone. Close other apps that may be using it and try again.",
      );
      setState("idle");
      return;
    }
    streamRef.current = stream;
    chunks.current = [];
    transcriptRef.current = "";
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRef.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const duration = Date.now() - startedAt.current;
      cleanup();
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      if (localUrl) URL.revokeObjectURL(localUrl);
      setLocalUrl(URL.createObjectURL(blob));
      if (duration < 600 || blob.size < 1500) {
        setError("That recording was too short. Hold the button a little longer and speak clearly.");
        setState("idle");
        return;
      }
      // Give the browser recogniser a moment to deliver its final result.
      setTimeout(() => void upload(blob, duration), speech.mode === "browser" ? 400 : 0);
    };

    // Level meter
    try {
      const ac = new AudioContext();
      ctxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevels((l) => [...l.slice(1), rms]);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}

    // Browser speech recognition (used only when no server recogniser is configured).
    if (speech.mode === "browser") {
      const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
      if (Ctor) {
        const r = new Ctor();
        r.lang = localeFor(language);
        r.continuous = true;
        r.interimResults = false;
        r.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i]!.isFinal) transcriptRef.current = `${transcriptRef.current} ${e.results[i]![0].transcript}`.trim();
          }
        };
        r.onerror = () => {};
        try {
          r.start();
          recogRef.current = r;
        } catch {}
      }
    }

    rec.start(250);
    startedAt.current = Date.now();
    setElapsed(0);
    setState("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(s);
      if (s >= maxSeconds) stop();
    }, 200);
  }, [cleanup, language, localUrl, maxSeconds, speech.mode, stop, upload]);

  const browserUnsupported =
    speech.mode === "browser" &&
    typeof window !== "undefined" &&
    !("SpeechRecognition" in window) &&
    !("webkitSpeechRecognition" in window);

  return (
    <div className={cn("rounded-xl border border-line bg-white", compact ? "p-3" : "p-4")}>
      {error && (
        <Alert tone="warning" className="mb-3" icon={<MicOff className="h-4 w-4" />}>
          {error}
        </Alert>
      )}
      {(speech.mode === "none" || browserUnsupported) && state === "idle" && !error && (
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Automatic speech recognition isn&apos;t available here, so you can record and replay yourself to compare with the model audio, but you won&apos;t get word-by-word feedback.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {state === "recording" ? (
          <Button variant="danger" onClick={stop} aria-label="Stop recording">
            <Square className="h-4 w-4 fill-current" /> Stop
          </Button>
        ) : (
          <Button onClick={start} loading={state === "requesting" || state === "processing"} disabled={state === "processing"}>
            {state === "done" ? <RotateCcw className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {state === "processing" ? "Analysing…" : state === "done" ? "Record again" : "Record"}
          </Button>
        )}
        {state === "recording" && (
          <div className="flex items-center gap-3" aria-live="polite">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-600 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger-600" />
            </span>
            <span className="text-sm font-medium text-ink tabular-nums">
              0:{String(elapsed).padStart(2, "0")} <span className="text-subtle">/ 0:{String(maxSeconds).padStart(2, "0")}</span>
            </span>
            <span className="flex h-6 items-end gap-0.5" aria-hidden>
              {levels.map((l, i) => (
                <span key={i} className="w-1 rounded-full bg-navy-600 transition-[height]" style={{ height: `${Math.max(8, l * 100)}%` }} />
              ))}
            </span>
          </div>
        )}
        {localUrl && state !== "recording" && (
          <audio src={localUrl} controls className="h-9 max-w-full flex-1" aria-label="Your recording" />
        )}
      </div>
    </div>
  );
}
