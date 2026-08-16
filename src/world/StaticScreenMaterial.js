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
    vec3 color = vec3(base + scan + band * 0.3);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createStaticScreenMaterial({ noiseStrength = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uNoiseStrength: { value: noiseStrength }
    }
  });
}
