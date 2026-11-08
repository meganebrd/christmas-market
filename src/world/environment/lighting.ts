import * as THREE from 'three';
import type { EnvKit } from './kit';
import { MOONLIGHT_DIR, SUN_DIR, type TimeOfDay } from './skyShared';

/**
 * Blue-hour lighting: a cool sky / warm bounce hemisphere, a cool moonlight (the only shadow
 * caster, its shadow box follows the visitor), and a faint warm afterglow from the west.
 */
export function buildLighting(kit: EnvKit, tod: TimeOfDay) {
  const { ctx } = kit;
  const night = tod === 'night';

  const hemi = new THREE.HemisphereLight(night ? '#5d6aa8' : '#8a9ce0', night ? '#3a3046' : '#6a5560', night ? 1.3 : 1.75);
  hemi.name = 'env:hemi';
  ctx.scene.add(hemi);

  const moon = new THREE.DirectionalLight(night ? '#9fb2ff' : '#b4c3ff', night ? 1.05 : 1.25);
  moon.name = 'env:moonlight';
  const SPAN = 26;
  if (kit.shadows) {
    moon.castShadow = true;
    const s = moon.shadow;
    const size = ctx.quality.shadowMapSize || 2048;
    s.mapSize.set(size, size);
    s.camera.left = -SPAN;
    s.camera.right = SPAN;
    s.camera.top = SPAN;
    s.camera.bottom = -SPAN;
    s.camera.near = 1;
    s.camera.far = 160;
    s.bias = -0.0004;
    s.normalBias = 0.04;
    s.radius = 2;
    s.camera.updateProjectionMatrix();
  }
  ctx.scene.add(moon);
  ctx.scene.add(moon.target);

  const fill = new THREE.DirectionalLight(night ? '#8a6f80' : '#ffb98a', night ? 0.12 : 0.32);
  fill.name = 'env:afterglow';
  fill.position.set(SUN_DIR.x * 100, 14, SUN_DIR.y * 100);
  ctx.scene.add(fill);
  ctx.scene.add(fill.target);

  // shadow box follows the visitor (snapped to shadow texels to avoid shimmering)
  const center = new THREE.Vector3();
  const lightRot = new THREE.Matrix4().lookAt(MOONLIGHT_DIR, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  const inv = lightRot.clone().invert();
  const tmp = new THREE.Vector3();
  const texel = (SPAN * 2) / (ctx.quality.shadowMapSize || 2048);
  kit.onUpdate.push(() => {
    const p = ctx.player?.position;
    if (p && ctx.mode !== 'title' && ctx.mode !== 'cinematic') center.copy(p);
    else {
      try {
        center.copy(ctx.cameraRig.lookTarget);
      } catch {
        center.set(0, 0, 0);
      }
      center.y = 0;
    }
    tmp.copy(center).applyMatrix4(inv);
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.y = Math.round(tmp.y / texel) * texel;
    tmp.applyMatrix4(lightRot);
    moon.target.position.copy(tmp);
    moon.position.copy(tmp).addScaledVector(MOONLIGHT_DIR, 80);
  });

  return { hemi, moon, fill };
}
