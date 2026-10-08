/**
 * The long-form documents the player reads in DocumentUI: the notes, the
 * sticky note, the sketch's margins, and Mark's letter.
 *
 * SPOKEN AND CAPTIONED LINES DO NOT LIVE HERE ANY MORE. Every caption, story
 * beat, tape and news report moved to src/dialogue/, one file per level, so a
 * writer can change a line or attach a voice clip without opening code -- see
 * src/dialogue/README.md. These stay behind because they are pages to read,
 * not lines to say.
 */

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
