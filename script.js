// --- 악기 데이터 (변경 없음) ---
const instruments = {
    guitar: {
        name: "GUITAR",
        strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ],
        columns: 3
    },
    bass: {
        name: "BASS",
        strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ],
        columns: 2
    },
    ukulele: {
        name: "UKULELE",
        strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ],
        columns: 2
    }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let currentInstrument = 'guitar';
let audioContext = null; let analyser = null; let source = null;
let isRunning = false; let rafId = null; let oscillator = null;

// DOM Elements (새로운 ID 반영)
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text'); // 버튼 텍스트
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
// const gaugeBar = document.getElementById('gauge-bar'); // 삭제됨
const tuningIndicator = document.getElementById('tuning-indicator'); // 새로 추가됨
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const stringContainer = document.getElementById('string-container');
const instCards = document.querySelectorAll('.inst-card');

function init() {
    renderStringButtons(currentInstrument);
    instCards.forEach(card => {
        card.addEventListener('click', () => {
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            renderStringButtons(currentInstrument);
            if(!isRunning) guideMsg.textContent = `${instruments[currentInstrument].name} SELECTED`;
        });
    });
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
            playTone(str.freq);
            highlightStringBtn(btn);
            guideMsg.textContent = "LISTEN TO THE REFERENCE";
            guideMsg.style.color = "var(--text-secondary)";
        });
        stringContainer.appendChild(btn);
    });
}

function highlightStringBtn(targetBtn) {
    document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active-string'));
    if(targetBtn) targetBtn.classList.add('active-string');
}

function playTone(freq) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (oscillator) { oscillator.stop(); oscillator.disconnect(); }
    oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
    oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + 1.5);
}

startBtn.addEventListener('click', () => { isRunning ? stopTuner() : startTuner(); });

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        analyser = audioContext.createAnalyser(); analyser.fftSize = 4096;
        source = audioContext.createMediaStreamSource(stream); source.connect(analyser);
        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING...";
        updatePitch();
    } catch (err) { console.error(err); alert("마이크 사용 권한이 필요합니다."); }
}

// --- UI 초기화 로직 수정 (새로운 인디케이터 반영) ---
function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    
    // 인디케이터 중앙으로 리셋 및 스타일 초기화
    tuningIndicator.style.left = "50%";
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.boxShadow = "0 0 20px var(--accent-green)";

    guideMsg.textContent = "READY TO TUNE";
    guideMsg.style.color = "var(--text-secondary)";
    highlightStringBtn(null);
    if (rafId) cancelAnimationFrame(rafId);
    if (source) { source.disconnect(); source = null; }
}

// --- 피치 감지 알고리즘 (변경 없음) ---
function autoCorrelate(buffer, sampleRate) {
    let SIZE = buffer.length; let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE); if (rms < 0.01) return -1;
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buffer = buffer.slice(r1, r2); SIZE = buffer.length;
    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buffer[j] * buffer[j + i];
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos; let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2; if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
}

function updatePitch() {
    if(!isRunning) return;
    const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);
    if (frequency > -1) {
        if (frequency > 30 && frequency < 1000) {
            const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
            const noteRound = Math.round(noteNum) + 69;
            const noteName = noteStrings[noteRound % 12];
            const octave = Math.floor(noteRound / 12) - 1;
            const cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));
            updateUI(noteName, octave, cents, frequency);
            detectClosestString(noteName, octave);
        }
    }
    rafId = requestAnimationFrame(updatePitch);
}

function detectClosestString(noteName, octave) {
    const allBtns = document.querySelectorAll('.string-btn');
    allBtns.forEach(b => b.classList.remove('active-string'));
    const match = Array.from(allBtns).find(btn => btn.dataset.note === noteName && parseInt(btn.dataset.octave) === octave);
    if (match) match.classList.add('active-string');
}

// --- UI 업데이트 로직 수정 (새로운 인디케이터 반영) ---
function updateUI(note, octave, cents, frequency) {
    noteNameEl.textContent = note; octaveEl.textContent = octave;
    noteNameEl.classList.add('active');
    freqEl.textContent = frequency.toFixed(1) + " Hz";
    centsEl.textContent = (cents > 0 ? "+" : "") + cents; centsEl.classList.remove('hidden');

    let colorVar = '--accent-green'; let msg = "PERFECT";
    // CSS 변수값을 가져오기 위한 헬퍼
    const style = getComputedStyle(document.body);

    if (Math.abs(cents) < 5) {
        colorVar = style.getPropertyValue('--accent-green');
        msg = "TUNE IS PERFECT";
    } else if (cents < 0) {
        colorVar = style.getPropertyValue('--accent-blue');
        msg = "TOO LOW ▼ (TIGHTEN)";
    } else {
        colorVar = style.getPropertyValue('--accent-pink');
        msg = "TOO HIGH ▲ (LOOSEN)";
    }

    guideMsg.textContent = msg;
    guideMsg.style.color = colorVar;

    // 인디케이터 이동 및 색상 변경
    let percentage = 50 + cents;
    if (percentage < 0) percentage = 0; if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    tuningIndicator.style.backgroundColor = colorVar;
    tuningIndicator.style.boxShadow = `0 0 20px ${colorVar}, 0 0 40px ${colorVar}`;
    
    noteNameEl.style.color = colorVar;
    noteNameEl.style.textShadow = `0 0 50px ${colorVar}`;
    centsEl.style.backgroundColor = colorVar;
    centsEl.style.color = "#000";
}

init();