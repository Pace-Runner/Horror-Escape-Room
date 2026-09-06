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
    /**
     * MUCH smaller than it was. At aSize 1.4-3.8 against a factor of 6.0, a
     * mote a metre from the camera drew 8 to 23 pixels across -- and with the
     * alpha below reaching nearly 1.0 they came out as opaque white discs
     * scattered over the whole frame. It read as snow falling indoors, and it
     * was the loudest thing in every screenshot of this level.
     *
     * The near clamp is 0.55 rather than 1.0 as well, so a mote drifting right
     * past the lens keeps growing instead of freezing at full size a metre out.
     */
    gl_PointSize = aSize * (3.2 / max(-mvPosition.z, 0.55));
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
    /**
     * Peak alpha down to about 0.42. These were reaching nearly opaque, which
     * is not what suspended dust does -- it scatters a little of the beam and
     * most of it is barely there. The twinkle range is widened at the same
     * time (0.22 to 1.0 rather than 0.4 to 1.0) so the few that do catch the
     * light stand out MORE against the ones that do not, which is the effect
     * uniform bright discs were destroying.
     */
    float alpha = soft * vFade * beamGlow * (0.22 + twinkle * 0.78) * 0.42;
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
    // 0.55-1.75 rather than 1.4-3.8. Dust is small; what makes it readable is
    // that it CATCHES the light, not that it is big.
    sizes[i] = 0.55 + Math.random() * 1.2;
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
