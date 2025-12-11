// --- 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let source = null;
let isRunning = false; 

// 오디오 처리
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);

// [안정화]
const stableBuffer = []; 
const STABILITY_THRESHOLD = 3; // 3번 연속 비슷해야 인정 (빠른 반응)

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

// 상태 변수
let isNoteLocked = false;
let lockedNote = "";

// 화면 갱신용
let displayCents = 0; 
let targetCents = 0;

// DOM Elements
const appContainer = document.getElementById('app-container');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
const tuningIndicator = document.getElementById('tuning-indicator');
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const stringContainer = document.getElementById('string-container');
const instCards = document.querySelectorAll('.inst-card');

function init() {
    renderStringButtons(currentInstrument);
    
    // 악기 선택
    instCards.forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation(); // 배경 클릭 이벤트 전파 방지
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            tunedStrings.clear();
            resetUI(false);
            renderStringButtons(currentInstrument);
        });
    });

    // [핵심] 화면 어디든 클릭하면 튜너 시작 (Invisible Button)
    document.body.addEventListener('click', () => {
        if (!isRunning) startTuner();
    });
    document.body.addEventListener('touchstart', () => {
        if (!isRunning) startTuner();
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

// 주파수 거리 기반 하이라이트
function highlightClosestString(frequency, isLocked) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        // 기존 상태 초기화 (tuned는 제외)
        if (!btn.classList.contains('tuned')) {
            btn.classList.remove('detected', 'locked');
        } else {
            // 이미 튜닝된 줄도 현재 감지 중이면 상태 표시해야 함
            btn.classList.remove('detected', 'locked'); 
        }

        const targetFreq = parseFloat(btn.dataset.freq);
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq)); // Cents 차이

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    // 오차 범위 ±350센트 이내일 때만 인식 (엉뚱한 줄 켜짐 방지)
    if (closestBtn && minDiff < 350) {
        closestBtn.classList.remove('tuned'); // 현재 상태 표시를 위해 잠시 제거
        closestBtn.classList.add(isLocked ? 'locked' : 'detected');
        
        if (isLocked) {
            const key = closestBtn.dataset.note + closestBtn.dataset.freq;
            tunedStrings.add(key);
        }
    }
    
    // 선택 안 된 나머지 버튼들 중 완료된 것 다시 켜기
    btns.forEach(btn => {
        if (btn !== closestBtn) {
            const key = btn.dataset.note + btn.dataset.freq;
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
    if (isRunning) return; // 이미 실행 중이면 무시

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
        
        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        isRunning = true;
        statusDot.classList.add('active');
        guideMsg.textContent = "줄을 튕겨주세요";
        
        processAudio();
    } catch (err) { 
        console.error(err); 
        // 팝업 제거됨 (조용히 실패)
        guideMsg.textContent = "마이크 권한 필요 (화면 터치)";
    }
}

function stopTuner() {
    isRunning = false;
    statusDot.classList.remove('active');
    resetUI(true);
    guideMsg.textContent = "일시 정지됨 (화면 터치)";
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
    
    // Autocorrelation 알고리즘 (가장 범용적이고 확실함)
    const pitch = autoCorrelate(buf, audioContext.sampleRate);
    
    if (pitch !== -1) {
        updateStableBuffer(pitch);
    } else {
        stableBuffer.length = 0; 
        // 소리가 끊기면 잠시 후 UI 리셋
        if (targetCents !== 0) {
            targetCents = 0;
            // 0.2초 정도 기다렸다가 리셋 (깜빡임 방지)
            setTimeout(() => { if(stableBuffer.length === 0) resetUI(true); }, 200);
        }
    }

    if (stableBuffer.length >= STABILITY_THRESHOLD) {
        // 중앙값 필터 (튀는 값 방지)
        const sorted = [...stableBuffer].sort((a,b) => a-b);
        const medianPitch = sorted[Math.floor(sorted.length/2)];
        
        updateTuner(medianPitch);
    }
    requestAnimationFrame(processAudio);
}

function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) { const val = buf[i]; rms += val * val; }
    rms = Math.sqrt(rms / size);
    
    // 노이즈 게이트 (0.01) - 너무 낮으면 잡음 잡고, 너무 높으면 1번줄 못 잡음
    if (rms < 0.008) return -1;

    let r1 = Math.floor(sampleRate / 1200); // Max Freq (High E ~ 12 fret)
    let r2 = Math.floor(sampleRate / 40);   // Min Freq (Low E)
    if (r2 > size) r2 = size;

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        // 샘플링 건너뛰지 않고 정밀 계산
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / size); 

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // 상관관계 0.9 이상일 때만 인정 (잡음 거르기)
    if (bestCorrelation < 0.9) return -1;

    return sampleRate / bestOffset;
}

function updateStableBuffer(pitch) {
    // 값이 너무 급격히 변하면(옥타브 튐) 버퍼 초기화
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

    const isPerfect = Math.abs(cents) <= 3; // 정튜닝 범위

    if (isPerfect) {
        cents = 0; // 자석 효과
        if (!isNoteLocked || lockedNote !== noteName) {
            isNoteLocked = true;
            lockedNote = noteName;
            playSuccessSound();
        }
    } else if (Math.abs(cents) > 10) { // 오차가 커지면 락 해제
        isNoteLocked = false;
        lockedNote = "";
    } else if (isNoteLocked) {
        cents = 0; // 락 걸린 상태 유지
    }

    targetCents = cents;
    lastNoteName = noteName;

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
    const factor = isNoteLocked ? 0.3 : 0.2;
    displayCents += (targetCents - displayCents) * factor;

    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();