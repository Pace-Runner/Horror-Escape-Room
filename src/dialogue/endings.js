// =============================================================================
// THE ENDINGS  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "endings/clip.m4a"];
//
//   * Change the text, save the file, and the game uses the new text straight
//     away -- no restart.
//   * The second item is the voice clip, relative to src/assets/voice/. Drop a
//     recording there with that name and it plays with the caption. Leave the
//     file missing (or the path "") and the caption simply shows on its own.
//   * Optional third item: seconds to keep the line on screen. Leave it off
//     and the game times it by length.
//   * Several lines in a row:  [ ["line one", "..."], ["line two", "..."] ]
//   * Text in {curly braces} is filled in by the game -- keep those words.
//
// Full guide: src/dialogue/README.md
// =============================================================================

// ---- running out of time (Medium and Hard) ---------------------------------
// Shown even with captions off, because it explains why the game just stopped.

export const dialog_out_of_time = ["Out of time. The lights go out, and the house keeps you.", "endings/out_of_time.m4a", 3.5];

// ---- the two news reports read over the closing pan -----------------------

export const dialog_ending_released = [
  ["\"A female survivor has escaped from an abandoned laboratory after a failed human modification experiment, named Project HOLLOW, escaped into the world.\"", "endings/released_1.m4a", 8],
  ["\"Police advise all residents to stay locked in their homes while officers attempt to locate and neutralise the target. The creature is highly dangerous.\"", "endings/released_2.m4a", 8]
];

export const dialog_ending_contained = [
  ["\"A woman has been found dead in an abandoned house after a failed human modification experiment created a creature known as Project HOLLOW.\"", "endings/contained_1.m4a", 8],
  ["\"The creature trapped itself inside the house, stopping itself from reaching the outside world, but killing all survivors. Police are on scene attempting to neutralise the target.\"", "endings/contained_2.m4a", 9]
];
