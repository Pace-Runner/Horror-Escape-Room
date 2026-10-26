import * as THREE from 'three';
import rustedBrassUrl from '../assets/textures/keys/brass_key_rusted.jpg?url';
import rustedBrassRoughMetalUrl from '../assets/textures/keys/brass_key_rusted_rm.webp?url';
import rustedIronUrl from '../assets/textures/keys/iron_key_rusted.jpg?url';
import rustedIronRoughMetalUrl from '../assets/textures/keys/iron_key_rusted_rm.webp?url';

/**
 * The materials Level 1's keys are made of, shared by the key in the room and
 * the one in the player's hand, so a key does not change as it is picked up.
 *
 *   iron   the bedroom door key: black iron worn bright where a hand has held
 *          it and rusted everywhere else.
 *   brass  the safe key: warm brass, rubbed bright, tarnished dark in the
 *          crevices, with rust coming through in patches.
 *
 * Both are baked by scripts/build_key_textures.py from the lab's photographed
 * steel grain and rust overlay. Rust is rough and not metal; the worn patches
 * are low-roughness metal, which is what makes the keys glint in the torch beam.
 *
 * Both keep a trace of emission, like every small item in the game: a key is a
 * few centimetres of metal, and metal is lit mostly by what it reflects, which
 * in these rooms is darkness.
 *
 * Built once and shared: the textures are loaded on first use.
 */
const KEY_TEXTURE_REPEAT = 1.6;

function loadKeyTexture(url, { colour = false } = {}) {
  const texture = new THREE.TextureLoader().load(url);
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(KEY_TEXTURE_REPEAT, KEY_TEXTURE_REPEAT);
  texture.anisotropy = 8;
  return texture;
}

function keyMaterial(colourUrl, roughMetalUrl, emissive, emissiveIntensity) {
  const roughMetal = loadKeyTexture(roughMetalUrl);
  return new THREE.MeshStandardMaterial({
    map: loadKeyTexture(colourUrl, { colour: true }),
    roughnessMap: roughMetal,
    metalnessMap: roughMetal,
    roughness: 1,
    metalness: 1,
    emissive,
    emissiveIntensity
  });
}

let iron = null;
let brass = null;

/** The bedroom door key's rusted iron. */
export function ironKeyMaterial() {
  iron ??= keyMaterial(rustedIronUrl, rustedIronRoughMetalUrl, 0x1a1816, 0.6);
  return iron;
}

/** The safe key's tarnished brass. */
export function brassKeyMaterial() {
  brass ??= keyMaterial(rustedBrassUrl, rustedBrassRoughMetalUrl, 0x2a1d08, 0.45);
  return brass;
}
