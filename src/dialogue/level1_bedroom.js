// =============================================================================
// LEVEL 1 -- THE BEDROOM  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "level1/clip.m4a"];
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

export const dialog_wake = [
  ["You wake up in the dark. Rain, and something colder underneath it.", "level1/wake_1.m4a", 4.4],
  ["Your wrist is chained to the bed frame. You do not remember lying down here.", "level1/wake_2.m4a", 5],
  ["You do not remember this house at all.", "level1/wake_3.m4a"]
];

export const dialog_freed = [
  ["The lock gives. The cuff opens.", "level1/freed_1.m4a", 3],
  ["You stand up. Somewhere in the dark, floorboards creak.", "level1/freed_2.m4a"]
];

export const dialog_bulb_blows = [
  ["The bulb flickers, whines, and blows.", "level1/bulb_blows_1.m4a", 3.2],
  ["Only the lightning now.", "level1/bulb_blows_2.m4a"]
];

export const dialog_flashlight_on = ["The beam is weak and yellow, but it is yours.", "level1/flashlight_on.m4a"];

export const dialog_scratches = [
  ["Something has been scratched into the floorboards. Deep. Over and over.", "level1/scratches_1.m4a", 4.6],
  ["DON'T LET IT OUT", "level1/scratches_2.m4a", 3.6],
  ["The gouges are wide apart. Whatever made them had a long reach.", "level1/scratches_3.m4a"]
];

export const dialog_past_the_door = [
  ["Footsteps. Slow, on the other side of the door.", "level1/past_the_door_1.m4a", 3.6],
  ["Something breathing. Not you.", "level1/past_the_door_2.m4a", 3],
  ["It moves past, and does not stop.", "level1/past_the_door_3.m4a", 3.4],
  ["Get out of this house before it comes back.", "level1/past_the_door_4.m4a"]
];

export const dialog_polaroid = [
  ["A polaroid, stuck to the door frame. A tall black figure, badly out of focus.", "level1/polaroid_1.m4a", 5.2],
  ["Written on the border: PROJECT HOLLOW. June 1987.", "level1/polaroid_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_boarded_door = [
  ["Two planks, nailed diagonally across the door.", "level1/boarded_door_1.m4a", 3.4],
  ["Nailed from the inside.", "level1/boarded_door_2.m4a"]
];

// ---- things you look at and do in the bedroom -------------------------------

export const dialog_radiator = ["An old cast-iron radiator, stone cold. Whatever heated this house stopped working a long time before the power did.", "level1/radiator.m4a"];

export const dialog_polaroid_examine = ["A polaroid of a shadowy figure, stuck to the door frame. Written on it: \"PROJECT HOLLOW\", June 1987.", "level1/polaroid_examine.m4a"];

export const dialog_claw_marks = ["Four deep gouges raked into the wallpaper, at roughly shoulder height. Whatever made them was clawing to get OUT.", "level1/claw_marks.m4a"];

export const dialog_pickup_floor_photo = ["A third photograph, torn at the corner. The family again -- dated 1986.", "level1/pickup_floor_photo.m4a"];

export const dialog_pickup_radiator_photo = ["A damp photograph tucked beside the radiator. The family is younger here — dated 1984.", "level1/pickup_radiator_photo.m4a"];

export const dialog_scratches_examine = ["Scratched into the floorboards, in shaking letters: \"Don't let it out.\"", "level1/scratches_examine.m4a"];

export const dialog_pickup_flashlight = ["You pick up the flashlight.", "level1/pickup_flashlight.m4a"];

export const dialog_lamp_drawer_empty = ["The drawer stands open, empty now.", "level1/lamp_drawer_empty.m4a"];

export const dialog_paperclip_unlocks_cuff = ["You work the paperclip into the cuff's lock... it clicks open.", "level1/paperclip_unlocks_cuff.m4a"];

export const dialog_rug_folded_back = ["You fold back the worn rug. A loose floorboard lies beneath its corner.", "level1/rug_folded_back.m4a"];

export const dialog_floorboard_needs_crowbar = ["One floorboard has been pried loose before. It needs leverage to lift the rest of the way.", "level1/floorboard_needs_crowbar.m4a"];

export const dialog_floorboard_pried_up = ["The crowbar lifts the board. A steel key has been hidden underneath.", "level1/floorboard_pried_up.m4a"];

export const dialog_pickup_bedroom_key = ["A bedroom door key. The lock on the boarded door should take it.", "level1/pickup_bedroom_key.m4a"];

export const dialog_door_planks_floorboard_first = ["The planks can wait. Use the crowbar on the loose floorboard first — the door still needs a key.", "level1/door_planks_floorboard_first.m4a"];

export const dialog_door_planks_pried_off = ["You wedge the crowbar behind the planks and pry them off the door.", "level1/door_planks_pried_off.m4a"];

export const dialog_door_planks_examine = ["Two wooden planks, boarded diagonally. Whatever is in this house trapped you inside.", "level1/door_planks_examine.m4a"];

export const dialog_door_locked_needs_key = ["The planks are gone, but the bedroom door is still locked. A keyhole waits beneath the knob.", "level1/door_locked_needs_key.m4a"];

export const dialog_door_opens = ["The door creaks open on its hinges. You slip out into the dark hallway...", "level1/door_opens.m4a"];

export const dialog_door_hangs_open = ["The door hangs open ahead of you.", "level1/door_hangs_open.m4a"];

export const dialog_bedside_drawer_open = ["The bedside drawer slides open.", "level1/bedside_drawer_open.m4a"];

export const dialog_bedside_drawer_shut = ["The bedside drawer slides shut.", "level1/bedside_drawer_shut.m4a"];

export const dialog_bin_search = ["Just crumpled paper, spilled out when it tipped over. Nothing else in here.", "level1/bin_search.m4a"];

export const dialog_bin_search_again = ["Just crumpled paper left in here.", "level1/bin_search_again.m4a"];

export const dialog_middle_drawer_open = ["The middle drawer slides open.", "level1/middle_drawer_open.m4a"];

export const dialog_middle_drawer_shut = ["The middle drawer slides shut.", "level1/middle_drawer_shut.m4a"];

export const dialog_corkboard_open = ["The corkboard hangs open.", "level1/corkboard_open.m4a"];

export const dialog_corkboard_needs_photos = ["A corkboard with four empty places. You need to find the rest of the family photographs.", "level1/corkboard_needs_photos.m4a"];

export const dialog_corkboard_solved = ["Something clicks nearby... The corkboard swings open on a hidden hinge, revealing a hollow in the wall.", "level1/corkboard_solved.m4a"];

export const dialog_lockbox_opened = ["The brass key fits. Inside is a crowbar and a Project HOLLOW evidence tag.", "level1/lockbox_opened.m4a"];

export const dialog_lockbox_needs_key = ["The box is locked. You need to find a key first.", "level1/lockbox_needs_key.m4a"];

export const dialog_lockbox_locked_tight = ["The box is locked tight. Maybe clues elsewhere will help unlock it.", "level1/lockbox_locked_tight.m4a"];

// ---- the paperclip, and holding the right thing ----------------------------

export const dialog_pickup_paperclip = ["A paperclip, caught between the pillows. Bent straight, it might reach the cuff's lock.", "level1/pickup_paperclip.m4a"];

export const dialog_cuff_hold_paperclip = ["Your fingers find the cuff's tiny keyhole. You need the paperclip in your hand to work it.", "level1/cuff_hold_paperclip.m4a"];

export const dialog_hold_crowbar = ["You need the crowbar in your hand for this.", "level1/hold_crowbar.m4a"];

export const dialog_hold_bedroom_key = ["The lock wants the bedroom key. Take it in your hand.", "level1/hold_bedroom_key.m4a"];

export const dialog_hold_brass_key = ["The brass key would fit this. You need it in your hand.", "level1/hold_brass_key.m4a"];
