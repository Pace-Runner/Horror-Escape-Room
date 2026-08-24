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
  return {
    url,
    scene: gltf.scene,
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
export function buildHandMesh({ asset, side, material } = {}) {
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

  // Done while root is still unparented, so world space IS root-local space.
  const alignment = alignHand(root, joints);
  handle.alignment = alignment;
  report.push(
    alignment.aligned
      ? `aligned: scale x${alignment.scale.toFixed(4)}, wrist at origin ` +
        `(residual ${alignment.residualWristOffset.toExponential(1)} m)`
      : `NOT aligned: ${alignment.reason}`,
  );

  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;

    if (material) node.material = material;

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
