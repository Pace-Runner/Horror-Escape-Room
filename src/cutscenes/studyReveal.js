import * as THREE from 'three';

export const MIRROR_EYE = [4.8, 1.6, -5.28];
export const RECOIL_EYE = [4.74, 1.6, -5.10];
export const CHAIR_EYE = [-4.8, 1.6, -4.5];
export const REVEAL_SEGMENTS = Object.freeze([
  ['process', 1.0], ['walk', 8.8], ['settle', 1.1], ['human', 2.1],
  ['mirrorVisor', 0.9], ['hollow', 3.0], ['recoil', 1.8], ['turn', 2.5],
  ['cornerWalk', 4.5], ['chairSettle', 1.0], ['creature', 1.9], ['chairVisor', 0.9], ['annabelle', 3.0]
]);
const seconds = Object.fromEntries(REVEAL_SEGMENTS);
export const REVEAL_TIMES = {};
let duration = 0;
for (const [name, seconds] of REVEAL_SEGMENTS) { REVEAL_TIMES[name] = duration; duration += seconds; }
export const REVEAL_DURATION = duration;
const mirrorTarget = new THREE.Vector3(4.8, 1.45, -6.372);
const smooth = u => THREE.MathUtils.smoothstep(u, 0, 1);
const clamp = u => THREE.MathUtils.clamp(u, 0, 1);
function easedDistance(u, edge = 0.14) {
  u = clamp(u);
  if (u < edge) { const v = u / edge; return edge * (2 * v * v - v * v * v); }
  if (u > 1 - edge) return 1 - easedDistance(1 - u, edge);
  return u;
}
function look(position, target) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)));
}
function arc(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  curve.arcLengthDivisions = 800; curve.updateArcLengths();
  return curve;
}
function floorOnStair(z) {
  return 3.1 * (1 - easedDistance(clamp((z + 1.88) / 4.48), 0.04));
}

/** Authored safe route, smoothed in X/Z; eye height follows the existing stair flight. */
export function studyMirrorRoute(start) {
  const points = [start];
  const upstairs = start[1] > 4;
  const onStair = start[0] >= 6.85 && start[2] >= -1.88 && start[2] <= 2.60 && start[1] > 1.9;
  if (upstairs) points.push([start[0], 4.7, -4.05], [5.8, 4.7, -3.05],
    [6.8, 4.7, -2.60], [7.25, 4.7, -2.40], [7.25, 4.7, -1.88]);
  if (upstairs || onStair) points.push([7.25, 1.6, 2.60], [7.25, 1.6, 3.30],
    [6.50, 1.6, 3.50], [5.50, 1.6, 3.15], [4.90, 1.6, 1.60]);
  else if (start[2] > -0.4) points.push([Math.min(5.7, Math.max(3.2, start[0])), 1.6, Math.max(3.15, start[2])]);
  points.push([4.8, 1.6, -3.95], MIRROR_EYE);
  const curve = arc(points);
  const at = u => {
    const p = curve.getPointAt(clamp(u));
    if (upstairs || onStair) {
      const stair = p.x > 6.85 && p.z >= -1.88 && p.z <= 2.60;
      const upper = p.z < -1.88 && (upstairs && u < 0.55);
      p.y = 1.6 + (stair ? floorOnStair(p.z) : upper ? 3.1 : 0);
    } else p.y = 1.6;
    if (u < 0.08) p.y = THREE.MathUtils.lerp(start[1], p.y, smooth(u / 0.08));
    return p;
  };
  return u => at(u).toArray();
}

/** Continuous first-person path and quaternion choreography; no per-shot lookAt snaps. */
export function createStudyChoreography(start, startQuaternion, annabelleSpot, startFov = 70) {
  const route = studyMirrorRoute(start);
  const initial = new THREE.Quaternion().fromArray(startQuaternion);
  const chairTarget = new THREE.Vector3(annabelleSpot[0], 0.77, annabelleSpot[1]);
  const cornerStart = new THREE.Vector3(4.64, 1.6, -5.04);
  const cornerStop = new THREE.Vector3(-4.10, 1.6, -4.25);
  const cornerCurve = arc([cornerStart.toArray(), [1.6, 1.6, -4.55], [-1.8, 1.6, -4.25], cornerStop.toArray()]);
  // Integrate orientation once, then slerp adjacent quaternions. Interpolating
  // afresh from the initial heading can flip its shortest arc at a 180° turn.
  const orientations = [initial.clone()], samples = 1584, step = seconds.walk / samples;
  for (let i = 1; i <= samples; i++) {
    const u = i / samples, d = easedDistance(u);
    const p = new THREE.Vector3(...route(d));
    const ahead = new THREE.Vector3(...route(Math.min(1, d + 0.04)));
    const behind = new THREE.Vector3(...route(Math.max(0, d - 0.02)));
    const heading = ahead.sub(behind); heading.y = heading.y * 0.82 - 0.025; heading.normalize();
    const target = look(p, p.clone().add(heading));
    target.slerp(look(p, mirrorTarget), smooth((u - 0.76) / 0.24));
    const q = orientations.at(-1).clone();
    const maxStep = 1.8 * step * smooth(u / 0.07);
    q.rotateTowards(target, Math.min(maxStep, q.angleTo(target) * (1 - Math.exp(-step / 0.13))));
    orientations.push(q);
  }
  const walk = u => {
    const distance = easedDistance(u), p = new THREE.Vector3(...route(distance));
    const ahead = new THREE.Vector3(...route(Math.min(1, distance + 0.04)));
    const behind = new THREE.Vector3(...route(Math.max(0, distance - 0.02)));
    const heading = ahead.clone().sub(behind); heading.y = heading.y * 0.82 - 0.025; heading.normalize();
    const index = clamp(u) * samples, lower = Math.floor(index);
    const q = orientations[lower].clone().slerp(orientations[Math.min(samples, lower + 1)], index - lower);
    q.slerp(look(p, mirrorTarget), smooth((u - 0.84) / 0.16));
    const gain = Math.sin(Math.PI * u) ** 2;
    const phase = distance * 24 * Math.PI;
    const side = new THREE.Vector3(heading.z, 0, -heading.x);
    p.addScaledVector(side, Math.sin(phase * 0.5) * 0.004 * gain);
    p.y += Math.sin(phase) * 0.006 * gain;
    return { p, q };
  };
  return function sample(t) {
    t = THREE.MathUtils.clamp(t, 0, REVEAL_DURATION);
    let p = new THREE.Vector3(...start), q = initial.clone();
    const fov = t < REVEAL_TIMES.walk ? startFov : t < REVEAL_TIMES.settle
      ? THREE.MathUtils.lerp(startFov, 60, smooth((t - REVEAL_TIMES.walk) / seconds.walk)) : 60;
    if (t >= REVEAL_TIMES.walk && t < REVEAL_TIMES.settle) {
      ({ p, q } = walk((t - REVEAL_TIMES.walk) / seconds.walk));
    } else if (t >= REVEAL_TIMES.settle && t < REVEAL_TIMES.recoil) {
      p.fromArray(MIRROR_EYE);
      p.y += Math.sin((t - REVEAL_TIMES.settle) * 1.8) * 0.0015;
      q = look(p, mirrorTarget);
    } else if (t >= REVEAL_TIMES.recoil && t < REVEAL_TIMES.turn) {
      const u = clamp((t - REVEAL_TIMES.recoil) / seconds.recoil), e = smooth(u);
      p.fromArray(MIRROR_EYE).lerp(new THREE.Vector3(...RECOIL_EYE), e);
      p.y -= Math.sin(Math.PI * u) * 0.015;
      const target = mirrorTarget.clone(); target.y -= Math.sin(Math.PI * u) * 0.21;
      q = look(p, target);
    } else if (t >= REVEAL_TIMES.turn && t < REVEAL_TIMES.cornerWalk) {
      const u = smooth((t - REVEAL_TIMES.turn) / seconds.turn);
      p.fromArray(RECOIL_EYE).lerp(cornerStart, u);
      q.slerpQuaternions(look(new THREE.Vector3(...RECOIL_EYE), mirrorTarget), look(cornerStart, chairTarget), u);
    } else if (t >= REVEAL_TIMES.cornerWalk && t < REVEAL_TIMES.chairSettle) {
      const u = clamp((t - REVEAL_TIMES.cornerWalk) / seconds.cornerWalk);
      p = cornerCurve.getPointAt(easedDistance(u));
      p.y += Math.sin(u * Math.PI * 13) * 0.005 * Math.sin(Math.PI * u) ** 2;
      q = look(p, chairTarget);
    } else if (t >= REVEAL_TIMES.chairSettle && t < REVEAL_TIMES.creature) {
      p.copy(cornerStop); q = look(p,chairTarget);
    } else if (t >= REVEAL_TIMES.creature) {
      const u = smooth(clamp((t - REVEAL_TIMES.creature) / seconds.creature));
      p.copy(cornerStop).lerp(new THREE.Vector3(...CHAIR_EYE), u);
      q = look(p, chairTarget);
    }
    return { position: p.toArray(), quaternion: q.toArray(), fov };
  };
}

/** Adult-sized, uniformly scaled withdrawn pose; never shrink-to-fit the chair. */
export function poseStudyCreature(creature, spot) {
  creature.setPosition(spot[0], spot[1]); creature.setCorrection(0); creature.setSpeed(0);
  creature.refs.root.scale.setScalar(0.90);
  updateStudyCreature(creature,0);
  creature.group.updateMatrixWorld(true);
  creature.group.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.computeBoundingBox();});
  const box=new THREE.Box3().setFromObject(creature.group);
  if(!box.isEmpty())creature.refs.root.position.y-=box.min.y;
}
export function updateStudyCreature(creature,dt) {
  if(creature.correction!==0)creature.setCorrection(0);
  creature.update(Math.max(0,dt)*0.65);
  const t=creature.studyPresenceTime=(creature.studyPresenceTime||0)+Math.max(0,dt);
  creature.offsetBones({Spine:[0.20+Math.sin(t*1.35)*0.006,0,0],
    Chest:[0.13+Math.sin(t*1.35)*0.009,0,0.065+Math.sin(t*.8)*.006],
    Head:[-0.10+Math.sin(t*.65)*.008,Math.sin(t*.55)*.010,Math.sin(t*4.1)*.003]});
}

export function buildStudyReveal({ start, startQuaternion = [0,0,0,1], annabelleSpot, camera, player, visor, captions, refs,
  creature, prepareCreature, restoreCreature, onFinish }) {
  const sample = createStudyChoreography(start, startQuaternion, annabelleSpot, camera.fov);
  const cues = [], cue = (t, run) => cues.push({ t, run });
  const say = (speaker, text, seconds) => captions.say({ text: `${speaker}: ${text}`, duration: seconds, always: true });
  cue(0, () => {
    document.body.classList.add('study-reveal'); captions.cancel();
    prepareCreature(); visor.set(false); refs.setRevealAnnabelle(false);
    // Reflect whenever the glass enters view, including the approach, without a
    // last-frame switch from opaque glass to a populated mirror.
    refs.setMirrorRevealSight(false); refs.setMirrorRevealActive(true);
  });
  cue(REVEAL_TIMES.settle, () => refs.setMirrorRevealActive(true));
  cue(REVEAL_TIMES.mirrorVisor, () => visor.set(true));
  cue(REVEAL_TIMES.mirrorVisor + seconds.mirrorVisor * 0.5, () => refs.setMirrorRevealSight(true));
  cue(REVEAL_TIMES.recoil + 0.12, () => say('MARK', 'No...', 1.25));
  cue(REVEAL_TIMES.turn + 0.15, () => say('MARK', 'What did I do?', 2.1));
  cue(REVEAL_TIMES.turn, () => {
    visor.set(false); creature.setCorrection(0); creature.visible = true;
  });
  cue(REVEAL_TIMES.cornerWalk, () => refs.setMirrorRevealActive(false));
  cue(REVEAL_TIMES.chairVisor, () => visor.set(true));
  cue(REVEAL_TIMES.chairVisor + seconds.chairVisor * 0.5, () => {
    creature.visible = false; refs.setRevealAnnabelle(true);
  });
  cue(REVEAL_TIMES.annabelle + 0.1, () => say('ANNABELLE', 'Mark... please.', 2.0));
  return {
    name: 'studyMirrorReveal', letterbox: false, skippable: false,
    shots: [{ pose: u => sample(u * REVEAL_DURATION), seconds: REVEAL_DURATION }], cues,
    onFrame(_ctx, t, dt) {
      const pose = sample(t);
      camera.position.fromArray(pose.position); camera.quaternion.fromArray(pose.quaternion);
      const upper = t >= REVEAL_TIMES.walk && t < REVEAL_TIMES.settle;
      player.groundY = upper ? Math.max(0, camera.position.y - 1.6) : t < REVEAL_TIMES.walk ? Math.max(0,start[1]-1.6) : 0;
      // The visor changes apparent identity, not the staged creature's proportions.
      if (creature.visible || (t >= REVEAL_TIMES.settle && t < REVEAL_TIMES.turn)) {
        updateStudyCreature(creature,dt);
      }
    },
    onEnd(_ctx, completed) {
      document.body.classList.remove('study-reveal');
      refs.setMirrorRevealActive(false); restoreCreature();
      player.clearKeys(); player.crouch = 0; player.sprint = 0;
      if (completed) {
        visor.set(true); refs.setRevealAnnabelle(true); refs.showRevealKeycard();
        player.groundY = 0; camera.position.fromArray(CHAIR_EYE);
      } else refs.setRevealAnnabelle(false);
      captions.cancel(); onFinish(completed);
    }
  };
}
