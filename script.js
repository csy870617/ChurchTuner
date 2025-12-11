// --- 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", strings: [ { note: "E", octave: 2, freq: 82.41, num: 6 }, { note: "A", octave: 2, freq: 110.00, num: 5 }, { note: "D", octave: 3, freq: 146.83, num: 4 }, { note: "G", octave: 3, freq: 196.00, num: 3 }, { note: "B", octave: 3, freq: 246.94, num: 2 }, { note: "E", octave: 4, freq: 329.63, num: 1 } ], columns: 3 },
    bass: { name: "BASS", strings: [ { note: "E", octave: 1, freq: 41.20, num: 4 }, { note: "A", octave: 1, freq: 55.00, num: 3 }, { note: "D", octave: 2, freq: 73.42, num: 2 }, { note: "G", octave: 2, freq: 98.00, num: 1 } ], columns: 2 },
    ukulele: { name: "UKULELE", strings: [ { note: "G", octave: 4, freq: 392.00, num: 4 }, { note: "C", octave: 4, freq: 261.63, num: 3 }, { note: "E", octave: 4, freq: 329.63, num: 2 }, { note: "A", octave: 4, freq: 440.00, num: 1 } ], columns: 2 }
};
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 전역 변수 ---
let currentInstrument = 'guitar';
let targetFrequency = null; // 선택된 목표 주파수 (null이면 오토모드)

let audioContext = null; 
let analyser = null; 
let mediaStream = null;
let source = null;
let filterNode = null; // [핵심] 소음 차단용 필터
let isRunning = false; 
let rafId = null; 

// 성능 & 안정화 변수
const BUF_SIZE = 2048;
const buf = new Float32Array(BUF_SIZE);
const pitchBuffer = []; 

// 화면 갱신용
let displayCents = 0; 
let targetCents = 0;
let lastSuccessTime = 0;

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
    
    // 악기 선택
    instCards.forEach(card => {
        card.addEventListener('click', () => {
            instCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentInstrument = card.dataset.type;
            setManualMode(null); // 오토모드로 리셋
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
        
        // 버튼 클릭 시: 해당 줄만 듣기 (소음 차단 모드)
        btn.addEventListener('click', () => {
            if(!isRunning) startTuner(); // 꺼져있으면 켜기
            playReferenceTone(str.freq); // 기준음 재생
            setManualMode(str);
        });
        stringContainer.appendChild(btn);
    });
}

// [핵심] 수동/자동 모드 및 필터 설정
function setManualMode(stringData) {
    if (stringData) {
        // [수동 모드] 해당 주파수 대역만 통과시키는 필터 적용
        targetFrequency = stringData.freq;
        modeBadge.textContent = `TARGET: ${stringData.num}번줄 (${stringData.note})`;
        modeBadge.classList.add('manual');
        resetModeBtn.classList.remove('hidden');
        guideMsg.textContent = "잡음 차단 모드 (Band-Pass)";
        guideMsg.style.color = "var(--accent-yellow)";
        
        if (filterNode) {
            filterNode.type = 'bandpass';
            filterNode.frequency.value = targetFrequency;
            filterNode.Q.value = 1.5; // 대역폭 조절 (높을수록 좁음)
        }
    } else {
        // [오토 모드] 모든 소리 통과
        targetFrequency = null;
        modeBadge.textContent = "AUTO MODE";
        modeBadge.classList.remove('manual');
        resetModeBtn.classList.add('hidden');
        guideMsg.textContent = "줄을 튕겨주세요";
        guideMsg.style.color = "#888";
        
        if (filterNode) {
            filterNode.type = 'allpass'; // 필터 끔
        }
    }
    
    // 버튼 UI 업데이트
    const btns = document.querySelectorAll('.string-btn');
    btns.forEach(btn => {
        btn.classList.remove('manual-target');
        if (stringData && Math.abs(parseFloat(btn.dataset.freq) - stringData.freq) < 0.1) {
            btn.classList.add('manual-target');
        }
    });
}

function playReferenceTone(freq) {
    if (!audioContext) return;
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
    const now = Date.now();
    if(now - lastSuccessTime < 1000) return; // 1초 내 중복 재생 방지

    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); 
    gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(t + 0.5);
    lastSuccessTime = now;
}

function toggleTuner() {
    if (isRunning) stopTuner();
    else startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // [중요] 사용자가 버튼을 눌렀을 때 Context를 확실히 깨워야 함
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const constraints = { 
            audio: { 
                echoCancellation: false, 
                autoGainControl: false, // 마이크 감도 자동 조절 끔 (소음 증폭 방지)
                noiseSuppression: false 
            } 
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        
        // 필터 노드 생성 (BandPass Filter)
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = 'allpass'; // 초기엔 오토모드

        source = audioContext.createMediaStreamSource(mediaStream);
        
        // 연결: Source -> Filter -> Analyser -> Destination(X)
        source.connect(filterNode);
        filterNode.connect(analyser);

        isRunning = true;
        startBtn.classList.add('stop'); btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        
        // 만약 이미 타겟이 잡혀있다면 필터 적용
        if(targetFrequency) {
            filterNode.type = 'bandpass';
            filterNode.frequency.value = targetFrequency;
            filterNode.Q.value = 1.5;
        }

        processAudio();
    } catch (err) { 
        console.error(err); 
        alert("마이크를 켤 수 없습니다. 권한을 확인해주세요."); 
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('stop'); btnText.textContent = "ACTIVATE MIC";
    statusDot.classList.remove('active');
    resetUI();
    
    if (rafId) cancelAnimationFrame(rafId);
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (source) source.disconnect();
}

function resetUI() {
    targetCents = 0; displayCents = 0;
    noteNameEl.classList.remove('active'); noteNameEl.textContent = "--"; octaveEl.textContent = "";
    freqEl.textContent = "0.0 Hz"; centsEl.classList.add('hidden');
    tuningIndicator.style.backgroundColor = "var(--accent-green)";
    tuningIndicator.style.left = "50%";
    
    document.querySelectorAll('.string-btn').forEach(b => {
        b.classList.remove('detected', 'locked');
    });
}

function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    
    // 1. RMS(볼륨) 체크 - 강력한 노이즈 게이트
    let rms = 0;
    for (let i = 0; i < BUF_SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / BUF_SIZE);

    // 0.015 미만의 소리는 아예 무시 (키보드, 옷깃 스치는 소리 등)
    if (rms < 0.015) {
        targetCents = 0; // 바늘 중앙으로
        rafId = requestAnimationFrame(processAudio);
        return;
    }

    // 2. 피치 감지
    const pitch = autoCorrelate(buf, audioContext.sampleRate);

    if (pitch !== -1) {
        // [이중 안전장치] 필터를 통과했더라도 타겟과 너무 다르면 무시
        if (targetFrequency) {
            const ratio = pitch / targetFrequency;
            if (ratio < 0.8 || ratio > 1.2) {
                // 범위 밖 소음
                rafId = requestAnimationFrame(processAudio);
                return;
            }
        }
        updateTuner(pitch);
    } else {
        // 소리는 크지만 음정이 불분명한 경우 (타건음, 박수) -> 무시
        if(targetCents !== 0) {
            // 천천히 리셋
            targetCents = 0;
        }
    }

    rafId = requestAnimationFrame(processAudio);
}

function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    
    // 검색 범위 제한 (기타 음역대)
    let r1 = Math.floor(sampleRate / 1200); 
    let r2 = Math.floor(sampleRate / 40);   
    if (r2 > size) r2 = size;

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = r1; offset < r2; offset++) {
        let correlation = 0;
        // 정밀 계산
        for (let i = 0; i < size - offset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / size);

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    // [중요] 상관관계 0.96 이상만 인정 (잡음 차단 핵심)
    // 이 값이 높을수록 '맑은 소리'만 통과시킵니다.
    if (bestCorrelation > 0.96) {
        return sampleRate / bestOffset;
    }
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
        playSuccessSound();
        
        // 가까운 버튼 불 켜기
        highlightClosestString(frequency);
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
        highlightClosestString(frequency);
    }
    centsEl.classList.remove('hidden');
}

function highlightClosestString(frequency) {
    const btns = document.querySelectorAll('.string-btn');
    let closestBtn = null;
    let minDiff = Infinity;

    btns.forEach(btn => {
        btn.classList.remove('detected', 'locked'); // 초기화
        const targetFreq = parseFloat(btn.dataset.freq);
        const diff = Math.abs(1200 * Math.log2(frequency / targetFreq));

        if (diff < minDiff) {
            minDiff = diff;
            closestBtn = btn;
        }
    });

    if (closestBtn && minDiff < 300) {
        // 정튜닝이면 locked(초록), 아니면 detected(파랑)
        const isPerfect = Math.abs(1200 * Math.log2(frequency / parseFloat(closestBtn.dataset.freq))) <= 3;
        closestBtn.classList.add(isPerfect ? 'locked' : 'detected');
    }
}

function updateVisualizer() {
    // 부드러운 움직임 (Lerp)
    displayCents += (targetCents - displayCents) * 0.3;
    let percentage = 50 + displayCents;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100;
    
    tuningIndicator.style.left = `${percentage}%`;
    requestAnimationFrame(updateVisualizer);
}

init();