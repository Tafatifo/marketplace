/**
 * Text-to-speech voices used to generate curriculum audio (see services/speech).
 * Voice ids are "<piper model>" or "<piper model>#<speaker>" for multi-speaker models.
 * Adding a language means adding its voices here and its content under /content.
 */
export interface VoiceInfo {
  id: string;
  label: string;
  gender: "f" | "m";
  locale: string;
  license: string;
  source: string;
}

/**
 * f/m voices distinguish speakers in dialogues. `solo` (default: f) reads everything that has
 * no speaker — vocabulary, examples, exercises, pronunciation items and readings.
 */
export const VOICES: Record<string, { f: VoiceInfo; m: VoiceInfo; alt?: VoiceInfo; solo?: VoiceInfo }> = {
  en: {
    f: { id: "en_US-kristin-medium", label: "Kristin (US)", gender: "f", locale: "en-US", license: "Public domain (LibriVox)", source: "https://huggingface.co/rhasspy/piper-voices" },
    m: { id: "en_US-joe-medium", label: "Joe (US)", gender: "m", locale: "en-US", license: "CC0", source: "https://huggingface.co/rhasspy/piper-voices" },
    alt: { id: "en_GB-cori-medium", label: "Cori (UK)", gender: "f", locale: "en-GB", license: "Public domain (LibriVox)", source: "https://huggingface.co/rhasspy/piper-voices" },
  },
  fr: {
    f: { id: "fr_FR-siwis-medium", label: "Siwis (France)", gender: "f", locale: "fr-FR", license: "CC BY 4.0 (SIWIS database, University of Edinburgh)", source: "https://huggingface.co/rhasspy/piper-voices" },
    m: { id: "fr_FR-upmc-medium#pierre", label: "Pierre (France)", gender: "m", locale: "fr-FR", license: "CC BY-SA 4.0 (UPMC Pierre data, MaryTTS)", source: "https://huggingface.co/rhasspy/piper-voices" },
    alt: { id: "fr_FR-upmc-medium#jessica", label: "Jessica (France)", gender: "f", locale: "fr-FR", license: "CC BY-SA 4.0 (UPMC data, MaryTTS)", source: "https://huggingface.co/rhasspy/piper-voices" },
  },
  es: {
    f: { id: "es_ES-sharvard-medium#F", label: "Sharvard F (Spain)", gender: "f", locale: "es-ES", license: "CC BY 3.0 (Sharvard corpus, University of Edinburgh)", source: "https://huggingface.co/rhasspy/piper-voices" },
    m: { id: "es_ES-davefx-medium", label: "Dave (Spain)", gender: "m", locale: "es-ES", license: "CC0", source: "https://huggingface.co/rhasspy/piper-voices" },
    alt: { id: "es_MX-ald-medium", label: "Ald (Mexico)", gender: "m", locale: "es-MX", license: "Unlicense", source: "https://huggingface.co/rhasspy/piper-voices" },
  },
  de: {
    f: { id: "de_DE-kerstin-low", label: "Kerstin (Germany)", gender: "f", locale: "de-DE", license: "CC0", source: "https://huggingface.co/rhasspy/piper-voices" },
    m: { id: "de_DE-thorsten-medium", label: "Thorsten (Germany)", gender: "m", locale: "de-DE", license: "CC0 (Thorsten-Voice)", source: "https://huggingface.co/rhasspy/piper-voices" },
  },
  // Only one open Danish voice exists. The second dialogue speaker is derived from it (formant
  // and pitch shift) and labelled as derived. The derived voice is less intelligible (audio QA:
  // mean score 0.62 vs 0.89), so everything without a speaker uses the natural voice.
  da: {
    f: { id: "da_DK-talesyntese-medium+f", label: "Talesyntese, derived higher voice (Denmark)", gender: "f", locale: "da-DK", license: "CC0 (NB Språkbanken talesyntese data); pitch-shifted derivative", source: "https://huggingface.co/rhasspy/piper-voices" },
    m: { id: "da_DK-talesyntese-medium", label: "Talesyntese (Denmark)", gender: "m", locale: "da-DK", license: "CC0 (NB Språkbanken talesyntese data)", source: "https://huggingface.co/rhasspy/piper-voices" },
    solo: { id: "da_DK-talesyntese-medium", label: "Talesyntese (Denmark)", gender: "m", locale: "da-DK", license: "CC0 (NB Språkbanken talesyntese data)", source: "https://huggingface.co/rhasspy/piper-voices" },
  },
};

export function voiceFor(language: string, gender: "f" | "m" = "f"): VoiceInfo {
  const set = VOICES[language];
  if (!set) throw new Error(`No voices configured for language "${language}"`);
  return set[gender];
}

/** The voice for clips without a speaker. */
export function soloVoice(language: string): VoiceInfo {
  const set = VOICES[language];
  if (!set) throw new Error(`No voices configured for language "${language}"`);
  return set.solo ?? set.f;
}

export const LANGUAGE_META: Record<string, { name: string; nativeName: string; locale: string; order: number; flagColors: string[] }> = {
  en: { name: "English", nativeName: "English", locale: "en-US", order: 1, flagColors: ["#0b1f3a", "#b4232c", "#ffffff"] },
  fr: { name: "French", nativeName: "Français", locale: "fr-FR", order: 2, flagColors: ["#1b3a66", "#ffffff", "#b4232c"] },
  es: { name: "Spanish", nativeName: "Español", locale: "es-ES", order: 3, flagColors: ["#b4232c", "#c29b3f", "#b4232c"] },
  de: { name: "German", nativeName: "Deutsch", locale: "de-DE", order: 4, flagColors: ["#0e1a2b", "#b4232c", "#c29b3f"] },
  da: { name: "Danish", nativeName: "Dansk", locale: "da-DK", order: 5, flagColors: ["#b4232c", "#ffffff", "#b4232c"] },
};

/** BCP 47 locale for browser speech synthesis/recognition and Azure Speech. */
export function localeFor(language: string): string {
  return LANGUAGE_META[language]?.locale ?? "en-US";
}
