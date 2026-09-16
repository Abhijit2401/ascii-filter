# ASCII Filter

Turns an image, a video, or your webcam into live ASCII art. The whole effect runs as one program on the GPU, so it stays smooth even at high resolution.

Built with Astro + three.js.

## What it does

Drop in an image, a video, or your webcam, and it gets converted into a grid of characters live. The side panel lets you tweak pretty much everything:

- grid density, which characters get used, how many color bands, saturation, brightness
- edge detection that swaps in `- | / \` characters along actual outlines (or smoothly rotates one character instead of snapping between four)
- a speckled pattern that fakes extra shades of color without blurring anything
- fake depth via offset shadow characters, plus a cross-hatch shading mode
- locked-in retro color palettes (CGA, Game Boy, C64, amber terminal)
- a slow drifting distortion, plus motion trails that fade out over time
- cursor-repel distortion, audio reactivity, scanlines, vignette fade: web-only extras
- presets: a handful of built-in ones, plus save/load/import/export of your own

You can also export the core effect: grab the character-sheet PNG and either a Unity shader or a standalone JS/WebGL widget with no three.js dependency.


## Structure

```
src/
  pages/index.astro       markup only, imports the CSS and starts the app
  scripts/app.ts           three.js setup, UI wiring, render loop
  shaders/                 the two GPU programs that draw each frame
  data/                    palettes and factory presets
  exports/                 the Unity HLSL / WebGL export templates
  styles/app.css           the whole UI stylesheet
```

## License

MIT
