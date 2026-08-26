/**
 * ALL hand geometry. This file is the swappable seam.  [owner: Hands]
 *
 * Nothing outside this module may create hand geometry, and nothing inside it
 * may know about clips, poses, layers or sockets. Replace this one file and the
 * animation system keeps working - which is exactly what happened: this used to
 * build hands out of code-generated capsules and a rounded box, and now it loads
 * a skinned glTF instead. `rig.js`, `animator.js`, the §4 API and the tests did
 * not change.
 *
 * ============================ WHY A SKINNED MODEL ========================
 * The original v1 plan was rigid segment meshes, and the brief's justification
 * was explicit: a leather GLOVE has stitched panels, so segment bands read as
 * construction rather than as budget. The art direction then moved to bare
 * grimy hands, and that justification went with it - the brief's own warning is
 * that "segmented bare skin reads as a mannequin", and the captured frames in
 * `.hands-capture/` confirmed it precisely.
 *
 * A skinned mesh also fixes two things the segmented version failed:
 *   - Draw calls. Two primitives for both hands, against 30 for 15 segment
 *     meshes per hand. The brief's budget was 16 for both hands.
 *   - Joint continuity. Skinning deforms across the joint, so there is nothing
 *     to gap and nothing to band.
 *
 * ONE HAND, INSTANTIATED TWICE. The asset is a single right hand and forearm.
 * Each side clones it and the left is MIRRORED with a negative X scale, which is
 * what Unit 9 specified ("mirror the transform, do not duplicate the pose
 * data"). Three.js handles the negative determinant correctly - WebGLRenderer
 * flips the winding order per object - so the mirrored copy is not inside out.
 * Identical local bone rotations therefore produce correctly mirrored motion,
 * and one set of pose files drives both hands.
 * =========================================================================
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

import { JOINTS, FINGERS } from "./rig.js";

/* ------------------------------------------------------------- asset url */

/**
 * Default is relative to the PAGE, and the game's page sits at the deploy root,
 * so this resolves correctly both locally and inside a subdirectory. Never a
 * leading slash - see tools/check-deploy.mjs.
 *
 * The dev harness is served from a nested path (`/hands/dev/hands.html`), where
 * a page-relative "./models/..." would resolve to "/hands/dev/models/...". It
 * calls setHandAssetUrl() to correct that. A module-level setter rather than an
 * init() parameter, because the §4 API is frozen and this is a build-time
 * concern, not a gameplay one.
 */
let assetUrl = "./models/characters/hands.glb";

export function setHandAssetUrl(url) {
  assetUrl = url;
}

export function getHandAssetUrl() {
  return assetUrl;
}

/* ------------------------------------------------------------ bone naming */

/**
 * Leaf bones an FBX/Collada conversion adds to terminate a chain. They carry no
 * useful rotation and their lengths are junk, so they are dropped before any
 * chain is measured or mapped.
 */
const END_BONE = /(^|[._])end([._]|\d|$)/i;

/** Which chain a bone belongs to. `pink` is included because one rig spells it that way. */
const CHAIN_KEYWORDS = Object.freeze({
  thumb: ["thumb"],
  index: ["index"],
  middle: ["middle"],
  ring: ["ring"],
  pinky: ["pinky", "pink"],
});

/**
 * The §5 joints each chain owns, base to tip. Taken from rig.js's FINGERS so the
 * two cannot drift.
 */
const CHAIN_JOINTS = Object.freeze(
  Object.fromEntries(FINGERS.map((f) => [f.name, f.joints])),
);

/* ---------------------------------------------------------- bone mapping */

/**
 * Maps an imported armature onto the canonical §5 joint names.
 *
 * MAPS BY HIERARCHY DEPTH, NOT BY PARSING NUMBERS, and that is not fussiness.
 * One rig evaluated for this project numbered its index phalanges DISTALLY
 * (`index.003` was the proximal) and its ring phalanges PROXIMALLY - in the same
 * armature. Trusting the numeric suffix would have mapped half the fingers
 * backwards, silently, and the only symptom would have been fingers bending the
 * wrong way in a dark room.
 *
 * So: the chain KEYWORD (index / middle / ring / pinky / thumb) identifies which
 * digit a chain is, because that is reliable. The HIERARCHY then orders the
 * bones within it, because that is the part names get wrong.
 *
 * @param {import('three').Object3D} root a cloned skinned hierarchy
 * @returns {{ joints: Map<string, import('three').Bone>, unmapped: string[], report: string[] }}
 */
export function mapArmature(root) {
  const bones = [];
  root.traverse((node) => {
    if (node.isBone) bones.push(node);
  });

  const joints = new Map();
  const report = [];

  /**
   * The asset is a RIGHT hand, and the left instance is a mirrored clone of it,
   * so BOTH sides bind to the right-side bones. The left-side bones survive in
   * the skin (only the left vertices were removed) and must be ignored.
   */
  const isRightSide = (name) => sideOf(name) === "right";

  const candidates = bones.filter((b) => !END_BONE.test(b.name));

  // The wrist: a right-side bone named like a hand, preferring the shallowest.
  const wrist =
    candidates
      .filter((b) => /hand|wrist/i.test(b.name) && isRightSide(b.name))
      .sort((a, b) => depthOf(a) - depthOf(b))[0] ?? null;

  if (!wrist) {
    report.push("no wrist bone found - nothing could be mapped");
    return { joints, unmapped: candidates.map((b) => b.name), report };
  }

  joints.set(JOINTS.WRIST, wrist);
  report.push(`wrist <- ${wrist.name}`);

  // The forearm above the wrist stands in for the cuff: it is what hides the
  // fact that the arm stops, which is the cuff's whole job.
  if (wrist.parent?.isBone && !END_BONE.test(wrist.parent.name)) {
    joints.set(JOINTS.CUFF, wrist.parent);
    report.push(`cuff  <- ${wrist.parent.name}`);
  }

  for (const [chain, keywords] of Object.entries(CHAIN_KEYWORDS)) {
    const ourJoints = CHAIN_JOINTS[chain];
    if (!ourJoints) continue;

    // Shallowest descendant of the wrist matching the keyword: the chain root.
    const chainRoot = descendantsOf(wrist)
      .filter((b) => keywords.some((k) => b.name.toLowerCase().includes(k)))
      .sort((a, b) => depthOf(a) - depthOf(b))[0];

    if (!chainRoot) {
      report.push(`${chain}: NOT FOUND`);
      continue;
    }

    const chainBones = walkChain(chainRoot);

    /**
     * Fingers here run metacarpal -> proximal -> middle -> distal, four bones,
     * while our rig has three. Take the LAST three, so the metacarpal is skipped
     * rather than being mistaken for a knuckle - a mistake that already cost a
     * 4x scale error once in this project.
     *
     * The thumb is the exception: take the FIRST two. Its base joint carries the
     * opposition that lets a thumb meet the fingers at all, and dropping it in
     * favour of the tip would make every grip pose impossible.
     */
    const picked =
      chain === "thumb"
        ? chainBones.slice(0, ourJoints.length)
        : chainBones.slice(-ourJoints.length);

    for (let i = 0; i < ourJoints.length; i++) {
      if (picked[i]) joints.set(ourJoints[i], picked[i]);
    }
    report.push(
      `${chain.padEnd(6)} <- [${picked.map((b) => b.name).join(" -> ")}]` +
        (chainBones.length !== picked.length
          ? `   (skipped ${chainBones.length - picked.length} of ${chainBones.length})`
          : ""),
    );
  }

  const mapped = new Set([...joints.values()].map((b) => b.name));
  const unmapped = candidates.filter((b) => !mapped.has(b.name)).map((b) => b.name);
  return { joints, unmapped, report };
}

/**
 * Which side of the body a bone belongs to, or null.
 *
 * THE GLTF EXPORTER STRIPS DOTS FROM NODE NAMES, and that silently broke the
 * first version of this function. Blender's `.R` / `.L` side suffix does not
 * survive the round trip as a separated token:
 *
 *     Blender          glTF
 *     hand.R_010   ->  handR_010
 *     clavicle.L_05 -> clavicleL_05
 *     forearm.R.001_09 -> forearmR001_09
 *
 * So a pattern requiring a separator before the letter matches nothing, every
 * bone looks side-less, no wrist is found, and the whole hand silently fails to
 * bind - which is exactly what happened. What DOES survive is the CASE: the side
 * letter is the only uppercase character in an otherwise lowercase name, so an
 * uppercase R or L not followed by a lowercase letter is a reliable marker.
 *
 * Both spellings are accepted, because the dotted form is what a .blend or an FBX
 * gives us and we should not care which pipeline the asset came through.
 */
export function sideOf(name) {
  if (/right/i.test(name)) return "right";
  if (/left/i.test(name)) return "left";
  // Case-SENSITIVE from here: "rootJoint" must not read as right-side.
  if (/R(?![a-z])/.test(name)) return "right";
  if (/L(?![a-z])/.test(name)) return "left";
  return null;
}

function depthOf(bone) {
  let d = 0;
  let p = bone.parent;
  while (p) {
    d++;
    p = p.parent;
  }
  return d;
}

function descendantsOf(bone) {
  const out = [];
  bone.traverse((n) => {
    if (n !== bone && n.isBone && !END_BONE.test(n.name)) out.push(n);
  });
  return out;
}

/** Follows a single chain downward, taking the first bone child at each step. */
function walkChain(start) {
  const chain = [start];
  let current = start;
  for (;;) {
    const next = current.children.find((c) => c.isBone && !END_BONE.test(c.name));
    if (!next) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

/* ------------------------------------------------------------- alignment */

/** Target wrist-to-fingertip length, metres. Matches RIG_SPEC's own hand. */
const TARGET_HAND_LENGTH = 0.19;

/**
 * How much of the asset is kept, as a multiple of the hand's own length.
 *
 * This asset is not a hand - it is a whole arm, clavicle to fingertips - and
 * alignHand() scales the hierarchy so the HAND measures TARGET_HAND_LENGTH.
 * Since the hand is a small fraction of the arm, that same factor stretches the
 * arm to around fifty metres, and it renders as a wall of geometry beside the
 * hand. README.md's intent is a hand and a cuff: "the flared cuff is what hides
 * the fact that the arm simply stops."
 *
 * CURRENTLY DISABLED (0) at the project owner's request. The trim is no longer
 * load-bearing: main.js hides the glove entirely once the torch is picked up, and
 * that hides the arm with it, since both are the same skinned meshes. So the arm
 * is only ever on screen BEFORE the pickup, which is how the game behaved before
 * any of this.
 *
 * To switch it back on, set this to 1.35. Not 1.0: the hand does not end at one
 * hand-length - the fingertips reach 1.16x and the fingernail primitive reaches
 * 1.25x, so a cut at 1.0x removes the ends of the fingers. Measured on this
 * asset the kept triangle count is identical anywhere from 1.25x to 3.0x, there
 * being a wide empty gap between hand and arm, so the value is not delicate.
 */
const ARM_TRIM_RADIUS = 0;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _basis = new THREE.Matrix4();

/**
 * Positions, orients and scales an imported hand so its WRIST sits at the root's
 * origin, its fingers point down -Z and its pinky side faces +X.
 *
 * WHY THIS IS COMPUTED AND NOT BAKED. art/README.md rightly says to bake
 * orientation into the asset rather than fix it with a runtime rotation, and for
 * world props that is correct. A view model is the exception, and this one earned
 * it: the asset arrived with its origin ~100 units from the wrist and its fingers
 * pointing up and backwards, because a downloaded rig has no reason to share our
 * conventions. Deriving the correction FROM THE ARMATURE means any replacement
 * asset self-aligns - which is the whole point of the swappable seam - instead of
 * needing a fresh set of hand-tuned magic numbers per model.
 *
 * It is measured off BONES, not geometry. A SkinnedMesh's `geometry.boundingBox`
 * describes the undeformed base mesh, which for this asset is ~86x larger than
 * what actually renders; the bone world matrices are the evaluated skeleton and
 * are the only trustworthy source. The same base-versus-evaluated trap bit this
 * project twice in Blender.
 *
 * Must run while `root` is UNPARENTED, so world space is root-local space.
 */
function alignHand(root, joints) {
  const inner = root.children[0];
  const wrist = joints.get(JOINTS.WRIST);
  const tip = joints.get(JOINTS.MIDDLE_03) ?? joints.get(JOINTS.INDEX_03);
  const indexBase = joints.get(JOINTS.INDEX_01);
  const pinkyBase = joints.get(JOINTS.PINKY_01);
  if (!inner || !wrist || !tip) return { aligned: false, reason: "wrist or fingertip missing" };

  /* ---- 1. scale, so the hand is the right physical size ---- */
  root.updateMatrixWorld(true);
  const rawLength = wrist.getWorldPosition(_a).distanceTo(tip.getWorldPosition(_b));
  const scale = rawLength > 1e-6 ? TARGET_HAND_LENGTH / rawLength : 1;
  inner.scale.multiplyScalar(scale);

  /* ---- 2. orientation, from two measured axes ---- */
  root.updateMatrixWorld(true);
  wrist.getWorldPosition(_a);
  tip.getWorldPosition(_b);

  // Fingers must end up along -Z, so the basis +Z is BACKWARD along the fingers.
  _z.copy(_a).sub(_b).normalize();

  // Lateral: index knuckle -> pinky knuckle is +X, matching rig.js's convention
  // that +X is the pinky side. Falls back to any perpendicular if unavailable.
  if (indexBase && pinkyBase) {
    _x.copy(pinkyBase.getWorldPosition(_c)).sub(indexBase.getWorldPosition(_a)).normalize();
  } else {
    _x.set(1, 0, 0);
  }

  // Gram-Schmidt: drop the part of X that lies along Z, then rebuild Y.
  _x.addScaledVector(_z, -_x.dot(_z));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _y.copy(_z).cross(_x).normalize();
  _x.copy(_y).cross(_z).normalize();

  // Columns of this basis map our target axes onto the asset's current ones, so
  // the INVERSE is the correction that brings the asset into our convention.
  _basis.makeBasis(_x, _y, _z);
  _basis.invert();
  inner.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(_basis));

  /* ---- 3. translate last, so the wrist lands exactly on the origin ---- */
  root.updateMatrixWorld(true);
  wrist.getWorldPosition(_a);
  inner.position.sub(_a);
  root.updateMatrixWorld(true);

  return {
    aligned: true,
    scale,
    handLength: TARGET_HAND_LENGTH,
    residualWristOffset: wrist.getWorldPosition(_b).length(),
  };
}

/* ------------------------------------------------------------ arm trimming */

/**
 * Drops the arm geometry, keeping the hand and a short collar at the wrist.
 *
 * ONLY THE INDEX BUFFER IS REBUILT. Vertex attributes are left exactly as they
 * are, so position / skinIndex / skinWeight stay in lockstep and there is no
 * remapping to get wrong - the single nastiest way to break a skinned mesh.
 * Triangles that are dropped simply stop being referenced, and a vertex no index
 * points at is never submitted to the vertex shader, so the arm costs nothing to
 * draw. The few hundred orphaned vertices are tens of kilobytes of buffer.
 *
 * WHY VERTEX POSITIONS ARE COMPARED AGAINST BONE WORLD POSITIONS. For a skinned
 * mesh glTF ignores the containing node's transform, and at the bind pose each
 * skin matrix (boneWorld * inverseBind) comes out as the identity - so the raw
 * position attribute and the bone world positions are already in one frame.
 * Verified on this asset: measured against the wrist bone, hand vertices all sit
 * within 0.19 units and the nearest arm vertex is 35 units out.
 *
 * Runs on the ORIGINAL asset, before buildHandMesh clones it, because clones
 * share geometry - so this is one pass for both hands.
 *
 * @returns {string} a line for the mesh handle's report
 */
function trimArm(root) {
  if (!root || ARM_TRIM_RADIUS <= 0) return "arm not trimmed: disabled";

  root.updateMatrixWorld(true);
  const { joints } = mapArmature(root);
  const wrist = joints.get(JOINTS.WRIST);
  const tip = joints.get(JOINTS.MIDDLE_03) ?? joints.get(JOINTS.INDEX_03);
  if (!wrist || !tip) return "arm not trimmed: wrist or fingertip not mapped";

  wrist.getWorldPosition(_a);
  const handLength = _a.distanceTo(tip.getWorldPosition(_b));
  if (!(handLength > 1e-6)) return "arm not trimmed: hand length measured as zero";

  const radius = handLength * ARM_TRIM_RADIUS;
  const radiusSq = radius * radius;
  let kept = 0;
  let dropped = 0;
  let skipped = 0;

  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    const geometry = node.geometry;
    const position = geometry?.attributes?.position;
    const index = geometry?.index;
    if (!position || !index) return;
    // Material groups index into the index buffer, so rebuilding it would leave
    // them addressing the wrong triangles. glTF primitives arrive as separate
    // meshes, so there should be none; if a replacement asset has them, leave
    // that geometry alone rather than corrupt it.
    if (geometry.groups?.length > 0) {
      skipped++;
      return;
    }

    const near = new Uint8Array(position.count);
    for (let i = 0; i < position.count; i++) {
      _c.fromBufferAttribute(position, i);
      near[i] = _c.distanceToSquared(_a) <= radiusSq ? 1 : 0;
    }

    const src = index.array;
    const survivors = [];
    for (let i = 0; i < src.length; i += 3) {
      const a = src[i];
      const b = src[i + 1];
      const c = src[i + 2];
      if (near[a] && near[b] && near[c]) survivors.push(a, b, c);
    }

    // A replacement asset whose vertices are NOT in the bone frame would fail
    // the distance test everywhere and this would erase the hand. Losing most of
    // a mesh is never the intent, so treat it as a bad measurement and keep the
    // arm rather than delete the hand.
    const total = src.length / 3;
    if (survivors.length / 3 < total * 0.25) {
      skipped++;
      return;
    }

    kept += survivors.length / 3;
    dropped += total - survivors.length / 3;
    geometry.setIndex(survivors);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });

  return (
    `arm trimmed at ${ARM_TRIM_RADIUS}x hand length (${radius.toFixed(4)}): ` +
    `kept ${kept} tris, dropped ${dropped}` +
    (skipped ? `, left ${skipped} mesh(es) alone` : "")
  );
}

/* --------------------------------------------------------------- loading */

/**
 * Loads the hand asset ONCE. Both hands clone the result, so the geometry and
 * textures are uploaded to the GPU a single time.
 *
 * The game has a richer loader in core/Assets.js (Draco, KTX2, a cache). This
 * module deliberately uses its own plain GLTFLoader instead, because the §4
 * constructor takes only { camera, renderer, bus } and the module has to stay
 * runnable in dev/hands.html with no game around it - which is a stated design
 * goal, and the reason the harness exists at all.
 *
 * @returns {Promise<{ scene: import('three').Object3D, dispose(): void }>}
 */
export async function loadHandAsset({ url = assetUrl } = {}) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  // Before anything clones the scene: clones share geometry, so trimming here
  // is one pass that serves both hands.
  const trimReport = trimArm(gltf.scene);
  return {
    url,
    scene: gltf.scene,
    trimReport,
    /** Releases the ORIGINAL. Clones own their own skeletons but share geometry. */
    dispose() {
      this.scene?.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
          node.geometry?.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of materials) m?.dispose?.();
        }
        if (node.isSkinnedMesh) node.skeleton?.dispose();
      });
    },
  };
}

/* ----------------------------------------------------------- nail mesh */

/**
 * Names of the bones at the END of every digit, plus their descendants.
 *
 * The thumb matters here: mapArmature deliberately keeps only the FIRST TWO
 * bones of the thumb chain (a real thumb has two phalanges), so this asset's
 * thumb-nail bone - a third, unmapped one - would be missed by looking at the
 * mapped joints alone. Walking the descendants picks it up.
 */
function tipBoneNames(joints) {
  const names = new Set();
  for (const finger of FINGERS) {
    const tip = joints.get(finger.joints[finger.joints.length - 1]);
    if (!tip) continue;
    tip.traverse((n) => {
      if (n.isBone) names.add(n.name);
    });
  }
  return names;
}

/**
 * Is this mesh the fingernails?
 *
 * Decided from the SKINNING, not from a vertex count or a material name. A nail
 * can only be attached to the last bone of a digit, so a primitive whose every
 * vertex is dominated by a tip bone is nails, and one that also covers the palm
 * and wrist is not. That holds regardless of how the asset was named or how many
 * vertices the artist spent, and it needs no CPU skinning to evaluate.
 *
 * The asset in this project splits nails out as their own primitive of 84
 * vertices; if a replacement model welds them into the skin mesh instead, this
 * returns false and everything simply gets the skin material, as before.
 */
function isNailMesh(node, tipBones) {
  if (!node.isSkinnedMesh || tipBones.size === 0) return false;
  const geometry = node.geometry;
  const si = geometry?.attributes?.skinIndex;
  const sw = geometry?.attributes?.skinWeight;
  const bones = node.skeleton?.bones;
  if (!si || !sw || !bones) return false;

  // A whole hand is thousands of vertices; nails are tens. Anything large is
  // the skin mesh, and this guard keeps a single-primitive asset from ever
  // being mistaken for nails.
  if (si.count > 400) return false;

  let onTip = 0;
  for (let i = 0; i < si.count; i++) {
    let topWeight = -1;
    let topBone = null;
    for (let c = 0; c < 4; c++) {
      const weight = sw.getComponent(i, c);
      const bone = bones[si.getComponent(i, c)];
      if (bone && weight > topWeight) {
        topWeight = weight;
        topBone = bone;
      }
    }
    if (topBone && tipBones.has(topBone.name)) onTip++;
  }
  return onTip / si.count >= 0.9;
}

/* ----------------------------------------------------------- the build */

/**
 * Clones the loaded asset for one hand and maps its armature to the §5 names.
 *
 * THIS SIGNATURE IS THE UPGRADE SEAM. It now RETURNS the joint map rather than
 * receiving one, because with a skinned model the skeleton arrives with the mesh
 * - which is what the brief described in the first place ("a single function
 * that returns a node tree with exactly the joint names listed in §5").
 *
 * @param {object} params
 * @param {{ scene: import('three').Object3D }} params.asset from loadHandAsset()
 * @param {'left'|'right'} params.side
 * @param {import('three').Material|null} params.material overrides the asset's own
 * @returns {{
 *   root: import('three').Object3D,
 *   joints: Map<string, import('three').Object3D>,
 *   segments: import('three').Mesh[],
 *   triangles: number,
 *   drawCalls: number,
 *   report: string[],
 *   dispose(): void
 * }}
 */
export function buildHandMesh({ asset, side, material, nailMaterial } = {}) {
  const handle = {
    root: null,
    joints: new Map(),
    segments: [],
    triangles: 0,
    drawCalls: 0,
    report: [],
    dispose() {
      // Geometry is SHARED with the original asset, so it is not disposed here -
      // loadHandAsset() owns it. The skeleton, however, is per-clone: three
      // 0.185.1's SkinnedMesh has no dispose(), and the DataTexture behind
      // Skeleton.boneTexture leaks silently unless Skeleton.dispose() is called.
      // core/Disposer.js documents the same trap.
      for (const mesh of this.segments) {
        if (mesh.isSkinnedMesh) mesh.skeleton?.dispose();
      }
      this.root?.removeFromParent();
      this.segments.length = 0;
      this.joints.clear();
      this.triangles = 0;
      this.drawCalls = 0;
      this.root = null;
    },
  };

  if (!asset?.scene) return handle;

  // SkeletonUtils.clone, not Object3D.clone: the latter copies the meshes but
  // leaves them pointing at the ORIGINAL skeleton, so both hands would deform
  // together from one set of bones.
  const root = cloneSkinned(asset.scene);
  root.name = side ? `hand.${side}` : "hand";

  const { joints, report } = mapArmature(root);
  handle.root = root;
  handle.joints = joints;
  handle.report = report;
  if (asset.trimReport) report.push(asset.trimReport);

  // Done while root is still unparented, so world space IS root-local space.
  const alignment = alignHand(root, joints);
  handle.alignment = alignment;
  report.push(
    alignment.aligned
      ? `aligned: scale x${alignment.scale.toFixed(4)}, wrist at origin ` +
        `(residual ${alignment.residualWristOffset.toExponential(1)} m)`
      : `NOT aligned: ${alignment.reason}`,
  );

  const tipBones = tipBoneNames(joints);

  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;

    const isNails = isNailMesh(node, tipBones);
    if (isNails) handle.report.push(`nails <- ${node.name} (${node.geometry.attributes.position.count} verts)`);
    if (isNails && nailMaterial) node.material = nailMaterial;
    else if (material) node.material = material;

    // View-model geometry parented to the camera can be wrongly culled against
    // that same camera's frustum - hands blinking out at certain angles is the
    // classic symptom. They are always on screen by construction.
    node.frustumCulled = false;
    // Neither cast nor receive: the torch is held in the hand, so its shadows
    // fall away from the viewer, and a room-scale shadow map resolves to less
    // than a pixel per knuckle, which is acne rather than shadow.
    node.castShadow = false;
    node.receiveShadow = false;

    handle.segments.push(node);
    const geometry = node.geometry;
    if (geometry) {
      handle.triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    }
  });

  handle.drawCalls = handle.segments.length;
  return handle;
}
