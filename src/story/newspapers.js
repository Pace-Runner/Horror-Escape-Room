// =============================================================================
// THE NEWSPAPERS  --  every front page the game shows, and every word on them.
//
// Five editions of the local paper, read between the rooms the way a comic
// page is read between the levels of a Black Ops zombies map: the loading
// screen, the two walks through the maze, and each ending. They tell the half
// of the story the house cannot -- what the town saw from the outside -- and
// they are written to be read twice. First time through they are about a fire,
// a missing scientist and a creature. After Mark's letter they are about you.
//
// KEEP THEM SHORT. This is a game, not a reading test: each page is meant to
// be read in about half a minute. Roughly 150 words of main story, 50 in the
// sidebar, one line per brief. Anything longer is cut off by the page edge.
//
// THE RULE THEY KEEP: nothing here may say what the letter says before the
// letter says it. Each page is allowed one more step towards it than the last
// (a researcher missing -> a relative who stayed -> the house was BUILT as a
// cage), and the endings are the only pages that name Annabelle.
//
//   * Change the text, save the file, and the next page shown uses it.
//   * `photo` is one of the room-1 photographs, printed in halftone by
//     core/Newspaper.js: house, hallway, bedroomDoor, clawMarks, chainedBed.
//   * A body paragraph starting "> " is set as a pulled quote (centred, ruled).
//   * `advert` is the boxed advert at the foot of the right-hand column. It is
//     left out automatically if the sidebar story leaves no room for it.
//   * Dates are real 1987 weekdays. Keep them that way if you move them.
// =============================================================================

const PAPER = 'The Blackwood Courier';

export const NEWSPAPERS = {
  // ---- the boot load: before the player has seen anything -----------------
  prologue: {
    paper: PAPER,
    edition: 'Final Edition',
    volume: 'Vol. CXII, No. 18',
    date: 'Thursday, January 22, 1987',
    price: '35 Cents',
    leftEar: ['Storm Warning', 'Gales and flooding all weekend.'],
    rightEar: ['Inside', 'What the neighbours heard, Page A4'],
    kicker: 'Ravensmoor Road',
    headline: 'Fire Guts Cellar Laboratory',
    deck: 'Staff flee the Ravensmoor house in the night. One researcher is still missing.',
    byline: 'By Ellen Marsh, Staff Writer',
    photo: 'house',
    photoCaption: 'The house on Ravensmoor Road. Neighbours say the cellar lights "never once went off."',
    photoCredit: 'Courier file photo',
    body: [
      'BLACKWOOD -- Fire crews were called to the old house on Ravensmoor Road at two o\'clock on Wednesday morning, after neighbours heard alarms and "a sound like an animal, only bigger."',
      'The fire was confined to the cellar, used for three years as a private laboratory. Eleven staff were found on the lawn. A twelfth was not.',
      'The work was known only as Project HOLLOW. The trust that funds it calls it "a medical programme" and will say nothing more.',
      '"They told us it was about healing," said Ruth Okafor, who lives opposite. "Then they put bars on the windows."',
      'Asked why the cellar door was bolted from the outside, the fire chief would not comment.'
    ],
    continued: 'Continued on Page A4',
    sidebar: {
      kicker: 'Weather',
      headline: 'Worst Storms in a Decade',
      body: [
        'Heavy rain, gales and power cuts are expected across the valley from Friday.',
        'Keep a torch to hand. "When the lines come down up there," said one engineer, "they stay down."'
      ]
    },
    advert: {
      name: 'Hollins Hardware',
      lines: ['Torches, batteries & padlocks', 'Open till 9 every night']
    },
    briefs: [
      ['Road Closed', 'Ravensmoor Road shut while police search the woods.'],
      ['Lost', 'Black Labrador, answers to Duke. Reward.'],
      ['For Sale', 'Polaroid camera, two packs of film. $40.']
    ]
  },

  // ---- leaving the bedroom: the house has a voice now ----------------------
  afterBedroom: {
    paper: PAPER,
    edition: 'Final Edition',
    volume: 'Vol. CXII, No. 159',
    date: 'Saturday, June 13, 1987',
    price: '35 Cents',
    leftEar: ['Five Months On', 'Why the search stopped, Page A2'],
    rightEar: ['Tonight', 'Thunderstorms. Power cuts likely.'],
    kicker: 'Ravensmoor Road',
    headline: '"Something Is Still in That House"',
    deck: 'Neighbours hear scratching at the boarded-up house. Police say nobody has been inside since January.',
    byline: 'By Ellen Marsh, Staff Writer',
    photo: 'hallway',
    photoCaption: 'An upstairs hallway, from a photograph recovered inside the house.',
    photoCredit: 'Blackwood Police',
    body: [
      'BLACKWOOD -- Five months after the fire, the house on Ravensmoor Road is supposed to be empty. Its neighbours no longer believe it.',
      '"It walks about at night," said Ruth Okafor. "Heavy, slow. Then the scratching. Like someone trying to get out of a room."',
      'Every door has been boarded since spring. The boards, police confirmed, were nailed up from the inside.',
      'The researcher who vanished on the night of the fire has never been found. A member of his family is believed to have refused to leave.',
      'On Thursday a driver saw a torch moving behind an upstairs window. Then it stopped, "as if whoever had it had heard me."'
    ],
    continued: 'Continued on Page A6',
    sidebar: {
      kicker: 'Missing Researcher',
      headline: 'Search Called Off',
      body: [
        'Police describe the missing man as tall and thin, in his thirties.',
        'Anyone who sees him is told not to approach him. Asked why, a spokesman said: "That is the advice we have been given."'
      ]
    },
    advert: {
      name: 'Blackwood Photo',
      lines: ['Polaroids copied while you wait']
    },
    briefs: [
      ['Power', 'Storm repairs in the hills will take a week.'],
      ['Vigil', 'St. Anne\'s, Sunday, 7 p.m., for the missing.'],
      ['Wanted', 'Locksmith, heavy-duty work. Hollins & Sons.']
    ]
  },

  // ---- leaving the basement: the lab notes go public ----------------------
  afterBasement: {
    paper: PAPER,
    edition: 'Late City Edition',
    volume: 'Vol. CXII, No. 168',
    date: 'Tuesday, June 23, 1987',
    price: '35 Cents',
    leftEar: ['Exclusive', 'The pages the Trust did not want printed.'],
    rightEar: ['Tonight', 'Storms clearing late. Low 48.'],
    kicker: 'Project HOLLOW',
    headline: 'Leaked File: "Subject Unstable"',
    deck: 'Laboratory notes describe the programme\'s only subject losing his memory -- and his sight.',
    byline: 'By Ellen Marsh, Staff Writer',
    photo: 'clawMarks',
    photoCaption: 'Marks in the plaster of an upstairs room. Investigators could not say what made them.',
    photoCredit: 'Blackwood Police',
    body: [
      'BLACKWOOD -- Handwritten notes from the Ravensmoor laboratory, passed to the Courier by a former member of staff, describe one human subject getting worse all winter.',
      'Several lines are written in capitals and underlined twice:',
      '> SUBJECT UNSTABLE. CONTAINMENT REQUIRED. MEMORY DETERIORATION OBSERVED.',
      'The day before the fire, one entry reads: "He does not know us this morning. He thinks we are keeping him here."',
      'The Trust confirmed the notes are genuine. It says the house was prepared "for every outcome, including this one."',
      'Staff were given one instruction for an emergency: "Get out, and lock the doors behind you. Whoever you hear."'
    ],
    continued: 'Continued on Page A8',
    sidebar: {
      kicker: 'The House',
      headline: '"Built Like a Cage"',
      body: [
        'The engineer who converted the house fitted reinforced doors and three locks on the front door.',
        '"It was built to keep something in," he said. "The plans came from one of the researchers himself."'
      ]
    },
    advert: {
      name: 'Valley Opticians',
      lines: ['Eyes playing tricks?']
    },
    briefs: [
      ['Council', 'Vote on demolishing the house delayed again.'],
      ['Wanted', 'Lab camcorder, missing since January. Box 114.'],
      ['Notice', 'Ravensmoor Road: lock up after dark.']
    ]
  },

  // ---- ending: the front door opened -------------------------------------
  ending_released: {
    paper: PAPER,
    edition: 'Special Edition',
    volume: 'Vol. CXII, No. 172',
    date: 'Saturday, June 27, 1987',
    price: '35 Cents',
    leftEar: ['Police Advice', 'Stay in. Lock up. Call 911.'],
    rightEar: ['Schools', 'All valley schools closed Monday.'],
    kicker: 'Special Edition',
    headline: 'It Got Out',
    deck: 'A woman escapes the Ravensmoor house -- and so does the thing that was locked inside it.',
    byline: 'By Ellen Marsh, Staff Writer',
    photo: 'bedroomDoor',
    photoCaption: 'Every door in the house was found standing open on Saturday morning.',
    photoCredit: 'Blackwood Police',
    body: [
      'BLACKWOOD -- A woman walked out of the Ravensmoor house before dawn on Saturday, badly hurt, five months after its laboratory was abandoned. She was not alone.',
      'Police believe the creature made by the failed experiment known as Project HOLLOW left with her, and is now loose in the woods.',
      'All three locks on the front door had been opened. None had been forced. Officers with dogs searched the woods at first light.',
      '"Stay in your homes," the police chief said. "If you see it, do not go near it, whatever it looks like. It is highly dangerous."',
      'Before she was sedated, the woman said only: "He was only trying to go home."'
    ],
    continued: 'Continued on Page A2',
    sidebar: {
      kicker: 'What to Do',
      headline: 'If You See It',
      body: [
        'Do not approach it or speak to it. Go inside and lock every door.',
        'It may look like a person. It may sound like one. Do not go outside.'
      ]
    },
    advert: {
      name: 'Public Notice',
      lines: ['Keep your doors locked', '-- Blackwood Police --']
    },
    briefs: [
      ['Roads', 'Police checkpoints on every road out of the valley.'],
      ['Hospital', 'Blackwood General: emergencies only.'],
      ['The Trust', 'No statement. Its offices are closed.']
    ]
  },

  // ---- ending: the front door stayed shut --------------------------------
  ending_contained: {
    paper: PAPER,
    edition: 'Special Edition',
    volume: 'Vol. CXII, No. 172',
    date: 'Saturday, June 27, 1987',
    price: '35 Cents',
    leftEar: ['Police Advice', 'Keep away from the house.'],
    rightEar: ['Vigil', 'St. Anne\'s, Sunday, 7 p.m.'],
    kicker: 'Special Edition',
    headline: 'Woman Found Dead in Sealed House',
    deck: 'The three locks held. Whatever Project HOLLOW made never got out -- and neither did the sister who stayed.',
    byline: 'By Ellen Marsh, Staff Writer',
    photo: 'chainedBed',
    photoCaption: 'The bedroom where police believe the subject was first confined.',
    photoCredit: 'Blackwood Police',
    body: [
      'BLACKWOOD -- A woman\'s body was recovered from the Ravensmoor house on Saturday, hours after every lock in the building closed at once.',
      'She was named as Annabelle, sister of the researcher who vanished in January. She had refused to leave him.',
      '"The front door was shut from the inside," an officer said. "Whatever is in there locked itself in."',
      'Nothing has tried the door since. Once, just before dawn, officers heard something inside say her name.',
      'A letter found beside her, signed "Mark," has been taken as evidence. Police would read out only its last four words:',
      '> "DON\'T LET IT OUT."'
    ],
    continued: 'Continued on Page A2',
    sidebar: {
      kicker: 'Remembered',
      headline: '"She Always Stayed"',
      body: [
        'When the laboratory was evacuated, friends say, she was the only one who walked back towards the house.',
        '"She said her brother was still in there somewhere," said a colleague.'
      ]
    },
    advert: {
      name: 'Hollins & Sons',
      lines: ['Three-lock systems fitted', 'Built to hold']
    },
    briefs: [
      ['Council', 'Demolition postponed "until it is safe."'],
      ['The Trust', 'Says it is "co-operating fully."'],
      ['Weather', 'The storms have cleared. Sunday: clear skies.']
    ]
  }
};
