// Espresso perfecto: hold to pour, release on the line. Orders come in layers (espresso, then milk), a streak of
// clean cups multiplies the score, and the shift ends after three ruined cups.
// All simulation state lives in Game and changes only in step(); render() only reads it.
import type { Draw2D } from "dotframe/src/draw2d";

export const WINDOW = { width: 540, height: 960, title: "Espresso perfecto" };
export const PLAYERS = 1;
export const HOLD = 1;
export const LIVES = 3;
// Coffee leaves the spout and lands this many frames later, so a release has to lead the line.
const DELAY = 14;
const SETTLE = 22;
const SHOW = 72;
const PERFECT = 0.012;
const CLEAN = 0.035;
const FLOOR = 0.15;

export const FONT = "Anton";
export const MONO = "JetBrains Mono";

export type Phase = "title" | "ready" | "pour" | "settle" | "result" | "done";
export type Drink = "espresso" | "cortado" | "latte" | "doble";
export type Twist = "none" | "belt" | "blind" | "leak";
// One-frame cue the shell turns into sound; never read by step().
export type Cue = "" | "start" | "land" | "clean" | "crema" | "miss" | "spill" | "streak" | "over" | "layer";

const DRINKS: Drink[] = ["espresso", "cortado", "latte", "doble"];
const NAMES = ["Ana", "Edward", "Carlos", "Ignacio", "Cris", "Nico", "Railly", "Shiara", "Diego", "Lucía", "Mateo", "Valeria"];
const LABELS: Record<Drink, string> = { espresso: "ESPRESSO", cortado: "CORTADO", latte: "LATTE", doble: "DOBLE AL RAS" };

export interface Cup {
  top: number;
  bottom: number;
  height: number;
  drink: Drink;
  twist: Twist;
  // One target per layer, as a fraction of the cup height; the last layer is the cup's total.
  targets: number[];
  rate: number;
  who: number;
}

export interface Game {
  frame: number;
  seed: number;
  phase: Phase;
  timer: number;
  served: number;
  cup: Cup;
  layer: number;
  // Fill per layer; their sum is the level.
  fill: number[];
  // What left the spout on each of the last DELAY frames; index frame % DELAY lands now.
  air: number[];
  poured: boolean;
  held: boolean;
  belt: number;
  lost: number;
  spilled: boolean;
  errors: number[];
  last: number;
  verdict: string;
  streak: number;
  lives: number;
  score: number;
  best: number;
  shake: number;
  cue: Cue;
}

function rand(game: Game): number {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function pick<T>(game: Game, list: T[]): T {
  return list[Math.floor(rand(game) * list.length) % list.length];
}

function newCup(game: Game): Cup {
  const n = game.served;
  const drink: Drink = n < 2 ? "espresso" : n < 4 ? pick(game, ["espresso", "cortado"] as Drink[]) : pick(game, DRINKS);
  const twist: Twist = n < 3 ? "none" : pick(game, ["none", "none", "belt", "blind", "leak"] as Twist[]);
  const top = 200 + rand(game) * 100;
  const height = 240 + rand(game) * 100;
  const targets =
    drink === "espresso" ? [0.5 + rand(game) * 0.35]
      : drink === "cortado" ? [0.35 + rand(game) * 0.1, 0.72 + rand(game) * 0.12]
        : drink === "latte" ? [0.18 + rand(game) * 0.08, 0.8 + rand(game) * 0.1]
          : [0.965];
  return {
    top, bottom: top * (0.68 + rand(game) * 0.14), height, drink, twist, targets,
    rate: Math.min(0.016, 0.0055 + n * 0.0007 + rand(game) * 0.001), who: Math.floor(rand(game) * NAMES.length),
  };
}

function air(): number[] {
  const list: number[] = [];
  for (let i = 0; i < DELAY; i++) list.push(0);
  return list;
}

export function level(game: Game): number {
  return game.fill.reduce((sum, value) => sum + value, 0);
}

export function multiplier(game: Game): number {
  return Math.min(4, 1 + Math.floor(game.streak / 2));
}

export function hot(game: Game): boolean {
  return multiplier(game) >= 3;
}

export function createGame(seed: number, best = 0): Game {
  return {
    frame: 0, seed: seed >>> 0 || 1, phase: "title", timer: 0, served: 0,
    cup: { top: 240, bottom: 180, height: 280, drink: "espresso", twist: "none", targets: [0.7], rate: 0.006, who: 0 },
    layer: 0, fill: [0], air: air(), poured: false, held: false, belt: 0, lost: 0, spilled: false, errors: [],
    last: 0, verdict: "", streak: 0, lives: LIVES, score: 0, best, shake: 0, cue: "",
  };
}

function startCup(game: Game): void {
  game.cup = newCup(game);
  game.layer = 0;
  game.fill = game.cup.targets.map(() => 0);
  game.air = air();
  game.poured = false;
  game.spilled = false;
  game.errors = [];
  game.lost = 0;
  game.belt = rand(game) * 200;
  game.phase = "ready";
  game.timer = 0;
}

// x offset of the cup on the belt: a triangle wave, so it needs no trig and replays the same everywhere.
export function beltOffset(game: Game): number {
  if (game.cup.twist !== "belt") return 0;
  const t = game.belt % 200;
  return ((t < 100 ? t : 200 - t) / 100 - 0.5) * 220;
}

function endLayer(game: Game): void {
  const reached = level(game);
  game.errors.push(reached - game.cup.targets[game.layer]);
  if (game.layer + 1 < game.cup.targets.length) {
    game.layer += 1;
    game.poured = false;
    game.phase = "ready";
    game.timer = 0;
    game.cue = "layer";
  } else finishCup(game);
}

function finishCup(game: Game): void {
  const worst = game.errors.reduce((max, e) => Math.max(max, Math.abs(e)), 0);
  const ruined = game.spilled || worst >= FLOOR;
  const base = ruined ? 0 : Math.round(game.errors.reduce((sum, e) => sum + 1000 * (1 - Math.abs(e) / FLOOR), 0) / game.errors.length);
  const perfect = !ruined && worst < PERFECT;
  const clean = !ruined && worst < CLEAN;
  const before = multiplier(game);
  if (clean) game.streak += 1;
  else game.streak = 0;
  const points = (base + (perfect ? 250 : 0)) * before;
  game.last = points;
  game.score += points;
  game.served += 1;
  if (ruined) {
    game.lives -= 1;
    game.shake = 18;
  }
  const mm = Math.round(game.errors[game.errors.length - 1] * 100);
  game.verdict = game.spilled ? "¡DERRAMASTE!" : ruined ? "MUY LEJOS" : perfect ? "¡CREMA!" : clean ? "¡BIEN!" : `${mm > 0 ? "+" : "-"}${Math.abs(mm)} MM`;
  game.cue = game.spilled ? "spill" : ruined ? "miss" : multiplier(game) > before ? "streak" : perfect ? "crema" : clean ? "clean" : "land";
  game.phase = "result";
  game.timer = 0;
}

export function encode(input: unknown): number {
  const i = input as { hold?: boolean };
  return i.hold ? HOLD : 0;
}

export function randomInput(next: () => number): number {
  return next() < 0.55 ? HOLD : 0;
}

export function step(game: Game, inputs: number[]): void {
  const hold = ((inputs[0] ?? 0) & HOLD) !== 0;
  const pressed = hold && !game.held;
  game.held = hold;
  game.frame += 1;
  game.timer += 1;
  game.cue = "";
  if (game.shake > 0) game.shake -= 1;
  if (game.phase === "title" || game.phase === "done") {
    if (pressed && game.timer > 30) {
      game.served = 0;
      game.score = 0;
      game.streak = 0;
      game.lives = LIVES;
      game.cue = "start";
      startCup(game);
    }
    return;
  }
  game.belt += 1 + game.served * 0.08;
  if (game.phase === "result") {
    if (game.timer >= SHOW) {
      if (game.lives <= 0) {
        if (game.score > game.best) game.best = game.score;
        game.phase = "done";
        game.timer = 0;
        game.cue = "over";
      } else startCup(game);
    }
    return;
  }
  if (game.phase === "ready") {
    // A finger already down from the last screen must lift before the cup accepts a pour.
    if (game.timer > 20 && pressed) {
      game.phase = "pour";
      game.timer = 0;
    } else return;
  }
  const slot = game.frame % DELAY;
  const landing = game.air[slot];
  // Milk runs faster than espresso.
  const rate = game.cup.rate * (game.layer > 0 ? 1.35 : 1);
  const out = game.phase === "pour" && hold ? rate : 0;
  game.air[slot] = out;
  if (landing > 0) {
    // On the belt, coffee that misses the cup is lost on the saucer.
    if (Math.abs(beltOffset(game)) < game.cup.bottom * 0.42) game.fill[game.layer] += landing;
    else game.lost += landing;
  }
  if (game.cup.twist === "leak" && game.fill[0] > 0) game.fill[0] = Math.max(0, game.fill[0] - 0.0007);
  if (game.phase === "pour") {
    if (out > 0) game.poured = true;
    if (!hold && game.poured) {
      game.phase = "settle";
      game.timer = 0;
    }
  }
  if (level(game) > 1) {
    game.fill[game.layer] -= level(game) - 1;
    game.spilled = true;
    game.errors.push(1);
    finishCup(game);
    return;
  }
  if (game.phase === "settle" && game.timer >= DELAY + SETTLE) endLayer(game);
}

export function checksum(game: Game): number {
  let h = 2166136261 ^ game.frame;
  const mix = (v: number): void => {
    h = Math.imul(h ^ Math.round(v * 100000), 16777619);
  };
  mix(game.seed);
  mix(game.served);
  mix(level(game));
  mix(game.timer);
  mix(game.score);
  mix(game.lives);
  mix(game.streak);
  mix(game.belt);
  for (const a of game.air) mix(a);
  return h >>> 0;
}

export function state(game: Game): unknown {
  return {
    phase: game.phase, served: game.served, drink: game.cup.drink, twist: game.cup.twist, layer: game.layer,
    level: Number(level(game).toFixed(4)), targets: game.cup.targets.map((t) => Number(t.toFixed(4))),
    score: game.score, streak: game.streak, multiplier: multiplier(game), lives: game.lives, best: game.best, verdict: game.verdict,
  };
}

// Field by field: scriptc compiles neither structuredClone nor Object.assign.
export function snapshot(game: Game): Game {
  const c = game.cup;
  return {
    frame: game.frame, seed: game.seed, phase: game.phase, timer: game.timer, served: game.served,
    cup: { top: c.top, bottom: c.bottom, height: c.height, drink: c.drink, twist: c.twist, targets: c.targets.slice(), rate: c.rate, who: c.who },
    layer: game.layer, fill: game.fill.slice(), air: game.air.slice(), poured: game.poured, held: game.held, belt: game.belt,
    lost: game.lost, spilled: game.spilled, errors: game.errors.slice(), last: game.last, verdict: game.verdict,
    streak: game.streak, lives: game.lives, score: game.score, best: game.best, shake: game.shake, cue: game.cue,
  };
}

export function restore(game: Game, saved: Game): void {
  const s = snapshot(saved);
  game.frame = s.frame; game.seed = s.seed; game.phase = s.phase; game.timer = s.timer; game.served = s.served; game.cup = s.cup;
  game.layer = s.layer; game.fill = s.fill; game.air = s.air; game.poured = s.poured; game.held = s.held; game.belt = s.belt;
  game.lost = s.lost; game.spilled = s.spilled; game.errors = s.errors; game.last = s.last; game.verdict = s.verdict;
  game.streak = s.streak; game.lives = s.lives; game.score = s.score; game.best = s.best; game.shake = s.shake; game.cue = s.cue;
}

// ---------------------------------------------------------------- render

const CUP_BASE = 760;
const CX = WINDOW.width / 2;
const SPOUT = 262;

interface Palette { paper: string; ink: string; accent: string; milk: string; coffee: string }
const CALM: Palette = { paper: "#f4efe2", ink: "#1c1b17", accent: "#f9e28e", milk: "#fffaf0", coffee: "#1c1b17" };
// Hot streak: the page flips to ink and butter, like the R reload.
const HOT: Palette = { paper: "#1c1b17", ink: "#f9e28e", accent: "#f4efe2", milk: "#efe6cf", coffee: "#9a6a3a" };

// Spanish thousands separator, written by hand so every platform prints the same digits.
function points(value: number): string {
  const digits = String(value);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return out;
}

function half(cup: Cup, f: number): number {
  return (cup.bottom + (cup.top - cup.bottom) * f) / 2;
}

function text(draw: Draw2D, font: string, value: string, x: number, y: number, align: string): void {
  draw.setFont(font);
  draw.setTextAlign(align);
  draw.fillText(value, x, y);
}

// A cheap hash for render-only jitter (splash drops, shake), derived from state so render stays pure.
function noise(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function halftone(draw: Draw2D, p: Palette): void {
  draw.setFillStyle(p.ink);
  for (let y = 0; y < WINDOW.height; y += 12) {
    for (let i = 0; i < 6; i++) {
      const r = 2.6 * (1 - i / 6) * (1 - i / 6);
      if (r < 0.3) continue;
      const offset = (y / 12) % 2 === 0 ? 0 : 6;
      for (const x of [i * 12 + offset, WINDOW.width - i * 12 - offset]) {
        draw.beginPath();
        draw.arc(x, y, r, 0, Math.PI * 2, false);
        draw.fill();
      }
    }
  }
}

function band(draw: Draw2D, cup: Cup, x: number, from: number, to: number, color: string): void {
  if (to <= from) return;
  const y0 = CUP_BASE - cup.height * from;
  const y1 = CUP_BASE - cup.height * to;
  draw.setFillStyle(color);
  draw.beginPath();
  draw.moveTo(x - half(cup, from), y0);
  draw.lineTo(x + half(cup, from), y0);
  draw.lineTo(x + half(cup, to), y1);
  draw.lineTo(x - half(cup, to), y1);
  draw.closePath();
  draw.fill();
}

function drawCup(draw: Draw2D, game: Game, p: Palette): void {
  const cup = game.cup;
  const x = CX + beltOffset(game);
  let at = 0;
  game.fill.forEach((f, i) => {
    band(draw, cup, x, at, at + f, i === 0 ? p.coffee : p.milk);
    at += f;
  });
  if (at > 0) {
    draw.setFillStyle(p.accent);
    const w = half(cup, at);
    draw.fillRect(x - w + 4, CUP_BASE - cup.height * at, w * 2 - 8, Math.min(7, cup.height * at));
  }
  // Target lines: the current layer's is bold, the others faint. Blind cups hide them once the pour starts.
  const blind = cup.twist === "blind" && game.phase !== "ready" && game.phase !== "result";
  cup.targets.forEach((target, i) => {
    if (blind && i === game.layer) return;
    if (game.phase !== "result" && i < game.layer) return;
    const ty = CUP_BASE - cup.height * target;
    const tw = half(cup, target) + 26;
    const active = i === game.layer || game.phase === "result";
    draw.setGlobalAlpha(active ? 0.9 : 0.35);
    draw.setFillStyle(p.accent);
    draw.fillRect(x - tw, ty - 3, tw * 2, 6);
    draw.setFillStyle(p.ink);
    for (let lx = x - tw; lx < x + tw; lx += 12) draw.fillRect(lx, ty - 1, 6, 2);
    const label = cup.drink === "doble" ? "RAS" : i === 0 ? "ESPRESSO" : "LECHE";
    text(draw, `14px "${MONO}"`, label, x - tw - 8, ty + 5, "right");
    draw.setGlobalAlpha(1);
  });
  draw.setStrokeStyle(p.ink);
  draw.setLineWidth(6);
  draw.beginPath();
  draw.moveTo(x - cup.top / 2, CUP_BASE - cup.height);
  draw.lineTo(x - cup.bottom / 2, CUP_BASE);
  draw.lineTo(x + cup.bottom / 2, CUP_BASE);
  draw.lineTo(x + cup.top / 2, CUP_BASE - cup.height);
  draw.stroke();
  const wall = (f: number): number => x + half(cup, f) - 2;
  const y = (f: number): number => CUP_BASE - cup.height * f;
  draw.beginPath();
  draw.moveTo(wall(0.8), y(0.8));
  draw.lineTo(wall(0.8) + 44, y(0.76));
  draw.lineTo(wall(0.4) + 40, y(0.4));
  draw.lineTo(wall(0.36), y(0.36));
  draw.stroke();
  draw.setFillStyle(p.ink);
  if (cup.twist === "belt") {
    // The belt: a dashed rail under the saucer that scrolls with the cup.
    draw.fillRect(40, CUP_BASE + 24, WINDOW.width - 80, 3);
    for (let bx = 40 - (game.belt * 2) % 24; bx < WINDOW.width - 40; bx += 24) if (bx > 40) draw.fillRect(bx, CUP_BASE + 30, 10, 3);
  }
  draw.fillRect(x - cup.top / 2 - 40, CUP_BASE + 8, cup.top + 80, 8);
  if (cup.twist === "leak" && game.fill[0] > 0) {
    // Drip from the bottom seam.
    const t = game.frame % 30;
    draw.beginPath();
    draw.arc(x + cup.bottom / 4, CUP_BASE + 6 + t * 0.6, 3, 0, Math.PI * 2, false);
    draw.fill();
  }
}

function drawMachine(draw: Draw2D, game: Game, p: Palette): void {
  draw.setFillStyle(p.ink);
  draw.fillRect(CX - 70, 132, 140, 100);
  draw.fillRect(CX - 26, 232, 52, 18);
  draw.fillRect(CX - 10, 250, 20, SPOUT - 250);
  draw.setFillStyle(p.paper);
  draw.beginPath();
  draw.arc(CX, 182, 22, 0, Math.PI * 2, false);
  draw.fill();
  const surface = CUP_BASE - game.cup.height * level(game);
  const fall = (surface - SPOUT) / DELAY;
  draw.setFillStyle(game.layer > 0 ? p.milk : p.coffee);
  for (let age = 0; age < DELAY; age++) {
    const slot = ((game.frame - age) % DELAY + DELAY) % DELAY;
    if (game.air[slot] <= 0) continue;
    draw.fillRect(CX - 4, SPOUT + age * fall, 8, fall + 1);
  }
  if (game.layer > 0) {
    draw.setStrokeStyle(p.ink);
    draw.setLineWidth(2);
    for (let age = 0; age < DELAY; age++) {
      const slot = ((game.frame - age) % DELAY + DELAY) % DELAY;
      if (game.air[slot] > 0) draw.strokeRect(CX - 4, SPOUT + age * fall, 8, fall + 1);
    }
  }
}

function hud(draw: Draw2D, game: Game, p: Palette): void {
  draw.setFillStyle(p.ink);
  text(draw, `16px "${MONO}"`, `TAZA ${game.served + 1}`, 36, 56, "left");
  text(draw, `40px "${FONT}"`, points(game.score), WINDOW.width - 36, 62, "right");
  draw.fillRect(36, 76, WINDOW.width - 72, 2);
  // Lives as small cups.
  for (let i = 0; i < LIVES; i++) {
    const lx = 140 + i * 26;
    if (i < game.lives) draw.fillRect(lx, 44, 16, 14);
    else draw.strokeRect(lx, 44, 16, 14);
  }
  const m = multiplier(game);
  if (m > 1) {
    draw.setFillStyle(p.accent);
    draw.fillRect(36, 92, 74, 40);
    draw.setFillStyle(hot(game) ? p.paper : "#1c1b17");
    text(draw, `30px "${FONT}"`, `x${m}`, 73, 124, "center");
  }
  draw.setFillStyle(p.ink);
  const twist = game.cup.twist === "belt" ? " · EN LA CINTA" : game.cup.twist === "blind" ? " · DE MEMORIA" : game.cup.twist === "leak" ? " · TAZA CON FUGA" : "";
  text(draw, `16px "${MONO}"`, `PEDIDO DE ${NAMES[game.cup.who].toUpperCase()}${twist}`, WINDOW.width - 36, 108, "right");
  text(draw, `34px "${FONT}"`, LABELS[game.cup.drink], WINDOW.width - 36, 146, "right");
}

function button(draw: Draw2D, label: string, p: Palette): void {
  draw.setFont(`32px "${FONT}"`);
  const w = draw.measureText(label).width + 56;
  draw.setFillStyle(p.ink);
  draw.fillRect(CX - w / 2, 852, w, 62);
  draw.setFillStyle(p.paper);
  text(draw, `32px "${FONT}"`, label, CX, 894, "center");
}

// A circular stamp, like the badge's sello, that lands on clean cups.
function stamp(draw: Draw2D, game: Game, p: Palette): void {
  const t = Math.min(1, game.timer / 8);
  const r = 70 * (1.6 - 0.6 * t);
  draw.save();
  draw.translate(400, 330);
  draw.rotate(-0.25);
  draw.setGlobalAlpha(t);
  draw.setStrokeStyle(p.ink);
  draw.setLineWidth(4);
  draw.beginPath();
  draw.arc(0, 0, r, 0, Math.PI * 2, false);
  draw.stroke();
  draw.setLineWidth(2);
  draw.beginPath();
  draw.arc(0, 0, r - 8, 0, Math.PI * 2, false);
  draw.stroke();
  draw.setFillStyle(p.ink);
  text(draw, `${Math.round(r * 0.42)}px "${FONT}"`, game.verdict.replace(/¡|!/g, ""), 0, r * 0.15, "center");
  draw.setGlobalAlpha(1);
  draw.restore();
}

function splash(draw: Draw2D, game: Game, p: Palette): void {
  const x = CX + beltOffset(game);
  const y = CUP_BASE - game.cup.height;
  draw.setFillStyle(p.ink);
  for (let i = 0; i < 14; i++) {
    const vx = (noise(game.served, i) - 0.5) * 9;
    const vy = -3 - noise(i, game.served) * 6;
    const t = game.timer;
    draw.beginPath();
    draw.arc(x + vx * t, y + vy * t + 0.35 * t * t, 4, 0, Math.PI * 2, false);
    draw.fill();
  }
}

export function render(game: Game, draw: Draw2D): void {
  const p = game.phase !== "title" && game.phase !== "done" && hot(game) ? HOT : CALM;
  draw.save();
  if (game.shake > 0) draw.translate((noise(game.frame, 1) - 0.5) * game.shake, (noise(game.frame, 2) - 0.5) * game.shake);
  draw.setFillStyle(p.paper);
  draw.fillRect(-40, -40, WINDOW.width + 80, WINDOW.height + 80);
  halftone(draw, p);
  draw.setTextBaseline("alphabetic");
  if (game.phase === "title" || game.phase === "done") {
    draw.setFillStyle(p.accent);
    draw.beginPath();
    draw.arc(CX, 330, 190, 0, Math.PI * 2, false);
    draw.fill();
    draw.setFillStyle(p.ink);
    text(draw, `120px "${FONT}"`, "ESPRESSO", CX, 320, "center");
    text(draw, `120px "${FONT}"`, "PERFECTO", CX, 430, "center");
    text(draw, `16px "${MONO}"`, "HOT RELOAD · JUEGO DEL CAFÉ", CX, 110, "center");
    draw.fillRect(36, 128, WINDOW.width - 72, 2);
    if (game.phase === "done") {
      text(draw, `18px "${MONO}"`, "$ hot-reload --espresso", 60, 590, "left");
      text(draw, `18px "${MONO}"`, `✓ ${game.served} tazas servidas`, 60, 622, "left");
      text(draw, `18px "${MONO}"`, game.score >= game.best ? "✓ ¡nuevo récord!" : `✓ récord ${points(game.best)}`, 60, 654, "left");
      text(draw, `100px "${FONT}"`, points(game.score), CX, 790, "center");
      if (game.timer > 30) button(draw, "OTRO TURNO", p);
    } else {
      text(draw, `19px "${MONO}"`, "Mantén para servir, suelta en la línea.", CX, 590, "center");
      text(draw, `19px "${MONO}"`, "El café tarda en caer: adelántate.", CX, 622, "center");
      text(draw, `19px "${MONO}"`, "Cortados y lattes llevan leche encima.", CX, 654, "center");
      text(draw, `19px "${MONO}"`, "Tazas limpias seguidas = multiplicador.", CX, 686, "center");
      text(draw, `19px "${MONO}"`, "Tres tazas arruinadas y cierra el café.", CX, 718, "center");
      button(draw, "ABRIR EL CAFÉ", p);
    }
    draw.restore();
    return;
  }
  hud(draw, game, p);
  drawMachine(draw, game, p);
  drawCup(draw, game, p);
  draw.setFillStyle(p.ink);
  if (game.phase === "result") {
    if (game.spilled) splash(draw, game, p);
    if (game.verdict === "¡CREMA!" || game.verdict === "¡BIEN!") stamp(draw, game, p);
    text(draw, `60px "${FONT}"`, game.verdict, CX, 842, "center");
    text(draw, `22px "${MONO}"`, game.last > 0 ? `+${points(game.last)}` : game.lives > 0 ? `quedan ${game.lives} tazas` : "cierra el café", CX, 884, "center");
  } else if (game.phase === "ready") {
    button(draw, game.layer > 0 ? "AHORA LA LECHE" : "MANTÉN PARA SERVIR", p);
  } else if (game.phase === "pour") {
    button(draw, game.poured ? "SUELTA EN LA LÍNEA" : "MANTÉN PARA SERVIR", p);
  }
  draw.restore();
}
