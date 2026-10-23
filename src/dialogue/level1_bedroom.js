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

export const dialog_lamp_examine = ["The lamp is not quite dead. The bulb stutters on and off in little bursts, as if it is counting something.", "level1/lamp_examine.m4a"];

export const dialog_lamp_drawer_empty = ["The drawer stands open, empty now.", "level1/lamp_drawer_empty.m4a"];

export const dialog_paperclip_unlocks_cuff = ["You work the paperclip into the cuff's lock... it clicks open.", "level1/paperclip_unlocks_cuff.m4a"];

export const dialog_rug_folded_back = ["You fold back the worn rug. A loose floorboard lies beneath its corner.", "level1/rug_folded_back.m4a"];

export const dialog_floorboard_needs_crowbar = ["One floorboard has been pried loose before. It needs leverage to lift the rest of the way.", "level1/floorboard_needs_crowbar.m4a"];

export const dialog_floorboard_pried_up = ["The crowbar lifts the board. A steel key has been hidden underneath.", "level1/floorboard_pried_up.m4a"];

export const dialog_pickup_bedroom_key = ["A bedroom door key. The lock on the boarded door should take it.", "level1/pickup_bedroom_key.m4a"];


export const dialog_door_planks_pried_off = ["You wedge the crowbar behind the planks and pry them off the door.", "level1/door_planks_pried_off.m4a"];

export const dialog_door_planks_examine = ["Two wooden planks, boarded diagonally. Whatever is in this house trapped you inside.", "level1/door_planks_examine.m4a"];

// Trying the door again while it is still locked: one of these at random each
// time, never the same twice running. 2 is only said while the planks are on,
// 3 only once they are off (see the door in levels/bedroomLevel.js).
export const dialog_open_door_locked_1 = ["\"I need to unlock this door so I can find Annabelle.\"", "level1/open_door_locked_1.m4a"];
export const dialog_open_door_locked_2 = ["\"I need to find something to break down these planks of wood.\"", "level1/open_door_locked_2.m4a"];
export const dialog_open_door_locked_3 = ["\"It is still locked. The key might be hidden.\"", "level1/open_door_locked_3.m4a"];

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

export const dialog_corkboard_pinned = ["You pin the photograph in an empty place. {left} to go.", "level1/corkboard_pinned.m4a"];

export const dialog_corkboard_hold_photo = ["Take a photograph out to pin it to the board.", "level1/corkboard_hold_photo.m4a"];

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

// ---- hints (H key) -----------------------------------------------------------
// What the player sees when they press H. Each puzzle has a few, vaguest first:
// pressing H again on the same puzzle gives the next, more direct one. Which
// puzzle they are on is worked out by src/levels/bedroomHints.js.
// No voice clips by default -- hints are read, not performed.

export const dialog_hint_nudge = ["Stuck? Press H for a hint.", ""];

// Shown when H is pressed anywhere other than the bedroom.
export const dialog_hint_unavailable = ["No hints for this part. Trust your eyes.", ""];

export const dialog_hint_all_solved = ["Nothing left to find in here. Get through the door.", ""];

export const dialog_hint_paperclip_1 = ["Your free hand can still reach the pillows. Feel around them.", ""];
export const dialog_hint_paperclip_2 = ["Something small and metal is caught between the pillows. Pick it up.", ""];

export const dialog_hint_cuff_1 = ["A bent paperclip could work the cuff's lock.", ""];
export const dialog_hint_cuff_2 = ["Take the paperclip in your hand (scroll wheel), then look at the cuff and press E.", ""];

export const dialog_hint_flashlight_1 = ["You need light to search this room. Something on the bedside table could help.", ""];
export const dialog_hint_flashlight_2 = ["The flashlight is on the bedside table beside the bed, next to the lamp.", ""];

export const dialog_hint_photos_1 = ["The corkboard on the wall has four empty places. The family's photographs are scattered around the room.", ""];
export const dialog_hint_photos_2 = ["You have {found} of {needed} photographs. Check the floor, and open the drawers.", ""];
export const dialog_hint_photos_where = ["Still missing: {places}.", ""];
export const dialog_hint_photo_place_radiator = ["one leaning against the radiator under the window", ""];
export const dialog_hint_photo_place_bedside_drawer = ["one in the bedside drawer", ""];
export const dialog_hint_photo_place_floor = ["one on the floor beside the corkboard", ""];
export const dialog_hint_photo_place_vanity_drawer = ["one in the vanity's middle drawer", ""];

export const dialog_hint_corkboard_1 = ["You have all four photographs. Hold each one up to the corkboard to pin it.", ""];
export const dialog_hint_corkboard_2 = ["Each photograph has a year printed on it. Pin them in order, oldest first.", ""];

export const dialog_hint_lamp_1 = ["The lamp on the bedside table is not quite dead. Watch it for a while.", ""];
export const dialog_hint_lamp_2 = ["The flicker is not random. It blinks in groups, with pauses between. Count each group: that is the code for the locked drawer under it.", ""];
// {blinks} and {code} are filled from the lamp's real code, e.g. "3, then 1, then 5" and "315".
export const dialog_hint_lamp_3 = ["The lamp blinks {blinks}. Enter {code} on the drawer under it.", ""];

export const dialog_hint_lockbox_1 = ["The hollow behind the corkboard holds a locked box. You have a key that might fit.", ""];
export const dialog_hint_lockbox_2 = ["Take the brass key in your hand and open the box behind the corkboard.", ""];

export const dialog_hint_floorboard_1 = ["One corner of the rug does not lie flat. Something might be under it.", ""];
export const dialog_hint_floorboard_2 = ["Lift the rug's corner. There is a loose floorboard beneath it.", ""];
export const dialog_hint_floorboard_3 = ["Take the crowbar in your hand and pry up the loose floorboard under the rug.", ""];

export const dialog_hint_bedroom_key_1 = ["Something was hidden under that floorboard. Pick it up.", ""];

export const dialog_hint_planks_1 = ["The door is boarded shut. The crowbar could take the planks off.", ""];
export const dialog_hint_planks_2 = ["Take the crowbar in your hand and use it on the boarded door.", ""];

export const dialog_hint_door_1 = ["The planks are gone. Take the bedroom key in your hand and unlock the door.", ""];
