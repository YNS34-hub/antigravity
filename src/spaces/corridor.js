import * as THREE from 'three';
import { stoneMat, floorMat, emitMat, glassMat, U } from '../engine/materials.js';
import { L_OPAQUE, L_GLASS, L_FLOOR } from '../engine/pipeline.js';

export class InfiniteCorridor {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.legLength = 32.0;
    this.corridorWidth = 3.2;
    this.height = 9.0;

    // 3 active legs arranged in continuous non-Euclidean loop
    this.legs = [];
    this.currentLegIndex = 0;
    this.turnsCompleted = 0;

    // Hanging memory pane slot in corridor
    this.memoryPane = null;

    this.build();
  }

  build() {
    const L = this.legLength;
    const W = this.corridorWidth;
    const H = this.height;

    // Build 3 corridor leg groups
    for (let i = 0; i < 3; i++) {
      const legGroup = new THREE.Group();
      this.buildLegGeometry(legGroup, i, L, W, H);
      this.legs.push(legGroup);
      this.root.add(legGroup);
    }

    // Set initial leg transforms (Leg 0 starts from Atrium entrance at [-14, 0, -45], pointing along +X)
    this.setupLegTransforms();
  }

  buildLegGeometry(group, index, L, W, H) {
    const mFloor = floorMat({ albedo: [0.79, 0.80, 0.81], polish: 0.92, pattern: 1 });
    const mStone = stoneMat({ albedo: [0.83, 0.82, 0.80], joint: 1.0 });

    // 1. Floor (L x W)
    const floorGeo = new THREE.PlaneGeometry(L, W);
    const floor = new THREE.Mesh(floorGeo, mFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(L / 2, 0, 0);
    floor.layers.set(L_FLOOR);
    group.add(floor);

    // 2. Ceiling
    const ceil = new THREE.Mesh(floorGeo, mStone);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(L / 2, H, 0);
    ceil.layers.set(L_OPAQUE);
    group.add(ceil);

    // 3. Slit Wall (Left or Right depending on state)
    // Slabs with thin vertical slots letting shafts of light in
    const slotCount = Math.floor(L / 3.0);
    const postGeo = new THREE.BoxGeometry(2.78, H, 0.5);
    for (let s = 0; s < slotCount; s++) {
      const post = new THREE.Mesh(postGeo, mStone);
      post.position.set(s * 3.0 + 1.5, H / 2, -W / 2 - 0.25);
      post.layers.set(L_OPAQUE);
      group.add(post);
    }

    // Luminous sky behind slit wall
    const skyBackGeo = new THREE.PlaneGeometry(L + 6, H + 4);
    const mSky = emitMat({ a: [0.90, 0.94, 1.0], b: [0.78, 0.88, 1.02], intensity: 3.8, y0: 0, y1: H });
    const skyBack = new THREE.Mesh(skyBackGeo, mSky);
    skyBack.position.set(L / 2, H / 2, -W / 2 - 2.5);
    skyBack.layers.set(L_OPAQUE);
    group.add(skyBack);

    // 4. Solid Wall (Opposite side)
    const solidGeo = new THREE.PlaneGeometry(L, H);
    const solidWall = new THREE.Mesh(solidGeo, mStone);
    solidWall.position.set(L / 2, H / 2, W / 2);
    solidWall.layers.set(L_OPAQUE);
    group.add(solidWall);

    // 5. Corner Turn Marker / Threshold at L
    const cornerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, W + 1), mStone);
    cornerFrame.position.set(L, H / 2, 0);
    cornerFrame.layers.set(L_OPAQUE);
    group.add(cornerFrame);
  }

  setupLegTransforms() {
    // Leg 0: starts at [-14, 0, -45], extends along -X (into corridor)
    // Leg 1: turns right at end of Leg 0
    // Leg 2: turns right again
    const start = new THREE.Vector3(-14.0, 0.0, -45.0);

    const legPos = [
      new THREE.Vector3(start.x, 0, start.z),
      new THREE.Vector3(start.x - this.legLength, 0, start.z),
      new THREE.Vector3(start.x - this.legLength, 0, start.z + this.legLength),
    ];

    const legRot = [
      -Math.PI,           // heading -X
      -Math.PI * 0.5,     // heading +Z (right turn)
      0,                  // heading +X (right turn again)
    ];

    for (let i = 0; i < 3; i++) {
      const leg = this.legs[i];
      leg.position.copy(legPos[i]);
      leg.rotation.y = legRot[i];
      leg.updateMatrixWorld(true);

      // Pass inverse world matrix to GLSL uLeg[i]
      U.uLeg.value[i].copy(leg.matrixWorld).invert();
      // uLegState: x = sunSide (+1 or -1), y = tint (0..1), z = doorway (0 or 1)
      U.uLegState.value[i].set(i % 2 === 0 ? 1 : -1, i * 0.35, 0, 0);
    }
  }

  // Update topology when player traverses through turns
  updateTopology(camPos) {
    // Check if player crossed into next leg
    // As player turns right, recycle the furthest leg behind them into the upcoming forward path
    for (let i = 0; i < 3; i++) {
      const lp = camPos.clone().applyMatrix4(U.uLeg.value[i]);
      if (lp.x > 0 && lp.x < this.legLength && Math.abs(lp.z) < this.corridorWidth / 2) {
        if (this.currentLegIndex !== i) {
          this.currentLegIndex = i;
          this.turnsCompleted++;
          this.onTurnAdvancement();
        }
        break;
      }
    }
  }

  onTurnAdvancement() {
    // After 2 turns, introduce memory #0 into the upcoming leg
    const nextIdx = (this.currentLegIndex + 1) % 3;
    const legState = U.uLegState.value[nextIdx];

    // Alter details: switch sun direction, increase tint
    legState.x = -legState.x;
    legState.y = Math.min(1.0, this.turnsCompleted * 0.25);

    if (this.turnsCompleted >= 3) {
      // Light doorway manifests ahead leading out into Atrium
      legState.z = 1.0;
    }
  }

  // Attach a captured memory pane to float in the corridor
  setHangingMemory(texture) {
    if (this.memoryPane) {
      this.root.remove(this.memoryPane);
    }
    const mMem = glassMat({ half: [1.8, 1.0, 0.05], refract: 0.02 });
    mMem.uniforms.uMemory.value = texture;
    mMem.uniforms.uMemoryOn.value = 1.0;

    const paneGeo = new THREE.BoxGeometry(3.6, 2.0, 0.1);
    this.memoryPane = new THREE.Mesh(paneGeo, mMem);
    // Position 16m down Leg 1, hovering 0.35m
    this.memoryPane.position.set(16.0, 1.35, 0);
    this.memoryPane.layers.set(L_GLASS);
    this.legs[1].add(this.memoryPane);
  }
}
