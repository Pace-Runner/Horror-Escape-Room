// src/story/hints.js
//
// Contextual H-key hints.
// Each puzzle has three hints:
//   0 = subtle nudge
//   1 = stronger direction
//   2 = near-explicit / giveaway
//
// Repeated H presses for the SAME unsolved puzzle should progress:
// Hint 1 -> Hint 2 -> Hint 3.
//
// Hint progress should reset/change when the active puzzle changes.
// Solved puzzles should no longer return hints.

export const HINTS = {

  // =========================================================
  // LEVEL 1 — BEDROOM
  // =========================================================

  l1_cuff: [
    "Something small and thin could fit inside the cuff lock.",
    "Check around the bed for something narrow enough to use as a pick.",
    "Use the paperclip on the cuff."
  ],

  l1_flashlight: [
    "The room is too dark to search properly.",
    "There was a flashlight somewhere nearby.",
    "Check the side table for the flashlight."
  ],

  l1_polaroids: [
    "The photographs have dates for a reason.",
    "Try arranging the Polaroids from earliest to latest.",
    "Place the four photographs in chronological order."
  ],

  l1_lamp_code: [
    "The lamp keeps repeating the same pattern.",
    "Count the flashes in each group.",
    "The lamp is giving you the code: 3–1–5."
  ],

  l1_locked_drawer: [
    "The drawer uses a three-digit combination.",
    "Something in the room is repeatedly showing three numbers.",
    "Enter 315 on the drawer lock."
  ],

  l1_hidden_chest: [
    "The opened photo board revealed more than just wall space.",
    "There’s a locked chest inside the hidden compartment.",
    "The brass key from the drawer opens the chest."
  ],

  l1_door_planks: [
    "The boards won’t come off by hand.",
    "You need something designed for prying.",
    "Use the crowbar on the door planks."
  ],

  l1_floorboard: [
    "One part of the floor doesn’t sit quite right.",
    "Check beneath the rug.",
    "Lift the rug and use the crowbar on the loose floorboard."
  ],

  l1_bedroom_door: [
    "The planks are only part of the problem.",
    "The bedroom door is still locked.",
    "The key beneath the floorboard unlocks the bedroom door."
  ],

  // =========================================================
  // HALLWAY
  // =========================================================

  hallway_progress: [
    "There’s nothing useful back in the bedroom.",
    "Keep moving through the hallway and look for another route.",
    "Go to the far end of the hallway and take the stairs down."
  ],

  // =========================================================
  // LEVEL 2 — LAB
  // =========================================================

  l2_restore_power: [
    "Most of the lab systems are dead.",
    "The electrical systems need to be restored before the lab can function.",
    "Repair the power system before trying to use the CCTV or security controls."
  ],

  l2_fuse: [
    "The maintenance information should tell you what belongs where.",
    "Compare the fuse or circuit information with the maintenance clue.",
    "Use the maintenance clue to install the correct fuse in the correct circuit."
  ],

  l2_generator: [
    "Installing the right part isn’t enough. The system still needs to be started.",
    "Check the nearby controls for the correct power-up sequence.",
    "Complete the electrical setup, then activate the generator or main power control."
  ],

  l2_cctv: [
    "The cameras can see places you can’t.",
    "Cycle through the feeds carefully. One of them contains something important.",
    "Check every CCTV feed, especially the later cameras, for information needed to progress."
  ],

  l2_security_info: [
    "The security system is connected to what the cameras are showing.",
    "Pay attention to numbers, labels or unusual information visible on the CCTV feeds.",
    "Use the information revealed through CCTV to unlock the secured route."
  ],

  l2_session14: [
    "The cassette may explain what happened in this lab.",
    "Listen to Session 14 all the way through.",
    "Pay attention to the names, symptoms and Project HOLLOW information in the recording."
  ],

  l2_exit: [
    "The metal exit is tied to the lab’s systems.",
    "Power and surveillance both need to be dealt with before you can leave.",
    "Restore the lab systems and use the CCTV/security information to unlock the exit."
  ],

  // =========================================================
  // BACKROOMS / DISTORTED CORRIDOR
  // =========================================================

  backrooms_progress: [
    "Something about this corridor isn’t right.",
    "You’ve seen parts of this place before. Look for what changes.",
    "Keep following the familiar parts of the house until you find the way forward."
  ]
};