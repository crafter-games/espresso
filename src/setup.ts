// Shared shell for the web build: pointer, touch or Space to the hold bit, fixed 60 Hz steps, one render per frame,
// and the game's one-frame cues turned into sound.
import type { Audio } from "dotframe/src/audio";
import { createDraw2D } from "dotframe/src/draw2d";
import type { Frame, Gpu } from "dotframe/src/gpu";
import type { Input } from "dotframe/src/input";
import { Key, MouseButton } from "dotframe/src/input";
import { createMasher, createProbe, type ProbeState } from "dotframe/src/probe";
import { createGame, type Cue, type Game, HOLD, hot, randomInput, render, step, WINDOW } from "./game";

export interface SetupOptions {
  // A seed makes the player a scripted masher (tests); null reads the pointer, touch and keyboard.
  mash: number | null;
  onProbe: (state: ProbeState) => void;
  // Registers the fonts on the Draw2D once it exists.
  fonts: (draw: ReturnType<typeof createDraw2D>, gpu: Gpu) => void;
  // Sound effects by name, resolved once loaded (ElevenLabs renders in assets/sfx).
  sounds: (audio: Audio) => Promise<Record<string, number>>;
  // The best score kept between visits, and where to save a new one.
  best: number;
  saveBest: (score: number) => void;
}

const STEP = 1 / 60;
const PAPER = { r: 0.957, g: 0.937, b: 0.886 };
const INK = { r: 0.11, g: 0.106, b: 0.09 };

const CUES: Record<Exclude<Cue, "">, [string, number]> = {
  start: ["start", 0.7], land: ["clink", 0.8], clean: ["good", 0.8], crema: ["crema", 0.9], miss: ["clink", 0.6],
  spill: ["spill", 0.9], streak: ["streak", 0.8], over: ["over", 0.8], layer: ["grind", 0.6],
};

export interface SetupPlatform {
  gpu: Gpu;
  input: Input;
  audio: Audio;
}

export function createSetup(options: SetupOptions): (platform: SetupPlatform) => Frame {
  return ({ gpu, input, audio }: SetupPlatform): Frame => {
    // The logical canvas keeps the portrait aspect and grows to fill the screen: on a desktop the cup sits centered.
    let aspect = 0;
    let offsetX = 0;
    let offsetY = 0;
    const draw = createDraw2D(gpu, WINDOW.width, WINDOW.height);
    options.fonts(draw, gpu);
    let sounds: Record<string, number> = {};
    options.sounds(audio).then((loaded) => {
      sounds = loaded;
    }).catch((error: unknown) => console.error(error));
    const fit = (): void => {
      const now = gpu.aspect();
      if (now === aspect) return;
      aspect = now;
      const logicalWidth = Math.max(WINDOW.width, Math.round(WINDOW.height * aspect));
      const logicalHeight = Math.max(WINDOW.height, Math.round(WINDOW.width / aspect));
      offsetX = (logicalWidth - WINDOW.width) / 2;
      offsetY = (logicalHeight - WINDOW.height) / 2;
      draw.resize(logicalWidth, logicalHeight);
    };
    const game: Game = createGame(Math.floor(Math.random() * 1e9), options.best);
    const mash = options.mash === null ? null : createMasher(options.mash, randomInput);
    const probe = createProbe();
    let localFrame = 0;
    let simulated = -1;
    let pourVoice = 0;
    let saved = options.best;
    return (time: number): boolean => {
      if (simulated < 0) simulated = time;
      for (let n = 0; simulated + STEP <= time && n < 5; n++) {
        const pointer = input.pointer();
        const inside = pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1;
        const down = (inside && (pointer.buttons & MouseButton.Left) !== 0) || input.touches().length > 0 || input.down(Key.Space);
        const bits = mash ? mash() : down ? HOLD : 0;
        step(game, [bits]);
        // Sound is presentation only: the pour loops while coffee leaves the spout, cues fire once.
        const pouring = game.phase === "pour" && (bits & HOLD) !== 0;
        if (pouring && !pourVoice && sounds.pour !== undefined) pourVoice = audio.start(sounds.pour, 0.55, game.layer > 0 ? 1.15 : 1, true);
        if (!pouring && pourVoice) {
          audio.stopVoice(pourVoice);
          pourVoice = 0;
        }
        if (game.cue !== "") {
          const [name, volume] = CUES[game.cue];
          if (sounds[name] !== undefined) audio.play(sounds[name], volume, 1);
        }
        if (game.best > saved) {
          saved = game.best;
          options.saveBest(saved);
        }
        localFrame += 1;
        probe.update(null, "local", localFrame);
        options.onProbe(probe.state);
        simulated += STEP;
      }
      fit();
      draw.begin();
      draw.translate(offsetX, offsetY);
      render(game, draw);
      draw.resetTransform();
      draw.end(game.phase !== "title" && game.phase !== "done" && hot(game) ? INK : PAPER);
      return true;
    };
  };
}
