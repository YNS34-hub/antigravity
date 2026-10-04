import * as THREE from 'three';
import { stoneMat, floorMat, emitMat, glassMat } from '../engine/materials.js';
import { L_OPAQUE, L_GLASS, L_FLOOR } from '../engine/pipeline.js';

export class Atrium {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Exhibits config (Z positions matching GLSL projection offsets)
    this.exhibits = [
      {
        id: 'void-echo',
        z: 2.5,
        title: 'VOID // ECHO',
        sub: 'Experimental spatial web atmosphere and non-linear narrative.',
        link: 'https://yns34-hub.github.io/void-echo/',
        role: 'Creative WebGL & Sound Architecture',
      },
      {
        id: 'giannis',
        z: -7.5,
        title: 'Giannis / Editorial',
        sub: 'Athlete storytelling studied in architectural scale and dynamic typography.',
        link: 'https://yns34-hub.github.io/giannis-fansite/',
        role: 'Responsive Composition Study',
      },
      {
        id: 'waterline',
        z: -17.5,
        title: 'The Waterline · 潮痕',
        sub: 'Interactive science fiction archive: six chapters on receding tides and forgotten relics.',
        link: 'https://github.com/YNS34-hub/sci-fi-portfolio',
        role: 'Narrative System & Worldbuilding',
      },
      {
        id: 'afterglow',
        z: -27.5,
        title: 'Afterglow Protocol · 余光协议',
        sub: 'Mathematical level-sets transformed into a cinematic interactive three-act sequence.',
        link: 'https://github.com/YNS34-hub/sci-fi-portfolio',
        role: 'Orlicz Growth & Visual Mathematics',
      },
    ];

    this.monolith = null;
    this.portalMesh = null;
    this.stairGroup = null;

    this.build();
  }

  build() {
    const AW = 14.0;
    const AH = 32.0;
    const AZ0 = 10.0;
    const AZ1 = -60.0;
    const len = AZ0 - AZ1; // 70m
    const zMid = (AZ0 + AZ1) / 2; // -25m

    const mStone = stoneMat({ albedo: [0.84, 0.82, 0.79], joint: 1.0 });
    const mVestibuleStone = stoneMat({ albedo: [0.72, 0.72, 0.74], joint: 0.8 });
    const mFloor = floorMat({ albedo: [0.81, 0.82, 0.83], polish: 0.95, pattern: 0 });

    // 1. Main Floor
    const floorGeo = new THREE.PlaneGeometry(AW * 2, len);
    const floor = new THREE.Mesh(floorGeo, mFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.layers.set(L_FLOOR);
    this.root.add(floor);

    // 2. Vestibule (Z in [AZ0, AZ0 + 12], Y=4.2m) - compression before release
    const vestFloor = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), mFloor);
    vestFloor.rotation.x = -Math.PI / 2;
    vestFloor.position.set(0, 0, AZ0 + 6);
    vestFloor.layers.set(L_FLOOR);
    this.root.add(vestFloor);

    const vestCeil = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), mVestibuleStone);
    vestCeil.rotation.x = Math.PI / 2;
    vestCeil.position.set(0, 4.2, AZ0 + 6);
    vestCeil.layers.set(L_OPAQUE);
    this.root.add(vestCeil);

    const vestWallL = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), mVestibuleStone);
    vestWallL.rotation.y = Math.PI / 2;
    vestWallL.position.set(-4, 2.1, AZ0 + 6);
    vestWallL.layers.set(L_OPAQUE);
    this.root.add(vestWallL);

    const vestWallR = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), mVestibuleStone);
    vestWallR.rotation.y = -Math.PI / 2;
    vestWallR.position.set(4, 2.1, AZ0 + 6);
    vestWallR.layers.set(L_OPAQUE);
    this.root.add(vestWallR);

    // Vestibule back wall
    const vestBack = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), mVestibuleStone);
    vestBack.position.set(0, 2.1, AZ0 + 12);
    vestBack.rotation.y = Math.PI;
    vestBack.layers.set(L_OPAQUE);
    this.root.add(vestBack);

    // 3. Main Hall Side Walls (Left and Right)
    const wallGeo = new THREE.PlaneGeometry(len, AH);
    const wallL = new THREE.Mesh(wallGeo, mStone);
    wallL.rotation.y = Math.PI / 2;
    wallL.position.set(-AW, AH / 2, zMid);
    wallL.layers.set(L_OPAQUE);
    this.root.add(wallL);

    const wallR = new THREE.Mesh(wallGeo, mStone);
    wallR.rotation.y = -Math.PI / 2;
    wallR.position.set(AW, AH / 2, zMid);
    wallR.layers.set(L_OPAQUE);
    this.root.add(wallR);

    // Entrance portal frame at AZ0
    const entranceFrameL = new THREE.Mesh(new THREE.BoxGeometry(AW - 4, AH, 0.8), mStone);
    entranceFrameL.position.set(-(AW + 4) / 2, AH / 2, AZ0);
    entranceFrameL.layers.set(L_OPAQUE);
    this.root.add(entranceFrameL);

    const entranceFrameR = new THREE.Mesh(new THREE.BoxGeometry(AW - 4, AH, 0.8), mStone);
    entranceFrameR.position.set((AW + 4) / 2, AH / 2, AZ0);
    entranceFrameR.layers.set(L_OPAQUE);
    this.root.add(entranceFrameR);

    const entranceHeader = new THREE.Mesh(new THREE.BoxGeometry(8, AH - 4.2, 0.8), mStone);
    entranceHeader.position.set(0, 4.2 + (AH - 4.2) / 2, AZ0);
    entranceHeader.layers.set(L_OPAQUE);
    this.root.add(entranceHeader);

    // 4. Ceiling with Rhythmic Light Slots
    // Slabs of thickness 1.5m, spaced by 5m, slot width 2.2m
    const slabCount = Math.floor(len / 5);
    const slabGeo = new THREE.BoxGeometry(AW * 2, 1.5, 2.8);
    for (let i = 0; i <= slabCount; i++) {
      const z = AZ0 - i * 5 - 1.4;
      if (z > AZ1) {
        const slab = new THREE.Mesh(slabGeo, mStone);
        slab.position.set(0, AH + 0.75, z);
        slab.layers.set(L_OPAQUE);
        this.root.add(slab);
      }
    }

    // Sky backdrop visible through ceiling slots
    const skyRoofGeo = new THREE.PlaneGeometry(AW * 2, len + 10);
    const mSkyRoof = emitMat({ a: [0.92, 0.96, 1.0], b: [0.82, 0.90, 1.05], intensity: 3.5, y0: AH, y1: AH + 10 });
    const skyRoof = new THREE.Mesh(skyRoofGeo, mSkyRoof);
    skyRoof.rotation.x = Math.PI / 2;
    skyRoof.position.set(0, AH + 5.0, zMid);
    skyRoof.layers.set(L_OPAQUE);
    this.root.add(skyRoof);

    // 5. Deep Architectural Fins (Left and Right bays)
    const finGeo = new THREE.BoxGeometry(1.4, AH, 0.48);
    for (let z = AZ0 - 4; z >= AZ1 + 4; z -= 5) {
      // Left fins
      const finL = new THREE.Mesh(finGeo, mStone);
      finL.position.set(-AW + 0.7, AH / 2, z);
      finL.layers.set(L_OPAQUE);
      this.root.add(finL);

      // Right fins
      const finR = new THREE.Mesh(finGeo, mStone);
      finR.position.set(AW - 0.7, AH / 2, z);
      finR.layers.set(L_OPAQUE);
      this.root.add(finR);
    }

    // 6. Far Monumental Aperture (12m x 22m opening at AZ1)
    const farWallL = new THREE.Mesh(new THREE.BoxGeometry((AW * 2 - 12) / 2, AH, 1.2), mStone);
    farWallL.position.set(-(12 + (AW * 2 - 12) / 2) / 2, AH / 2, AZ1);
    farWallL.layers.set(L_OPAQUE);
    this.root.add(farWallL);

    const farWallR = new THREE.Mesh(new THREE.BoxGeometry((AW * 2 - 12) / 2, AH, 1.2), mStone);
    farWallR.position.set((12 + (AW * 2 - 12) / 2) / 2, AH / 2, AZ1);
    farWallR.layers.set(L_OPAQUE);
    this.root.add(farWallR);

    const farWallTop = new THREE.Mesh(new THREE.BoxGeometry(12, AH - 22, 1.2), mStone);
    farWallTop.position.set(0, 22 + (AH - 22) / 2, AZ1);
    farWallTop.layers.set(L_OPAQUE);
    this.root.add(farWallTop);

    // Pure pale-blue sky backdrop beyond the far aperture
    const skyApertureGeo = new THREE.PlaneGeometry(60, 50);
    const mSkyAperture = emitMat({ a: [0.96, 0.98, 1.0], b: [0.72, 0.85, 0.98], intensity: 4.5, y0: 0, y1: 30 });
    const skyAperture = new THREE.Mesh(skyApertureGeo, mSkyAperture);
    skyAperture.position.set(0, 18, AZ1 - 12);
    skyAperture.layers.set(L_OPAQUE);
    this.root.add(skyAperture);

    // 7. Iconic Central Object: The Monolith (4.4m wide x 11.0m tall x 0.35m deep)
    // Levitation rule: floats exactly 0.35m above the floor (base at Y=0.35, center Y = 0.35 + 5.5 = 5.85)
    const mGlass = glassMat({ half: [2.2, 5.5, 0.175], refract: 0.045, portal: true });
    const monoGeo = new THREE.BoxGeometry(4.4, 11.0, 0.35);
    this.monolith = new THREE.Mesh(monoGeo, mGlass);
    this.monolith.position.set(0, 5.85, -24.0);
    this.monolith.layers.set(L_GLASS);
    this.root.add(this.monolith);

    // 8. Secondary Iconic Silhouette: The Floating Stair
    // Ascends towards the far sky aperture and ends abruptly in space
    this.stairGroup = new THREE.Group();
    const stepGeo = new THREE.BoxGeometry(2.4, 0.22, 1.1);
    const stepMat = stoneMat({ albedo: [0.86, 0.86, 0.88], joint: 0 });
    for (let i = 0; i < 24; i++) {
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(-6.5 + (i * 0.1), 0.35 + i * 0.55, -34.0 - i * 0.95);
      step.layers.set(L_OPAQUE);
      this.stairGroup.add(step);
    }
    this.root.add(this.stairGroup);

    // 9. Slot Opening into the Infinite Corridor (Left wall at Z = -45m)
    // A slender 1.6m wide x 3.6m tall gap leading into the non-Euclidean loop
    const corridorPortalFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 2.0), mStone);
    corridorPortalFrame.position.set(-AW + 0.2, 2.0, -45.0);
    corridorPortalFrame.layers.set(L_OPAQUE);
    this.root.add(corridorPortalFrame);
  }

  // Check proximity to project exhibits for whisper captions
  getNearbyExhibit(camPos) {
    if (camPos.x < 5.0 || Math.abs(camPos.x) > 14.5) return null;
    for (const ex of this.exhibits) {
      if (Math.abs(camPos.z - ex.z) < 3.2 && camPos.y < 4.0) {
        return ex;
      }
    }
    return null;
  }
}
