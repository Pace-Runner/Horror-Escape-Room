// =============================================================================
// LEVEL 3 -- THE STUDY  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "level3/clip.m4a"];
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

// ---- story beats ----------------------------------------------------------

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_study_arrival = [
  ["The study. Bookshelves, a desk, portraits, and the front door.", "level3/study_arrival_1.m4a", 4.4],
  ["Three locks on it. All three have to come off.", "level3/study_arrival_2.m4a"]
];

export const dialog_visor_found = [
  ["A visor, face down on the floor. The lenses are blue and very thick.", "level3/visor_found_1.m4a", 4.6],
  ["Someone ground these to a prescription.", "level3/visor_found_2.m4a"]
];

export const dialog_visor_first_worn = [
  ["The room does not change so much as settle.", "level3/visor_first_worn_1.m4a", 3.6],
  ["Writing on the walls that was not there. Footmarks across the floor.", "level3/visor_first_worn_2.m4a", 4.6],
  ["None of it is new. You simply were not seeing it.", "level3/visor_first_worn_3.m4a"]
];

export const dialog_visor_removed = ["You take the visor off, and the room goes back to being wrong.", "level3/visor_removed.m4a"];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_creature_flees = [
  ["It is standing where you came in.", "level3/creature_flees_1.m4a", 2.8],
  ["You step toward it and it breaks and runs.", "level3/creature_flees_2.m4a", 3.4],
  ["It is faster than you, and it is running away.", "level3/creature_flees_3.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_third_lock_needs_visor = [
  ["The third lock has no keyhole you can see.", "level3/third_lock_needs_visor_1.m4a", 3.4],
  ["Not without the visor on.", "level3/third_lock_needs_visor_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_portrait_fourth = [
  ["The family photograph from the bedroom, hanging here.", "level3/portrait_fourth_1.m4a", 3.8],
  ["Through the lenses there is a fourth person in it.", "level3/portrait_fourth_2.m4a", 3.6],
  ["Scratched out with marker, hard enough to go through the paper.", "level3/portrait_fourth_3.m4a"]
];

export const dialog_shadow_wrong = [
  ["The last lock turns. Lights come up across the room.", "level3/shadow_wrong_1.m4a", 4],
  ["Your shadow reaches further up the wall than you do.", "level3/shadow_wrong_2.m4a", 4.2],
  ["The arms are too long.", "level3/shadow_wrong_3.m4a", 2.8],
  ["You take the visor off, and the shadow is a person again.", "level3/shadow_wrong_4.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_porch_fence = [
  ["A fence door across the porch, padlocked.", "level3/porch_fence_1.m4a", 3.4],
  ["The key is not on this side of it.", "level3/porch_fence_2.m4a"]
];

export const dialog_mirror = [
  ["A mirror, on the wall past the door.", "level3/mirror_1.m4a", 3],
  ["Every other mirror in this house is broken. This one is not.", "level3/mirror_2.m4a", 4.4],
  ["You look into it.", "level3/mirror_3.m4a", 3],
  ["Long arms. Thin body. Hunched back. Long fingers.", "level3/mirror_4.m4a", 4.4],
  ["It is the sketch from the basement.", "level3/mirror_5.m4a", 3.4],
  ["It is you. It has been you the entire time.", "level3/mirror_6.m4a"]
];

export const dialog_realisation = [
  ["The scratches in the bedroom floor. You made them, trying to get out.", "level3/realisation_1.m4a", 4.8],
  ["The broken mirrors. You broke them, so you would not have to see this.", "level3/realisation_2.m4a", 5],
  ["The figure in the photograph, scratched out. That was you, before.", "level3/realisation_3.m4a", 4.8],
  ["It was never hunting you.", "level3/realisation_4.m4a", 3],
  ["Every time it ran, it was getting away from you. Every time it blocked a door, it was keeping you in.", "level3/realisation_5.m4a"]
];

export const dialog_annabelle = [
  ["The figure in the corner stands up.", "level3/annabelle_1.m4a", 3.2],
  ["It is not a monster. It is a woman, and she is bleeding.", "level3/annabelle_2.m4a", 4.4],
  ["She is the woman from the family photograph.", "level3/annabelle_3.m4a", 3.8],
  ["She is your sister.", "level3/annabelle_4.m4a"]
];

export const dialog_the_choice = [
  ["\"I need to get out.\"", "level3/the_choice_1.m4a", 3.6],
  ["The front door is unlocked. Nothing is stopping you now.", "level3/the_choice_2.m4a"]
];

// ---- the four cassette tapes (spoken by Annabelle) -------------------------

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_tape_1 = ["\"If you’re hearing this, the locks didn’t hold.\"", "level3/tape_1.m4a", 4.2];
// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_tape_2 = ["\"Do not let it reach the front door.\"", "level3/tape_2.m4a", 4];
// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_tape_3 = ["\"It can’t see what we’re seeing. It is getting worse. It doesn’t recognise us anymore.\"", "level3/tape_3.m4a", 6];
// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_tape_4 = ["\"If I forget again, don’t let me—\"", "level3/tape_4.m4a", 4.4];

// ---- things you look at and do in the study ---------------------------------

export const dialog_porch_gate_locked = [
  ["The porch. Rain, and the treeline past the fence.", "level3/porch_gate_locked_1.m4a"],
  ["The gate is padlocked, and the key is not on this side of it.", "level3/porch_gate_locked_2.m4a"]
];

export const dialog_pickup_gate_key = [
  ["A key, hanging on the side of the mirror frame.", "level3/pickup_gate_key_1.m4a"],
  ["It has been there the whole time. You simply could not see it.", "level3/pickup_gate_key_2.m4a"]
];

export const dialog_letter_blank_without_visor = ["A sheet of paper, face up on the boards. Blank on both sides.", "level3/letter_blank_without_visor.m4a"];

export const dialog_mirror_without_visor = ["The first mirror in this house that is not cracked. Your reflection looks like you.", "level3/mirror_without_visor.m4a"];

export const dialog_visor_not_carried = ["You are not carrying anything to see with.", "level3/visor_not_carried.m4a"];

// ---- being caught by it in the study ---------------------------------------

export const dialog_caught_hauled_back = ["Something closes around your arm and hauls you back.", "level3/caught_hauled_back.m4a"];

export const dialog_caught_back_by_door = ["You're back by the door. Whatever had you has let go.", "level3/caught_back_by_door.m4a"];

// ---- locks, drawers and the portrait ---------------------------------------

export const dialog_drawer_empty = ["Empty now, apart from paperclips and a dried-out pen.", "level3/drawer_empty.m4a"];

export const dialog_drawer_opened = ["The drawer sticks, then gives. A door key, and a note folded in half.", "level3/drawer_opened.m4a"];

export const dialog_portrait_with_visor = ["The same photograph from the bedroom. Four people now. The fourth has been scratched out with marker.", "level3/portrait_with_visor.m4a"];

export const dialog_portrait_without_visor = ["The same family photo from the bedroom. Three people, and the same gap on the end.", "level3/portrait_without_visor.m4a"];

export const dialog_deadbolt_no_key = ["A keyed deadbolt. There is no key in it.", "level3/deadbolt_no_key.m4a"];

export const dialog_deadbolt_opened = ["The key turns. The deadbolt comes back with a clack.", "level3/deadbolt_opened.m4a"];

export const dialog_combination_opened = ["Four digits, and the shackle springs.", "level3/combination_opened.m4a"];

export const dialog_third_lock_visor_off = ["You cannot find the keyway. You know it is there. Put the visor on.", "level3/third_lock_visor_off.m4a"];

export const dialog_third_lock_no_visor = ["Your hand goes to the lock and finds nothing to put it in. There is no keyhole on this one.", "level3/third_lock_no_visor.m4a"];

export const dialog_third_lock_opened = ["Through the lenses there is a keyway, exactly where your hand kept going. It turns.", "level3/third_lock_opened.m4a"];

export const dialog_lock_already_open = ["Already open.", "level3/lock_already_open.m4a"];

export const dialog_front_door_one_lock_left = ["One lock still holds it.", "level3/front_door_one_lock_left.m4a"];

export const dialog_front_door_locks_left = ["{count} of the three locks still hold it.", "level3/front_door_locks_left.m4a"];

export const dialog_front_door_opens = ["Every bolt is back. The door comes off its frame and swings in.", "level3/front_door_opens.m4a"];

export const dialog_fence_gate_locked_visor = ["Padlocked. The key is not on this side of it.", "level3/fence_gate_locked_visor.m4a"];

export const dialog_fence_gate_locked = ["A padlocked gate across the porch. The key is not in it, and not on the ground.", "level3/fence_gate_locked.m4a"];

export const dialog_fence_gate_opens = ["The padlock opens. The gate swings out into the rain.", "level3/fence_gate_opens.m4a"];
