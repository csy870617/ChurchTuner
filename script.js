// --- 악기 데이터 (Standard Tunings) ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let targetFrequency = null; // 수동 모드 타겟
let audioContext = null; 
let analyser = null; 
let source = null;
let isRunning = false; 
let rafId = null; 
let oscillator = null;

// 성능 향상 변수
const pitchBuffer = [];
const BUFFER_SIZE = 8; 
let lastSuccessTime = 0; // 알림음 중복 방지

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
    
    startBtn.addEventListener('click', () => {
        if (isRunning) stopTuner();
        else startTuner();
    });
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
        // 데이터 속성 저장 (자동 감지 시 비교용)
        btn.dataset.freq = str.freq;
        btn.dataset.note = str.note;
        btn.dataset.octave = str.octave;
        
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
    // 모든 버튼 초기화 후 수동 타겟 표시
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked', 'manual-target');
    });
    btnElem.classList.add('manual-target');
    
    modeBadge.textContent = `TARGET: ${note}${octave}`;
    modeBadge.classList.add('manual');
    resetModeBtn.classList.remove('hidden');
    guideMsg.textContent = "TUNE TO TARGET";
    guideMsg.style.color = "var(--accent-yellow)";
}

// 자동 모드일 때 가장 가까운 줄 강조
function highlightStringBtn(noteName, octave, isLocked) {
    // 수동 모드면 무시
    if (targetFrequency) return;

    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        btn.classList.remove('detected', 'locked'); // 기존 상태 제거
        
        // 현재 감지된 음과 일치하는 줄 찾기
        if (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave) {
            if (isLocked) {
                btn.classList.add('locked'); // 정튜닝 (초록)
            } else {
                btn.classList.add('detected'); // 감지됨 (파랑)
            }
        }
    });
}

function playReferenceTone(freq) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.0);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + 1.0);
}

// --- 정튜닝 성공 알림음 (Ding!) ---
function playSuccessSound() {
    const now = Date.now();
    // 2초 쿨타임 (연속 재생 방지)
    if (now - lastSuccessTime < 2000) return; 

    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine'; // 맑은 소리
    osc.frequency.setValueAtTime(880, audioContext.currentTime); // High A
    osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
    
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + 0.8);
    
    lastSuccessTime = now;
}

// --- 오디오 프로세싱 (고급) ---
async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 } 
        });

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192; // 고해상도
        analyser.smoothingTimeConstant = 0.8;

        const highPass = audioContext.createBiquadFilter();
        highPass.type = "highpass"; highPass.frequency.value = 30; // 럼블 제거
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = "lowpass"; lowPass.frequency.value = 1000; // 잡음 제거

        source = audioContext.createMediaStreamSource(stream);
        source.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); 
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "LISTENING...";
        
        updatePitch();
    } catch (err) { 
        console.error(err); 
        alert("마이크 권한이 필요합니다."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); 
    btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.left = "50%";
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    guideMsg.textContent = "READY TO TUNE";
    guideMsg.style.color = "var(--text-secondary)";

    // 버튼 상태 초기화
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('detected', 'locked'));

    if (rafId) cancelAnimationFrame(rafId);
    if (source) { source.disconnect(); source = null; }
}

// --- 윈도우 함수 (Hanning Window) 적용 ---
// 신호의 양끝을 부드럽게 0으로 만들어 스펙트럼 누설(Spectral Leakage)을 줄임
function applyHanningWindow(buffer) {
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = buffer[i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (buffer.length - 1))));
    }
}

function autoCorrelate(buffer, sampleRate) {
    // 1. 해닝 윈도우 적용 (정확도 상승 핵심)
    applyHanningWindow(buffer);

    let SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) { const val = buffer[i]; rms += val * val; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.008) return -1; // 민감도 조절

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buffer = buffer.slice(r1, r2); SIZE = buffer.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buffer[j] * buffer[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2; 
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function getSmoothedPitch(newPitch) {
    if (newPitch === -1) {
        if (pitchBuffer.length > 0) pitchBuffer.shift();
        return -1;
    }
    pitchBuffer.push(newPitch);
    if (pitchBuffer.length > BUFFER_SIZE) pitchBuffer.shift();
    const sorted = [...pitchBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function updatePitch() {
    if(!isRunning) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    
    const rawFreq = autoCorrelate(buffer, audioContext.sampleRate);
    const smoothedFreq = getSmoothedPitch(rawFreq);

    if (smoothedFreq > 30 && smoothedFreq < 1200) {
        if (targetFrequency) {
            const ratio = smoothedFreq / targetFrequency;
            if (ratio > 0.75 && ratio < 1.25) processValidPitch(smoothedFreq);
        } else {
            processValidPitch(smoothedFreq);
        }
    }
    rafId = requestAnimationFrame(updatePitch);
}

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
    let isLocked = false;
    const style = getComputedStyle(document.body);

    if (Math.abs(cents) < 3) { // 오차 범위 ±3센트 (매우 엄격)
        colorVar = style.getPropertyValue('--accent-green');
        msg = "PERFECT";
        isLocked = true;
        playSuccessSound(); // 정튜닝 시 알림음 재생
    } else if (cents < 0) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW (TIGHTEN)";
    } else {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH (LOOSEN)";
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;

    // 하단 박스 하이라이트 (감지된 줄 표시)
    highlightStringBtn(note, octave, isLocked);

    let percentage = 50 + cents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    tuningIndicator.style.backgroundColor = colorVar;
    
    // 정튜닝 시 빛나는 효과 극대화
    if(isLocked) {
        tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    } else {
        tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
    }
    
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 60px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;
}

init();