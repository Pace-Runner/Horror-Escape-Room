import * as THREE from 'three';

// Custom vertex + fragment shader (not a built-in Three.js material) for
// the retro CCTV monitor in the basement. The fragment shader hashes the
// screen UV against a time uniform every frame to generate procedural
// analog static, with a few scrolling scanlines layered on top and a
// vignette to sell an old CRT tube. uTime is advanced every frame from
// the render loop so the noise is alive rather than a frozen texture.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uNoiseStrength;
  uniform sampler2D uFeed;
  /** 0 = show the feed, 1 = the feed is buried in static. */
  uniform float uStaticMix;
  /** 0 when nothing is plugged in, so the sampler is never read. */
  uniform float uHasFeed;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;

    float grain = hash(uv * vec2(720.0, 480.0) + uTime * 60.0);

    float scan = sin((uv.y * 240.0) - uTime * 4.0) * 0.04;

    float band = step(0.985, fract(uv.y * 3.0 - uTime * 0.15));

    vec2 centered = uv - 0.5;
    float vignette = smoothstep(0.75, 0.15, length(centered));

    float base = mix(0.05, 0.85, grain) * uNoiseStrength;
    vec3 staticColour = vec3(base + scan + band * 0.3);

    // The feed, when there is one. Sampled with a horizontal tear that tracks
    // the static mix, so a picture fighting its way through interference looks
    // like it is fighting rather than like it is fading up.
    float tear = (hash(vec2(floor(uv.y * 90.0), floor(uTime * 12.0))) - 0.5)
                 * 0.06 * uStaticMix;
    vec3 feed = texture2D(uFeed, vec2(uv.x + tear, uv.y)).rgb;

    // The scanlines and the band belong to the TUBE, not to the signal, so they
    // stay on top of whichever of the two is showing.
    vec3 signal = mix(feed, staticColour, uStaticMix);
    vec3 color = mix(staticColour, signal + scan + band * 0.18, uHasFeed);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * `feed` is an optional THREE.Texture -- a CanvasTexture from world/CctvFeeds.js
 * in practice. Without one the material behaves exactly as it always did, which
 * is what keeps it usable for any other dead screen in the game.
 */
export function createStaticScreenMaterial({ noiseStrength = 1.0, feed = null } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uNoiseStrength: { value: noiseStrength },
      uFeed: { value: feed },
      uStaticMix: { value: 1 },
      uHasFeed: { value: feed ? 1 : 0 }
    }
  });
}
