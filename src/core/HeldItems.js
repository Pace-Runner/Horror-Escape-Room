import * as THREE from 'three';
import { gameState, ITEMS } from './GameState.js';
import { HELD_MAGNIFICATION } from '../systems/hands/sockets.js';

/**
 * What is in the player's hand: one inventory item at a time, shown the way the
 * torch always has been.
 *
 * THE LOOK. The item replaces the hand. It is parented into the right hand's
 * grip socket, so it inherits every procedural layer (breathe, sway, bob) for
 * free, and the GLOVE is then hidden so only the item is drawn. The pose and the
 * socket still do their work -- they are what puts the item where it is -- the
 * skinned mesh is just not drawn. Empty-handed, the glove comes back, relaxed.
 *
 * TWO STATES, KEPT APART ON PURPOSE:
 *   selected  the inventory slot the player has chosen. Gameplay reads this
 *             (isHolding), so a puzzle answers the instant the wheel moves.
 *   equipped  the item whose view model is actually in the socket right now.
 *             That can lag: the hands may not have loaded, the torch's .glb may
 *             not have arrived, or a one-shot clip (pick up, drop) may own the
 *             hand. update() reconciles the two every frame, whichever of those
 *             finishes last -- the same "whoever lands last does the work" rule
 *             equipTorch() used to implement by hand for the torch alone.
 *
 * RIGHT hand only: the game builds the right hand and nothing else (see
 * ACTIVE_SIDES in systems/hands/hands.js).
 */
const SIDE = 'right';

/**
 * If the drop clip's hands:release never arrives (hands not loaded, tab hidden),
 * land it anyway. Longer than the whole 0.85 s clip, not just its 0.55 s
 * release: a slow frame delays the event, and a fallback that beat it would put
 * the item on the floor while the fingers on screen were still closed round it.
 */
const DROP_RELEASE_FALLBACK_MS = 1000;

/**
 * The hand shape the `drop` clip starts from (its first key is gripCylinder,
 * see systems/hands/clips/drop.js). An item held in any other pose is re-held
 * in this one, unmoved on screen, before the clip plays -- see reholdIn().
 */
const DROP_CLIP_POSE = 'grip-cylinder';

const deg = THREE.MathUtils.degToRad;

/**
 * Where the TORCH's grip sits, as an offset from where hold-torch alone puts it.
 *
 * hold-torch turns the wrist ~87 degrees to aim the beam forward, and a joint
 * rotation pivots about that joint. The wrist sits BELOW the bottom of the frame
 * (measured at -1.10 in normalised device coordinates), so rotating about it
 * swung the whole hand out of shot: every fingertip measured off screen, at
 * x 0.71..1.24 and y -1.04..-1.48, leaving just the torch head poking into the
 * corner. Aiming the torch and framing the hand are two different problems and
 * this is the second one.
 *
 * Hands.root exists for exactly this - its own docstring says "framing/
 * visibility is one transform" - and translating it moves hand and torch
 * together without touching the aim.
 *
 * Solved against the GRIP, not the fingertips: the glove is hidden while the
 * torch is held, so the torch is the only thing on screen and the only thing
 * worth framing. This value puts the grip at roughly (0.50, -0.56) in
 * normalised device coordinates and the bezel at (0.21, -0.15), which is the
 * torch low in the bottom-right corner with its head reaching back toward the
 * middle of the frame and its tail running off the corner.
 */
const TORCH_FRAMING_OFFSET = Object.freeze([-0.1536, 0.1506, 0.0500]);

/**
 * How far the whole hand is spun about the beam while holding the torch.
 *
 * The beam leaves a closed fist along the pinky-to-index axis, so aiming it
 * forward decides WHERE it points but not which face of the fist the camera
 * ends up looking at - and at 0 the camera got the BACK of the hand, with the
 * hand itself hiding the barrel it was supposed to be showing off. Rolling
 * about the beam axis cannot change the beam direction (it is a rotation about
 * that very axis), so this buys the good read for free: the torch presented to
 * the camera, fingers wrapped visibly around the knurl, hand behind it.
 *
 * 60 degrees, chosen by rendering the player's actual view across a full sweep
 * and matching it against a reference frame the project owner supplied: the hand
 * grips from the right with the fingers wrapping visibly around the left of the
 * barrel. At 0 the camera gets the palm and splayed fingers; by 120 the hand has
 * swung around the socket far enough to sit between the lens and the torch.
 */
const TORCH_ROLL = deg(60);

/** An offset expressed relative to the torch's grip spot, so items can be nudged from a known-good place. */
function fromTorchGrip(dx, dy, dz) {
  return Object.freeze([TORCH_FRAMING_OFFSET[0] + dx, TORCH_FRAMING_OFFSET[1] + dy, TORCH_FRAMING_OFFSET[2] + dz]);
}

/**
 * ===================== PER-ITEM FRAMING -- TUNE HERE =====================
 *
 * Everything that decides how an item sits in the hand, in one table. Live-
 * tunable from the dev console: edit window.__game.heldItems.framing.<id> and
 * call window.__game.heldItems.reframe().
 *
 *   pose        Hand pose the item is held in (systems/hands/poses). The glove
 *               is hidden, so this only decides where the socket ends up -- and
 *               what the hand's clips do to the item, see below.
 *   anchorPose  Optional. The grip is first placed where THIS pose would put
 *               it, then the hand switches to `pose`. Every item except the torch
 *               anchors on hold-torch, so `offset` is measured from the same
 *               known-good spot on screen the torch's grip occupies.
 *   aim         Optional camera-space direction the item's long axis points
 *               (+x right, +y up, -z into the screen; normalised for you).
 *               Omitted, the axis stays wherever the pose aims it -- which is how
 *               the torch keeps its measured hold-torch aim exactly.
 *   roll        Radians spun about that axis: which face of the item the camera
 *               sees. Cannot change where the axis points.
 *   offset      Camera-space metres added to the grip's position.
 *   scale       Multiplier on the item's WORLD size (see world/itemMeshes.js).
 *
 * WHY THE NON-TORCH ITEMS USE grip-cylinder. The hand's one-shot clips are all
 * authored on that shape: `drop` starts from it and `lockpick` is it plus a few
 * degrees of wrist. An item held in hold-torch would swing ~87 degrees sideways
 * the moment either clip started, because hold-torch's whole aim lives in the
 * wrist that the clip overwrites; held in grip-cylinder, `drop` just lowers it
 * and `lockpick` jiggles the paperclip in the cuff, which is the point. The torch
 * keeps hold-torch -- its numbers below are the measured ones, unchanged -- and
 * is re-held in grip-cylinder, unmoved on screen, the instant it is dropped
 * (see reholdIn), so `drop` lowers it too instead of whipping it round.
 *
 * EVERY ROW IS NOW TUNED AGAINST THE RENDERED VIEW (960x540, the game's 70
 * degree FOV), not just the torch's. The NDC ranges quoted beside each row are
 * the item's measured on-screen bounds at rest, before sway and bob, so a
 * re-tune has numbers to compare against. The targets: everything sits in the
 * lower right, where the torch's fist does; nothing reaches the crosshair; the
 * small items (keys, paperclip) stand about a third of the screen tall, a
 * consistent size next to each other and believable against the torch.
 *
 * WHY THE FLAT ITEMS ARE ROLLED 90 DEGREES. Every key, and the paperclip, is
 * built with its broad face in its local XY plane (see world/itemMeshes.js),
 * and at roll 0 the frame solve left that face's in-plane X axis pointing
 * within a few degrees of straight at the lens -- so every one of them was seen
 * exactly EDGE-ON: the brass key's bow a sliver, the paperclip a single bent
 * line. A quarter turn about the long axis swings the face square to the
 * camera (its normal measured 0.94-0.99 toward the lens afterwards).
 */
export const HELD_ITEM_FRAMING = {
  flashlight: {
    pose: 'hold-torch',
    roll: TORCH_ROLL,
    offset: TORCH_FRAMING_OFFSET,
    // The grip pose and socket are fitted to the magnified barrel -- see
    // HELD_MAGNIFICATION in systems/hands/sockets.js. Change all three together.
    scale: HELD_MAGNIFICATION
  },
  // Rising out of the bottom-right corner, steeper than a torch, with the goose-
  // neck seen side on: claw at about NDC (0.22..0.40, -0.02..0.19), right of and
  // above the crosshair rather than on it. Steep on purpose -- aimed forward
  // like the torch, the bar ran half a metre away from the lens and the claw,
  // the one part that says "crowbar", shrank to a few pixels at the vanishing
  // point dead centre. Roll 0 is the side-on view (hook plane facing the lens);
  // at 180 the claw curls straight at the camera and the curve disappears.
  crowbar: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [0.12, 0.72, -0.68],
    roll: deg(0),
    offset: fromTorchGrip(0.05, -0.15, -0.02),
    scale: 0.85
  },
  // Keys are held up nearly upright, bit on top, the way you check a key
  // against a lock -- pointed down the view like the torch they foreshorten to
  // a dot. Each is scaled to stand about 0.78 NDC tall (NDC y about -0.85 to
  // -0.05, x 0.37..0.65), so whichever key is out reads at one size.
  brassKey: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.2, 0.9, -0.38],
    roll: deg(90),
    offset: fromTorchGrip(-0.01, 0, 0),
    scale: 1.5
  },
  bedroomKey: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.2, 0.9, -0.38],
    roll: deg(90),
    offset: fromTorchGrip(-0.01, 0, 0),
    // The room's own key is a 21 cm prop, so it needs the smallest multiplier.
    scale: 0.5
  },
  // The study's two keys have a WASHER bow -- a ring at right angles to the
  // shaft (see studyLevel.js) -- which the brass and bedroom keys' tilt shows
  // exactly edge-on, as a bar. Leaning the top a little TOWARD the camera
  // instead opens the ring into an ellipse that reads as a key's bow.
  doorKey: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.25, 0.95, -0.12],
    roll: deg(90),
    offset: fromTorchGrip(-0.01, 0, 0),
    scale: 0.85
  },
  gateKey: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.25, 0.95, -0.12],
    roll: deg(90),
    offset: fromTorchGrip(-0.01, 0, 0),
    scale: 1.0
  },
  // 1.5x its world size, which is itself 1.75x life (PAPERCLIP_SCALE in
  // bedroomLevel.js): a true-size clip in a fist is a few pixels of wire. The
  // project owner asked for 1.5 rather than the 3 it was first held at -- keep
  // it at 1.5. That is about 9 cm of clip, and on screen it stands about 0.67
  // NDC tall (NDC x 0.44..0.64, y -0.78..-0.11): a little shorter than the keys,
  // in the same lower-right spot, face square to the camera so both loops show.
  // Stood nearly upright -- leaning, its long thin outline read as a stray wire
  // -- and held up like a key, so the lockpick clip's wrist wiggle reads as
  // working it in the cuff.
  paperclip: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.1, 0.97, -0.22],
    roll: deg(90),
    offset: fromTorchGrip(0, -0.01, 0),
    scale: 1.5
  },
  // Held by one end of the band, which runs off to the left, lenses facing the
  // camera: NDC x 0.25..0.79, y -0.60..-0.21. At life size and the first
  // framing it filled the right half of the screen seen from BEHIND, lenses
  // pointing away; 128 degrees is the roll that measured the lenses squarest
  // to the lens (a sweep of the full turn), and 0.55 sizes the band to about a
  // quarter of the screen's width.
  visor: {
    pose: 'grip-cylinder',
    anchorPose: 'hold-torch',
    aim: [-0.95, 0.25, -0.2],
    roll: deg(128),
    offset: fromTorchGrip(0.035, 0.012, 0),
    scale: 0.55
  }
};

/** For an id the table has no row for: the torch's spot, pointing up. */
const DEFAULT_FRAMING = Object.freeze({
  pose: 'grip-cylinder',
  anchorPose: 'hold-torch',
  aim: [-0.2, 0.9, -0.38],
  roll: 0,
  offset: TORCH_FRAMING_OFFSET,
  scale: 1
});

const ZERO = Object.freeze([0, 0, 0]);
const _before = new THREE.Vector3();
const _after = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _socketQuat = new THREE.Quaternion();
const _camInv = new THREE.Quaternion();
const _align = new THREE.Quaternion();
const _roll = new THREE.Quaternion();

/**
 * @param {object} deps
 * @param {import('../systems/hands/hands.js').Hands} deps.hands
 * @param {THREE.Camera} deps.camera   the camera hands.root hangs off
 * @param {ReturnType<import('../world/itemMeshes.js').createItemMeshes>} deps.itemMeshes
 * @param {(state: {held: string|null, selected: string|null, previousHeld: string|null}) => void} [deps.onChange]
 *   fired whenever the held or selected item changes, for the beam and the hotbar;
 *   previousHeld is what was held before the change
 */
export function createHeldItems({ hands, camera, itemMeshes, onChange = () => {} }) {
  /** The chosen inventory slot. */
  let selected = null;
  /** The id whose view model is in the socket right now, and that model. */
  let equipped = null;
  let equippedMesh = null;
  /** A drop between Q and the fingers opening: { id, token, timer, onRelease }. */
  let dropping = null;
  let dropToken = 0;
  /** Glove meshes switched off by hideGlove(), so showGlove() restores exactly those. */
  let hiddenGlove = null;
  /** One view model per id, built on first use and reused, never rebuilt. */
  const heldMeshes = new Map();
  /** What onChange was last told, so it only fires on a real change. */
  let notified = false;
  let lastHeld = null;
  let lastSelected = null;

  const owns = (id) => gameState.inventory.has(id);

  /**
   * The visor is the one item that can be in the inventory, selected, and still
   * not in the hand: once it is WORN it is on the player's face. Showing it in
   * the fist as well would be two visors.
   */
  const suppressed = (id) => id === 'visor' && gameState.visorWorn;

  /** What the player is holding as far as the GAME is concerned, or null. */
  function heldId() {
    return selected && owns(selected) && !suppressed(selected) ? selected : null;
  }

  function specFor(id) {
    return HELD_ITEM_FRAMING[id] ?? DEFAULT_FRAMING;
  }

  /**
   * Tells main.js when what is held or selected has changed. Called from
   * update() every frame -- which is what catches the one change nothing here
   * causes, the visor going on or off -- so it compares two fields rather than
   * building a key string, and allocates nothing on the frames nothing moved.
   */
  function notifyIfChanged() {
    const held = heldId();
    if (notified && held === lastHeld && selected === lastSelected) return;
    const previousHeld = lastHeld;
    notified = true;
    lastHeld = held;
    lastSelected = selected;
    onChange({ held, selected, previousHeld });
  }

  function getHeldMesh(id) {
    let wrapper = heldMeshes.get(id);
    if (wrapper) return wrapper;
    const model = itemMeshes.build(id, 'held');
    if (!model) return null;
    // A wrapper so the table's scale never fights whatever transform the
    // canonical model carries inside it.
    wrapper = new THREE.Group();
    wrapper.name = `held:${id}`;
    wrapper.add(model);
    heldMeshes.set(id, wrapper);
    return wrapper;
  }

  /**
   * Hides the GLOVE, leaving whatever it is holding on screen.
   *
   * Not hands.setVisible(): that hides hands.root, and the item is parented
   * into one of the hand's sockets, so it lives under hands.root too and would
   * vanish with it. Only the meshes are toggled - the bones stay in the graph
   * and keep animating, which matters because socket.grip hangs off the wrist
   * bone and is what puts the item where it is. Hide the geometry, keep the
   * skeleton.
   *
   * Remembers exactly what it switched off rather than blanket-showing every
   * mesh later, so anything the hand asset hides on purpose stays hidden.
   */
  function hideGlove(except) {
    showGlove();
    const keep = new Set();
    except?.traverse((o) => { if (o.isMesh) keep.add(o); });
    hiddenGlove = [];
    hands.root.traverse((o) => {
      if (o.isMesh && o.visible && !keep.has(o)) {
        o.visible = false;
        hiddenGlove.push(o);
      }
    });
  }

  function showGlove() {
    if (!hiddenGlove) return;
    for (const o of hiddenGlove) o.visible = true;
    hiddenGlove = null;
  }

  /**
   * Poses the hand for `spec` and frames it: aims the item, spins it about its
   * own axis, and puts the grip where the table says.
   *
   * The rotation goes on `hands.root` as a RIGID rotation rather than into the
   * wrist pose, so it costs no extra skin shear on top of whatever the pose
   * already spends at that joint.
   *
   * The catch is that rotating hands.root turns everything about the CAMERA
   * origin, not about the hand - which swings the hand toward the lens and made
   * it balloon to fill the frame. So the translation is solved afterwards to put
   * the grip back exactly where it was before the rotation (plus the framing
   * offset), which turns "rotate about the camera" into "rotate about the
   * socket".
   *
   * Solved live rather than baked into constants: it reads the socket's real
   * position each time, so it stays correct if HAND_ROOT_POSITION, a pose or the
   * socket placement ever move. For the torch (no anchorPose, no aim) this is
   * exactly the old frameTorch(), step for step.
   */
  function frame(spec) {
    const socket = hands.getSocket(SIDE, spec.socket ?? 'grip');
    if (!socket) return;
    const root = hands.root;

    // Measure from a clean slate, so calling this twice is idempotent.
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    hands.setPose(SIDE, spec.anchorPose ?? spec.pose);
    camera.updateMatrixWorld(true);

    // hands.root is a child of the camera, so its parent space IS camera space -
    // which is the frame the axis, the aim and the offset are all expressed in.
    camera.worldToLocal(socket.getWorldPosition(_before));
    if (spec.anchorPose && spec.anchorPose !== spec.pose) {
      hands.setPose(SIDE, spec.pose);
      camera.updateMatrixWorld(true);
    }

    // The item's long axis is the socket's +Y (the grip convention).
    camera.getWorldQuaternion(_camInv).invert();
    _axis.set(0, 1, 0)
      .applyQuaternion(socket.getWorldQuaternion(_socketQuat))
      .applyQuaternion(_camInv)
      .normalize();

    if (spec.aim) {
      _aim.fromArray(spec.aim).normalize();
      _align.setFromUnitVectors(_axis, _aim);
      _roll.setFromAxisAngle(_aim, spec.roll ?? 0);
      root.quaternion.copy(_roll).multiply(_align);
    } else {
      root.quaternion.setFromAxisAngle(_axis, spec.roll ?? 0);
    }
    camera.updateMatrixWorld(true);

    camera.worldToLocal(socket.getWorldPosition(_after));
    root.position.copy(_before).add(_offset.fromArray(spec.offset ?? ZERO)).sub(_after);
  }

  /**
   * Switches the hand to `pose` WITHOUT moving the item in it: hands.root is
   * turned and shifted so the socket keeps exactly the camera-space position
   * and orientation it had. The glove is hidden, so the swap cannot be seen.
   *
   * For the torch's drop. hold-torch keeps the whole beam aim in the wrist, and
   * `drop` starts on gripCylinder, which has none -- so played straight over the
   * torch, its 0.2 s crossfade swung the bare torch ~80 degrees round the
   * off-screen wrist before the fingers opened. Re-held in the clip's own start
   * shape first, the crossfade has nothing to do and the clip just lowers it.
   *
   * The socket's camera-space turn is root * local, so to keep it at `before`
   * once the pose has changed `local`, the root is pre-multiplied by
   * before * after^-1; the translation is then fixed the same way frame() does.
   */
  function reholdIn(pose) {
    const socket = hands.getSocket(SIDE, specFor(equipped).socket ?? 'grip');
    if (!socket) return;
    const root = hands.root;
    camera.updateMatrixWorld(true);
    camera.getWorldQuaternion(_camInv).invert();
    camera.worldToLocal(socket.getWorldPosition(_before));
    _align.copy(_camInv).multiply(socket.getWorldQuaternion(_socketQuat));
    hands.setPose(SIDE, pose);
    camera.updateMatrixWorld(true);
    _roll.copy(_camInv).multiply(socket.getWorldQuaternion(_socketQuat));
    root.quaternion.premultiply(_align.multiply(_roll.invert()));
    camera.updateMatrixWorld(true);
    camera.worldToLocal(socket.getWorldPosition(_after));
    root.position.add(_before).sub(_after);
  }

  function equipView(id) {
    const mesh = getHeldMesh(id);
    if (!mesh) return false;
    const spec = specFor(id);
    mesh.scale.setScalar(spec.scale ?? 1);
    if (!hands.attach(SIDE, mesh, spec.socket ?? 'grip')) return false;
    frame(spec);
    hideGlove(mesh);
    equipped = id;
    equippedMesh = mesh;
    return true;
  }

  function unequipView() {
    if (!equipped) return;
    hands.detach(SIDE);
    // Detached first, so nothing is excluded and the whole glove comes back.
    showGlove();
    hands.setPose(SIDE, 'relaxed');
    hands.root.position.set(0, 0, 0);
    hands.root.quaternion.identity();
    equipped = null;
    equippedMesh = null;
  }

  /** The view model that SHOULD be in the hand right now, or null for an empty glove. */
  function wantedView() {
    const id = heldId();
    return id && itemMeshes.has(id) ? id : null;
  }

  /**
   * The owned items in the order the hotbar draws its slots -- ITEMS' order,
   * which index.html's markup follows -- NOT pickup order. The inventory Set is
   * in pickup order, and a drop and re-pickup sends an item to its end, so
   * stepping through that made the highlight jump between non-adjacent slots.
   */
  function ownedInSlotOrder() {
    return Object.keys(ITEMS).filter(owns);
  }

  /**
   * Picks the next owned slot to the right of `id`, for when `id` leaves the
   * inventory while selected. Wraps; null when nothing is left.
   */
  function selectAfterRemoval(id) {
    if (selected !== id) return;
    const slots = Object.keys(ITEMS);
    const at = slots.indexOf(id);
    const rest = ownedInSlotOrder().filter((other) => other !== id);
    selected = rest.find((other) => slots.indexOf(other) > at) ?? rest[0] ?? null;
  }

  function finishDrop(token) {
    if (!dropping || dropping.token !== token) return;
    const { id, timer, onRelease } = dropping;
    clearTimeout(timer);
    dropping = null;
    if (equipped === id) unequipView();
    // Only what is still carried AND still in the hand can land on the floor --
    // never a second copy, and never a visor put on (V) between Q and the
    // fingers opening: that one is on the player's face now, and dropping it
    // anyway left it worn, uncarried and lying on the floor all at once.
    if (owns(id) && !suppressed(id)) onRelease?.(id);
    notifyIfChanged();
  }

  return {
    /** The live framing table, exposed for tuning -- see HELD_ITEM_FRAMING. */
    framing: HELD_ITEM_FRAMING,

    get selected() { return selected; },
    get held() { return heldId(); },
    get equipped() { return equipped; },
    get equippedMesh() { return equippedMesh; },
    get dropping() { return !!dropping; },

    /**
     * The puzzle gate. True only for the item in the player's hand -- and not
     * while it is being let go of: a puzzle that used the item up between Q and
     * the fingers opening would leave a copy of it on the floor.
     */
    isHolding(id) {
      return !dropping && heldId() === id;
    },

    /** Selects an owned item, or null for an empty hand. Refused mid-drop. */
    select(id) {
      if (dropping) return false;
      if (id !== null && !owns(id)) return false;
      selected = id;
      notifyIfChanged();
      return true;
    },

    /** One wheel step through the owned items in hotbar slot order, wrapping. */
    cycle(direction) {
      if (dropping) return false;
      const order = ownedInSlotOrder();
      if (!order.length) return false;
      const at = order.indexOf(selected);
      const next = at < 0
        ? (direction > 0 ? 0 : order.length - 1)
        : (at + (direction > 0 ? 1 : -1) + order.length) % order.length;
      if (order[next] === selected) return false;
      selected = order[next];
      notifyIfChanged();
      return true;
    },

    /**
     * An item has just been added to the inventory: it becomes the held one.
     *
     * With `animate`, the empty glove plays the pickup clip first and the item
     * appears in it once the clip is done (update() waits for a one-shot to
     * finish before it swaps anything). The previous item leaves the hand
     * immediately, so the reach is the bare glove's, which is what the clip was
     * authored on -- played over a held item it would swing that item about
     * instead.
     */
    take(id, { animate = true } = {}) {
      // A pickup landing mid-drop finishes the drop first, so the item on its
      // way to the floor is not lost under the new one.
      if (dropping) finishDrop(dropping.token);
      if (animate && hands.ready) {
        unequipView();
        hands.play(SIDE, 'pickup', { fade: 0.15 });
      }
      selected = id;
      notifyIfChanged();
    },

    /**
     * `id` has left the inventory (used up, or dropped): if it was selected,
     * the next owned slot to its right on the hotbar takes its place.
     */
    itemRemoved(id) {
      selectAfterRemoval(id);
      notifyIfChanged();
    },

    /**
     * Starts dropping the held item: plays the hand's drop clip and calls
     * `onRelease(id)` when its fingers open (hands:release), or after a
     * fallback delay if that event never arrives. The caller owns the
     * inventory and the world, so removing the item and placing it are its job.
     *
     * @returns {boolean} false when there is nothing to drop or the hand is busy
     */
    drop(onRelease) {
      const id = heldId();
      if (!id || dropping) return false;
      // Mid pickup: the item is not in the hand yet, so there is nothing to let go of.
      if (hands.ready && hands.isBusy(SIDE)) return false;
      const token = ++dropToken;
      dropping = { id, token, onRelease, timer: null };
      if (hands.ready) {
        if (equipped === id && specFor(id).pose !== DROP_CLIP_POSE) reholdIn(DROP_CLIP_POSE);
        hands.play(SIDE, 'drop', {
          fade: 0.2,
          onEvent: (name) => { if (name === 'hands:release') finishDrop(token); }
        });
      }
      dropping.timer = setTimeout(() => finishDrop(token), DROP_RELEASE_FALLBACK_MS);
      return true;
    },

    /** Abandons a drop in flight -- the item stays in the hand. For level changes. */
    cancelDrop() {
      if (!dropping) return;
      clearTimeout(dropping.timer);
      dropping = null;
      // The drop may have re-held the item in another pose (reholdIn), with
      // hands.root turned to match -- so its framing is solved again from
      // scratch, not just its pose put back.
      if (equipped && hands.ready) frame(specFor(equipped));
      else this.restorePose();
    },

    /**
     * Puts the hand back in the held item's pose (or relaxed, empty-handed) after
     * something else has driven its joints -- the lockpick loop, or a clip a level
     * change stopped half way. The framing does not need solving again: it was
     * solved for this exact pose, and hands.root has not moved.
     */
    restorePose(seconds = 0) {
      if (!hands.ready) return;
      const pose = equipped ? specFor(equipped).pose : 'relaxed';
      if (seconds > 0) hands.blendToPose(SIDE, pose, seconds);
      else hands.setPose(SIDE, pose);
    },

    /** Re-solves the current item's framing. For live tuning of the table above. */
    reframe() {
      if (!equipped || !hands.ready) return;
      const spec = specFor(equipped);
      equippedMesh?.scale.setScalar(spec.scale ?? 1);
      frame(spec);
    },

    /**
     * Brings what is in the hand into line with what is selected. Per frame.
     *
     * Holds off while a one-shot clip owns the hand (the swap happens on the
     * frame it ends) and while a drop is waiting for its fingers to open.
     */
    update() {
      notifyIfChanged();
      if (dropping || !hands.ready) return;
      const want = wantedView();
      if (want === equipped) return;
      if (hands.isBusy(SIDE)) return;
      unequipView();
      if (want) equipView(want);
    },

    /** Nothing held, empty relaxed glove, no drop pending. For a restart. */
    reset() {
      if (dropping) {
        clearTimeout(dropping.timer);
        dropping = null;
      }
      selected = null;
      if (hands.ready) {
        unequipView();
        showGlove();
        hands.setPose(SIDE, 'relaxed');
        hands.root.position.set(0, 0, 0);
        hands.root.quaternion.identity();
      }
      notifyIfChanged();
    }
  };
}
