// --- 1. 악기 데이터 (440Hz 표준) ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard (EADGBE)", range: [60, 1000], strings: [ 
        { note: "E", octave: 2, freq: 82.41, num: 6 }, 
        { note: "A", octave: 2, freq: 110.00, num: 5 }, 
        { note: "D", octave: 3, freq: 146.83, num: 4 }, 
        { note: "G", octave: 3, freq: 196.00, num: 3 }, 
        { note: "B", octave: 3, freq: 246.94, num: 2 }, 
        { note: "E", octave: 4, freq: 329.63, num: 1 } 
    ], columns: 3 },
    bass: { name: "BASS", icon: "🎸", detail: "Standard (EADG)", range: [30, 400], strings: [ 
        { note: "E", octave: 1, freq: 41.20, num: 4 }, 
        { note: "A", octave: 1, freq: 55.00, num: 3 }, 
        { note: "D", octave: 2, freq: 73.42, num: 2 }, 
        { note: "G", octave: 2, freq: 98.00, num: 1 } 
    ], columns: 2 },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "Universal", range: [20, 3000], isChromatic: true, strings: [], columns: 1 },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", range: [200, 1000], strings: [ 
        { note: "G", octave: 4, freq: 392.00, num: 4 }, 
        { note: "C", octave: 4, freq: 261.63, num: 3 }, 
        { note: "E", octave: 4, freq: 329.63, num: 2 }, 
        { note: "A", octave: 4, freq: 440.00, num: 1 } 
    ], columns: 2 },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", range: [180, 1200], strings: [ 
        { note: "G", octave: 3, freq: 196.00, num: 4 }, 
        { note: "D", octave: 4, freq: 293.66, num: 3 }, 
        { note: "A", octave: 4, freq: 440.00, num: 2 }, 
        { note: "E", octave: 5, freq: 659.25, num: 1 } 
    ], columns: 2 },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", range: [60, 600], strings: [ 
        { note: "C", octave: 2, freq: 65.41, num: 4 }, 
        { note: "G", octave: 2, freq: 98.00, num: 3 }, 
        { note: "D", octave: 3, freq: 146.83, num: 2 }, 
        { note: "A", octave: 3, freq: 220.00, num: 1 } 
    ], columns: 2 },
    doublebass: { name: "D.BASS", icon: "🎻", detail: "Orchestra", range: [30, 300], strings: [ 
        { note: "E", octave: 1, freq: 41.20, num: 4 }, 
        { note: "A", octave: 1, freq: 55.00, num: 3 }, 
        { note: "D", octave: 2, freq: 73.42, num: 2 }, 
        { note: "G", octave: 2, freq: 98.00, num: 1 } 
    ], columns: 2 },
    flute: { name: "FLUTE", icon: "🎼", detail: "C Inst.", range: [200, 2000], strings: [ 
        { note: "A", octave: 4, freq: 440.00, num: "A" }, 
        { note: "A#", octave: 4, freq: 466.16, num: "Bb" } 
    ], columns: 2 },
    clarinet: { name: "CLARINET", icon: "🎷", detail: "Bb Inst.", range: [100, 1500], strings: [ 
        { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, 
        { note: "F", octave: 4, freq: 349.23, num: "G" } 
    ], columns: 2 },
    sax_alto: { name: "A.SAX", icon: "🎷", detail: "Eb Inst.", range: [100, 1200], strings: [ 
        { note: "D#", octave: 3, freq: 311.13, num: "Low C" }, 
        { note: "A#", octave: 3, freq: 466.16, num: "G" } 
    ], columns: 2 },
    trumpet: { name: "TRUMPET", icon: "🎺", detail: "Bb Inst.", range: [150, 1200], strings: [ 
        { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, 
        { note: "F", octave: 4, freq: 349.23, num: "G" } 
    ], columns: 2 }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 2. 안정화 유틸리티 (중간값 필터 - 튀는 값 제거용) ---
class MedianFilter {
    constructor(size) {
        this.size = size;
        this.buffer = [];
    }
    add(value) {
        this.buffer.push(value);
        if (this.buffer.length > this.size) this.buffer.shift();
    }
    getMedian() {
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
let lowPassFilter = null; // 고음 노이즈 차단용
let compressor = null;   

const BUF_SIZE = 4096; // 버퍼 사이즈 충분히 확보
const buf = new Float32Array(BUF_SIZE);
const tunedStrings = new Set(); 

// [핵심] 중간값 필터 (5프레임) - 순간적인 오류 제거
const medianFilter = new MedianFilter(5);

let currentDisplayedNote = "--"; 
let currentDisplayedOctave = 0;
let lastDetectedStringIndex = -1; 
let noteStabilityCounter = 0;
const NOTE_CHANGE_THRESHOLD = 5;

// 락킹(완료) 설정
let isNoteLocked = false;
let lockDuration = 0; 
const LOCK_REQUIRED_FRAMES = 8;  
const LOCK_TOLERANCE_CENTS = 10; 
const UNLOCK_THRESHOLD_CENTS = 30; 

let displayCents = 0; 
let targetCents = 0;

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
    
    tunedStrings.clear(); // 악기 변경 시에만 초기화
    
    if(isRunning) applyInstrumentFilter();
    resetUI(false);
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

// [핵심] UI 하이라이트 로직 (완료된 줄 절대 안 꺼짐)
function highlightStringBtn(noteName, octave, isLocked) {
    if (instruments[currentInstrument].isChromatic) return;
    const btns = document.querySelectorAll('.string-btn');
    
    btns.forEach(btn => {
        const btnKey = btn.dataset.note + btn.dataset.octave;
        
        // 1. 완료된 줄인지 확인
        const isAlreadyTuned = tunedStrings.has(btnKey);
        
        // 2. 현재 감지된 줄인지 확인
        const isCurrentDetected = (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave);

        // 초기화
        btn.classList.remove('detected', 'locked', 'tuned');

        // 상태 적용 순서: Tuned(완료) > Detected(감지) > 기본
        if (isAlreadyTuned) {
            btn.classList.add('tuned'); // 이미 완료됐으면 무조건 tuned
            // 만약 완료된 줄을 또 치고 있고, 지금 락킹(완료) 상태라면 애니메이션 효과를 위해 locked 추가 가능하지만
            // 여기서는 심플하게 tuned만 유지
        } 
        
        // 완료되지 않은 줄인데 현재 감지됨
        if (!isAlreadyTuned && isCurrentDetected) {
            if (isLocked) {
                // 지금 막 완료됨
                btn.classList.add('tuned');
            } else {
                // 맞추는 중
                btn.classList.add('detected');
            }
        }
    });
}

function playSuccessSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); 
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.4);
}

// --- 5. 오디오 처리 (노이즈 필터링 강화) ---
function toggleTuner() { if (isRunning) stopTuner(); else startTuner(); }

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, 
                noiseSuppression: false // 브라우저 필터 끄고 직접 처리
            } 
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        inputSource = audioContext.createMediaStreamSource(mediaStream);
        
        // 1. 컴프레서 (레벨 평탄화)
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.ratio.value = 12;

        // 2. Low-Pass Filter (고음 노이즈 제거 - 핵심)
        // 기타/베이스는 1000Hz 이상 불필요. 잡음의 원천 차단.
        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(compressor);
        compressor.connect(lowPassFilter); // 컴프레서 -> LPF
        lowPassFilter.connect(analyser);   // LPF -> 분석기

        applyInstrumentFilter();

        isRunning = true;
        medianFilter.reset();
        lastDetectedStringIndex = -1;
        
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        processAudio();
    } catch (err) { console.error(err); alert("마이크 권한이 필요합니다."); }
}

function applyInstrumentFilter() {
    if(!lowPassFilter) return;
    const instData = instruments[currentInstrument];
    // 악기별로 필요한 최대 주파수만 통과시킴
    // 예: 기타 1000Hz, 베이스 400Hz
    const maxFreq = instData.range ? instData.range[1] : 1000; 
    lowPassFilter.frequency.value = maxFreq;
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    resetUI(true); 
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    currentDisplayedNote = "--"; 
    isNoteLocked = false; lockDuration = 0;
    lastDetectedStringIndex = -1;
    medianFilter.reset();
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
        if (keepTuned) {
            const key = b.dataset.note + b.dataset.octave;
            if (tunedStrings.has(key)) b.classList.add('tuned');
        } else { b.classList.remove('tuned'); }
    });
}

function processAudio() {
    if (!isRunning) return;
    analyser.getFloatTimeDomainData(buf);
    
    // RMS 체크 (소음 게이트)
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    
    // 소리가 너무 작으면 분석 중지 (바늘 천천히 떨어짐)
    if (rms < 0.015) { 
        if (!isNoteLocked) {
             if (Math.abs(targetCents) > 1) {
                 targetCents *= 0.9;
             }
        }
        requestAnimationFrame(processAudio);
        return;
    }

    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    if (pitch !== -1) updateTuner(pitch);
    requestAnimationFrame(processAudio);
}

// [YIN 알고리즘]
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
        const x0 = tauEstimate;
        const x1 = (x0 < 1) ? x0 : x0 - 1;
        const x2 = (x0 + 1 < yinBuffer.length) ? x0 + 1 : x0;
        const den = yinBuffer[x2] - yinBuffer[x1];
        if (den === 0) tauEstimate = x0;
        else {
            const delta = yinBuffer[x1] - yinBuffer[x0];
            tauEstimate = x0 + 0.5 * delta / (den + yinBuffer[x2] - 2 * yinBuffer[x0]);
        }
        pitchInHz = sampleRate / tauEstimate;
    }

    const range = instruments[currentInstrument].range || [25, 2000];
    if (pitchInHz < range[0] || pitchInHz > range[1]) return -1;
    return pitchInHz;
}

// [스마트 줄 감지]
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
        // 현재 잡고 있는 줄에 40% 우선권 부여 (쉽게 안바뀜)
        if (lastDetectedStringIndex === index) {
            weight = 0.6; 
        }

        let diff = Math.abs(frequency - str.freq);
        
        // 2배음 보정 (옥타브 오류 방지)
        const diffHarmonic = Math.abs(frequency - (str.freq * 2));
        if (diffHarmonic < 15) { 
             diff = diffHarmonic / 5; 
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

    currentDisplayedNote = match.note;
    currentDisplayedOctave = match.octave;
    
    // 노트 변경 감지 필요 없음 (즉시 반응)
    processCentsAndLocking(match.note, match.octave, rawCents, frequency);
}

function processCentsAndLocking(noteName, octave, rawCents, frequency) {
    // [중요] 중간값 필터 사용 (튀는 값 제거)
    medianFilter.add(rawCents);
    const smoothCents = medianFilter.getMedian();

    if (isNoteLocked) {
        if (Math.abs(smoothCents) > UNLOCK_THRESHOLD_CENTS) {
            isNoteLocked = false;
            lockDuration = 0;
            targetCents = smoothCents;
        } else {
            targetCents = 0; 
            guideMsg.textContent = "PERFECT";
        }
    } else {
        targetCents = smoothCents;
        if (Math.abs(smoothCents) <= LOCK_TOLERANCE_CENTS) {
            lockDuration++;
            if (lockDuration > LOCK_REQUIRED_FRAMES) {
                isNoteLocked = true;
                
                // 완료 기록
                tunedStrings.add(noteName + octave);
                highlightStringBtn(noteName, octave, true);
                
                playSuccessSound();
                targetCents = 0; 
            }
        } else {
            lockDuration = 0; 
        }
    }
    renderTextUI(noteName, octave, Math.round(targetCents), frequency, isNoteLocked);
}

function renderTextUI(note, octave, cents, frequency, isLocked) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    if(!isLocked) freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    let displayStr = "";
    if (isLocked) displayStr = "OK";
    else displayStr = (cents > 0 ? "+" : "") + cents;

    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "TUNING...";
    const style = getComputedStyle(document.body);

    if (isLocked) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < -10) { 
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW"; 
    } else if (cents > 10) {
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

    highlightStringBtn(note, octave, isLocked);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(isLocked) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    // 반응 속도 살짝 높임
    const factor = isNoteLocked ? 0.3 : 0.25; 
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 5) percentage = 5; 
    if (percentage > 95) percentage = 95;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();