import * as THREE from 'three';
import { U } from './materials.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.gain = null;
    this.isPlaying = false;
    this.isSynthRunning = false;
    this.synths = [];
    this.tempo = 0.5;

    // Smoothed audio features
    this.features = {
      low: 0,
      mid: 0,
      high: 0,
      level: 0,
    };
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.gain = this.ctx.createGain();
    this.gain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.startAmbientSynth();
    this.isPlaying = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Pure mathematical generative ambient soundscape
  startAmbientSynth() {
    if (!this.ctx || this.isSynthRunning) return;
    this.isSynthRunning = true;

    // Frequencies inspired by harmonic partials: 55Hz (A1), 110Hz (A2), 164.81Hz (E3), 220Hz (A3), 277.18Hz (C#4), 329.63Hz (E4), 440Hz (A4)
    const freqs = [55, 110, 164.81, 220, 277.18, 329.63];
    this.synths = freqs.map((f, i) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = i === 0 ? 'sine' : (i % 2 === 0 ? 'triangle' : 'sine');
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);

      const baseAmp = i === 0 ? 0.35 : 0.12 / Math.sqrt(i + 1);
      oscGain.gain.setValueAtTime(baseAmp, this.ctx.currentTime);

      if (panner) {
        panner.pan.setValueAtTime((i % 2 === 0 ? 1 : -1) * (0.2 + i * 0.1), this.ctx.currentTime);
        osc.connect(oscGain);
        oscGain.connect(panner);
        panner.connect(this.gain);
      } else {
        osc.connect(oscGain);
        oscGain.connect(this.gain);
      }

      osc.start();
      return { osc, oscGain, baseAmp, phase: Math.random() * Math.PI * 2, speed: 0.15 + i * 0.08 };
    });
  }

  stopAmbientSynth() {
    if (!this.isSynthRunning) return;
    this.synths.forEach(s => {
      try {
        s.oscGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
        setTimeout(() => s.osc.stop(), 500);
      } catch (e) {}
    });
    this.synths = [];
    this.isSynthRunning = false;
  }

  // Load custom user audio file dropped onto the Acoustic Mirror
  async loadAudioFile(file) {
    this.init();
    this.resume();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

    this.stopAmbientSynth();

    if (this.source) {
      try { this.source.stop(); } catch (e) {}
    }

    this.source = this.ctx.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    this.source.start(0);
    this.isPlaying = true;
  }

  toggle() {
    if (!this.ctx) {
      this.init();
      return true;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      this.isPlaying = true;
      return true;
    } else if (this.ctx.state === 'running') {
      this.ctx.suspend();
      this.isPlaying = false;
      return false;
    }
    return false;
  }

  update(dt, t) {
    if (!this.ctx || !this.analyser || this.ctx.state !== 'running') {
      // Gentle synthetic pulse uniform if audio is disabled
      const idlePulse = Math.sin(t * 1.2) * 0.08 + 0.1;
      U.uAudio.value.set(idlePulse, idlePulse * 0.5, idlePulse * 0.3, idlePulse);
      return;
    }

    // Modulate synth partials naturally over time
    if (this.isSynthRunning) {
      this.synths.forEach(s => {
        const mod = Math.sin(t * s.speed + s.phase) * 0.5 + 0.5;
        const targetGain = s.baseAmp * (0.4 + 0.6 * mod);
        s.oscGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
      });
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const len = this.dataArray.length;
    let sumLow = 0, countLow = 0;
    let sumMid = 0, countMid = 0;
    let sumHigh = 0, countHigh = 0;
    let sumTotal = 0;

    for (let i = 0; i < len; i++) {
      const val = this.dataArray[i] / 255;
      sumTotal += val;
      if (i < len * 0.12) {
        sumLow += val; countLow++;
      } else if (i < len * 0.55) {
        sumMid += val; countMid++;
      } else {
        sumHigh += val; countHigh++;
      }
    }

    const rawLow = countLow ? sumLow / countLow : 0;
    const rawMid = countMid ? sumMid / countMid : 0;
    const rawHigh = countHigh ? sumHigh / countHigh : 0;
    const rawLevel = len ? sumTotal / len : 0;

    // Smooth values to prevent harsh pops in architecture shaders
    const sm = 0.15;
    this.features.low += (rawLow - this.features.low) * sm;
    this.features.mid += (rawMid - this.features.mid) * sm;
    this.features.high += (rawHigh - this.features.high) * sm;
    this.features.level += (rawLevel - this.features.level) * sm;

    U.uAudio.value.set(
      this.features.low,
      this.features.mid,
      this.features.high,
      this.features.level
    );
  }
}
