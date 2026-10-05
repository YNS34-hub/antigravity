## Live Preview

https://yns34-hub.github.io/antigravity/

﻿# THE MEMORY PALACE — REBORN

> *"Memory does not obey geometry. A room can feel larger inside than outside; corridors can loop back altered; doorways can lead somewhere different the second time; music can reshape architecture."*

---

## 🏛️ Architectural Overview

**THE MEMORY PALACE — REBORN** is a next-generation browser-based spatial web experience built with **Three.js** and bespoke custom WebGL shaders. It departs entirely from conventional portfolio cards, low-poly apartments, and generic showcases, embodying an impossible, quiet-luxury architectural memory space.

### 1. Visual Identity & Palette
- **Aesthetic**: Luminous white limestone, pale blue atmospheric light, polished wet-look stone reflections, volumetric sunlight shafts, crisp architectural shadows.
- **Strictly Avoided**: Generic dark cyberpunk, neon purple glows, low-poly gamification, grey corporate flatness.
- **The Memory Rule**: Iconic memory objects and panes hover exactly **0.35m** above the floor without visible mechanical supports.

---

## 🌌 The Three Architectural Spaces

### I. The Atrium (`I · The Atrium`)
- **Dimensions**: 14m wide × 64m long × 32m monumental ceiling height.
- **Lighting**: Overhead transverse ceiling slots (2.2m aperture, 1.5m slab depth) cast crisp geometric sunlight bars every 5m along the floor.
- **The Hovering Monolith**: A 10m tall polished glass monolith suspended at 0.35m at the hall's terminus, acting as a portal threshold.
- **The Cantilevered Stair**: A soaring spiral stone stair cantilevering out from the right colonnade with zero vertical supports.
- **Wall Exhibits**: Recessed camera-obscura light alcoves projecting personal creative milestones (`VOID // ECHO`, `CHRONO // SPHERE`, `SYNAPSE // NEURAL`) directly into the stone grain, accompanied by subtle museum typography.
- **The Afterglow**: Stepping through the third portal returns the visitor to the Atrium at dusk—bathed in golden atmospheric light with the floating stair permanently materialized.

### II. The Listening Room (`II · The Listening Room`)
- **The Rotunda**: 28m diameter cylindrical chamber capped by an oculus skylight.
- **96 Breathing Stone Fins**: Instanced architectural fins (`InstancedMesh` with GPU-driven rotation) that physically twist and breathe in harmonic response to sound frequencies.
- **The Acoustic Mirror**: An 8.4m concave stone parabolic dish levitating at 0.35m, inscribed with glowing concentric micro-acoustic rings and a levitating crystal core.
- **Acoustic Reactivity**: Supports real-time generative harmonic drone synthesis (55Hz–440Hz partials) as well as drag-and-drop audio ingestion to reshape the architecture with custom music.

### III. The Infinite Corridor (`III · The Infinite Corridor`)
- **Non-Euclidean Topology**: A seamless corridor loop where turning right four times brings you not back to where you started, but to an altered architectural state.
- **Slit Wall Illumination**: Knife-edge light slits slicing through the side walls into pure light voids.
- **Hanging Memory Artifact**: Displays previous captured HDR memory panes suspended at 0.35m along the corridor progression.

---

## 💎 Signature Interaction: The Keep

- **Hold Still to Keep**: Standing completely still for 2.8 seconds causes the peripheral viewport to charge with luminous energy. At full charge, an uncompressed pre-tonemapped HDR snapshot of the scene is captured into a physical floating glass pane hovering at 0.35m.
- **Dissolving Back**: Walking directly into a Kept Memory pane causes the glass to refract and dissolve space back into that exact captured moment.

---

## ⚡ Performance & Rendering Pipeline

Tested on physical hardware: **NVIDIA GeForce GTX 1650 Direct3D11**:

| Space | Target FPS | Measured FPS | Worst Frame Time |
|---|---|---|---|
| **Atrium Vestibule** | ≥ 45 FPS | **144.7 FPS** | 7.1 ms |
| **Atrium Hall** | ≥ 45 FPS | **145.4 FPS** | 7.6 ms |
| **Listening Room Rotunda** | ≥ 45 FPS | **144.8 FPS** | 7.3 ms |
| **Infinite Corridor** | ≥ 45 FPS | **145.8 FPS** | 7.1 ms |

Exceeds the 45 FPS performance budget by **over 3×**.

### Custom WebGL Pipeline Architecture
1. **Planar Reflection Pass**: Render target mirroring ground plane geometry for wet-stone reflections.
2. **Opaque & Floor Pass**: Analytical lighting, directional sunlight, and ambient bounce.
3. **Glass Refraction Pass**: Dual-sided glass refraction with chromatic dispersion.
4. **Non-Euclidean Portal Pass**: Oblique near-plane clipped projection matrix rendering destination space directly through the glass Monolith.
5. **Quarter-Resolution Raymarched Volumetrics**: Analytical Henyey-Greenstein scattering with dithered ray marching.
6. **HDR Dual-Filter Bloom Chain**: Downsample/upsample mip pyramid for natural glow.
7. **Filmic ACES Composite**: ACES tonemapping, cool shadow lift, subtle film grain, and architectural tilt-shift vertical alignment.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- Modern WebGL2 browser (Chrome, Edge, Firefox, Safari)

### Installation
```bash
git clone <repo-url> memory-palace-reborn
cd memory-palace-reborn
npm install
```

### Development
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### Production Build & Preview
```bash
npm run build
npx serve dist
```

---

## 🎮 Interaction Controls

| Action | Control |
|---|---|
| **Stroll** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Glide** | Click anywhere on the floor |
| **Look** | Click & drag mouse / trackpad |
| **Keep Memory** | Hold completely still for 2.8s |
| **Audio Toggle** | Click `Sound on / off` in lower right |
| **Custom Music** | Drag & drop any `.mp3` / `.wav` onto the screen |

---

## 📄 License
MIT
