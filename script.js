//
// --- 1. 악기 데이터 (440Hz 표준) ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard (EADGBE)", range: [60, 1000], hpf: 60, strings: [ 
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

// --- 2. 안정화 유틸리티 (이동 평균 필터) ---
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

// --- 3. 전역 변수 ---
let currentInstrument = 'guitar';
let currentDynamicInst = null; 
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let isRunning = false; 
let inputSource = null;

let lowPassFilter = null; 
let highPassFilter = null; 
let compressor = null;   

const BUF_SIZE = 4096;
const buf = new Float32Array(BUF_SIZE);

// 반응성 확보를 위해 평균 필터 사이즈 최소화 (3 -> 2)
const centsSmoother = new MovingAverage(2); 

let currentDisplayedNote = "--"; 
let currentDisplayedOctave = 0;
let lastDetectedStringIndex = -1; 

let displayCents = 0; 
let targetCents = 0;

// [소음 방지용]
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

// [핵심 수정] 하이라이트 로직 엄격화
function highlightStringBtn(noteName, octave, cents) {
    if (instruments[currentInstrument].isChromatic) return;
    const btns = document.querySelectorAll('.string-btn');
    
    // [중요] 녹색불 기준을 ±1센트로 축소 (기존 5센트 -> 1센트)
    // 1센트만 벗어나도 즉시 불 꺼짐 (고정 X)
    const isPerfect = Math.abs(cents) <= 1.0;

    btns.forEach(btn => {
        const isCurrentDetected = (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave);

        btn.classList.remove('detected', 'locked', 'tuned');
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";

        if (isCurrentDetected) {
            if (isPerfect) {
                btn.classList.add('tuned'); 
                btn.style.transform = "scale(1.05)";
                btn.style.boxShadow = "0 0 25px var(--accent-green)";
            } else {
                btn.classList.add('detected'); 
            }
        }
    });
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
        
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -40; 
        compressor.ratio.value = 10;       

        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.frequency.value = 30; 

        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(compressor);
        compressor.connect(highPassFilter);
        highPassFilter.connect(lowPassFilter);
        lowPassFilter.connect(analyser);

        applyInstrumentFilter();

        isRunning = true;
        centsSmoother.reset();
        lastDetectedStringIndex = -1;
        consecutiveNoteCount = 0;
        
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

    const maxFreq = instData.range ? instData.range[1] : 1000; 
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
    centsSmoother.reset();
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
    
    // 소음 게이트 (0.04)
    if (rms < 0.04) { 
         if (Math.abs(targetCents) > 1) {
             targetCents *= 0.8;
         } else {
             targetCents = 0;
         }
        consecutiveNoteCount = 0;
        requestAnimationFrame(processAudio);
        return;
    }

    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    if (pitch !== -1) updateTuner(pitch);
    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.10; 
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
        if (yinBuffer[tauEstimate] > 0.08) return -1; 

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

    instData.strings.forEach((str, index) => {
        let weight = 1.0;
        
        // [수정] 줄 선택 접착력 대폭 감소 (0.7 -> 0.9) 
        // 거의 차이 없이 주파수만으로 즉각 판별 -> 고정 현상 제거
        if (lastDetectedStringIndex === index) {
            weight = 0.9; 
        }

        let diff = Math.abs(frequency - str.freq);
        const diffHarmonic = Math.abs(frequency - (str.freq * 2));
        if (diffHarmonic < 5) { 
             diff = diffHarmonic / 10; 
        }

        diff = diff * weight;

        if (diff < minDiff) {
            minDiff = diff;
            closestStr = str;
            closestIndex = index;
        }
    });

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
    
    let rawCents = 1200 * Math.log2(frequency / match.targetFreq);
    
    while (rawCents > 600) rawCents -= 1200;
    while (rawCents < -600) rawCents += 1200;

    const currentNoteKey = match.note + match.octave;
    
    if (currentNoteKey !== lastDetectedNoteFull) {
        lastDetectedNoteFull = currentNoteKey;
        consecutiveNoteCount = 0;
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
    targetCents = centsSmoother.getAverage(); 

    renderTextUI(noteName, octave, targetCents, frequency); // 소수점 단위 전달
}

function renderTextUI(note, octave, cents, frequency) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    // [중요] PERFECT 판정 기준: ±1센트 (엄격함)
    const isPerfect = Math.abs(cents) <= 1.0;
    
    // 디스플레이는 반올림해서 보여주지만, 내부 로직은 소수점까지 체크
    const roundedCents = Math.round(cents);
    let displayStr = isPerfect ? "OK" : (roundedCents > 0 ? "+" : "") + roundedCents;
    
    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "TUNING...";
    const style = getComputedStyle(document.body);

    if (isPerfect) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < -1.0) { // 기준 강화
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW"; 
    } else if (cents > 1.0) { // 기준 강화
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH"; 
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 60px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;

    highlightStringBtn(note, octave, cents);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(isPerfect) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    displayCents += (targetCents - displayCents) * 0.4; 

    let percentage = 50 + displayCents;
    if (percentage < 5) percentage = 5; 
    if (percentage > 95) percentage = 95;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();