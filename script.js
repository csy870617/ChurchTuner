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

// --- 2. 안정화 유틸리티 (이동 평균 필터 - 부드러운 움직임) ---
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

// [변경] 중간값 필터 대신 이동 평균 사용 (반응성 향상)
const centsSmoother = new MovingAverage(3); 

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
    
    // 악기 변경 시 필터 즉시 적용
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

// [수정] 락킹 제거 -> 실시간 하이라이트
function highlightStringBtn(noteName, octave, cents) {
    if (instruments[currentInstrument].isChromatic) return;
    const btns = document.querySelectorAll('.string-btn');
    
    // 정확도 판단 (±5센트 이내면 초록색)
    const isPerfect = Math.abs(cents) < 5;

    btns.forEach(btn => {
        const isCurrentDetected = (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave);

        btn.classList.remove('detected', 'locked', 'tuned');
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";

        if (isCurrentDetected) {
            if (isPerfect) {
                btn.classList.add('tuned'); // 녹색
                btn.style.transform = "scale(1.05)";
                btn.style.boxShadow = "0 0 20px var(--accent-green)";
            } else {
                btn.classList.add('detected'); // 파란색 (감지됨)
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
        
        // 1. 컴프레서 (입력 평탄화)
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -40; 
        compressor.ratio.value = 10;       

        // 2. High-Pass Filter (동적 설정 전 초기값)
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.frequency.value = 30; // 기본값

        // 3. Low-Pass Filter
        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(compressor);
        compressor.connect(highPassFilter);
        highPassFilter.connect(lowPassFilter);
        lowPassFilter.connect(analyser);

        applyInstrumentFilter(); // [중요] 악기에 맞는 필터 적용

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

// [핵심 기능] 악기별 맞춤 필터링 (정확도 상승의 열쇠)
function applyInstrumentFilter() {
    if(!lowPassFilter || !highPassFilter) return;
    const instData = instruments[currentInstrument];
    
    // HPF: 베이스는 낮게(28Hz), 기타는 높게(60Hz) -> 잡음 제거 최적화
    const hpfVal = instData.hpf || 30;
    highPassFilter.frequency.value = hpfVal;

    // LPF: 악기 최고음보다 조금 높게
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
    
    // 소음 게이트 (0.04 유지)
    if (rms < 0.04) { 
         // 소리가 멈추면 바늘 서서히 0으로
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

// [YIN 알고리즘 - 정확도 최적화]
function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.10; 
    const bufferSize = buffer.length;
    let tauEstimate = -1; let pitchInHz = -1;
    const yinBuffer = new Float32Array(bufferSize / 2);
    yinBuffer[0] = 1; let runningSum = 0;
    
    // 1. Difference function
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

    // 2. Absolute threshold
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau; break;
        }
    }

    // 3. Parabolic Interpolation (정밀 보정)
    if (tauEstimate !== -1) {
        // 신뢰도 체크 (값이 너무 높으면 잡음)
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
        // 접착력을 약간 줄여서 반응성 확보 (0.4 -> 0.7)
        if (lastDetectedStringIndex === index) {
            weight = 0.7; 
        }

        let diff = Math.abs(frequency - str.freq);
        const diffHarmonic = Math.abs(frequency - (str.freq * 2));
        // 배음 체크
        if (diffHarmonic < 5) { // 5Hz 이내일 때만 배음으로 인정 (더 엄격하게)
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

// [수정] 락킹 로직 제거 -> 단순 부드러운 UI 업데이트
function processCentsAndUI(noteName, octave, rawCents, frequency) {
    centsSmoother.add(rawCents);
    targetCents = centsSmoother.getAverage(); // 이동 평균값 사용

    renderTextUI(noteName, octave, Math.round(targetCents), frequency);
}

function renderTextUI(note, octave, cents, frequency) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    // 절대값 3 이내면 PERFECT
    const isPerfect = Math.abs(cents) <= 3;
    
    let displayStr = isPerfect ? "OK" : (cents > 0 ? "+" : "") + cents;
    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "TUNING...";
    const style = getComputedStyle(document.body);

    if (isPerfect) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < -3) { 
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW"; 
    } else if (cents > 3) {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH"; 
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 60px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;

    // 하단 버튼 하이라이트 (고정 없이 실시간 반영)
    highlightStringBtn(note, octave, cents);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(isPerfect) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    // 락킹 해제했으므로 바늘 반응 속도 빠르고 일정하게
    displayCents += (targetCents - displayCents) * 0.4; 

    let percentage = 50 + displayCents;
    if (percentage < 5) percentage = 5; 
    if (percentage > 95) percentage = 95;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();