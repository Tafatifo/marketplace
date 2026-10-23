"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Snail, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AudioRef } from "@/content/types";
import { localeFor } from "@/content/voices";

const BASE = process.env.NEXT_PUBLIC_AUDIO_BASE_URL || "/audio";

export function audioUrl(key: string) {
  return `${BASE}/${key}`;
}

// Only one clip plays at a time across the page.
let current: HTMLAudioElement | null = null;


export function useAudio() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    ref.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlaying(null);
  }, []);

  const play = useCallback(
    (key: string, opts: { text?: string; lang?: string; rate?: number } = {}) => {
      if (playing === key) {
        stop();
        return;
      }
      current?.pause();
      const audio = new Audio(audioUrl(key));
      if (opts.rate) audio.playbackRate = opts.rate;
      ref.current = audio;
      current = audio;
      setPlaying(key);
      audio.onended = () => setPlaying((p) => (p === key ? null : p));
      audio.onerror = () => {
        setFailed((f) => new Set(f).add(key));
        // Fall back to the device's own speech synthesis so the learner still hears the text.
        if (opts.text && typeof window !== "undefined" && window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(opts.text);
          u.lang = localeFor(opts.lang ?? "en");
          u.rate = key.endsWith("-slow.mp3") ? 0.7 : 1;
          u.onend = () => setPlaying(null);
          window.speechSynthesis.speak(u);
        } else setPlaying(null);
      };
      audio.play().catch(() => audio.onerror?.(new Event("error")));
    },
    [playing, stop],
  );

  useEffect(() => () => ref.current?.pause(), []);
  return { play, stop, playing, failed };
}

export function AudioButton({
  audio,
  text,
  lang,
  label = "Play audio",
  size = "md",
  showSlow = true,
  className,
  variant = "soft",
}: {
  audio?: AudioRef | null;
  text?: string;
  lang?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  showSlow?: boolean;
  className?: string;
  variant?: "soft" | "solid";
}) {
  const { play, playing, failed } = useAudio();
  if (!audio?.key) return null;
  const dims = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const base = variant === "solid" ? "bg-navy-900 text-white hover:bg-navy-800" : "bg-navy-50 text-navy-800 hover:bg-navy-100";
  const usedFallback = failed.has(audio.key);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => play(audio.key, { text, lang })}
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full transition-colors", dims, base)}
        aria-label={playing === audio.key ? "Stop audio" : label}
        title={usedFallback ? "Recorded audio unavailable — using your device's voice" : label}
      >
        {playing === audio.key ? <Pause className={icon} /> : <Volume2 className={icon} />}
      </button>
      {showSlow && audio.slowKey && (
        <button
          type="button"
          onClick={() => play(audio.slowKey!, { text, lang })}
          className={cn("inline-flex shrink-0 items-center justify-center rounded-full transition-colors", dims, "bg-white text-navy-700 ring-1 ring-line hover:bg-navy-50")}
          aria-label={playing === audio.slowKey ? "Stop slow audio" : "Play slowly"}
          title="Play slowly"
        >
          {playing === audio.slowKey ? <Pause className={icon} /> : <Snail className={icon} />}
        </button>
      )}
    </span>
  );
}
