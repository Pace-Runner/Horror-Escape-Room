// Level 1's puzzle chain, as hint stages for core/HintSystem.js.
//
// ORDER MATTERS: the hint system talks about the first stage here that is not
// complete. Two of the puzzles (the photographs and the lamp's code) can be
// done in either order; listing the photographs first just means a player who
// has done neither is pointed at the corkboard before the lamp. A player who
// cracked the lamp first skips straight past its stage, because "complete" is
// read from the room, not from the order they were hinted in.
//
// The words live in src/dialogue/level1_bedroom.js (every dialog_hint_* line),
// so they can be edited there like the rest of the bedroom's dialogue.
//
// `progress` is the snapshot main.js builds for the hint system: the bedroom's
// own puzzleState fields, plus `hasPaperclip` and `flashlightFound`, which the
// room does not track itself, and `drawerPinDigits`, the code the lamp blinks.

import { line } from '../dialogue/index.js';

/** Photographs the corkboard needs before it can be arranged. */
const PHOTOS_NEEDED = 4;

/**
 * Where each photograph is, keyed by the corkboard slot it belongs to (the
 * keys bedroomLevel.js adds to puzzleState.foundPhotos), in the order they are
 * listed when the player asks where the missing ones are.
 */
const PHOTO_PLACE_LINE_BY_KEY = {
  windowPhoto: 'dialog_hint_photo_place_radiator',
  nightstandLeft: 'dialog_hint_photo_place_bedside_drawer',
  floorPhoto: 'dialog_hint_photo_place_floor',
  dresserTop: 'dialog_hint_photo_place_vanity_drawer'
};

/**
 * Builds the most explicit photograph hint: where every still-missing
 * photograph is, as one sentence.
 *
 * @param {Set<string>} foundPhotos - the corkboard keys already collected.
 * @returns {Array<object>} caption lines naming each missing photo's place.
 */
function readMissingPhotoPlacesHint(foundPhotos) {
  const missingPlaces = Object.entries(PHOTO_PLACE_LINE_BY_KEY)
    .filter(([photoKey]) => !foundPhotos.has(photoKey))
    .map(([, placeLineKey]) => line(placeLineKey)[0]?.text ?? '');
  return line('dialog_hint_photos_where', { places: missingPlaces.join('; ') });
}

/**
 * Reports whether the brass key has been won from the lamp drawer -- now or at
 * any point. hasBrassKey goes false again once the key is spent on the box, so
 * every later step counts as proof it was found.
 *
 * @param {object} progress - the hint progress snapshot.
 * @returns {boolean}
 */
function isLampDrawerSolved(progress) {
  return progress.hasBrassKey || isLockboxSolved(progress);
}

/**
 * Reports whether the lockbox has been opened. Any later step counts too, for
 * a progress snapshot taken after the crowbar has been used up.
 *
 * @param {object} progress - the hint progress snapshot.
 * @returns {boolean}
 */
function isLockboxSolved(progress) {
  return progress.hasCrowbar || progress.floorboardPried || progress.planksRemoved || progress.doorUnlocked;
}

/**
 * Level 1's stages, in the order the player is guided through them. Each
 * readHints returns its hints vaguest first.
 */
export const BEDROOM_HINT_STAGES = [
  {
    id: 'paperclip',
    isComplete: (progress) => progress.hasPaperclip || progress.chainsEscaped,
    readHints: () => [
      line('dialog_hint_paperclip_1'),
      line('dialog_hint_paperclip_2')
    ]
  },
  {
    id: 'cuff',
    isComplete: (progress) => progress.chainsEscaped,
    readHints: () => [
      line('dialog_hint_cuff_1'),
      line('dialog_hint_cuff_2')
    ]
  },
  {
    id: 'flashlight',
    isComplete: (progress) => progress.flashlightFound,
    readHints: () => [
      line('dialog_hint_flashlight_1'),
      line('dialog_hint_flashlight_2')
    ]
  },
  {
    id: 'photos',
    isComplete: (progress) => progress.photosArranged || progress.foundPhotos.size >= PHOTOS_NEEDED,
    readHints: (progress) => [
      line('dialog_hint_photos_1'),
      line('dialog_hint_photos_2', { found: progress.foundPhotos.size, needed: PHOTOS_NEEDED }),
      readMissingPhotoPlacesHint(progress.foundPhotos)
    ]
  },
  {
    id: 'corkboard',
    isComplete: (progress) => progress.photosArranged,
    readHints: () => [
      line('dialog_hint_corkboard_1'),
      line('dialog_hint_corkboard_2')
    ]
  },
  {
    // The "lights" puzzle: the bedside lamp blinks the drawer's code.
    id: 'lampDrawer',
    isComplete: isLampDrawerSolved,
    readHints: (progress) => [
      line('dialog_hint_lamp_1'),
      line('dialog_hint_lamp_2'),
      line('dialog_hint_lamp_3', {
        blinks: progress.drawerPinDigits.join(', then '),
        code: progress.drawerPinDigits.join('')
      })
    ]
  },
  {
    id: 'lockbox',
    isComplete: isLockboxSolved,
    readHints: () => [
      line('dialog_hint_lockbox_1'),
      line('dialog_hint_lockbox_2')
    ]
  },
  {
    // The rug corner and the loose board under it, as one stage: lifting the
    // rug is only ever done to reach the board.
    id: 'floorboard',
    // Not planksRemoved: the planks can come off before the board is lifted.
    isComplete: (progress) => progress.floorboardPried || progress.doorUnlocked,
    readHints: () => [
      line('dialog_hint_floorboard_1'),
      line('dialog_hint_floorboard_2'),
      line('dialog_hint_floorboard_3')
    ]
  },
  {
    id: 'bedroomKey',
    isComplete: (progress) => progress.hasBedroomKey || progress.doorUnlocked,
    readHints: () => [
      line('dialog_hint_bedroom_key_1')
    ]
  },
  {
    id: 'planks',
    isComplete: (progress) => progress.planksRemoved || progress.doorUnlocked,
    readHints: () => [
      line('dialog_hint_planks_1'),
      line('dialog_hint_planks_2')
    ]
  },
  {
    id: 'door',
    isComplete: (progress) => progress.doorUnlocked,
    readHints: () => [
      line('dialog_hint_door_1')
    ]
  }
];
