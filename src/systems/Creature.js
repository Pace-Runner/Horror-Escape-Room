import * as THREE from 'three';

/**
 * The thing in the house.
 *
 * THE ONE IDEA THIS FILE EXISTS TO EXPRESS. There is no creature and no
 * Annabelle. There is ONE figure, and the visor decides which one you are
 * looking at. Mark's letter: "I look at people and their faces aren't their
 * faces anymore. Their bodies look wrong." The player's sight is broken, so a
 * woman standing in a doorway renders as something with arms to its knees and
 * its head on wrong. Put the calibration lenses on and the same figure, in the
 * same place, mid-stride of the same animation, is a person.
 *
 * That is why this is one rig with two PROPORTION SETS rather than two models.
 * Two models would need to be swapped, and a swap is a cut -- the player would
 * see one thing replaced by another, which says "the game changed what is
 * there". Lerping bone lengths says "you are seeing it correctly now", and it
 * can happen continuously while the visor fades on, mid-walk, without the
 * figure ever stopping being itself. The twist is a rendering problem, and this
 * is the rendering.
 *
 * DELIBERATELY NOT BUILT ON src/systems/hands/. That module's clip playback is
 * a documented no-op -- animator.js literally does `void clip; return
 * INERT_CLIP_HANDLE;` -- and it is hard-wired to two camera-parented hands.
 *
 * DELIBERATELY NOT A .glb EITHER. A rigged model would be a nicer creature and
 * a worse twist: the whole point is that both readings are the same body, and
 * that is trivially true when the body is one parametric rig and merely
 * asserted when it is two files.
 */

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * Every length is in metres, so the numbers are checkable against the world:
 * the player's eye height is 1.6 and doorways are a little over 2.
 *
 * HUMAN is Annabelle: 1.68 m, ordinary. Nothing about it should read as
 * stylised, because the moment the visor goes on she has to look like a person
 * who has been hiding in a basement, not like a friendlier monster.
 */
const HUMAN = {
  hipHeight: 0.92,
  spine: 0.26,
  chest: 0.20,
  neck: 0.09,
  headRadius: 0.115,

  upperArm: 0.30,
  forearm: 0.27,
  hand: 0.10,

  thigh: 0.44,
  shin: 0.42,

  shoulderWidth: 0.19,
  hipWidth: 0.11,

  limbRadius: 0.052,
  torsoWidth: 0.165,
  torsoDepth: 0.105,

  /** Radians. Forward pitch of the spine; a person stands nearly straight. */
  hunch: 0.06,
  /** Radians. Sideways tilt of the head -- zero for a person. */
  headTilt: 0.0,
  /** Radians. Forward crane of the neck. */
  neckLean: 0.05,
  /** Radians. Shoulders rolled forward and up around the neck. */
  shoulderRoll: 0.04,
  /** Head shape. >1 is long and narrow, which is most of "wrong" on a face. */
  headStretch: 1.0,
  /** How much hair there is. She has the same hair in both readings. */
  hairSize: 1.0,
  footLength: 0.20
};

/**
 * HOLLOW is the same woman seen through broken sight. It has to be recognisably
 * the same figure -- same joint count, same walk -- and simply WRONG. The
 * distortions are the ones the basement sketch names: "Long arms. Thin body.
 * Hunched back. Long fingers. A head at the wrong angle."
 *
 * The legs stay close to human length on purpose. Stretching everything would
 * just read as a bigger person; keeping the legs and stretching the arms is
 * what makes it read as a body that has gone wrong rather than a giant.
 */
const HOLLOW = {
  hipHeight: 0.99,
  spine: 0.30,
  chest: 0.22,
  neck: 0.155,
  headRadius: 0.098,

  // The silhouette. Arms nearly half again as long, so the hands hang past
  // the knees -- the single most legible cue at a distance and in the dark.
  upperArm: 0.45,
  forearm: 0.44,
  hand: 0.20,

  thigh: 0.46,
  shin: 0.45,

  shoulderWidth: 0.175,
  hipWidth: 0.095,

  limbRadius: 0.034,
  torsoWidth: 0.125,
  torsoDepth: 0.072,

  hunch: 0.42,
  headTilt: 0.30,
  neckLean: 0.34,
  // Shoulders drawn up and forward around the neck, so the head sits INSIDE
  // the shoulder line. That silhouette is what makes a hunch read as a hunch
  // rather than as someone leaning over to pick something up.
  shoulderRoll: 0.30,
  headStretch: 1.34,
  // Unchanged. The hair is the one thing that is the same in both readings,
  // and it is the detail that should make a player who has seen the portrait
  // feel they have met this figure before.
  hairSize: 1.0,
  footLength: 0.24
};

const KEYS = Object.keys(HUMAN);

/** Total standing height, for placing it against doorways and camera pitch. */
function standingHeight(p) {
  return p.hipHeight + p.spine + p.chest + p.neck + p.headRadius * 2;
}

// ---------------------------------------------------------------------------
// Gait
// ---------------------------------------------------------------------------

/** Metres per full stride, matching PointerLockPlayer's STRIDE so gaits agree. */
const STRIDE = 1.55;
/** Radians of hip swing at a walk. The Hollow's gait is wider and looser. */
const HIP_SWING_HUMAN = 0.52;
const HIP_SWING_HOLLOW = 0.66;
const ARM_SWING_HUMAN = 0.42;
/**
 * Barely swings. A person walking swings their arms as a counterweight; this
 * lets its arms hang and drags them, which is most of why it reads as wrong
 * even before you notice how long they are.
 */
const ARM_SWING_HOLLOW = 0.13;

// ---------------------------------------------------------------------------

function segment(material, radius, length) {
  // Capsule rather than cylinder so joints do not show a hard seam when a limb
  // bends, which at these radii would be visible even in this game's dark.
  const geo = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 4, 8);
  const mesh = new THREE.Mesh(geo, material);
  // Bones point down the -Y of their parent, so the mesh is offset half a
  // length down and the joint sits at the bone's own origin. That is what lets
  // a length change be a single scale without moving the joint.
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  return mesh;
}

/**
 * One limb chain. Returns the joints so the animation can address them by name,
 * and the meshes so a proportion change can rescale them.
 */
function limb(material, parent, lengths, radius) {
  const joints = [];
  const meshes = [];
  let node = parent;
  for (const length of lengths) {
    const joint = new THREE.Object3D();
    joint.position.y = node === parent ? 0 : -lengths[joints.length - 1];
    node.add(joint);
    const mesh = segment(material, radius, length);
    joint.add(mesh);
    joints.push(joint);
    meshes.push(mesh);
    node = joint;
  }
  return { joints, meshes };
}

export function createCreature() {
  const group = new THREE.Group();
  group.name = 'creature';

  /**
   * Two materials cross-faded by the same dial as the proportions, because
   * shape alone is not enough: the Hollow reads as a silhouette with no
   * surface, and Annabelle has to read as cloth and skin. Both are dark enough
   * to belong in this game's 6-35/255 levels.
   */
  const skin = new THREE.MeshStandardMaterial({
    color: 0x1b1714,
    roughness: 0.92,
    metalness: 0.0
  });
  const clothes = new THREE.MeshStandardMaterial({
    color: 0x2b3038,
    roughness: 0.88,
    metalness: 0.0
  });
  // Hair is its own material because it must stay dark in BOTH readings -- it
  // is the one part of her that broken sight gets right.
  const hair = new THREE.MeshStandardMaterial({
    color: 0x14100e,
    roughness: 0.96,
    metalness: 0.0
  });

  // --- rig ------------------------------------------------------------------
  const root = new THREE.Object3D();          // on the floor, faces -Z
  group.add(root);

  const hips = new THREE.Object3D();
  root.add(hips);

  const spine = new THREE.Object3D();
  hips.add(spine);
  const spineMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
  spineMesh.castShadow = true;
  spine.add(spineMesh);

  const chest = new THREE.Object3D();
  spine.add(chest);
  const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
  chestMesh.castShadow = true;
  chest.add(chestMesh);

  const neck = new THREE.Object3D();
  chest.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 3, 6), skin);
  neck.add(neckMesh);

  const head = new THREE.Object3D();
  neck.add(head);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
  headMesh.castShadow = true;
  head.add(headMesh);

  // Hair. Deliberately identical in both readings and never lerped away: it is
  // the thread between the monster and the woman in the family photograph, and
  // a player who notices it before the reveal has been given the reveal
  // honestly. A half-sphere set back and slightly low, so it reads as hair
  // falling rather than as a helmet.
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hair
  );
  hairMesh.castShadow = true;
  head.add(hairMesh);

  const arms = {
    l: limb(skin, chest, [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand], HUMAN.limbRadius),
    r: limb(skin, chest, [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand], HUMAN.limbRadius)
  };
  const legs = {
    l: limb(clothes, hips, [HUMAN.thigh, HUMAN.shin], HUMAN.limbRadius * 1.15),
    r: limb(clothes, hips, [HUMAN.thigh, HUMAN.shin], HUMAN.limbRadius * 1.15)
  };

  // Feet. Small, but without them the legs end in a rounded capsule cap that
  // reads as an amputation -- and they are what plants the figure on the floor
  // instead of leaving it hovering just above it.
  const feet = {};
  for (const side of ['l', 'r']) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
    foot.castShadow = true;
    legs[side].joints[1].add(foot);
    feet[side] = foot;
  }

  // --- state ----------------------------------------------------------------
  /** 0 = seen through broken sight (the Hollow), 1 = corrected (Annabelle). */
  let correction = 0;
  /** Blended proportions, rebuilt each frame the dial moves. */
  const p = { ...HUMAN };
  let dirty = true;

  /** Distance walked, so the gait is driven by movement like the player's. */
  let gaitPhase = 0;
  let speed = 0;
  let elapsed = 0;

  function applyProportions() {
    for (const key of KEYS) p[key] = THREE.MathUtils.lerp(HOLLOW[key], HUMAN[key], correction);

    hips.position.y = p.hipHeight;
    // NEGATIVE. The rig faces -Z, and rotating +Y about +X carries it toward
    // +Z, so a positive hunch arched the figure backwards -- it stood to
    // attention instead of stooping. Caught by looking at a render.
    spine.rotation.x = -p.hunch;
    chest.position.y = p.spine;
    neck.position.y = p.chest;
    neck.rotation.x = -p.neckLean;
    head.position.y = p.neck;
    head.rotation.z = p.headTilt;

    // Torso blocks are unit geometry scaled, so a proportion change is three
    // numbers rather than a rebuilt BufferGeometry every frame.
    spineMesh.scale.set(p.torsoWidth, p.spine, p.torsoDepth);
    spineMesh.position.y = p.spine / 2;
    chestMesh.scale.set(p.torsoWidth * 1.08, p.chest, p.torsoDepth * 1.05);
    chestMesh.position.y = p.chest / 2;
    // CapsuleGeometry(1, 1) is three units tall (two unit caps plus the unit
    // body), so Y scales by neck/3 to fill the bone exactly. Scaling it by a
    // single scalar tied the neck's LENGTH to its RADIUS -- 0.09 m of mesh
    // spanning a 0.155 m bone -- and left a visible gap under the head.
    neckMesh.scale.set(p.limbRadius * 0.9, p.neck / 3, p.limbRadius * 0.9);
    neckMesh.position.y = p.neck / 2;
    headMesh.scale.set(p.headRadius * 0.92, p.headRadius * p.headStretch, p.headRadius * 0.96);
    hairMesh.scale.set(
      p.headRadius * 1.06 * p.hairSize,
      p.headRadius * p.headStretch * 1.02 * p.hairSize,
      p.headRadius * 1.12 * p.hairSize
    );
    // Back and down a little, so the face stays clear of it.
    hairMesh.position.set(0, p.headRadius * 0.08, p.headRadius * 0.10);

    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? -1 : 1;
      const arm = arms[side];
      arm.joints[0].position.set(
        sign * p.shoulderWidth,
        // Shoulders ride UP toward the neck as they roll forward, which is what
        // sinks the head into them.
        p.chest * 0.86 + p.shoulderRoll * 0.10,
        -p.shoulderRoll * 0.14
      );
      arm.joints[1].position.y = -p.upperArm;
      arm.joints[2].position.y = -p.forearm;
      const armLengths = [p.upperArm, p.forearm, p.hand];
      arm.meshes.forEach((mesh, i) => {
        // Capsule geometry is built at HUMAN length; scaling Y stretches it to
        // the blended length. X/Z carry the limb thinning.
        const s = p.limbRadius / HUMAN.limbRadius;
        mesh.scale.set(s, armLengths[i] / [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand][i], s);
        mesh.position.y = -armLengths[i] / 2;
      });

      const foot = feet[side];
      foot.scale.set(p.limbRadius * 2.0, p.limbRadius * 1.1, p.footLength);
      // At the ankle, offset forward by half its length so the heel sits under
      // the leg and the toes point the way the figure faces (-Z).
      foot.position.set(0, -p.shin + p.limbRadius * 0.4, -p.footLength * 0.28);

      const leg = legs[side];
      leg.joints[0].position.set(sign * p.hipWidth, 0, 0);
      leg.joints[1].position.y = -p.thigh;
      const legLengths = [p.thigh, p.shin];
      leg.meshes.forEach((mesh, i) => {
        const s = (p.limbRadius * 1.15) / (HUMAN.limbRadius * 1.15);
        mesh.scale.set(s, legLengths[i] / [HUMAN.thigh, HUMAN.shin][i], s);
        mesh.position.y = -legLengths[i] / 2;
      });
    }

    // Colour follows shape. The Hollow is nearly unlit black -- a hole in the
    // room -- and Annabelle is cloth and skin. Lerped in the same dial so a
    // half-corrected figure is coherent rather than a black shape in a coat.
    skin.color.setRGB(
      THREE.MathUtils.lerp(0.055, 0.34, correction),
      THREE.MathUtils.lerp(0.048, 0.26, correction),
      THREE.MathUtils.lerp(0.045, 0.22, correction)
    );
    clothes.color.setRGB(
      THREE.MathUtils.lerp(0.048, 0.17, correction),
      THREE.MathUtils.lerp(0.044, 0.19, correction),
      THREE.MathUtils.lerp(0.042, 0.22, correction)
    );
    // Hair does NOT lerp. See the material note above.

    dirty = false;
  }

  function animate(dt) {
    elapsed += dt;
    gaitPhase += (speed / STRIDE) * Math.PI * 2 * dt;

    const walking = THREE.MathUtils.clamp(speed / 1.2, 0, 1);
    const hipSwing = THREE.MathUtils.lerp(HIP_SWING_HOLLOW, HIP_SWING_HUMAN, correction) * walking;
    const armSwing = THREE.MathUtils.lerp(ARM_SWING_HOLLOW, ARM_SWING_HUMAN, correction) * walking;

    const s = Math.sin(gaitPhase);
    const c = Math.cos(gaitPhase);

    legs.l.joints[0].rotation.x = s * hipSwing;
    legs.r.joints[0].rotation.x = -s * hipSwing;
    // Knees only bend one way. max(0, ...) is what stops the shin passing
    // through the thigh on the back half of the stride.
    legs.l.joints[1].rotation.x = -Math.max(0, -c) * hipSwing * 1.5;
    legs.r.joints[1].rotation.x = -Math.max(0, c) * hipSwing * 1.5;

    // Arms counter the legs. The Hollow's barely move, which is most of why its
    // walk reads as wrong before you have consciously noticed the length.
    arms.l.joints[0].rotation.x = -s * armSwing;
    arms.r.joints[0].rotation.x = s * armSwing;
    // Hanging elbows, more so the less corrected it is.
    // Positive: same sign convention as the hunch above. An elbow brings the
    // hand forward, and negative here folded both forearms out behind the back.
    //
    // The Hollow's elbows are nearly STRAIGHT and the human's are slightly
    // bent, which is the opposite of the first attempt. A bent elbow
    // foreshortens the forearm from almost every angle, and the one thing this
    // silhouette has to communicate is that the arms are far too long -- an arm
    // folded up in front of the chest communicates nothing about its length.
    // Straight, dangling arms are also simply what the basement sketch draws.
    const hang = THREE.MathUtils.lerp(0.10, 0.28, correction);
    arms.l.joints[1].rotation.x = hang;
    arms.r.joints[1].rotation.x = hang;
    // Arms held slightly away from the body, so the silhouette reads.
    arms.l.joints[0].rotation.z = THREE.MathUtils.lerp(0.18, 0.09, correction);
    arms.r.joints[0].rotation.z = THREE.MathUtils.lerp(-0.18, -0.09, correction);
    // ...and rolled forward with the shoulders, on top of the swing. Half the
    // shoulder's roll, not all of it: the shoulder joint moving forward should
    // carry the arm with it, but the arm still hangs under gravity rather than
    // being pinned to the chest.
    arms.l.joints[0].rotation.x -= p.shoulderRoll * 0.5;
    arms.r.joints[0].rotation.x -= p.shoulderRoll * 0.5;

    // Bob with the stride, and breathe when standing still, so it is never a
    // statue -- a figure that holds perfectly still reads as scenery.
    const bob = Math.abs(Math.sin(gaitPhase)) * 0.022 * walking;
    const breath = Math.sin(elapsed * 1.4) * 0.008 * (1 - walking);
    hips.position.y = p.hipHeight + bob + breath;

    // The head keeps its crooked set but drifts, which at a distance is what
    // makes it look like it is deciding something.
    head.rotation.y = Math.sin(elapsed * 0.55) * 0.14 * (1 - walking);
  }

  applyProportions();

  return {
    group,
    /**
     * Named joints, for anything that needs a point on the body rather than a
     * point on the floor. The AI sightline starts at `head`, not at the root --
     * a creature that decides what it can see from between its own feet will
     * happily stare through a table. Also what lets a test assert the arms are
     * long instead of measuring the shins by accident.
     */
    refs: {
      root,
      hips,
      chest,
      head,
      hands: { l: arms.l.joints[2], r: arms.r.joints[2] },
      feet
    },
    /** Where it stands. Kept as x/z like every other position in this game. */
    setPosition(x, z) {
      root.position.set(x, 0, z);
    },
    get position() {
      return root.position;
    },
    /** Facing, radians. 0 looks down -Z, matching the player's yaw convention. */
    setYaw(yaw) {
      root.rotation.y = yaw;
    },
    get yaw() {
      return root.rotation.y;
    },
    /** Metres per second. Drives the gait; 0 is a standing idle, not a freeze. */
    setSpeed(v) {
      speed = Math.max(0, v);
    },
    /**
     * 0 = the Hollow, 1 = Annabelle. Drive it straight from the visor amount.
     * Continuous on purpose: half way through is a real, coherent in-between,
     * which is what makes putting the visor on read as focusing rather than as
     * the game swapping the model out.
     */
    setCorrection(value) {
      const next = THREE.MathUtils.clamp(value, 0, 1);
      if (Math.abs(next - correction) < 0.001) return;
      correction = next;
      dirty = true;
    },
    get correction() {
      return correction;
    },
    /** Standing height at the current blend, for door and sightline checks. */
    get height() {
      return standingHeight(p);
    },
    set visible(v) {
      group.visible = v;
    },
    get visible() {
      return group.visible;
    },
    update(dt) {
      if (dirty) applyProportions();
      animate(dt);
    },
    /** Back to a standing, uncorrected figure. Called on restart. */
    reset() {
      correction = 0;
      speed = 0;
      gaitPhase = 0;
      elapsed = 0;
      dirty = true;
      applyProportions();
      animate(0);
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      skin.dispose();
      clothes.dispose();
      hair.dispose();
    }
  };
}
