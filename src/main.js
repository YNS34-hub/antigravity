import './style.css';
import * as THREE from 'three';
import { Pipeline } from './engine/pipeline.js';
import { U } from './engine/materials.js';
import { AudioEngine } from './engine/audio.js';
import { ArchitecturalControls } from './engine/controls.js';
import { Atrium } from './spaces/atrium.js';
import { ListeningRoom } from './spaces/listening.js';
import { InfiniteCorridor } from './spaces/corridor.js';
import { KeepInteraction } from './engine/keep.js';

class MemoryPalace {
  constructor() {
    this.canvas = document.getElementById('world');
    this.veil = document.getElementById('veil');
    this.placeEl = document.getElementById('place');
    this.lineEl = document.getElementById('line');
    this.hintEl = document.getElementById('hint');
    this.captionEl = document.getElementById('caption');
    this.soundBtn = document.getElementById('sound');
    this.cursorEl = document.getElementById('cursor');

    this.renderer = null;
    this.scene = null;
    this.cam = null;
    this.pipeline = null;
    this.controls = null;
    this.audio = null;
    this.keep = null;

    this.atrium = null;
    this.listening = null;
    this.corridor = null;

    this.activeSpace = 0; // 0 = Atrium, 1 = Listening, 2 = Corridor
    this.visitsToAtrium = 0;
    this.monolithDestination = 1; // 1 = Listening Room, 2 = Corridor

    // Portals
    this.portal = {
      active: true,
      matrix: new THREE.Matrix4(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 24.0),
      show: (isRenderingPortal, state) => {
        // Toggle visibility if needed during portal pass
        return state;
      }
    };

    this.whispers = {
      0: [
        'Memory does not obey geometry.',
        'A room can feel larger inside than outside.',
        'Architecture held in pure light.',
      ],
      1: [
        'The room is listening too.',
        'Walls breathe in harmonic rhythm.',
        'Music reshaping stone and shadow.',
      ],
      2: [
        'I have been here before, but something changed.',
        'A corridor that quietly turns into itself.',
        'The memory you kept is waiting ahead.',
      ]
    };

    this.currentWhisper = '';
    this.whisperTimer = 4.0;

    this.init();
  }

  init() {
    window.palace = this;
    // 1. WebGL2 Hardware Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // Lean pipeline handles antialiasing
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // Composite shader handles ACES
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

    this.scene = new THREE.Scene();
    this.renderer.setClearColor(0xf4f9ff, 1);

    // Architectural Camera: 45° vertical FOV
    this.cam = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 350);
    this.scene.add(this.cam);

    // 2. Render Pipeline
    this.pipeline = new Pipeline(this.renderer);
    this.pipeline.resize(window.innerWidth, window.innerHeight);

    // 3. Audio Engine
    this.audio = new AudioEngine();
    this.setupAudioControls();

    // 4. Spaces
    this.atrium = new Atrium(this.scene);
    this.listening = new ListeningRoom(this.scene);
    this.corridor = new InfiniteCorridor(this.scene);

    // 5. Controls & Signature Keep Interaction
    this.controls = new ArchitecturalControls(this.cam, this.canvas);
    this.keep = new KeepInteraction(this.scene, this.cam, this.pipeline, this.corridor);

    // 6. Projections Loading
    this.loadProjectProjections();

    // 7. Event listeners
    window.addEventListener('resize', () => this.onResize());
    this.setupDragAndDrop();

    // Fade veil after startup
    setTimeout(() => {
      this.veil.classList.add('gone');
      this.hintEl.classList.add('on');
      setTimeout(() => this.hintEl.classList.remove('on'), 9000);
    }, 450);

    // Cursor tracking
    window.addEventListener('pointermove', (e) => {
      if (this.cursorEl) {
        this.cursorEl.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
    });

    this.clock = new THREE.Clock();
    this.animate();
  }

  loadProjectProjections() {
    const loader = new THREE.TextureLoader();
    const textures = [
      loader.load(`${import.meta.env.BASE_URL}media/void-echo.jpg`),
      loader.load(`${import.meta.env.BASE_URL}media/giannis.jpg`),
      loader.load(`${import.meta.env.BASE_URL}media/waterline.jpg`),
      loader.load(`${import.meta.env.BASE_URL}media/afterglow.jpg`),
    ];
    textures.forEach(t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
    });
    U.uProj.value = textures;
  }

  setupAudioControls() {
    this.soundBtn.addEventListener('click', () => {
      const playing = this.audio.toggle();
      this.soundBtn.textContent = playing ? 'Sound on' : 'Sound off';
      if (playing) {
        this.showWhisper('The room begins to listen.');
      }
    });

    // Auto-resume audio on first user click anywhere
    const resumeOnInteraction = () => {
      if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
        this.audio.resume();
        this.soundBtn.textContent = 'Sound on';
      }
      window.removeEventListener('pointerdown', resumeOnInteraction);
    };
    window.addEventListener('pointerdown', resumeOnInteraction);
  }

  setupDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.cursorEl?.classList.add('hot');
    });

    window.addEventListener('dragleave', () => {
      this.cursorEl?.classList.remove('hot');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.cursorEl?.classList.remove('hot');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('audio/')) {
          this.audio.loadAudioFile(file);
          this.soundBtn.textContent = 'Sound on';
          this.showWhisper(`Playing ${file.name.replace(/\.[^/.]+$/, '')} through the architecture`);
        }
      }
    });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.pipeline.resize(w, h);
  }

  updatePortals() {
    // Portal inside the Monolith (Atrium Z = -24.0, faces along +Z)
    // Destination: Listening Room center (400, 0, 0) facing North
    const srcPos = new THREE.Vector3(0, 5.85, -24.0);
    let dstPos = new THREE.Vector3(400.0, 5.85, -6.0);

    if (this.monolithDestination === 2) {
      // Second time: Monolith opens into the Infinite Corridor!
      dstPos = new THREE.Vector3(-14.0, 5.85, -45.0);
    }

    // Portal transformation matrix: Maps world in front of Monolith to destination
    const srcMat = new THREE.Matrix4().makeTranslation(srcPos.x, srcPos.y, srcPos.z);
    const dstMat = new THREE.Matrix4().makeTranslation(dstPos.x, dstPos.y, dstPos.z);
    this.portal.matrix.copy(dstMat).multiply(srcMat.clone().invert());
    this.portal.plane.set(new THREE.Vector3(0, 0, 1), 24.0);
  }

  checkSpaceTransitions() {
    const p = this.cam.position;

    // 1. Check stepping through Monolith portal (Atrium Z = -24.0)
    if (this.activeSpace === 0 && Math.abs(p.x) < 2.5 && p.z < -23.8 && p.z > -24.5) {
      if (this.monolithDestination === 1) {
        // Step into Listening Room
        p.set(400.0, this.controls.eyeHeight, -6.0);
        this.controls.targetPos.copy(p);
        this.activeSpace = 1;
        this.monolithDestination = 2; // Next time, door leads somewhere different!
        this.onSpaceChanged(1);
      } else {
        // Step into Corridor
        p.set(-14.0, this.controls.eyeHeight, -45.0);
        this.controls.targetPos.copy(p);
        this.activeSpace = 2;
        this.onSpaceChanged(2);
      }
    }

    // 2. Check returning from Listening Room portal
    if (this.activeSpace === 1 && p.x > 396 && p.x < 404 && p.z < -11.5) {
      // Step back out into Atrium
      p.set(0, this.controls.eyeHeight, -21.0);
      this.controls.targetPos.copy(p);
      this.activeSpace = 0;
      this.onSpaceChanged(0);
    }

    // 3. Check entering corridor from Atrium slot (X < -13.5, Z around -45)
    if (this.activeSpace === 0 && p.x < -13.2 && Math.abs(p.z - (-45.0)) < 2.0) {
      this.activeSpace = 2;
      this.onSpaceChanged(2);
    }

    // 4. Check corridor loop completion (exiting doorway back to Atrium in afterglow)
    if (this.activeSpace === 2 && this.corridor.turnsCompleted >= 3) {
      const legState = U.uLegState.value[this.corridor.currentLegIndex];
      if (legState && legState.z > 0.5) {
        const lp = p.clone().applyMatrix4(U.uLeg.value[this.corridor.currentLegIndex]);
        if (lp.x > 31.0) {
          // Emerge into Atrium in Afterglow
          p.set(0, this.controls.eyeHeight, -50.0);
          this.controls.targetPos.copy(p);
          this.activeSpace = 0;
          U.uAfter.value = 1.0; // Atrium has transitioned to afterglow!
          this.onSpaceChanged(0);
          this.showWhisper('The palace has returned to you in afterglow.');
        }
      }
    }

    // Update corridor topology
    if (this.activeSpace === 2) {
      this.corridor.updateTopology(p);
    }
  }

  onSpaceChanged(space) {
    const titles = ['I · The Atrium', 'II · The Listening Room', 'III · The Infinite Corridor'];
    if (this.placeEl) {
      this.placeEl.textContent = titles[space];
    }
    const whispers = this.whispers[space];
    const pick = whispers[Math.floor(Math.random() * whispers.length)];
    this.showWhisper(pick);
  }

  showWhisper(text) {
    if (!this.lineEl) return;
    this.lineEl.textContent = text;
    this.lineEl.classList.add('on');
    clearTimeout(this.whisperTimeout);
    this.whisperTimeout = setTimeout(() => {
      this.lineEl.classList.remove('on');
    }, 4500);
  }

  updateExhibitCaptions() {
    if (this.activeSpace !== 0) {
      this.captionEl?.classList.remove('on');
      return;
    }
    const ex = this.atrium.getNearbyExhibit(this.cam.position);
    if (ex) {
      this.captionEl.href = ex.link;
      this.captionEl.innerHTML = `
        <em>${ex.role}</em>
        <b>${ex.title}</b>
        <span>${ex.sub}</span>
      `;
      this.captionEl.classList.add('on');
    } else {
      this.captionEl?.classList.remove('on');
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();
    U.uTime.value = time;

    // 1. Audio update
    this.audio.update(dt, time);

    // 2. Controls & camera update
    this.controls.update(dt);

    // 3. Portals and space logic
    this.updatePortals();
    this.checkSpaceTransitions();
    this.updateExhibitCaptions();

    // 4. Space animations
    this.listening.update(dt, time, this.audio.features);

    // 5. Keep Interaction update
    const isMoving = this.controls.keys.w || this.controls.keys.a || this.controls.keys.s || this.controls.keys.d || this.controls.isDragging;
    this.keep.update(dt, isMoving, () => {
      this.showWhisper('Moment kept.');
    });

    // 6. Pipeline render
    const captureTarget = this.keep.pendingCapture;
    this.keep.pendingCapture = null;

    this.pipeline.render(this.scene, this.cam, {
      portal: this.portal,
      reflect: true,
      capture: captureTarget,
      charge: this.keep.charge,
      flash: this.keep.flash,
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MemoryPalace();
});
