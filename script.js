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

// 오디오 처리 변수
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);

// [안정화] 중앙값 필터 (떨림 방지)
const pitchBuffer = [];
const BUFFER_SIZE = 5; 

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

// 상태 변수
let isNoteLocked = false;
let lockedNote = "";

// 화면 갱신용 (물리 엔진)
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

    // 화면 터치로 튜너 시작 (버튼은 뺐지만 기능은 유지)
    document.body.addEventListener('click', (e) => {
        // 악기 카드 클릭 등이 아닐 때만
        if (!e.target.closest('.inst-card') && !e.target.closest('.string-btn')) {
            if (!isRunning) startTuner();
        }
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
        btn.dataset.freq = str.freq;
        btn.dataset.note = str.note; btn.dataset.octave = str.octave;
        btn.innerHTML = `<span class="str-num">${str.num}</span>${str.note}`;
        stringContainer.appendChild(btn);
    });
}

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
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    if (closestBtn && minDiff < 350) {
        closestBtn.classList.remove('tuned'); 
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
        
        if (isLocked) {
            const key = closestBtn.dataset.note + closestBtn.dataset.octave;
            tunedStrings.add(key);
        }
    }
    
    btns.forEach(btn => {
        if (btn !== closestBtn) {
            const key = btn.dataset.note + btn.dataset.octave;
            if (tunedStrings.has(key)) btn.classList.add('tuned');
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
        statusDot.classList.add('active');
        guideMsg.textContent = "줄을 튕겨주세요";
        
        processAudio();
    } catch (err) { 
        console.error(err); 
        guideMsg.textContent = "터치하여 마이크 켜기";
    }
}

function stopTuner() {
    isRunning = false;
    statusDot.classList.remove('active');
    resetUI(true);
    guideMsg.textContent = "터치하여 시작";
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.left = "50%"; // 바늘 중앙 복귀
    
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
    
    // Autocorrelation
    const pitch = autoCorrelate(buf, audioContext.sampleRate);
    
    if (pitch !== -1) {
        // [안정화 1단계] 버퍼링
        pitchBuffer.push(pitch);
        if (pitchBuffer.length > BUFFER_SIZE) pitchBuffer.shift();

        // 버퍼가 어느 정도 찼을 때 중앙값 계산 (튀는 값 제거)
        if (pitchBuffer.length >= 3) {
            const sorted = [...pitchBuffer].sort((a,b) => a-b);
            const medianPitch = sorted[Math.floor(sorted.length/2)];
            
            silenceTimer = 0;
            updateTuner(medianPitch);
        }
    } else {
        // 소리가 없으면 버퍼 초기화하지 않고(잔향 유지) 타이머만 증가
        silenceTimer++;
        if (silenceTimer > 20) { // 0.3초 이상 조용하면
            targetCents = 0; // 바늘 중앙으로
            pitchBuffer.length = 0; // 버퍼 비움
            if (silenceTimer > 100) resetUI(true); // 오래 조용하면 텍스트 리셋
        }
    }

    rafId = requestAnimationFrame(processAudio);
}

function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) { const val = buf[i]; rms += val * val; }
    rms = Math.sqrt(rms / size);
    
    // 노이즈 게이트 (0.008 = 적당히 민감함)
    if (rms < 0.008) return -1;

    let r1 = Math.floor(sampleRate / 1200); 
    let r2 = Math.floor(sampleRate / 40);   
    if (r2 > size) r2 = size;

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        // 성능 타협: 2칸씩 건너뛰며 계산 (모바일 최적화)
        for (let i = 0; i < size - offset; i+=2) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / (size/2));

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    if (bestCorrelation > 0.95) return sampleRate / bestOffset;
    return -1;
}

function updateTuner(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    let cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));

    // [핵심] 자석(Magnet) 효과 - 오차 ±4센트 이내면 0으로 고정
    const isPerfect = Math.abs(cents) <= 4;

    if (isPerfect) {
        cents = 0; // 강제 0 처리 (바늘 떨림 방지)
        
        // 락이 안 걸려있거나 다른 노트면 락 걸기
        if (!isNoteLocked || lockedNote !== noteName) {
            isNoteLocked = true;
            lockedNote = noteName;
            
            // 완료 목록에 없으면 소리 재생
            const btnKey = noteName + octave;
            if (!tunedStrings.has(btnKey)) {
                playSuccessSound();
            }
        }
    } else if (Math.abs(cents) > 8) { 
        // 오차가 8센트 이상 벌어지면 락 해제 (다시 움직임)
        isNoteLocked = false;
        lockedNote = "";
    } else if (isNoteLocked) {
        // 락 걸린 상태에서 4~8센트 사이 미세한 떨림은 무시하고 0 유지
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

// [스마트 스무딩] 물리 엔진
function updateVisualizer() {
    // 락 걸렸을 때는 자석처럼 매우 강하게(0.4) 붙고, 아닐 때는 부드럽게(0.15) 이동
    const factor = isNoteLocked ? 0.4 : 0.15;
    
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    
    // 바늘 범위 제한 (0% ~ 100%)
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();