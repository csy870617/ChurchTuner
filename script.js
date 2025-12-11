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

// 오디오 처리
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const stableBuffer = []; 
const STABILITY_THRESHOLD = 5; 

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

// [간섭 방지 변수]
let currentTargetFreq = 0; 
let isolationCounter = 0;  

// 상태 변수
let isNoteLocked = false;
let lockedNote = "";

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
            resetUI(false);
            renderStringButtons(currentInstrument);
        });
    });

    // 화면 터치로 튜너 시작 (버튼 영역 제외)
    document.body.addEventListener('click', (e) => {
        if (!e.target.closest('.inst-card') && !e.target.closest('.string-btn') && !e.target.closest('#start-btn')) {
            if (!isRunning) startTuner();
        }
    });
    
    startBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        toggleTuner();
    });

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
        btn.dataset.freq = str.freq;
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        stringContainer.appendChild(btn);
    });
}

function highlightClosestString(frequency, isLocked) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        const btnKey = btn.dataset.note + btn.dataset.octave;
        
        if (!tunedStrings.has(btnKey)) {
            btn.classList.remove('detected', 'locked', 'tuned');
        } else {
            btn.classList.remove('detected', 'locked'); 
            btn.classList.add('tuned');
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    if (closestBtn && minDiff < 300) {
        closestBtn.classList.remove('tuned'); 
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
        
        // [간섭 방지 핵심] 현재 잡은 줄을 타겟으로 고정
        currentTargetFreq = parseFloat(closestBtn.dataset.freq);
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
    if (isRunning) return;

    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const constraints = { 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } 
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        
        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        
        // 버튼 스타일 변경 (stop 클래스 추가)
        startBtn.classList.add('stop'); 
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "줄을 튕겨주세요";
        
        processAudio();
    } catch (err) { 
        console.error(err); 
        // [삭제됨] 사용자 요청으로 에러 문구 표시 제거
    }
}

function stopTuner() {
    isRunning = false;
    
    // 버튼 스타일 복구
    startBtn.classList.remove('stop'); 
    btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    
    resetUI(true); 
    
    guideMsg.textContent = "READY TO TUNE"; guideMsg.style.color = "var(--text-secondary)";
    isNoteLocked = false;
    lockedNote = "";
    currentTargetFreq = 0; 

    if (rafId) cancelAnimationFrame(rafId);
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (source) source.disconnect();
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    tuningIndicator.style.left = "50%";
    
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
        if (keepTuned) {
            const key = b.dataset.note + b.dataset.octave;
            if (tunedStrings.has(key)) b.classList.add('tuned');
        } else {
            b.classList.remove('tuned');
        }
    });
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    let rms = 0;
    for (let i = 0; i < BUF_SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / BUF_SIZE);

    if (rms < 0.01) { 
        stableBuffer.length = 0; 
        if (targetCents !== 0) {
            if(rms < 0.005) { 
                 targetCents = 0;
                 if (!isNoteLocked) {
                     currentTargetFreq = 0; 
                     resetUI(true);
                 }
            }
        }
        rafId = requestAnimationFrame(processAudio);
        return;
    }

    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    
    if (pitch !== -1) {
        // [간섭 방지 로직]
        if (currentTargetFreq !== 0) {
            const ratio = pitch / currentTargetFreq;
            if (ratio < 0.85 || ratio > 1.15) {
                isolationCounter++;
                if (isolationCounter < 15) { 
                    rafId = requestAnimationFrame(processAudio);
                    return; 
                }
                isolationCounter = 0; 
                currentTargetFreq = 0; 
            } else {
                isolationCounter = 0; 
            }
        }

        updateStableBuffer(pitch);
    } else {
        stableBuffer.length = 0; 
    }

    if (stableBuffer.length >= STABILITY_THRESHOLD) {
        const avgPitch = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
        updateTuner(avgPitch);
    }
    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15;
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

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
        if (Math.abs(last - pitch) > 5) stableBuffer.length = 0;
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

    const isPerfect = Math.abs(cents) <= 3;

    if (isPerfect) {
        cents = 0; 
        if (!isNoteLocked || lockedNote !== noteName) {
            isNoteLocked = true;
            lockedNote = noteName;
            
            const btnKey = noteName + octave;
            if (!tunedStrings.has(btnKey)) {
                tunedStrings.add(btnKey);
                playSuccessSound();
            }
        }
    } else if (Math.abs(cents) > 8) { 
        isNoteLocked = false;
        lockedNote = "";
    } else if (isNoteLocked) {
        cents = 0; 
    }

    targetCents = cents;
    
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

    highlightClosestString(frequency, isLocked);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(isLocked) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    const factor = isNoteLocked ? 0.4 : 0.15;
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();