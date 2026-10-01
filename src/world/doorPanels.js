/**
 * The panelled front door of the study, and the security code the player
 * reads off it.
 *
 * The door is an ordinary panelled door: three rows of raised rectangular
 * panels, with a different number of panels in each row. Count the panels row
 * by row, top to bottom, and that is the code.
 *
 * WHY A DOOR PANEL AND NOT A MARKING. An earlier version scored claw marks
 * into this door and asked the player to count those. Panels are better for a
 * reason that has nothing to do with looks: a panelled door needs no
 * justification at all. Marks scratched into a door raise the question of who
 * made them and why they happen to be countable; panels are simply what doors
 * are like. The information hides in plain sight instead of being planted.
 *
 * They are also far easier to read at 320x240. A panel is a large rectangle
 * with a hard edge, which is the one thing a low-contrast interlaced feed
 * renders well -- much better than thin strokes, which smear into each other.
 *
 * THIS FILE EXISTS SO THE COUNTS CANNOT DRIFT. The same numbers are needed in
 * three places that have no other reason to know about each other:
 *
 *   1. `world/CctvFeeds.js`   - paints the door onto camera four's feed,
 *   2. `levels/studyLevel.js` - builds the real door in Level 3,
 *   3. `levels/hallwayBasementLevel.js` - checks the code at the keypad.
 *
 * If any two disagreed the puzzle would not merely break, it would LIE: the
 * player counts correctly and is refused, with no way to tell a miscount from
 * a bug. `SECURITY_CODE` is derived, never typed out by hand.
 */

/**
 * Panels per row, top to bottom. The order IS the reading order -- rows of a
 * door read downward the way any other stack does, so no second clue is
 * needed to say which digit comes first.
 *
 * Distinct counts, so no two rows can be confused for one another. Nothing
 * above 4, because five narrow panels across a 1 m door stop looking like
 * joinery and stop being countable through grain.
 */
export const DOOR_PANEL_ROWS = [2, 4, 3];

/** What the player types at the basement keypad. Derived, never hand-written. */
export const SECURITY_CODE = DOOR_PANEL_ROWS.join('');

/** Fraction of a row's width given over to the gaps between its panels. */
const ROW_GAP_FRACTION = 0.07;

/**
 * Where each panel in a row sits, as fractions of the panel field's width.
 *
 * Returned in normalised 0..1 space so the 3D door and the CCTV painter can
 * both scale it to their own dimensions and end up with the same visual
 * rhythm. Two hand-tuned layouts that merely looked similar would drift the
 * moment either was adjusted -- and here "drift" means the door the player
 * was shown stops matching the door they counted.
 *
 * @param {number} count - panels in this row.
 * @returns {{x: number, width: number}[]} left edge and width of each panel,
 *   in 0..1 across the field.
 */
export function getPanelSpans(count) {
  const gap = ROW_GAP_FRACTION / Math.max(1, count);
  const width = (1 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: i * (width + gap),
    width
  }));
}
