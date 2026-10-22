import * as THREE from 'three';
import steelColorUrl from '../assets/textures/lab/metal055b_color.jpg?url';
import steelNormalUrl from '../assets/textures/lab/metal055b_normal_gl.jpg?url';
import steelRoughnessUrl from '../assets/textures/lab/metal055b_roughness.jpg?url';
import steelMetalnessUrl from '../assets/textures/lab/metal055b_metalness.jpg?url';
import rustedBrassUrl from '../assets/textures/keys/brass_key_rusted.jpg?url';
import rustedBrassRoughMetalUrl from '../assets/textures/keys/brass_key_rusted_rm.png?url';

/**
 * The materials Level 1's keys are made of, shared by the key in the room and
 * the one in the player's hand, so a key does not change as it is picked up.
 *
 *   steel  the bedroom door key: the same photographed bare steel as the
 *          Level 2 lab's pipes (metal055b), its colour, scratches, roughness
 *          and metalness all from the photo.
 *   brass  the safe key: brass with rust coming through it in patches, baked
 *          by scripts/build_key_textures.py from that steel photo's grain and
 *          the lab's rust overlay. The rust is rough and not metal.
 *
 * Both keep a trace of emission, like every small item in the game: a key is a
 * few centimetres of metal, and metal is lit mostly by what it reflects, which
 * in these rooms is darkness.
 *
 * Built once and shared: the textures are loaded on first use.
 */
const KEY_TEXTURE_REPEAT = 0.35;

function loadKeyTexture(url, { colour = false, repeat = KEY_TEXTURE_REPEAT } = {}) {
  const texture = new THREE.TextureLoader().load(url);
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

let steel = null;
let brass = null;

/** The bedroom door key's bare steel. */
export function steelKeyMaterial() {
  steel ??= new THREE.MeshStandardMaterial({
    map: loadKeyTexture(steelColorUrl, { colour: true }),
    normalMap: loadKeyTexture(steelNormalUrl),
    roughnessMap: loadKeyTexture(steelRoughnessUrl),
    metalnessMap: loadKeyTexture(steelMetalnessUrl),
    roughness: 1,
    metalness: 1,
    emissive: 0x1a1c1f,
    emissiveIntensity: 1
  });
  return steel;
}

/** The safe key's rusted brass. */
export function brassKeyMaterial() {
  if (!brass) {
    const roughMetal = loadKeyTexture(rustedBrassRoughMetalUrl, { repeat: 1.6 });
    brass = new THREE.MeshStandardMaterial({
      map: loadKeyTexture(rustedBrassUrl, { colour: true, repeat: 1.6 }),
      roughnessMap: roughMetal,
      metalnessMap: roughMetal,
      roughness: 1,
      metalness: 1,
      emissive: 0x241a08,
      emissiveIntensity: 0.35
    });
  }
  return brass;
}
