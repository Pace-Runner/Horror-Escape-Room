export function releaseDoorProgress(time, timing) {
  const end = Math.min(timing.door + 1.8, timing.walk - .45);
  const u = Math.max(0, Math.min(1, (time - timing.door) / Math.max(.01, end - timing.door)));
  return u * u * (3 - 2 * u);
}

/** An outward hinge clears the outside of the lining, not just the leaf face. */
export function releaseHingeDepth(thickness, wallDepth) {
  return Math.max(thickness / 2, wallDepth + .01) + .012;
}
