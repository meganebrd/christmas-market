import * as THREE from 'three';

/**
 * Secondary motion: a damped spring "tip" particle hanging from a bone pivot (pompoms, scarf tails,
 * ponytails, capes). The bone is rotated so its rest direction points at the simulated tip.
 */
const _pivot = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _rest = new THREE.Vector3();
const _target = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Vector3();

export interface SpringOpts {
  /** Rest direction in the parent's local space (normalised). */
  dir: THREE.Vector3;
  length: number;
  stiffness: number;
  damping: number;
  gravity: number;
  /** Max deviation from rest (radians). */
  maxAngle: number;
}

export class Spring {
  private tip = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private init = false;

  constructor(
    private bone: THREE.Object3D,
    private o: SpringOpts,
  ) {}

  reset() {
    this.init = false;
    this.bone.quaternion.identity();
  }

  update(dt: number) {
    const parent = this.bone.parent;
    if (!parent) return;
    this.bone.getWorldPosition(_pivot);
    parent.matrixWorld.decompose(_m, _q, _s);
    _rest.copy(this.o.dir).applyQuaternion(_q);
    _target.copy(_pivot).addScaledVector(_rest, this.o.length);
    if (!this.init) {
      this.tip.copy(_target);
      this.vel.set(0, 0, 0);
      this.init = true;
    }
    const steps = dt > 1 / 50 ? 2 : 1;
    const h = Math.min(dt, 0.05) / steps;
    for (let i = 0; i < steps; i++) {
      _acc.subVectors(_target, this.tip).multiplyScalar(this.o.stiffness).addScaledVector(this.vel, -this.o.damping);
      _acc.y -= this.o.gravity;
      this.vel.addScaledVector(_acc, h);
      this.tip.addScaledVector(this.vel, h);
      // keep the length
      _dir.subVectors(this.tip, _pivot);
      const len = _dir.length() || 1e-5;
      this.tip.copy(_pivot).addScaledVector(_dir, this.o.length / len);
    }
    _dir.subVectors(this.tip, _pivot).normalize();
    _qi.copy(_q).invert();
    _local.copy(_dir).applyQuaternion(_qi);
    const ang = this.o.dir.angleTo(_local);
    this.bone.quaternion.setFromUnitVectors(this.o.dir, _local);
    if (ang > this.o.maxAngle) this.bone.quaternion.slerp(_q.identity(), 1 - this.o.maxAngle / ang);
    this.bone.updateMatrixWorld(true);
  }
}
