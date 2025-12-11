// --- 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let targetFrequency = null;
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let isRunning = false; 

// [오디오 처리 변수]
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const MIN_SAMPLES = 0; // Will be set based on sample rate

// [핵심] 안정화 버퍼 (소음 차단용)
// 연속으로 5번 이상 같은 음정일 때만 인정
const stableBuffer = []; 
const STABILITY_THRESHOLD = 5; 

// [상태 변수]
let lastNoteName = "--";
let lastCents = 0;
let isNoteLocked = false;
let lockedNote = "";

// 화면 갱신용
let displayCents = 0; 

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
const modeBadge = document.getElementById('mode-badge');
const stringContainer = document.getElementById('string-container');
const resetModeBtn = document.getElementById('reset-mode-btn');
const instCards = document.querySelectorAll('.inst-card');

function init() {
    renderStringButtons(currentInstrument);
    instCards.forEach(card => {
        card.addEventListener('click', () => {
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            resetTarget();
            renderStringButtons(currentInstrument);
        });
    });
    resetModeBtn.addEventListener('click', resetTarget);
    startBtn.addEventListener('click', toggleTuner);
    
    requestAnimationFrame(updateVisualizer); // UI 루프 시작
}

function resetTarget() {
    targetFrequency = null;
    isNoteLocked = false;
    modeBadge.textContent = "AUTO MODE";
    modeBadge.classList.remove('manual');
    resetModeBtn.classList.add('hidden');
    highlightStringBtn(null);
    guideMsg.textContent = isRunning ? "PLAY A STRING..." : "READY TO TUNE";
    guideMsg.style.color = "var(--text-secondary)";
}

function renderStringButtons(instType) {
    const data = instruments[instType];
    stringContainer.innerHTML = ''; 
    stringContainer.style.gridTemplateColumns = `repeat(${data.columns}, 1fr)`;
    data.strings.forEach(str => {
        const btn = document.createElement('button');
        btn.className = 'string-btn';
        btn.dataset.note = str.note; btn.dataset.octave = str.octave;
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        btn.addEventListener('click', () => {
            playReferenceTone(str.freq);
            setTargetMode(str.freq, str.note, str.octave, btn);
        });
        stringContainer.appendChild(btn);
    });
}

function setTargetMode(freq, note, octave, btnElem) {
    targetFrequency = freq;
    isNoteLocked = false;
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked', 'manual-target'));
    btnElem.classList.add('manual-target');
    modeBadge.textContent = `TARGET: ${note}${octave}`;
    modeBadge.classList.add('manual');
    resetModeBtn.classList.remove('hidden');
    guideMsg.textContent = "TUNE TO TARGET";
    guideMsg.style.color = "var(--accent-yellow)";
}

function highlightStringBtn(noteName, octave, isLocked) {
    if (targetFrequency) return;
    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        // 이미 락이 걸려있고, 지금 업데이트가 락 상태라면 건드리지 않음
        if (btn.classList.contains('locked') && isLocked) return;

        btn.classList.remove('detected', 'locked');
        if (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave) {
            btn.classList.add(isLocked ? 'locked' : 'detected');
        }
    });
}

function playReferenceTone(freq) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.0);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + 1.0);
}

function playSuccessSound() {
    if (!audioContext) return;
    // 알림음이 너무 자주 울리지 않도록 UI 상태에서 제어
}

function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

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
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        
        processAudio();
    } catch (err) { console.error(err); alert("마이크 권한 오류"); }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    // 리셋
    displayCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked'));
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";
    isNoteLocked = false;
    lockedNote = "";

    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

// --- 핵심: YIN-like Pitch Detection (소음 제거 특화) ---
function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // 1. 피치 감지 (YIN Algorithm Simplified)
    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    
    if (pitch !== -1) {
        // [소음 필터 2단계] 시간적 안정성 검사
        // 5프레임 연속으로 비슷한 음정이 나와야만 인정 (박수 소리 절대 불가)
        updateStableBuffer(pitch);
    } else {
        // 소리가 없거나 소음이면 버퍼 비움
        stableBuffer.length = 0; 
        
        // 소리가 끊기면 천천히 리셋
        // (즉시 리셋하지 않아 그래프가 부드러움)
    }

    // 버퍼가 가득 차고 안정적일 때만 UI 업데이트
    if (stableBuffer.length >= STABILITY_THRESHOLD) {
        // 평균값 사용
        const avgPitch = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
        
        if (targetFrequency) {
            // 수동 모드 범위 체크
            const ratio = avgPitch / targetFrequency;
            if (ratio > 0.8 && ratio < 1.2) updateTuner(avgPitch);
        } else {
            updateTuner(avgPitch);
        }
    }

    requestAnimationFrame(processAudio);
}

// 잡음과 음악적 톤을 구분하는 가장 강력한 알고리즘
function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15; // 낮을수록 엄격함 (잡음 제거율 ↑)
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

    // 1. RMS 체크 (소리 크기)
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) { rms += buffer[i] * buffer[i]; }
    rms = Math.sqrt(rms / bufferSize);
    if (rms < 0.015) return -1; // 너무 작은 소리는 무시

    // 2. Difference Function (상관관계 분석)
    // 일반 Autocorrelation보다 잡음 구분에 훨씬 뛰어남
    const yinBuffer = new Float32Array(bufferSize / 2);
    
    // Step 1: Calculate Difference
    for (let tau = 0; tau < yinBuffer.length; tau++) {
        yinBuffer[tau] = 0;
    }
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        for (let i = 0; i < yinBuffer.length; i++) {
            const delta = buffer[i] - buffer[i + tau];
            yinBuffer[tau] += delta * delta;
        }
    }

    // Step 2: Cumulative Mean Normalized Difference
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] *= tau / runningSum;
    }

    // Step 3: Absolute Threshold
    // 그래프의 골짜기(Dip)가 임계값보다 낮아야 "음정"으로 인정
    // 박수소리는 이 골짜기가 깊지 않음 -> 여기서 걸러짐
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            tauEstimate = tau;
            break;
        }
    }

    if (tauEstimate !== -1) {
        // 보간법으로 정밀도 향상
        const betterTau = parabolicInterpolation(yinBuffer, tauEstimate);
        pitchInHz = sampleRate / betterTau;
    }

    // 범위 체크 (기타/베이스 범위)
    if (pitchInHz > 30 && pitchInHz < 1500) {
        return pitchInHz;
    }
    return -1;
}

function parabolicInterpolation(array, x) {
    const x1 = (x < 1) ? x : x - 1;
    const x2 = (x + 1 < array.length) ? x + 1 : x;
    const den = array[x2] - array[x1];
    if (den === 0) return x;
    const delta = array[x1] - array[x];
    return x + 0.5 * delta / (den + array[x2] - 2 * array[x]);
}

function updateStableBuffer(pitch) {
    // 값이 너무 튀면 버퍼 리셋 (옥타브 에러 방지)
    if (stableBuffer.length > 0) {
        const last = stableBuffer[stableBuffer.length - 1];
        if (Math.abs(last - pitch) > 5) { // 5Hz 이상 차이나면 다른 소리로 간주
            stableBuffer.length = 0;
        }
    }
    
    stableBuffer.push(pitch);
    if (stableBuffer.length > STABILITY_THRESHOLD) stableBuffer.shift();
}

// --- UI 업데이트 ---
function updateTuner(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    let cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));

    // [락킹 로직]
    const isPerfect = Math.abs(cents) <= 3; // ±3센트 이내

    if (isPerfect) {
        cents = 0; // 자석 효과
        if (!isNoteLocked || lockedNote !== noteName) {
            isNoteLocked = true;
            lockedNote = noteName;
            
            // 알림음 재생 (오디오 컨텍스트 밖에서 호출하여 중복 방지)
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioContext.currentTime); 
            gain.gain.setValueAtTime(0.2, audioContext.currentTime); 
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);
            osc.connect(gain); gain.connect(audioContext.destination);
            osc.start(); osc.stop(audioContext.currentTime + 0.6);
        }
    } else if (Math.abs(cents) > 10) {
        // 오차가 크면 락 해제
        isNoteLocked = false;
        lockedNote = "";
    } else if (isNoteLocked) {
        // 미세한 떨림은 무시하고 0 유지
        cents = 0;
    }

    // UI 변수에 할당 (requestAnimationFrame에서 렌더링)
    targetCents = cents;
    lastNoteName = noteName;
    lastCents = cents;

    // 텍스트는 즉시 업데이트
    renderTextUI(noteName, octave, cents, frequency, isNoteLocked);
}

function renderTextUI(note, octave, cents, frequency, isLocked) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    const displayStr = isLocked ? "OK" : ((cents > 0 ? "+" : "") + cents);
    centsEl.textContent = displayStr; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "PERFECT";
    const style = getComputedStyle(document.body);

    if (isLocked) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < 0) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW";
    } else {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH";
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

// 부드러운 애니메이션
function updateVisualizer() {
    // 락 걸렸을 땐 매우 빠르게 중앙으로, 아닐 땐 부드럽게
    const factor = isNoteLocked ? 0.3 : 0.15;
    
    // 값이 없을 때는 천천히 중앙으로 복귀
    if (stableBuffer.length === 0) {
        targetCents = 0;
    }

    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;

    requestAnimationFrame(updateVisualizer);
}

init();