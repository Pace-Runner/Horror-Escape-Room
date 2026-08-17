import * as THREE from 'three';

// Custom vertex + fragment shader for dust drifting through the
// flashlight beam. The point cloud is a child of the camera, in the same
// local space as main.js's flashlight SpotLight (aimed down -Z) -- so
// each particle's own local xyz already says how far down the beam it
// sits and how far off-axis it is, and the vertex shader can test "is
// this particle inside the cone" on the GPU with no per-frame CPU pass.
// The fragment shader draws a soft round sprite that twinkles and fades
// the whole system in with uBeamOn, so the dust is barely visible until
// the flashlight actually catches it -- built-in Points/Sprite materials
// have no notion of "inside this light's cone" to drive that with.
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uConeSlope;
  varying float vBeam;
  varying float vPhase;
  varying float vFade;

  void main() {
    vPhase = aPhase;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    float depth = max(-position.z, 0.001);
    float coneRadius = depth * uConeSlope;
    float off = length(position.xy);
    vBeam = 1.0 - smoothstep(coneRadius * 0.5, coneRadius, off);
    vFade = smoothstep(0.0, 0.6, depth) * (1.0 - smoothstep(6.5, 9.0, depth));

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (6.0 / max(-mvPosition.z, 1.0));
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBeamOn;
  uniform vec3 uColor;
  varying float vBeam;
  varying float vPhase;
  varying float vFade;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float twinkle = 0.5 + 0.5 * sin(uTime * 2.2 + vPhase * 6.2831);

    float ambient = 0.05;
    float beamGlow = mix(ambient, 1.0, vBeam * uBeamOn);
    float alpha = soft * vFade * beamGlow * (0.4 + twinkle * 0.6);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Particles are seeded inside (and recycled back into) the same cone the
// SpotLight in main.js actually casts, so the visible dust field always
// matches the flashlight's real angle/range rather than an eyeballed box.
export function createDustMotes({
  count = 140,
  coneAngleRad = THREE.MathUtils.degToRad(28),
  maxDistance = 9,
  color = new THREE.Color(0xfff2c0)
} = {}) {
  const tanAngle = Math.tan(coneAngleRad);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const drift = new Float32Array(count * 3);

  function reset(i) {
    const z = -(0.3 + Math.random() * (maxDistance - 0.3));
    const r = Math.abs(z) * tanAngle * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = z;
  }

  for (let i = 0; i < count; i++) {
    reset(i);
    sizes[i] = 1.4 + Math.random() * 2.4;
    phases[i] = Math.random();
    drift[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
    drift[i * 3 + 1] = (Math.random() - 0.5) * 0.04 + 0.015;
    drift[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBeamOn: { value: 0 },
      uConeSlope: { value: tanAngle },
      uColor: { value: color }
    }
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  const posAttr = geometry.attributes.position;

  return {
    points,
    material,
    update(dt, elapsed) {
      material.uniforms.uTime.value = elapsed;
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i) + drift[i * 3 + 0] * dt;
        const y = posAttr.getY(i) + drift[i * 3 + 1] * dt;
        const z = posAttr.getZ(i) + drift[i * 3 + 2] * dt;
        const depth = -z;
        const r = Math.hypot(x, y);
        const coneR = Math.max(depth, 0.05) * tanAngle;
        if (depth < 0.2 || depth > maxDistance || r > coneR * 1.3) {
          reset(i);
        } else {
          posAttr.setXYZ(i, x, y, z);
        }
      }
      posAttr.needsUpdate = true;
    },
    setBeamOn(on) {
      material.uniforms.uBeamOn.value = on ? 1 : 0;
    }
  };
}
