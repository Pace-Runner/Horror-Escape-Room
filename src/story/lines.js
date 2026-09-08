/**
 * Every word the game says, in one place.
 *
 * WHY DATA. The storyline is written as beats of several lines each, and those
 * beats are the part most likely to be rewritten -- wording, order, pacing --
 * long after the code around them has settled. Keeping them here means a
 * rewrite touches this file and nothing else, and it means the same beat can be
 * fired from a level, a cutscene or a trigger volume without three copies of
 * the text drifting apart.
 *
 * SHAPE. A beat is an array of lines for CaptionSequencer.play(). A line is
 * either a plain string, or { text, duration, voice }:
 *
 *   duration - seconds to hold. Omit it and the sequencer sizes the line by its
 *              length, which is right nearly everywhere. Set it to hang on a
 *              short line for effect ("Something moves past the door.").
 *   voice    - a clip key under src/assets/voice/. Text ships now and voice
 *              drops in later without touching any of this, which is why the
 *              key is here from the start rather than being retrofitted.
 *
 * Only the parts of the story that are ACTUALLY SPOKEN carry a voice key -- the
 * four cassette tapes and the two closing news reports. The rest is the
 * player's own observation and has no speaker, so inventing narration audio for
 * it would be adding a character the story does not have.
 *
 * DOCUMENTS, further down, are the long-form texts for DocumentUI: the notes,
 * the sticky note, and Mark's letter.
 */

// ---------------------------------------------------------------------------
// Level 1 -- the bedroom
// ---------------------------------------------------------------------------

export const BEATS = {
  /** Cold open. Fires as the wake-up fade lifts, before movement is returned. */
  wake: [
    { text: 'You wake up in the dark. Rain, and something colder underneath it.', duration: 4.4 },
    { text: 'Your wrist is chained to the bed frame. You do not remember lying down here.', duration: 5.0 },
    'You do not remember this house at all.'
  ],

  /** The paperclip goes into the cuff. */
  freed: [
    { text: 'The lock gives. The cuff opens.', duration: 3.0 },
    'You stand up. Somewhere in the dark, floorboards creak.'
  ],

  /** The bulb blows the moment you are on your feet. */
  bulbBlows: [
    { text: 'The bulb flickers, whines, and blows.', duration: 3.2 },
    'Only the lightning now.'
  ],

  flashlightOn: [
    'The beam is weak and yellow, but it is yours.'
  ],

  /**
   * The scratches by the bed -- the message the whole game is named after, and
   * the first thing that is written TO the player rather than about them.
   */
  scratches: [
    { text: 'Something has been scratched into the floorboards. Deep. Over and over.', duration: 4.6 },
    { text: "DON'T LET IT OUT", duration: 3.6 },
    'The gouges are wide apart. Whatever made them had a long reach.'
  ],

  /** Immediately after the scratches: it goes past the door. */
  pastTheDoor: [
    { text: 'Footsteps. Slow, on the other side of the door.', duration: 3.6 },
    { text: 'Something breathing. Not you.', duration: 3.0 },
    { text: 'It moves past, and does not stop.', duration: 3.4 },
    'Get out of this house before it comes back.'
  ],

  polaroid: [
    { text: 'A polaroid, stuck to the door frame. A tall black figure, badly out of focus.', duration: 5.2 },
    'Written on the border: PROJECT HOLLOW. June 1987.'
  ],

  boardedDoor: [
    { text: 'Two planks, nailed diagonally across the door.', duration: 3.4 },
    'Nailed from the inside.'
  ],

  // -------------------------------------------------------------------------
  // Level 2 -- the hallway and the basement
  // -------------------------------------------------------------------------

  /** The hallway sighting. One lightning flash, and it is standing there. */
  hallwaySighting: [
    { text: 'The lightning catches something at the end of the hallway.', duration: 3.8 },
    { text: 'Tall. Wrong. Watching you.', duration: 2.8 },
    'Then the dark comes back, and it is gone.'
  ],

  basementArrival: [
    { text: 'The house stops being a house.', duration: 3.2 },
    'Concrete, pipes, cable trays. Someone built a laboratory under this place.'
  ],

  cctvNoPower: [
    { text: 'Five camera feeds. Every one of them static.', duration: 3.6 },
    'No power.'
  ],

  stickyNote: [
    'A sticky note on the corner of the screen: "Restore power and pray it doesn’t hear you."'
  ],

  creatureSketch: [
    { text: 'A sketch, done fast and pressed hard enough to tear the paper.', duration: 4.2 },
    'Long arms. Thin body. Hunched back. A head at the wrong angle.'
  ],

  restraints: [
    { text: 'The arm restraints are broken outward.', duration: 3.4 },
    'Whatever was strapped into this chair did not need a key.'
  ],

  powerRestored: [
    { text: 'The generator catches. Lights come up in stages down the room.', duration: 4.2 },
    'The cameras are live.'
  ],

  /** Camera 2. It crosses the hallway you were standing in a minute ago. */
  cctvDash: [
    { text: 'Something crosses the hallway feed, fast, and is gone.', duration: 3.8 },
    'It is upstairs. It is between you and the way you came in.'
  ],

  /** Camera 5 is this room. There is a figure standing where you are standing. */
  cctvBasement: [
    { text: 'Camera five is this room.', duration: 2.8 },
    { text: 'There is a figure standing in it. Standing where you are standing.', duration: 4.6 },
    'The feed goes to static.'
  ],

  metalDoorUnlocks: [
    'Bolts move somewhere in the wall. The metal door is unlocked.'
  ],

  /** It is in the corner. It does not come for you. */
  creatureCorner: [
    { text: 'It is in the corner of the room, and it has been for some time.', duration: 4.4 },
    { text: 'It does not move toward you. It only watches.', duration: 4.0 },
    'Then it turns and goes, back the way you came.'
  ],

  blackPool: [
    { text: 'It has left a pool of something black where it stood.', duration: 3.8 },
    'It is hurt.'
  ],

  videoCamera: [
    { text: 'A video camera, almost out of battery. One recording on it.', duration: 4.2 },
    'CONTAINMENT BREACH — JANUARY 1987. Five months before the polaroid.'
  ],

  videoPlayed: [
    { text: 'The same room, when it was still a laboratory. Sparks, fire in the corner, alarms.', duration: 5.4 },
    { text: 'Something crosses the frame too fast to read.', duration: 3.2 },
    'Then it runs straight into the camera, and the tape ends.'
  ],

  // -------------------------------------------------------------------------
  // Level 3 -- the study
  // -------------------------------------------------------------------------

  studyArrival: [
    { text: 'The study. Bookshelves, a desk, portraits, and the front door.', duration: 4.4 },
    'Three locks on it. All three have to come off.'
  ],

  visorFound: [
    { text: 'A visor, face down on the floor. The lenses are blue and very thick.', duration: 4.6 },
    'Someone ground these to a prescription.'
  ],

  /** First time it goes on. The world does not change -- it corrects. */
  visorFirstWorn: [
    { text: 'The room does not change so much as settle.', duration: 3.6 },
    { text: 'Writing on the walls that was not there. Footmarks across the floor.', duration: 4.6 },
    'None of it is new. You simply were not seeing it.'
  ],

  visorRemoved: [
    'You take the visor off, and the room goes back to being wrong.'
  ],

  /** It is on the stairs. It runs from you. */
  creatureFlees: [
    { text: 'It is standing where you came in.', duration: 2.8 },
    { text: 'You step toward it and it breaks and runs.', duration: 3.4 },
    'It is faster than you, and it is running away.'
  ],

  thirdLockNeedsVisor: [
    { text: 'The third lock has no keyhole you can see.', duration: 3.4 },
    'Not without the visor on.'
  ],

  portraitFourth: [
    { text: 'The family photograph from the bedroom, hanging here.', duration: 3.8 },
    { text: 'Through the lenses there is a fourth person in it.', duration: 3.6 },
    'Scratched out with marker, hard enough to go through the paper.'
  ],

  /** Last lock. The lights come up and the shadow is not yours. */
  shadowWrong: [
    { text: 'The last lock turns. Lights come up across the room.', duration: 4.0 },
    { text: 'Your shadow reaches further up the wall than you do.', duration: 4.2 },
    { text: 'The arms are too long.', duration: 2.8 },
    'You take the visor off, and the shadow is a person again.'
  ],

  porchFence: [
    { text: 'A fence door across the porch, padlocked.', duration: 3.4 },
    'The key is not on this side of it.'
  ],

  /** The mirror. The only one in the house that is not broken. */
  mirror: [
    { text: 'A mirror, on the wall past the door.', duration: 3.0 },
    { text: 'Every other mirror in this house is broken. This one is not.', duration: 4.4 },
    { text: 'You look into it.', duration: 3.0 },
    { text: 'Long arms. Thin body. Hunched back. Long fingers.', duration: 4.4 },
    { text: 'It is the sketch from the basement.', duration: 3.4 },
    'It is you. It has been you the entire time.'
  ],

  /** After the letter is read to the end. */
  realisation: [
    { text: 'The scratches in the bedroom floor. You made them, trying to get out.', duration: 4.8 },
    { text: 'The broken mirrors. You broke them, so you would not have to see this.', duration: 5.0 },
    { text: 'The figure in the photograph, scratched out. That was you, before.', duration: 4.8 },
    { text: 'It was never hunting you.', duration: 3.0 },
    'Every time it ran, it was getting away from you. Every time it blocked a door, it was keeping you in.'
  ],

  /** Annabelle stands up. She is the woman from the portrait, and she is hurt. */
  annabelle: [
    { text: 'The figure in the corner stands up.', duration: 3.2 },
    { text: 'It is not a monster. It is a woman, and she is bleeding.', duration: 4.4 },
    { text: 'She is the woman from the family photograph.', duration: 3.8 },
    'She is your sister.'
  ],

  /** The choice. Deliberately not phrased as a prompt -- it is her asking. */
  theChoice: [
    { text: '"I need to get out."', duration: 3.6 },
    'The front door is unlocked. Nothing is stopping you now.'
  ]
};

// ---------------------------------------------------------------------------
// The four cassette tapes. Annabelle's voice, recorded before the last breach.
// ---------------------------------------------------------------------------

/**
 * Kept as its own list because the radio plays them by index and the study has
 * to know how many there are. Each carries a voice key: these lines are spoken
 * aloud in the story, so they are the first clips that will ever be recorded.
 */
export const TAPES = [
  { id: 'tape1', label: 'Tape 1', text: '"If you’re hearing this, the locks didn’t hold."', voice: 'tape-1', duration: 4.2 },
  { id: 'tape2', label: 'Tape 2', text: '"Do not let it reach the front door."', voice: 'tape-2', duration: 4.0 },
  {
    id: 'tape3',
    label: 'Tape 3',
    text: '"It can’t see what we’re seeing. It is getting worse. It doesn’t recognise us anymore."',
    voice: 'tape-3',
    duration: 6.0
  },
  { id: 'tape4', label: 'Tape 4', text: '"If I forget again, don’t let me—"', voice: 'tape-4', duration: 4.4 }
];

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

/**
 * The two news reports, read over the closing pan. Both are spoken, so both
 * carry voice keys.
 */
export const ENDINGS = {
  released: [
    {
      text: '"A female survivor has escaped from an abandoned laboratory after a failed human modification experiment, named Project HOLLOW, escaped into the world."',
      voice: 'news-released-1',
      duration: 8.0
    },
    {
      text: '"Police advise all residents to stay locked in their homes while officers attempt to locate and neutralise the target. The creature is highly dangerous."',
      voice: 'news-released-2',
      duration: 8.0
    }
  ],
  contained: [
    {
      text: '"A woman has been found dead in an abandoned house after a failed human modification experiment created a creature known as Project HOLLOW."',
      voice: 'news-contained-1',
      duration: 8.0
    },
    {
      text: '"The creature trapped itself inside the house, stopping itself from reaching the outside world, but killing all survivors. Police are on scene attempting to neutralise the target."',
      voice: 'news-contained-2',
      duration: 9.0
    }
  ]
};

// ---------------------------------------------------------------------------
// Documents -- anything too long for a caption. See core/DocumentUI.js.
// ---------------------------------------------------------------------------

export const DOCUMENTS = {
  /** Basement. Torn pages, messy hand. */
  labNotes: {
    title: 'Torn pages',
    variant: 'note',
    body: [
      'subject unstable — adaptation has not plateaued as projected. week 11 and still climbing.',
      'CONTAINMENT REQUIRED. do not attempt sedation, metabolism burns through it in under four minutes now.',
      'MEMORY DETERIORATION OBSERVED. today he asked me twice who authorised the procedure. he authorised the procedure.',
      'VISUAL DISTORTION INCREASING. he described me to my face. none of it was me.',
      'the lenses help. while he wears them he is himself. he does not always agree to wear them.'
    ]
  },

  /** Basement, taped to the CCTV screen. */
  stickyNote: {
    title: '',
    variant: 'note',
    body: ['Restore power and pray it doesn’t hear you.']
  },

  /**
   * The note folded beside the front-door key. It carries the combination for
   * lock 2, so the code is FOUND rather than guessed -- and it is the date from
   * the Level 1 polaroid, which is the first thing tying the two rooms together.
   */
  frontDoorNote: {
    title: '',
    variant: 'note',
    body: [
      'A. —',
      'If you are reading this you have already been through the desk, so you know I am not going to make it hard for you.',
      'The middle lock is 06 87. You will remember why.',
      'The bottom one takes the brass key in the drawer.',
      'The top one I could not make simple. You will have to be able to see it. The lenses are somewhere in this room and I am sorry I cannot remember where I put them.',
      '— M'
    ]
  },

  /**
   * The sketch from the basement floor. The drawing itself is a texture (see
   * world/textures.js createCreatureSketchTexture); this is what is written
   * around it in the margins, which the player can only read close up.
   */
  creatureSketch: {
    title: 'A sketch, in pencil',
    variant: 'note',
    body: [
      'A figure, drawn from the front and gone over twice. Long arms, hanging past the knee. A thin body. A back that curves forward. A small head, set at an angle.',
      'Down one side, in the same hand as the torn pages: "week 11 — still climbing".',
      'An arrow points at the arms. Beside it: "arms ~1.5x".',
      'Lower down, pressed hard enough to score the paper: "it is not finished".'
    ]
  },

  /**
   * Mark's letter. The whole game resolves here, so it is reproduced in full
   * rather than summarised -- reading it to the end is what sets
   * gameState.letterRead, and the ending is written on the assumption that the
   * player has.
   */
  letter: {
    title: 'To Annabelle',
    variant: 'letter',
    body: [
      "If you're reading this through the calibration lenses, then at least one thing in this place still works. I don't know how much longer I'll be able to write clearly, so I'm putting everything here while I still can. You deserve to know what happened.",
      'Project HOLLOW was never supposed to create a monster. The experiment was designed to force the human body to adapt — stronger tissue, accelerated healing, resistance to injury and disease. We thought we had found a way to make the human body survive things it never could before.',
      'And technically... it worked. My body adapted. It just never stopped. The changes became impossible to control. My arms, my hands, my face — every week I look less like the person I was before.',
      "But the physical changes aren't what frighten me most. Something is happening to my mind. I'm forgetting things. Places. Names. Whole conversations. Sometimes I wake up and don't remember where I am.",
      "And now my sight is changing too. I look at people and their faces aren't their faces anymore. Their bodies look wrong. Their voices sound different. Sometimes I know that someone standing in front of me is human, but everything I'm seeing tells me that they aren't. That's why the calibration visor was made. They don't reveal another world. They correct the one I'm seeing.",
      "Annabelle, I'm terrified that one day even they won't be enough. You are my sister. Remember that, because I may not. There may come a day where I look straight at you and see something else. Something dangerous. Something I need to run from. Something I need to hurt. If that happens, don't try to convince me of what I'm seeing. I won't believe you.",
      'When the others evacuated the laboratory, you stayed. You shouldn’t have. But you did. You stayed because you believed your brother was still somewhere inside whatever Project HOLLOW had turned me into. I hope you were right.',
      'The bedroom, the basement, the reinforced doors, the three containment locks — I designed it. I designed it before the procedure, as a failsafe in case something went wrong. They aren’t meant to protect me from something inside this house. They are meant to protect everyone outside it from me.',
      "If I wake up without my memories, I won't understand that. I'll think I've been kidnapped. I'll think I'm trapped. I'll search for keys. I'll break the locks. I'll try to escape. I may even believe that you're the thing keeping me here.",
      "You are my sister. Your name is Annabelle. If I look at you one day and don't recognize you, that doesn't change who you are. And if I ever make it all the way to the front door believing that I'm finally escaping... I hope there's enough of me left to understand what I'm actually doing.",
      "I'm sorry you stayed. I'm sorry I couldn't fix this. And I'm sorry if one day you have to be afraid of me.",
      'Promise me, whatever I become:',
      "don't let it out.",
      '— Mark'
    ]
  }
};

/**
 * Look a beat up by name, loudly. A typo in a beat id would otherwise play
 * nothing at all and leave no trace, which for a story beat is the worst
 * possible failure -- the player just gets silence where a scene should be.
 */
export function beat(name) {
  const lines = BEATS[name];
  if (!lines) {
    console.warn(`[story] no beat named "${name}"`);
    return [];
  }
  return lines;
}
