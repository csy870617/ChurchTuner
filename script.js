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

let filterNode = null; // [핵심] 밴드패스 필터 노드
let isRunning = false; 
let rafId = null; 

// 오디오 처리
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const stableBuffer = []; 
const STABILITY_THRESHOLD = 3; 

// [완료된 줄 저장소]
const tunedStrings = new Set(); 

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
            setManualMode(null);
            renderStringButtons(currentInstrument);
        });
    });

    // 화면 터치로 시작
    document.body.addEventListener('click', (e) => {
        if (!e.target.closest('.inst-card') && !e.target.closest('.string-btn')) {
            if (!isRunning) startTuner();
        }
    });

    resetModeBtn.addEventListener('click', () => setManualMode(null));
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
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 배경 터치 방지
            // 소리 재생 없이 모드만 변경 (공연장 모드)
            setManualMode(str);
        });
        stringContainer.appendChild(btn);
    });
}

// [핵심] 필터 모드 제어
function setManualMode(stringData) {
    if (stringData) {
        // 매뉴얼 모드: 해당 줄 주파수만 통과시키는 강력한 필터 적용
        targetFrequency = stringData.freq;
        modeBadge.textContent = `TARGET: ${stringData.num}번줄 (${stringData.note})`;
        modeBadge.classList.add('manual');
        resetModeBtn.classList.remove('hidden');
        guideMsg.textContent = "주변 소음 차단 중...";
        guideMsg.style.color = "var(--accent-yellow)";
        
        // 필터 적용 (BandPass)
        if (filterNode && audioContext) {
            filterNode.type = 'bandpass';
            filterNode.frequency.value = targetFrequency;
            filterNode.Q.value = 5; // 좁은 대역폭 (주변 소음 강력 차단)
        }
        updateButtonStyles(stringData.freq);
    } else {
        // 오토 모드: 모든 소리 통과 (필터 끔)
        targetFrequency = null;
        modeBadge.textContent = "AUTO MODE";
        modeBadge.classList.remove('manual');
        resetModeBtn.classList.add('hidden');
        guideMsg.textContent = "줄을 튕겨주세요";
        guideMsg.style.color = "var(--text-secondary)";
        
        if (filterNode && audioContext) {
            filterNode.type = 'allpass'; // 필터 해제
            filterNode.frequency.value = 0;
        }
        updateButtonStyles(null);
    }
    resetUI();
}

function updateButtonStyles(activeFreq) {
    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        const freq = parseFloat(btn.dataset.freq);
        btn.classList.remove('target');
        
        const key = btn.dataset.note + btn.dataset.octave;
        if (tunedStrings.has(key)) btn.classList.add('tuned');
        else btn.classList.remove('tuned');

        if (activeFreq && Math.abs(freq - activeFreq) < 0.1) {
            btn.classList.add('target');
            btn.classList.remove('tuned');
        }
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

    if (closestBtn && minDiff < 300) {
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
    gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); // 짧고 명확하게
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.5);
}

async function startTuner() {
    if (isRunning) return;

    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // [중요] 공연장용 마이크 설정 (자동 게인 끄기)
        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, // 소음이 커도 게인을 멋대로 줄이지 않음
                noiseSuppression: false 
            } 
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        
        // [필터 체인 생성] Source -> Filter -> Analyser
        source = audioContext.createMediaStreamSource(mediaStream);
        filterNode = audioContext.createBiquadFilter();
        
        // 초기값: 오토 모드 (필터 없음)
        filterNode.type = 'allpass';
        
        source.connect(filterNode);
        filterNode.connect(analyser);

        isRunning = true;
        statusDot.classList.add('active');
        guideMsg.textContent = "줄을 튕겨주세요";
        startBtn.classList.add('active'); // 시각적 활성화
        
        processAudio();
    } catch (err) { 
        console.error(err); 
        guideMsg.textContent = "터치하여 마이크 켜기";
    }
}

function stopTuner() {
    isRunning = false;
    statusDot.classList.remove('active');
    startBtn.classList.remove('active');
    resetUI(true);
    guideMsg.textContent = "터치하여 시작";
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
}

function resetUI(keepTuned = false) {
    displayCents = 0; targetCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
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
    
    // RMS 체크 (노이즈 게이트) - 시끄러운 곳에서도 작동하도록 약간 높임
    let rms = 0;
    for (let i = 0; i < BUF_SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / BUF_SIZE);

    // 노이즈 게이트: 0.01 (너무 작은 소리는 무시)
    if (rms < 0.01) {
        handleSilence();
        rafId = requestAnimationFrame(processAudio);
        return;
    }

    const pitch = autoCorrelate(buf, audioContext.sampleRate);

    if (pitch !== -1) {
        // [이중 필터링]
        // 1. 하드웨어 필터(BandPass)는 이미 적용됨 (Source->Filter->Analyser)
        // 2. 소프트웨어 필터: 한번 더 범위 체크
        if (targetFrequency) {
            const ratio = pitch / targetFrequency;
            if (ratio < 0.85 || ratio > 1.15) {
                // 필터를 통과했더라도 주파수가 너무 튀면 무시
                handleSilence();
                rafId = requestAnimationFrame(processAudio);
                return;
            }
        }

        updateStableBuffer(pitch);

        if (stableBuffer.length >= STABILITY_THRESHOLD) {
            const sorted = [...stableBuffer].sort((a,b) => a-b);
            const medianPitch = sorted[Math.floor(sorted.length/2)];
            silenceTimer = 0;
            updateTuner(medianPitch);
        }
    } else {
        handleSilence();
    }

    rafId = requestAnimationFrame(processAudio);
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
        // 정밀도 최우선 (생략 없이 계산)
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / size);

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // 상관관계 96% 이상 (아주 명확한 소리만 인정)
    if (bestCorrelation > 0.96) return sampleRate / bestOffset;
    return -1;
}

function updateStableBuffer(pitch) {
    // 옥타브 튐 방지
    if (stableBuffer.length > 0) {
        const last = stableBuffer[stableBuffer.length - 1];
        if (Math.abs(last - pitch) > 5) stableBuffer.length = 0;
    }
    stableBuffer.push(pitch);
    if (stableBuffer.length > STABILITY_THRESHOLD) stableBuffer.shift();
}

function handleSilence() {
    silenceTimer++;
    if (silenceTimer > 20) { 
        targetCents = 0;
        stableBuffer.length = 0;
        if (silenceTimer > 80) resetUI(true);
    }
}

function updateTuner(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteRound = Math.round(noteNum) + 69;
    const noteName = noteStrings[noteRound % 12];
    const octave = Math.floor(noteRound / 12) - 1;
    let cents = Math.floor(1200 * Math.log(frequency / (440 * Math.pow(2, (noteRound - 69) / 12))) / Math.log(2));

    const isPerfect = Math.abs(cents) <= 3;

    if (isPerfect) {
        cents = 0; // 자석 효과
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