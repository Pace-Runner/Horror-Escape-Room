// =============================================================================
// THE UPSTAIRS HALLWAY  --  every word on the walls between the bedroom and
// the basement stairs.
//
// The hallway is where the house stops being a cell and starts being a home
// someone lived in. Each piece is written to be read twice, like the
// newspapers: first as clues about whoever is holding the player here, and,
// after Mark's letter, as the player's own childhood.
//
// THE RULE IT KEEPS (the same one the newspapers keep): nothing here may say
// what the letter says first. It may NAME Mark and Annabelle -- a brother and
// a sister who grew up in this house -- because the player has no reason yet to
// think either of them is them. It must never say who is in the bedroom.
//
//   * Change the words here and the drawings and the reading view both follow.
//   * `title` and `body` are what the player sees when they hold a piece up to
//     read it (E or right-click). Keep the body to a sentence or two.
//   * Dates line up with the newspapers: Mark is 17 in June 1979, Annabelle 14.
// =============================================================================

import {HOUSE_PHOTOGRAPH} from './housePhotograph.js';

export const HALLWAY = {
  /** The newspaper clipping, framed beside the hall table. */
  clipping: {
    title: 'A framed newspaper clipping',
    body: 'Cut neatly from the Courier and framed. Someone in this house was very proud of it.',
    art: {
      folio: { left: 'The Blackwood Courier', right: 'Friday, June 15, 1979 · Page 3' },
      kicker: 'Science',
      headline: ['Ravensmoor Boy Takes', 'National Science Prize'],
      deck: 'Seventeen-year-old asks the judges "Why does the body ever stop healing?" -- and wins.',
      byline: 'By Ellen Marsh, Courier Staff Writer',
      body: [
        'BLACKWOOD -- A seventeen-year-old from Ravensmoor Road has taken first prize at the National Young Scientists\' Fair in Washington, for a project on how the body repairs damaged tissue.',
        'Mark, a senior at Blackwood High, spent two years growing skin cells in jars in his parents\' cellar. His display asked one question in large letters: "Why does the body ever stop healing?"',
        '"Everything we are can already mend itself," he told the judges. "It just gives up too early. I want to find out why."',
        'His sister, Annabelle, 14, painted the display boards and kept the cultures alive while he was at school. "He would have burned the house down without me," she said.',
        'The prize includes a scholarship to study medicine. Mark says he will spend it "making sure nobody has to watch someone they love stop getting better."',
        'His mother says the family will frame the certificate in the upstairs hall, "next to the pencil marks on the wall."'
      ]
    }
  },

  /** The conversion drawings, framed opposite the window. */
  blueprint: {
    title: 'A framed blueprint',
    body: 'Drawings for building work on this house. Three rooms are circled and numbered. Someone has written on it in pencil, pressing hard.',
    art: {
      panels: { firstFloor: 'FIRST FLOOR (PART)', cellar: 'CELLAR', groundFloor: 'GROUND FLOOR (PART)' },
      rooms: {
        bedroom: 'BEDROOM',
        hall: 'HALL',
        stairDown: 'STAIR DN',
        lab: 'LABORATORY',
        panel: '60A PANEL',
        study: 'STUDY',
        frontDoor: 'FRONT DOOR'
      },
      rings: [
        ['RING 1 -- BEDROOM', 'REINFORCED DOOR, STEEL LINED', 'FIXING POINT AT BED HEAD'],
        ['RING 2 -- CELLAR', 'BOLTED STEEL DOOR', 'ON ITS OWN CIRCUIT'],
        ['RING 3 -- FRONT DOOR', 'THREE INDEPENDENT LOCKS', 'LAST LINE']
      ],
      titleBlock: [
        'RAVENSMOOR HOUSE',
        'ALTERATIONS FOR THE RAVENSMOOR TRUST',
        'SHEET 4 OF 7 -- SECURITY',
        'SCALE 1:50'
      ],
      drawnBy: 'DRAWN: M.',
      date: 'DATE: NOV 1983',
      pencil: ['None of the three', 'may open from the inside.']
    }
  },

  /** On the hall table, under the lamp. */
  note: {
    title: 'A note on the hall table',
    body: 'Torn off a pad and left where you could not miss it. The ink is still dark.',
    art: {
      lines: [
        'If you\'re reading this,',
        'you got out of the bedroom.',
        '',
        'Please. Go back in',
        'and shut the door.',
        '',
        'I\'ll explain in the morning.',
        'I promise.',
        '',
        '-- A.'
      ]
    }
  },

  /** Pencilled heights up the wall beside the second bedroom door. */
  heightMarks: {
    title: 'Pencil marks on the wall',
    body: 'Two children, measured against this wall every birthday. M. and A. The last mark is not pencil. It is gouged into the plaster, higher than either of them ever grew.',
    art: {
      pencil: [
        { who: 'M', height: 1.02, label: 'M 4' },
        { who: 'A', height: 0.95, label: 'A 3' },
        { who: 'M', height: 1.16, label: 'M 6' },
        { who: 'A', height: 1.09, label: 'A 5' },
        { who: 'M', height: 1.29, label: 'M 8' },
        { who: 'A', height: 1.22, label: 'A 7' },
        { who: 'M', height: 1.41, label: 'M 10' },
        { who: 'A', height: 1.34, label: 'A 9' },
        { who: 'M', height: 1.53, label: 'M 12' },
        { who: 'A', height: 1.46, label: 'A 11' },
        { who: 'M', height: 1.68, label: 'M 14' },
        { who: 'A', height: 1.57, label: 'A 13' }
      ],
      gouge: { height: 2.18 }
    }
  },

  /** The hall mirror. */
  mirror: {
    title: 'A hall mirror',
    body: 'Smashed. Not dropped -- struck, more than once, by someone standing exactly where you are now. There is no piece left big enough to show a face.'
  },

  /** The frame lying face down under the empty hooks. */
  frameBack: {
    title: 'A picture frame, face down',
    body: 'The glass is broken and the photograph has been torn out of the back. Only the label is left.',
    art: {
      label: ['The four of us', 'Christmas 1980'],
      framer: ['HOLLINS & SONS', 'Picture Framing', 'Mill Street, Blackwood']
    }
  },

  /** The empty hooks on the wall above it. */
  paleMarks: {
    title: 'Where pictures used to hang',
    body: 'Paler squares of wallpaper the light never reached, and the hooks still in the wall. Someone took these down. Recently -- there is no dust on the hooks.'
  },

  /** The house, in a gilt frame, with a brass plate. */
  house: {
    title: 'A photograph of the house',
    body: HOUSE_PHOTOGRAPH.body,
    plaque: HOUSE_PHOTOGRAPH.plaque
  }
};
