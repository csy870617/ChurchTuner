// --- 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let currentInstrument = 'guitar';
let targetFrequency = null;
let audioContext = null; let analyser = null; let source = null;
let isRunning = false; let rafId = null; let oscillator = null;

// [고급 튜닝용 변수]
const pitchBuffer = [];
const BUFFER_SIZE = 8; 

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
    
    // 버튼 클릭 이벤트 연결
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
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        btn.addEventListener('click', () => {
            playTone(str.freq);
            setTargetMode(str.freq, str.note, str.octave, btn);
        });
        stringContainer.appendChild(btn);
    });
}

function setTargetMode(freq, note, octave, btnElem) {
    targetFrequency = freq;
    highlightStringBtn(btnElem);
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

function playTone(freq) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); // 재생용 컨텍스트
    if (oscillator) { oscillator.stop(); oscillator.disconnect(); }
    oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
    oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + 1.5);
}

// --- 오디오 처리 엔진 ---
async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 } 
        });

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192; // 고해상도 유지
        analyser.smoothingTimeConstant = 0.8;

        // 필터 체인 (HighPass 30Hz -> LowPass 1200Hz)
        const highPass = audioContext.createBiquadFilter();
        highPass.type = "highpass"; highPass.frequency.value = 30;
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = "lowpass"; lowPass.frequency.value = 1200;

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
    tuningIndicator.style.boxShadow = "0 0 20px var(--accent-green)";

    guideMsg.textContent = "READY TO TUNE";
    guideMsg.style.color = "var(--text-secondary)";

    if (rafId) cancelAnimationFrame(rafId);
    if (source) { source.disconnect(); source = null; }
}

function autoCorrelate(buffer, sampleRate) {
    let SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) { const val = buffer[i]; rms += val * val; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.03) return -1; // 노이즈 게이트

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
            // 타겟 모드: ±25% 이내만 허용
            const ratio = smoothedFreq / targetFrequency;
            if (ratio > 0.75 && ratio < 1.25) {
                processValidPitch(smoothedFreq);
            }
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
    const style = getComputedStyle(document.body);

    if (Math.abs(cents) < 4) {
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

    let percentage = 50 + cents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    tuningIndicator.style.backgroundColor = colorVar;
    tuningIndicator.style.boxShadow = `0 0 25px ${colorVar}`;
    
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 60px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;
}

init();