//
// --- 1. 악기 데이터 (440Hz 표준) ---
const instruments = {
    // HPF 50Hz 유지
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard (EADGBE)", range: [60, 1000], hpf: 50, strings: [ 
        { note: "E", octave: 2, freq: 82.41, num: 6 }, 
        { note: "A", octave: 2, freq: 110.00, num: 5 }, 
        { note: "D", octave: 3, freq: 146.83, num: 4 }, 
        { note: "G", octave: 3, freq: 196.00, num: 3 }, 
        { note: "B", octave: 3, freq: 246.94, num: 2 }, 
        { note: "E", octave: 4, freq: 329.63, num: 1 } 
    ], columns: 3 },
    bass: { name: "BASS", icon: "🎸", detail: "Standard (EADG)", range: [30, 400], hpf: 28, strings: [ 
        { note: "E", octave: 1, freq: 41.20, num: 4 }, 
        { note: "A", octave: 1, freq: 55.00, num: 3 }, 
        { note: "D", octave: 2, freq: 73.42, num: 2 }, 
        { note: "G", octave: 2, freq: 98.00, num: 1 } 
    ], columns: 2 },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "Universal", range: [20, 3000], hpf: 20, isChromatic: true, strings: [], columns: 1 },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", range: [200, 1000], hpf: 150, strings: [ 
        { note: "G", octave: 4, freq: 392.00, num: 4 }, 
        { note: "C", octave: 4, freq: 261.63, num: 3 }, 
        { note: "E", octave: 4, freq: 329.63, num: 2 }, 
        { note: "A", octave: 4, freq: 440.00, num: 1 } 
    ], columns: 2 },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", range: [180, 1200], hpf: 150, strings: [ 
        { note: "G", octave: 3, freq: 196.00, num: 4 }, 
        { note: "D", octave: 4, freq: 293.66, num: 3 }, 
        { note: "A", octave: 4, freq: 440.00, num: 2 }, 
        { note: "E", octave: 5, freq: 659.25, num: 1 } 
    ], columns: 2 },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", range: [60, 600], hpf: 50, strings: [ 
        { note: "C", octave: 2, freq: 65.41, num: 4 }, 
        { note: "G", octave: 2, freq: 98.00, num: 3 }, 
        { note: "D", octave: 3, freq: 146.83, num: 2 }, 
        { note: "A", octave: 3, freq: 220.00, num: 1 } 
    ], columns: 2 },
    doublebass: { name: "D.BASS", icon: "🎻", detail: "Orchestra", range: [30, 300], hpf: 25, strings: [ 
        { note: "E", octave: 1, freq: 41.20, num: 4 }, 
        { note: "A", octave: 1, freq: 55.00, num: 3 }, 
        { note: "D", octave: 2, freq: 73.42, num: 2 }, 
        { note: "G", octave: 2, freq: 98.00, num: 1 } 
    ], columns: 2 },
    flute: { name: "FLUTE", icon: "🎼", detail: "C Inst.", range: [200, 2000], hpf: 200, strings: [ 
        { note: "A", octave: 4, freq: 440.00, num: "A" }, 
        { note: "A#", octave: 4, freq: 466.16, num: "Bb" } 
    ], columns: 2 },
    clarinet: { name: "CLARINET", icon: "🎷", detail: "Bb Inst.", range: [100, 1500], hpf: 100, strings: [ 
        { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, 
        { note: "F", octave: 4, freq: 349.23, num: "G" } 
    ], columns: 2 },
    sax_alto: { name: "A.SAX", icon: "🎷", detail: "Eb Inst.", range: [100, 1200], hpf: 100, strings: [ 
        { note: "D#", octave: 3, freq: 311.13, num: "Low C" }, 
        { note: "A#", octave: 3, freq: 466.16, num: "G" } 
    ], columns: 2 },
    trumpet: { name: "TRUMPET", icon: "🎺", detail: "Bb Inst.", range: [150, 1200], hpf: 150, strings: [ 
        { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, 
        { note: "F", octave: 4, freq: 349.23, num: "G" } 
    ], columns: 2 }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 2. 안정화 유틸리티 ---
class MovingAverage {
    constructor(size) {
        this.size = size;
        this.buffer = [];
    }
    add(value) {
        this.buffer.push(value);
        if (this.buffer.length > this.size) this.buffer.shift();
    }
    getAverage() {
        if (this.buffer.length === 0) return 0;
        const sum = this.buffer.reduce((a, b) => a + b, 0);
        return sum / this.buffer.length;
    }
    reset() { this.buffer = []; }
}

class MedianSmoother {
    constructor(size) {
        this.size = size;
        this.buffer = [];
    }
    add(value) {
        this.buffer.push(value);
        if (this.buffer.length > this.size) this.buffer.shift();
    }
    getValue() {
        if (this.buffer.length === 0) return 0;
        const sorted = [...this.buffer].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }
    reset() { this.buffer = []; }
}

// --- 3. 전역 변수 ---
let currentInstrument = 'guitar';
let currentDynamicInst = null; 
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let isRunning = false; 
let inputSource = null;

let gainNode = null; 
let lowPassFilter = null; 
let highPassFilter = null; 
let compressor = null;   

const BUF_SIZE = 4096;
const buf = new Float32Array(BUF_SIZE);

// 필터 설정 (유지)
const freqSmoother = new MedianSmoother(5); 
const centsSmoother = new MovingAverage(16); 

let currentDisplayedNote = "--"; 
let currentDisplayedOctave = 0;
let lastDetectedStringIndex = -1; 
let lastSuccessTime = 0; 

let displayCents = 0; 
let targetCents = 0;

let isLocked = false;
let consecutiveNoteCount = 0;
let lastDetectedNoteFull = "";

// DOM Elements
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
const tuningIndicator = document.getElementById('tuning-indicator');
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const stringContainer = document.getElementById('string-container');
const instCards = document.querySelectorAll('.inst-card');
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynIcon = document.getElementById('dyn-icon');
const dynName = document.getElementById('dyn-name');
const dynDetail = document.getElementById('dyn-detail');

// --- 4. 초기화 ---
function init() {
    loadSavedSettings();
    instCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const type = card.dataset.type;
            if (type === 'more') {
                if (currentDynamicInst && card.classList.contains('active')) openModal();
                else if (currentDynamicInst) activateInstrument(currentDynamicInst, card);
                else openModal();
                return;
            }
            activateInstrument(type, card);
        });
    });
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    generateModalList();
    requestAnimationFrame(updateVisualizer);
}

function loadSavedSettings() {
    const savedCurrent = localStorage.getItem('churchTuner_current');
    const savedDynamic = localStorage.getItem('churchTuner_dynamic');
    if (savedDynamic && instruments[savedDynamic]) {
        currentDynamicInst = savedDynamic;
        const inst = instruments[savedDynamic];
        dynIcon.textContent = inst.icon;
        dynName.textContent = inst.name;
        dynDetail.textContent = inst.detail;
    }
    if (savedCurrent && instruments[savedCurrent]) {
        if (savedCurrent === 'guitar' || savedCurrent === 'bass') {
            const targetCard = document.querySelector(`.inst-card[data-type="${savedCurrent}"]`);
            activateInstrument(savedCurrent, targetCard);
        } else {
            activateInstrument(savedCurrent, dynamicCard);
        }
    } else {
        const guitarCard = document.querySelector('.inst-card[data-type="guitar"]');
        activateInstrument('guitar', guitarCard);
    }
}

function activateInstrument(instKey, cardElement) {
    instCards.forEach(c => c.classList.remove('active'));
    cardElement.classList.add('active');
    currentInstrument = instKey;
    localStorage.setItem('churchTuner_current', instKey);
    if (instKey !== 'guitar' && instKey !== 'bass') {
        localStorage.setItem('churchTuner_dynamic', instKey);
    }
    
    if(isRunning) applyInstrumentFilter();
    resetUI();
    renderStringButtons(currentInstrument);
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
    currentDynamicInst = key;
    dynIcon.textContent = inst.icon;
    dynName.textContent = inst.name;
    dynDetail.textContent = inst.detail;
    localStorage.setItem('churchTuner_dynamic', key);
    modal.classList.add('hidden');
    activateInstrument(key, dynamicCard);
}

function renderStringButtons(instType) {
    const data = instruments[instType];
    stringContainer.innerHTML = ''; 
    if (data.isChromatic) {
        stringContainer.style.display = 'flex';
        stringContainer.style.justifyContent = 'center';
        stringContainer.innerHTML = '<div class="chromatic-msg">ALL NOTES ACTIVE</div>';
        return;
    }
    stringContainer.style.display = 'grid';
    stringContainer.style.gridTemplateColumns = `repeat(${data.columns}, 1fr)`;
    data.strings.forEach(str => {
        const btn = document.createElement('button');
        btn.className = 'string-btn';
        btn.dataset.note = str.note; btn.dataset.octave = str.octave;
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        stringContainer.appendChild(btn);
    });
}

function highlightStringBtn(noteName, octave, isLocked) {
    if (instruments[currentInstrument].isChromatic) return;
    const btns = document.querySelectorAll('.string-btn');
    
    const isPerfect = Math.abs(targetCents) <= 3.0;

    btns.forEach(btn => {
        const isCurrentDetected = (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave);

        btn.classList.remove('detected', 'locked', 'tuned');
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";

        if (isCurrentDetected) {
            if (isLocked) { 
                btn.classList.add('tuned'); 
                btn.style.transform = "scale(1.05)";
                btn.style.boxShadow = "0 0 30px var(--accent-green)";
            } else {
                btn.classList.add('detected'); 
            }
        }
    });
}

function playSuccessSound() {
    if (!audioContext) return;
    
    const now = Date.now();
    if (now - lastSuccessTime < 1500) return; 
    lastSuccessTime = now;

    const t = audioContext.currentTime;
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.frequency.value = 880; 
    osc1.type = 'sine';
    
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.frequency.value = 1760; 
    osc2.type = 'sine';

    gain1.gain.setValueAtTime(0.3, t); 
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.5); 

    gain2.gain.setValueAtTime(0.1, t); 
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5); 

    osc1.connect(gain1); gain1.connect(audioContext.destination);
    osc2.connect(gain2); gain2.connect(audioContext.destination);
    
    osc1.start(t); osc1.stop(t + 1.5);
    osc2.start(t); osc2.stop(t + 1.5);
}

// --- 5. 오디오 처리 ---
function toggleTuner() { if (isRunning) stopTuner(); else startTuner(); }

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, 
                noiseSuppression: false 
            } 
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        inputSource = audioContext.createMediaStreamSource(mediaStream);
        
        // 게인 3.0 유지
        gainNode = audioContext.createGain();
        gainNode.gain.value = 3.0;

        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50; 
        compressor.ratio.value = 8;       

        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.frequency.value = 30; 

        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(highPassFilter);
        highPassFilter.connect(lowPassFilter);
        lowPassFilter.connect(analyser);

        applyInstrumentFilter();

        isRunning = true;
        freqSmoother.reset();
        centsSmoother.reset();
        lastDetectedStringIndex = -1;
        consecutiveNoteCount = 0;
        lastSuccessTime = 0;
        isLocked = false;
        
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        processAudio();
    } catch (err) { console.error(err); alert("마이크 권한이 필요합니다."); }
}

function applyInstrumentFilter() {
    if(!lowPassFilter || !highPassFilter) return;
    const instData = instruments[currentInstrument];
    
    const hpfVal = instData.hpf || 30;
    highPassFilter.frequency.value = hpfVal;

    let maxFreq = instData.range ? instData.range[1] : 1000;
    if (currentInstrument === 'guitar' || currentInstrument === 'ukulele') {
        maxFreq = 5000; 
    }
    lowPassFilter.frequency.value = maxFreq;
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    resetUI(); 
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI() {
    displayCents = 0; targetCents = 0;
    currentDisplayedNote = "--"; 
    lastDetectedStringIndex = -1;
    freqSmoother.reset();
    centsSmoother.reset();
    isLocked = false;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked', 'tuned');
        b.style.transform = "scale(1)";
        b.style.boxShadow = "none";
    });
}

function processAudio() {
    if (!isRunning) return;
    analyser.getFloatTimeDomainData(buf);
    
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    
    // 노이즈 게이트 0.04
    if (rms < 0.04) { 
         if (isLocked) {
             if (Math.abs(targetCents) > 1) targetCents *= 0.9;
         } else {
             if (Math.abs(targetCents) > 1) targetCents *= 0.8;
             else targetCents = 0;
         }
         
         if(rms < 0.01) {
            isLocked = false;
         }
         
        consecutiveNoteCount = 0;
        requestAnimationFrame(processAudio);
        return;
    }

    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    if (pitch !== -1) {
        freqSmoother.add(pitch);
        const smoothPitch = freqSmoother.getValue();
        updateTuner(smoothPitch);
    }
    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15; 
    const bufferSize = buffer.length;
    let tauEstimate = -1; let pitchInHz = -1;
    const yinBuffer = new Float32Array(bufferSize / 2);
    yinBuffer[0] = 1; let runningSum = 0;
    
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        let deltaSum = 0;
        for (let i = 0; i < yinBuffer.length; i++) {
            const delta = buffer[i] - buffer[i + tau];
            deltaSum += delta * delta;
        }
        yinBuffer[tau] = deltaSum;
        runningSum += yinBuffer[tau];
        if (runningSum !== 0) yinBuffer[tau] *= tau / runningSum;
        else yinBuffer[tau] = 1;
    }

    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau; break;
        }
    }

    if (tauEstimate !== -1) {
        if (yinBuffer[tauEstimate] > 0.15) return -1; 

        const x0 = tauEstimate;
        const x1 = (x0 < 1) ? x0 : x0 - 1;
        const x2 = (x0 + 1 < yinBuffer.length) ? x0 + 1 : x0;
        
        const s0 = yinBuffer[x0];
        const s1 = yinBuffer[x1];
        const s2 = yinBuffer[x2];
        
        let adjustment = 0;
        if (x0 > 0 && x0 < yinBuffer.length - 1) {
             const denominator = 2 * (s1 - 2 * s0 + s2);
             if (denominator !== 0) {
                 adjustment = (s1 - s2) / denominator;
             }
        }
        tauEstimate = x0 + adjustment;
        pitchInHz = sampleRate / tauEstimate;
    }

    const range = instruments[currentInstrument].range || [25, 2000];
    if (pitchInHz < range[0] || pitchInHz > range[1]) return -1;
    return pitchInHz;
}

// [핵심] 줄 선택 로직 (우선순위 & 범위 제한)
function findClosestString(frequency) {
    const instData = instruments[currentInstrument];
    
    if (instData.isChromatic) {
        const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
        const noteRound = Math.round(noteNum) + 69;
        const noteName = noteStrings[noteRound % 12];
        const octave = Math.floor(noteRound / 12) - 1;
        const perfectFreq = 440 * Math.pow(2, (noteRound - 69) / 12);
        return { note: noteName, octave: octave, targetFreq: perfectFreq, index: -1 };
    }

    let minDiff = Infinity;
    let closestStr = null;
    let closestIndex = -1;

    // [1차 필터링] 주파수 범위 ±20% 내의 줄만 후보로 등록 (엄격함)
    const candidates = [];
    instData.strings.forEach((str, index) => {
        if (frequency >= str.freq * 0.8 && frequency <= str.freq * 1.2) {
            candidates.push({ str, index, diff: Math.abs(frequency - str.freq) });
        }
    });

    if (candidates.length === 0) return { index: -1 }; // 일치하는 줄 없음

    // [2차 필터링] 후보 중 가장 가까운 줄 선택 (우선순위 적용)
    // 만약 1번줄(E)과 5번줄(A)이 경합한다면? -> 주파수 범위가 다르므로 경합할 일이 없음 (±20% 제한 덕분)
    candidates.forEach(cand => {
        let weight = 1.0;
        if (lastDetectedStringIndex === cand.index) {
            weight = 0.8; 
        }
        
        let finalDiff = cand.diff * weight;
        if (finalDiff < minDiff) {
            minDiff = finalDiff;
            closestStr = cand.str;
            closestIndex = cand.index;
        }
    });

    // 못찾았으면 리턴
    if (!closestStr) return { index: -1 };

    if (closestIndex !== -1) {
        lastDetectedStringIndex = closestIndex;
    }

    return { 
        note: closestStr.note, 
        octave: closestStr.octave, 
        targetFreq: closestStr.freq,
        index: closestIndex
    };
}

function updateTuner(frequency) {
    const match = findClosestString(frequency);
    if (match.index === -1) return; // 감지된 줄이 없으면 무시

    let rawCents = 1200 * Math.log2(frequency / match.targetFreq);
    
    while (rawCents > 600) rawCents -= 1200;
    while (rawCents < -600) rawCents += 1200;

    const currentNoteKey = match.note + match.octave;
    
    if (currentNoteKey !== lastDetectedNoteFull) {
        lastDetectedNoteFull = currentNoteKey;
        consecutiveNoteCount = 0;
        isLocked = false; 
        centsSmoother.reset(); 
        return; 
    }

    consecutiveNoteCount++;
    if (consecutiveNoteCount < 2) return; 

    currentDisplayedNote = match.note;
    currentDisplayedOctave = match.octave;
    
    processCentsAndUI(match.note, match.octave, rawCents, frequency);
}

function processCentsAndUI(noteName, octave, rawCents, frequency) {
    centsSmoother.add(rawCents);
    let smoothedCents = centsSmoother.getAverage(); 

    const LOCK_ENTER_THRESHOLD = 3.0; 
    const LOCK_EXIT_THRESHOLD = 6.0;  

    if (isLocked) {
        if (Math.abs(smoothedCents) < LOCK_EXIT_THRESHOLD) {
            targetCents = 0; 
        } else {
            isLocked = false; 
            targetCents = smoothedCents;
        }
    } else {
        if (Math.abs(smoothedCents) < LOCK_ENTER_THRESHOLD) {
            isLocked = true;
            targetCents = 0;
            playSuccessSound();
        } else {
            targetCents = smoothedCents;
        }
    }

    renderTextUI(noteName, octave, targetCents, frequency, isLocked); 
}

function renderTextUI(note, octave, cents, frequency, locked) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    const roundedCents = Math.round(cents);
    let displayStr = locked ? "OK" : (roundedCents > 0 ? "+" : "") + roundedCents;
    
    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "TUNING...";
    const style = getComputedStyle(document.body);

    if (locked) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < -3.0) { 
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW"; 
    } else if (cents > 3.0) { 
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH"; 
    } else {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "HOLD...";
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 60px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;

    highlightStringBtn(note, octave, locked);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(locked) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    if (isLocked) {
        displayCents = 0;
    } else {
        displayCents += (targetCents - displayCents) * 0.15; 
    }

    let percentage = 50 + displayCents;
    if (percentage < 5) percentage = 5; 
    if (percentage > 95) percentage = 95;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();