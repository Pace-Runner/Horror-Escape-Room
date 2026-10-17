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
// Lines in "quotes" are the player talking; the caption is what they say.
// Full guide: src/dialogue/README.md
// =============================================================================

// ---- the corridor ----------------------------------------------------------

export const dialog_sealed_door = ["The wallpaper runs straight across it. No frame, no handle, no seam. It was never a door.", "backrooms/sealed_door.m4a"];

// Ten seconds of walking into the first crossing.
export const dialog_backrooms_roam = ["\"This room looks familiar. It reminds me of a movie I watched.\"", "backrooms/roam_10sec.m4a"];

// The first three times the player gets a look at the thing in here.
export const dialog_look_at_monster_1 = ["\"Hello? Who are you? Are you okay? ... Okay. It's a fucking ghost.\"", "backrooms/look_monster_1.m4a"];
export const dialog_look_at_monster_2 = ["\"I feel like I'm losing my mind. I know it's there, but it just disappears.\"", "backrooms/look_monster_2.m4a"];
export const dialog_look_at_monster_3 = ["\"Who the fuck are you? Do you know my sister Annabelle? ... I'm losing it.\"", "backrooms/look_monster_3.m4a"];

// Reaching the end of a corridor that goes nowhere. Picked at random.
export const dialog_dead_end_1 = ["\"A dead end. I'll try another way.\"", "backrooms/dead_end_1.m4a"];
export const dialog_dead_end_2 = ["\"This isn't the way out.\"", "backrooms/dead_end_2.m4a"];
export const dialog_dead_end_3 = ["\"I should go back to another room.\"", "backrooms/dead_end_3.m4a"];

export const dialog_exit_door_opens = ["The handle turns. Behind you, the humming stops all at once.", "backrooms/exit_door_opens.m4a"];

// The other crossing's way out: there, solid, and not this time.
export const dialog_exit_door_not_this_way = ["The handle will not turn. Whatever is through this one, it is not your way out.", ""];

export const dialog_exit_door_already_open = ["It hangs open. Whatever is past it is not yellow.", "backrooms/exit_door_already_open.m4a"];

// ---- being caught by it ----------------------------------------------------
// One per catch, in order; after the fifth they come round at random.

export const dialog_backrooms_caught_1 = ["It has you. The corridor goes out like a bulb.", "backrooms/caught_1.m4a"];
export const dialog_backrooms_caught_2 = ["It has you. The corridor goes out like a bulb.", "backrooms/caught_2.m4a"];
export const dialog_backrooms_caught_3 = ["It has you. The corridor goes out like a bulb.", "backrooms/caught_3.m4a"];
export const dialog_backrooms_caught_4 = ["It has you. The corridor goes out like a bulb.", "backrooms/caught_4.m4a"];
export const dialog_backrooms_caught_5 = ["It has you. The corridor goes out like a bulb.", "backrooms/caught_5.m4a"];

// Coming round at the mouth of the maze, same rule.
export const dialog_backrooms_respawn_1 = ["Back at the mouth of the corridor. It is still in here.", "backrooms/respawn_1.m4a"];
export const dialog_backrooms_respawn_2 = ["Back at the mouth of the corridor. It is still in here.", "backrooms/respawn_2.m4a"];
export const dialog_backrooms_respawn_3 = ["Back at the mouth of the corridor. It is still in here.", "backrooms/respawn_3.m4a"];
export const dialog_backrooms_respawn_4 = ["Back at the mouth of the corridor. It is still in here.", "backrooms/respawn_4.m4a"];
