import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { U } from './materials.js';

// Layers: 0 = opaque architecture, 1 = glass, 2 = floors (excluded from their own reflection)
export const L_OPAQUE = 0, L_GLASS = 1, L_FLOOR = 2;

const FS_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

function fsMat(frag, uniforms = {}) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: opts.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: !!opts.mips, depthBuffer: opts.depth !== false, depthTexture: opts.depthTexture || null,
    samples: 0,
  });
}

const COPY = /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.); }`;
const CAPTURE = /* glsl */ `uniform sampler2D tSrc; uniform sampler2D tVol; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb + texture2D(tVol, vUv).rgb, 1.); }`;

const PREFILTER = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-.5,-.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(.5,-.5)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-.5,.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(.5,.5)).rgb;
  c *= .25; c = min(c, vec3(40.));
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - 1.6) / 2.4, 0., 1.); k *= k;
  gl_FragColor = vec4(c * k, 1.);
}`;
const DOWN = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 4.;
  c += texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,-1.)).rgb
     + texture2D(tSrc, vUv + uTexel*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,1.)).rgb;
  gl_FragColor = vec4(c / 8., 1.);
}`;
const UP = /* glsl */ `uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-1.,0.)).rgb*2. + texture2D(tSrc, vUv + uTexel*vec2(1.,0.)).rgb*2.
         + texture2D(tSrc, vUv + uTexel*vec2(0.,-1.)).rgb*2. + texture2D(tSrc, vUv + uTexel*vec2(0.,1.)).rgb*2.
         + texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,-1.)).rgb
         + texture2D(tSrc, vUv + uTexel*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,1.)).rgb;
  gl_FragColor = vec4(c / 12. + texture2D(tAdd, vUv).rgb, 1.);
}`;

// Volumetric light: march the view ray through the same analytic visibility the stone uses.
const VOLUME = /* glsl */ `
${COMMON}
uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
uniform sampler2D uProj[4]; uniform vec4 uProjZ; uniform vec4 uProjOn; uniform float uVolK;
varying vec2 vUv;
float hg(float c, float g){ float g2 = g*g; return (1. - g2) / (4.*PI*pow(1. + g2 - 2.*g*c, 1.5)); }
vec3 beam(sampler2D t, vec3 P, float zc, float on){
  vec3 A = vec3(-13.9, 15.5, zc);
  if (P.x <= A.x + .5) return vec3(0.);
  float s = (14. - A.x) / (P.x - A.x);
  vec3 q = A + (P - A) * s;
  vec2 uv = vec2((q.z - zc)/3.6 + .5, (q.y - 3.3)/2.025 + .5);
  float m = inside1(uv.x, 0., 1., .05) * inside1(uv.y, 0., 1., .05);
  if (m <= 0.) return vec3(0.);
  return texture2D(t, uv, 4.).rgb * m * on / (1. + s*s*.02);
}
void main(){
  float d = texture2D(tDepth, vUv).r;
  vec4 ndc = vec4(vUv * 2. - 1., d * 2. - 1., 1.);
  vec4 vp = uInvProj * ndc; vp /= vp.w;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.)).xyz;
  vec3 ro = uCamPos; vec3 rd = wp - ro; float maxT = min(length(rd), 85.); rd = normalize(rd);
  const int STEPS = 22;
  float dt = maxT / float(STEPS);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))) + uTime * 7.31);
  vec3 acc = vec3(0.); float T = 1.;
  for (int i = 0; i < STEPS; i++){
    vec3 P = ro + rd * (dt * (float(i) + jit));
    int reg = regionOf(P);
    vec3 Li = vec3(0.); float sig;
    if (reg == 0){
      sig = .016;
      vec3 L = normalize(uSun);
      Li = uSunCol * sunVisAtrium(P, L) * hg(dot(rd, L), .55) * 1.2;
      Li += vec3(.8,.9,1.05) * exp(-max(P.z - AZ1, 0.) / 9.) * .35 * step(abs(P.x), 7.) * step(P.y, 22.);
      if (P.z < 6. && P.z > -32.){
        Li += (beam(uProj[0], P, uProjZ.x, uProjOn.x) + beam(uProj[1], P, uProjZ.y, uProjOn.y)
             + beam(uProj[2], P, uProjZ.z, uProjOn.z) + beam(uProj[3], P, uProjZ.w, uProjOn.w)) * 0.8;
      }
    } else if (reg == 1){
      sig = .024;
      vec3 lp; int k = legOf(P, lp);
      if (k >= 0){
        vec4 st = uLegState[k];
        vec3 Ll = legSun(st);
        vec3 rdl = mat3(uLeg[k]) * rd;
        vec3 sunc = mix(vec3(1.0,.95,.86), vec3(.80,.90,1.08), st.y) * 3.4;
        Li = sunc * sunVisLeg(lp, st) * hg(dot(rdl, Ll), .5) * 1.2;
        Li += vec3(.8,.9,1.1) * st.z * exp(-max(33.2 - lp.x, 0.) / 4.) * .6;
      }
    } else {
      sig = .022;
      vec3 L; float v = rimVis(P, L);
      vec3 shell = mix(vec3(.62,.80,1.0), vec3(.95,.98,1.0), uListen);
      Li = shell * (1.2 + 5.5*uListen + 4.*uAudio.x) * v * hg(dot(rd, L), .35) * 1.2;
      Li += vec3(1.,.98,.95) * (2.4 + 2.*uAudio.x) * oculusVis(P) * hg(dot(rd, vec3(0.,1.,0.)), .6) * 1.0;
    }
    acc += T * Li * sig * dt;
    T *= exp(-sig * dt * .35);
  }
  gl_FragColor = vec4(acc * uVolK, 1.);
}`;

const BLUR = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * .294;
  c += (texture2D(tSrc, vUv + uDir*1.333).rgb + texture2D(tSrc, vUv - uDir*1.333).rgb) * .353;
  gl_FragColor = vec4(c, 1.);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tVol; uniform sampler2D tBloom;
uniform float uExposure; uniform float uBloom; uniform float uCharge; uniform float uFlash; uniform float uTime;
uniform vec2 uRes; uniform vec3 uLift; uniform float uFade;
varying vec2 vUv;
vec3 aces(vec3 x){ x *= .6; return clamp((x*(2.51*x + .03)) / (x*(2.43*x + .59) + .14), 0., 1.); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - .5;
  float r2 = dot(cc * vec2(uRes.x/uRes.y, 1.), cc * vec2(uRes.x/uRes.y, 1.));
  // passing through glass: a brief lensing ripple
  uv += cc * uFlash * (.06 * sin(r2 * 18. - uFlash * 6.));
  float ca = .0009 + uFlash * .006;
  vec3 c;
  c.r = texture2D(tScene, uv + cc * ca).r;
  c.g = texture2D(tScene, uv).g;
  c.b = texture2D(tScene, uv - cc * ca).b;
  c += texture2D(tVol, uv).rgb;
  c += texture2D(tBloom, uv).rgb * uBloom;
  // keeping a moment: the frame overexposes from its edges inward
  float edge = smoothstep(.05, .55, r2);
  c = mix(c, vec3(3.2, 3.5, 3.9), uCharge * uCharge * edge * .85);
  c *= 1. + uCharge * .35 + uFlash * 1.2;
  c *= uExposure;
  c = aces(c);
  c = c + uLift * (1. - c) * (1. - c);              // cool lift in the deepest values only
  c *= 1. - .16 * smoothstep(.25, 1.1, r2);         // quiet vignette
  c = toSRGB(c);
  c += (ign(gl_FragCoord.xy + fract(uTime) * 91.) - .5) / 255. * 2.2;   // dither / grain
  c = mix(c, vec3(.965, .976, .988), uFade);
  gl_FragColor = vec4(c, 1.);
}`;

export class Pipeline {
  constructor(renderer) {
    this.r = renderer;
    this.scale = 1;
    this.quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)));
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.quad);
    this.fsCam = new THREE.Camera();
    this.mCopy = fsMat(COPY, { tSrc: { value: null } });
    this.mCapture = fsMat(CAPTURE, { tSrc: { value: null }, tVol: { value: null } });
    this.mPre = fsMat(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mDown = fsMat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = fsMat(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mBlur = fsMat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mVol = fsMat(VOLUME, {
      ...U, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uVolK: { value: 0.2 },
    });
    this.mComp = fsMat(COMPOSITE, {
      tScene: { value: null }, tVol: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.16 },
      uCharge: { value: 0 }, uFlash: { value: 0 }, uTime: U.uTime, uRes: { value: new THREE.Vector2() },
      uLift: { value: new THREE.Vector3(0.010, 0.020, 0.036) }, uFade: { value: 0 },
    });
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.matrixAutoUpdate = false; this.reflCam.matrixWorldAutoUpdate = false;
    this.portalCam = new THREE.PerspectiveCamera();
    this.portalCam.matrixAutoUpdate = false; this.portalCam.matrixWorldAutoUpdate = false;
    this.mirror = new THREE.Matrix4().makeScale(1, -1, 1);
    this.size = new THREE.Vector2();
    this.targets = null;
  }

  resize(w, h, scale = this.scale) {
    this.scale = scale;
    const W = Math.round(w * scale), H = Math.round(h * scale);
    this.size.set(W, H);
    if (this.targets) Object.values(this.targets).forEach((t) => (Array.isArray(t) ? t.forEach((x) => x.dispose()) : t.dispose()));
    const depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
    const T = {
      scene: rt(W, H, { depthTexture }),
      copy: rt(W / 2, H / 2, { mips: true, depth: false }),
      refl: rt(W / 2, H / 2, { mips: true }),
      portal: rt(W / 2, H / 2),
      vol: rt(W / 4, H / 4, { depth: false }),
      vol2: rt(W / 4, H / 4, { depth: false }),
      bloom: [],
      bloomUp: [],
    };
    let bw = W / 2, bh = H / 2;
    for (let i = 0; i < 5; i++) { T.bloom.push(rt(bw, bh, { depth: false })); T.bloomUp.push(rt(bw, bh, { depth: false })); bw /= 2; bh /= 2; }
    this.targets = T;
    U.uRes.value.set(W, H);
    this.mComp.uniforms.uRes.value.set(W, H);
  }

  fs(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.fsScene, this.fsCam); }

  // Lengyel oblique near plane: clip everything behind the destination portal.
  oblique(cam, planeWorld) {
    const p = planeWorld.clone().applyMatrix4(cam.matrixWorldInverse);
    const cp = new THREE.Vector4(p.normal.x, p.normal.y, p.normal.z, p.constant);
    const m = cam.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(cp.x) + m[8]) / m[0], (Math.sign(cp.y) + m[9]) / m[5], -1, (1 + m[10]) / m[14]);
    const c = cp.multiplyScalar(2 / cp.dot(q));
    m[2] = c.x; m[6] = c.y; m[10] = c.z + 1; m[14] = c.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  render(scene, camera, opts) {
    const r = this.r, T = this.targets;
    const { portal, reflect = true, capture = null, exposure = 1, charge = 0, flash = 0, fade = 0, hideForPortal = [] } = opts;
    r.autoClear = true;

    // 1. planar reflection (floors excluded, glass in cheap mode)
    if (reflect) {
      this.reflCam.projectionMatrix.copy(camera.projectionMatrix);
      this.reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      this.reflCam.matrixWorld.multiplyMatrices(this.mirror, camera.matrixWorld);
      this.reflCam.matrixWorldInverse.copy(this.reflCam.matrixWorld).invert();
      this.reflCam.layers.set(L_OPAQUE); this.reflCam.layers.enable(L_GLASS);
      U.uScene.value = null;
      r.setRenderTarget(T.refl); r.render(scene, this.reflCam);
    }

    // 2. opaque + floors
    U.uRefl.value = T.refl.texture; U.uReflOn.value = reflect ? 1 : 0;
    camera.layers.set(L_OPAQUE); camera.layers.enable(L_FLOOR);
    r.setRenderTarget(T.scene); r.render(scene, camera);

    // 3. mip-mapped copy for glass refraction
    this.mCopy.uniforms.tSrc.value = T.scene.texture; this.fs(this.mCopy, T.copy);

    // 4. portal view of the destination
    if (portal && portal.active) {
      const pc = this.portalCam;
      pc.matrixWorld.multiplyMatrices(portal.matrix, camera.matrixWorld);
      pc.matrixWorldInverse.copy(pc.matrixWorld).invert();
      pc.projectionMatrix.copy(camera.projectionMatrix);
      this.oblique(pc, portal.plane);
      pc.layers.set(L_OPAQUE); pc.layers.enable(L_FLOOR);
      const vis = portal.show(true);
      hideForPortal.forEach((o) => (o.visible = false));
      U.uReflOn.value = 0;
      r.setRenderTarget(T.portal); r.render(scene, pc);
      U.uReflOn.value = reflect ? 1 : 0;
      hideForPortal.forEach((o) => (o.visible = true));
      portal.show(false, vis);
    }
    U.uPortal.value = T.portal.texture;

    // 5. glass on top of the opaque image
    U.uScene.value = T.copy.texture;
    r.autoClear = false;
    camera.layers.set(L_GLASS);
    r.setRenderTarget(T.scene); r.render(scene, camera);
    r.autoClear = true;
    camera.layers.set(L_OPAQUE);

    // 6. volumetric light (quarter res) + separable blur
    const mv = this.mVol.uniforms;
    mv.tDepth.value = T.scene.depthTexture;
    mv.uInvProj.value.copy(camera.projectionMatrixInverse);
    mv.uCamWorld.value.copy(camera.matrixWorld);
    mv.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    this.fs(this.mVol, T.vol);
    this.mBlur.uniforms.tSrc.value = T.vol.texture; this.mBlur.uniforms.uDir.value.set(1 / T.vol.width, 0); this.fs(this.mBlur, T.vol2);
    this.mBlur.uniforms.tSrc.value = T.vol2.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / T.vol.height); this.fs(this.mBlur, T.vol);

    // optional: keep this exact moment (HDR, pre-tonemap) for the Keep interaction
    if (capture) { this.mCapture.uniforms.tSrc.value = T.scene.texture; this.mCapture.uniforms.tVol.value = T.vol.texture; this.fs(this.mCapture, capture); }

    // 7. bloom: prefilter + dual filter chain
    const B = T.bloom, BU = T.bloomUp;
    this.mPre.uniforms.tSrc.value = T.scene.texture; this.mPre.uniforms.uTexel.value.set(1 / T.scene.width, 1 / T.scene.height);
    this.fs(this.mPre, B[0]);
    for (let i = 1; i < B.length; i++) {
      this.mDown.uniforms.tSrc.value = B[i - 1].texture; this.mDown.uniforms.uTexel.value.set(1 / B[i - 1].width, 1 / B[i - 1].height);
      this.fs(this.mDown, B[i]);
    }
    let src = B[B.length - 1];
    for (let i = B.length - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = src.texture; this.mUp.uniforms.tAdd.value = B[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.fs(this.mUp, BU[i]); src = BU[i];
    }

    // 8. composite to screen
    const c = this.mComp.uniforms;
    c.tScene.value = T.scene.texture; c.tVol.value = T.vol.texture; c.tBloom.value = BU[0].texture;
    c.uExposure.value = exposure; c.uCharge.value = charge; c.uFlash.value = flash; c.uFade.value = fade;
    this.fs(this.mComp, null);
  }
}
