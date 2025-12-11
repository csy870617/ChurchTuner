// --- 1. 악기 데이터 (주파수 범위 엄격 제한) ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "6-String", range: [65, 1200], strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", icon: "🎸", detail: "4-String", range: [30, 400], strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "All Notes", range: [20, 4000], isChromatic: true, strings: [], columns: 1 },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", range: [200, 1000], strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", range: [180, 1500], strings: [ { note: "G", octave: 3, freq: 196.00, num: 4 }, { note: "D", octave: 4, freq: 293.66, num: 3 }, { note: "A", octave: 4, freq: 440.00, num: 2 }, { note: "E", octave: 5, freq: 659.25, num: 1 } ], columns: 2 },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", range: [60, 600], strings: [ { note: "C", octave: 2, freq: 65.41, num: 4 }, { note: "G", octave: 2, freq: 98.00, num: 3 }, { note: "D", octave: 3, freq: 146.83, num: 2 }, { note: "A", octave: 3, freq: 220.00, num: 1 } ], columns: 2 },
    doublebass: { name: "D.BASS", icon: "🎻", detail: "Orchestra", range: [30, 300], strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    flute: { name: "FLUTE", icon: "🎼", detail: "Standard", range: [200, 2000], strings: [ { note: "A", octave: 4, freq: 440.00, num: "A" }, { note: "A#", octave: 4, freq: 466.16, num: "Bb" } ], columns: 2 },
    clarinet: { name: "CLARINET", icon: "🎷", detail: "Bb-Key", range: [100, 1500], strings: [ { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, { note: "F", octave: 4, freq: 349.23, num: "G" } ], columns: 2 },
    sax_alto: { name: "A.SAX", icon: "🎷", detail: "Eb-Key", range: [100, 1200], strings: [ { note: "D#", octave: 3, freq: 311.13, num: "Low C" }, { note: "A#", octave: 3, freq: 466.16, num: "G" } ], columns: 2 },
    trumpet: { name: "TRUMPET", icon: "🎺", detail: "Bb-Key", range: [150, 1200], strings: [ { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, { note: "F", octave: 4, freq: 349.23, num: "G" } ], columns: 2 }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 2. 안정화 유틸리티 (이동 평균) ---
class RollingAverage {
    constructor(size) {
        this.size = size;
        this.buffer = [];
    }
    add(value) {
        // 급격한 변화(튀는 값) 필터링
        if (this.buffer.length > 0) {
            const last = this.buffer[this.buffer.length - 1];
            // 이전 값과 100센트 이상 차이나면 일시적인 오류로 간주하고 무시하거나 완충
            if (Math.abs(last - value) > 100) return; 
        }
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
let biquadFilter = null; 
let compressor = null;   

const BUF_SIZE = 4096; // 버퍼 사이즈 4096 (저음 인식률 확보)
const buf = new Float32Array(BUF_SIZE);
const tunedStrings = new Set(); 

// [보정] 이동 평균 필터 (12개 샘플)
const smoother = new RollingAverage(12);

let currentDisplayedNote = "--"; 
let currentDisplayedOctave = 0;
let potentialNote = "";          
let noteStabilityCounter = 0;    

// [필수 기능] 어택 과도응답 무시: 소리가 나고 처음 몇 프레임은 무시해야 정확함
const TRANSIENT_SKIP_FRAMES = 3; 

// [필수 기능] 노트 고정 임계값
const NOTE_CHANGE_THRESHOLD = 5; 

// 락킹(고정) 설정
let isNoteLocked = false;
let lockedNote = "";
let lockDuration = 0; 

// [사용자 편의성]
const LOCK_REQUIRED_FRAMES = 8;  
const LOCK_TOLERANCE_CENTS = 10; // ±10센트면 OK
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

function highlightStringBtn(noteName, octave, isLocked) {
    if (instruments[currentInstrument].isChromatic) return;
    const btns = document.querySelectorAll('.string-btn');
    
    btns.forEach(btn => {
        const btnKey = btn.dataset.note + btn.dataset.octave;
        btn.classList.remove('detected', 'locked');

        if (tunedStrings.has(btnKey)) {
            btn.classList.add('tuned');
        } else {
            btn.classList.remove('tuned');
        }

        if (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave) {
            if (isLocked) {
                btn.classList.add('tuned');
                btn.classList.remove('detected', 'locked');
            } else {
                if (!btn.classList.contains('tuned')) {
                    btn.classList.add('detected');
                }
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

// --- 5. 오디오 처리 ---
function toggleTuner() { if (isRunning) stopTuner(); else startTuner(); }

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const constraints = { audio: { echoCancellation: true, autoGainControl: false, noiseSuppression: true } };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        inputSource = audioContext.createMediaStreamSource(mediaStream);
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.ratio.value = 12;

        biquadFilter = audioContext.createBiquadFilter();
        biquadFilter.type = "lowpass"; 
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(compressor);
        compressor.connect(biquadFilter);
        biquadFilter.connect(analyser);

        applyInstrumentFilter();

        isRunning = true;
        smoother.reset();
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        processAudio();
    } catch (err) { console.error(err); alert("마이크 권한이 필요합니다."); }
}

function applyInstrumentFilter() {
    if(!biquadFilter) return;
    const instData = instruments[currentInstrument];
    const maxFreq = instData.range ? instData.range[1] * 2.5 : 2000; 
    biquadFilter.frequency.value = maxFreq;
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
    isNoteLocked = false; lockedNote = ""; lockDuration = 0;
    smoother.reset();
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
    
    // 볼륨 체크 (RMS)
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    
    // [필수] 소음 차단
    if (rms < 0.015) { 
        if (!isNoteLocked) {
             if(noteStabilityCounter > 0) noteStabilityCounter--;
             else if (Math.abs(targetCents) > 1) {
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

// [기술] 개선된 YIN 알고리즘 (옥타브 오류 보정 포함)
function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15;
    const bufferSize = buffer.length;
    let tauEstimate = -1; let pitchInHz = -1;
    const yinBuffer = new Float32Array(bufferSize / 2);
    yinBuffer[0] = 1; let runningSum = 0;
    
    // 1. Difference Function
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

    // 2. Absolute Threshold
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau; break;
        }
    }

    // 3. Parabolic Interpolation
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

    // [필수] 범위 체크
    const range = instruments[currentInstrument].range || [25, 2000];
    if (pitchInHz < range[0] || pitchInHz > range[1]) return -1;

    // [필수] 옥타브 오류(Octave Error) 보정
    // 감지된 피치가 기본음이 아니라 2배음(한 옥타브 위)일 확률이 높으므로
    // 절반 주파수(0.5 * pitch) 근처에도 에너지가 있는지 확인
    // (이 로직은 YIN 버퍼를 다시 확인하는 방식으로 단순화하여 적용)
    
    // 만약 감지된 피치가 예상보다 너무 높다면(배음일 가능성),
    // 튜너 로직(findClosestString)에서 강제로 줄에 맞게 보정하도록 처리합니다.

    return pitchInHz;
}

// [핵심] 지능형 줄 감지 로직 (Nearest String Logic + Octave Correction)
function findClosestString(frequency) {
    const instData = instruments[currentInstrument];
    
    if (instData.isChromatic) {
        const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
        const noteRound = Math.round(noteNum) + 69;
        const noteName = noteStrings[noteRound % 12];
        const octave = Math.floor(noteRound / 12) - 1;
        const perfectFreq = 440 * Math.pow(2, (noteRound - 69) / 12);
        return { note: noteName, octave: octave, targetFreq: perfectFreq };
    }

    let minDiff = Infinity;
    let closestStr = null;

    instData.strings.forEach(str => {
        // [배음 보정] 입력 주파수가 줄의 주파수(f)일 수도 있고, 2배수(2f), 3배수(3f)일 수도 있음
        // 입력 주파수를 줄의 주파수로 나눴을 때 정수에 가까우면 해당 줄일 확률이 높음
        
        let diff = Math.abs(frequency - str.freq);
        
        // 2배음 체크 (예: 164Hz가 들어왔는데 6번줄 82Hz인지 확인)
        const diff2 = Math.abs(frequency - (str.freq * 2));
        
        // 만약 2배음과의 거리가 매우 가깝다면(10Hz 이내), 이것은 6번줄의 배음일 가능성이 큼
        // -> 거리를 0으로 간주해서 해당 줄을 선택하게 유도
        if (diff2 < 20) {
            diff = diff2 / 4; // 가중치 줘서 우선 선택
        }

        if (diff < minDiff) {
            minDiff = diff;
            closestStr = str;
        }
    });

    return { 
        note: closestStr.note, 
        octave: closestStr.octave, 
        targetFreq: closestStr.freq 
    };
}

function updateTuner(frequency) {
    const match = findClosestString(frequency);
    
    // Cents 계산
    let rawCents = 1200 * Math.log2(frequency / match.targetFreq);
    
    // [보정] 배음(옥타브 위)이 잡혔을 경우 Cents가 +1200이 됨. 이를 0으로 보정
    while (rawCents > 600) rawCents -= 1200;
    while (rawCents < -600) rawCents += 1200;

    const detectedNoteKey = match.note + match.octave;
    const currentNoteKey = currentDisplayedNote + currentDisplayedOctave;

    // [필수] 어택 과도응답 무시 (노트 변경 초반 무시)
    if (currentDisplayedNote === "--" || detectedNoteKey === currentNoteKey) {
        if(noteStabilityCounter < 20) noteStabilityCounter++;
        
        // 안정화된 후에만 값 업데이트
        if (noteStabilityCounter > TRANSIENT_SKIP_FRAMES) {
            processCentsAndLocking(match.note, match.octave, rawCents, frequency);
        }
    } else {
        // 노트가 바뀜
        if (potentialNote === detectedNoteKey) {
            noteStabilityCounter++;
        } else {
            potentialNote = detectedNoteKey;
            noteStabilityCounter = 0; 
        }

        if (noteStabilityCounter > NOTE_CHANGE_THRESHOLD) {
            currentDisplayedNote = match.note;
            currentDisplayedOctave = match.octave;
            isNoteLocked = false; lockDuration = 0; 
            smoother.reset(); 
            // 바로 업데이트 하지 않고 다음 프레임부터
        }
    }
}

function processCentsAndLocking(noteName, octave, rawCents, frequency) {
    smoother.add(rawCents);
    const smoothCents = smoother.getAverage();

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
                lockedNote = noteName;
                
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
    const factor = isNoteLocked ? 0.2 : 0.15; 
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 5) percentage = 5; 
    if (percentage > 95) percentage = 95;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();