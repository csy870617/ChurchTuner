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

// 성능 & 안정화
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const pitchHistory = [];
const HISTORY_SIZE = 3; 

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
        
        // 버튼 클릭 시 매뉴얼 모드 설정 & 소리 재생
        btn.addEventListener('click', () => {
            playReferenceTone(str.freq);
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
        guideMsg.textContent = "선택한 줄만 맞춥니다";
        guideMsg.style.color = "var(--accent-yellow)";
        updateButtonStyles(stringData.freq);
    } else {
        targetFrequency = null;
        modeBadge.textContent = "AUTO MODE";
        modeBadge.classList.remove('manual');
        resetModeBtn.classList.add('hidden');
        guideMsg.textContent = "줄을 튕겨주세요";
        guideMsg.style.color = "#888";
        updateButtonStyles(null);
    }
    resetUI();
}

function updateButtonStyles(activeFreq) {
    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        const freq = parseFloat(btn.dataset.freq);
        btn.classList.remove('target');
        
        const key = freq.toFixed(2);
        if (tunedStrings.has(key)) btn.classList.add('tuned');
        else btn.classList.remove('tuned');

        if (activeFreq && Math.abs(freq - activeFreq) < 0.1) {
            btn.classList.add('target');
            btn.classList.remove('tuned');
        }
    });
}

// 주파수 거리 기반 하이라이트 (엉뚱한 줄 켜짐 방지)
function highlightClosestString(frequency, isLocked) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        if (!btn.classList.contains('tuned')) {
            btn.classList.remove('detected', 'locked');
        } else {
            btn.classList.remove('detected', 'locked'); 
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        // Cents 차이 계산
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    // 오차 범위 ±300센트(3반음) 이내일 때만 인식
    if (closestBtn && minDiff < 300) {
        closestBtn.classList.remove('tuned'); 
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
        
        if (isLocked) {
            tunedStrings.add(closestBtn.dataset.freq);
        }
    }
    
    // 나머지 버튼 상태 복구
    btns.forEach(btn => {
        if (btn !== closestBtn) {
            const key = parseFloat(btn.dataset.freq).toFixed(2);
            // tunedStrings에는 정밀한 값이 들어갈 수 있으므로 근사값 체크 필요하지만
            // 여기선 간단히 저장된 값과 비교
            if (isStringTuned(btn.dataset.freq)) btn.classList.add('tuned');
        }
    });
}

function isStringTuned(freqStr) {
    // Set에 저장된 값들 중 근사값이 있는지 확인
    const freq = parseFloat(freqStr);
    for (let val of tunedStrings) {
        if (Math.abs(parseFloat(val) - freq) < 0.1) return true;
    }
    return false;
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

        const constraints = { audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } };
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
    } catch (err) { console.error(err); alert("마이크 권한이 필요합니다."); }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop');
    btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    resetUI();
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI() {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.left = "50%";
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // RMS 체크 (노이즈 게이트)
    let rms = 0;
    for (let i = 0; i < BUF_SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / BUF_SIZE);

    // 노이즈 게이트: 0.01 (적당한 값)
    if (rms < 0.01) {
        handleSilence();
        rafId = requestAnimationFrame(processAudio);
        return;
    }

    const pitch = autoCorrelate(buf, audioContext.sampleRate);

    if (pitch !== -1) {
        // 매뉴얼 모드 필터링: 타겟 주파수 ±15% 이내만 허용
        if (targetFrequency) {
            const ratio = pitch / targetFrequency;
            if (ratio < 0.85 || ratio > 1.15) {
                rafId = requestAnimationFrame(processAudio);
                return;
            }
        }

        pitchHistory.push(pitch);
        if (pitchHistory.length > HISTORY_SIZE) pitchHistory.shift();

        if (pitchHistory.length === HISTORY_SIZE && isStable(pitchHistory)) {
            const avgPitch = pitchHistory.reduce((a, b) => a + b) / HISTORY_SIZE;
            silenceTimer = 0;
            updateTuner(avgPitch);
        }
    } else {
        handleSilence();
    }

    rafId = requestAnimationFrame(processAudio);
}

function isStable(arr) {
    const max = Math.max(...arr);
    const min = Math.min(...arr);
    return (max - min) < 2;
}

function handleSilence() {
    silenceTimer++;
    if (silenceTimer > 20) { 
        targetCents = 0;
        pitchHistory.length = 0;
        if (silenceTimer > 60) resetUI();
    }
}

function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    let r1 = Math.floor(sampleRate / 1200); 
    let r2 = Math.floor(sampleRate / 40);
    if (r2 > size) r2 = size;

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / size); 

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    if (bestCorrelation > 0.96) return sampleRate / bestOffset;
    return -1;
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
        
        // 락킹 효과 없이도 정튜닝 시 소리 한 번 재생
        if (!isStringTuned(frequency.toFixed(2))) {
             playSuccessSound();
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