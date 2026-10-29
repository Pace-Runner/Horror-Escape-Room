/** Level 3 hide-and-seek regression: node scripts/check-study-seeker.mjs.
 * Builds the real study in Node (stub canvas, no models, as check-study-reveal
 * does), then drives systems/StudySeeker.js against its real colliders, floors
 * and hide props with a stand-in figure and player. Also checks the blackout
 * keeps the light count fixed and the study's catch scares stay in their pool.
 * No browser, audio or GPU: how it LOOKS is for the browser probe.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const rootDir = path.resolve(import.meta.dirname, '..');
const bundlePath = path.join(rootDir, `.study-seeker-check-${process.pid}.mjs`);
const classes = () => ({ add() {}, remove() {}, contains: () => false, toggle() {} });
const gradient = { addColorStop() {} };
const context = new Proxy({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  measureText: (s) => ({ width: String(s).length * 8 }),
  createLinearGradient: () => gradient, createRadialGradient: () => gradient
}, { get: (o, k) => (k in o ? o[k] : () => {}) });
globalThis.document = { body: { classList: classes(), appendChild() {} },
  createElement: () => ({ width: 512, height: 512, classList: classes(), getContext: () => context }) };
THREE.TextureLoader.prototype.load = () => new THREE.Texture({ width: 512, height: 512 });
// Models never arrive: the check is about layout and behaviour, not meshes.
globalThis.__studyTestModel = () => new Promise(() => {});
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
const quiet = console.warn;

/** A stand-in for systems/OkabeCreature.js: the parts the seeker and the scares touch. */
function standInFigure() {
  const group = new THREE.Group();
  const root = new THREE.Object3D();
  group.add(root);
  let speed = 0;
  return {
    group, refs: { root, head: null },
    get position() { return root.position; },
    setPosition(x, z) { root.position.set(x, 0, z); },
    setYaw(y) { root.rotation.y = y; },
    get yaw() { return root.rotation.y; },
    setSpeed(v) { speed = v; }, get speed() { return speed; },
    update() {}, reset() {}, setCorrection() {}, setSilhouette() {}, setTwitches() {},
    offsetBones() {}, isSilhouette: false, visible: false
  };
}

try {
  const bundle = await build({
    stdin: { contents: [
      "export {createStudyLevel} from './src/levels/studyLevel.js';",
      "export * from './src/systems/StudySeeker.js';",
      "export {createJumpScare} from './src/core/JumpScare.js';",
      "export {JUMP_SCARES, STUDY_CATCH_SCARES} from './src/core/jumpScares/index.js';",
      "export {SPRINT_SPEED} from './src/core/MoveSpeeds.js';",
      "export {resolveCircle} from './src/core/collision.js';"
    ].join(''), resolveDir: rootDir },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
    define: { 'import.meta.env.DEV': 'true' },
    plugins: [{ name: 'study-test', setup(b) {
      b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'asset' }));
      b.onLoad({ filter: /.*/, namespace: 'asset' }, (a) => ({ contents: `export default ${JSON.stringify(a.path)}` }));
      b.onLoad({ filter: /modelLoader\.js$/ }, () => ({ contents: 'export const loadModel=url=>globalThis.__studyTestModel(url);' }));
      b.onLoad({ filter: /dialogue.index\.js$/ }, () => ({ contents: 'export const line=k=>k;' }));
    } }]
  });
  fs.writeFileSync(bundlePath, bundle.outputFiles[0].text);
  console.warn = () => {};
  const m = await import(pathToFileURL(bundlePath));
  const study = m.createStudyLevel({});
  console.warn = quiet;
  const { groundAt, colliders, loftY } = study;
  const { blackout, hideProps } = study.refs;

  // ---- the light count is fixed at build time
  const countLights = () => { let n = 0; study.group.traverse((o) => { if (o.isLight) n++; }); return n; };
  const lightsBefore = countLights();
  blackout.setOut(true, { kind: 'hunt' });
  for (let i = 0; i < 30; i++) blackout.update(1 / 30);
  blackout.strike();
  blackout.update(0.05);
  assert.equal(countLights(), lightsBefore, 'a blackout must never add or remove a light');
  assert.ok(blackout.power < 0.05, 'the room lights die');
  assert.equal(blackout.survivors.length, 1, 'one candle survives the storm');
  assert.equal(blackout.breakerState, 'blown', 'the hunt blows the fuse');
  blackout.reset();
  assert.equal(blackout.breakerState, 'on');
  assert.ok(Math.abs(blackout.power - 1) < 1e-6, 'reset brings the power straight back');
  // The first blackout blows it too: each has its own spare (desk tin, then mantel).
  blackout.setOut(true, { kind: 'teaser' });
  assert.equal(blackout.breakerState, 'blown', 'the first blackout blows the fuse');
  blackout.reset();

  // ---- a seeker over the real room
  const figure = standInFigure();
  let player = null;
  const caught = [];
  let difficulty = 'medium';
  const seeker = m.createStudySeeker({
    creature: figure, getPlayer: () => player, colliders,
    sightOnly: hideProps.cover.filter((box) => box.name.startsWith('curtain')),
    hideSpots: hideProps.hideSpots, groundAt, loftY,
    isLit: () => false, difficulty: () => difficulty,
    onCaught: (context) => caught.push(context), random: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })()
  });
  const still = (x, z, extra = {}) => ({ x, z, groundY: groundAt(x, z, extra.groundY ?? 0), eyeY: 1.6, crouching: false, sprinting: false,
    walking: false, torchOn: false, lookX: 0, lookZ: -1, hiddenIn: null, ...extra });
  const run = (seconds, each = null) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      each?.(t);
      seeker.update(1 / 30);
      if (seeker.state === 'caught') return;
    }
  };

  // Every flat edge of the graph is walkable a body's width either side.
  for (const [a, b] of m.STUDY_NAV.edges) {
    const na = seeker.nodes.get(a), nb = seeker.nodes.get(b);
    if (na.f === 's' || nb.f === 's') continue;
    assert.ok(seeker.walkClear(na.x, na.z, nb.x, nb.z, na.y), `nav edge ${a} -> ${b} is blocked`);
  }
  // Every hide spot can be walked up to, and the respawn is clear floor.
  const blocked = (x, z, y) => { const p = { x, z }; return m.resolveCircle(p, 0.35, colliders.filter((box) =>
    (box.minY === undefined || y + 1.6 > box.minY) && (box.maxY === undefined || y < box.maxY))); };
  for (const spot of hideProps.hideSpots) assert.ok(!blocked(...spot.checkPoint, spot.floorY), `${spot.id}'s check point is inside furniture`);
  assert.ok(!blocked(m.STUDY_CATCH_RESPAWN.x, m.STUDY_CATCH_RESPAWN.z, 0), 'the come-round spot is inside furniture');
  assert.equal(groundAt(m.STUDY_CATCH_RESPAWN.x, m.STUDY_CATCH_RESPAWN.z, 0), 0, 'Mark comes round on the ground floor');

  // The hunt: from her corner, up the stair, to the archive -- with nobody to find.
  player = still(-6.8, 5.6, { crouching: true });
  seeker.start({ mode: 'hunt', at: 'g_hearth', investigate: { x: -5.4, z: -5.6, y: loftY } });
  let reached = false;
  run(60, () => {
    const p = seeker.position;
    if (Math.abs(p.y - loftY) < 0.05 && Math.hypot(p.x + 5.4, p.z + 5.6) < 1.5) reached = true;
  });
  assert.ok(reached, `she never climbed to the archive (ended at ${JSON.stringify(seeker.position)} in ${seeker.state})`);

  // From beside the stair (not its foot) she goes round to the foot and up,
  // rather than into the stair's side.
  for (const from of ['g_right', 'g_backR', 'g_screenE']) {
    player = still(-6.8, 5.6, { crouching: true });
    seeker.start({ mode: 'hunt', at: from, investigate: { x: 4.6, z: -3.4, y: loftY } });
    let up = false;
    run(30, () => { if (Math.abs(seeker.position.y - loftY) < 0.05) up = true; });
    assert.ok(up, `from ${from} she never got up the stair (ended at ${JSON.stringify(seeker.position)})`);
  }

  // A thrown book: she goes to where it lands.
  seeker.start({ mode: 'hunt', at: 'g_center' });
  player = still(-6.8, 5.6, { crouching: true });
  const landing = { x: 2.6, y: 0, z: 4.0 };
  assert.ok(seeker.noise({ ...landing, radius: 6.5 }), 'a book landing 5 m away is heard');
  assert.equal(seeker.state, 'investigate');
  let toBook = Infinity;
  run(12, () => { toBook = Math.min(toBook, Math.hypot(seeker.position.x - landing.x, seeker.position.z - landing.z)); });
  assert.ok(toBook < 0.6, `she should go to the book, got within ${toBook.toFixed(2)} m`);

  // She never walks backwards: every step goes the way the body faces.
  {
    seeker.start({ mode: 'hunt', at: 'g_center' });
    player = still(-6.8, 5.6, { crouching: true });
    figure.setYaw(Math.PI);   // facing +Z, then sent the other way
    seeker.noise({ x: 0.4, y: 0, z: -4.4, radius: 9 });
    let last = { ...seeker.position }, worst = 0;
    run(6, () => {
      const p = seeker.position, dx = p.x - last.x, dz = p.z - last.z;
      const along = -Math.sin(figure.yaw) * dx - Math.cos(figure.yaw) * dz;
      if (Math.hypot(dx, dz) > 1e-4) worst = Math.min(worst, along / Math.hypot(dx, dz));
      last = { ...p };
    });
    assert.ok(worst > -0.05, `she moved backwards (cosine ${worst.toFixed(2)})`);
  }

  // Him first: a lure never pulls her off a player she can see.
  {
    seeker.start({ mode: 'hunt', at: 'g_midR' });
    run(0.1);
    figure.setYaw(0);
    const p = seeker.position;
    player = still(p.x, p.z - 2);   // 2 m in front of her
    assert.equal(seeker.noise({ x: -6, y: 0, z: 5, radius: 20 }), false, 'a lure pulled her off a player in plain sight');
    seeker.update(1 / 30);
    assert.equal(seeker.state, 'chase', 'she should chase the player she can see');
  }

  // His footsteps outrank a lure: throw, walk on, and she is back on him.
  {
    seeker.start({ mode: 'hunt', at: 'g_midR' });
    player = still(-6.8, 5.6, { crouching: true });
    assert.ok(seeker.noise({ x: 2.6, y: 0, z: 4.0, radius: 9 }), 'the lure is heard');
    run(0.3);
    const p = seeker.position;
    figure.setYaw(0);
    player = still(p.x, p.z + 2, { walking: true });   // behind her, walking
    assert.equal(seeker.noise({ x: 2.6, y: 0, z: 4.0, radius: 9 }), false, 'a lure outranked his footsteps');
    seeker.update(1 / 30);
    assert.equal(seeker.state, 'chase', 'hearing him walk after a lure should be a chase');
  }
  player = still(-6.8, 5.6, { crouching: true });

  // Crouch-walking is silent; walking close by is heard. Behind her, out of sight.
  const behind = (crouching, walking) => {
    seeker.start({ mode: 'hunt', at: 'g_midR' });
    figure.setYaw(0);
    run(0.1);
    const p = seeker.position;
    // 2 m behind her (+Z of a figure looking down -Z), in the open.
    player = still(p.x, p.z + 2, { crouching, walking });
    seeker.update(1 / 30);
    return seeker.state;
  };
  assert.notEqual(behind(true, true), 'investigate', 'crouch-walking was heard');
  assert.equal(behind(false, true), 'investigate', 'walking 2 m behind her should be heard');

  // Low cover: the Chesterfield hides a crouch, not a standing man.
  const sightAcross = (crouching) => {
    seeker.start({ mode: 'hunt', at: [-3.0, 2.2] });
    figure.setYaw(Math.PI);
    player = still(-3.0, 4.6, { crouching, eyeY: crouching ? 1.05 : 1.6 });
    seeker.update(1 / 60);
    return seeker.state;
  };
  assert.equal(sightAcross(false), 'chase', 'standing behind the Chesterfield should be seen');
  assert.notEqual(sightAcross(true), 'chase', 'crouched behind the Chesterfield should be hidden');

  // Out of sight, her chase never beats a sprint, on any difficulty or in the teaser.
  for (const key of Object.keys(m.STUDY_SEEKER_TUNING)) {
    const pace = Math.min(m.SPEED.chase * m.STUDY_SEEKER_TUNING[key].speed, m.SPEED.chaseCap);
    assert.ok(pace < m.SPRINT_SPEED, `${key}: her chase ${pace} is not slower than a sprint ${m.SPRINT_SPEED}`);
  }
  // In sight, and running to a lure, she is 15% faster than his sprint.
  assert.ok(Math.abs(m.SPEED.alerted - m.SPRINT_SPEED * 1.15) < 1e-9, 'alerted should be 1.15 x the sprint');

  // Reached in the open: caught. In a curtain she opens: caught, by the spot.
  caught.length = 0;
  seeker.start({ mode: 'hunt', at: [1.5, 3.0] });
  figure.setYaw(Math.PI);
  player = still(1.5, 3.6);
  run(2);
  assert.equal(caught.length, 1, 'reaching him in the open is a catch');
  assert.equal(caught[0].how, 'reached');
  const curtain = hideProps.hideSpots.find((spot) => spot.kind === 'curtain');
  assert.ok(curtain.contains(-7.45, (curtain.checkPoint[1]), 0), 'standing at the wall behind a curtain is inside it');
  caught.length = 0;
  // A seeker whose every roll opens the spot: the search, not the dice, is under test.
  const opener = m.createStudySeeker({
    creature: figure, getPlayer: () => player, colliders,
    sightOnly: hideProps.cover.filter((box) => box.name.startsWith('curtain')),
    hideSpots: hideProps.hideSpots, groundAt, loftY, isLit: () => false, difficulty: () => 'hard',
    onCaught: (context) => caught.push(context), random: () => 0
  });
  player = still(-7.45, curtain.checkPoint[1], { crouching: true });
  opener.start({ mode: 'hunt', at: 'g_winM' });
  // A sound at the curtain: she searches round it and opens it.
  opener.noise({ x: curtain.checkPoint[0], y: 0, z: curtain.checkPoint[1], radius: 9 });
  for (let t = 0; t < 30 && opener.state !== 'caught'; t += 1 / 30) opener.update(1 / 30);
  assert.ok(caught.length === 1 && caught[0].how === 'found' && caught[0].spot === curtain,
    `searching beside the curtain should find him (caught: ${JSON.stringify(caught.map((c) => c.how))})`);

  // ---- the catch scares: the study's three, never twice running; never in the backrooms
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
  const stub = new Proxy({}, { get: () => () => null });
  const jumpScare = m.createJumpScare({ camera, fade: { snapToBlack() {}, clear() {} }, postFX: stub, audio: stub });
  const studyPicks = [];
  for (let i = 0; i < 40; i++) {
    await jumpScare.run({ creature: standInFigure(), kind: 'random', pool: 'study', isAlive: () => false });
    studyPicks.push(jumpScare.lastKind);
  }
  assert.deepEqual([...new Set(studyPicks)].sort(), [...m.STUDY_CATCH_SCARES].sort(), 'the study draws all three of its scares, and only those');
  for (let i = 1; i < studyPicks.length; i++) assert.notEqual(studyPicks[i], studyPicks[i - 1], 'never the same scare twice running');
  for (let i = 0; i < 40; i++) {
    await jumpScare.run({ creature: standInFigure(), kind: 'random', ceiling: 2.35, isAlive: () => false });
    assert.ok(!m.STUDY_CATCH_SCARES.includes(jumpScare.lastKind), `the backrooms drew the study's ${jumpScare.lastKind}`);
  }

  console.log(`PASS: ${lightsBefore} lights through a blackout; ${m.STUDY_NAV.edges.length} nav edges; stair climb to the archive; `
    + 'book lure; never backwards; sight and footsteps outrank a lure; crouch silence; Chesterfield low cover; chase < sprint on every difficulty; open and curtain catches; '
    + `study scare pool (${[...new Set(studyPicks)].join(', ')}).`);
  console.log('Headless behaviour only: lighting, models, scares and the wardrobe view were not rendered.');
} finally {
  console.warn = quiet;
  fs.rmSync(bundlePath, { force: true });
}
