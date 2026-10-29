// =============================================================================
// THE UPSTAIRS HALLWAY  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "hallway/clip.m4a"];
//
//   * Change the text, save the file, and the game uses the new text straight
//     away -- no restart.
//   * The second item is the voice clip, relative to src/assets/voice/. Drop a
//     recording there with that name and it plays with the caption. Leave the
//     file missing (or the path "") and the caption simply shows on its own.
//   * Optional third item: seconds to keep the line on screen. Leave it off
//     and the game times it by length.
//   * Several lines in a row:  [ ["line one", "..."], ["line two", "..."] ]
//
// The words ON the walls (the clipping, the blueprint, the note) are in
// src/story/hallway.js. Full guide: src/dialogue/README.md
// =============================================================================

// ---- story beats ----------------------------------------------------------

export const dialog_hallway_enter = [
  ["The bedroom door swings shut behind you.", "hallway/enter_1.m4a", 3],
  ["A long hallway. Pictures on the walls, a staircase at the far end going down.", "hallway/enter_2.m4a"],
  ["Somewhere below, something is moving.", "hallway/enter_3.m4a"]
];

// ---- examining things -------------------------------------------------------

export const dialog_hallway_bedroom_door = ["The room you woke up in. You are not going back in there.", "hallway/bedroom_door.m4a"];

export const dialog_hallway_locked_nursery = ["Locked. Something about this door makes me glad it won't open.", "hallway/locked_nursery.m4a"];

export const dialog_hallway_locked_bathroom = ["Locked. Something heavy has been pushed against it from the other side.", "hallway/locked_bathroom.m4a"];

export const dialog_hallway_window = ["Rain, and the lane, and nothing else for miles. The window is nailed shut.", "hallway/window.m4a"];

export const dialog_hallway_lamp = ["Someone left this lamp on. It is the only warm thing up here.", "hallway/lamp.m4a"];

export const dialog_hallway_claws = ["Gouges in the wallpaper, at about head height. Long fingers, dragged slowly.", "hallway/claws.m4a"];

export const dialog_hallway_stairs = ["The stairs go down into the dark. The air coming up smells of damp concrete.", "hallway/stairs.m4a"];

export const dialog_hallway_go_down = ["You take the stairs down.", "hallway/go_down.m4a", 2.2];

// ---- hints (the H key) ------------------------------------------------------

export const dialog_hint_hallway_1 = ["Look at what is on the walls if you like. The way on is the staircase at the far end.", ""];
export const dialog_hint_hallway_all_solved = ["The staircase at the far end leads down.", ""];
