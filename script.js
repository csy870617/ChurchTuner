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
let source = null;
let isRunning = false; 
let rafId = null; 

// 오디오 처리 변수 (YIN 알고리즘용)
const BUF_SIZE = 4096; // 해상도 높임
const buf = new Float32Array(BUF_SIZE);
const yinBuffer = new Float32Array(BUF_SIZE / 2); // YIN 계산용 버퍼

// 안정화 버퍼
const stableBuffer = []; 
const STABILITY_THRESHOLD = 2; // 반응 속도 향상

// 튜닝 완료 기록
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
const guideMsg = document.getElementById('guide-msg');
const modeBadge = document.getElementById('mode-badge');
const stringContainer = document.getElementById('string-container');
const resetModeBtn = document.getElementById('reset-mode-btn');
const instCards = document.querySelectorAll('.inst-card');

function init() {
    renderStringButtons(currentInstrument);
    
    instCards.forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            tunedStrings.clear();
            setManualMode(null);
            renderStringButtons(currentInstrument);
        });
    });

    resetModeBtn.addEventListener('click', () => setManualMode(null));
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
        btn.dataset.freq = str.freq;
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        
        btn.addEventListener('click', () => {
            setManualMode(str);
        });
        stringContainer.appendChild(btn);
    });
}

function setManualMode(stringData) {
    if (stringData) {
        targetFrequency = stringData.freq;
        modeBadge.textContent = `TARGET: ${stringData.num}번줄 (${stringData.note})`;
        modeBadge.classList.add('manual');
        resetModeBtn.classList.remove('hidden');
        guideMsg.textContent = "잡음 차단 모드";
        guideMsg.style.color = "var(--accent-yellow)";
    } else {
        targetFrequency = null;
        modeBadge.textContent = "AUTO MODE";
        modeBadge.classList.remove('manual');
        resetModeBtn.classList.add('hidden');
        guideMsg.textContent = "줄을 튕겨주세요";
        guideMsg.style.color = "#888";
    }
    updateButtonStyles(stringData ? stringData.freq : null);
    resetUI();
}

function updateButtonStyles(activeFreq) {
    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        const freq = parseFloat(btn.dataset.freq);
        btn.classList.remove('manual-target');
        
        if (activeFreq && Math.abs(freq - activeFreq) < 0.1) {
            btn.classList.add('manual-target');
        }
        
        // 튜닝 완료 상태 표시
        const key = freq.toFixed(2);
        if (tunedStrings.has(key) && !btn.classList.contains('manual-target')) {
            btn.classList.add('tuned');
        } else {
            btn.classList.remove('tuned');
        }
    });
}

// --- 오디오 엔진 관리 (버튼 클릭 문제 해결) ---
function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

async function startTuner() {
    if (isRunning) return;

    try {
        // 1. AudioContext 생성 또는 재개 (사용자 제스처 필수)
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // 2. 마이크 권한 요청
        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, 
                noiseSuppression: false,
                latency: 0
            } 
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        
        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); 
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        
        processAudio();
    } catch (err) { 
        console.error(err); 
        alert("마이크를 켤 수 없습니다. 브라우저 설정을 확인해주세요."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); 
    btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    resetUI();
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";

    if (rafId) cancelAnimationFrame(rafId);
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (source) source.disconnect();
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.left = "50%";
    
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
    });
}

// --- 오디오 처리 (YIN 알고리즘: 잡음 제거 특화) ---
function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // 1. 볼륨 체크 (RMS)
    let rms = 0;
    for (let i = 0; i < BUF_SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / BUF_SIZE);

    // 노이즈 게이트 (0.015): 너무 작은 소리는 무시
    if (rms < 0.015) {
        handleSilence();
        rafId = requestAnimationFrame(processAudio);
        return;
    }

    // 2. 피치 감지 (YIN Algorithm)
    const pitch = getPitchYIN(buf, audioContext.sampleRate);

    if (pitch !== -1) {
        // 매뉴얼 모드 필터: 타겟 주파수와 ±15% 이상 차이나면 무시 (강력한 필터링)
        if (targetFrequency) {
            const ratio = pitch / targetFrequency;
            if (ratio < 0.85 || ratio > 1.15) {
                handleSilence(); // 범위 밖 소음
                rafId = requestAnimationFrame(processAudio);
                return;
            }
        }

        // 안정화 버퍼 업데이트
        updateStableBuffer(pitch);

        if (stableBuffer.length >= STABILITY_THRESHOLD) {
            const avgPitch = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
            silenceTimer = 0;
            updateTuner(avgPitch);
        }
    } else {
        handleSilence(); // 피치 감지 실패 (잡음)
    }

    rafId = requestAnimationFrame(processAudio);
}

// YIN Pitch Detection (간소화 버전) - 잡음과 톤을 구분하는 능력이 뛰어남
function getPitchYIN(buffer, sampleRate) {
    const threshold = 0.15; // 낮을수록 엄격함 (잡음 제거율 ↑)
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

    // Step 1: Difference Function
    for (let tau = 0; tau < yinBuffer.length; tau++) yinBuffer[tau] = 0;
    
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
        if (runningSum === 0) yinBuffer[tau] = 1;
        else yinBuffer[tau] *= tau / runningSum;
    }

    // Step 3: Absolute Threshold
    // 그래프의 골짜기(Dip)가 임계값보다 낮아야 "음정"으로 인정
    // 키보드 소리, 박수 소리는 이 조건에서 대부분 걸러짐
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

    // 범위 체크 (30Hz ~ 1500Hz)
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

function handleSilence() {
    silenceTimer++;
    if (silenceTimer > 20) { 
        targetCents = 0;
        stableBuffer.length = 0;
        if (silenceTimer > 60) resetUI(true);
    }
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
        
        // 튜닝 완료 기록
        if (targetFrequency) {
            tunedStrings.add(targetFrequency.toFixed(2));
        } else {
            markClosestStringAsTuned(frequency);
        }
        updateButtonStyles(targetFrequency);
        
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
    }
    centsEl.classList.remove('hidden');
    
    // 하단 버튼 하이라이트 (오토/매뉴얼 공통)
    highlightClosestString(frequency);
}

function markClosestStringAsTuned(freq) {
    const btns = document.querySelectorAll('.string-btn');
    let closest = null;
    let minDiff = Infinity;
    btns.forEach(btn => {
        const btnFreq = parseFloat(btn.dataset.freq);
        const diff = Math.abs(freq - btnFreq);
        if (diff < 5) {
            closest = btnFreq.toFixed(2);
        }
    });
    if (closest) tunedStrings.add(closest);
}

function highlightClosestString(frequency) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        // 매뉴얼 모드 타겟은 건드리지 않음
        if (btn.classList.contains('manual-target')) return;

        btn.classList.remove('detected', 'locked');
        // 튜닝 완료 상태 복구
        const freqKey = parseFloat(btn.dataset.freq).toFixed(2);
        if (tunedStrings.has(freqKey)) {
            btn.classList.add('tuned');
        } else {
            btn.classList.remove('tuned');
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        // Cents 차이 (정확도)
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    if (closestBtn && minDiff < 300) {
        closestBtn.classList.remove('tuned'); 
        // 오차 3 이내면 locked(초록), 아니면 detected(파랑)
        closestBtn.classList.add(minDiff <= 3 ? 'locked' : 'detected');
    }
}

function updateVisualizer() {
    displayCents += (targetCents - displayCents) * 0.3; // 부드러운 움직임
    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();