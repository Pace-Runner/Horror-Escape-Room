/**
 * The one place run-scoped story state lives.
 *
 * Everything else in this project keeps state either in a per-level closure
 * (bedroomLevel's `puzzleState`, hallwayBasement's `powerRestored`) or as a
 * module-level `let` in main.js. Both are right for what they hold: a level's
 * own puzzle flags belong to that level, and the torch belongs to the frame
 * loop. Neither works for the storyline, because the story is the part that
 * CROSSES levels -- whether the visor has ever been worn, which tapes have
 * played, which ending was taken.
 *
 * Putting those in a level closure would be actively wrong: SceneManager wipes
 * a level's state wholesale on reset, and the study would end up reaching into
 * the bedroom's closure to ask what the player already knows.
 *
 * THE RULE THAT MATTERS: every field here must be restored by resetState(), and
 * resetGame() must call it. main.js already carries a comment about being bitten
 * by exactly this -- a restart used to leave Level 2's breaker flipped because
 * only the bedroom was reset. One call is much harder to forget than N.
 */

/** Fresh values for a new run. Also the schema -- add fields here, not below. */
function initialState() {
  return {
    // --- the visor -------------------------------------------------------
    /** Worn right now. Drives the render pass and what the creature looks like. */
    visorWorn: false,
    /**
     * Worn at least once this run. The mirror, the letter and the shadow all
     * read differently once the player knows -- and "knows" has to survive
     * taking the visor off again, which `visorWorn` alone cannot express.
     */
    visorEverWorn: false,
    /** Picked up. Separate from worn: you can carry it before you put it on. */
    hasVisor: false,

    // --- Level 3 progress ------------------------------------------------
    /** Ids of the front door's locks that are open. Size 3 opens the door. */
    locksOpen: new Set(),
    /** Ids of cassette tapes already played, so a replay does not re-trigger. */
    tapesPlayed: new Set(),
    /** True once the letter has been read in full. */
    letterRead: false,

    // --- the creature ----------------------------------------------------
    /**
     * How many times the player has been intercepted. Not a life counter --
     * being caught costs position and time, never the run -- but the creature
     * reads it to escalate, and the ending can acknowledge it.
     */
    caughtCount: 0,

    // --- outcome ---------------------------------------------------------
    /** null until the player commits: 'released' | 'contained'. */
    endingChosen: null,

    // --- the map ---------------------------------------------------------
    /**
     * Names of the backrooms corridors the player has actually stood in.
     *
     * Here rather than in the level's closure for a specific reason: the
     * corridor's reset() is literally setRoute(null) and it fires on EVERY
     * level crossing, because the corridor is the interstitial between all of
     * them. Level-local memory would be wiped every time the player walked
     * through, so the map would re-fog itself on the trip it is meant to help
     * with. resetState() clears it, which is the one place a new run should.
     */
    corridorsSeen: new Set(),

    // --- inventory ---------------------------------------------------------
    /** Ids of carried items, in pickup order. See ITEMS below for display info. */
    inventory: new Set(),
    /** How many of each STACKS item is carried. Read it through itemCount(). */
    itemCounts: new Map(),
    /**
     * Which hotbar slot each carried item sits in, left to right: ids, with
     * null for a gap. Read it through inventorySlots(), which keeps it in step
     * with `inventory`.
     */
    inventorySlots: [],

    // --- tips --------------------------------------------------------------
    /** The control tips already shown this run (main.js showControlTipOnce). */
    tipsShown: new Set()
  };
}

/**
 * Display info for every item the inventory HUD can show. Keyed by the same
 * id addItem()/removeItem() take, so a level only ever has to know a short
 * string, never a label or a hint.
 *
 * `label` is the item's title (hotbar tooltip); `name` is how it reads in the
 * middle of a sentence, for prompts built around it ("Pick up crowbar").
 */
export const ITEMS = {
  paperclip: { label: 'Paperclip', name: 'paperclip' },
  flashlight: { label: 'Flashlight', name: 'flashlight', hint: 'F to toggle' },
  crowbar: { label: 'Crowbar', name: 'crowbar' },
  brassKey: { label: 'Brass safe key', name: 'brass key' },
  bedroomKey: { label: 'Bedroom door key', name: 'bedroom key' },
  sessionTape: { label: 'Cassette: SESSION 14', name: 'tape' },
  // Level 1's four photographs, carried until they are pinned to the corkboard.
  photo1984: { label: 'Photograph', name: 'photograph' },
  photo1985: { label: 'Photograph', name: 'photograph' },
  photo1986: { label: 'Photograph', name: 'photograph' },
  photo1987: { label: 'Photograph', name: 'photograph' },
  // Level 2's four loose fuses. All one size; only the rating tells them apart.
  fuse15: { label: 'Fuse (15A)', name: '15A fuse' },
  fuse20: { label: 'Fuse (20A)', name: '20A fuse' },
  fuse30: { label: 'Fuse (30A)', name: '30A fuse' },
  fuse45: { label: 'Fuse (45A)', name: '45A fuse' },
  visor: { label: "Annabelle's visor", name: 'visor', hint: 'V to toggle' },
  doorKey: { label: 'Desk drawer key', name: 'desk drawer key' },
  gateKey: { label: 'Gate key', name: 'gate key' },
  // Level 3's: the sigil from the clock, the key behind the crest, the key by Annabelle.
  archiveToken: { label: 'Brass Sigil', name: 'brass sigil' },
  archiveKey: { label: 'Archive key', name: 'archive key' },
  hollowOverrideKey: { label: 'HOLLOW access keycard', name: 'access keycard' },
  // The study hide-and-seek (docs/LEVEL3_HIDE_AND_SEEK.md): two lures and the breaker's spare.
  studyBook: { label: 'Hardback book', name: 'book', hint: 'Left click to throw' },
  studyGlass: { label: 'Glass bottle', name: 'bottle', hint: 'Left click to throw' },
  studyFuse: { label: 'Spare fuse', name: 'spare fuse' }
};

/** The slots the inventory bar always shows; it only grows past this when they are all full. */
export const HOTBAR_SLOTS = 9;

/**
 * The hotbar's slots, left to right: each an item id, or null for an empty
 * slot. An item keeps its slot while it is carried; one used up or dropped
 * leaves a gap, and the next item picked up fills the first gap rather than
 * going on the end. Only items with display info in ITEMS take a slot.
 *
 * Synced from `inventory` on every read rather than kept by addItem() and
 * removeItem(), because some code edits the Set directly (the study's quest
 * items) and the slots must never go stale behind it.
 */
export function inventorySlots() {
  const slots = gameState.inventorySlots;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== null && !gameState.inventory.has(slots[i])) slots[i] = null;
  }
  for (const id of gameState.inventory) {
    if (!ITEMS[id] || slots.includes(id)) continue;
    const gap = slots.indexOf(null);
    if (gap >= 0) slots[gap] = id;
    else slots.push(id);
  }
  while (slots.length && slots[slots.length - 1] === null) slots.pop();
  return slots;
}

/**
 * Items carried as a stack rather than one of each, and the most of each: the
 * study's books, three (Kiran, 2026-10-28). A stack takes one hotbar slot,
 * with its count on it. Everything else is one of a kind.
 */
export const STACKS = Object.freeze({ studyBook: 3 });

/** Adds an item to the carried set: one more on a stack, a no-op for anything already carried. */
export function addItem(id) {
  const most = STACKS[id];
  if (most) gameState.itemCounts.set(id, Math.min(most, itemCount(id) + 1));
  gameState.inventory.add(id);
}

/**
 * Removes an item once it is spent (e.g. the crowbar, after the planks) or
 * dropped. A stack loses one, and is only gone with its last.
 */
export function removeItem(id) {
  const left = STACKS[id] ? itemCount(id) - 1 : 0;
  if (left > 0) {
    gameState.itemCounts.set(id, left);
    return;
  }
  gameState.itemCounts.delete(id);
  gameState.inventory.delete(id);
}

/** How many of `id` are carried: 0, 1, or a stack's count. */
export function itemCount(id) {
  if (!gameState.inventory.has(id)) return 0;
  return STACKS[id] ? (gameState.itemCounts.get(id) ?? 1) : 1;
}

/** Whether one more `id` can be carried: none of it yet, or a stack with room on it. */
export function canCarryMore(id) {
  return itemCount(id) < (STACKS[id] ?? 1);
}

/**
 * The live state. A single mutable object rather than a class or a store,
 * matching how the rest of this project shares things (see AudioEngine's
 * exported BREATH_BASE_LEVEL, which exists so two files cannot drift).
 *
 * Mutate its fields; never reassign the binding, or every module holding a
 * reference would keep pointing at the old object.
 */
export const gameState = initialState();

/**
 * Put every field back to its new-run value, in place.
 *
 * In place, not by reassignment, precisely because callers hold the reference.
 * Sets are emptied rather than replaced for the same reason.
 */
export function resetState() {
  const fresh = initialState();
  for (const key of Object.keys(fresh)) {
    const value = fresh[key];
    if (value instanceof Set) {
      gameState[key].clear();
    } else {
      gameState[key] = value;
    }
  }
}
