// --- 1. 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard", hpf: 50, strings: [ 
        { note: "E", octave: 2, freq: 82.41 }, { note: "A", octave: 2, freq: 110.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "G", octave: 3, freq: 196.00 }, 
        { note: "B", octave: 3, freq: 246.94 }, { note: "E", octave: 4, freq: 329.63 } 
    ] },
    bass: { name: "BASS", icon: "🎸", detail: "Standard", hpf: 30, strings: [ 
        { note: "E", octave: 1, freq: 41.20 }, { note: "A", octave: 1, freq: 55.00 }, 
        { note: "D", octave: 2, freq: 73.42 }, { note: "G", octave: 2, freq: 98.00 } 
    ] },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", hpf: 150, strings: [ 
        { note: "G", octave: 4, freq: 392.00 }, { note: "C", octave: 4, freq: 261.63 }, 
        { note: "E", octave: 4, freq: 329.63 }, { note: "A", octave: 4, freq: 440.00 } 
    ] },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", hpf: 180, strings: [ 
        { note: "G", octave: 3, freq: 196.00 }, { note: "D", octave: 4, freq: 293.66 }, 
        { note: "A", octave: 4, freq: 440.00 }, { note: "E", octave: 5, freq: 659.25 } 
    ] },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", hpf: 60, strings: [ 
        { note: "C", octave: 2, freq: 65.41 }, { note: "G", octave: 2, freq: 98.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "A", octave: 3, freq: 220.00 } 
    ] },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "All Notes", hpf: 30, isChromatic: true, strings: [] }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

class MedianSmoother {
    constructor(size) { this.size = size; this.buffer = []; }
    add(val) { this.buffer.push(val); if(this.buffer.length > this.size) this.buffer.shift(); }
    getValue() { 
        if(!this.buffer.length) return 0; 
        const s = [...this.buffer].sort((a,b)=>a-b); 
        return s[Math.floor(s.length/2)]; 
    }
    reset() { this.buffer = []; }
}

let currentInstrument = 'guitar';
let audioContext = null; let analyser = null; let mediaStream = null;
let isRunning = false;
let gainNode = null; let lowPassFilter = null; let highPassFilter = null;

const BUF_SIZE = 4096; const buf = new Float32Array(BUF_SIZE);
const freqSmoother = new MedianSmoother(5); 

// --- 안정화 및 고정(Lock) 변수 ---
let lastDetectedNoteFull = "";
let stableStringIndex = -1; 
let stringLockCounter = 0;   
let displayAngle = 0; 
let targetAngle = 0;
let isLocked = false;
let framesSinceLastPitch = 0;

// [추가] 고정 임계값 설정
const LOCK_THRESHOLD = 3.0;   // 이 범위(Cents) 안에 들어오면 중앙 고정
const UNLOCK_THRESHOLD = 7.0; // 고정된 후, 이 범위를 벗어나야 다시 바늘이 움직임 (히스테리시스)

const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
const needleGroup = document.getElementById('needle-group');
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const instPills = document.querySelectorAll('.inst-pill');
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynIcon = document.getElementById('dyn-icon');
const dynName = document.getElementById('dyn-name');

function init() {
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.classList.add('hidden'); });
    generateModalList();
    requestAnimationFrame(updateVisualizer);
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if (type === 'select' || (pill.id === 'dynamic-inst-card' && pill.classList.contains('active'))) {
        openModal(); return;
    }
    activateInstrument(type, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentInstrument = key;
    if(key !== 'guitar' && key !== 'bass') {
        dynIcon.textContent = instruments[key].icon;
        dynName.textContent = instruments[key].name;
        dynamicCard.dataset.type = key;
    }
    resetUI();
    if(isRunning) applyFilters();
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const div = document.createElement('div');
        div.className = 'inst-option';
        div.innerHTML = `<div class="opt-icon">${inst.icon}</div><div class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></div>`;
        div.addEventListener('click', () => { activateInstrument(key, dynamicCard); modal.classList.add('hidden'); });
        modalList.appendChild(div);
    });
}
function openModal() { modal.classList.remove('hidden'); }

function toggleTuner() { isRunning ? stopTuner() : startTuner(); }

async function startTuner() {
    try {
        if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if(audioContext.state === 'suspended') await audioContext.resume();
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
        const inputSource = audioContext.createMediaStreamSource(mediaStream);
        
        gainNode = audioContext.createGain(); gainNode.gain.value = 4.0;
        highPassFilter = audioContext.createBiquadFilter(); highPassFilter.type = "highpass";
        lowPassFilter = audioContext.createBiquadFilter(); lowPassFilter.type = "lowpass";
        analyser = audioContext.createAnalyser(); analyser.fftSize = BUF_SIZE;
        
        inputSource.connect(gainNode).connect(highPassFilter).connect(lowPassFilter).connect(analyser);
        applyFilters();
        
        isRunning = true;
        startBtn.classList.add('active'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active'); guideMsg.textContent = "PLAY A STRING";
        processAudio();
    } catch(e) { alert("Microphone access required."); }
}

function applyFilters() {
    if(!highPassFilter) return;
    const data = instruments[currentInstrument];
    highPassFilter.frequency.value = data.hpf || 40;
    lowPassFilter.frequency.value = 2000; 
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('active'); btnText.textContent = "ACTIVATE";
    statusDot.classList.remove('active');
    resetUI();
    if(mediaStream) mediaStream.getTracks().forEach(t => t.stop());
}

function resetUI() {
    targetAngle = 0; displayAngle = 0; isLocked = false; stableStringIndex = -1;
    noteNameEl.textContent = "--"; octaveEl.textContent = ""; noteNameEl.classList.remove('active');
    freqEl.textContent = "0.0 Hz"; centsEl.classList.remove('visible');
    document.body.className = "";
    guideMsg.textContent = "READY"; guideMsg.style.color = "var(--text-muted)";
}

function processAudio() {
    if(!isRunning) return;
    analyser.getFloatTimeDomainData(buf);
    
    let rms = 0; for(let i=0; i<buf.length; i++) rms += buf[i]*buf[i]; rms = Math.sqrt(rms/buf.length);

    if(rms < 0.02) { 
        framesSinceLastPitch++;
        if(framesSinceLastPitch > 20) {
            // 소리가 끊겨도 잠금 상태는 조금 더 유지 (안정감)
            if(framesSinceLastPitch > 60) { 
                isLocked = false; 
                stableStringIndex = -1; 
                document.body.className = ""; 
            }
        }
        requestAnimationFrame(processAudio); return;
    }

    const pitch = yin(buf, audioContext.sampleRate);
    if(pitch !== -1 && pitch < 2000) {
        framesSinceLastPitch = 0;
        freqSmoother.add(pitch);
        updateTuner(freqSmoother.getValue());
    }
    requestAnimationFrame(processAudio);
}

function yin(buffer, sampleRate) {
    const threshold = 0.15; let tauEstimate = -1; 
    const yinBuffer = new Float32Array(buffer.length/2); yinBuffer[0] = 1; let runningSum = 0;
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        let deltaSum = 0; for (let i = 0; i < yinBuffer.length; i++) deltaSum += (buffer[i] - buffer[i + tau]) ** 2;
        yinBuffer[tau] = deltaSum; runningSum += yinBuffer[tau];
        yinBuffer[tau] *= (runningSum !== 0) ? tau / runningSum : 1;
    }
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau; break;
        }
    }
    if (tauEstimate !== -1) {
        const s0 = yinBuffer[tauEstimate], s1 = yinBuffer[tauEstimate-1]||s0, s2 = yinBuffer[tauEstimate+1]||s0;
        let adj = (s1 - s2) / (2 * (s1 - 2 * s0 + s2));
        return sampleRate / (tauEstimate + (isNaN(adj)?0:adj));
    }
    return -1;
}

function findNote(frequency) {
    const data = instruments[currentInstrument];
    if(data.isChromatic) {
        const n = Math.round(12*Math.log2(frequency/440)+69);
        return { note: noteStrings[n%12], octave: Math.floor(n/12)-1, target: 440*Math.pow(2,(n-69)/12), index:-1 };
    }

    let bestMatch = null;
    let minDiff = Infinity;

    data.strings.forEach((str, idx) => {
        const diff = Math.abs(frequency - str.freq);
        const ratio = Math.max(frequency, str.freq) / Math.min(frequency, str.freq);
        const isOctave = Math.abs(frequency - str.freq*2) < (str.freq * 0.1);
        
        if (ratio < 1.25 || isOctave) { 
            let weight = (idx === stableStringIndex) ? 0.6 : 1.0;
            if (diff * weight < minDiff) {
                minDiff = diff * weight;
                bestMatch = { ...str, target: str.freq, index: idx };
            }
        }
    });
    return bestMatch;
}

function updateTuner(freq) {
    const match = findNote(freq);
    if(!match) return;

    if(stableStringIndex === -1) {
        stableStringIndex = match.index;
    } else if(stableStringIndex !== match.index) {
        stringLockCounter++;
        if(stringLockCounter < 15) return; 
        stableStringIndex = match.index; stringLockCounter = 0;
        isLocked = false; // 줄이 바뀌면 잠금 해제
    } else {
        stringLockCounter = 0;
    }

    let calcFreq = freq;
    if(Math.abs(freq - match.target*2) < (match.target * 0.2)) calcFreq = freq/2;
    
    let cents = 1200 * Math.log2(calcFreq / match.target);
    if (Math.abs(cents) > 100) return;

    // --- [핵심] 바늘 고정 및 히스테리시스 로직 ---
    if (isLocked) {
        // 이미 고정된 상태라면, 오차가 UNLOCK_THRESHOLD를 넘어야만 잠금 해제
        if (Math.abs(cents) > UNLOCK_THRESHOLD) {
            isLocked = false;
            targetAngle = cents * 1.5;
        } else {
            targetAngle = 0; // 고정 유지
        }
    } else {
        // 고정되지 않은 상태에서 LOCK_THRESHOLD 안으로 들어오면 잠금
        if (Math.abs(cents) < LOCK_THRESHOLD) {
            if (!isLocked) { playSuccessSound(); isLocked = true; }
            targetAngle = 0;
        } else {
            targetAngle = cents * 1.5;
        }
    }

    renderUI(match.note, match.octave, cents, match.target);
}

function renderUI(note, oct, cents, freq) {
    noteNameEl.textContent = note; octaveEl.textContent = oct; noteNameEl.classList.add('active');
    freqEl.textContent = freq.toFixed(1) + " Hz";
    
    centsEl.textContent = isLocked ? "OK" : (cents>0?"+":"") + Math.round(cents);
    centsEl.classList.add('visible');

    let statusClass = 'perfect'; let msg = "PERFECT";
    if(!isLocked) {
        if(cents < -3) { statusClass = 'low'; msg = "TOO LOW"; }
        else if(cents > 3) { statusClass = 'high'; msg = "TOO HIGH"; }
        else { msg = "HOLD..."; }
    }
    document.body.className = statusClass;
    guideMsg.textContent = msg; guideMsg.style.color = "var(--current-neon)";
}

function playSuccessSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, t); 
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    osc.connect(g).connect(audioContext.destination);
    osc.start(t); osc.stop(t + 0.4);
}

function updateVisualizer() {
    // [수정] 잠금 상태일 때는 바늘이 더 묵직하게(천천히) 중앙으로 붙도록 설정
    const lerpFactor = isLocked ? 0.03 : 0.12;
    displayAngle += (targetAngle - displayAngle) * lerpFactor;
    
    // 바늘이 아주 중앙에 가까워지면 정확히 0으로 고정하여 떨림 제거
    if (isLocked && Math.abs(displayAngle) < 0.1) displayAngle = 0;

    if(needleGroup) needleGroup.setAttribute('transform', `rotate(${displayAngle}, 100, 100)`);
    requestAnimationFrame(updateVisualizer);
}

init();