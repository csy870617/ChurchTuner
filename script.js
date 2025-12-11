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

// [성능 및 안정화 변수]
const FFT_SIZE = 2048; 
const buffer = new Float32Array(FFT_SIZE); 
let lastSuccessTime = 0;

// [떨림 방지 핵심] 중앙값 필터용 버퍼
const medianBuffer = [];
const MEDIAN_SIZE = 5; // 최근 5개의 값 중 중간값만 취함 (떨림 완벽 제거)

// 물리 엔진 변수
let currentCents = 0; 
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
    requestAnimationFrame(uiLoop);
}

function resetTarget() {
    targetFrequency = null;
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
    const now = Date.now();
    if (now - lastSuccessTime < 800) return; 
    if (!audioContext) return;
    
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); 
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.6);
    lastSuccessTime = now;
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
                noiseSuppression: false, 
                latency: 0 
            } 
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE; 
        analyser.smoothingTimeConstant = 0; 

        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        
        analyzeLoop();
    } catch (err) { 
        console.error(err); 
        alert("마이크 권한 오류"); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    resetUI();
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked'));
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";

    if (rafId) cancelAnimationFrame(rafId);
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (source) source.disconnect();
}

function resetUI() {
    noteNameEl.classList.remove('active'); 
    noteNameEl.textContent = "--"; 
    octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; 
    centsEl.classList.add('hidden');
    targetCents = 0; 
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
}

function analyzeLoop() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buffer);
    const rawFreq = performAutocorrelation(buffer, audioContext.sampleRate);

    // [핵심 해결책] 1. 값이 튈 때는 무시하고, 안정적인 값만 필터링
    const stableFreq = getMedianFrequency(rawFreq);

    if (stableFreq !== -1 && stableFreq > 40 && stableFreq < 1500) {
        if (targetFrequency) {
            const ratio = stableFreq / targetFrequency;
            if (ratio < 0.7 || ratio > 1.3) {
                handleSilence();
                rafId = requestAnimationFrame(analyzeLoop);
                return;
            }
        }
        silenceTimer = 0; 
        updateTunerState(stableFreq);
    } else {
        handleSilence();
    }

    rafId = requestAnimationFrame(analyzeLoop);
}

// [핵심] 중앙값 필터 (Median Filter) - 떨림 방지 일등공신
function getMedianFrequency(newFreq) {
    if (newFreq === -1) {
        // 소리가 끊기면 버퍼를 비우지 않고 -1만 리턴 (잔향 처리)
        // 너무 오래 -1이면 handleSilence에서 처리됨
        return -1;
    }

    medianBuffer.push(newFreq);
    if (medianBuffer.length > MEDIAN_SIZE) medianBuffer.shift();

    // 버퍼가 덜 찼으면 그냥 현재 값 리턴 (초기 반응속도 확보)
    if (medianBuffer.length < 3) return newFreq;

    // 복사본을 만들어서 정렬 (원본 순서 유지)
    const sorted = [...medianBuffer].sort((a, b) => a - b);
    
    // 중앙값 리턴 (튀는 노이즈 제거)
    return sorted[Math.floor(sorted.length / 2)];
}

function handleSilence() {
    silenceTimer++;
    if (silenceTimer > 15) { // 0.25초 이상 조용하면 바늘 리셋
        // 천천히 중앙으로 가기 위해 targetCents만 0으로
        targetCents = 0; 
        if (silenceTimer > 100) resetUI(); // 아주 오래 조용하면 텍스트도 끔
    }
}

function performAutocorrelation(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) { const val = buf[i]; rms += val * val; }
    rms = Math.sqrt(rms / size);
    
    // 노이즈 게이트: 삼성 인터넷의 고감도 마이크를 고려하여 약간 높임
    if (rms < 0.012) return -1;

    let r1 = Math.floor(sampleRate / 1500); 
    let r2 = Math.floor(sampleRate / 40);
    if (r2 > size) r2 = size;

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        // 삼성 브라우저 성능 이슈 방지를 위해 2칸씩 건너뛰며 샘플링 (정밀도 유지, 속도 2배)
        for (let i = 0; i < size - offset; i += 2) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        // 샘플 수가 절반이므로 정규화 식 조정
        correlation = 1 - (correlation / (size / 2)); 

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // 상관관계 기준: 94% (떨림 방지)
    if (bestCorrelation < 0.94) return -1;

    return sampleRate / bestOffset;
}

function updateTunerState(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    const cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));
    
    targetCents = cents;
    renderTextUI(noteName, octave, cents, frequency);
}

function renderTextUI(note, octave, cents, frequency) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    centsEl.textContent = (cents > 0 ? "+" : "") + cents; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "PERFECT";
    let isLocked = false;
    const style = getComputedStyle(document.body);

    if (Math.abs(cents) <= 4) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
        isLocked = true;
        playSuccessSound(); 
    } else if (cents < 0) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW (TIGHTEN)";
    } else {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH (LOOSEN)";
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

// UI 루프 (물리 엔진: 무거운 바늘 느낌)
function uiLoop() {
    // Lerp 계수 0.15: 묵직하게 움직임 (떨림 시각적 보정)
    currentCents += (targetCents - currentCents) * 0.15;

    let percentage = 50 + currentCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;

    requestAnimationFrame(uiLoop);
}

init();