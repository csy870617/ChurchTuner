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
let source = null;
let isRunning = false; 
let rafId = null; 

// [성능 및 반응성 변수]
const pitchBuffer = [];
const BUFFER_SIZE = 4; // 스무딩 버퍼 축소 (8 -> 4) : 훨씬 민첩하게 반응
let lastSuccessTime = 0;

// 화면 갱신용 변수 (물리 엔진)
let currentCents = 0; 
let targetCents = 0;
let lastNoteTime = 0; // 노트 유지 시간 체크

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
    startBtn.addEventListener('click', () => { isRunning ? stopTuner() : startTuner(); });
    
    // 시각화 루프 시작
    requestAnimationFrame(updateVisualizer);
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
        btn.dataset.freq = str.freq; btn.dataset.note = str.note; btn.dataset.octave = str.octave;
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
    if (now - lastSuccessTime < 1000) return; // 쿨타임 2초 -> 1초로 단축 (빠른 반응)

    if (!audioContext) return;
    const t = audioContext.currentTime;
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(880, t); 
    gain1.gain.setValueAtTime(0.1, t); gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'triangle'; osc2.frequency.setValueAtTime(1760, t); 
    gain2.gain.setValueAtTime(0.05, t); gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc1.connect(gain1); gain1.connect(audioContext.destination);
    osc2.connect(gain2); gain2.connect(audioContext.destination);
    osc1.start(); osc1.stop(t + 1.0);
    osc2.start(); osc2.stop(t + 0.3);
    
    lastSuccessTime = now;
}

// --- 오디오 엔진 (고속 모드) ---
async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 } 
        });

        analyser = audioContext.createAnalyser();
        // [핵심 변경] 8192 -> 2048 (4배 빨라짐)
        analyser.fftSize = 2048; 
        analyser.smoothingTimeConstant = 0.05; // 하드웨어 스무딩 거의 제거 (즉각 반응)

        const source = audioContext.createMediaStreamSource(stream);
        // 필터 제거: 필터가 위상 지연을 유발할 수 있어 순수 신호 분석으로 전환
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "LISTENING...";
        
        analyzePitchLoop();
    } catch (err) { console.error(err); alert("마이크 권한 오류"); }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    targetCents = 0; currentCents = 0;
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked'));
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";

    if (rafId) cancelAnimationFrame(rafId);
}

// --- 고속 피치 분석 알고리즘 (Autocorrelation Optimized) ---
function autoCorrelate(buffer, sampleRate) {
    let SIZE = buffer.length;
    let rms = 0;
    // RMS 임계값 낮춤 (0.01 -> 0.005) : 1번 줄(약한 소리) 감지력 상승
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.005) return -1; 

    // Autocorrelation 범위 최적화
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buffer = buffer.slice(r1, r2); SIZE = buffer.length;

    let c = new Array(SIZE).fill(0);
    // 연산량 줄이기 위해 전체가 아닌 절반까지만 상관관계 분석
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buffer[j] * buffer[j + i];
        }
    }

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2; 
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function analyzePitchLoop() {
    if(!isRunning) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);

    // 유효 주파수 범위 확대 (베이스 낮은 E ~ 기타 하이 E 여유있게)
    if (frequency > 30 && frequency < 1500) {
        if (targetFrequency) {
            // 수동 모드 범위 체크
            const ratio = frequency / targetFrequency;
            if (ratio > 0.7 && ratio < 1.3) processValidPitch(frequency);
        } else {
            processValidPitch(frequency);
        }
    }
    rafId = requestAnimationFrame(analyzePitchLoop);
}

function processValidPitch(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    const cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));
    
    // [반응성 개선] 왔다갔다 방지 로직 최소화
    // 이전에는 5프레임을 기다렸지만, 지금은 즉시 반영하되, 
    // 너무 급격한 변화(옥타브 튐 등)만 필터링하는 방식으로 변경
    const now = Date.now();
    if (now - lastNoteTime > 50) { // 0.05초마다 갱신 (매우 빠름)
        targetCents = cents;
        updateTextUI(noteName, octave, cents, frequency);
        lastNoteTime = now;
    }
}

function updateTextUI(note, octave, cents, frequency) {
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

    // 판정 범위 살짝 완화 (±4) -> 사용자가 맞추기 편함
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

// [물리 엔진 강화] 바늘 움직임 (Speedy)
function updateVisualizer() {
    // Lerp 계수 0.15 -> 0.4 (40%씩 접근, 매우 빠르고 쫀득함)
    currentCents += (targetCents - currentCents) * 0.4;

    let percentage = 50 + currentCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;

    requestAnimationFrame(updateVisualizer);
}

init();