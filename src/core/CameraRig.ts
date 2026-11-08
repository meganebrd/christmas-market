import * as THREE from 'three';

/**
 * Cosy third-person camera, slightly from above (like a diorama). Modes:
 *  - follow: smoothly follows a target; the visitor can orbit (drag) and zoom (wheel/pinch) within limits.
 *  - focus:  frames a conversation (over the shoulder, closer, lower).
 *  - shot:   scripted cinematic along a spline (intro fly-over, finale).
 *
 * Yaw convention: the camera looks along (sin yaw, 0, cos yaw). yaw = π → looking north (-Z).
 */
export interface ShotKey {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export interface Shot {
  keys: ShotKey[];
  /** Seconds. */
  duration: number;
  ease?: 'linear' | 'inOut' | 'out' | 'in';
  /** Field of view at the end of the shot (default: unchanged). */
  fov?: number;
}

const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
};

export class CameraRig {
  mode: 'follow' | 'focus' | 'shot' | 'static' = 'follow';
  /** Orbit yaw (follow mode). */
  yaw = Math.PI;
  pitch = 0.62;
  distance = 11.5;
  minDistance = 6;
  maxDistance = 17;
  baseFov = 40;
  /** Extra vertical offset of the look target above the followed object's feet. */
  lookHeight = 1.1;
  /** 0..1 how fast the camera catches up (per frame at 60fps). */
  stiffness = 0.085;

  private target: THREE.Object3D | null = null;
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private look = new THREE.Vector3();
  private velocityLead = new THREE.Vector3();
  private lastTargetPos = new THREE.Vector3();
  private shot: { shot: Shot; t: number; posCurve: THREE.CatmullRomCurve3; lookCurve: THREE.CatmullRomCurve3; resolve: () => void; fov0: number } | null = null;
  private focusData: { a: THREE.Vector3; b: THREE.Vector3 | null } | null = null;
  private shakeT = 0;
  private shakeAmp = 0;
  private snapNext = true;
  /** Soft auto-orientation toward what the visitor approaches (zone, chalet). Set every frame by the core. */
  assist: { yaw: number; strength: number } | null = null;
  private sinceUserOrbit = 999;

  constructor(public camera: THREE.PerspectiveCamera) {
    camera.fov = this.baseFov;
    camera.updateProjectionMatrix();
  }

  get forward(): THREE.Vector2 {
    return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
  }

  /** Visitor-relative movement → world XZ direction. */
  toWorld(moveX: number, moveY: number, out = new THREE.Vector3()): THREE.Vector3 {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // right = (-fz, fx)
    out.set(fx * moveY + -fz * moveX, 0, fz * moveY + fx * moveX);
    return out;
  }

  follow(target: THREE.Object3D, opts: { snap?: boolean; yaw?: number } = {}) {
    this.target = target;
    this.mode = 'follow';
    this.focusData = null;
    if (opts.yaw !== undefined) this.yaw = opts.yaw;
    if (opts.snap) this.snapNext = true;
    this.lastTargetPos.copy(target.position);
  }

  /** Frame a conversation: `a` = who speaks (NPC head), `b` = the player. */
  focus(a: THREE.Vector3, b: THREE.Vector3 | null = null) {
    this.focusData = { a: a.clone(), b: b?.clone() ?? null };
    this.mode = 'focus';
  }

  release() {
    this.focusData = null;
    this.mode = this.target ? 'follow' : 'static';
  }

  /** Instantly place the camera. */
  cut(pos: THREE.Vector3, look: THREE.Vector3) {
    this.mode = 'static';
    this.camera.position.copy(pos);
    this.look.copy(look);
    this.camera.lookAt(look);
  }

  playShot(shot: Shot): Promise<void> {
    this.shot?.resolve();
    return new Promise((resolve) => {
      const keys = shot.keys.length === 1 ? [shot.keys[0], shot.keys[0]] : shot.keys;
      this.shot = {
        shot,
        t: 0,
        posCurve: new THREE.CatmullRomCurve3(keys.map((k) => k.pos.clone()), false, 'centripetal'),
        lookCurve: new THREE.CatmullRomCurve3(keys.map((k) => k.look.clone()), false, 'centripetal'),
        resolve,
        fov0: this.camera.fov,
      };
      this.mode = 'shot';
    });
  }

  /** Abort the current shot (skip). The promise resolves. */
  stopShot() {
    if (!this.shot) return;
    const r = this.shot.resolve;
    this.shot = null;
    r();
  }

  shake(amplitude = 0.15, seconds = 0.4) {
    this.shakeAmp = amplitude;
    this.shakeT = seconds;
  }

  /** Visitor orbit/zoom input (pixels / zoom steps). */
  orbit(dxPixels: number, zoomDelta: number) {
    if (this.mode !== 'follow') return;
    if (dxPixels) this.sinceUserOrbit = 0;
    this.yaw -= dxPixels * 0.006;
    this.distance = THREE.MathUtils.clamp(this.distance + zoomDelta, this.minDistance, this.maxDistance);
  }

  update(dt: number) {
    const cam = this.camera;
    const k = 1 - Math.pow(1 - this.stiffness, dt * 60);

    if (this.mode === 'shot' && this.shot) {
      const s = this.shot;
      s.t += dt / s.shot.duration;
      const t = Math.min(1, s.t);
      const e = ease[s.shot.ease ?? 'inOut'](t);
      cam.position.copy(s.posCurve.getPoint(e));
      this.look.copy(s.lookCurve.getPoint(e));
      if (s.shot.fov) {
        cam.fov = THREE.MathUtils.lerp(s.fov0, s.shot.fov, e);
        cam.updateProjectionMatrix();
      }
      cam.lookAt(this.look);
      if (t >= 1) {
        const r = s.resolve;
        this.shot = null;
        this.mode = 'static';
        r();
      }
    } else if (this.mode === 'follow' && this.target) {
      this.sinceUserOrbit += dt;
      if (this.assist && this.sinceUserOrbit > 6) {
        let d = this.assist.yaw - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-dt * 0.8 * this.assist.strength));
      }
      const tp = this.target.position;
      // small look-ahead in the walking direction
      const vel = new THREE.Vector3().subVectors(tp, this.lastTargetPos).divideScalar(Math.max(dt, 1e-3));
      this.lastTargetPos.copy(tp);
      if (vel.lengthSq() < 400) this.velocityLead.lerp(vel.multiplyScalar(0.35), 1 - Math.pow(0.97, dt * 60));
      this.desiredLook.set(tp.x + this.velocityLead.x, tp.y + this.lookHeight, tp.z + this.velocityLead.z);
      // portrait screens (phones) see a narrow slice of the world: step back, widen a little,
      // and look a bit ahead so the visitor sits in the lower third with the market in front
      const portrait = THREE.MathUtils.clamp((1.25 - cam.aspect) / 0.8, 0, 1);
      this.desiredLook.x += Math.sin(this.yaw) * 2.6 * portrait;
      this.desiredLook.z += Math.cos(this.yaw) * 2.6 * portrait;
      const dist = this.distance * (1 + 0.32 * portrait);
      const horiz = Math.cos(this.pitch) * dist;
      this.desiredPos.set(
        this.desiredLook.x - Math.sin(this.yaw) * horiz,
        this.desiredLook.y + Math.sin(this.pitch) * dist,
        this.desiredLook.z - Math.cos(this.yaw) * horiz,
      );
      if (this.snapNext) {
        cam.position.copy(this.desiredPos);
        this.look.copy(this.desiredLook);
        this.snapNext = false;
      } else {
        cam.position.lerp(this.desiredPos, k);
        this.look.lerp(this.desiredLook, k * 1.4);
      }
      const fovTarget = this.baseFov + 14 * portrait;
      if (Math.abs(cam.fov - fovTarget) > 0.01) {
        cam.fov = THREE.MathUtils.lerp(cam.fov, fovTarget, k);
        cam.updateProjectionMatrix();
      }
      cam.lookAt(this.look);
    } else if (this.mode === 'focus' && this.focusData) {
      const { a, b } = this.focusData;
      const mid = b ? new THREE.Vector3().lerpVectors(b, a, 0.62) : a.clone();
      // over the shoulder of b, looking at a
      let dir = b ? new THREE.Vector3(a.x - b.x, 0, a.z - b.z) : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (dir.lengthSq() < 1e-4) dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.42);
      this.desiredLook.set(mid.x, mid.y - 0.15, mid.z);
      this.desiredPos.set(mid.x - dir.x * 5.2, mid.y + 1.7, mid.z - dir.z * 5.2);
      cam.position.lerp(this.desiredPos, k * 0.9);
      this.look.lerp(this.desiredLook, k * 1.2);
      if (Math.abs(cam.fov - 36) > 0.01) {
        cam.fov = THREE.MathUtils.lerp(cam.fov, 36, k);
        cam.updateProjectionMatrix();
      }
      cam.lookAt(this.look);
    }

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
  }

  /** Current look target (useful for cinematics that start from the current view). */
  get lookTarget(): THREE.Vector3 {
    return this.look.clone();
  }
}
