// --- 악기 데이터 ---
const instruments = {
    guitar: {
        name: "GUITAR",
        strings: [ 
            { note: "E", octave: 2, freq: 82.41, num: 6 }, 
            { note: "A", octave: 2, freq: 110.00, num: 5 }, 
            { note: "D", octave: 3, freq: 146.83, num: 4 }, 
            { note: "G", octave: 3, freq: 196.00, num: 3 }, 
            { note: "B", octave: 3, freq: 246.94, num: 2 }, 
            { note: "E", octave: 4, freq: 329.63, num: 1 } 
        ],
        columns: 3
    },
    bass: {
        name: "BASS",
        strings: [ 
            { note: "E", octave: 1, freq: 41.20, num: 4 }, 
            { note: "A", octave: 1, freq: 55.00, num: 3 }, 
            { note: "D", octave: 2, freq: 73.42, num: 2 }, 
            { note: "G", octave: 2, freq: 98.00, num: 1 } 
        ],
        columns: 2
    },
    ukulele: {
        name: "UKULELE",
        strings: [ 
            { note: "G", octave: 4, freq: 392.00, num: 4 }, 
            { note: "C", octave: 4, freq: 261.63, num: 3 }, 
            { note: "E", octave: 4, freq: 329.63, num: 2 }, 
            { note: "A", octave: 4, freq: 440.00, num: 1 } 
        ],
        columns: 2
    }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let targetFrequency = null; // 사용자가 선택한 목표 주파수 (null이면 오토 모드)

let audioContext = null; 
let analyser = null; 
let source = null;
let isRunning = false; 
let rafId = null; 
let oscillator = null;

// 필터 노드 (잡음 제거용)
let lowPassFilter = null;

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

// --- 초기화 및 이벤트 리스너 ---
function init() {
    renderStringButtons(currentInstrument);
    
    // 악기 변경
    instCards.forEach(card => {
        card.addEventListener('click', () => {
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            resetTarget(); // 악기 바꾸면 오토 모드로 리셋
            renderStringButtons(currentInstrument);
        });
    });

    // 리셋 버튼 (Manual -> Auto)
    resetModeBtn.addEventListener('click', resetTarget);
}

// 오토 모드로 복귀
function resetTarget() {
    targetFrequency = null;
    modeBadge.textContent = "AUTO MODE";
    modeBadge.classList.remove('manual');
    resetModeBtn.classList.add('hidden');
    highlightStringBtn(null);
    guideMsg.textContent = isRunning ? "PLAY A STRING..." : "READY TO TUNE";
}

// 줄 버튼 생성
function renderStringButtons(instType) {
    const data = instruments[instType];
    stringContainer.innerHTML = ''; 
    stringContainer.style.gridTemplateColumns = `repeat(${data.columns}, 1fr)`;
    
    data.strings.forEach(str => {
        const btn = document.createElement('button');
        btn.className = 'string-btn';
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        
        btn.addEventListener('click', () => {
            // 1. 소리 재생
            playTone(str.freq);
            // 2. 타겟 주파수 설정 (강력한 튜닝 기능)
            setTargetMode(str.freq, str.note, str.octave, btn);
        });
        stringContainer.appendChild(btn);
    });
}

// 타겟 모드 설정 (핵심 기능)
function setTargetMode(freq, note, octave, btnElem) {
    targetFrequency = freq;
    highlightStringBtn(btnElem);
    
    // UI 업데이트
    modeBadge.textContent = `TARGET: ${note}${octave}`;
    modeBadge.classList.add('manual');
    resetModeBtn.classList.remove('hidden');
    guideMsg.textContent = "TUNE TO TARGET";
    guideMsg.style.color = "var(--accent-yellow)";
}

function highlightStringBtn(targetBtn) {
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active-string'));
    if(targetBtn) targetBtn.classList.add('active-string');
}

// 기준음 재생
function playTone(freq) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (oscillator) { oscillator.stop(); oscillator.disconnect(); }
    
    oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sawtooth'; 
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
    
    oscillator.connect(gainNode); 
    gainNode.connect(audioContext.destination);
    
    oscillator.start(); 
    oscillator.stop(audioContext.currentTime + 1.5);
}

// --- 오디오 처리 시작 ---
startBtn.addEventListener('click', () => { isRunning ? stopTuner() : startTuner(); });

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, 
                noiseSuppression: false // 음악 튜닝을 위해 원음 유지
            } 
        });

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 4096; // 해상도 높임 (저음 인식 향상)

        // [핵심] 로우패스 필터 추가 (1000Hz 이상의 배음/잡음 제거)
        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        lowPassFilter.frequency.value = 1000;

        source = audioContext.createMediaStreamSource(stream);
        source.connect(lowPassFilter);
        lowPassFilter.connect(analyser); // 필터를 거쳐 분석기로

        isRunning = true;
        startBtn.classList.add('stop'); 
        startBtn.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        
        if(!targetFrequency) guideMsg.textContent = "PLAY A STRING...";
        
        updatePitch();
    } catch (err) { 
        console.error(err); 
        alert("마이크 사용 권한이 필요합니다. 브라우저 설정에서 허용해주세요."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); 
    startBtn.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    noteNameEl.classList.remove('active'); 
    noteNameEl.textContent = "--"; 
    octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; 
    centsEl.classList.add('hidden');
    
    tuningIndicator.style.left = "50%";
    tuningIndicator.style.backgroundColor = "var(--accent-green)";

    if (rafId) cancelAnimationFrame(rafId);
    if (source) { source.disconnect(); source = null; }
}

// --- 피치 감지 알고리즘 (Autocorrelation) ---
function autoCorrelate(buffer, sampleRate) {
    let SIZE = buffer.length;
    let rms = 0;

    // 1. RMS(볼륨) 체크 - 소리가 너무 작으면 분석 중지
    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.02) return -1; // 임계값(Threshold) 상향 조정 (잡음 무시)

    // 2. Autocorrelation
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;

    let c = new Array(SIZE).fill(0);
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

    // 보간법 (정밀도 향상)
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

// 피치 업데이트 루프
function updatePitch() {
    if(!isRunning) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);

    if (frequency > -1) {
        // [핵심] 유효 주파수 범위 필터
        if (frequency > 30 && frequency < 1000) {
            
            // --- 타겟 모드 로직 (강력한 필터링) ---
            if (targetFrequency) {
                // 목표 주파수와 30% 이상 차이나면 무시 (다른 줄 소리 무시)
                const deviation = Math.abs(frequency - targetFrequency);
                const allowedRange = targetFrequency * 0.3; 
                
                if (deviation < allowedRange) {
                    processValidPitch(frequency);
                }
            } else {
                // 오토 모드: 그냥 표시
                processValidPitch(frequency);
            }
        }
    }

    rafId = requestAnimationFrame(updatePitch);
}

// 유효한 피치 처리 및 UI 업데이트
function processValidPitch(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    const cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));
    
    updateUI(noteName, octave, cents, frequency);
}

function updateUI(note, octave, cents, frequency) {
    noteNameEl.textContent = note; 
    octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    centsEl.textContent = (cents > 0 ? "+" : "") + cents; 
    centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; 
    let msg = "PERFECT";
    const style = getComputedStyle(document.body);

    if (Math.abs(cents) < 5) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
    } else if (cents < 0) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW (TIGHTEN)";
    } else {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH (LOOSEN)";
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;

    // 인디케이터 부드럽게 이동
    let percentage = 50 + cents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    tuningIndicator.style.backgroundColor = colorVar;
    tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
    
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 50px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;
}

init();