// ===============================================
// CHURCH TUNER PRO v4.0 - Professional Grade
// ===============================================

// --- 악기 데이터 ---
const instruments = {
    guitar: { 
        name: "GUITAR", icon: "🎸", detail: "Standard E", 
        minFreq: 75, maxFreq: 400,
        strings: [ 
            { note: "E", octave: 2, freq: 82.41, name: "6th" },
            { note: "A", octave: 2, freq: 110.00, name: "5th" },
            { note: "D", octave: 3, freq: 146.83, name: "4th" },
            { note: "G", octave: 3, freq: 196.00, name: "3rd" },
            { note: "B", octave: 3, freq: 246.94, name: "2nd" },
            { note: "E", octave: 4, freq: 329.63, name: "1st" }
        ] 
    },
    bass: { 
        name: "BASS", icon: "🎸", detail: "Standard", 
        minFreq: 35, maxFreq: 150,
        strings: [ 
            { note: "E", octave: 1, freq: 41.20, name: "4th" },
            { note: "A", octave: 1, freq: 55.00, name: "3rd" },
            { note: "D", octave: 2, freq: 73.42, name: "2nd" },
            { note: "G", octave: 2, freq: 98.00, name: "1st" }
        ] 
    },
    ukulele: { 
        name: "UKULELE", icon: "🌴", detail: "High-G", 
        minFreq: 230, maxFreq: 500,
        strings: [ 
            { note: "G", octave: 4, freq: 392.00, name: "4th" },
            { note: "C", octave: 4, freq: 261.63, name: "3rd" },
            { note: "E", octave: 4, freq: 329.63, name: "2nd" },
            { note: "A", octave: 4, freq: 440.00, name: "1st" }
        ] 
    },
    violin: { 
        name: "VIOLIN", icon: "🎻", detail: "Orchestra", 
        minFreq: 180, maxFreq: 700,
        strings: [ 
            { note: "G", octave: 3, freq: 196.00, name: "4th" },
            { note: "D", octave: 4, freq: 293.66, name: "3rd" },
            { note: "A", octave: 4, freq: 440.00, name: "2nd" },
            { note: "E", octave: 5, freq: 659.25, name: "1st" }
        ] 
    },
    cello: { 
        name: "CELLO", icon: "🎻", detail: "Orchestra", 
        minFreq: 58, maxFreq: 260,
        strings: [ 
            { note: "C", octave: 2, freq: 65.41, name: "4th" },
            { note: "G", octave: 2, freq: 98.00, name: "3rd" },
            { note: "D", octave: 3, freq: 146.83, name: "2nd" },
            { note: "A", octave: 3, freq: 220.00, name: "1st" }
        ] 
    },
    chromatic: { 
        name: "CHROMATIC", icon: "🎹", detail: "All Notes", 
        minFreq: 60, maxFreq: 1000,
        isChromatic: true, 
        strings: [] 
    }
};

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ===============================================
// 오디오 설정
// ===============================================
let currentInstrument = 'guitar';
let audioContext = null;
let analyser = null;
let mediaStream = null;
let isRunning = false;

// 버퍼 설정 - 저음 감지를 위해 큰 버퍼 사용
const BUFFER_SIZE = 8192;
let audioBuffer = new Float32Array(BUFFER_SIZE);

// ===============================================
// 피치 감지 상태
// ===============================================
let detectedPitch = 0;
let detectedNote = null;
let cents = 0;
let isLocked = false;
let lockCounter = 0;
let silenceFrames = 0;

// 스무딩 버퍼
const pitchHistory = [];
const PITCH_HISTORY_SIZE = 5;

// UI 상태
let displayAngle = 0;
let targetAngle = 0;

// 상수
const LOCK_CENTS = 3;
const UNLOCK_CENTS = 10;
const LOCK_FRAMES_NEEDED = 5;
const SILENCE_THRESHOLD = 0.01;

// ===============================================
// DOM 요소
// ===============================================
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

// ===============================================
// 초기화
// ===============================================
function init() {
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    generateModalList();
    requestAnimationFrame(animationLoop);
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if (type === 'select' || (pill.id === 'dynamic-inst-card' && pill.classList.contains('active'))) {
        openModal();
        return;
    }
    activateInstrument(type, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentInstrument = key;
    if (key !== 'guitar' && key !== 'bass') {
        dynIcon.textContent = instruments[key].icon;
        dynName.textContent = instruments[key].name;
        dynamicCard.dataset.type = key;
    }
    resetState();
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const div = document.createElement('div');
        div.className = 'inst-option';
        div.innerHTML = `<div class="opt-icon">${inst.icon}</div><div class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></div>`;
        div.addEventListener('click', () => {
            activateInstrument(key, dynamicCard);
            modal.classList.add('hidden');
        });
        modalList.appendChild(div);
    });
}

function openModal() {
    modal.classList.remove('hidden');
}

// ===============================================
// 튜너 시작/정지
// ===============================================
function toggleTuner() {
    isRunning ? stopTuner() : startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 48000
            });
        }
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                channelCount: 1
            }
        });

        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // 간단한 필터 체인
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 30; // 매우 낮은 주파수만 차단
        highpass.Q.value = 0.5;

        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 1200;
        lowpass.Q.value = 0.5;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUFFER_SIZE * 2;
        analyser.smoothingTimeConstant = 0;

        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);

        isRunning = true;
        startBtn.classList.add('active');
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING";

        processAudio();
        
    } catch (e) {
        console.error('Microphone error:', e);
        alert("마이크 접근 권한이 필요합니다.");
    }
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('active');
    btnText.textContent = "ACTIVATE";
    statusDot.classList.remove('active');
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
    }
    resetState();
}

function resetState() {
    detectedPitch = 0;
    detectedNote = null;
    cents = 0;
    isLocked = false;
    lockCounter = 0;
    silenceFrames = 0;
    pitchHistory.length = 0;
    targetAngle = 0;
    displayAngle = 0;
    
    noteNameEl.textContent = "--";
    octaveEl.textContent = "";
    noteNameEl.classList.remove('active');
    freqEl.textContent = "0.0 Hz";
    centsEl.classList.remove('visible');
    document.body.className = "";
    guideMsg.textContent = "READY";
    guideMsg.style.color = "var(--text-muted)";
}

// ===============================================
// 메인 오디오 처리 루프
// ===============================================
function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(audioBuffer);

    // RMS 계산
    let rms = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
        rms += audioBuffer[i] * audioBuffer[i];
    }
    rms = Math.sqrt(rms / audioBuffer.length);

    if (rms < SILENCE_THRESHOLD) {
        silenceFrames++;
        if (silenceFrames > 15) {
            // 소리 없음 - 리셋 준비
            pitchHistory.length = 0;
            isLocked = false;
            lockCounter = 0;
        }
        if (silenceFrames > 40) {
            document.body.className = "";
            targetAngle = 0;
        }
        requestAnimationFrame(processAudio);
        return;
    }

    silenceFrames = 0;

    // 피치 감지
    const inst = instruments[currentInstrument];
    const pitch = detectPitch(audioBuffer, audioContext.sampleRate, inst.minFreq, inst.maxFreq);

    if (pitch > 0) {
        // 피치 히스토리에 추가
        pitchHistory.push(pitch);
        if (pitchHistory.length > PITCH_HISTORY_SIZE) {
            pitchHistory.shift();
        }

        // 안정적인 피치 계산 (중앙값)
        if (pitchHistory.length >= 3) {
            const stablePitch = getMedian(pitchHistory);
            updateTuning(stablePitch);
        }
    }

    requestAnimationFrame(processAudio);
}

// ===============================================
// 향상된 피치 감지 (ACF + YIN 하이브리드)
// ===============================================
function detectPitch(buffer, sampleRate, minFreq, maxFreq) {
    const bufferSize = buffer.length;
    
    // 주파수를 tau(샘플 지연)로 변환
    const minTau = Math.floor(sampleRate / maxFreq);
    const maxTau = Math.floor(sampleRate / minFreq);
    
    // 차이 함수 계산 (YIN 스타일)
    const yinBuffer = new Float32Array(maxTau + 1);
    
    // Step 1: 차이 함수
    for (let tau = 1; tau <= maxTau; tau++) {
        let sum = 0;
        for (let i = 0; i < bufferSize - maxTau; i++) {
            const diff = buffer[i] - buffer[i + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
    }
    
    // Step 2: 누적 평균 정규화 (CMNDF)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        runningSum += yinBuffer[tau];
        if (runningSum === 0) {
            yinBuffer[tau] = 1;
        } else {
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
        }
    }
    
    // Step 3: 절대 임계값으로 최소점 찾기
    let bestTau = -1;
    let bestVal = 1;
    const threshold = 0.2; // 더 관대한 임계값
    
    for (let tau = minTau; tau <= maxTau; tau++) {
        if (yinBuffer[tau] < threshold) {
            // 로컬 최소점 찾기
            while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            if (yinBuffer[tau] < bestVal) {
                bestVal = yinBuffer[tau];
                bestTau = tau;
            }
            break; // 첫 번째 좋은 최소점 사용
        }
    }
    
    // 최소점을 못 찾았으면 전체에서 가장 낮은 점 찾기
    if (bestTau === -1) {
        for (let tau = minTau; tau <= maxTau; tau++) {
            if (yinBuffer[tau] < bestVal) {
                bestVal = yinBuffer[tau];
                bestTau = tau;
            }
        }
    }
    
    // 신뢰도 체크
    if (bestTau === -1 || bestVal > 0.5) {
        return -1;
    }
    
    // Step 4: Parabolic interpolation으로 정밀도 향상
    let betterTau = bestTau;
    if (bestTau > 0 && bestTau < maxTau) {
        const s0 = yinBuffer[bestTau - 1];
        const s1 = yinBuffer[bestTau];
        const s2 = yinBuffer[bestTau + 1];
        const adjustment = (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
        if (isFinite(adjustment)) {
            betterTau = bestTau + adjustment;
        }
    }
    
    const frequency = sampleRate / betterTau;
    
    // 범위 체크
    if (frequency < minFreq * 0.9 || frequency > maxFreq * 1.1) {
        return -1;
    }
    
    return frequency;
}

// ===============================================
// 튜닝 업데이트
// ===============================================
function updateTuning(pitch) {
    const inst = instruments[currentInstrument];
    let note = null;
    
    if (inst.isChromatic) {
        note = findChromaticNote(pitch);
    } else {
        note = findClosestString(pitch, inst.strings);
    }
    
    if (!note) return;
    
    // 옥타브 보정 (배음 감지 시)
    let targetFreq = note.freq;
    let actualPitch = pitch;
    
    // 옥타브 위로 감지된 경우 보정
    const ratio = pitch / targetFreq;
    if (ratio > 1.8 && ratio < 2.2) {
        actualPitch = pitch / 2;
    } else if (ratio > 0.45 && ratio < 0.55) {
        actualPitch = pitch * 2;
    }
    
    // 센트 계산
    const currentCents = 1200 * Math.log2(actualPitch / targetFreq);
    
    // 50센트 이상 벗어나면 무시
    if (Math.abs(currentCents) > 50) return;
    
    cents = currentCents;
    detectedNote = note;
    detectedPitch = actualPitch;
    
    // 잠금 로직
    updateLockState();
    
    // UI 업데이트
    renderUI();
}

function findClosestString(pitch, strings) {
    let best = null;
    let minCents = Infinity;
    
    for (const str of strings) {
        // 기본 주파수 체크
        let diff = Math.abs(1200 * Math.log2(pitch / str.freq));
        if (diff < minCents) {
            minCents = diff;
            best = { ...str, target: str.freq };
        }
        
        // 옥타브 위 체크 (배음)
        diff = Math.abs(1200 * Math.log2(pitch / (str.freq * 2)));
        if (diff < minCents) {
            minCents = diff;
            best = { ...str, target: str.freq };
        }
    }
    
    // 50센트 이내의 매칭만 반환
    return minCents < 50 ? best : null;
}

function findChromaticNote(pitch) {
    const noteNum = 12 * Math.log2(pitch / 440) + 69;
    const roundedNote = Math.round(noteNum);
    const targetFreq = 440 * Math.pow(2, (roundedNote - 69) / 12);
    
    return {
        note: NOTE_STRINGS[roundedNote % 12],
        octave: Math.floor(roundedNote / 12) - 1,
        freq: targetFreq,
        target: targetFreq
    };
}

function updateLockState() {
    const absCents = Math.abs(cents);
    
    if (isLocked) {
        // 잠금 해제 조건
        if (absCents > UNLOCK_CENTS) {
            isLocked = false;
            lockCounter = 0;
        }
    } else {
        // 잠금 조건
        if (absCents < LOCK_CENTS) {
            lockCounter++;
            if (lockCounter >= LOCK_FRAMES_NEEDED) {
                isLocked = true;
                playSuccessSound();
            }
        } else {
            lockCounter = Math.max(0, lockCounter - 1);
        }
    }
    
    // 바늘 각도 계산
    if (isLocked) {
        targetAngle = 0;
    } else {
        targetAngle = Math.max(-60, Math.min(60, cents * 1.5));
    }
}

function renderUI() {
    if (!detectedNote) return;
    
    // 노트 표시
    noteNameEl.textContent = detectedNote.note;
    octaveEl.textContent = detectedNote.octave;
    noteNameEl.classList.add('active');
    
    // 주파수 표시
    freqEl.textContent = detectedNote.freq.toFixed(1) + " Hz";
    
    // 센트 표시
    if (isLocked) {
        centsEl.textContent = "✓ OK";
    } else {
        const sign = cents > 0 ? "+" : "";
        centsEl.textContent = sign + Math.round(cents) + "¢";
    }
    centsEl.classList.add('visible');
    
    // 상태 색상
    let statusClass, message;
    
    if (isLocked) {
        statusClass = 'perfect';
        message = "PERFECT";
    } else if (cents < -5) {
        statusClass = 'low';
        message = "▲ TUNE UP";
    } else if (cents > 5) {
        statusClass = 'high';
        message = "▼ TUNE DOWN";
    } else {
        statusClass = 'perfect';
        message = lockCounter > 0 ? "HOLD..." : "ALMOST...";
    }
    
    document.body.className = statusClass;
    guideMsg.textContent = message;
    guideMsg.style.color = "var(--current-neon)";
}

// ===============================================
// 애니메이션 루프
// ===============================================
function animationLoop() {
    // 부드러운 바늘 움직임
    const lerp = isLocked ? 0.1 : 0.2;
    displayAngle += (targetAngle - displayAngle) * lerp;
    
    // 아주 작은 움직임은 무시 (떨림 방지)
    if (Math.abs(targetAngle - displayAngle) < 0.3) {
        displayAngle = targetAngle;
    }
    
    if (needleGroup) {
        needleGroup.setAttribute('transform', `rotate(${displayAngle}, 100, 100)`);
    }
    
    requestAnimationFrame(animationLoop);
}

// ===============================================
// 유틸리티
// ===============================================
function getMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function playSuccessSound() {
    if (!audioContext) return;
    
    try {
        const t = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(1100, t + 0.08);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start(t);
        osc.stop(t + 0.25);
    } catch (e) {
        // 사운드 재생 실패 무시
    }
}

// ===============================================
// 시작
// ===============================================
init();