// Shared by main.web.ts and main.native.ts: pointer, touch or Space to the hold bit, fixed 60 Hz steps, one render per frame.
import { createDraw2D } from "dotframe/src/draw2d";
import type { AudioPlayer } from "dotframe/src/audio";
import type { Frame, Gpu } from "dotframe/src/gpu";
import type { Input } from "dotframe/src/input";
import { Key, MouseButton } from "dotframe/src/input";
import { createMasher, createProbe, type ProbeState } from "dotframe/src/probe";
import { createGame, type Game, HOLD, randomInput, render, step, WINDOW } from "./game";

export interface SetupOptions {
  // A seed makes the player a scripted masher (tests); null reads the pointer, touch and keyboard.
  mash: number | null;
  onProbe: (state: ProbeState) => void;
  // Registers the fonts on the Draw2D once it exists; native builds load them synchronously.
  fonts: (draw: ReturnType<typeof createDraw2D>, gpu: Gpu) => void;
}

const STEP = 1 / 60;
// #f4efe2, the paper the letterbox shows around the portrait play area.
const PAPER = { r: 0.957, g: 0.937, b: 0.886 };

export interface SetupPlatform {
  gpu: Gpu;
  input: Input;
  audio: AudioPlayer;
}

export function createSetup(options: SetupOptions): (platform: SetupPlatform) => Frame {
  return ({ gpu, input, audio }: SetupPlatform): Frame => {
    // The logical canvas keeps the portrait aspect and grows to fill the screen: on a desktop the cup sits centered.
    let aspect = 0;
    let offsetX = 0;
    let offsetY = 0;
    const draw = createDraw2D(gpu, WINDOW.width, WINDOW.height);
    options.fonts(draw, gpu);
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
    const game: Game = createGame(Math.floor(Math.random() * 1e9));
    const mash = options.mash === null ? null : createMasher(options.mash, randomInput);
    const probe = createProbe();
    let localFrame = 0;
    let simulated = -1;
    let wasPouring = false;
    return (time: number): boolean => {
      if (simulated < 0) simulated = time;
      for (let n = 0; simulated + STEP <= time && n < 5; n++) {
        const pointer = input.pointer();
        const inside = pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1;
        const down = (inside && (pointer.buttons & MouseButton.Left) !== 0) || input.touches().length > 0 || input.down(Key.Space);
        const bits = mash ? mash() : down ? HOLD : 0;
        step(game, [bits]);
        // Audio is presentation only: a low hum while coffee leaves the spout, a click when it stops.
        const pouring = game.phase === "pour" && (bits & HOLD) !== 0;
        if (pouring && game.frame % 6 === 0) audio.tone(110 + game.level * 90, 0.08, 0.06);
        if (wasPouring && !pouring) audio.tone(660, 0.06, 0.15);
        wasPouring = pouring;
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
      draw.end(PAPER);
      return true;
    };
  };
}
