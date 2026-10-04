import * as THREE from 'three';
import { stoneMat, floorMat, emitMat, glassMat, U } from '../engine/materials.js';
import { L_OPAQUE, L_GLASS, L_FLOOR } from '../engine/pipeline.js';

export class ListeningRoom {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.center = new THREE.Vector3(400.0, 0.0, 0.0);
    this.radius = 14.0; // 28m diameter
    this.height = 16.0;

    this.finCount = 96;
    this.finCanvas = document.createElement('canvas');
    this.finCanvas.width = this.finCount;
    this.finCanvas.height = 1;
    this.finCtx = this.finCanvas.getContext('2d');
    this.finTexture = new THREE.CanvasTexture(this.finCanvas);
    this.finTexture.minFilter = THREE.LinearFilter;
    this.finTexture.magFilter = THREE.LinearFilter;
    this.finTexture.wrapS = THREE.RepeatWrapping;
    this.finTexture.wrapT = THREE.ClampToEdgeWrapping;
    U.uFins.value = this.finTexture;

    this.finOpenValues = new Float32Array(this.finCount);
    this.mirrorMesh = null;
    this.grooveRings = null;
    this.portalReturn = null;
    this.wakefulness = 0; // 0 = silent sleep, 1 = awakened by music

    this.build();
  }

  build() {
    const C = this.center;
    const R = this.radius;
    const H = this.height;

    // 1. Concentric Radial Floor
    const floorGeo = new THREE.CircleGeometry(R + 0.5, 64);
    const mFloor = floorMat({ albedo: [0.78, 0.79, 0.81], polish: 0.98, pattern: 2 });
    const floor = new THREE.Mesh(floorGeo, mFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(C.x, 0, C.z);
    floor.layers.set(L_FLOOR);
    this.root.add(floor);

    // 2. Ceiling with Central Oculus (4m diameter)
    const ceilGeo = new THREE.RingGeometry(2.0, R + 0.5, 64, 4);
    const mStone = stoneMat({ albedo: [0.82, 0.81, 0.80], joint: 1.0 });
    const ceil = new THREE.Mesh(ceilGeo, mStone);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(C.x, H, C.z);
    ceil.layers.set(L_OPAQUE);
    this.root.add(ceil);

    // Oculus Skylight
    const oculusGeo = new THREE.CircleGeometry(2.1, 32);
    const mOculus = emitMat({ a: [0.98, 0.99, 1.0], intensity: 4.8, audio: 0.6 });
    const oculus = new THREE.Mesh(oculusGeo, mOculus);
    oculus.rotation.x = Math.PI / 2;
    oculus.position.set(C.x, H + 0.1, C.z);
    oculus.layers.set(L_OPAQUE);
    this.root.add(oculus);

    // 3. Outer Luminous Chamber Shell (visible through the 96 breathing fins)
    const shellGeo = new THREE.CylinderGeometry(R + 2.2, R + 2.2, H, 64, 1, true);
    const mShell = emitMat({
      a: [0.70, 0.84, 1.0],
      b: [0.95, 0.98, 1.0],
      intensity: 3.2,
      y0: 0,
      y1: H,
      audio: 1.2
    });
    const shell = new THREE.Mesh(shellGeo, mShell);
    shell.position.set(C.x, H / 2, C.z);
    shell.layers.set(L_OPAQUE);
    this.root.add(shell);

    // 4. The 96 Architectural Fins (InstancedMesh with aIndex attribute)
    const finW = 0.16;
    const finD = 1.35;
    const finGeo = new THREE.BoxGeometry(finW, H, finD);

    const aIndex = new Float32Array(this.finCount);
    for (let i = 0; i < this.finCount; i++) aIndex[i] = i;
    finGeo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(aIndex, 1));

    const mFin = stoneMat({ albedo: [0.85, 0.84, 0.82], joint: 0.4, fins: true });
    this.finMesh = new THREE.InstancedMesh(finGeo, mFin, this.finCount);
    this.finMesh.layers.set(L_OPAQUE);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.finCount; i++) {
      const angle = (i / this.finCount) * Math.PI * 2;
      const x = C.x + Math.cos(angle) * R;
      const z = C.z + Math.sin(angle) * R;
      dummy.position.set(x, H / 2, z);
      dummy.rotation.set(0, -angle, 0); // initial tangent alignment
      dummy.updateMatrix();
      this.finMesh.setMatrixAt(i, dummy.matrix);
    }
    this.finMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.finMesh);

    // 5. Central Iconic Object: The Acoustic Mirror (8m concave stone parabolic dish)
    // Levitation rule: suspended 0.35m above the polished floor
    this.buildAcousticMirror(C);

    // 6. Return Portal back to the Atrium
    // Hovering glass portal on the north curve
    const mPortalReturn = glassMat({ half: [2.0, 4.0, 0.1], refract: 0.04, portal: false });
    const portalGeo = new THREE.BoxGeometry(4.0, 8.0, 0.2);
    this.portalReturn = new THREE.Mesh(portalGeo, mPortalReturn);
    this.portalReturn.position.set(C.x, 4.35, C.z - R + 1.2);
    this.portalReturn.layers.set(L_GLASS);
    this.root.add(this.portalReturn);
  }

  buildAcousticMirror(center) {
    const mirrorGroup = new THREE.Group();
    mirrorGroup.position.set(center.x, 0.35, center.z);
    mirrorGroup.rotation.x = -0.26; // subtle 15 deg tilt towards entrance

    // Dish Geometry: parabolic shell
    const dishRadius = 4.2; // 8.4m diameter
    const segments = 48;
    const dishGeo = new THREE.CylinderGeometry(dishRadius, 0.4, 0.9, segments, 1, false);
    const mDish = stoneMat({ albedo: [0.88, 0.88, 0.89], joint: 0 });
    const dish = new THREE.Mesh(dishGeo, mDish);
    dish.position.y = 1.8;
    dish.layers.set(L_OPAQUE);
    mirrorGroup.add(dish);

    // Concentric Grooves (Micro-acoustic rings)
    this.grooveRings = new THREE.Group();
    this.rings = [];
    const ringMat = emitMat({ a: [0.88, 0.94, 1.0], intensity: 2.4, audio: 0.8 });
    for (let r = 0.6; r < dishRadius; r += 0.38) {
      const ringGeo = new THREE.RingGeometry(r - 0.015, r + 0.015, 64);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 2.26 - (r * r) * 0.045; // parabolic depth
      ring.layers.set(L_OPAQUE);
      this.grooveRings.add(ring);
      this.rings.push({ mesh: ring, baseRadius: r, phase: r * 2.5 });
    }
    mirrorGroup.add(this.grooveRings);

    // Levitating Central Audio Core (small crystal emitter)
    const coreGeo = new THREE.IcosahedronGeometry(0.32, 2);
    const mCore = emitMat({ a: [0.95, 0.98, 1.0], intensity: 5.0, audio: 1.5 });
    const core = new THREE.Mesh(coreGeo, mCore);
    core.position.set(0, 2.5, 0);
    core.layers.set(L_OPAQUE);
    mirrorGroup.add(core);

    this.mirrorMesh = mirrorGroup;
    this.root.add(mirrorGroup);
  }

  update(dt, time, audioFeatures) {
    // 1. Wakefulness smoothly responds to sound level
    const targetWake = (audioFeatures.level > 0.04 || audioFeatures.low > 0.08) ? 1.0 : 0.25;
    this.wakefulness += (targetWake - this.wakefulness) * dt * 1.5;
    U.uListen.value = this.wakefulness;

    // 2. Update the 96 Fin Openings
    // Sound wave propagates around the circular hall
    const imgData = this.finCtx.createImageData(this.finCount, 1);
    const data = imgData.data;

    for (let i = 0; i < this.finCount; i++) {
      const theta = (i / this.finCount) * Math.PI * 2;
      // Low frequencies cause a global harmonic breathing
      const breath = Math.sin(time * 0.8) * 0.15 + audioFeatures.low * 0.7;
      // Mid frequencies create a rotating wave of light
      const wave = Math.sin(theta * 3.0 - time * 2.4) * audioFeatures.mid * 0.6;
      // High frequencies sparkle individual slits
      const ripple = Math.cos(theta * 8.0 + time * 4.0) * audioFeatures.high * 0.4;

      const rawOpen = THREE.MathUtils.clamp(0.08 + breath + wave + ripple, 0.02, 0.98);
      // Smooth per-fin
      this.finOpenValues[i] += (rawOpen - this.finOpenValues[i]) * 0.25;

      const val = Math.floor(this.finOpenValues[i] * 255);
      const idx = i * 4;
      data[idx] = val;     // R channel read by GLSL
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
    this.finCtx.putImageData(imgData, 0, 0);
    this.finTexture.needsUpdate = true;

    // 3. Acoustic Mirror grooves ripple outward
    if (this.rings) {
      this.rings.forEach(item => {
        const pulse = Math.sin(time * 3.0 - item.phase) * 0.5 + 0.5;
        const scale = 1.0 + pulse * audioFeatures.low * 0.08;
        item.mesh.scale.set(scale, scale, 1);
      });
    }

    if (this.mirrorMesh) {
      // Gentle levitation breathing
      this.mirrorMesh.position.y = 0.35 + Math.sin(time * 0.9) * 0.04 + audioFeatures.low * 0.06;
    }
  }
}
