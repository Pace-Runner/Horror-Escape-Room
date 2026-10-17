// =============================================================================
// LEVEL 2 -- THE HALLWAY AND THE BASEMENT  --  every line of dialogue for this part of the game.
//
//   export const dialog_name = ["What the caption says.", "level2/clip.m4a"];
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

// Starts with the lightning. The creature stands there for 3 seconds, so the
// first line holds 2.6 -- the second one comes up just as it vanishes.
export const dialog_hallway_sighting = [
  ["The lightning catches something at the end of the hallway.", "level2/hallway_sighting_1.m4a", 2.6],
  ["Tall. Wrong. Watching you.", "level2/hallway_sighting_2.m4a", 2.8],
  ["Then the dark comes back, and it is gone.", "level2/hallway_sighting_3.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_basement_arrival = [
  ["The house stops being a house.", "level2/basement_arrival_1.m4a", 3.2],
  ["Concrete, pipes, cable trays. Someone built a laboratory under this place.", "level2/basement_arrival_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_cctv_no_power = [
  ["Five camera feeds. Every one of them static.", "level2/cctv_no_power_1.m4a", 3.6],
  ["No power.", "level2/cctv_no_power_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_sticky_note = ["A sticky note on the corner of the screen: \"Restore power and pray it doesn’t hear you.\"", "level2/sticky_note.m4a"];

export const dialog_creature_sketch = [
  ["A sketch, done fast and pressed hard enough to tear the paper.", "level2/creature_sketch_1.m4a", 4.2],
  ["Long arms. Thin body. Hunched back. A head at the wrong angle.", "level2/creature_sketch_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_restraints = [
  ["The arm restraints are broken outward.", "level2/restraints_1.m4a", 3.4],
  ["Whatever was strapped into this chair did not need a key.", "level2/restraints_2.m4a"]
];

export const dialog_power_restored = [
  ["Lights come up in stages down the room.", "level2/power_restored_1.m4a", 3.4],
  ["The monitor on the desk has power now. The door at the far end does not.", "level2/power_restored_2.m4a"]
];

export const dialog_blackout = [
  ["A lever is thrown somewhere in the dark, and the lab dies all at once.", "level2/blackout_1.m4a", 4.2],
  ["The lights. The cameras. All of it.", "level2/blackout_2.m4a", 3.2],
  ["That was not a fault. Something reached the panel before you did.", "level2/blackout_3.m4a"]
];

export const dialog_generator_running = [
  ["The engine catches and holds.", "level2/generator_running_1.m4a", 3],
  ["There is current at the breaker panel now. Nothing else has any.", "level2/generator_running_2.m4a"]
];

export const dialog_power_routed = [
  ["The panel takes the load and holds it.", "level2/power_routed_1.m4a", 3.2],
  ["Light comes back the length of the room, and bolts move in the far wall.", "level2/power_routed_2.m4a", 4.2],
  ["On the monitor, the rooms upstairs come up one by one.", "level2/power_routed_3.m4a"]
];

export const dialog_breaker_overload = ["Every light in the room blows out white, and the panel drops itself.", "level2/breaker_overload.m4a"];

export const dialog_cctv_dash = [
  ["Something crosses the hallway feed, fast, and is gone.", "level2/cctv_dash_1.m4a", 3.8],
  ["It is upstairs. It is between you and the way you came in.", "level2/cctv_dash_2.m4a"]
];

export const dialog_cctv_basement = [
  ["Camera five is this room.", "level2/cctv_basement_1.m4a", 2.8],
  ["There is a figure standing in it. Standing where you are standing.", "level2/cctv_basement_2.m4a", 4.6],
  ["The feed goes to static.", "level2/cctv_basement_3.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_metal_door_unlocks = ["Bolts move somewhere in the wall. The metal door is unlocked.", "level2/metal_door_unlocks.m4a"];

export const dialog_creature_corner = [
  ["It is in the corner of the room, and it has been for some time.", "level2/creature_corner_1.m4a", 4.4],
  ["It does not move toward you. It only watches.", "level2/creature_corner_2.m4a", 4],
  ["Then it turns and goes, back the way you came.", "level2/creature_corner_3.m4a"]
];

export const dialog_black_pool = [
  ["It has left a pool of something black where it stood.", "level2/black_pool_1.m4a", 3.8],
  ["It is hurt.", "level2/black_pool_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_video_camera = [
  ["A video camera, almost out of battery. One recording on it.", "level2/video_camera_1.m4a", 4.2],
  ["CONTAINMENT BREACH — JANUARY 1987. Five months before the polaroid.", "level2/video_camera_2.m4a"]
];

// NOT USED IN THE GAME YET -- written for a beat that has not been hooked up,
// so editing this changes nothing you will see until it is.
export const dialog_video_played = [
  ["The same room, when it was still a laboratory. Sparks, fire in the corner, alarms.", "level2/video_played_1.m4a", 5.4],
  ["Something crosses the frame too fast to read.", "level2/video_played_2.m4a", 3.2],
  ["Then it runs straight into the camera, and the tape ends.", "level2/video_played_3.m4a"]
];

// ---- things you look at and do in the hallway and basement ------------------

export const dialog_fuse_cover_first_open = ["The cover sticks, then swings out on stiff hinges. Three fuses, and one pair of empty clips.", "level2/fuse_cover_first_open.m4a"];

export const dialog_fuse_cover_open = ["You swing the cover open.", "level2/fuse_cover_open.m4a"];

export const dialog_fuse_cover_shut = ["You swing the cover shut.", "level2/fuse_cover_shut.m4a"];

export const dialog_fuse_already_seated = ["The 30A fuse is seated and holding. Whatever went wrong, it is further down the line.", "level2/fuse_already_seated.m4a"];

export const dialog_fuse_pulled_out = ["You pull the {amps} fuse back out. The lab settles back to normal.", "level2/fuse_pulled_out.m4a"];

export const dialog_dropped_fuse_blown = ["This fuse is blown.", "level2/dropped_fuse_blown.m4a"];

export const dialog_dropped_fuse_overrated = ["This fuse's rating is too high. Try another one.", "level2/dropped_fuse_overrated.m4a"];

export const dialog_fuse_slot_empty = ["An empty slot. It needs a fuse -- the right one.", "level2/fuse_slot_empty.m4a"];

export const dialog_fuse_clicks_in = ["The fuse clicks in. The lights come up the length of the room.", "level2/fuse_clicks_in.m4a"];

export const dialog_fuse_burns_out = ["The {amps} fuse can't take the load -- it flares and burns out.", "level2/fuse_burns_out.m4a"];

export const dialog_fuse_rating_too_high = ["The {amps} fuse's rating is too high -- every light in the lab surges into a blinding white glare.", "level2/fuse_rating_too_high.m4a"];

export const dialog_fuse_already_holding = ["You're already holding a fuse. Install or remove it at the fuse box first.", "level2/fuse_already_holding.m4a"];

export const dialog_fuse_taken = ["You take the {amps} fuse.", "level2/fuse_taken.m4a"];

export const dialog_maintenance_log = ["\"REPLACE BLOWN FUSE. CORRECT RATING ONLY -- anything else will blow, or burn the line.\"", "level2/maintenance_log.m4a"];

export const dialog_generator_valve = ["The valve turns without a sound. Is it the last quiet thing you do down here?", "level2/generator_valve.m4a"];

export const dialog_generator_primer = ["The stroke of the primer bangs through the pipes.", "level2/generator_primer.m4a"];

export const dialog_generator_catches = ["The engine catches and the noise of it fills everything. Then the breaker panel hums.", "level2/generator_catches.m4a"];

export const dialog_generator_leave_it_alone = ["The generator is running. Leave it alone.", "level2/generator_leave_it_alone.m4a"];

export const dialog_generator_turning_over = ["The generator is turning over on its own. Nothing here needs restarting.", "level2/generator_turning_over.m4a"];

export const dialog_generator_wrong_order = ["It coughs, floods and dies. Wrong order -- and the noise carried anyway.", "level2/generator_wrong_order.m4a"];

export const dialog_starter_first_pull = ["The cord rips out and snaps back. The engine coughs once, and dies.", "level2/starter_first_pull.m4a"];

export const dialog_starter_later_pull = ["It catches -- roars for one second -- and dies. The sound goes up through the whole house.", "level2/starter_later_pull.m4a"];

export const dialog_restart_plate = ["\"RESTART ORDER: 1. FUEL VALVE. 2. PRIME. 3. STARTER.\"", "level2/restart_plate.m4a"];

export const dialog_breaker_panel_trips = ["Over {capacity}A. The panel blows white and drops every breaker it has.", "level2/breaker_panel_trips.m4a"];

export const dialog_breaker_panel_takes_load = ["The panel takes the load. Light comes back the length of the room, and bolts move in the far wall.", "level2/breaker_panel_takes_load.m4a"];

export const dialog_breakers_all_fed = ["Everything that needs feeding is fed. Leave it.", "level2/breakers_all_fed.m4a"];

export const dialog_breakers_already_up = ["Every breaker is already up. Whatever is wrong down here, it is not this panel.", "level2/breakers_already_up.m4a"];

export const dialog_breakers_dead = ["Dead switches. There is no current reaching this panel.", "level2/breakers_dead.m4a"];

export const dialog_breaker_panel_not_reset = ["The panel has not reset yet.", "level2/breaker_panel_not_reset.m4a"];

export const dialog_breaker_load_over = ["{drawn}A set against a {capacity}A panel. That will not hold.", "level2/breaker_load_over.m4a"];

export const dialog_breaker_load_spare = ["{drawn}A set. {spare}A spare.", "level2/breaker_load_spare.m4a"];

export const dialog_main_lever_already_routed = ["Already up. The panel is carrying everything it is going to.", "level2/main_lever_already_routed.m4a"];

export const dialog_main_lever_already_up = ["The main lever is already up. Whatever is wrong down here, it is not this panel.", "level2/main_lever_already_up.m4a"];

export const dialog_main_lever_dead = ["The main will not move. Nothing is reaching this panel.", "level2/main_lever_dead.m4a"];

export const dialog_main_lever_drops_back = ["The lever goes up and drops straight back. {missing} still off.", "level2/main_lever_drops_back.m4a"];

export const dialog_breaker_panel_hums = ["The panel hums under its load. Leave it.", "level2/breaker_panel_hums.m4a"];

export const dialog_breaker_panel_examine = ["Five labelled breakers under a cover, and the main lever on the side. The panel is rated {capacity}A.", "level2/breaker_panel_examine.m4a"];

export const dialog_breaker_panel_knocked_down = ["Every breaker has been knocked down, and the main lever with them. Someone was here.", "level2/breaker_panel_knocked_down.m4a"];

export const dialog_breaker_panel_all_up = ["Five breakers in a row, every one of them up, and a main lever on the side, up too.", "level2/breaker_panel_all_up.m4a"];

export const dialog_breaker_cover_lift = ["The smoked cover lifts on a stiff hinge and stays up.", "level2/breaker_cover_lift.m4a"];

export const dialog_breaker_cover_lower = ["You lower the cover over the breakers.", "level2/breaker_cover_lower.m4a"];

export const dialog_load_chart = ["\"MAX {capacity}A TOTAL. {circuits}. DO NOT EXCEED.\"", "level2/load_chart.m4a"];

export const dialog_monitor_button_no_power = ["You press the power button. Nothing. There is no power down here.", "level2/monitor_button_no_power.m4a"];

export const dialog_monitor_button_power_gone = ["You press the power button. Nothing. The power has gone again.", "level2/monitor_button_power_gone.m4a"];

export const dialog_monitor_switched_on = ["The button clicks in and glows green. The tube whines, and a line of light opens into a picture.", "level2/monitor_switched_on.m4a"];

export const dialog_monitor_dead = ["An old CRT, dead. Nothing on this desk has power.", "level2/monitor_dead.m4a"];

export const dialog_monitor_dark_again = ["The screen is dark. It was showing you the house a minute ago.", "level2/monitor_dark_again.m4a"];

export const dialog_monitor_off = ["The monitor is off. The power button is on the front, under the screen.", "level2/monitor_off.m4a"];

export const dialog_monitor_feeds_live = ["Five feeds, live now. The kitchen. A hallway. The porch. A study. And this room.", "level2/monitor_feeds_live.m4a"];

export const dialog_remote_dead = ["The remote is dead. Nothing on this desk has power.", "level2/remote_dead.m4a"];

export const dialog_remote_monitor_off = ["The remote clicks, but the monitor is switched off.", "level2/remote_monitor_off.m4a"];

export const dialog_sticky_note_examine = ["Restore power and pray it doesn't hear you.", "level2/sticky_note_examine.m4a"];

export const dialog_door_bolts_unpowered = ["Heavy bolts, seated deep in the frame. Nothing is feeding them.", "level2/door_bolts_unpowered.m4a"];

export const dialog_metal_door_opens = ["The door unlocks with a heavy clunk. You head deeper into the house.", "level2/metal_door_opens.m4a"];

export const dialog_security_lockout_released = ["The lockout releases. Bolts run back into the frame.", "level2/security_lockout_released.m4a"];

export const dialog_door_note = ["\"SECURITY LOCKOUT. I will forget this. The study door will not. In what it wears, top row down, lies your way out.\"", "level2/door_note.m4a"];

export const dialog_room_goes_out = ["The room goes out. All of it, in one snap.", "level2/room_goes_out.m4a"];

export const dialog_black_pool_examine = ["Whatever it is, it is not water, and it is still wet.", "level2/black_pool_examine.m4a"];

export const dialog_torn_notes = ["\"SUBJECT UNSTABLE. CONTAINMENT REQUIRED. MEMORY DETERIORATION OBSERVED. VISUAL DISTORTION INCREASING.\"", "level2/torn_notes.m4a"];

export const dialog_operating_table = ["Straps at the wrists, the chest, the ankles. The ankle cuffs have been unbuckled, and so has the far wrist. This wrist was not. Its strap is torn straight through.", "level2/operating_table.m4a"];

export const dialog_surgical_lamp_no_power = ["The switch in the handle clicks over. Nothing. There is no power down here.", "level2/surgical_lamp_no_power.m4a"];

export const dialog_surgical_lamp_dead = ["The switch clicks over. Nothing. The lamp is as dead as the rest of the lights.", "level2/surgical_lamp_dead.m4a"];

export const dialog_surgical_lamp_lit = ["The lamp stutters, then floods the table white. Every strap on it throws a shadow.", "level2/surgical_lamp_lit.m4a"];

export const dialog_instrument_trolley = ["Scalpels, forceps, a bone saw, laid out ready. The gauze has been used.", "level2/instrument_trolley.m4a"];

export const dialog_instrument_trolley_fallen = ["Knocked flat. Everything that was laid out on it is across the floor now.", "level2/instrument_trolley_fallen.m4a"];

// When the trolley is shoved too far and goes over.
export const dialog_trolley_crash = [
  ["The trolley goes over. Steel and glass across the concrete, loud enough to fill the whole basement.", "level2/trolley_crash_1.m4a"],
  ["Then nothing. If anything else is down here, it heard that.", "level2/trolley_crash_2.m4a"]
];

// ---- hints (the H key) ------------------------------------------------------
// Shown one at a time, vaguest first; pressing H again on the same puzzle gives
// the next, more direct one. Hints always show, even with captions turned off.
// The order they are asked about is set in src/levels/basementHints.js.

export const dialog_hint_basement_all_solved = ["Nothing left to work out down here. Get through the metal door.", ""];

export const dialog_hint_fuse_1 = ["Nothing down here has power. Find the fuse box, and the note about it on the wall.", ""];
export const dialog_hint_fuse_2 = ["The maintenance log wants the correct rating only. Four fuses lie loose on the workbench -- the wrong ones blow or burn the line.", ""];
export const dialog_hint_fuse_3 = ["Open the fuse box cover and seat the 30A fuse in the empty slot.", ""];

export const dialog_hint_go_to_door_1 = ["The lights are back. The metal door at the far end of the lab is the way out.", ""];
export const dialog_hint_go_to_door_2 = ["Walk up to the metal door and try it.", ""];

export const dialog_hint_generator_1 = ["Someone threw the main. The generator in the corner has to be started again.", ""];
export const dialog_hint_generator_2 = ["The note above the generator's controls gives the restart order. Its green lamps show how far you have got.", ""];
export const dialog_hint_generator_3 = ["Fuel valve, then prime, then the starter. Keep pulling the starter until it catches.", ""];

export const dialog_hint_breakers_1 = ["The generator is running, but the power goes nowhere yet. Find the breaker panel and its load chart.", ""];
export const dialog_hint_breakers_2 = ["The panel only carries 60A. Switch on just the circuits you need to get out, then push the main lever up.", ""];
export const dialog_hint_breakers_3 = ["Lift the cover, switch on DOOR, CCTV and LIGHTING only -- leave LOCKS and VENT off -- then push the main lever on the side up.", ""];

export const dialog_hint_code_1 = ["The door has power, but a lockout holds it. Read the note taped to it.", ""];
export const dialog_hint_code_2 = ["The note means the study's front door. Switch on the monitor (the button under the screen) and use the remote to find the study camera.", ""];
export const dialog_hint_code_3 = ["On the study camera, count the raised panels in each row of the door, top row first. That is the code.", ""];
export const dialog_hint_code_4 = ["The code is {code}. Enter it at the metal door.", ""];

export const dialog_hint_basement_exit_1 = ["The lockout is off. Open the metal door.", ""];