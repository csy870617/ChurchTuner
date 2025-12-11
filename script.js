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
let isRunning = false; 

// 오디오 처리
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const stableBuffer = []; 
const STABILITY_THRESHOLD = 5; 

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

// 상태 변수
let lastNoteName = "--";
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
            tunedStrings.clear(); // 악기 변경 시 기록 초기화
            resetTarget();
            renderStringButtons(currentInstrument);
        });
    });
    resetModeBtn.addEventListener('click', resetTarget);
    startBtn.addEventListener('click', toggleTuner);
    
    requestAnimationFrame(updateVisualizer);
}

function resetTarget() {
    targetFrequency = null;
    isNoteLocked = false;
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
        
        // 버튼 클릭 이벤트 (수정됨: 튜너 정지 방지)
        btn.addEventListener('click', async () => {
            // 오디오 컨텍스트가 없거나 멈춰있으면 시작 시도
            if (!audioContext) {
                // 아직 튜너가 안 켜졌으면 그냥 켜지 않고 소리만 나게 할 수도 있지만, 
                // 보통은 사용자가 튜닝을 하려는 의도이므로 오디오 엔진을 준비합니다.
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            playReferenceTone(str.freq);
            setTargetMode(str.freq, str.note, str.octave, btn);
            
            // 만약 튜너가 꺼져있었다면 켜기 (선택사항, 여기선 유지)
            // if (!isRunning) startTuner();
        });
        stringContainer.appendChild(btn);
    });
}

function setTargetMode(freq, note, octave, btnElem) {
    targetFrequency = freq;
    isNoteLocked = false;
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
        const btnKey = btn.dataset.note + btn.dataset.octave;
        btn.classList.remove('detected', 'locked', 'tuned');

        if (tunedStrings.has(btnKey)) {
            btn.classList.add('tuned');
        }

        if (btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave) {
            btn.classList.remove('tuned'); 
            btn.classList.add(isLocked ? 'locked' : 'detected');
        }
    });
}

function playReferenceTone(freq) {
    if (!audioContext) return;
    
    // 마이크 스트림과는 별개로 오실레이터 생성 -> 출력 (마이크 방해 안함)
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    // 볼륨 조절
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.0);
    
    osc.connect(gain); 
    gain.connect(audioContext.destination);
    
    osc.start(); 
    osc.stop(audioContext.currentTime + 1.0);
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
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } 
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
    lockedNote = "";

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
            const key = b.dataset.note + b.dataset.octave;
            if (tunedStrings.has(key)) b.classList.add('tuned');
        } else {
            b.classList.remove('tuned');
        }
    });
    
    if (keepTuned) highlightStringBtn(null, null, false);
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
            resetUI(true);
        }
    }

    if (stableBuffer.length >= STABILITY_THRESHOLD) {
        const avgPitch = stableBuffer.reduce((a, b) => a + b) / stableBuffer.length;
        if (targetFrequency) {
            // 수동 모드 범위 체크 (넓게 잡음)
            const ratio = avgPitch / targetFrequency;
            if (ratio > 0.7 && ratio < 1.3) updateTuner(avgPitch);
        } else {
            updateTuner(avgPitch);
        }
    }
    requestAnimationFrame(processAudio);
}

function yinPitchDetection(buffer, sampleRate) {
    const threshold = 0.15;
    const bufferSize = buffer.length;
    let tauEstimate = -1;
    let pitchInHz = -1;

    let rms = 0;
    for (let i = 0; i < bufferSize; i++) { rms += buffer[i] * buffer[i]; }
    rms = Math.sqrt(rms / bufferSize);
    if (rms < 0.01) return -1; 

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
            
            tunedStrings.add(noteName + octave); // 기록 저장
            
            // 알림음 재생
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioContext.currentTime); 
            gain.gain.setValueAtTime(0.2, audioContext.currentTime); 
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);
            osc.connect(gain); gain.connect(audioContext.destination);
            osc.start(); osc.stop(audioContext.currentTime + 0.6);
        }
    } else if (Math.abs(cents) > 10) {
        isNoteLocked = false;
        lockedNote = "";
    } else if (isNoteLocked) {
        cents = 0;
    }

    targetCents = cents;
    lastNoteName = noteName;
    lastCents = cents;

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

    highlightStringBtn(note, octave, isLocked);
    
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