// --- 악기 데이터 (Standard Tunings) ---
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
let isRunning = false; 

// 오디오 처리
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const stableBuffer = []; 
const STABILITY_THRESHOLD = 3; // 반응 속도를 위해 5 -> 3으로 단축

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

// 상태 변수
let isNoteLocked = false;
let lockedNote = "";

// 화면 갱신용
let displayCents = 0; 
let targetCents = 0;

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
        btn.dataset.freq = str.freq; // 주파수 정보 저장 (핵심)
        btn.dataset.note = str.note; 
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        stringContainer.appendChild(btn);
    });
}

// [핵심 로직 변경] 노트 이름이 아니라 '주파수 거리'로 가까운 줄 찾기
function highlightClosestString(frequency, isLocked) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        // 기존 상태 초기화 (tuned 상태는 유지해야 하므로 별도 처리)
        if (!btn.classList.contains('tuned')) {
            btn.classList.remove('detected', 'locked');
        } else {
            // 이미 튜닝된 줄이라도 현재 감지 중이면 detected/locked로 덮어씌움
            btn.classList.remove('detected', 'locked');
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        
        // 주파수 차이를 반음(Cents) 단위가 아닌 비율로 계산
        // (1200 * log2(f1/f2))의 절대값
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        // 가장 가까운 줄 찾기
        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    // 오차 범위가 ±300센트(3반음) 이내일 때만 해당 줄을 인식
    // (A를 쳤는데 B가 켜지는 현상 완벽 차단)
    if (closestBtn && minDiff < 300) {
        // 기존 tuned 클래스 잠시 제거 (상태 표시 우선)
        closestBtn.classList.remove('tuned'); 
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
        
        // 락 걸렸을 때만 tuned 목록에 영구 추가
        if (isLocked) {
            const key = closestBtn.dataset.note + closestBtn.dataset.freq; // 유니크 키
            tunedStrings.add(key);
        }
    }
    
    // 선택되지 않은 버튼들 중 tunedStrings에 있는 건 다시 초록불 켜주기
    btns.forEach(btn => {
        if (btn !== closestBtn) {
            const key = btn.dataset.note + btn.dataset.freq;
            if (tunedStrings.has(key)) {
                btn.classList.add('tuned');
            }
        }
    });
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
    isNoteLocked = false;
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "none";
    
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
        if (keepTuned) {
            const key = b.dataset.note + b.dataset.freq;
            if (tunedStrings.has(key)) b.classList.add('tuned');
        } else {
            b.classList.remove('tuned');
        }
    });
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    const pitch = yinPitchDetection(buf, audioContext.sampleRate);
    
    if (pitch !== -1) {
        updateStableBuffer(pitch);
    } else {
        stableBuffer.length = 0; 
        if (targetCents !== 0) {
            targetCents = 0;
            // 소리 끊기면 잠시 후 리셋
            setTimeout(() => { if(stableBuffer.length === 0) resetUI(true); }, 200);
        }
    }

    if (stableBuffer.length >= STABILITY_THRESHOLD) {
        const avgPitch = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
        updateTuner(avgPitch);
    }
    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.20; // 1번 줄 인식을 위해 허용치 약간 완화 (0.15 -> 0.20)
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

    let rms = 0;
    for (let i = 0; i < bufferSize; i++) { rms += buffer[i] * buffer[i]; }
    rms = Math.sqrt(rms / bufferSize);
    
    // 고음(1번 줄)은 에너지가 약하므로 RMS 기준을 낮춤
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
    // 옥타브 튐 방지: 값이 너무 급격하게 변하면 버퍼 초기화
    if (stableBuffer.length > 0) {
        const last = stableBuffer[stableBuffer.length - 1];
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

    const isPerfect = Math.abs(cents) <= 3;

    if (isPerfect) {
        cents = 0;
        if (!isNoteLocked || lockedNote !== noteName) {
            isNoteLocked = true;
            lockedNote = noteName;
            playSuccessSound();
        }
    } else if (Math.abs(cents) > 10) {
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

    // [중요] 주파수 기반으로 가장 가까운 줄 찾아서 불 켜기
    highlightClosestString(frequency, isLocked);
    
    tuningIndicator.style.backgroundColor = colorVar;
    if(isLocked) tuningIndicator.style.boxShadow = `0 0 30px ${colorVar}, 0 0 50px #fff`;
    else tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}`;
}

function updateVisualizer() {
    const factor = isNoteLocked ? 0.3 : 0.15;
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();