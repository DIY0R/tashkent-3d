// Shared procedural "ornament" material for the g2 landmark group (old-city monuments).
// One MeshStandardMaterial for everything: the pattern is picked per vertex (aPat.x) and drawn in
// the fragment shader from uv given in metres. Night lighting is driven by one shared uniform.
import * as THREE from 'three'

/** Pattern ids (aPat.x). */
export const P = {
  PLAIN: 0, BRICK: 1, GIRIH: 2, INSCR: 3, ARCH: 4, DOME: 5, PAVE: 6, GLASS: 7, CHORSU: 8, SCALES: 9,
  DIAMOND: 10, STONE: 11, GRASS: 12, WOOD: 13, MOSAIC: 14, WATER: 15, MUQ: 16, STRIPE: 17,
} as const
/** Fill kinds inside an ARCH pattern (aAux.x). */
export const F = { LATTICE: 0, GLASS: 1, DOOR: 2, TILE: 3, VOID: 4, PLAIN: 5, MUQ: 6 } as const
/** Wall kinds outside an ARCH pattern (aAux.y). */
export const O = { PLAIN: 0, BRICK: 1, BRICK_TILE: 2, STONE: 3, STONE_TILE: 4 } as const

/** 0 = day, 1 = night. Synced from the engine (window.__tk.env.shared.uNight) before each draw. */
export const g2Night = { value: 0 }

const lin = (hex: number) => {
  const c = new THREE.Color(hex)
  return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`
}

const FRAG_DEFS = /* glsl */ `
uniform float uG2Night;
varying vec3 vG2Col; varying vec3 vG2Col2; varying vec4 vG2Pat; varying vec4 vG2Aux; varying vec2 vG2Uv;
const vec3 G2_COB = ${lin(0x1f4e9e)};
const vec3 G2_ULTRA = ${lin(0x17357a)};
const vec3 G2_TURQ = ${lin(0x2fa7a0)};
const vec3 G2_LBLUE = ${lin(0x6fa8dc)};
const vec3 G2_WHITE = ${lin(0xedeee8)};
const vec3 G2_DARK = vec3(0.012, 0.014, 0.02);
float g2h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float g2n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(g2h(i), g2h(i+vec2(1,0)), f.x), mix(g2h(i+vec2(0,1)), g2h(i+vec2(1,1)), f.x), f.y); }
float g2aa(float d, float w, float fw){ return 1.0 - smoothstep(w - fw, w + fw, d); }
float g2fade(float fw, float s){ return 1.0 - smoothstep(0.3*s, 0.8*s, fw); }
vec3 g2Brick(vec2 uv, vec3 c, vec2 s, float jw, float fw){
  vec2 q = uv / s; float row = floor(q.y); q.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(q); vec2 f = fract(q);
  float fade = g2fade(fw, s.y);
  float v = (g2h(id) - 0.5) * 0.16 * fade;
  float m = max(g2aa(min(f.y, 1.0-f.y)*s.y, jw, fw), g2aa(min(f.x, 1.0-f.x)*s.x, jw, fw)) * fade;
  float n = g2n(uv * 0.13) * 0.10 - 0.05;
  return c * (1.0 + v + n) * (1.0 - 0.25 * m);
}
vec3 g2Girih(vec2 uv, float s, vec3 cA, vec3 cB, float fw){
  vec2 p = fract(uv / s) - 0.5; vec2 q = abs(p);
  float d1 = max(q.x, q.y); float d2 = (q.x + q.y) * 0.70711;
  float star = min(d1, d2); float oct = max(d1, d2);
  float f = fw / s; float fade = g2fade(fw, s * 0.5);
  vec3 c = mix(cA, cB, g2aa(star, 0.30, f));
  c = mix(c, cA, g2aa(oct, 0.16, f));
  c = mix(c, G2_WHITE, g2aa(oct, 0.07, f));
  float cd = length(q - 0.5);
  c = mix(c, G2_LBLUE, g2aa(cd, 0.13, f));
  float ln = max(g2aa(abs(star - 0.30), 0.035, f), g2aa(abs(oct - 0.16), 0.025, f));
  c = mix(c, G2_WHITE, ln);
  return mix(mix(cA, cB, 0.42), c, fade);
}
float g2ArchD(vec2 p, float a, float sp, float ap){
  float x = abs(p.x);
  if (p.y < sp) return a - x;
  float R = max(ap - sp, 0.001); float yy = p.y - sp; float d = 0.0;
  if (R < a) yy *= a / R; else d = (R*R - a*a) / (2.0*a);
  return (a + d) - length(vec2(x + d, yy));
}
vec3 g2Muq(vec2 uv, float s, float fw){
  vec2 q = uv / s; float row = floor(q.y); q.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(q); vec2 f = fract(q) - vec2(0.5, 0.0);
  float D = g2ArchD(f, 0.42, 0.35, 0.95);
  float hsh = g2h(id);
  vec3 cell = hsh < 0.4 ? G2_COB : (hsh < 0.7 ? G2_LBLUE : (hsh < 0.88 ? G2_TURQ : vec3(0.72, 0.58, 0.28)));
  cell *= 0.75 + 0.5 * f.y;
  vec3 c = mix(G2_WHITE * 0.92, cell, smoothstep(0.0, 0.08 + fw / s, D));
  return mix(mix(G2_COB, G2_LBLUE, 0.5), c, g2fade(fw, s * 0.6));
}
void g2Shade(inout vec3 col, out vec3 emis, out float rough){
  vec2 uv = vG2Uv; vec3 c1 = vG2Col; vec3 c2 = vG2Col2;
  int pat = int(vG2Pat.x + 0.5); float p1 = vG2Pat.y; float p2 = vG2Pat.z; float glow = vG2Pat.w;
  vec2 fwv = fwidth(uv); float fw = max(fwv.x, fwv.y);
  rough = 0.85; float lit = 0.0; vec3 c = c1;
  if (pat == 0) { c = c1 * (0.97 + 0.06 * g2n(uv * 0.6)); }
  else if (pat == 1) { c = g2Brick(uv, c1, vec2(0.56, 0.16), 0.01, fw); }
  else if (pat == 2) { c = g2Girih(uv, p1, c1, c2, fw); rough = 0.4; }
  else if (pat == 3) {
    float v = uv.y / p1; float u = uv.x / p1; float f = fw / p1; float fade = g2fade(fw, p1 * 0.25);
    float wv = 0.5 + 0.16 * sin(u * 5.3) + 0.09 * sin(u * 12.7 + 1.3);
    float stroke = g2aa(abs(v - wv), 0.06, f);
    float cell = floor(u * 3.0); float fx = fract(u * 3.0); float hh = g2h(vec2(cell, 3.0));
    float vert = g2aa(abs(fx - 0.5), 0.10, f * 3.0) * step(0.22, v) * step(v, 0.42 + 0.42 * hh) * step(0.3, hh);
    float dot1 = g2aa(length(vec2(fx - 0.5, (v - 0.25 - 0.5 * hh) * 3.0)), 0.16, f * 3.0) * step(hh, 0.45);
    float m = max(max(stroke, vert), dot1) * step(0.16, v) * step(v, 0.84);
    c = mix(c1, c2, mix(0.3, m, fade));
    float border = max(g2aa(abs(v - 0.06), 0.035, f), g2aa(abs(v - 0.94), 0.035, f));
    c = mix(c, G2_TURQ, border); rough = 0.4;
  }
  else if (pat == 4) {
    float fill = vG2Aux.x; int ok = int(vG2Aux.y + 0.5); float sp = vG2Aux.z; float rep = vG2Aux.w;
    vec2 p = uv; float cid = 0.0;
    if (rep > 0.0) { cid = floor(p.x / rep + 0.5); p.x -= cid * rep; }
    float D = g2ArchD(p, p1, sp, p2);
    if (p.y < 0.0) D = -1.0;
    float aaD = smoothstep(-fw, fw, D);
    vec3 wall = c1;
    if (ok == 1 || ok == 2) wall = g2Brick(uv, c1, vec2(0.56, 0.16), 0.01, fw);
    else if (ok == 3 || ok == 4) wall = g2Brick(uv, c1, vec2(2.2, 1.1), 0.012, fw);
    float wr = 0.85;
    if ((ok == 2 || ok == 4) && abs(p.x) < p1 * 1.02 && p.y > sp - 0.04 * p1 && p.y < p2 + 0.14 * p1) {
      wall = g2Girih(p + vec2(0.0, -p2), clamp(p1 * 0.22, 0.4, 1.3), G2_COB, G2_TURQ, fw);
      float bx = min(p1 * 1.02 - abs(p.x), min(p.y - (sp - 0.04 * p1), p2 + 0.14 * p1 - p.y));
      wall = mix(wall, G2_WHITE, g2aa(bx, 0.03 * p1 + 0.02, fw));
      wall = mix(wall, G2_TURQ, g2aa(abs(D + 0.07 * p1), 0.05 * p1, fw));
      wr = 0.4;
    }
    vec3 inC = c2; float ir = 0.85;
    float edge = smoothstep(0.0, 0.16 * p1, D);
    int fk = int(fill + 0.5);
    if (fk == 0) {
      float s = clamp(p1 * 0.2, 0.28, 0.7); vec2 q = p / s; q.x += 0.5 * mod(floor(q.y), 2.0);
      vec2 f = fract(q) - 0.5; float fa = g2fade(fw, s * 0.6);
      float hole = mix(0.4, g2aa(length(f), 0.31, fw / s), fa);
      inC = mix(c2, G2_DARK, hole * 0.9); lit = hole * 0.55 * step(0.35, g2h(vec2(cid, sp * 3.7)));
      inC = mix(c2 * 0.8, inC, edge); lit *= edge; ir = 0.5;
    } else if (fk == 1) {
      float nx = max(1.0, floor(2.0 * p1 / 1.3 + 0.5)); float cw = 2.0 * p1 / nx;
      float mx = abs(fract(p.x / cw + 0.5) - 0.5) * cw; float my = abs(fract(p.y / 1.5 + 0.5) - 0.5) * 1.5;
      float mull = max(g2aa(mx, 0.05, fw), g2aa(my, 0.05, fw)) * g2fade(fw, 0.5);
      vec3 gl = mix(vec3(0.03, 0.045, 0.06), vec3(0.16, 0.24, 0.32), clamp(p.y / max(p2, 0.1), 0.0, 1.0));
      float on = step(0.3, g2h(vec2(cid * 1.3 + 0.7, floor(sp * 5.0 + p2 * 3.0))));
      inC = mix(gl, c2, mull); lit = (1.0 - mull) * on * 0.8;
      float fr = 1.0 - smoothstep(0.03 * p1, 0.09 * p1 + fw, D);
      inC = mix(inC, c2, fr); lit *= 1.0 - fr; ir = 0.25;
    } else if (fk == 2) {
      float leaf = abs(p.x); float gr = g2n(vec2(p.x * 9.0, p.y * 0.8));
      inC = c2 * (0.82 + 0.3 * gr);
      float py = abs(fract(p.y / (p1 * 0.9)) - 0.5) * p1 * 0.9; float px = abs(abs(p.x) - p1 * 0.5);
      float pan = max(g2aa(abs(py - p1 * 0.33), 0.04, fw), g2aa(abs(px - p1 * 0.33), 0.04, fw));
      inC *= 1.0 - 0.35 * pan * g2fade(fw, 0.4);
      inC *= 1.0 - 0.5 * g2aa(leaf, 0.03, fw);
      if (p.y > sp) { inC = mix(G2_DARK, c2 * 1.2, 0.5 * g2fade(fw, 0.3) * step(0.5, fract((p.x + p.y) * 2.5)) + 0.25); }
      inC = mix(c2 * 0.5, inC, edge);
    } else if (fk == 3) {
      inC = g2Girih(p, max(0.5, p1 * 0.5), G2_COB, G2_TURQ, fw); inC = mix(G2_WHITE, inC, smoothstep(0.02 * p1, 0.07 * p1 + fw, D)); ir = 0.4;
    } else if (fk == 4) {
      inC = mix(G2_DARK * 2.0, c2, 0.08); lit = 0.25;
    } else if (fk == 6) {
      inC = g2Muq(p, max(0.6, p1 * 0.22), fw); ir = 0.4;
    } else {
      inC = c2 * mix(0.72, 1.0, edge);
    }
    c = mix(wall, inC, aaD); rough = mix(wr, ir, aaD); lit *= aaD;
  }
  else if (pat == 5) {
    float u = uv.x; float v = uv.y;
    float r = abs(fract(u) - 0.5) * 2.0;
    float fwu = fwv.x;
    float rib = mix(1.0, mix(0.72, 1.1, smoothstep(0.0, 1.0, 1.0 - r)), p1 * (1.0 - smoothstep(0.3, 0.9, fwu)));
    float til = (g2h(floor(vec2(u * 5.0, v * 46.0))) - 0.5) * 0.14 * (1.0 - smoothstep(0.02, 0.06, fwv.y * 46.0 * 0.02));
    c = mix(c1, c2, 0.35 * g2n(vec2(u * 2.0, v * 9.0))) * (rib + til);
    if (p2 > 0.0 && v < p2) {
      vec2 q = vec2(u * 2.0, v / p2);
      float d = abs(fract(q.x) - 0.5) + abs(q.y - 0.5);
      vec3 b = mix(G2_ULTRA, G2_WHITE, g2aa(abs(d - 0.32), 0.07, fwu * 2.0 + 0.02));
      b = mix(b, G2_TURQ, g2aa(d, 0.13, fwu * 2.0 + 0.02));
      float bd = min(q.y, 1.0 - q.y);
      c = mix(b, G2_WHITE, g2aa(bd, 0.08, 0.03));
    }
    rough = 0.32;
  }
  else if (pat == 6) {
    vec2 q = uv / p1; vec2 id = floor(q); vec2 f = fract(q); float fade = g2fade(fw, p1);
    float jn = max(g2aa(min(f.x, 1.0 - f.x) * p1, 0.02, fw), g2aa(min(f.y, 1.0 - f.y) * p1, 0.02, fw)) * fade;
    vec2 big = floor(uv / (p1 * 4.0));
    float sel = step(0.72, g2h(big + 3.1));
    c = mix(c1, c2, sel * 0.55) * (0.95 + 0.1 * g2h(id) * fade) * (1.0 - 0.2 * jn);
    rough = 0.9;
  }
  else if (pat == 7) {
    vec2 q = uv / vec2(p1, p2); vec2 f = abs(fract(q + 0.5) - 0.5) * vec2(p1, p2); vec2 id = floor(q + 0.5);
    float mull = max(g2aa(f.x, 0.07, fw), g2aa(f.y, 0.07, fw)) * g2fade(fw, min(p1, p2) * 0.6);
    vec3 gl = c1 * (0.6 + 0.5 * g2n(uv * 0.21 + 4.0));
    float on = step(0.45, g2h(floor(id / vec2(2.0, 1.0)) + 9.0));
    c = mix(gl, c2, mull); lit = (1.0 - mull) * on * 0.7; rough = mix(0.18, 0.7, mull);
  }
  else if (pat == 8) {
    float x = fract(uv.x) - 0.5; float v = uv.y; float ax = abs(x);
    float fx = fwv.x; float fv = fwv.y;
    float mos = (g2h(floor(vec2(uv.x * 14.0, v * 80.0))) - 0.5) * 0.16 * (1.0 - smoothstep(0.2, 0.6, fx * 14.0));
    vec3 pale = c2;
    c = c1 * (1.0 + mos + 0.12 * g2n(vec2(uv.x * 1.7, v * 6.0)) - 0.06);
    float yb = 0.215 - 0.055 * cos(x * 6.28318) + 0.012 * cos(x * 25.13);
    float band = smoothstep(-fv, fv, yb - v);
    vec3 lower = mix(pale * (1.0 + mos), G2_COB * (1.0 + mos), smoothstep(-fv, fv, (yb - 0.065) - v));
    float curl = g2aa(length(vec2((ax - 0.27) * 1.0, (v - 0.215) * 5.0)), 0.085, fx + 0.004);
    lower = mix(lower, c1, curl * step(v, yb));
    c = mix(c, lower, band);
    float dr = length(vec2(x / 0.085, (v - 0.335) / 0.03));
    c = mix(c, pale, g2aa(dr, 1.6, fx * 11.0 + 0.02));
    c = mix(c, c1 * 0.92, g2aa(dr, 1.2, fx * 11.0 + 0.02));
    c = mix(c, G2_COB, g2aa(dr, 0.7, fx * 11.0 + 0.02));
    float sw = 0.05 * smoothstep(0.44, 0.52, v) * (1.0 - 0.6 * smoothstep(0.6, 0.96, v));
    float inS = step(0.44, v) * step(v, 0.965);
    c = mix(c, pale, g2aa(ax, sw + 0.028, fx) * inS);
    c = mix(c, G2_COB * 1.15, g2aa(ax, sw, fx) * inS);
    float rb = g2aa(0.5 - ax, 0.03, fx) * step(0.2, v);
    c = mix(c, vec3(0.62, 0.56, 0.38), rb);
    c = mix(c, vec3(0.045, 0.2, 0.27), step(0.985, v));
    rough = 0.38;
  }
  else if (pat == 9) {
    float a = uv.x + uv.y * p1; float b = uv.x - uv.y * p1;
    vec2 f = fract(vec2(a, b)); float fade = 1.0 - smoothstep(0.25, 0.7, max(fwv.x, fwv.y) * 1.4);
    float sh = mix(0.86, mix(0.62, 1.18, f.x * (1.0 - f.y)), fade);
    float ln = max(g2aa(min(f.x, 1.0 - f.x), 0.04, fw), g2aa(min(f.y, 1.0 - f.y), 0.04, fw)) * fade;
    c = c1 * sh * (1.0 - 0.3 * ln); rough = 0.42;
  }
  else if (pat == 10) {
    vec3 br = g2Brick(uv, c1, vec2(0.56, 0.16), 0.01, fw);
    float a = (uv.x + uv.y) / p1; float b = (uv.x - uv.y) / p1; float f = fw / p1;
    float fa = abs(fract(a) - 0.5); float fb = abs(fract(b) - 0.5); float fade = g2fade(fw, p1 * 0.4);
    float ln = max(g2aa(0.5 - fa, 0.055, f), g2aa(0.5 - fb, 0.055, f));
    float dash = step(0.5, fract((uv.x + uv.y * 0.37) * 3.0 / p1 * 4.0));
    vec3 lc = mix(G2_COB, G2_TURQ, dash);
    float cen = max(fa, fb);
    vec3 cc = mix(G2_ULTRA, G2_WHITE, g2aa(abs(cen - 0.07), 0.025, f));
    c = mix(br, lc, ln * 0.9);
    c = mix(c, cc, g2aa(cen, 0.14, f));
        c = mix(c, G2_TURQ, g2aa(abs(max(fa, fb) - 0.3), 0.022, f) * 0.8);
    c = mix(mix(c1, G2_TURQ, 0.3), c, fade); rough = 0.6;
  }
  else if (pat == 11) { c = g2Brick(uv, c1, vec2(p1 * 2.0, p1), 0.012, fw); rough = 0.7; }
  else if (pat == 12) {
    c = c1 * (0.8 + 0.4 * g2n(uv * 0.9)) * (0.92 + 0.16 * g2n(uv * 7.0));
    if (p1 > 0.0) {
      vec2 q = uv / p1; vec2 id = floor(q); vec2 f = fract(q) - 0.5; float hh = g2h(id);
      float fl = g2aa(length(f + (vec2(g2h(id + 1.0), g2h(id + 2.0)) - 0.5) * 0.4), 0.28, fw / p1) * g2fade(fw, p1 * 0.5);
      vec3 fc = hh < 0.5 ? c2 : (hh < 0.8 ? vec3(0.9, 0.85, 0.75) : vec3(0.75, 0.12, 0.2));
      c = mix(mix(c, mix(c, c2, 0.12), 1.0 - g2fade(fw, p1 * 0.5)), fc, fl);
    }
    rough = 0.95;
  }
  else if (pat == 13) {
    float gr = g2n(vec2(uv.x * 14.0, uv.y * 1.2));
    c = c1 * (0.85 + 0.3 * gr);
    if (p1 > 0.0) { vec2 f = abs(fract(uv / p1) - 0.5); float g = max(g2aa(abs(f.x - 0.36), 0.03, fw / p1), g2aa(abs(f.y - 0.36), 0.03, fw / p1)); c *= 1.0 - 0.4 * g * g2fade(fw, p1 * 0.5); }
    rough = 0.7;
  }
  else if (pat == 14) {
    vec3 br = g2Brick(uv, c1, vec2(0.56, 0.16), 0.01, fw);
    float t = uv.y / p1; float d = abs(uv.x / p1) + abs(fract(t) - 0.5); float f = fw / p1;
    float ring = floor(d * 9.0); float m = mod(ring, 4.0);
    vec3 rc = m < 0.5 ? G2_COB : (m < 1.5 ? G2_WHITE : (m < 2.5 ? G2_TURQ : c2));
    rc = mix(mix(G2_COB, G2_TURQ, 0.5), rc, g2fade(fw, p1 * 0.11));
    c = mix(br, rc, g2aa(d, 0.5, f));
    c = mix(c, G2_ULTRA, g2aa(abs(abs(uv.x / p1) - 0.5), 0.035, f));
    rough = 0.5;
  }
  else if (pat == 15) {
    c = c1 * (0.8 + 0.4 * g2n(uv * 0.8)); rough = 0.08;
  }
  else if (pat == 16) { c = g2Muq(uv, p1, fw); rough = 0.4; }
  else if (pat == 17) {
    float f = fract(uv.y / p1);
    c = mix(c1, c2, step(p2, f) * g2fade(fw, p1) + (1.0 - g2fade(fw, p1)) * (1.0 - p2));
  }
  col = c;
  vec3 warm = vec3(1.0, 0.74, 0.42);
  emis = (c * glow * 0.9 * vec3(1.0, 0.9, 0.74) + warm * lit * 1.3) * uG2Night;
}
`

let material: THREE.MeshStandardMaterial | null = null

/** The single shared material of the g2 landmarks. */
export function g2Material(): THREE.MeshStandardMaterial {
  if (material) return material
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uG2Night = g2Night
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', `attribute vec3 aCol; attribute vec3 aCol2; attribute vec4 aPat; attribute vec4 aAux;
varying vec3 vG2Col; varying vec3 vG2Col2; varying vec4 vG2Pat; varying vec4 vG2Aux; varying vec2 vG2Uv;
void main() {
  vG2Col = aCol; vG2Col2 = aCol2; vG2Pat = aPat; vG2Aux = aAux; vG2Uv = uv;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', FRAG_DEFS + '\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 g2Emis; float g2Rough; g2Shade(diffuseColor.rgb, g2Emis, g2Rough);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = g2Rough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += g2Emis;`)
  }
  m.customProgramCacheKey = () => 'g2-ornament-v1'
  m.name = 'g2-ornament'
  material = m
  return m
}

/** Reads the night factor from the running engine, or from ?t= on the preview page. */
export function syncNight() {
  const w = globalThis as unknown as { __tk?: { env?: { shared?: { uNight?: { value: number } } } }; location?: Location }
  const v = w.__tk?.env?.shared?.uNight?.value
  if (typeof v === 'number') { g2Night.value = v; return }
  if (w.location && w.location.pathname.includes('landmark-preview')) {
    const t = Number(new URLSearchParams(w.location.search).get('t') ?? 15)
    g2Night.value = t < 6 || t > 19.5 ? 1 : 0
  }
}
