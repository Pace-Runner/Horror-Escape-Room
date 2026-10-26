/**
 * The graphics presets on the settings screen.
 *
 * The game is marked on lab hardware, not on the machines it was written on,
 * so a player on a weak integrated GPU needs one switch that buys frame rate
 * back. Each preset changes only things that can be changed live, without
 * rebuilding a material (which would recompile shaders and stall the game):
 *
 *   pixelRatioCap  The drawing buffer's resolution as a multiple of the CSS
 *                  pixel size. Below 1 the scene is drawn smaller and the
 *                  browser scales it up -- the single biggest cost lever,
 *                  since every fragment shader runs per pixel.
 *   msaaSamples    Antialiasing samples on the composer's scene target (see
 *                  world/Postprocessing.js). 0 turns MSAA off.
 *   mirrorScale    The study mirror's reflection target as a share of the
 *                  drawing buffer (see world/HauntedMirror.js).
 *
 * 'high' is exactly what the game did before this setting existed, so it is
 * the default: nobody's picture changes unless they ask for it.
 */
export const GRAPHICS_QUALITIES = Object.freeze({
  low: Object.freeze({ label: 'Low', pixelRatioCap: 0.75, msaaSamples: 0, mirrorScale: 0.33 }),
  medium: Object.freeze({ label: 'Medium', pixelRatioCap: 1, msaaSamples: 4, mirrorScale: 0.5 }),
  high: Object.freeze({ label: 'High', pixelRatioCap: 2, msaaSamples: 4, mirrorScale: 0.6 })
});

export const DEFAULT_GRAPHICS_QUALITY = 'high';

/**
 * The pixel ratio a preset asks for on this display: the device's own ratio,
 * capped by the preset. A 1x lab monitor gets 1 on both Medium and High; a
 * 2x laptop screen gets 2 on High and 1 on Medium.
 *
 * @param {keyof typeof GRAPHICS_QUALITIES} qualityKey
 * @param {number} devicePixelRatio - window.devicePixelRatio.
 * @returns {number}
 */
export function readPixelRatio(qualityKey, devicePixelRatio) {
  const preset = GRAPHICS_QUALITIES[qualityKey] ?? GRAPHICS_QUALITIES[DEFAULT_GRAPHICS_QUALITY];
  return Math.min(devicePixelRatio, preset.pixelRatioCap);
}
