import * as THREE from 'three';
import { U } from './materials.js';

export class ArchitecturalControls {
  constructor(camera, domElement) {
    this.cam = camera;
    this.dom = domElement;

    // Architectural eye level & FOV
    this.eyeHeight = 1.62;
    this.targetPos = new THREE.Vector3(0, this.eyeHeight, 18.0); // start at vestibule entrance
    this.cam.position.copy(this.targetPos);

    this.yaw = 0; // facing -Z (down the monumental Atrium)
    this.targetYaw = 0;
    this.pitch = 0;
    this.targetPitch = 0;
    this.lensShiftY = 0;
    this.targetLensShiftY = 0;

    // Mouse & Parallax
    this.mouseNorm = new THREE.Vector2(0, 0); // -1..1
    this.isDragging = false;
    this.lastMouse = new THREE.Vector2();

    // Movement keys
    this.keys = { w: false, a: false, s: false, d: false };
    this.moveSpeed = 4.2; // m/s
    this.glideTarget = null;

    // Floor picking
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Collision boundaries (per space)
    this.activeSpace = 0; // 0=Atrium, 1=Listening, 2=Corridor

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keys.w = true;
      if (k === 's' || k === 'arrowdown') this.keys.s = true;
      if (k === 'a' || k === 'arrowleft') this.keys.a = true;
      if (k === 'd' || k === 'arrowright') this.keys.d = true;
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keys.w = false;
      if (k === 's' || k === 'arrowdown') this.keys.s = false;
      if (k === 'a' || k === 'arrowleft') this.keys.a = false;
      if (k === 'd' || k === 'arrowright') this.keys.d = false;
    });

    this.dom.addEventListener('pointermove', (e) => {
      const rect = this.dom.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.mouseNorm.set(nx, ny);

      if (this.isDragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.lastMouse.set(e.clientX, e.clientY);

        this.targetYaw -= dx * 0.0028;

        // Architectural lens shift: vertical motion shifts the lens first to preserve parallel vertical lines
        const shiftDelta = dy * 0.0018;
        if (Math.abs(this.targetLensShiftY + shiftDelta) < 0.35) {
          this.targetLensShiftY += shiftDelta;
        } else {
          this.targetPitch += dy * 0.0012;
          this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.4, 0.4);
        }
      }

      // Update cursor floor hit for hairline ring in shader
      this.updateCursorFloorHit();
    });

    this.dom.addEventListener('pointerdown', (e) => {
      if (e.button === 0) { // left click
        this.isDragging = true;
        this.lastMouse.set(e.clientX, e.clientY);
        this.dragStartTime = performance.now();
        this.dragStartPos = new THREE.Vector2(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        const dist = Math.hypot(e.clientX - this.dragStartPos.x, e.clientY - this.dragStartPos.y);
        const elapsed = performance.now() - this.dragStartTime;
        // If click was short and static, treat as click-to-glide
        if (dist < 6 && elapsed < 350) {
          this.onFloorClick();
        }
      }
    });

    this.dom.addEventListener('wheel', (e) => {
      // Smooth drift along camera forward
      const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const delta = Math.sign(e.deltaY) * -1.8;
      this.targetPos.addScaledVector(fwd, delta);
      this.glideTarget = null;
    }, { passive: true });
  }

  updateCursorFloorHit() {
    this.raycaster.setFromCamera(this.mouseNorm, this.cam);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, hitPoint);
    if (hit) {
      U.uCursor.value.set(hitPoint.x, hitPoint.y, hitPoint.z, 1.0);
    } else {
      U.uCursor.value.w = 0.0;
    }
  }

  onFloorClick() {
    this.raycaster.setFromCamera(this.mouseNorm, this.cam);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, hitPoint);
    if (hit) {
      // Set glide target at eye height
      this.glideTarget = new THREE.Vector3(hitPoint.x, this.eyeHeight, hitPoint.z);
    }
  }

  constrainPosition(pos) {
    // Spatial boundary constraints
    if (pos.x > 300.0) {
      // Listening Room (center 400,0,0, radius 13m)
      const dx = pos.x - 400.0;
      const dz = pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 12.8) {
        const k = 12.8 / d;
        pos.x = 400.0 + dx * k;
        pos.z = dz * k;
      }
    } else if (pos.x < -14.5 && pos.z < -20.0) {
      // Corridor
      pos.y = this.eyeHeight;
    } else {
      // Atrium: X in [-12.8, 12.8], Z in [-57.5, 20.0]
      pos.x = THREE.MathUtils.clamp(pos.x, -12.8, 12.8);
      pos.z = THREE.MathUtils.clamp(pos.z, -57.5, 20.0);
      pos.y = this.eyeHeight;
    }
  }

  update(dt) {
    // 1. WASD movement
    const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const moveDir = new THREE.Vector3();
    if (this.keys.w) moveDir.add(fwd);
    if (this.keys.s) moveDir.sub(fwd);
    if (this.keys.d) moveDir.add(right);
    if (this.keys.a) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      this.targetPos.addScaledVector(moveDir, this.moveSpeed * dt);
      this.glideTarget = null;
    }

    // 2. Click-to-glide interpolation
    if (this.glideTarget) {
      const d = this.targetPos.distanceTo(this.glideTarget);
      if (d < 0.1) {
        this.glideTarget = null;
      } else {
        const step = Math.min(d, this.moveSpeed * 1.5 * dt);
        const dir = this.glideTarget.clone().sub(this.targetPos).normalize();
        this.targetPos.addScaledVector(dir, step);
      }
    }

    this.constrainPosition(this.targetPos);

    // 3. Smooth Camera position & rotation damping
    const smooth = 0.12;
    this.cam.position.lerp(this.targetPos, smooth);

    this.yaw += (this.targetYaw - this.yaw) * smooth;
    this.pitch += (this.targetPitch - this.pitch) * smooth;
    this.lensShiftY += (this.targetLensShiftY - this.lensShiftY) * smooth;

    // Apply cursor parallax (±3.5 deg yaw, ±2.5 deg pitch)
    const parallaxYaw = this.mouseNorm.x * 0.055;
    const parallaxPitch = this.mouseNorm.y * 0.035;

    this.cam.rotation.set(0, 0, 0);
    this.cam.rotation.y = this.yaw + parallaxYaw;
    this.cam.rotation.x = this.pitch + parallaxPitch;

    // 4. Architectural Tilt-Shift (keep vertical pillars straight)
    // Modify projection matrix elements to achieve optical vertical shift
    this.cam.updateProjectionMatrix();
    this.cam.projectionMatrix.elements[9] += this.lensShiftY;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
  }
}
