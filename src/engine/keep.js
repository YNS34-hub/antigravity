import * as THREE from 'three';
import { glassMat, U } from './materials.js';
import { L_GLASS } from './pipeline.js';

export class KeepInteraction {
  constructor(scene, camera, pipeline, corridor) {
    this.scene = scene;
    this.cam = camera;
    this.pipeline = pipeline;
    this.corridor = corridor;

    this.charge = 0; // 0..1
    this.isCharging = false;
    this.stillDuration = 0;
    this.lastCamPos = new THREE.Vector3();
    this.lastCamRot = new THREE.Euler();

    this.flash = 0; // 1 -> 0 decay
    this.keptPanes = [];
    this.memoryCount = 0;

    // UI elements
    this.chargeRing = document.getElementById('charge');
    this.cursorEl = document.getElementById('cursor');

    // Initial silent capture of arrival moment (Memory #0)
    this.arrivalCaptured = false;
    this.arrivalTimer = 1.2;
  }

  update(dt, isMoving, onKeepTriggered) {
    // 1. Decay flash
    if (this.flash > 0.001) {
      this.flash -= dt * 2.8;
      if (this.flash < 0) this.flash = 0;
    }

    // 2. Check stillness
    const posDelta = this.cam.position.distanceTo(this.lastCamPos);
    this.lastCamPos.copy(this.cam.position);

    if (posDelta < 0.005 && !isMoving) {
      this.stillDuration += dt;
      if (this.stillDuration > 2.8) {
        // Begin charging Keep
        this.charge += dt * 0.55;
        this.cursorEl?.classList.add('hold');
        if (this.charge >= 1.0) {
          this.triggerKeep();
          if (onKeepTriggered) onKeepTriggered();
        }
      }
    } else {
      this.stillDuration = 0;
      this.charge = Math.max(0, this.charge - dt * 2.5);
      this.cursorEl?.classList.remove('hold');
    }

    // Update cursor charge SVG dashoffset
    if (this.chargeRing) {
      const offset = 106.8 * (1.0 - this.charge);
      this.chargeRing.style.strokeDashoffset = offset.toFixed(1);
    }

    // Handle initial silent capture for Corridor landmark
    if (!this.arrivalCaptured) {
      this.arrivalTimer -= dt;
      if (this.arrivalTimer <= 0) {
        this.captureArrivalMemory();
        this.arrivalCaptured = true;
      }
    }

    // Check interaction with existing kept panes
    this.checkPaneProximity();
  }

  triggerKeep() {
    this.charge = 0;
    this.flash = 1.0;
    this.memoryCount++;

    // Create target to capture pre-tonemap HDR scene
    const W = 1024, H = 576;
    const captureRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });

    // Request pipeline capture on next render pass
    this.pendingCapture = captureRT;

    // Create 3D floating memory pane
    const aspect = 16 / 9;
    const h = 1.8;
    const w = h * aspect;

    const mGlass = glassMat({ half: [w / 2, h / 2, 0.05], refract: 0.025 });
    mGlass.uniforms.uMemory.value = captureRT.texture;
    mGlass.uniforms.uMemoryOn.value = 1.0;

    const paneGeo = new THREE.BoxGeometry(w, h, 0.1);
    const pane = new THREE.Mesh(paneGeo, mGlass);

    // Place pane 2.8m in front of camera, hovering at y = 0.35m base (memory rule)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion);
    const targetPos = this.cam.position.clone().addScaledVector(fwd, 2.8);
    targetPos.y = 0.35 + h / 2;

    pane.position.copy(targetPos);
    pane.quaternion.copy(this.cam.quaternion);
    pane.layers.set(L_GLASS);

    this.scene.add(pane);
    this.keptPanes.push({
      mesh: pane,
      rt: captureRT,
      camPos: this.cam.position.clone(),
      camYaw: this.cam.rotation.y,
    });
  }

  captureArrivalMemory() {
    const W = 1024, H = 576;
    const arrivalRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });

    this.pendingCapture = arrivalRT;

    // Send arrival memory texture to hang in the Infinite Corridor
    if (this.corridor) {
      this.corridor.setHangingMemory(arrivalRT.texture);
    }
  }

  checkPaneProximity() {
    for (let i = this.keptPanes.length - 1; i >= 0; i--) {
      const p = this.keptPanes[i];
      const dist = this.cam.position.distanceTo(p.mesh.position);
      // If player steps through pane, dissolve and return
      if (dist < 1.1) {
        const mat = p.mesh.material;
        mat.uniforms.uDissolve.value = Math.min(1.0, mat.uniforms.uDissolve.value + 0.05);
      }
    }
  }
}
