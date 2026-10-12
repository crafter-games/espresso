import type { Draw2D } from "dotframe/src/draw2d";
import type { Texture } from "dotframe/src/gpu";
import type { LoadBytes } from "dotframe/src/sim";
import { FONT, MONO } from "./game";

// SDF atlases baked with `dotframe assets font` (licenses beside them in assets/fonts).
export async function loadFonts(draw: Draw2D, load: LoadBytes, image: (bytes: Uint8Array, smooth: boolean) => Promise<Texture>): Promise<void> {
  for (const [name, file] of [[FONT, "assets/fonts/anton"], [MONO, "assets/fonts/jetbrains-mono"]]) {
    draw.addFont([name], await image(await load(`${file}.png`), true), new TextDecoder().decode(await load(`${file}.json`)));
  }
}
