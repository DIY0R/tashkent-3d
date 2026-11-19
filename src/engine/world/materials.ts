import * as THREE from 'three'
import type { SharedUniforms } from '../env/Environment'

export const NOISE = /* glsl */ `
float tHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float rectM(float x, float a, float b, float aa) {
  return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x));
}`

/**
 * Buildings: vertex colors + procedural facades (all from wall coordinates, no textures).
 * Attributes: aB (base y, floor height, style + seed, roof level y), aWall (u along wall, wall length, flags).
 * Styles: 0 mahalla house, 1 soviet panel block, 2 glass tower, 3 commercial, 4 industrial, 5 public (colonnade),
 * 6 religious, 7 brick low-rise, 8 modernist sun-screen grid, 9 modern composite tower.
 * Glass reflects the sky gradient (fresnel, added as emissive) and windows light up at night.
 */
export function createBuildingMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.uNight
    shader.uniforms.uSkyHorizon = shared.uSkyHorizon
    shader.uniforms.uSkyZenith = shared.uSkyZenith
    shader.uniforms.uSunDir = shared.uSunDir
    shader.uniforms.uSunColor = shared.uSunColor
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aB;
attribute vec3 aWall;
flat varying vec4 vB;
flat varying vec2 vWallInfo;
varying float vWallU;
varying vec3 vWPos;
varying vec3 vWN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vB = aB; vWallInfo = aWall.yz; vWallU = aWall.x; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normal;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
flat varying vec4 vB;
flat varying vec2 vWallInfo;
varying float vWallU;
varying vec3 vWPos;
varying vec3 vWN;
vec3 bEmissive = vec3(0.0);
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float kind = floor(vB.z + 0.001);
  float seed = fract(vB.z);
  float s1 = fract(seed * 7.13 + 0.31);
  float s2 = fract(seed * 13.7 + 0.11);
  float s3 = fract(seed * 29.3 + 0.57);
  float wallLen = vWallInfo.x;
  float hAbove = vWPos.y - vB.x;
  // palettes are authored in sRGB
  vec3 baseCol = pow(diffuseColor.rgb, vec3(2.2));
  // large scale weathering, same on walls and roofs
  vec3 wallCol = baseCol * (0.93 + 0.12 * tNoise(vWPos.xz * 0.21 + vWPos.y * 0.33));
  vec3 N = normalize(vWN);
  if (wallLen > 0.001) {
    float wallH = max(vB.w - vB.x, 0.5);
    float nFloors = max(1.0, floor(wallH / vB.y + 0.35));
    float fh = wallH / nFloors;
    float fv = hAbove / fh;
    float fi = floor(fv);
    float fy = fract(fv);
    float inFloors = step(fv, nFloors - 0.001); // 0 in the parapet above the roof level
    float ground = step(fi, 0.5) * step(vB.x, 0.5);
    float shop = ground * step(0.5, vWallInfo.y);

    float bay = 3.2;
    if (kind < 0.5) bay = 4.2;
    else if (kind < 1.5) bay = s1 < 0.5 ? 3.2 : 2.9;
    else if (kind < 2.5) bay = 1.5;
    else if (kind < 3.5) bay = 3.4;
    else if (kind < 4.5) bay = 6.0;
    else if (kind < 5.5) bay = 3.6;
    else if (kind < 6.5) bay = 5.0;
    else if (kind < 7.5) bay = 2.8;
    else if (kind < 8.5) bay = 3.3;
    else bay = 3.0;
    float nb = max(1.0, floor(wallLen / bay + 0.5));
    float cu = vWallU / wallLen * nb;
    float ci = floor(cu);
    float fx = fract(cu);
    float ax = fwidth(cu) * 1.2 + 0.004;
    float ay = fwidth(fv) * 1.2 + 0.004;
    // 0 near, 1 where the pattern would only alias: everything fades into its average
    float fade = clamp(max(ax, ay) * 2.0 - 0.3, 0.0, 1.0);
    float keep = 1.0 - fade;
    float wallId = floor(wallLen * 7.0);
    float h1 = tHash(vec2(ci + seed * 91.7 + wallId, fi + seed * 37.3));
    float h2 = fract(h1 * 57.31);
    float hc = tHash(vec2(ci + wallId, seed * 53.1));
    float allow = step(2.2, wallLen) * inFloors;
    float win = 0.0;
    float cover = 0.3;
    float litFrac = 0.3;
    float tower = 0.0;

    if (kind < 0.5) {
      // mahalla house: plaster, few small framed windows, a painted gate
      float w = rectM(fx, 0.31, 0.69, ax) * rectM(fy, 0.36, 0.76, ay);
      float fr = rectM(fx, 0.27, 0.73, ax) * rectM(fy, 0.32, 0.8, ay);
      float has = step(0.5, h2);
      wallCol = mix(wallCol, vec3(0.84, 0.83, 0.79), (fr - w) * has * 0.75 * keep);
      float gate = ground * step(6.0, wallLen) * step(abs(ci - floor(s1 * nb)), 0.5) * step(0.35, s2);
      float gm = rectM(fx, 0.24, 0.76, ax) * (1.0 - smoothstep(0.8 - ay, 0.8 + ay, fy));
      vec3 gateCol = s3 < 0.4 ? vec3(0.16, 0.36, 0.4) : (s3 < 0.72 ? vec3(0.3, 0.2, 0.14) : vec3(0.26, 0.29, 0.32));
      gateCol *= 0.82 + 0.18 * step(0.5, fract(fx * 9.0));
      wallCol = mix(wallCol, gateCol, gate * gm * (1.0 - fade * 0.5));
      win = w * has * (1.0 - gate);
      cover = 0.075;
      litFrac = 0.42;
      // rain streaks under the roof line
      wallCol *= 1.0 - 0.07 * tNoise(vec2(vWallU * 2.3 + seed * 40.0, 0.5)) * smoothstep(2.4, 0.0, vB.w - vWPos.y);
    } else if (kind < 1.5) {
      // soviet prefab panels: seams, loggias with coloured parapets, balcony bands
      float pat = floor(s2 * 3.0);
      float w = rectM(fx, 0.2, 0.8, ax) * rectM(fy, 0.3, 0.8, ay);
      w *= 1.0 - (1.0 - smoothstep(0.012, 0.012 + ax, abs(fx - 0.5))) * 0.8 * keep;
      float seam = max(1.0 - smoothstep(0.0, 0.025 + ay, fy), 1.0 - smoothstep(0.0, 0.016 + ax, fx));
      wallCol *= 1.0 - 0.14 * seam * keep;
      float logg = pat > 1.5 ? 1.0 : (pat > 0.5 ? step(mod(ci + floor(s1 * 3.0), 3.0), 0.5) : 0.0);
      float lx = rectM(fx, 0.04, 0.96, ax);
      float par = lx * rectM(fy, 0.03, 0.4, ay);
      float rec = lx * rectM(fy, 0.4, 0.9, ay);
      vec3 accent = s3 < 0.33 ? vec3(0.56, 0.66, 0.7) : (s3 < 0.66 ? vec3(0.76, 0.7, 0.57) : vec3(0.7, 0.72, 0.68));
      accent = mix(wallCol * 0.9, accent, 0.5) * (0.92 + 0.1 * step(0.5, h2));
      wallCol = mix(wallCol, accent, par * logg * (1.0 - fade * 0.4));
      wallCol *= 1.0 - 0.2 * rectM(fy, 0.0, 0.035, ay) * logg * lx * keep;
      float glazed = step(0.38, h2);
      wallCol = mix(wallCol, wallCol * 0.42, rec * logg * (1.0 - glazed) * (1.0 - fade * 0.6));
      win = mix(w, rec * glazed, logg);
      cover = mix(0.3, 0.26, logg);
      litFrac = 0.36;
    } else if (kind < 2.5) {
      // curtain wall: mullions, spandrels, composite bands on some towers
      float pane = rectM(fx, 0.03, 0.97, ax) * rectM(fy, 0.025, 0.975, ay);
      float sp = 1.0 - smoothstep(0.24 - ay, 0.24 + ay, fy);
      float band = step(0.55, s2);
      float fin = step(0.7, s1) * step(mod(ci, 2.0), 0.5) * (1.0 - smoothstep(0.06, 0.06 + ax, fx));
      win = mix(pane, 1.0, fade) * (1.0 - sp * band) * (1.0 - fin);
      vec3 metal = s3 < 0.5 ? vec3(0.14, 0.16, 0.18) : vec3(0.72, 0.74, 0.75);
      wallCol = mix(metal, vec3(0.8, 0.81, 0.8), max(sp * band, fin));
      cover = 1.0;
      fade = 0.0;
      keep = 1.0;
      tower = 1.0;
      litFrac = 0.26;
      // offices are lit a few bays at a time
      h1 = tHash(vec2(floor(ci / 4.0) + seed * 91.7 + wallId, fi + seed * 37.3));
      h2 = fract(h1 * 57.31 + ci * 0.37);
      allow = inFloors;
    } else if (kind < 3.5) {
      // commercial: ribbon windows, cassette panels (shopfront on the ground floor below)
      float w = rectM(fx, 0.07, 0.93, ax) * rectM(fy, 0.36, 0.8, ay);
      float cass = step(0.55, s2) * max(1.0 - smoothstep(0.0, 0.02 + ay, fy), 1.0 - smoothstep(0.0, 0.012 + ax, fx));
      wallCol *= 1.0 - 0.1 * cass * keep;
      win = w;
      cover = 0.38;
      litFrac = 0.2;
      shop = ground;
    } else if (kind < 4.5) {
      // industrial: corrugated sheets, strip windows, a large gate
      float rib = 0.5 + 0.5 * sin(vWallU * 10.5);
      wallCol *= 1.0 - 0.08 * rib * (1.0 - clamp(fwidth(vWallU) * 5.0, 0.0, 1.0));
      float gate = ground * step(8.0, wallLen) * step(abs(ci - floor(s1 * nb)), 0.5);
      float gm = rectM(fx, 0.2, 0.8, ax) * (1.0 - smoothstep(0.78 - ay, 0.78 + ay, fy));
      wallCol = mix(wallCol, vec3(0.3, 0.36, 0.42) * (0.85 + 0.15 * step(0.5, fract(fy * 7.0))), gate * gm);
      win = rectM(fx, 0.14, 0.86, ax) * rectM(fy, 0.62, 0.86, ay) * (1.0 - gate);
      cover = 0.17;
      litFrac = 0.08;
    } else if (kind < 5.5) {
      // public building: giant-order pilasters, tall windows in shaded recesses, entablature
      float colm = 1.0 - rectM(fx, 0.15, 0.85, ax);
      float cx = min(fx, 1.0 - fx) / 0.15;
      wallCol *= mix(0.8, 0.88 + 0.14 * cos(clamp(cx, 0.0, 1.0) * 1.5), colm);
      float ent = smoothstep(wallH - 1.0, wallH - 0.94, hAbove);
      wallCol = mix(wallCol, baseCol * 1.03, ent);
      wallCol *= 1.0 - 0.22 * rectM(hAbove, wallH - 1.16, wallH - 1.0, fwidth(hAbove));
      win = rectM(fx, 0.3, 0.7, ax) * rectM(fy, 0.14, 0.86, ay) * (1.0 - ent);
      win *= 1.0 - (1.0 - smoothstep(0.015, 0.015 + ax, abs(fx - 0.5))) * 0.7 * keep;
      cover = 0.28;
      litFrac = 0.14;
    } else if (kind < 6.5) {
      // mosque / madrasah: brick, pointed arch niches with a turquoise frame, tile frieze
      float t = clamp(abs(fx - 0.5) / 0.3, 0.0, 1.0);
      float top = 0.5 + 0.36 * (1.0 - pow(t, 1.6));
      float niche = rectM(fx, 0.2, 0.8, ax) * rectM(fy, 0.1, top, ay);
      float t2 = clamp(abs(fx - 0.5) / 0.36, 0.0, 1.0);
      float top2 = 0.56 + 0.38 * (1.0 - pow(t2, 1.6));
      float frame = rectM(fx, 0.14, 0.86, ax) * rectM(fy, 0.05, top2, ay);
      wallCol = mix(wallCol, vec3(0.13, 0.46, 0.52), (frame - niche) * 0.85 * (1.0 - fade * 0.5));
      wallCol = mix(wallCol, wallCol * 0.62, niche * (1.0 - fade * 0.5));
      float fr = rectM(hAbove, wallH - 1.3, wallH - 0.45, fwidth(hAbove) + 0.01);
      vec3 tile = mix(vec3(0.12, 0.36, 0.56), vec3(0.18, 0.58, 0.62), step(0.5, fract(vWallU * 1.1)));
      wallCol = mix(wallCol, tile, fr * 0.85);
      win = 0.0;
      cover = 0.0;
      litFrac = 0.0;
    } else if (kind < 7.5) {
      // brick: courses near the camera, light frames and floor bands
      wallCol = mix(vec3(dot(wallCol, vec3(0.3, 0.55, 0.15))), wallCol, 0.7); // dusty, not orange
      float w = rectM(fx, 0.25, 0.75, ax) * rectM(fy, 0.3, 0.78, ay);
      float fr = rectM(fx, 0.21, 0.79, ax) * rectM(fy, 0.26, 0.82, ay);
      float bv = hAbove / 0.09;
      float bfade = 1.0 - clamp(fwidth(bv) * 2.5, 0.0, 1.0);
      if (bfade > 0.01) {
        float row = floor(bv);
        float bu = vWallU / 0.26 + 0.5 * mod(row, 2.0);
        float mortar = max(1.0 - smoothstep(0.0, 0.16, fract(bv)), 1.0 - smoothstep(0.0, 0.06, fract(bu)));
        wallCol *= 1.0 - (0.16 * mortar + 0.1 * (tHash(vec2(row, floor(bu))) - 0.5)) * bfade;
      }
      wallCol = mix(wallCol, vec3(0.86, 0.84, 0.78), (fr - w) * 0.8 * keep);
      wallCol *= 1.0 + 0.08 * (1.0 - smoothstep(0.0, 0.05 + ay, fy)) * keep;
      win = w * (1.0 - (1.0 - smoothstep(0.014, 0.014 + ax, abs(fx - 0.5))) * 0.8 * keep);
      cover = 0.24;
      litFrac = 0.34;
    } else if (kind < 8.5) {
      // Tashkent modernism: recessed glazing behind a concrete sun screen (panjara)
      float gp = floor(s2 * 3.0);
      float su = vWallU / (gp < 0.5 ? 0.95 : (gp < 1.5 ? 0.62 : 1.2));
      float sv = fv * (gp < 1.5 ? (gp < 0.5 ? 3.0 : 1.0) : 2.5);
      float gax = fwidth(su) * 1.2 + 0.004;
      float gay = fwidth(sv) * 1.2 + 0.004;
      float lat;
      if (gp < 0.5) lat = 1.0 - rectM(fract(su), 0.15, 0.85, gax) * rectM(fract(sv), 0.15, 0.85, gay);
      else if (gp < 1.5) lat = 1.0 - rectM(fract(su), 0.22, 0.78, gax) * rectM(fract(sv), 0.06, 0.94, gay);
      else {
        vec2 q = abs(fract(vec2(su, sv)) - 0.5);
        lat = 1.0 - smoothstep(0.1, 0.1 + gax + gay, abs(q.x + q.y - 0.5));
      }
      float gfade = clamp(max(gax, gay) * 2.0 - 0.3, 0.0, 1.0);
      lat = mix(lat, 0.52, gfade);
      float lobby = rectM(fx, 0.1, 0.9, ax) * rectM(fy, 0.04, 0.86, ay);
      win = mix(1.0 - lat, lobby, ground);
      // the screen shades itself: darker on the lower edge of every opening
      wallCol *= 1.0 - 0.1 * step(0.5, fract(sv)) * (1.0 - gfade);
      cover = 0.48;
      fade = max(fade * ground, 0.0);
      litFrac = 0.3;
    } else {
      // new composite towers: window strips, graphite accent columns, slab lines
      float wide = step(0.5, hc);
      float w = mix(rectM(fx, 0.3, 0.7, ax) * rectM(fy, 0.24, 0.86, ay), rectM(fx, 0.12, 0.88, ax) * rectM(fy, 0.12, 0.88, ay), wide);
      float accent = step(0.74, fract(hc * 7.7));
      wallCol = mix(wallCol, vec3(0.23, 0.25, 0.28), accent * 0.85);
      wallCol *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.03 + ay, fy)) * keep;
      win = w;
      cover = 0.4;
      litFrac = 0.32;
    }

    vec3 signGlow = vec3(0.0);
    if (shop > 0.5) {
      // shopfront: large glazing and a sign band in muted colours
      float sw = rectM(fx, 0.05, 0.95, ax) * rectM(fy, 0.06, 0.72, ay);
      float sign = rectM(fy, 0.77, 0.97, ay) * rectM(fx, 0.03, 0.97, ax);
      float sh = tHash(vec2(ci + wallId, seed * 71.0 + 3.0));
      vec3 signCol = sh < 0.2 ? vec3(0.1, 0.26, 0.46) : (sh < 0.4 ? vec3(0.13, 0.38, 0.27) : (sh < 0.6 ? vec3(0.8, 0.78, 0.72) : (sh < 0.8 ? vec3(0.48, 0.14, 0.13) : vec3(0.18, 0.18, 0.2))));
      float hasSign = sign * step(0.2, fract(sh * 13.0)) * (1.0 - fade * 0.6);
      wallCol = mix(baseCol * 0.8, signCol, hasSign);
      signGlow = signCol * hasSign * 0.9;
      win = sw;
      cover = 0.6;
      litFrac = 0.8;
      tower = 0.0;
      allow = step(2.2, wallLen);
    }

    float winMask = mix(win, cover, fade) * allow;

    // plinth and base ambient occlusion, soft shade under the roof line, cornice above it
    if (vB.x < 0.5) {
      wallCol *= mix(0.6, 1.0, smoothstep(0.0, 3.0, hAbove));
      wallCol *= mix(0.86, 1.0, smoothstep(0.5, 0.56, hAbove));
    }
    wallCol *= mix(0.86, 1.0, smoothstep(0.0, 0.5, abs(vB.w - vWPos.y)));

    // glass: dark body plus the sky reflected by fresnel; panes are not perfectly flat
    vec3 V = normalize(cameraPosition - vWPos);
    vec3 Ng = normalize(N + vec3(h2 - 0.5, fract(h1 * 31.7) - 0.5, 0.5 - h2) * 0.05);
    vec3 R = reflect(-V, Ng);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(R.y * 1.6, 0.0, 1.0));
    sky = mix(sky, uSkyHorizon * 0.4, smoothstep(0.0, -0.3, R.y));
    float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.0);
    vec3 body = vec3(0.045, 0.06, 0.075);
    if (tower > 0.5) {
      body = baseCol * 0.3;
      fres = 0.3 + 0.7 * fres;
      sky *= mix(vec3(1.0), baseCol * 1.7, 0.45);
    } else {
      fres = 0.1 + 0.9 * fres;
      body = mix(body, vec3(0.42, 0.4, 0.35), step(0.7, h2) * 0.6 * keep); // curtains
    }
    diffuseColor.rgb = mix(wallCol, body, winMask);
    float glint = pow(max(dot(R, uSunDir), 0.0), 120.0) * (1.0 - uNight);
    bEmissive = winMask * (sky * fres * 0.85 + uSunColor * glint * 1.2);

    // lit windows: warm and cool, different brightness, some buildings mostly dark
    float bl = s3 < 0.14 ? 0.3 : 1.0;
    float lit = step(1.0 - litFrac * bl, h1);
    vec3 warm = mix(vec3(1.0, 0.68, 0.34), vec3(1.0, 0.84, 0.6), h2);
    warm = mix(warm, vec3(0.7, 0.83, 1.0), step(0.86, fract(h2 * 9.1)));
    float bright = (0.5 + 0.9 * fract(h1 * 113.0)) * (1.0 - 0.55 * tower);
    warm = mix(warm, vec3(0.8, 0.88, 1.0), tower * 0.7);
    float litMask = mix(win * lit, cover * litFrac * bl * 0.55, fade) * allow;
    bEmissive += (warm * bright * litMask * 2.1 + signGlow) * uNight;
  } else {
    if (N.y > 0.9) {
      // flat roofs: patchy roofing felt
      wallCol *= 0.9 + 0.16 * tNoise(vWPos.xz * 0.9);
    }
    diffuseColor.rgb = wallCol;
  }
  // street light spilling onto the lower walls at night
  bEmissive += diffuseColor.rgb * vec3(1.0, 0.72, 0.42) * (uNight * 0.1 * (1.0 - smoothstep(0.0, 11.0, vWPos.y)) * step(N.y, 0.5));
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += bEmissive;`)
  }
  mat.customProgramCacheKey = () => 'tk-building-v2'
  return mat
}

/**
 * Roads, kerbs, sidewalks, plazas, paths, rail: vertex colors + procedural surface detail.
 * aRoad = (across, along, road half width, surface type + 0.5 * marking flag).
 * Types: 0 plain, 1 kerb, 2 asphalt, 3 sidewalk, 4 plaza, 5 parking, 6 path, 7 rail, 8 crosswalk.
 * Drawn after the opaque scene with depth test but no depth write, in a fixed order.
 */
export function createFlatMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  mat.depthWrite = false
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.uNight
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aRoad;
varying vec4 vRoad;
varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRoad = aRoad; vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying vec4 vRoad;
varying vec3 vWPos;
vec3 roadGlow = vec3(0.0);
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float type = floor(vRoad.w + 0.001);
  float mflag = fract(vRoad.w) * 2.0;
  float hw = vRoad.z;
  float ax = abs(vRoad.x);
  float camD = length(cameraPosition - vWPos);
  float near = 1.0 - smoothstep(25.0, 110.0, camD);
  float n1 = tNoise(vWPos.xz * 0.07);
  float n2 = tNoise(vWPos.xz * 1.9);
  vec3 c = pow(diffuseColor.rgb, vec3(2.2)); // vertex colours are authored in sRGB
  float lampLit = 0.0;
  if (type < 0.5) {
    c *= 0.9 + 0.14 * n1 + 0.08 * (n2 - 0.5) * near;
  } else if (type < 1.5) {
    // kerb stones, 1 m long
    c *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.05, fract(vRoad.y))) * near;
    c *= 0.94 + 0.1 * n1;
    lampLit = 1.0;
  } else if (type < 2.5) {
    // asphalt: repaired patches, grain, lane markings, dark gutter
    c *= 0.84 + 0.22 * n1 + 0.1 * (n2 - 0.5) * near;
    float aa = fwidth(vRoad.x) + 0.001;
    float vis = (1.0 - smoothstep(0.12, 0.5, aa)) * smoothstep(0.55, 0.9, mflag);
    float mark = 0.0;
    float dash = step(0.5, fract(vRoad.y / 8.0));
    if (hw > 4.6) {
      // lanes of about 3.4 m: dashed lines between them, solid lines along the kerbs
      float span = hw * 2.0 - 0.8;
      float lanes = max(2.0, floor(span / 3.4 + 0.5));
      float lp = (vRoad.x + span * 0.5) / span * lanes;
      float dl = abs(fract(lp + 0.5) - 0.5) * span / lanes;
      float inner = step(0.5, lp) * step(lp, lanes - 0.5);
      mark = (1.0 - smoothstep(0.06, 0.06 + aa, dl)) * dash * inner;
      mark = max(mark, 1.0 - smoothstep(0.06, 0.06 + aa, abs(ax - span * 0.5)));
    } else if (hw > 2.6) {
      mark = (1.0 - smoothstep(0.06, 0.06 + aa, ax)) * dash;
    }
    // slightly polished wheel tracks, dark gutter along the kerb
    c *= 1.0 - 0.2 * smoothstep(hw - 1.0, hw - 0.3, ax);
    c = mix(c, vec3(0.6, 0.6, 0.56), mark * vis * 0.85);
    lampLit = 1.0;
  } else if (type < 3.5) {
    // sidewalk: square pavers aligned with the street
    vec2 g = vRoad.xy / 0.6;
    vec2 gf = abs(fract(g) - 0.5);
    float pf = 1.0 - clamp((fwidth(g.x) + fwidth(g.y)) * 2.5, 0.0, 1.0);
    c *= 1.0 - 0.13 * smoothstep(0.44, 0.48, max(gf.x, gf.y)) * pf;
    c *= 0.92 + 0.1 * n1 + 0.07 * (tHash(floor(g)) - 0.5) * pf;
    // shade against the kerb and worn middle
    c *= 1.0 - 0.1 * (1.0 - smoothstep(hw, hw + 0.5, ax));
    lampLit = 1.0;
  } else if (type < 4.5) {
    // plaza: light stone slabs with wider bands
    vec2 g = vWPos.xz / 0.9;
    vec2 gf = abs(fract(g) - 0.5);
    float pf = 1.0 - clamp((fwidth(g.x) + fwidth(g.y)) * 2.5, 0.0, 1.0);
    c *= 1.0 - 0.11 * smoothstep(0.45, 0.485, max(gf.x, gf.y)) * pf;
    c *= 0.94 + 0.08 * n1 + 0.08 * (tHash(floor(g)) - 0.5) * pf;
    vec2 bg = abs(fract(vWPos.xz / 7.2) - 0.5);
    float bandF = 1.0 - clamp(fwidth(vWPos.x / 7.2) * 12.0, 0.0, 1.0);
    c = mix(c, c * vec3(0.84, 0.82, 0.8), smoothstep(0.455, 0.47, max(bg.x, bg.y)) * bandF);
  } else if (type < 5.5) {
    c *= 0.88 + 0.18 * n1 + 0.08 * (n2 - 0.5) * near;
  } else if (type < 6.5) {
    // footpath: small pavers
    vec2 g = vRoad.xy / 0.4;
    vec2 gf = abs(fract(g) - 0.5);
    float pf = 1.0 - clamp((fwidth(g.x) + fwidth(g.y)) * 2.5, 0.0, 1.0);
    c *= 1.0 - 0.1 * smoothstep(0.42, 0.48, max(gf.x, gf.y)) * pf;
    c *= 0.92 + 0.12 * n1;
  } else if (type < 7.5) {
    // rail: ballast, sleepers, two rails
    float pf = 1.0 - clamp(fwidth(vRoad.y) * 3.0, 0.0, 1.0);
    c *= 0.9 + 0.2 * n2 * near;
    c = mix(c, c * 0.62, step(0.6, fract(vRoad.y / 0.62)) * pf * step(ax, 1.15));
    c = mix(c, vec3(0.5, 0.5, 0.52), (1.0 - smoothstep(0.035, 0.07 + fwidth(vRoad.x), abs(ax - 0.72))) * pf);
  } else {
    // crosswalk: stripes along the driving direction
    float aa = fwidth(vRoad.x) + 0.001;
    float vis = 1.0 - smoothstep(0.2, 0.7, aa);
    float s = rectM(fract(vRoad.x / 1.0 + 0.5), 0.25, 0.75, aa);
    float ends = rectM(vRoad.y, 0.15, 3.85, fwidth(vRoad.y) + 0.001);
    c = mix(vec3(0.062, 0.063, 0.068) * (0.84 + 0.22 * n1), c * (0.9 + 0.1 * n2), s * ends * vis * 0.9);
    lampLit = 1.0;
  }
  diffuseColor.rgb = c;
  // night: pools of light under the street lamps (same spacing and sides as the lamp posts)
  if (uNight > 0.01 && lampLit > 0.5 && hw > 2.85) {
    float cell = vRoad.y / 34.0;
    float side = mod(floor(cell), 2.0) * 2.0 - 1.0;
    vec2 dl = vec2((fract(cell) - 0.5) * 34.0, vRoad.x - side * (hw - 1.2));
    float pool = exp(-dot(dl, dl) / 85.0);
    roadGlow = c * vec3(1.0, 0.74, 0.42) * (pool * uNight * (type > 2.5 && type < 3.5 ? 1.0 : 1.6));
  }
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += roadGlow;`)
  }
  mat.customProgramCacheKey = () => 'tk-flat-v2'
  return mat
}

/** Large ground plane: dry earth and patchy grass from world position. */
export function createGroundMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#b3ab92' })
  mat.depthWrite = false
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float d = length(vWPos.xz - cameraPosition.xz);
  float n1 = tNoise(vWPos.xz * 0.012);
  float n2 = tNoise(vWPos.xz * 0.11);
  float near = 1.0 - smoothstep(40.0, 160.0, d);
  float n3 = tNoise(vWPos.xz * 1.7) * near;
  vec3 dry = vec3(0.3, 0.255, 0.18);
  vec3 grassy = vec3(0.13, 0.2, 0.065);
  float g = smoothstep(0.3, 0.72, n1 * 0.6 + n2 * 0.4);
  diffuseColor.rgb = mix(dry, grassy, g);
  diffuseColor.rgb *= 0.88 + 0.16 * n2 + 0.12 * n3;
}`)
  }
  mat.customProgramCacheKey = () => 'tk-ground-v2'
  return mat
}

/** Parks and other green areas from global.json: mown lawn with subtle noise. */
export function createGreenMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  mat.depthWrite = false
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float d = length(vWPos.xz - cameraPosition.xz);
  float near = 1.0 - smoothstep(30.0, 140.0, d);
  float n = tNoise(vWPos.xz * 0.06) * 0.6 + tNoise(vWPos.xz * 0.5) * 0.4;
  float fine = tNoise(vWPos.xz * 3.1) * near;
  diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2));
  diffuseColor.rgb *= 0.84 + 0.24 * n + 0.1 * fine;
  // drier, yellower patches
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.14, 1.04, 0.8), smoothstep(0.55, 0.8, n) * 0.5);
}`)
  }
  mat.customProgramCacheKey = () => 'tk-green-v2'
  return mat
}

/**
 * Ground contact shadows around buildings and lamp glow sprites in one mesh per tile.
 * Premultiplied blending: shadows have alpha and no colour, glows have colour and no alpha.
 * aDecal = (corner x, corner y, strength, type 0 shadow / 1 glow).
 */
export function createDecalMaterial(shared: SharedUniforms): THREE.ShaderMaterial {
  const viewport = new THREE.Vector2(1280, 720)
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewport: { value: viewport } }]),
    vertexShader: /* glsl */ `
#include <common>
attribute vec4 aDecal;
uniform float uNight;
uniform vec2 uViewport;
uniform float fogNear;
uniform float fogFar;
varying vec3 vDecal;
varying float vVis;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  float fogF = 1.0 - smoothstep(fogNear, fogFar, dist);
  if (aDecal.w < 0.5) {
    // contact shadow: fades out with distance
    vDecal = vec3(0.0, 0.0, aDecal.z);
    vVis = fogF * (1.0 - smoothstep(450.0, 800.0, dist));
    gl_Position = projectionMatrix * mv;
  } else {
    vDecal = vec3(aDecal.xy, 1.0);
    vVis = fogF * aDecal.z * uNight;
    mv.z += 0.9;
    gl_Position = projectionMatrix * mv;
    if (uNight < 0.01) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    } else {
      // 1.5 m halo, never smaller than a couple of pixels so the city sparkles from the air
      float px = 1.5 * projectionMatrix[1][1] * uViewport.y * 0.5 / max(gl_Position.w, 0.1);
      float clamped = clamp(px, 2.4, 60.0);
      vVis *= mix(0.6, 1.0, clamp(px / 2.4, 0.0, 1.0));
      gl_Position.xy += aDecal.xy * clamped / (uViewport * 0.5) * gl_Position.w;
    }
  }
}`,
    fragmentShader: /* glsl */ `
#include <common>
varying vec3 vDecal;
varying float vVis;
void main() {
  if (vDecal.z < 0.9) {
    // shadow: vDecal.z is the interpolated darkness
    float a = vDecal.z * vDecal.z * (3.0 - 2.0 * vDecal.z) * vVis;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * 1.35);
    return;
  }
  float d = length(vDecal.xy);
  float g = pow(max(1.0 - d, 0.0), 2.6);
  vec3 col = vec3(1.0, 0.76, 0.44) * (g * vVis * 3.2);
  gl_FragColor = vec4(col, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })
  mat.uniforms.uNight = shared.uNight
  mat.uniforms.uViewport = { value: viewport }
  mat.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(viewport)
  }
  return mat
}

/** Lamp posts: instanced, vertex colors; the lamp head (aEmit = 1) glows at night. */
export function createLampMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.uNight
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aEmit;
varying float vEmit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vEmit = aEmit;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying float vEmit;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * (vEmit * (0.25 + uNight * 5.0));`)
  }
  mat.customProgramCacheKey = () => 'tk-lamp-v1'
  return mat
}

/** Canals and ponds: animated ripples, sky reflection by fresnel, sun glint. */
export function createWaterMaterial(shared: SharedUniforms): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uDaylight;
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
varying vec3 vWPos;
void main() {
  vec2 p = vWPos.xz;
  float e = 0.35;
  // analytic-ish normal from a few travelling waves
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.9 + uTime * 1.3) * 0.5;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 1.7 + uTime * 1.9) * 0.3;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 3.1 + uTime * 2.6) * 0.2;
  float d = length(cameraPosition - vWPos);
  g *= e * (1.0 - smoothstep(60.0, 400.0, d));
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(r.y * 1.4, 0.0, 1.0));
  vec3 deep = vec3(0.05, 0.19, 0.2) * uDaylight;
  vec3 col = mix(deep, sky, 0.16 + 0.7 * fres);
  float spec = pow(max(dot(r, uSunDir), 0.0), 180.0);
  col += uSunColor * spec * 3.0 * (1.0 - uNight);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    fog: true,
    side: THREE.DoubleSide,
  })
  mat.uniforms.uTime = shared.uTime
  mat.uniforms.uDaylight = shared.uDaylight
  mat.uniforms.uNight = shared.uNight
  mat.uniforms.uSunDir = shared.uSunDir
  mat.uniforms.uSunColor = shared.uSunColor
  mat.uniforms.uSkyHorizon = shared.uSkyHorizon
  mat.uniforms.uSkyZenith = shared.uSkyZenith
  mat.depthWrite = false
  return mat
}
