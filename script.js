// --- 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 (메모리 재사용을 위해 최상위 선언) ---
let currentInstrument = 'guitar';
let targetFrequency = null;
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let source = null;
let isRunning = false; 
let rafId = null; 

// [성능 최적화] 메모리 재사용을 위한 버퍼 전역 선언
const FFT_SIZE = 2048; 
const buffer = new Float32Array(FFT_SIZE); // 루프 밖에서 딱 한 번 생성
const correlations = new Float32Array(FFT_SIZE); // 계산용 버퍼

// [반응성 변수]
let lastSuccessTime = 0;
let currentCents = 0; 
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
    
    // UI 업데이트 루프 (오디오 분석과 별도로 60fps 유지)
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
    if (now - lastSuccessTime < 800) return; // 쿨타임 0.8초 (빠른 반응)
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

// --- 오디오 엔진 (메모리 누수 방지 & 고속화) ---
function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // [중요] 모든 자동 보정 끄기 (Pure Audio)
        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, 
                noiseSuppression: false, 
                latency: 0,
                channelCount: 1
            } 
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE; 
        analyser.smoothingTimeConstant = 0; // 스무딩 0 = 즉각 반응 (딜레이 제거)

        source = audioContext.createMediaStreamSource(mediaStream);
        
        // [수정] 1번줄(High E) 인식을 위해 필터 제거. 원음 그대로 분석.
        source.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "LISTENING...";
        
        analyzeLoop();
    } catch (err) { 
        console.error(err); 
        alert("마이크 권한 오류: 브라우저 설정에서 마이크를 허용해주세요."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    // UI 리셋
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    targetCents = 0; currentCents = 0;
    
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked'));
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";

    if (rafId) cancelAnimationFrame(rafId);
    
    // 스트림 정리 (메모리 해제)
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (source) source.disconnect();
}

// --- 고성능 피치 분석 (가비지 컬렉션 제거 버전) ---
function analyzeLoop() {
    if (!isRunning) return;

    // 전역 버퍼 재사용 (메모리 할당 X)
    analyser.getFloatTimeDomainData(buffer);
    
    const freq = performAutocorrelation(buffer, audioContext.sampleRate);

    // 기타 음역대: 40Hz (Bass Low E) ~ 1200Hz (High fret)
    if (freq > 40 && freq < 1200) {
        if (targetFrequency) {
            // 수동 모드: 범위 체크 (±30%)
            const ratio = freq / targetFrequency;
            if (ratio > 0.7 && ratio < 1.3) updateTunerState(freq);
        } else {
            updateTunerState(freq);
        }
    }

    rafId = requestAnimationFrame(analyzeLoop);
}

// 최적화된 Autocorrelation 알고리즘
function performAutocorrelation(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;

    // RMS 계산 (볼륨 체크)
    for (let i = 0; i < size; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    
    // [수정] 1번줄은 에너지가 약하므로 RMS 임계값을 매우 낮춤 (0.002)
    if (rms < 0.002) return -1;

    // 검색 범위 제한 (불필요한 연산 제거)
    // 40Hz ~ 1200Hz 사이의 주기만 검사
    let r1 = Math.floor(sampleRate / 1200); 
    let r2 = Math.floor(sampleRate / 40);
    if (r2 > size) r2 = size;

    // 상관관계 계산 (전역 버퍼 사용)
    // 전체를 다 돌지 않고, 기타 음역대 주기만 검사하여 속도 2배 향상
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        
        // 샘플링 최적화: 모든 샘플을 다 더하지 않고 건너뛰며 계산 (Downsampling effect for speed)
        // 정밀도는 약간 떨어지지만 반응속도는 빨라짐. 여기선 정확도를 위해 1로 유지하거나 2로 설정 가능
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]); // 차이값 누적 (Difference method가 곱하기보다 빠름)
        }
        
        // 차이값이 작을수록(0에 가까울수록) 상관관계가 높음 (Autocorrelation의 역)
        // 정규화: (1 - 차이값/최대값) 형태로 변환하여 Peak 찾기
        correlation = 1 - (correlation / size); 

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // 상관관계가 너무 낮으면(잡음이면) 무시
    if (bestCorrelation < 0.9) return -1;

    return sampleRate / bestOffset;
}

function updateTunerState(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    const cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));
    
    // UI 타겟 값 즉시 갱신 (딜레이 없음)
    targetCents = cents;
    
    // 텍스트는 바로바로 업데이트
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

    // 판정 범위: ±5센트 (사용자 친화적)
    if (Math.abs(cents) <= 5) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
        isLocked = true;
        playSuccessSound(); // 즉시 소리 재생
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

// --- UI 루프 (물리 엔진: 빠릿하게) ---
function uiLoop() {
    // Lerp 계수 0.8: 목표치까지 80%씩 접근 (거의 즉시 반응하지만 아주 약간의 부드러움)
    currentCents += (targetCents - currentCents) * 0.8;

    let percentage = 50 + currentCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;

    requestAnimationFrame(uiLoop);
}

init();