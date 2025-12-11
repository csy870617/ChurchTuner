// --- 악기 데이터 (표준 튜닝) ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let isRunning = false; 

// 오디오 처리
const BUF_SIZE = 4096; // 2048 -> 4096 (해상도 2배 향상: 저음/고음 분리능 강화)
const buf = new Float32Array(BUF_SIZE);

// [핵심] 주파수 잠금 시스템 변수
let lockedFrequency = 0;   // 현재 잡고 있는 기준 주파수
let lockCounter = 0;       // 잠금 유지 카운터
const LOCK_THRESHOLD = 5;  // 5프레임 연속 감지 시 잠금
const UNLOCK_SILENCE = 15; // 15프레임 침묵 시 잠금 해제

// 안정화 버퍼
const stableBuffer = []; 
const STABILITY_THRESHOLD = 3; 

const tunedStrings = new Set(); 

// 화면 갱신용
let displayCents = 0; 
let targetCents = 0;
let silenceTimer = 0;

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

function init() {
    renderStringButtons(currentInstrument);
    
    instCards.forEach(card => {
        card.addEventListener('click', () => {
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            tunedStrings.clear(); 
            resetUI(false);
            renderStringButtons(currentInstrument);
        });
    });
    startBtn.addEventListener('click', toggleTuner);
    requestAnimationFrame(updateVisualizer);
}

function renderStringButtons(instType) {
    const data = instruments[instType];
    stringContainer.innerHTML = ''; 
    stringContainer.style.gridTemplateColumns = `repeat(${data.columns}, 1fr)`;
    data.strings.forEach(str => {
        const btn = document.createElement('button');
        btn.className = 'string-btn';
        btn.dataset.note = str.note; btn.dataset.octave = str.octave;
        btn.dataset.freq = str.freq; // 주파수 정보 필수
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        // 버튼 클릭 기능 제거 (순수 오토 모드)
        stringContainer.appendChild(btn);
    });
}

// 가장 가까운 줄 찾아서 불 켜기
function highlightClosestString(frequency, isLocked) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        const btnKey = btn.dataset.note + btn.dataset.octave;
        
        // 기존 상태 초기화 (tuned는 제외)
        if (!tunedStrings.has(btnKey)) {
            btn.classList.remove('detected', 'locked', 'tuned');
        } else {
            btn.classList.remove('detected', 'locked'); 
            btn.classList.add('tuned');
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        // 주파수 차이 비교 (Log scale)
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    // 오차 300센트(반음 3개) 이내일 때만 해당 줄로 인식
    if (closestBtn && minDiff < 300) {
        closestBtn.classList.remove('tuned'); 
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
    }
}

function playSuccessSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); 
    gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.6);
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
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } 
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
    } catch (err) { console.error(err); alert("마이크 권한이 필요합니다."); }
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
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    
    // 상태 변수 초기화
    lockedFrequency = 0;
    lockCounter = 0;

    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
        if (!keepTuned) b.classList.remove('tuned');
    });
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // 1. 피치 감지 (YIN Algorithm)
    const rawPitch = yinPitchDetection(buf, audioContext.sampleRate);
    
    // 2. [핵심] 주파수 잠금 (Frequency Locking) 로직
    let finalPitch = -1;

    if (rawPitch !== -1) {
        silenceTimer = 0; // 소리 있음

        if (lockedFrequency === 0) {
            // 잠긴 줄이 없으면 안정화 버퍼에 쌓음
            updateStableBuffer(rawPitch);
            
            // 안정적인 값이 모이면 잠금 시작!
            if (stableBuffer.length >= STABILITY_THRESHOLD) {
                const avg = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
                lockedFrequency = avg; // 현재 주파수를 기준으로 잠금
                lockCounter = 0;
                finalPitch = avg;
            }
        } else {
            // 이미 잠긴 줄이 있으면, 그 주변 소리인지 확인
            // 허용 범위: ±20% (꽤 넓게 잡아서 비브라토나 튜닝 중 변화 허용)
            // 하지만 다른 줄(보통 30% 이상 차이남)은 차단됨
            const ratio = rawPitch / lockedFrequency;
            if (ratio > 0.8 && ratio < 1.2) {
                // 범위 내 소리면 업데이트하고 잠금 기준도 살짝 최신화 (Follow)
                finalPitch = rawPitch;
                lockedFrequency = rawPitch; 
                lockCounter = 0;
            } else {
                // 범위 밖 소리(다른 줄 간섭)면 무시!
                // 단, 아주 오랫동안 다른 소리가 나면 사용자가 줄을 바꾼 것임
                lockCounter++;
                if (lockCounter > 20) { // 약 0.3초 이상 다른 소리면 잠금 해제
                    lockedFrequency = 0;
                    stableBuffer.length = 0;
                }
            }
        }
    } else {
        // 소리가 안 들림 (Silence)
        silenceTimer++;
        if (silenceTimer > UNLOCK_SILENCE) {
            // 소리가 멈추면 잠금 해제
            lockedFrequency = 0;
            stableBuffer.length = 0;
            if (targetCents !== 0) {
                targetCents = 0;
                if (silenceTimer > 60) resetUI(true);
            }
        }
    }

    // 최종 결정된 피치로 UI 업데이트
    if (finalPitch !== -1) {
        updateTuner(finalPitch);
    }

    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15;
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

    // RMS 체크 (노이즈 게이트)
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) { rms += buffer[i] * buffer[i]; }
    rms = Math.sqrt(rms / bufferSize);
    
    // 1번 줄 인식을 위해 게이트를 낮춤 (0.005)
    if (rms < 0.005) return -1; 

    const yinBuffer = new Float32Array(bufferSize / 2);
    yinBuffer[0] = 1;
    let runningSum = 0;
    
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
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            tauEstimate = tau;
            break;
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

    if (pitchInHz > 30 && pitchInHz < 1500) return pitchInHz;
    return -1;
}

function updateStableBuffer(pitch) {
    if (stableBuffer.length > 0) {
        const last = stableBuffer[stableBuffer.length - 1];
        // 급격한 변화(옥타브 튐) 방지
        if (Math.abs(last - pitch) > 10) stableBuffer.length = 0;
    }
    stableBuffer.push(pitch);
    if (stableBuffer.length > STABILITY_THRESHOLD) stableBuffer.shift();
}

function updateTuner(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    let cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));

    targetCents = cents;
    
    // UI 업데이트
    noteNameEl.textContent = noteName;
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    
    const isPerfect = Math.abs(cents) <= 3;
    
    if (isPerfect) {
        centsEl.textContent = "OK";
        tuningIndicator.style.backgroundColor = "var(--accent-green)";
        noteNameEl.style.color = "var(--accent-green)";
        guideMsg.textContent = "PERFECT!";
        guideMsg.style.color = "var(--accent-green)";
        
        // 해당 줄을 완료 목록에 추가 (중복 방지)
        const btnKey = noteName + octave;
        if (!tunedStrings.has(btnKey)) {
            tunedStrings.add(btnKey);
            playSuccessSound(); // 최초 완료 시에만 소리
        }
        highlightClosestString(frequency, true);
        
    } else {
        centsEl.textContent = (cents > 0 ? "+" : "") + cents;
        if (cents < 0) {
            tuningIndicator.style.backgroundColor = "var(--accent-blue)";
            noteNameEl.style.color = "var(--accent-blue)";
            guideMsg.textContent = "TOO LOW ▼";
            guideMsg.style.color = "var(--accent-blue)";
        } else {
            tuningIndicator.style.backgroundColor = "var(--accent-pink)";
            noteNameEl.style.color = "var(--accent-pink)";
            guideMsg.textContent = "TOO HIGH ▲";
            guideMsg.style.color = "var(--accent-pink)";
        }
        highlightClosestString(frequency, false);
    }
    centsEl.classList.remove('hidden');
}

function updateVisualizer() {
    displayCents += (targetCents - displayCents) * 0.2;
    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();