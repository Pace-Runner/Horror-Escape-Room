// =============================================================================
// THE BACKROOMS (between levels)  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "backrooms/clip.m4a"];
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

// ---- the corridor ----------------------------------------------------------

export const dialog_sealed_door = ["The wallpaper runs straight across it. No frame, no handle, no seam. It was never a door.", "backrooms/sealed_door.m4a"];

export const dialog_exit_door_opens = ["The handle turns. Behind you, the humming stops all at once.", "backrooms/exit_door_opens.m4a"];

export const dialog_exit_door_already_open = ["It hangs open. Whatever is past it is not yellow.", "backrooms/exit_door_already_open.m4a"];

// ---- being caught by it ----------------------------------------------------

export const dialog_backrooms_caught = ["It has you. The corridor goes out like a bulb.", "backrooms/caught.m4a"];

export const dialog_backrooms_respawn = ["Back at the mouth of the corridor. It is still in here.", "backrooms/respawn.m4a"];
