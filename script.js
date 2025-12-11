// --- 1. 악기 데이터 정의 (필터 범위 및 이조 악기 설정 포함) ---
const instruments = {
    // [기본 슬롯]
    guitar: { name: "GUITAR", icon: "🎸", detail: "6-String", range: [70, 400], strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", icon: "🎸", detail: "4-String", range: [30, 200], strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    
    // [유니버설]
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "All Notes", range: [20, 2000], isChromatic: true, strings: [], columns: 1 },

    // [현악기]
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", range: [200, 500], strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", range: [190, 700], strings: [ { note: "G", octave: 3, freq: 196.00, num: 4 }, { note: "D", octave: 4, freq: 293.66, num: 3 }, { note: "A", octave: 4, freq: 440.00, num: 2 }, { note: "E", octave: 5, freq: 659.25, num: 1 } ], columns: 2 },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", range: [60, 250], strings: [ { note: "C", octave: 2, freq: 65.41, num: 4 }, { note: "G", octave: 2, freq: 98.00, num: 3 }, { note: "D", octave: 3, freq: 146.83, num: 2 }, { note: "A", octave: 3, freq: 220.00, num: 1 } ], columns: 2 },
    doublebass: { name: "D.BASS", icon: "🎻", detail: "Orchestra", range: [30, 200], strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },

    // [관악기] num: 악보상 음, note: 실제 들리는 음
    flute: { name: "FLUTE", icon: "🎼", detail: "Standard", range: [200, 1000], strings: [ { note: "A", octave: 4, freq: 440.00, num: "A" }, { note: "A#", octave: 4, freq: 466.16, num: "Bb" } ], columns: 2 },
    clarinet: { name: "CLARINET", icon: "🎷", detail: "Bb-Key", range: [100, 800], strings: [ { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, { note: "F", octave: 4, freq: 349.23, num: "G" } ], columns: 2 },
    sax_alto: { name: "A.SAX", icon: "🎷", detail: "Eb-Key", range: [100, 800], strings: [ { note: "D#", octave: 3, freq: 311.13, num: "Low C" }, { note: "A#", octave: 3, freq: 466.16, num: "G" } ], columns: 2 },
    trumpet: { name: "TRUMPET", icon: "🎺", detail: "Bb-Key", range: [150, 900], strings: [ { note: "A#", octave: 3, freq: 233.08, num: "Low C" }, { note: "F", octave: 4, freq: 349.23, num: "G" } ], columns: 2 }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 2. 유틸리티 클래스: 칼만 필터 (바늘 떨림 보정) ---
class SimpleKalmanFilter {
    constructor(r = 1, q = 1, a = 1, b = 0, c = 1) {
        this.R = r; // 측정 잡음 (높을수록 부드러움)
        this.Q = q; // 반응 속도
        this.A = a; this.B = b; this.C = c;
        this.cov = NaN; this.x = NaN; 
    }
    filter(z) {
        if (isNaN(this.x)) {
            this.x = z; this.cov = this.R;
        } else {
            const predX = this.A * this.x;
            const predCov = ((this.A * this.cov) * this.A) + this.Q;
            const K = predCov * this.C * (1 / ((this.C * predCov * this.C) + this.R));
            this.x = predX + K * (z - (this.C * predX));
            this.cov = predCov - (K * this.C * predCov);
        }
        return this.x;
    }
    reset() { this.x = NaN; this.cov = NaN; }
}

// --- 3. 전역 변수 설정 ---
let currentInstrument = 'guitar';
let currentDynamicInst = null; 
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let isRunning = false; 

// 오디오 필터 체인
let inputSource = null;
let biquadFilter = null; // 노이즈 제거용 LPF
let compressor = null;   // 볼륨 평탄화

// 튜닝 알고리즘 변수
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const tunedStrings = new Set(); 
const kalman = new SimpleKalmanFilter(50, 10); // R=50, Q=10 (부드러운 세팅)

// 상태 감지 변수
let currentDisplayedNote = "--"; 
let currentDisplayedOctave = 0;
let potentialNote = "";          
let noteStabilityCounter = 0;    
const NOTE_CHANGE_THRESHOLD = 8; 

// [핵심] Sticky Locking (쫀득한 고정) 변수
let isNoteLocked = false;
let lockedNote = "";
let lockDuration = 0; 
const LOCK_REQUIRED_FRAMES = 6;  // 6프레임 연속 정조준 시 잠금
const UNLOCK_THRESHOLD_CENTS = 15; // ±15센트 이상 벗어나야 잠금 해제 (관용도 높음)

// 화면 표시 변수
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

// Modal Elements
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynIcon = document.getElementById('dyn-icon');
const dynName = document.getElementById('dyn-name');
const dynDetail = document.getElementById('dyn-detail');

// --- 4. 초기화 및 이벤트 리스너 ---
function init() {
    renderStringButtons(currentInstrument);
    
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

// --- 5. UI 및 악기 제어 함수 ---
function activateInstrument(instKey, cardElement) {
    instCards.forEach(c => c.classList.remove('active'));
    cardElement.classList.add('active');
    
    currentInstrument = instKey;
    tunedStrings.clear(); 
    
    if(isRunning) applyInstrumentFilter(); // 필터 범위 재조정

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
        // str.num은 화면 표시용 (예: 6, A, Low C)
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        stringContainer.appendChild(btn);
    });
}

function highlightStringBtn(noteName, octave, isLocked) {
    if (instruments[currentInstrument].isChromatic) return;

    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        const btnKey = btn.dataset.note + btn.dataset.octave;
        btn.classList.remove('detected', 'locked', 'tuned');
        if (tunedStrings.has(btnKey)) btn.classList.add('tuned');
        if (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave) {
            btn.classList.remove('tuned'); 
            btn.classList.add(isLocked ? 'locked' : 'detected');
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

// --- 6. 오디오 처리 코어 ---
function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // 에코 캔슬러 켜서 피드백 방지
        const constraints = { audio: { echoCancellation: true, autoGainControl: false, noiseSuppression: true } };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        inputSource = audioContext.createMediaStreamSource(mediaStream);
        
        // 압축기 (Compressor): 큰 소리는 누르고 작은 소리는 키워서 분석 용이하게
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        // 필터 (LPF): 고주파 노이즈 제거
        biquadFilter = audioContext.createBiquadFilter();
        biquadFilter.type = "lowpass"; 
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;

        inputSource.connect(compressor);
        compressor.connect(biquadFilter);
        biquadFilter.connect(analyser);

        applyInstrumentFilter();

        isRunning = true;
        kalman.reset();
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
    kalman.reset();

    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
        if (keepTuned) {
            const key = b.dataset.note + b.dataset.octave;
            if (tunedStrings.has(key)) b.classList.add('tuned');
        } else {
            b.classList.remove('tuned');
        }
    });
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // RMS(볼륨) 계산 - 노이즈 게이트
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    
    // [중요 개선] 소리가 작아졌을 때 처리
    if (rms < 0.015) { 
        // 이미 락이 걸려있다면(성공 상태), 소리가 줄어들어도 화면을 리셋하지 않고 유지
        if (isNoteLocked) {
             // 유지 (사용자가 볼 수 있도록)
        } else {
             // 락이 안 걸렸는데 소리가 끊기면 천천히 리셋
             if(noteStabilityCounter > 0) noteStabilityCounter--;
             else if (targetCents !== 0) {
                 targetCents = 0;
             }
        }
        requestAnimationFrame(processAudio);
        return;
    }

    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    if (pitch !== -1) updateTuner(pitch);
    requestAnimationFrame(processAudio);
}

// YIN Pitch Detection Algorithm
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
    
    // 악기별 유효 범위 체크
    const range = instruments[currentInstrument].range || [25, 2000];
    if (pitchInHz > range[0] && pitchInHz < range[1]) return pitchInHz;
    return -1;
}

function updateTuner(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    let rawCents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));

    const detectedNoteKey = noteName + octave;
    const currentNoteKey = currentDisplayedNote + currentDisplayedOctave;

    // 노트 변경 감지 및 안정화
    if (currentDisplayedNote === "--" || detectedNoteKey === currentNoteKey) {
        noteStabilityCounter = NOTE_CHANGE_THRESHOLD; 
        processCentsAndLocking(noteName, octave, rawCents, frequency);
    } else {
        if (potentialNote === detectedNoteKey) noteStabilityCounter++;
        else { potentialNote = detectedNoteKey; noteStabilityCounter = 0; }

        if (noteStabilityCounter > NOTE_CHANGE_THRESHOLD) {
            currentDisplayedNote = noteName;
            currentDisplayedOctave = octave;
            isNoteLocked = false; lockDuration = 0; kalman.reset();
            processCentsAndLocking(noteName, octave, rawCents, frequency);
        }
    }
}

// --- 7. UI 업데이트 및 락킹 로직 (Hysteresis) ---
function processCentsAndLocking(noteName, octave, rawCents, frequency) {
    // 1. 칼만 필터로 보정
    const smoothCents = kalman.filter(rawCents);

    // 2. 락킹 로직
    if (isNoteLocked) {
        // 이미 락이 걸린 상태: UNLOCK_THRESHOLD(15) 이상 벗어나야 해제됨
        // 줄의 진동이 줄어들며 피치가 약간 떨어져도 락을 유지함
        if (Math.abs(smoothCents) > UNLOCK_THRESHOLD_CENTS) {
            isNoteLocked = false;
            lockDuration = 0;
            targetCents = smoothCents;
        } else {
            // 허용 범위 내라면 무조건 0(PERFECT) 유지
            targetCents = 0;
            guideMsg.textContent = "PERFECT";
            guideMsg.style.color = "var(--accent-green)";
        }
    } else {
        targetCents = smoothCents;
        // ±3 센트 이내면 카운트 증가
        if (Math.abs(smoothCents) <= 3) {
            lockDuration++;
            // 연속 프레임 만족 시 락 설정
            if (lockDuration > LOCK_REQUIRED_FRAMES) {
                isNoteLocked = true;
                lockedNote = noteName;
                tunedStrings.add(noteName + octave);
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
    
    const displayStr = isLocked ? "OK" : ((cents > 0 ? "+" : "") + cents);
    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "PERFECT";
    const style = getComputedStyle(document.body);

    if (isLocked) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < -3) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW";
    } else if (cents > 3) {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH";
    } else {
        colorVar = style.getPropertyValue('--accent-green');
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
    // 락 걸리면 빠르게, 아니면 부드럽게 이동
    const factor = isNoteLocked ? 0.4 : 0.15;
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();