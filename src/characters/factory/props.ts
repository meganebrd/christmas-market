import * as THREE from 'three';
import type { PropName } from '../anims';
import { GeoBuilder, M, box, cylinder, ellipsoid, fluffy, mul, sphere, torus, tube } from './geo';
import { characterMaterial } from './material';
import { CREAM, GOLD, shade } from './colors';
import { P, type Pose } from '../pose';
import { glowSprite } from '../../world/textures';

/**
 * Small held props. Geometry is cached per prop (shared by every character), drawn with the shared
 * character material. A prop is either aligned with the hand (tools that follow the wrist) or kept in the
 * character's frame ("upright": mugs, poles, telescopes) whatever the hand does.
 */
export interface PropInstance {
  name: PropName;
  object: THREE.Object3D;
  /** Keep the prop in the character frame (not the hand frame). */
  upright: boolean;
  /** Grip offset in the hand bone's local space. */
  grip: THREE.Vector3;
  /** Extra rotation (character frame if upright, hand frame otherwise). */
  rot: THREE.Quaternion;
  update?(pose: Pose, t: number, dt: number): void;
  dispose(): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: (g: GeoBuilder) => void): THREE.BufferGeometry {
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    make(g);
    geo = g.buildStatic();
    geoCache.set(key, geo);
  }
  return geo;
}

function mesh(key: string, make: (g: GeoBuilder) => void): THREE.Mesh {
  const m = new THREE.Mesh(cached(key, make), characterMaterial());
  m.name = 'prop:' + key;
  return m;
}

const q = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const WOODC = '#8a5a3b';
const IRON = '#3a3a44';

export function createProp(name: PropName, handR: number): PropInstance {
  const grip = new THREE.Vector3(0, -handR * 0.75, handR * 0.35);
  const base = (object: THREE.Object3D, upright: boolean, rot = q(), extra: Partial<PropInstance> = {}): PropInstance => ({
    name,
    object,
    upright,
    grip,
    rot,
    dispose() {
      object.traverse((o) => {
        const s = o as THREE.Sprite;
        if (s.isSprite) (s.material as THREE.SpriteMaterial).dispose();
      });
    },
    ...extra,
  });

  switch (name) {
    case 'mug': {
      const m = mesh('mug', (g) => {
        g.add(cylinder(0.042, 0.038, 0.085, 12), { color: '#b8413a', bone: 0, matrix: M(0, 0.04, 0) });
        g.add(cylinder(0.0425, 0.0425, 0.018, 12, true), { color: CREAM, bone: 0, matrix: M(0, 0.05, 0) });
        g.add(cylinder(0.036, 0.036, 0.004, 12), { color: '#5a2a1a', bone: 0, matrix: M(0, 0.076, 0) });
        g.add(torus(0.024, 0.008, 5, 10, Math.PI * 1.3), { color: '#b8413a', bone: 0, matrix: M(0.046, 0.042, 0, 0, 0, -Math.PI * 0.65) });
      });
      const o = new THREE.Group();
      m.position.set(0, -0.03, 0.05);
      o.add(m);
      return base(o, true, q(), {
        update(p) {
          m.rotation.x = -1.1 * p[P.prop0];
        },
      });
    }
    case 'spatula': {
      const s = mesh('spatula', (g) => {
        g.add(cylinder(0.009, 0.009, 0.14, 6), { color: WOODC, bone: 0, matrix: M(0, -0.04, 0) });
        g.add(cylinder(0.004, 0.004, 0.06, 4), { color: '#9aa0a8', bone: 0, matrix: M(0, -0.14, 0) });
        g.add(box(0.075, 0.1, 0.006), { color: '#c9ccd2', bone: 0, matrix: M(0, -0.21, 0.0, 0, 0, 0) });
      });
      const crepe = mesh('crepe', (g) => {
        g.add(cylinder(0.075, 0.075, 0.008, 14), { color: '#e8b46a', bone: 0 });
        g.add(cylinder(0.05, 0.05, 0.009, 12), { color: '#d9963f', bone: 0, matrix: M(0, 0.0006, 0) });
      });
      const o = new THREE.Group();
      o.add(s, crepe);
      return base(o, false, q(0.4, 0, 0), {
        update(p) {
          const f = p[P.prop0];
          const up = f > 0 && f < 1 ? 4 * f * (1 - f) : 0;
          crepe.position.set(0, -0.21 - up * 0.3, 0.012);
          crepe.rotation.set(Math.PI / 2 + f * Math.PI * 2, 0, 0);
        },
      });
    }
    case 'hammer': {
      const m = mesh('hammer', (g) => {
        g.add(cylinder(0.01, 0.011, 0.2, 6), { color: WOODC, bone: 0, matrix: M(0, -0.07, 0) });
        g.add(box(0.03, 0.035, 0.085), { color: IRON, bone: 0, matrix: M(0, -0.17, 0.0) });
      });
      return base(m, false, q(0.0, 0, 0));
    }
    case 'snowball': {
      const m = mesh('snowball', (g) => g.add(fluffy(0.045, 10, 8, 0.12, 9, 1), { color: '#f4f7ff', bone: 0, emit: 0.15 }));
      m.position.set(0, -0.02, 0.03);
      return base(m, false, q(), {
        update(p) {
          m.visible = p[P.prop0] > 0.5;
        },
      });
    }
    case 'ladle': {
      const m = mesh('ladle', (g) => {
        g.add(cylinder(0.009, 0.009, 0.42, 6), { color: WOODC, bone: 0, matrix: M(0, -0.16, 0) });
        g.add(sphere(0.045, 10, 6), { color: '#6b4f3a', bone: 0, matrix: M(0, -0.38, 0.0, 0, 0, 0, 1, 0.55, 1) });
      });
      return base(m, false, q(0.15, 0, 0));
    }
    case 'cloth': {
      const m = mesh('cloth', (g) => {
        const geo = new THREE.BoxGeometry(0.09, 0.12, 0.012, 3, 4, 1);
        geo.deleteAttribute('uv');
        g.add(geo, {
          color: CREAM,
          faceColor: (c) => ((Math.floor((c.x + 0.1) / 0.03) + Math.floor((c.y + 0.2) / 0.03)) % 2 ? new THREE.Color('#b8413a') : new THREE.Color(CREAM)),
          bone: 0,
          matrix: M(0, -0.05, 0.02),
        });
      });
      return base(m, false, q(0.3, 0, 0));
    }
    case 'blowpipe': {
      const m = mesh('blowpipe', (g) => {
        g.add(cylinder(0.008, 0.008, 0.8, 6), { color: '#8a8f99', bone: 0, matrix: M(0, 0, 0.4, Math.PI / 2, 0, 0) });
        g.add(cylinder(0.012, 0.012, 0.12, 6), { color: WOODC, bone: 0, matrix: M(0, 0, 0.05, Math.PI / 2, 0, 0) });
      });
      const bulb = mesh('bulb', (g) => g.add(sphere(0.06, 14, 10), { color: '#ff9a3a', bone: 0, emit: 2.6 }));
      bulb.position.set(0, 0, 0.82);
      const halo = glowSprite('#ffae5a', 0.45, 0.7);
      halo.raycast = () => {};
      halo.position.copy(bulb.position);
      const o = new THREE.Group();
      o.add(m, bulb, halo);
      o.position.set(0, 0.04, 0.02);
      return base(o, true, q(0.06, 0, 0), {
        update(p, t) {
          const blow = p[P.prop0];
          const grow = p[P.prop1];
          bulb.scale.setScalar(0.5 + 0.9 * grow + 0.15 * blow * Math.sin(t * 9));
          (halo.material as THREE.SpriteMaterial).opacity = 0.35 + 0.45 * blow + 0.1 * Math.sin(t * 13);
          halo.scale.setScalar(0.3 + 0.35 * grow);
        },
      });
    }
    case 'accordion': {
      const endL = mesh('accordion-end', (g) => {
        g.add(box(0.035, 0.17, 0.13), { color: '#8b2c2a', bone: 0 });
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(sphere(0.008, 5, 4), { color: CREAM, bone: 0, matrix: M(0.02, -0.04 + i * 0.04, -0.02 + j * 0.04) });
        g.add(box(0.037, 0.02, 0.132), { color: GOLD, bone: 0, emit: 0.1, matrix: M(0, 0.075, 0) });
      });
      const endR = endL.clone();
      endR.scale.x = -1;
      const bellows = mesh('accordion-bellows', (g) => {
        const geo = new THREE.BoxGeometry(0.2, 0.16, 0.12, 8, 1, 1);
        geo.deleteAttribute('uv');
        g.add(geo, { color: CREAM, faceColor: (c) => (Math.floor((c.x + 0.1) / 0.025) % 2 ? new THREE.Color('#2f5d50') : new THREE.Color(CREAM)), bone: 0 });
      });
      const o = new THREE.Group();
      o.add(endL, endR, bellows);
      return base(o, true, q(), {
        update(p) {
          const sq = p[P.prop0];
          const half = 0.07 + 0.075 * sq;
          endL.position.x = half + 0.017;
          endR.position.x = -half - 0.017;
          bellows.scale.x = (half * 2) / 0.2;
        },
      });
    }
    case 'pole': {
      const m = mesh('pole', (g) => {
        g.add(cylinder(0.011, 0.013, 1.55, 6), { color: '#5c3a26', bone: 0, matrix: M(0, 0.42, 0) });
        g.add(sphere(0.02, 6, 5), { color: GOLD, bone: 0, emit: 0.2, matrix: M(0, 1.2, 0) });
        g.add(tube([new THREE.Vector3(0, 1.18, 0), new THREE.Vector3(0, 1.25, 0.06), new THREE.Vector3(0, 1.2, 0.13), new THREE.Vector3(0, 1.13, 0.14)], 0.006, 8, 3), { color: IRON, bone: 0 });
      });
      const lantern = mesh('pole-lantern', (g) => {
        g.add(torus(0.016, 0.004, 4, 8), { color: IRON, bone: 0, matrix: M(0, -0.005, 0) });
        g.add(cylinder(0.035, 0.05, 0.03, 6), { color: IRON, bone: 0, matrix: M(0, -0.03, 0) });
        g.add(cylinder(0.042, 0.042, 0.09, 6), { color: '#ffd89a', bone: 0, emit: 1.1, matrix: M(0, -0.09, 0) });
        g.add(sphere(0.02, 6, 5), { color: '#fff2c9', bone: 0, emit: 2.2, matrix: M(0, -0.09, 0) });
        g.add(cylinder(0.05, 0.04, 0.02, 6), { color: IRON, bone: 0, matrix: M(0, -0.145, 0) });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          g.add(cylinder(0.004, 0.004, 0.09, 3), { color: IRON, bone: 0, matrix: M(Math.sin(a) * 0.043, -0.09, Math.cos(a) * 0.043) });
        }
      });
      const halo = glowSprite('#ffc56b', 0.5, 0.5);
      halo.raycast = () => {};
      const hang = new THREE.Group();
      hang.position.set(0, 1.13, 0.14);
      lantern.add(halo);
      halo.position.y = -0.09;
      hang.add(lantern);
      const o = new THREE.Group();
      o.add(m, hang);
      o.position.y = -0.02;
      let swing = 0;
      let swingV = 0;
      return base(o, true, q(0.08, 0, 0), {
        update(_p, t, dt) {
          // gentle pendulum
          const target = 0.05 * Math.sin(t * 1.3);
          swingV += ((target - swing) * 28 - swingV * 2.5) * dt;
          swing += swingV * dt;
          hang.rotation.x = swing + 0.04 * Math.sin(t * 2.1);
          hang.rotation.z = 0.05 * Math.sin(t * 1.7);
          (halo.material as THREE.SpriteMaterial).opacity = 0.42 + 0.06 * Math.sin(t * 11) + 0.04 * Math.sin(t * 17.3);
        },
      });
    }
    case 'spyglass': {
      const m = mesh('spyglass', (g) => {
        g.add(cylinder(0.022, 0.026, 0.16, 10), { color: GOLD, bone: 0, emit: 0.12, matrix: M(0, 0, 0.08, Math.PI / 2, 0, 0) });
        g.add(cylinder(0.017, 0.019, 0.12, 10), { color: shade(GOLD, 0.8), bone: 0, matrix: M(0, 0, -0.04, Math.PI / 2, 0, 0) });
        g.add(cylinder(0.027, 0.027, 0.012, 10), { color: '#3a2a22', bone: 0, matrix: M(0, 0, 0.16, Math.PI / 2, 0, 0) });
      });
      m.position.set(-0.02, 0.02, 0.0);
      return base(m, true, q(-0.38, -0.18, 0));
    }
    case 'pan': {
      const m = mesh('pan', (g) => {
        g.add(cylinder(0.009, 0.01, 0.38, 6), { color: WOODC, bone: 0, matrix: M(0, 0, 0.16, Math.PI / 2, 0, 0) });
        g.add(cylinder(0.13, 0.11, 0.035, 14, false), { color: IRON, bone: 0, matrix: M(0, 0, 0.47) });
      });
      const nuts = mesh('chestnuts', (g) => {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const r = i === 0 ? 0 : 0.06;
          g.add(ellipsoid(0.024, 0.018, 0.022, 6, 5), { color: i % 2 ? '#6b3a1e' : '#7c4524', bone: 0, matrix: M(Math.sin(a) * r, 0.025, 0.47 + Math.cos(a) * r, 0, a, 0) });
        }
      });
      const o = new THREE.Group();
      o.add(m, nuts);
      o.position.set(0, 0.02, 0.02);
      return base(o, true, q(-0.1, 0, 0), {
        update(p, t) {
          nuts.position.y = 0.025 * p[P.prop0];
          nuts.rotation.y = 0.2 * Math.sin(t * 7);
        },
      });
    }
  }
}
