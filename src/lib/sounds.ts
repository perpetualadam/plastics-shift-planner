import type { AlarmSoundId } from "./storage";

export type SoundOption = {
  id: AlarmSoundId;
  label: string;
  description: string;
};

export const SOUND_OPTIONS: SoundOption[] = [
  { id: "pulse", label: "Pulse", description: "Steady dual-tone wake" },
  { id: "radar", label: "Radar", description: "Rising sweep" },
  { id: "chime", label: "Chime", description: "Clear bell tones" },
  { id: "buzzer", label: "Buzzer", description: "Hard industrial buzz" },
  { id: "gentle", label: "Gentle", description: "Soft ascending pad" },
  { id: "siren", label: "Siren", description: "Urgent alternating tones" },
];

type Tone = { freq: number; dur: number; type?: OscillatorType; gap?: number };

const PATTERNS: Record<AlarmSoundId, Tone[]> = {
  pulse: [
    { freq: 880, dur: 0.18, type: "square" },
    { freq: 660, dur: 0.18, type: "square", gap: 0.08 },
    { freq: 880, dur: 0.18, type: "square", gap: 0.08 },
    { freq: 660, dur: 0.28, type: "square", gap: 0.08 },
  ],
  radar: [
    { freq: 420, dur: 0.35, type: "sawtooth" },
    { freq: 640, dur: 0.35, type: "sawtooth", gap: 0.05 },
    { freq: 880, dur: 0.45, type: "sawtooth", gap: 0.05 },
  ],
  chime: [
    { freq: 523.25, dur: 0.4, type: "sine" },
    { freq: 659.25, dur: 0.4, type: "sine", gap: 0.1 },
    { freq: 783.99, dur: 0.55, type: "sine", gap: 0.1 },
  ],
  buzzer: [
    { freq: 180, dur: 0.22, type: "square" },
    { freq: 160, dur: 0.22, type: "square", gap: 0.04 },
    { freq: 180, dur: 0.22, type: "square", gap: 0.04 },
    { freq: 160, dur: 0.35, type: "square", gap: 0.04 },
  ],
  gentle: [
    { freq: 392, dur: 0.5, type: "triangle" },
    { freq: 494, dur: 0.5, type: "triangle", gap: 0.12 },
    { freq: 587, dur: 0.7, type: "triangle", gap: 0.12 },
  ],
  siren: [
    { freq: 700, dur: 0.28, type: "sawtooth" },
    { freq: 500, dur: 0.28, type: "sawtooth", gap: 0.02 },
    { freq: 700, dur: 0.28, type: "sawtooth", gap: 0.02 },
    { freq: 500, dur: 0.28, type: "sawtooth", gap: 0.02 },
    { freq: 700, dur: 0.35, type: "sawtooth", gap: 0.02 },
  ],
};

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

export async function playAlarmSound(
  id: AlarmSoundId,
  volume = 0.85,
  loops = 2,
): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === "suspended") await ctx.resume();

  const pattern = PATTERNS[id] ?? PATTERNS.pulse;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(ctx.destination);

  let t = ctx.currentTime + 0.02;
  for (let loop = 0; loop < loops; loop++) {
    for (const tone of pattern) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + tone.dur + 0.02);
      t += tone.dur + (tone.gap ?? 0.06);
    }
    t += 0.25;
  }

  await new Promise((r) => setTimeout(r, (t - ctx.currentTime + 0.1) * 1000));
}

export function stopAlarmAudio(): void {
  if (sharedCtx) {
    void sharedCtx.close();
    sharedCtx = null;
  }
}
