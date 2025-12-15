//
// --- 1. 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard", range: [60, 1000], hpf: 75, strings: [ 
        { note: "E", octave: 2, freq: 82.41 }, { note: "A", octave: 2, freq: 110.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "G", octave: 3, freq: 196.00 }, 
        { note: "B", octave: 3, freq: 246.94 }, { note: "E", octave: 4, freq: 329.63 } 
    ] },
    bass: { name: "BASS", icon: "🎸", detail: "Standard", range: [30, 400], hpf: 28, strings: [ 
        { note: "E", octave: 1, freq: 41.20 }, { note: "A", octave: 1, freq: 55.00 }, 
        { note: "D", octave: 2, freq: 73.42 }, { note: "G", octave: 2, freq: 98.00 } 
    ] },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "Universal", range: [20, 3000], hpf: 20, isChromatic: true, strings: [] },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", range: [200, 1000], hpf: 150, strings: [ 
        { note: "G", octave: 4, freq: 392.00 }, { note: "C", octave: 4, freq: 261.63 }, 
        { note: "E", octave: 4, freq: 329.63 }, { note: "A", octave: 4, freq: 440.00 } 
    ] },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", range: [180, 1200], hpf: 150, strings: [ 
        { note: "G", octave: 3, freq: 196.00 }, { note: "D", octave: 4, freq: 293.66 }, 
        { note: "A", octave: 4, freq: 440.00 }, { note: "E", octave: 5, freq: 659.25 } 
    ] },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", range: [60, 600], hpf: 50, strings: [ 
        { note: "C", octave: 2, freq: 65.41 }, { note: "G", octave: 2, freq: 98.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "A", octave: 3, freq: 220.00 } 
    ] }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 유틸리티 ---
class MovingAverage {
    constructor(size) { this.size = size; this.buffer = []; }
    add(val) { this.buffer.push(val); if(this.buffer.length > this.size) this.buffer.shift(); }
    getAverage() { return this.buffer.length ? this.buffer.reduce((a,b)=>a+b,0)/this.buffer.length : 0; }
    reset() { this.buffer = []; }
}
class MedianSmoother {
    constructor(size) { this.size = size; this.buffer = []; }
    add(val) { this.buffer.push(val); if(this.buffer.length > this.size) this.buffer.shift(); }
    getValue() { if(!this.buffer.length) return 0; const s = [...this.buffer].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
    reset() { this.buffer = []; }
}

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let audioContext = null; let analyser = null; let mediaStream = null;
let isRunning = false; let inputSource = null;
let gainNode = null; let lowPassFilter = null; let highPassFilter = null; let compressor = null;

const BUF_SIZE = 4096; const buf = new Float32Array(BUF_SIZE);
const freqSmoother = new MedianSmoother(7); 
const centsSmoother = new MovingAverage(16); 

let currentDisplayedNote = "--"; let currentDisplayedOctave = "";
let lastSuccessTime = 0; 
let displayAngle = 0; // 바늘 각도
let targetAngle = 0;  // 목표 각도
let isLocked = false; let consecutiveNoteCount = 0; let lastDetectedNoteFull = "";
let stableStringIndex = -1; let pendingStringIndex = -1; let stringStabilityCounter = 0;


// DOM Elements
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
const needleGroup = document.getElementById('needle-group'); // SVG 바늘 그룹
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const instPills = document.querySelectorAll('.inst-pill');
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynIcon = document.getElementById('dyn-icon');
const dynName = document.getElementById('dyn-name');

// --- 초기화 ---
function init() {
    loadSettings();
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.classList.add('hidden'); });
    generateModalList();
    requestAnimationFrame(updateVisualizer);
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if(currentInstrument === 'ukulele' && type === 'ukulele') { openModal(); return; }
    activateInstrument(type, pill);
}

function loadSettings() {
    const saved = localStorage.getItem('churchTuner_current') || 'guitar';
    const savedDyn = localStorage.getItem('churchTuner_dynamic');
    if(savedDyn && instruments[savedDyn]){
        dynIcon.textContent = instruments[savedDyn].icon;
        dynName.textContent = instruments[savedDyn].name;
        dynamicCard.dataset.type = savedDyn;
    }
    const pill = document.querySelector(`.inst-pill[data-type="${saved}"]`) || document.querySelector('.inst-pill[data-type="guitar"]');
    activateInstrument(saved, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentInstrument = key;
    localStorage.setItem('churchTuner_current', key);
    if(key !== 'guitar' && key !== 'bass') localStorage.setItem('churchTuner_dynamic', key);
    if(isRunning) applyFilters();
    resetUI();
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const div = document.createElement('div');
        div.className = 'inst-option';
        div.innerHTML = `<div class="opt-icon">${inst.icon}</div><div class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></div>`;
        div.addEventListener('click', () => selectDynamicInstrument(key));
        modalList.appendChild(div);
    });
}
function openModal() { modal.classList.remove('hidden'); }
function selectDynamicInstrument(key) {
    const inst = instruments[key];
    dynIcon.textContent = inst.icon; dynName.textContent = inst.name; dynamicCard.dataset.type = key;
    modal.classList.add('hidden'); activateInstrument(key, dynamicCard);
}

function playSuccessSound() {
    if (!audioContext) return;
    const now = Date.now(); if (now - lastSuccessTime < 1500) return; lastSuccessTime = now;
    const t = audioContext.currentTime;
    const osc1 = audioContext.createOscillator(); const gain1 = audioContext.createGain(); osc1.frequency.value = 880; osc1.type = 'sine';
    const osc2 = audioContext.createOscillator(); const gain2 = audioContext.createGain(); osc2.frequency.value = 1760; osc2.type = 'sine';
    gain1.gain.setValueAtTime(0.3, t); gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    gain2.gain.setValueAtTime(0.1, t); gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc1.connect(gain1).connect(audioContext.destination); osc2.connect(gain2).connect(audioContext.destination);
    osc1.start(t); osc1.stop(t + 1.5); osc2.start(t); osc2.stop(t + 1.5);
}

// --- 오디오 처리 ---
function toggleTuner() { isRunning ? stopTuner() : startTuner(); }

async function startTuner() {
    try {
        if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if(audioContext.state === 'suspended') await audioContext.resume();
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
        inputSource = audioContext.createMediaStreamSource(mediaStream);
        gainNode = audioContext.createGain(); gainNode.gain.value = 5.0;
        compressor = audioContext.createDynamicsCompressor(); compressor.threshold.value = -50; compressor.ratio.value = 8;
        highPassFilter = audioContext.createBiquadFilter(); highPassFilter.type = "highpass";
        lowPassFilter = audioContext.createBiquadFilter(); lowPassFilter.type = "lowpass";
        analyser = audioContext.createAnalyser(); analyser.fftSize = BUF_SIZE;
        inputSource.connect(gainNode).connect(compressor).connect(highPassFilter).connect(lowPassFilter).connect(analyser);
        applyFilters();
        isRunning = true;
        startBtn.classList.add('active'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active'); guideMsg.textContent = "PLAY A STRING";
        processAudio();
    } catch(e) { console.error(e); alert("Microphone access required."); }
}

function applyFilters() {
    if(!highPassFilter) return;
    const data = instruments[currentInstrument];
    highPassFilter.frequency.value = (currentInstrument === 'guitar') ? 75 : (data.hpf || 30);
    lowPassFilter.frequency.value = (currentInstrument === 'guitar' || currentInstrument === 'ukulele') ? 5000 : 1000;
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('active'); btnText.textContent = "ACTIVATE";
    statusDot.classList.remove('active');
    resetUI();
    if(mediaStream) mediaStream.getTracks().forEach(t => t.stop());
}

function resetUI() {
    displayAngle = 0; targetAngle = 0; isLocked = false;
    noteNameEl.textContent = "--"; octaveEl.textContent = ""; noteNameEl.classList.remove('active');
    freqEl.textContent = "0.0 Hz"; centsEl.classList.remove('visible');
    document.body.className = ""; // 네온 클래스 초기화
    guideMsg.textContent = "READY"; guideMsg.style.color = "var(--text-muted)";
    freqSmoother.reset(); centsSmoother.reset();
    stableStringIndex = -1;
}

function processAudio() {
    if(!isRunning) return;
    analyser.getFloatTimeDomainData(buf);
    let rms = 0; for(let i=0; i<buf.length; i++) rms += buf[i]*buf[i]; rms = Math.sqrt(rms/buf.length);

    if(rms < 0.04) {
        if(isLocked) { if(Math.abs(targetAngle) > 1) targetAngle *= 0.9; }
        else { if(Math.abs(targetAngle) > 1) targetAngle *= 0.8; else targetAngle = 0; }
        if(rms < 0.01) { isLocked = false; stableStringIndex = -1; document.body.className = ""; centsEl.classList.remove('visible');}
        consecutiveNoteCount = 0; requestAnimationFrame(processAudio); return;
    }

    const pitch = yin(buf, audioContext.sampleRate);
    if(pitch !== -1) { freqSmoother.add(pitch); updateTuner(freqSmoother.getValue()); }
    requestAnimationFrame(processAudio);
}

function yin(buffer, sampleRate) {
    const threshold = 0.25; let tauEstimate = -1; 
    const yinBuffer = new Float32Array(buffer.length/2); yinBuffer[0] = 1; let runningSum = 0;
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        let deltaSum = 0; for (let i = 0; i < yinBuffer.length; i++) deltaSum += (buffer[i] - buffer[i + tau]) ** 2;
        yinBuffer[tau] = deltaSum; runningSum += yinBuffer[tau];
        yinBuffer[tau] *= (runningSum !== 0) ? tau / runningSum : 1;
    }
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau; break;
        }
    }
    if (tauEstimate !== -1 && yinBuffer[tauEstimate] < 0.25) {
        const s0 = yinBuffer[tauEstimate], s1 = yinBuffer[tauEstimate-1]||s0, s2 = yinBuffer[tauEstimate+1]||s0;
        let adj = (s1 - s2) / (2 * (s1 - 2 * s0 + s2)); if(isNaN(adj)) adj = 0;
        return sampleRate / (tauEstimate + adj);
    }
    return -1;
}

function findNote(frequency) {
    const data = instruments[currentInstrument];
    if(data.isChromatic) {
        const n = Math.round(12*Math.log2(frequency/440)+69);
        return { note: noteStrings[n%12], octave: Math.floor(n/12)-1, target: 440*Math.pow(2,(n-69)/12), index:-1 };
    }
    let minDiff=Infinity; let match=null; let matchIdx=-1;
    data.strings.forEach((str, idx) => {
        let diff = Math.abs(frequency - str.freq);
        let diff2 = Math.abs(frequency - str.freq*2);
        let bestDiff = Infinity;
        if(frequency>=str.freq*0.7 && frequency<=str.freq*1.3) bestDiff=diff;
        else if(frequency>=(str.freq*2)*0.7 && frequency<=(str.freq*2)*1.3) bestDiff=diff2;
        
        if(bestDiff !== Infinity) {
             let weight = (lastDetectedStringIndex === idx) ? 0.8 : 1.0;
             if(stableStringIndex !== -1 && stableStringIndex === idx) weight = 0.5;
             if(bestDiff*weight < minDiff) { minDiff=bestDiff*weight; match={...str, target:str.freq}; matchIdx=idx; }
        }
    });
    return match ? {...match, index:matchIdx} : null;
}

function updateTuner(freq) {
    const match = findNote(freq); if(!match) return;
    
    if(stableStringIndex !== -1 && stableStringIndex !== match.index) {
        if(pendingStringIndex !== match.index) { pendingStringIndex = match.index; stringStabilityCounter = 0; }
        else if(++stringStabilityCounter < 25) return;
    }
    stableStringIndex = match.index; pendingStringIndex = -1; stringStabilityCounter = 0;

    let calcFreq = freq; if(Math.abs(freq - match.target*2) < 20) calcFreq = freq/2;
    let cents = 1200 * Math.log2(calcFreq / match.target);
    while(cents > 600) cents -= 1200; while(cents < -600) cents += 1200;

    const key = match.note + match.octave;
    if(key !== lastDetectedNoteFull) { lastDetectedNoteFull = key; consecutiveNoteCount = 0; isLocked = false; centsSmoother.reset(); return; }
    if(++consecutiveNoteCount < 2) return;

    currentDisplayedNote = match.note; currentDisplayedOctave = match.octave;
    centsSmoother.add(cents); let smoothed = centsSmoother.getAverage();

    if(isLocked) { if(Math.abs(smoothed) > 25.0) isLocked = false; else targetAngle = 0; } 
    else {
        // 센트를 각도로 변환 (±50센트 = ±90도)
        targetAngle = Math.max(-90, Math.min(90, smoothed * 1.8));
        if(Math.abs(smoothed) < 3.0) { isLocked = true; targetAngle = 0; playSuccessSound(); }
    }
    renderUI(match.note, match.octave, smoothed, calcFreq);
}

function renderUI(note, oct, cents, freq) {
    noteNameEl.textContent = note; octaveEl.textContent = oct; noteNameEl.classList.add('active');
    freqEl.textContent = freq.toFixed(1) + " Hz";
    
    let dispCents = Math.round(cents);
    centsEl.textContent = isLocked ? "OK" : (dispCents>0?"+":"")+dispCents;
    centsEl.classList.add('visible');

    let statusClass = 'perfect'; let msg = "PERFECT";
    if(!isLocked) {
        if(cents < -3) { statusClass = 'low'; msg = "TOO LOW"; }
        else if(cents > 3) { statusClass = 'high'; msg = "TOO HIGH"; }
        else { msg = "HOLD..."; }
    }
    // body에 클래스를 주어 전체 테마 색상 변경
    document.body.className = statusClass;
    guideMsg.textContent = msg; guideMsg.style.color = "var(--current-neon)";
}

// [핵심] 바늘 회전 애니메이션
function updateVisualizer() {
    // 락킹 상태면 0도, 아니면 부드럽게 이동
    displayAngle += ((isLocked ? 0 : targetAngle) - displayAngle) * 0.15;
    // SVG 그룹 회전 (중심점 100, 100 기준)
    needleGroup.setAttribute('transform', `rotate(${displayAngle}, 100, 100)`);
    requestAnimationFrame(updateVisualizer);
}

init();