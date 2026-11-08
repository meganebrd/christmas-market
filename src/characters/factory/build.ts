import * as THREE from 'three';
import type { CharacterAppearance } from '../../config/types';
import { B, BONE_COUNT, BONE_PARENT, computeDims, type Dims } from './dims';
import { GeoBuilder } from './geo';
import { characterMaterial } from './material';
import { buildBeard, buildFaceAccessories, buildHair, buildHeadAndFace, type FaceInfo, type HeadCtx } from './head';
import { buildHat } from './hats';
import { buildBody } from './body';
import { rng, strSeed } from '../util';

export interface CharacterBuild {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  dims: Dims;
  face: FaceInfo;
  /** Top of the hat/hair (metres). */
  height: number;
  /** Which spring bones carry geometry. */
  springs: { tip: boolean; tail: boolean; scarf: boolean; cape: boolean };
  /** Rest local positions of every bone (animation offsets are added to these). */
  rest: THREE.Vector3[];
  triangles: number;
}

/** Stable seed from the appearance (two identical appearances → identical character). */
export function appearanceSeed(a: Required<CharacterAppearance>) {
  return strSeed(JSON.stringify(a));
}

export function buildCharacterMesh(a: Required<CharacterAppearance>, detail = 1): CharacterBuild {
  const rand = rng(appearanceSeed(a));
  const d = computeDims(a);
  const g = new GeoBuilder();
  const C = new THREE.Vector3(0, d.neckY + d.headC, 0);
  const R = d.headR;
  const hctx: HeadCtx = { g, a, d, detail, rand, C, R };

  const face = buildHeadAndFace(hctx);
  buildHair(hctx);
  buildBeard(hctx);
  const hat = buildHat(hctx);
  buildFaceAccessories(hctx, face);
  const body = buildBody({ g, a, d, detail, rand });

  const geometry = g.build();
  const triangles = (geometry.index?.count ?? 0) / 3;

  // bones (model-space pivots → local offsets)
  const pivots: THREE.Vector3[] = new Array(BONE_COUNT);
  pivots[B.base] = new THREE.Vector3(0, 0, 0);
  pivots[B.hips] = new THREE.Vector3(0, d.hipY, 0);
  pivots[B.chest] = new THREE.Vector3(0, d.chestY, 0);
  pivots[B.head] = new THREE.Vector3(0, d.neckY, 0);
  pivots[B.eyes] = face.eyes.clone();
  pivots[B.mouth] = face.mouth.clone();
  pivots[B.smile] = face.mouth.clone();
  pivots[B.brows] = face.brows.clone();
  pivots[B.armL] = new THREE.Vector3(d.shoulderX, d.shoulderY, 0);
  pivots[B.armR] = new THREE.Vector3(-d.shoulderX, d.shoulderY, 0);
  pivots[B.handL] = new THREE.Vector3(d.shoulderX, d.shoulderY - d.armLen, 0);
  pivots[B.handR] = new THREE.Vector3(-d.shoulderX, d.shoulderY - d.armLen, 0);
  pivots[B.legL] = new THREE.Vector3(d.legX, d.hipY, 0);
  pivots[B.legR] = new THREE.Vector3(-d.legX, d.hipY, 0);
  pivots[B.tip] = hat.tip ? hat.tip.clone() : new THREE.Vector3(0, C.y + R, 0);
  const tailPivot =
    a.hairStyle === 'ponytail'
      ? new THREE.Vector3(0, C.y + R * (a.hat !== 'none' ? -0.05 : 0.25), C.z - R * 1.02)
      : a.hairStyle === 'braids'
        ? new THREE.Vector3(0, C.y - R * 0.55, C.z - R * 0.1)
        : new THREE.Vector3(0, C.y - R * 0.2, C.z - R * 0.5);
  pivots[B.tail] = tailPivot;
  pivots[B.scarf] = body.scarfPivot ? body.scarfPivot.clone() : new THREE.Vector3(0.05, d.neckY - 0.03, 0.12);
  pivots[B.cape] = body.capePivot ? body.capePivot.clone() : new THREE.Vector3(0, d.shoulderY, -0.05);

  const names = Object.keys(B) as (keyof typeof B)[];
  const bones: THREE.Bone[] = [];
  const rest: THREE.Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const bone = new THREE.Bone();
    bone.name = names.find((n) => B[n] === i) ?? 'bone' + i;
    const parent = BONE_PARENT[i];
    const local = parent >= 0 ? pivots[i].clone().sub(pivots[parent]) : pivots[i].clone();
    bone.position.copy(local);
    rest.push(local.clone());
    bones.push(bone);
    if (parent >= 0) bones[parent].add(bone);
  }

  const mesh = new THREE.SkinnedMesh(geometry, characterMaterial());
  mesh.name = 'character';
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  // generous bounds: the rig jumps, waves and bends (bounds are not recomputed every frame)
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, d.top * 0.55, 0), d.top * 0.85 + 0.25);
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.05, -0.5), new THREE.Vector3(0.5, hat.top + 0.5, 0.5));

  const springs = {
    tip: a.hat === 'bobble' || a.hat === 'beanie' || a.hat === 'beret' || a.hat === 'chef' || a.hat === 'hood',
    tail: a.hairStyle === 'ponytail' || a.hairStyle === 'braids' || a.hairStyle === 'long',
    scarf: !!a.scarf,
    cape: a.outfit === 'cape',
  };
  return { mesh, bones, dims: d, face, height: Math.max(hat.top, d.top + R * 0.12), springs, rest, triangles };
}
