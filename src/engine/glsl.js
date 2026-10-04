// Shared GLSL. One analytic light model per space, used by every surface shader AND by the
// volumetric raymarch, so shafts in the haze line up exactly with the patches on stone.
// No shadow maps: each space knows its apertures, and visibility is a handful of ray/plane tests.

export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3  uSun;        // atrium sun direction (towards the sun)
uniform vec3  uSunCol;
uniform vec3  uSkyCol;
uniform vec4  uAudio;      // low, mid, high, level
uniform sampler2D uFins;   // listening room: fin openness, 96 x 1
uniform float uListen;     // listening room wakefulness 0..1
uniform mat4  uLeg[3];     // corridor: world -> leg-local (x = forward u, y = up, z = right v)
uniform vec4  uLegState[3];// x sunSide, y tint, z doorway, w unused
uniform float uAfter;      // atrium afterglow 0..1

#define PI 3.14159265
#define AW 14.0
#define AH 32.0
#define AD 1.5
#define AZ0 10.0
#define AZ1 -60.0
#define LC vec3(400.0, 0.0, 0.0)

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return vnoise(p)*.55 + vnoise(p*2.13+7.1)*.28 + vnoise(p*4.37+3.3)*.17; }

// soft pulse train: 1 inside openings of width w centred at period/2 + k*period
float slots(float x, float period, float w, float s){ float d = abs(mod(x, period) - period*.5); return 1. - smoothstep(w*.5 - s, w*.5 + s, d); }
// soft pulse train centred at k*period
float ribs(float x, float period, float w, float s){ float d = abs(mod(x + period*.5, period) - period*.5); return 1. - smoothstep(w*.5 - s, w*.5 + s, d); }
float inside1(float x, float lo, float hi, float s){ return smoothstep(lo - s, lo + s, x) * (1. - smoothstep(hi - s, hi + s, x)); }

int regionOf(vec3 P){ if (P.x > 300.) return 2; if (P.x < -14.9 && P.z < -20.) return 1; return 0; }

vec3 fogColorAt(int reg, vec3 V){
  if (reg == 2) return mix(vec3(.22,.29,.40), vec3(.70,.82,.96), uListen);
  if (reg == 1) return vec3(.80,.86,.94);
  return mix(vec3(.90,.94,.99), vec3(.92,.86,.80), uAfter*.35);
}
float fogDensity(int reg){ return reg == 2 ? .010 : (reg == 1 ? .011 : .0052); }

// analytic "softbox" environment for glass and polished speculars
vec3 skyEnv(vec3 d){
  float h = d.y;
  vec3 c = mix(vec3(.80,.86,.93), vec3(1.0,1.02,1.06), smoothstep(-.2, .6, h));
  c += vec3(1.6,1.7,1.85) * smoothstep(.985, .999, abs(d.x)) * smoothstep(-.1,.3,h);   // tall softboxes
  c += vec3(2.2) * smoothstep(.93, .99, h);                                            // overhead light
  c *= mix(.35, 1., smoothstep(-.6, .05, h));
  return c;
}

// ---------------------------------------------------------------- ATRIUM
float sunVisAtrium(vec3 P, vec3 L){
  if (P.z > AZ0 + .3 || abs(P.x) > AW + .6) return 0.;
  float vis = 0.;
  if (L.y > .01){                                    // through the ceiling slots (thick slab)
    float t1 = (AH - P.y)/L.y, t2 = (AH + AD - P.y)/L.y;
    vec3 q1 = P + L*t1, q2 = P + L*t2;
    float s = .018*t1 + .01;
    float c = slots(q1.z, 5., 2.2, s) * slots(q2.z, 5., 2.2, s);
    c *= 1. - smoothstep(AW - s, AW + s, abs(q1.x));
    c *= inside1(q1.z, -58.3, 8.3, s);
    vis += c;
  }
  if (L.z < -.01){                                   // through the far aperture
    float t = (AZ1 - P.z)/L.z; vec3 q = P + L*t; float s = .016*t + .01;
    vis += (1. - smoothstep(6. - s, 6. + s, abs(q.x))) * (1. - smoothstep(22. - s, 22. + s, q.y)) * step(-.01, q.y) * step(0., t);
  }
  vis = min(vis, 1.);
  if (vis < .001) return 0.;
  if (abs(L.x) > .01){                               // the deep fins on both walls
    for (int i = 0; i < 4; i++){
      float xp = (i < 2 ? -1. : 1.) * (i == 0 || i == 3 ? 13.8 : 12.6);
      float t = (xp - P.x)/L.x;
      if (t > .02){
        vec3 q = P + L*t; float s = .012*t + .008;
        float f = ribs(q.z, 5., .5, s) * inside1(q.z, -55.3, 5.3, s) * step(q.y, AH);
        vis *= 1. - f;
      }
    }
  }
  if (abs(L.z) > .01){                               // the monolith: glass shadow with caustic rim
    float t = (-24. - P.z)/L.z;
    if (t > 0.){
      vec3 q = P + L*t; float s = .01*t + .01;
      float r = inside1(q.x, -2.2, 2.2, s) * inside1(q.y, .35, 11.35, s);
      float e = r * (1. - inside1(q.x, -2.05, 2.05, s*.6) * inside1(q.y, .5, 11.2, s*.6));
      vis *= 1. - r*.26 + e*1.4;
    }
  }
  return vis;
}

// ---------------------------------------------------------------- CORRIDOR
int legOf(vec3 P, out vec3 lp){
  for (int i = 0; i < 3; i++){
    lp = (uLeg[i] * vec4(P, 1.)).xyz;
    if (lp.x > -.75 && lp.x < 34.2 && abs(lp.z) < 2.75) return i;
  }
  lp = vec3(0.); return -1;
}
vec3 legSun(vec4 st){ return normalize(vec3(-.30, .60, -st.x * .74)); }
float sunVisLeg(vec3 lp, vec4 st){
  vec3 L = legSun(st);
  float vin = -st.x * 1.6, vout = -st.x * 2.1;
  float t1 = (vin - lp.z)/L.z, t2 = (vout - lp.z)/L.z;
  if (t1 < 0.) return 0.;
  vec3 q1 = lp + L*t1, q2 = lp + L*t2;
  float s = .02*t1 + .006;
  float v = slots(q1.x, 3., .22, s) * slots(q2.x, 3., .22, s);
  v *= inside1(q1.x, 0., 30., s) * (1. - smoothstep(9. - s, 9. + s, q1.y));
  return v;
}

// ---------------------------------------------------------------- LISTENING ROOM
float finOpen(float a){ return texture2D(uFins, vec2(fract(a), .5)).r; }
float rimVis(vec3 P, out vec3 L){
  vec3 d = P - LC; float r = max(length(d.xz), .001);
  vec2 rd = d.xz / r;
  L = normalize(vec3(rd.x, .22, rd.y));
  float a = atan(d.z, d.x) / (2.*PI) + .5;
  float spread = clamp((12. - r)/12., 0., 1.);
  float o = finOpen(a)*.5 + finOpen(a + .006*spread)*.25 + finOpen(a - .006*spread)*.25;
  float g = .5 + .5*cos(atan(d.z, d.x) * 96.);                       // gaps between the 96 fins
  float streak = mix(smoothstep(1. - o*.9, 1., g), o*.45, spread*spread);
  float h = 1. - smoothstep(13., 15., P.y);
  return streak * o * h / (1. + max(12. - r, 0.) * .10);
}
float oculusVis(vec3 P){
  vec3 d = P - LC; float r = length(d.xz);
  float R = 2.0 + (15. - P.y) * .045;
  return (1. - smoothstep(R - .25, R + .25, r)) * step(P.y, 15.2);
}
`;

// Per-surface lighting: returns direct + ambient irradiance multipliers for an albedo.
export const LIGHTING = /* glsl */ `
struct Light { vec3 direct; vec3 ambient; vec3 L; };

Light lightAt(vec3 P, vec3 N){
  Light o; o.direct = vec3(0.); o.ambient = vec3(0.); o.L = vec3(0.,1.,0.);
  int reg = regionOf(P);
  if (reg == 0){
    vec3 L = normalize(uSun); o.L = L;
    float v = sunVisAtrium(P, L);
    o.direct = uSunCol * v * max(dot(N, L), 0.);
    float h = clamp(P.y / AH, 0., 1.);
    float up = N.y*.5 + .5;
    vec3 sky = uSkyCol * mix(.68, 1.15, h) * mix(.82, 1.18, up);
    float endGlow = exp(-max(P.z - AZ1, 0.) / 22.) * max(-N.z*.6 + .4, 0.);
    vec3 bounce = uSunCol * .12 * (1. - up) * (1. - h*.5);
    // analytic occlusion: floor/wall junctions and bays between fins
    float ao = 1.;
    float dw = AW - abs(P.x);
    ao *= 1. - .35 * exp(-P.y / .65) * step(.5, abs(N.x));                 // wall foot
    ao *= 1. - .28 * exp(-dw / .8) * step(.5, N.y);                         // floor edge
    ao *= 1. - .15 * exp(-(AH - P.y) / 2.0);                                // ceiling corner
    float fz = abs(mod(P.z + 2.5, 5.) - 2.5);                               // distance to nearest fin plane
    ao *= 1. - .18 * exp(-max(fz - .25, 0.) / .9) * smoothstep(11.8, 13.9, abs(P.x)) * step(P.z, 5.5) * step(-55.5, P.z);
    o.ambient = (sky + bounce) * ao + vec3(.85,.92,1.0) * endGlow * 1.8 * ao;
    if (P.z > AZ0){                                                         // the low vestibule: gentle entry
      float k = smoothstep(AZ0 + 9., AZ0, P.z);
      o.ambient = mix(uSkyCol * .38, o.ambient, k);
    }
  } else if (reg == 1){
    vec3 lp; int i = legOf(P, lp);
    if (i >= 0){
      vec4 st = uLegState[i];
      mat3 R = mat3(uLeg[i]);
      vec3 Nl = R * N;
      vec3 Ll = legSun(st);
      float v = sunVisLeg(lp, st);
      vec3 sunc = mix(vec3(1.0,.95,.86), vec3(.80,.90,1.08), st.y) * 3.4;
      o.direct = sunc * v * max(dot(Nl, Ll), 0.);
      o.L = transpose(R) * Ll;
      float corner = smoothstep(29.5, 31.5, lp.x);
      vec3 amb = mix(vec3(.56,.64,.76), vec3(.48,.60,.82), st.y) * (.42 + .28*clamp(lp.y/9.,0.,1.));
      amb *= 1. - .35 * exp(-lp.y/.5) * step(.5, abs(Nl.z));
      amb *= 1. - .25 * exp(-(1.6 - abs(lp.z))/.5) * step(.5, Nl.y);
      amb *= mix(1., .55, corner);
      float door = st.z * exp(-max(33.2 - lp.x, 0.) / 7.) * (1. - smoothstep(1.2, 2.2, abs(lp.z) - 0.));
      o.ambient = amb + vec3(.8,.9,1.1) * door * 2.2;
    } else {
      o.ambient = uSkyCol * .35;
    }
  } else {
    vec3 L; float v = rimVis(P, L); o.L = L;
    vec3 shell = mix(vec3(.62,.80,1.0), vec3(.95,.98,1.0), uListen);
    float rimI = (1.2 + 5.5*uListen + 4.0*uAudio.x);
    o.direct = shell * rimI * v * max(dot(N, L) * .8 + .2, 0.);
    float oc = oculusVis(P);
    o.direct += vec3(1.0,.98,.95) * (2.6 + 2.0*uAudio.x) * oc * max(N.y, 0.);
    vec3 d = P - LC;
    float avgOpen = texture2D(uFins, vec2(.25,.5)).r*.5 + texture2D(uFins, vec2(.75,.5)).r*.5;
    o.ambient = vec3(.40,.50,.66) * (.16 + .55*uListen + .6*avgOpen) * (.7 + .3*(N.y*.5+.5));
    o.ambient *= 1. - .35 * exp(-P.y/.5) * step(.5, length(N.xz));
  }
  return o;
}
`;
