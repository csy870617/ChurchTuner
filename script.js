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

// [성능 및 노이즈 제어 변수]
const FFT_SIZE = 2048; 
const buffer = new Float32Array(FFT_SIZE); 
let lastSuccessTime = 0;

// 화면 갱신용 물리 엔진 변수
let currentCents = 0; 
let targetCents = 0;
let silenceTimer = 0; // 조용할 때 UI 리셋용 타이머

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
    
    osc.type = 'sine'; 
    osc.frequency.setValueAtTime(880, t); 
    gain.gain.setValueAtTime(0.1, t); 
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.6);
    
    lastSuccessTime = now;
}

// --- 오디오 엔진 ---
function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // [중요] 노이즈 억제 옵션 끄기 (음악적 배음을 살리기 위함)
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
        analyser.smoothingTimeConstant = 0; // 즉각 반응

        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING..."; // 초기 메시지 변경
        
        analyzeLoop();
    } catch (err) { 
        console.error(err); 
        alert("마이크 사용 권한이 필요합니다."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    resetUI(); // UI 초기화
    
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
    targetCents = 0; // 바늘 중앙으로
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
}

// --- 분석 루프 ---
function analyzeLoop() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buffer);
    const freq = performAutocorrelation(buffer, audioContext.sampleRate);

    // [핵심] 1. 소리가 감지되었는가?
    if (freq !== -1 && freq > 40 && freq < 1500) {
        
        // 타겟 모드 필터
        if (targetFrequency) {
            const ratio = freq / targetFrequency;
            // 타겟 주파수의 ±30% 범위가 아니면 무시 (잡음 취급)
            if (ratio < 0.7 || ratio > 1.3) {
                handleSilence();
                rafId = requestAnimationFrame(analyzeLoop);
                return;
            }
        }

        silenceTimer = 0; // 소리가 있으므로 타이머 리셋
        updateTunerState(freq);

    } else {
        // [핵심] 2. 소리가 없거나(잡음) 너무 작으면 침묵 처리
        handleSilence();
    }

    rafId = requestAnimationFrame(analyzeLoop);
}

function handleSilence() {
    silenceTimer++;
    // 약 20프레임(0.3초) 이상 조용하면 UI 리셋 (바늘 튀는 것 방지)
    if (silenceTimer > 20) {
        targetCents = 0; // 바늘 중앙 복귀
        // 텍스트는 바로 지우지 않고 유지하다가 아주 오래되면 지움 (선택사항)
    }
}

// 최적화된 Autocorrelation + Noise Gate
function performAutocorrelation(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;

    // 1. RMS(볼륨) 계산
    for (let i = 0; i < size; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    
    // [초강력 노이즈 게이트]
    // 볼륨이 0.015 미만이면 아예 잡음으로 간주하고 -1 반환 (이 수치로 민감도 조절)
    // 너무 낮으면 잡음 잡고, 너무 높으면 1번줄 못 잡음. 0.015가 적절.
    if (rms < 0.015) return -1;

    // 2. 검색 범위 설정
    let r1 = Math.floor(sampleRate / 1500); // Max Frequency
    let r2 = Math.floor(sampleRate / 40);   // Min Frequency
    if (r2 > size) r2 = size;

    // 3. 상관관계 계산 (Difference Method)
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        
        // 샘플링 간격(skip)을 1로 하여 정밀도 최대화
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        
        // 정규화 (1에 가까울수록 일치)
        correlation = 1 - (correlation / size); 

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // [중요] 상관관계(음의 명확도)가 92% 미만이면 잡음 취급
    // 이 수치를 높일수록 튜너가 깐깐해짐 (잡음 무시)
    if (bestCorrelation < 0.92) return -1;

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

// --- UI 루프 (물리 엔진) ---
function uiLoop() {
    // 바늘이 목표지점으로 매우 빠르게 이동 (0.4 -> 0.6)
    // 값이 높을수록 반응이 빠름 (최대 1.0)
    currentCents += (targetCents - currentCents) * 0.6;

    let percentage = 50 + currentCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;

    requestAnimationFrame(uiLoop);
}

init();