// Espresso perfecto: hold to pour, release on the line. Five cups, each smaller target and faster pour.
// All simulation state lives in Game and changes only in step(); render() only reads it.
import type { Draw2D } from "dotframe/src/draw2d";

export const WINDOW = { width: 540, height: 960, title: "Espresso perfecto" };
export const PLAYERS = 1;
export const HOLD = 1;
export const ROUNDS = 5;
// Coffee leaves the spout and lands this many frames later, so a release has to lead the line.
const DELAY = 14;
const SETTLE = 24;
const SHOW = 80;
const PERFECT = 0.012;
const FLOOR = 0.15;

export const FONT = "Anton";
export const MONO = "JetBrains Mono";
const PAPER = "#f4efe2";
const INK = "#1c1b17";
const BUTTER = "#f9e28e";

export type Phase = "title" | "ready" | "pour" | "settle" | "result" | "done";

export interface Cup {
  top: number;
  bottom: number;
  height: number;
  target: number;
  rate: number;
}

export interface Game {
  frame: number;
  seed: number;
  phase: Phase;
  timer: number;
  round: number;
  cup: Cup;
  level: number;
  // What left the spout on each of the last DELAY frames; index frame % DELAY lands now.
  air: number[];
  poured: boolean;
  held: boolean;
  spilled: boolean;
  last: number;
  error: number;
  scores: number[];
  best: number;
}

function rand(game: Game): number {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function newCup(game: Game): Cup {
  const top = 190 + rand(game) * 110;
  const height = 230 + rand(game) * 110;
  return {
    top,
    bottom: top * (0.68 + rand(game) * 0.14),
    height,
    target: 0.5 + rand(game) * 0.35,
    rate: 0.0055 + game.round * 0.0016 + rand(game) * 0.001,
  };
}

function air(): number[] {
  const list: number[] = [];
  for (let i = 0; i < DELAY; i++) list.push(0);
  return list;
}

export function createGame(seed: number): Game {
  const game: Game = {
    frame: 0, seed: seed >>> 0 || 1, phase: "title", timer: 0, round: 0, cup: { top: 240, bottom: 180, height: 280, target: 0.7, rate: 0.006 },
    level: 0, air: air(), poured: false, held: false, spilled: false, last: 0, error: 0, scores: [], best: 0,
  };
  return game;
}

function startRound(game: Game): void {
  game.cup = newCup(game);
  game.level = 0;
  game.air = air();
  game.poured = false;
  game.spilled = false;
  game.phase = "ready";
  game.timer = 0;
}

function finishRound(game: Game): void {
  game.error = game.level - game.cup.target;
  const off = Math.abs(game.error);
  let points = game.spilled ? 0 : Math.round(Math.max(0, 1000 * (1 - off / FLOOR)));
  if (!game.spilled && off < PERFECT) points += 250;
  game.last = points;
  game.scores.push(points);
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
  if (game.phase === "title" || game.phase === "done") {
    if (pressed && game.timer > 20) {
      game.round = 0;
      game.scores = [];
      startRound(game);
    }
    return;
  }
  if (game.phase === "ready") {
    // A finger already down from the last screen must lift before the cup accepts a pour.
    if (game.timer > 24 && pressed) {
      game.phase = "pour";
      game.timer = 0;
    } else return;
  }
  const slot = game.frame % DELAY;
  const landing = game.air[slot];
  const out = game.phase === "pour" && hold ? game.cup.rate : 0;
  game.air[slot] = out;
  game.level += landing;
  if (game.phase === "pour") {
    if (out > 0) game.poured = true;
    if (!hold && game.poured) {
      game.phase = "settle";
      game.timer = 0;
    }
  }
  if (game.level > 1) {
    game.level = 1;
    game.spilled = true;
    finishRound(game);
    return;
  }
  if (game.phase === "settle" && game.timer >= DELAY + SETTLE) finishRound(game);
  if (game.phase === "result" && game.timer >= SHOW) {
    game.round += 1;
    if (game.round >= ROUNDS) {
      const total = totalScore(game);
      if (total > game.best) game.best = total;
      game.phase = "done";
      game.timer = 0;
    } else startRound(game);
  }
}

export function totalScore(game: Game): number {
  return game.scores.reduce((sum, value) => sum + value, 0);
}

export function checksum(game: Game): number {
  let h = 2166136261 ^ game.frame;
  const mix = (v: number): void => {
    h = Math.imul(h ^ Math.round(v * 100000), 16777619);
  };
  mix(game.seed);
  mix(game.round);
  mix(game.level);
  mix(game.timer);
  mix(totalScore(game));
  for (const a of game.air) mix(a);
  return h >>> 0;
}

export function state(game: Game): unknown {
  return {
    phase: game.phase, round: game.round, level: Number(game.level.toFixed(4)), target: Number(game.cup.target.toFixed(4)),
    scores: game.scores, total: totalScore(game), best: game.best, spilled: game.spilled,
  };
}

// Field by field: scriptc compiles neither structuredClone nor Object.assign, and netplay saves every frame.
export function snapshot(game: Game): Game {
  return {
    frame: game.frame, seed: game.seed, phase: game.phase, timer: game.timer, round: game.round,
    cup: { top: game.cup.top, bottom: game.cup.bottom, height: game.cup.height, target: game.cup.target, rate: game.cup.rate },
    level: game.level, air: game.air.slice(), poured: game.poured, held: game.held, spilled: game.spilled,
    last: game.last, error: game.error, scores: game.scores.slice(), best: game.best,
  };
}

export function restore(game: Game, saved: Game): void {
  const copy = snapshot(saved);
  game.frame = copy.frame; game.seed = copy.seed; game.phase = copy.phase; game.timer = copy.timer; game.round = copy.round;
  game.cup = copy.cup; game.level = copy.level; game.air = copy.air; game.poured = copy.poured; game.held = copy.held;
  game.spilled = copy.spilled; game.last = copy.last; game.error = copy.error; game.scores = copy.scores; game.best = copy.best;
}

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

const CUP_BASE = 760;
const CX = WINDOW.width / 2;
const SPOUT = 250;

// x half-width of the cup at fraction f of its height (0 bottom, 1 rim).
function half(cup: Cup, f: number): number {
  return (cup.bottom + (cup.top - cup.bottom) * f) / 2;
}

function text(draw: Draw2D, font: string, value: string, x: number, y: number, align: string): void {
  draw.setFont(font);
  draw.setTextAlign(align);
  draw.fillText(value, x, y);
}

function halftone(draw: Draw2D): void {
  draw.setFillStyle(INK);
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

function drawCup(draw: Draw2D, game: Game): void {
  const cup = game.cup;
  const top = CUP_BASE - cup.height;
  // Liquid first, then the outline over it.
  if (game.level > 0) {
    const y = CUP_BASE - cup.height * game.level;
    const w = half(cup, game.level);
    draw.setFillStyle(INK);
    draw.beginPath();
    draw.moveTo(CX - cup.bottom / 2, CUP_BASE);
    draw.lineTo(CX + cup.bottom / 2, CUP_BASE);
    draw.lineTo(CX + w, y);
    draw.lineTo(CX - w, y);
    draw.closePath();
    draw.fill();
    draw.setFillStyle(BUTTER);
    draw.fillRect(CX - w + 4, y, w * 2 - 8, Math.min(8, cup.height * game.level));
  }
  const ty = CUP_BASE - cup.height * cup.target;
  const tw = half(cup, cup.target) + 26;
  draw.setFillStyle(BUTTER);
  draw.setGlobalAlpha(0.85);
  draw.fillRect(CX - tw, ty - 3, tw * 2, 6);
  draw.setGlobalAlpha(1);
  draw.setFillStyle(INK);
  for (let x = CX - tw; x < CX + tw; x += 12) draw.fillRect(x, ty - 1, 6, 2);
  text(draw, `16px "${MONO}"`, "LÍNEA", CX - tw - 8, ty + 6, "right");
  draw.setStrokeStyle(INK);
  draw.setLineWidth(6);
  draw.beginPath();
  draw.moveTo(CX - cup.top / 2, top);
  draw.lineTo(CX - cup.bottom / 2, CUP_BASE);
  draw.lineTo(CX + cup.bottom / 2, CUP_BASE);
  draw.lineTo(CX + cup.top / 2, top);
  draw.stroke();
  // Handle.
  const wall = (f: number): number => CX + half(cup, f) - 2;
  const y = (f: number): number => CUP_BASE - cup.height * f;
  draw.beginPath();
  draw.moveTo(wall(0.8), y(0.8));
  draw.lineTo(wall(0.8) + 44, y(0.76));
  draw.lineTo(wall(0.4) + 40, y(0.4));
  draw.lineTo(wall(0.36), y(0.36));
  draw.stroke();
  // Saucer.
  draw.fillRect(CX - cup.top / 2 - 40, CUP_BASE + 8, cup.top + 80, 8);
}

function drawMachine(draw: Draw2D, game: Game): void {
  draw.setFillStyle(INK);
  draw.fillRect(CX - 70, 120, 140, 100);
  draw.fillRect(CX - 26, 220, 52, 18);
  draw.fillRect(CX - 10, 238, 20, SPOUT - 238);
  draw.setFillStyle(PAPER);
  draw.beginPath();
  draw.arc(CX, 170, 22, 0, Math.PI * 2, false);
  draw.fill();
  // The stream: every frame still in the air is a segment between spout and surface.
  const surface = CUP_BASE - game.cup.height * game.level;
  const fall = (surface - SPOUT) / DELAY;
  draw.setFillStyle(INK);
  for (let age = 0; age < DELAY; age++) {
    const slot = ((game.frame - age) % DELAY + DELAY) % DELAY;
    if (game.air[slot] <= 0) continue;
    draw.fillRect(CX - 4, SPOUT + age * fall, 8, fall + 1);
  }
}

function hud(draw: Draw2D, game: Game): void {
  draw.setFillStyle(INK);
  const round = Math.min(game.round + 1, ROUNDS);
  text(draw, `18px "${MONO}"`, `TAZA ${round}/${ROUNDS}`, 36, 58, "left");
  text(draw, `18px "${MONO}"`, `PUNTOS ${points(totalScore(game))}`, WINDOW.width - 36, 58, "right");
  draw.fillRect(36, 76, WINDOW.width - 72, 2);
}

function button(draw: Draw2D, label: string): void {
  draw.setFont(`34px "${FONT}"`);
  const w = draw.measureText(label).width + 56;
  draw.setFillStyle(INK);
  draw.fillRect(CX - w / 2, 850, w, 64);
  draw.setFillStyle(PAPER);
  text(draw, `34px "${FONT}"`, label, CX, 893, "center");
}

export function render(game: Game, draw: Draw2D): void {
  draw.setFillStyle(PAPER);
  draw.fillRect(0, 0, WINDOW.width, WINDOW.height);
  halftone(draw);
  draw.setTextBaseline("alphabetic");
  if (game.phase === "title" || game.phase === "done") {
    draw.setFillStyle(BUTTER);
    draw.beginPath();
    draw.arc(CX, 330, 190, 0, Math.PI * 2, false);
    draw.fill();
    draw.setFillStyle(INK);
    text(draw, `120px "${FONT}"`, "ESPRESSO", CX, 320, "center");
    text(draw, `120px "${FONT}"`, "PERFECTO", CX, 430, "center");
    text(draw, `18px "${MONO}"`, "HOT RELOAD · JUEGO DEL CAFÉ", CX, 110, "center");
    draw.fillRect(36, 128, WINDOW.width - 72, 2);
    if (game.phase === "done") {
      const total = totalScore(game);
      text(draw, `18px "${MONO}"`, "$ hot-reload --espresso", 60, 600, "left");
      text(draw, `18px "${MONO}"`, `✓ ${game.scores.filter((s) => s > 0).length}/${ROUNDS} tazas servidas`, 60, 632, "left");
      text(draw, `18px "${MONO}"`, `✓ récord ${points(game.best)}`, 60, 664, "left");
      text(draw, `96px "${FONT}"`, points(total), CX, 790, "center");
      button(draw, "OTRA RONDA");
    } else {
      text(draw, `20px "${MONO}"`, "Mantén apretado para servir.", CX, 610, "center");
      text(draw, `20px "${MONO}"`, "Suelta justo en la línea.", CX, 642, "center");
      text(draw, `20px "${MONO}"`, "El café tarda en caer: adelántate.", CX, 674, "center");
      button(draw, "TOCA PARA EMPEZAR");
    }
    return;
  }
  hud(draw, game);
  drawMachine(draw, game);
  drawCup(draw, game);
  draw.setFillStyle(INK);
  if (game.phase === "result") {
    const mm = Math.round(game.error * 100);
    const verdict = game.spilled ? "¡DERRAMASTE!" : Math.abs(game.error) < PERFECT ? "¡CREMA!" : mm === 0 ? "¡EXACTO!" : `${mm > 0 ? "+" : "-"}${Math.abs(mm)} MM`;
    text(draw, `64px "${FONT}"`, verdict, CX, 840, "center");
    text(draw, `22px "${MONO}"`, `+${points(game.last)}`, CX, 884, "center");
  } else if (game.phase === "ready") {
    button(draw, "MANTÉN PARA SERVIR");
  } else if (game.phase === "pour") {
    button(draw, game.poured ? "SUELTA EN LA LÍNEA" : "MANTÉN PARA SERVIR");
  }
}
