// Generates the game's sound effects with ElevenLabs text-to-sound (POST /v1/sound-generation).
// Usage: ELEVENLABS_API_KEY=... bun tools/sfx.ts [name...]   Writes assets/sfx/<name>.mp3; skips existing files.
import { existsSync, writeFileSync } from "node:fs";

const SOUNDS: Record<string, { text: string; seconds: number; loop?: boolean }> = {
  pour: { text: "espresso machine pouring a thin stream of coffee into a ceramic cup, steady liquid trickle, close mic", seconds: 3, loop: true },
  grind: { text: "short burst of an espresso machine pump starting, mechanical hum", seconds: 0.8 },
  clink: { text: "single ceramic espresso cup set down on a saucer, crisp clink", seconds: 0.6 },
  crema: { text: "bright cheerful arcade success chime with a small bell sparkle, short", seconds: 1 },
  good: { text: "soft positive arcade blip, short and warm", seconds: 0.5 },
  spill: { text: "coffee splashing over the rim of a cup and spilling on a table, short splash", seconds: 1.2 },
  streak: { text: "rising arcade power up whoosh, energetic, short", seconds: 1.2 },
  over: { text: "short retro game over jingle, playful descending notes, cafe vibe", seconds: 2 },
  start: { text: "coffee shop bell over a door ringing once, cheerful", seconds: 1 },
};

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOUNDS);
for (const name of names) {
  const out = `assets/sfx/${name}.mp3`;
  if (existsSync(out)) continue;
  const sound = SOUNDS[name];
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: sound.text, duration_seconds: sound.seconds, prompt_influence: 0.5, loop: sound.loop ?? false }),
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  writeFileSync(out, new Uint8Array(await response.arrayBuffer()));
  console.log(out);
}
