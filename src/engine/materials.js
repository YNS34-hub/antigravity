import * as THREE from 'three';
import { COMMON, LIGHTING } from './glsl.js';

// One shared uniform block, referenced (not copied) by every material.
export const U = {
  uTime: { value: 0 },
  uSun: { value: new THREE.Vector3(0.06, 0.94, -0.34).normalize() },
  uSunCol: { value: new THREE.Color(1.0, 0.98, 0.92).multiplyScalar(3.8) },
  uSkyCol: { value: new THREE.Color(0.86, 0.92, 1.0).multiplyScalar(0.95) },
  uAudio: { value: new THREE.Vector4() },
  uFins: { value: null },
  uListen: { value: 0 },
  uLeg: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
  uLegState: { value: [new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(1, 0, 0, 0)] },
  uAfter: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uRefl: { value: null },
  uReflOn: { value: 1 },
  uCursor: { value: new THREE.Vector4(0, -100, 0, 0) },
  uProj: { value: [] },
  uProjZ: { value: new THREE.Vector4(2.5, -7.5, -17.5, -27.5) },
  uProjOn: { value: new THREE.Vector4(1, 1, 1, 1) },
  uScene: { value: null },
  uPortal: { value: null },
};

const VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vO;
#ifdef FINS
attribute float aIndex;
#endif
uniform sampler2D uFins;
void main(){
  vec3 p = position; vec3 n = normal;
  vO = position;
#ifdef FINS
  float o = texture2D(uFins, vec2((aIndex + .5)/96., .5)).r;
  float a = (1. - o) * 1.48;                  // closed = tangent, open = radial
  float c = cos(a), s = sin(a);
  p.xz = mat2(c, -s, s, c) * p.xz; n.xz = mat2(c, -s, s, c) * n.xz;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * n);
#else
  vec4 w = modelMatrix * vec4(p, 1.);
  vN = normalize(mat3(modelMatrix) * n);
#endif
  vW = w.xyz; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FOG = /* glsl */ `
vec3 applyFog(vec3 col, vec3 P){
  int reg = regionOf(P);
  float d = length(P - cameraPosition);
  float f = 1. - exp(-d * fogDensity(reg));
  return mix(col, fogColorAt(reg, normalize(P - cameraPosition)), f);
}`;

// ---------------------------------------------------------------- stone
const STONE_FRAG = /* glsl */ `
${COMMON}
${LIGHTING}
${FOG}
uniform vec3 uAlbedo; uniform float uJoint; uniform float uEmit;
uniform sampler2D uProj[4]; uniform vec4 uProjZ; uniform vec4 uProjOn;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vO;

vec3 projOne(sampler2D tex, vec3 P, float zc, float on){
  vec2 uv = vec2((P.z - zc)/3.6 + .5, (P.y - 3.3)/2.025 + .5);
  float m = inside1(uv.x, 0., 1., .02) * inside1(uv.y, 0., 1., .035);
  if (m <= 0.) return vec3(0.);
  return texture2D(tex, uv, 1.2).rgb * m * on;
}
vec3 projections(vec3 P, vec3 N){
  if (P.x < 13.85 || N.x > -.5 || P.z > 6.) return vec3(0.);
  vec3 acc = projOne(uProj[0], P, uProjZ.x, uProjOn.x) + projOne(uProj[1], P, uProjZ.y, uProjOn.y)
           + projOne(uProj[2], P, uProjZ.z, uProjOn.z) + projOne(uProj[3], P, uProjZ.w, uProjOn.w);
  return acc * 2.6;
}

void main(){
  vec3 P = vW; vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - P);
  // honed limestone: large soft clouds + fine grain, never a texture repeat
  vec2 q = abs(N.y) > .5 ? P.xz : (abs(N.x) > .5 ? P.zy : P.xy);
  float grain = fbm(q * .45) * .06 + vnoise(q * 9.) * .025;
  vec3 alb = uAlbedo * (0.96 + grain);
  // hairline panel joints: 2.5 m x 1.25 m modules, antialiased
  if (uJoint > 0.){
    vec2 g = q / vec2(2.5, 1.25);
    vec2 fw = fwidth(g) * 1.2;
    vec2 jl = smoothstep(fw, vec2(0.), abs(fract(g + .5) - .5));
    alb *= 1. - .07 * uJoint * max(jl.x, jl.y) * smoothstep(40., 8., length(P - cameraPosition));
  }
  Light l = lightAt(P, N);
  vec3 col = alb * (l.direct + l.ambient);
  // faint sheen of honed stone
  vec3 H = normalize(l.L + V);
  col += l.direct * pow(max(dot(N, H), 0.), 40.) * .05;
  if (regionOf(P) == 0) col += alb * projections(P, N);
  col += uAlbedo * uEmit;
  gl_FragColor = vec4(applyFog(col, P), 1.);
}`;

// ---------------------------------------------------------------- polished floor
const FLOOR_FRAG = /* glsl */ `
${COMMON}
${LIGHTING}
${FOG}
uniform vec3 uAlbedo; uniform float uPolish; uniform int uPattern;
uniform sampler2D uRefl; uniform float uReflOn; uniform vec2 uRes; uniform vec4 uCursor;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vO;

void main(){
  vec3 P = vW; vec3 N = vec3(0.,1.,0.);
  vec3 V = normalize(cameraPosition - P);
  vec2 q = P.xz; vec2 cell; vec2 g;
  if (uPattern == 2){                       // rotunda: rings and spokes
    vec2 d = P.xz - LC.xz; float r = length(d); float a = atan(d.y, d.x);
    g = vec2(r / 2.0, a / (2.*PI) * 24.);
  } else if (uPattern == 1){
    vec3 lp; int i = legOf(P, lp); g = vec2(lp.x / 3., lp.z / 1.6 + .5);
  } else g = q / 2.5;
  cell = floor(g);
  float slab = hash12(cell);
  vec2 fw = fwidth(g) * 1.1;
  vec2 jl = smoothstep(fw, vec2(0.), abs(fract(g) - .0) ) + smoothstep(fw, vec2(0.), abs(1. - fract(g)));
  float joint = max(jl.x, jl.y) * smoothstep(45., 6., length(P - cameraPosition));
  float grain = fbm(q * .35) * .05 + vnoise(q * 11.) * .02;
  vec3 alb = uAlbedo * (0.95 + grain + (slab - .5) * .035);
  Light l = lightAt(P, N);
  vec3 col = alb * (l.direct + l.ambient);
  vec3 H = normalize(l.L + V);
  float rough = mix(.05, .12, slab) + joint * .3;
  col += l.direct * pow(max(dot(N, H), 0.), 2. / (rough*rough)) * .25;
  // planar reflection, mip-blurred by per-slab polish
  float NdV = max(dot(N, V), 0.);
  float F = .035 + .965 * pow(1. - NdV, 5.);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 wob = (vec2(vnoise(q*1.7), vnoise(q*1.7+9.)) - .5) * .006;
  vec3 refl = texture2D(uRefl, suv + wob, rough * 14. + 0.4).rgb;
  float k = mix(.20, 1., F) * uPolish * (1. - joint * .8) * uReflOn;
  col = mix(col, refl, clamp(k, 0., .92));
  col *= 1. - joint * .10;
  // the cursor: a hairline ring drawn in the stone itself
  float cr = length(P.xz - uCursor.xz);
  float ring = smoothstep(.022, 0., abs(cr - .34)) + smoothstep(.06, 0., cr) * .5;
  col = mix(col, vec3(1.25, 1.42, 1.65) * (0.6 + 0.6*uListen), ring * uCursor.w * .85);
  gl_FragColor = vec4(applyFog(col, P), 1.);
}`;

// ---------------------------------------------------------------- emissive light surfaces
const EMIT_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uColA; uniform vec3 uColB; uniform float uInt; uniform float uGradY0; uniform float uGradY1; uniform float uAudioK;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vO;
void main(){
  float t = smoothstep(uGradY0, uGradY1, vW.y);
  vec3 c = mix(uColA, uColB, t) * uInt * (1. + uAudioK * (uAudio.x * 1.2 + uAudio.w));
  gl_FragColor = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- glass (portal, panes, monolith)
const GLASS_FRAG = /* glsl */ `
${COMMON}
${FOG}
uniform sampler2D uScene; uniform sampler2D uPortal; uniform sampler2D uMemory;
uniform vec2 uRes; uniform float uPortalOn; uniform float uMemoryOn; uniform float uOpacity;
uniform float uRefract; uniform float uEdge; uniform float uDissolve; uniform vec3 uHalf;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vO;
void main(){
  vec3 P = vW; vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - P);
  if (!gl_FrontFacing) N = -N;
  float NdV = clamp(dot(N, V), 0., 1.);
  float F = .04 + .96 * pow(1. - NdV, 5.);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 nV = normalize((viewMatrix * vec4(N, 0.)).xyz);
  // which face: |local z| dominant = big face
  vec3 an = abs(vO / uHalf);
  float bigFace = step(max(an.x, an.y), an.z - .0001);
  float edge = 1. - bigFace;
  vec2 off = nV.xy * uRefract * (edge * 3. + .25);
  vec3 bg;
  bg.r = texture2D(uScene, suv + off * 1.00).r;
  bg.g = texture2D(uScene, suv + off * 1.06).g;
  bg.b = texture2D(uScene, suv + off * 1.13).b;
  float front = bigFace * step(0., vO.z);
  if (uPortalOn > 0. && front > .5){
    vec3 pc = texture2D(uPortal, suv + off * .3).rgb;
    bg = mix(bg, pc, uPortalOn);
  }
  if (uMemoryOn > 0. && front > .5){
    vec2 uv = vUv;
    vec3 mc = texture2D(uMemory, uv).rgb;
    // the remembered image overexposes toward its edges
    vec2 e2 = min(uv, 1. - uv);
    float vig = smoothstep(0., .14, min(e2.x, e2.y));
    mc = mix(vec3(2.2, 2.4, 2.6), mc, mix(1., vig, uEdge));
    // dissolve: brightest parts of the memory let go first
    float lum = dot(mc, vec3(.3,.5,.2));
    float keep = smoothstep(uDissolve - .25, uDissolve, 1. - lum * .35 - hash12(floor(uv*240.)) * .2);
    bg = mix(bg, mc, uMemoryOn * (uDissolve > 0. ? keep : 1.));
  }
  // low-iron glass: aqua in its thickness, bright on its edges
  vec3 tint = mix(vec3(1.), vec3(.80,.95,.97), edge * .8 + .08);
  vec3 col = bg * tint;
  vec3 R = reflect(-V, N);
  col += skyEnv(R) * F * (0.55 + edge * .8);
  col += vec3(.9,1.,1.1) * edge * pow(1. - NdV, 2.) * .35 * uEdge;
  col = applyFog(col, P);
  gl_FragColor = vec4(col, uOpacity);
}`;

function mk(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms: { ...U, ...uniforms },
    defines,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
  });
}

export function stoneMat({ albedo = [0.82, 0.80, 0.76], joint = 1, emit = 0, fins = false } = {}) {
  const m = mk(STONE_FRAG, {
    uAlbedo: { value: new THREE.Color(...albedo) },
    uJoint: { value: joint },
    uEmit: { value: emit },
  }, fins ? { FINS: '' } : {});
  return m;
}

export function floorMat({ albedo = [0.80, 0.80, 0.79], polish = 1, pattern = 0 } = {}) {
  return mk(FLOOR_FRAG, {
    uAlbedo: { value: new THREE.Color(...albedo) },
    uPolish: { value: polish },
    uPattern: { value: pattern },
  });
}

export function emitMat({ a = [1, 1, 1], b = null, intensity = 4, y0 = 0, y1 = 1, audio = 0 } = {}) {
  return mk(EMIT_FRAG, {
    uColA: { value: new THREE.Color(...a) },
    uColB: { value: new THREE.Color(...(b || a)) },
    uInt: { value: intensity },
    uGradY0: { value: y0 },
    uGradY1: { value: y1 },
    uAudioK: { value: audio },
  });
}

export function glassMat({ half = [1, 1, 1], refract = 0.035, portal = false } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: GLASS_FRAG,
    uniforms: {
      ...U,
      uMemory: { value: null },
      uPortalOn: { value: portal ? 1 : 0 },
      uMemoryOn: { value: 0 },
      uOpacity: { value: 1 },
      uRefract: { value: refract },
      uEdge: { value: 1 },
      uDissolve: { value: 0 },
      uHalf: { value: new THREE.Vector3(...half) },
    },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
  });
  m.userData.glass = true;
  return m;
}
