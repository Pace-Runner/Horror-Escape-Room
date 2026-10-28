import * as THREE from 'three';

/**
 * The study hide-and-seek's three carried things -- a hardback book and a
 * glass bottle to throw, and the spare fuse for the loft breaker -- built from
 * primitives, once, for both the room and the hand.
 *
 * FALLBACKS now: the study hands world/itemMeshes.js the real models once
 * they load (blender/study/build_books.py, import_bottle.py, and Level 2's
 * fuse.glb -- docs/LEVEL3_HIDE_AND_SEEK.md), and these primitives stand in
 * until then, and in the Node checks, where no model ever arrives. Each comes
 * back in itemMeshes.js's CANONICAL FRAME: true size, long axis up +Y, origin
 * where a fist closes round it -- the same frame as the models.
 *
 * Materials are made once per kind and shared by every copy, as itemMeshes
 * expects of its clones: nothing here is ever disposed.
 */

const BOOK_COVERS = [0x5a1f1b, 0x23384f, 0x2f4a2a, 0x4a3420];
let bookMaterials = null;
let glassMaterials = null;
let fuseMaterials = null;

/**
 * A hardback: board covers, a paler page block set in from them, and a
 * rounded spine. `cover` picks one of four cloth colours.
 * Held by the spine's foot, standing up the way a book comes off a shelf.
 */
export function buildStudyBook(cover = 0) {
  bookMaterials ??= {
    covers: BOOK_COVERS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 })),
    pages: new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.95, metalness: 0 })
  };
  const coverMat = bookMaterials.covers[((cover % BOOK_COVERS.length) + BOOK_COVERS.length) % BOOK_COVERS.length];
  const w = 0.16, h = 0.235, d = 0.045, board = 0.004;
  const book = new THREE.Group();
  book.name = 'StudyBook';
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.BoxGeometry(board, h, w), coverMat);
    face.position.set(side * (d / 2 - board / 2), h / 2, 0);
    book.add(face);
  }
  // Set 3 mm in from the boards on the three open edges, so no face is shared.
  const pages = new THREE.Mesh(new THREE.BoxGeometry(d - board * 2 - 0.002, h - 0.006, w - 0.006), bookMaterials.pages);
  pages.position.set(0, h / 2, 0.003);
  book.add(pages);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, h, 10, 1, false, Math.PI, Math.PI), coverMat);
  spine.position.set(0, h / 2, -w / 2);
  spine.scale.set(1, 1, 0.35);
  book.add(spine);
  return book;
}

/**
 * A squat green glass bottle with a cork, the kind left on a study shelf.
 * Held round its neck. Opaque-ish on purpose: a transparent DoubleSide prop
 * would need its own sorting care, and this one only has to read as glass.
 */
export function buildStudyGlass() {
  glassMaterials ??= {
    glass: new THREE.MeshStandardMaterial({ color: 0x2e5a3a, roughness: 0.12, metalness: 0.1, emissive: 0x050c07 }),
    cork: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9, metalness: 0 })
  };
  const bottle = new THREE.Group();
  bottle.name = 'StudyGlass';
  const profile = [
    [0.0, 0.0], [0.038, 0.0], [0.042, 0.01], [0.042, 0.12], [0.034, 0.15],
    [0.014, 0.175], [0.012, 0.22], [0.0, 0.22]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 14), glassMaterials.glass);
  // Origin at the neck, where the hand is.
  body.position.y = -0.17;
  bottle.add(body);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.01, 0.025, 8), glassMaterials.cork);
  cork.position.y = 0.0555;
  bottle.add(cork);
  return bottle;
}

/** A glass cartridge fuse with brass caps, the size of Level 2's (fuse.glb). Held by its lower cap. */
export function buildStudyFuse() {
  fuseMaterials ??= {
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.4, metalness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbcc8c4, roughness: 0.15, metalness: 0, emissive: 0x0b0d0c })
  };
  const fuse = new THREE.Group();
  fuse.name = 'StudyFuse';
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.07, 12), fuseMaterials.glass);
  tube.position.y = 0.05;
  fuse.add(tube);
  for (const y of [0.007, 0.093]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 12), fuseMaterials.brass);
    cap.position.y = y;
    fuse.add(cap);
  }
  return fuse;
}
