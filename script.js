// ===============================================
// CHURCH TUNER v5
// ===============================================

// --- 악기 데이터 ---
// minFreq/maxFreq: 피치 탐색 범위, lowpass: 분석 전 저역통과 컷오프(Hz)
// lowpass를 악기별로 두는 이유: 강철줄은 고차 배음일수록 음정이 높아지는 비조화성이 있어,
// 불필요하게 높은 배음까지 통과시키면 측정값이 몇 센트 샤프하게 치우친다.
const instruments = {
    guitar: {
        name: "Guitar", detail: "Standard E",
        minFreq: 65, maxFreq: 400, lowpass: 900,
        strings: [
            { note: "E", octave: 2, freq: 82.41 },
            { note: "A", octave: 2, freq: 110.00 },
            { note: "D", octave: 3, freq: 146.83 },
            { note: "G", octave: 3, freq: 196.00 },
            { note: "B", octave: 3, freq: 246.94 },
            { note: "E", octave: 4, freq: 329.63 }
        ]
    },
    bass: {
        name: "Bass", detail: "Standard 4-string",
        minFreq: 35, maxFreq: 150, lowpass: 500,
        strings: [
            { note: "E", octave: 1, freq: 41.20 },
            { note: "A", octave: 1, freq: 55.00 },
            { note: "D", octave: 2, freq: 73.42 },
            { note: "G", octave: 2, freq: 98.00 }
        ]
    },
    ukulele: {
        name: "Ukulele", detail: "High-G",
        minFreq: 230, maxFreq: 500, lowpass: 1200,
        strings: [
            { note: "G", octave: 4, freq: 392.00 },
            { note: "C", octave: 4, freq: 261.63 },
            { note: "E", octave: 4, freq: 329.63 },
            { note: "A", octave: 4, freq: 440.00 }
        ]
    },
    violin: {
        name: "Violin", detail: "Standard",
        minFreq: 180, maxFreq: 700, lowpass: 1500,
        strings: [
            { note: "G", octave: 3, freq: 196.00 },
            { note: "D", octave: 4, freq: 293.66 },
            { note: "A", octave: 4, freq: 440.00 },
            { note: "E", octave: 5, freq: 659.25 }
        ]
    },
    cello: {
        name: "Cello", detail: "Standard",
        minFreq: 58, maxFreq: 260, lowpass: 900,
        strings: [
            { note: "C", octave: 2, freq: 65.41 },
            { note: "G", octave: 2, freq: 98.00 },
            { note: "D", octave: 3, freq: 146.83 },
            { note: "A", octave: 3, freq: 220.00 }
        ]
    },
    chromatic: {
        name: "Chromatic", detail: "All notes",
        minFreq: 35, maxFreq: 1000, lowpass: 1500,
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
let sourceNode = null;
let highpassNode = null;
let lowpassNode = null;
let isRunning = false;
let isStarting = false; // startTuner 중복 진입 방지 (권한 팝업 중 재클릭 등)
let sessionId = 0; // 정지/시작을 빠르게 반복해도 이전 루프가 살아남지 않도록 하는 세대 토큰

// 분석 버퍼 (분석 샘플레이트 기준 약 170ms, 베이스 E1도 7주기 이상 확보)
const BUFFER_SIZE = 8192;
// 96kHz 이상 장치는 정수배로 솎아내(decimation) 이 레이트 이하에서 분석
// → 버퍼 길이·연산량·최저음 감지 범위가 장치와 무관하게 유지됨
const MAX_ANALYSIS_RATE = 64000;
let decimation = 1;
let analysisSampleRate = 48000;
let rawBuffer = new Float32Array(BUFFER_SIZE);
let audioBuffer = new Float32Array(BUFFER_SIZE);
const refineBuffer = new Float32Array(BUFFER_SIZE);

// YIN 버퍼: 최대 지연 = 64000 / 35Hz ≈ 1829 샘플
const MAX_TAU = 4096;
const diffBuffer = new Float64Array(MAX_TAU + 2);
const yinBuffer = new Float64Array(MAX_TAU + 2);

// ===============================================
// 피치 감지 / 표시 상태
// ===============================================
let detectedPitch = 0;
let detectedNote = null;
let cents = 0;              // 화면·바늘에 쓰는 스무딩된 센트
let hasReading = false;
let isLocked = false;
let lockHeldMs = 0;
let quietMs = 0;
let quietResetDone = false;
let quietIdleDone = false;
let lastAnalysisAt = 0;
let beepGuardUntil = 0;
let loopErrorLogged = false;

// 음 확정(focus): 다른 음으로 튀어도 곧바로 바꾸지 않고 확인 후 전환
let committedKey = null;
let pendingKey = null;
let pendingCount = 0;

// 확정된 음의 최근 피치(기본음 기준으로 보정된 값)
const pitchHistory = [];
const HISTORY_SIZE = 5;          // 홀수: 중앙값이 항상 실제 측정값 중 하나가 되도록

// 바늘
let displayAngle = 0;
let targetAngle = 0;
let lastFrameAt = 0;

// --- 튜닝 판정 상수 ---
const LOCK_CENTS = 5;            // ±5¢ 안에 머물면 In tune
const UNLOCK_CENTS = 8;          // 이만큼 벗어나야 해제 (히스테리시스: 경계에서 깜빡임 방지)
const LOCK_HOLD_MS = 150;        // In tune 판정 전 머물러야 하는 시간
const NOTE_CONFIRM_FRAMES = 3;   // 다른 음으로 전환하려면 연속 확인이 필요한 분석 횟수
const STABLE_SPREAD_CENTS = 20;  // 최근 피치들의 흩어짐이 이보다 크면(말소리·어택 순간) 표시 갱신 보류
const FAR_LIMIT_CENTS = 300;     // 줄에서 이 이상 벗어난 소리는 무시 (많이 풀린 줄도 방향 안내는 가능)

// --- 신호/타이밍 상수 ---
const SILENCE_THRESHOLD = 0.012; // 잔잔한 배경 소음 무시 (RMS)
const YIN_THRESHOLD = 0.2;       // 첫 번째 주기 후보 임계값
const YIN_MAX_APERIODICITY = 0.22; // 이보다 주기성이 약하면(소음) 음으로 인정하지 않음
const QUIET_RESET_MS = 250;      // 소리가 끊기고 이 시간이 지나면 음 확정 해제
const QUIET_IDLE_MS = 700;       // 이 시간이 지나면 대기 화면으로
const ANALYSIS_INTERVAL_MS = 15; // 분석 빈도 상한(~60회/초): 120Hz 화면에서도 동작·부하 동일
const CENTS_TAU_FAST_MS = 60;    // 크게 움직일 때 스무딩 시간상수 (빠른 추종)
const CENTS_TAU_SLOW_MS = 140;   // 거의 맞을 때 스무딩 시간상수 (안정된 표시)
const NEEDLE_TAU_MS = 70;
const NEEDLE_DEADZONE = 2;       // 이 센트 이내는 바늘을 중앙에 (미세 떨림 방지)
const GAUGE_RANGE_CENTS = 50;    // 게이지 끝 = ±50¢
const GAUGE_MAX_ANGLE = 60;      // 게이지 끝 각도(도)
const GAUGE_CX = 120;
const GAUGE_CY = 128;
const GAUGE_R = 108;

// ===============================================
// DOM 요소
// ===============================================
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const accidentalEl = document.getElementById('note-accidental');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const targetNoteEl = document.getElementById('target-note');
const centsEl = document.getElementById('cents');
const needleGroup = document.getElementById('needle-group');
const gaugeTicks = document.getElementById('gauge-ticks');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const guideMsg = document.getElementById('guide-msg');
const stringRow = document.getElementById('string-row');
const instPills = document.querySelectorAll('.inst-pill');
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynName = document.getElementById('dyn-name');

const SVG_NS = 'http://www.w3.org/2000/svg';

// ===============================================
// 초기화
// ===============================================
function init() {
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
    // 모바일에서 백그라운드 전환 시 AudioContext가 suspend된 뒤 복귀해도
    // 자동 resume되지 않아 튜너가 멈춘 것처럼 보이는 문제 복구
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning && audioContext) {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            } else if (audioContext.state === 'closed') {
                // 장시간 백그라운드 등으로 브라우저가 컨텍스트를 완전히 닫아버리면
                // resume이 불가능해 튜너가 "켜진 채로 멈춘" 상태가 되므로 정지 상태로 복구
                stopTuner();
            }
        }
    });
    buildGauge();
    generateModalList();
    renderStringChips();
}

function buildGauge() {
    if (!gaugeTicks) return;
    for (let c = -GAUGE_RANGE_CENTS; c <= GAUGE_RANGE_CENTS; c += 5) {
        const major = c % 25 === 0;
        const len = c === 0 ? 18 : major ? 13 : 7;
        const [x1, y1] = gaugePoint(c, GAUGE_R);
        const [x2, y2] = gaugePoint(c, GAUGE_R - len);
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1.toFixed(2));
        line.setAttribute('y1', y1.toFixed(2));
        line.setAttribute('x2', x2.toFixed(2));
        line.setAttribute('y2', y2.toFixed(2));
        line.setAttribute('class', c === 0 ? 'tick center' : major ? 'tick major' : 'tick');
        gaugeTicks.appendChild(line);
        if (major) {
            const [tx, ty] = gaugePoint(c, GAUGE_R + 12);
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', tx.toFixed(2));
            label.setAttribute('y', ty.toFixed(2));
            label.setAttribute('class', 'tick-label');
            label.textContent = c > 0 ? '+' + c : c < 0 ? '−' + Math.abs(c) : '0';
            gaugeTicks.appendChild(label);
        }
    }
    // In tune 구간(±LOCK_CENTS)을 게이지에 표시해 판정 기준을 눈으로 확인 가능하게
    const zone = document.createElementNS(SVG_NS, 'path');
    const r = GAUGE_R - 4;
    const [zx1, zy1] = gaugePoint(-LOCK_CENTS, r);
    const [zx2, zy2] = gaugePoint(LOCK_CENTS, r);
    zone.setAttribute('d', `M ${zx1.toFixed(2)} ${zy1.toFixed(2)} A ${r} ${r} 0 0 1 ${zx2.toFixed(2)} ${zy2.toFixed(2)}`);
    zone.setAttribute('class', 'gauge-zone');
    gaugeTicks.insertBefore ? gaugeTicks.insertBefore(zone, gaugeTicks.firstChild) : gaugeTicks.appendChild(zone);
}

function gaugePoint(centsValue, radius) {
    const rad = (centsToAngle(centsValue) * Math.PI) / 180;
    return [GAUGE_CX + radius * Math.sin(rad), GAUGE_CY - radius * Math.cos(rad)];
}

function centsToAngle(c) {
    const clamped = Math.max(-GAUGE_RANGE_CENTS, Math.min(GAUGE_RANGE_CENTS, c));
    return (clamped / GAUGE_RANGE_CENTS) * GAUGE_MAX_ANGLE;
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if (type === 'select' || (pill.id === 'dynamic-inst-card' && pill.classList.contains('active'))) {
        openModal();
        return;
    }
    // 이미 선택된 악기를 다시 누르면 튜닝 상태를 리셋하지 않음
    if (type === currentInstrument) return;
    activateInstrument(type, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
    });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    currentInstrument = key;
    if (key !== 'guitar' && key !== 'bass') {
        dynName.textContent = instruments[key].name;
        dynamicCard.dataset.type = key;
    }
    // 실행 중에 악기를 바꾸면 저역통과 필터도 새 악기에 맞춤
    if (lowpassNode) lowpassNode.frequency.value = instruments[key].lowpass;
    updateModalSelection();
    renderStringChips();
    resetState();
}

function stringsLabel(inst) {
    return inst.isChromatic ? "C – B" : inst.strings.map(s => s.note).join(' ');
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inst-option';
        btn.dataset.key = key;
        btn.innerHTML = `<span class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></span><span class="opt-strings">${stringsLabel(inst)}</span>`;
        btn.addEventListener('click', () => {
            activateInstrument(key, dynamicCard);
            closeModal();
        });
        modalList.appendChild(btn);
    });
    updateModalSelection();
}

function updateModalSelection() {
    const options = modalList.querySelectorAll ? modalList.querySelectorAll('.inst-option') : [];
    options.forEach(opt => {
        const selected = opt.dataset.key === currentInstrument;
        opt.classList.toggle('selected', selected);
        if (selected) opt.setAttribute('aria-current', 'true');
        else opt.removeAttribute('aria-current');
    });
}

function renderStringChips() {
    if (!stringRow) return;
    const inst = instruments[currentInstrument];
    stringRow.innerHTML = '';
    stringRow.classList.toggle('empty', !!inst.isChromatic);
    inst.strings.forEach(s => {
        const chip = document.createElement('span');
        chip.className = 'string-chip';
        chip.dataset.key = s.note + s.octave;
        chip.innerHTML = `${s.note}<small>${s.octave}</small>`;
        stringRow.appendChild(chip);
    });
}

function highlightString(key) {
    if (!stringRow || !stringRow.querySelectorAll) return;
    stringRow.querySelectorAll('.string-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.key === key);
    });
}

function openModal() {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const current = modalList.querySelector('.inst-option.selected') || modalList.querySelector('button');
    if (current) current.focus();
}

function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    dynamicCard.focus();
}

// ===============================================
// 튜너 시작/정지
// ===============================================
function toggleTuner() {
    isRunning ? stopTuner() : startTuner();
}

async function startTuner() {
    if (isStarting || isRunning) return;
    isStarting = true;

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError("HTTPS 환경에서만 마이크를 사용할 수 있습니다.");
            return;
        }

        if (!audioContext || audioContext.state === 'closed') {
            // 'closed'는 장시간 백그라운드 등으로 브라우저가 컨텍스트를 완전히
            // 닫아버린 경우로, resume이 불가능하므로 새로 만들어야 함
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) {
                showError("이 브라우저는 오디오 분석을 지원하지 않습니다.");
                return;
            }
            // 장치 기본 샘플레이트를 그대로 사용한다. 48kHz 등을 강제하면 Firefox는 마이크와
            // 레이트가 다를 때 createMediaStreamSource에서 NotSupportedError를 던지고,
            // 다른 브라우저도 리샘플링을 거치게 된다. 분석은 어떤 레이트에서도 동작한다.
            audioContext = new Ctx();
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

        // 마이크가 외부 요인(장치 분리, OS 권한 회수, 다른 앱 점유)으로 끊기면
        // 브라우저가 트랙에 'ended'를 발생시킴. 처리하지 않으면 튜너가
        // "켜진 채 반응 없는" 상태로 남으므로 정지 상태로 복구한다.
        const stream = mediaStream;
        stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                if (isRunning && mediaStream === stream) {
                    stopTuner();
                    showError("마이크 연결이 끊어졌습니다.");
                }
            });
        });

        sourceNode = audioContext.createMediaStreamSource(mediaStream);

        // 필터 체인
        highpassNode = audioContext.createBiquadFilter();
        highpassNode.type = 'highpass';
        highpassNode.frequency.value = 30; // 매우 낮은 주파수(진동·바람 소리 등)만 차단
        highpassNode.Q.value = 0.5;

        // 기본 주파수 추출을 위해 불필요한 고차 배음 제거 (악기별 컷오프)
        lowpassNode = audioContext.createBiquadFilter();
        lowpassNode.type = 'lowpass';
        lowpassNode.frequency.value = instruments[currentInstrument].lowpass;
        lowpassNode.Q.value = 0.5;

        configureAnalysisRate(audioContext.sampleRate);

        analyser = audioContext.createAnalyser();
        // 읽기 버퍼와 동일한 크기여야 최신 샘플을 받음
        analyser.fftSize = BUFFER_SIZE * decimation;
        analyser.smoothingTimeConstant = 0;

        sourceNode.connect(highpassNode);
        highpassNode.connect(lowpassNode);
        lowpassNode.connect(analyser);

        isRunning = true;
        sessionId++;
        const session = sessionId; // 이 세션에서 시작한 루프인지 식별하는 토큰
        lastAnalysisAt = 0;
        lastFrameAt = 0;
        loopErrorLogged = false;
        startBtn.classList.add('active');
        btnText.textContent = "Stop tuning";
        statusDot.classList.add('active');
        if (statusText) statusText.textContent = "Listening";
        document.body.classList.add('running');
        setGuide(idlePrompt());

        processAudio(session);
        requestAnimationFrame((t) => animationLoop(session, t));

    } catch (e) {
        console.error('Microphone error:', e);
        // 부분적으로 생성된 스트림/노드 정리 및 UI 복구
        stopTuner();
        showError(getMicErrorMessage(e));
    } finally {
        isStarting = false;
    }
}

function configureAnalysisRate(sampleRate) {
    decimation = sampleRate > 2 * MAX_ANALYSIS_RATE ? 4 : sampleRate > MAX_ANALYSIS_RATE ? 2 : 1;
    analysisSampleRate = sampleRate / decimation;
    const rawSize = BUFFER_SIZE * decimation;
    if (rawBuffer.length !== rawSize) rawBuffer = new Float32Array(rawSize);
}

function getMicErrorMessage(e) {
    switch (e && e.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return "마이크 접근 권한이 필요합니다.";
        case 'NotFoundError':
        case 'OverconstrainedError':
            return "사용 가능한 마이크를 찾을 수 없습니다.";
        case 'NotReadableError':
        case 'AbortError':
            return "마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인하세요.";
        default:
            return "마이크를 시작할 수 없습니다.";
    }
}

function showError(message) {
    guideMsg.textContent = message;
    guideMsg.classList.add('error');
}

function stopTuner() {
    isRunning = false;
    sessionId++; // 진행 중이던 루프(들)를 모두 무효화 (정지 직후 재시작해도 이전 루프가 되살아나지 않도록)
    startBtn.classList.remove('active');
    btnText.textContent = "Start tuning";
    statusDot.classList.remove('active');
    if (statusText) statusText.textContent = "Off";

    // 오디오 그래프 정리
    try { sourceNode && sourceNode.disconnect(); } catch (e) {}
    try { highpassNode && highpassNode.disconnect(); } catch (e) {}
    try { lowpassNode && lowpassNode.disconnect(); } catch (e) {}
    try { analyser && analyser.disconnect(); } catch (e) {}
    sourceNode = null;
    highpassNode = null;
    lowpassNode = null;
    analyser = null;

    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    resetState();
    setGuide("Ready");
}

function resetState() {
    detectedPitch = 0;
    detectedNote = null;
    cents = 0;
    hasReading = false;
    isLocked = false;
    lockHeldMs = 0;
    quietMs = 0;
    quietResetDone = false;
    quietIdleDone = false;
    beepGuardUntil = 0;
    committedKey = null;
    pendingKey = null;
    pendingCount = 0;
    pitchHistory.length = 0;
    targetAngle = 0;
    displayAngle = 0;
    // 애니메이션 루프가 멈춘 뒤에도 바늘이 중앙으로 돌아오도록 직접 갱신
    setNeedle(0);

    noteNameEl.textContent = "";
    if (accidentalEl) accidentalEl.textContent = "";
    octaveEl.textContent = "";
    freqEl.textContent = "— Hz";
    if (targetNoteEl) targetNoteEl.textContent = "— Hz";
    centsEl.textContent = "—";
    highlightString(null);
    document.body.className = isRunning ? "running" : "";
    guideMsg.classList.remove('error');
    setGuide(isRunning ? idlePrompt() : "Ready");
}

function idlePrompt() {
    return instruments[currentInstrument].isChromatic ? "Play a note" : "Play a string";
}

// ===============================================
// 메인 오디오 처리 루프
// ===============================================
function processAudio(session, timestamp) {
    if (!isRunning || session !== sessionId) return;
    // 다음 프레임을 먼저 예약: 분석 중 예외가 나도 루프가 조용히 멈추지 않도록
    requestAnimationFrame((t) => processAudio(session, t));

    const now = typeof timestamp === 'number' ? timestamp : performance.now();
    if (lastAnalysisAt && now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return;
    const dt = lastAnalysisAt ? Math.min(now - lastAnalysisAt, 100) : ANALYSIS_INTERVAL_MS;
    lastAnalysisAt = now;

    try {
        analyzeFrame(now, dt);
    } catch (e) {
        if (!loopErrorLogged) {
            loopErrorLogged = true;
            console.error('Analysis error:', e);
        }
    }
}

function analyzeFrame(now, dt) {
    readAnalysisBuffer();

    // RMS 계산
    let rms = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
        rms += audioBuffer[i] * audioBuffer[i];
    }
    rms = Math.sqrt(rms / audioBuffer.length);

    if (rms < SILENCE_THRESHOLD) {
        handleQuiet(dt);
        return;
    }

    const inst = instruments[currentInstrument];
    let pitch = detectPitch(audioBuffer, analysisSampleRate, inst.minFreq, inst.maxFreq);
    if (pitch > 0) pitch = refinePitch(audioBuffer, analysisSampleRate, pitch);
    const match = pitch > 0 ? (inst.isChromatic ? matchChromatic(pitch) : matchString(pitch, inst.strings)) : null;

    // 소리는 있지만 음정이 없는 경우(소음·말소리)도 조용한 것과 같이 취급해야
    // 마지막 판정("In tune" 등)이 화면에 계속 남지 않는다
    if (!match) {
        handleQuiet(dt);
        return;
    }

    quietMs = 0;
    quietResetDone = false;
    quietIdleDone = false;
    updateTuning(match, now, dt);
}

function readAnalysisBuffer() {
    if (decimation === 1) {
        analyser.getFloatTimeDomainData(audioBuffer);
        return;
    }
    analyser.getFloatTimeDomainData(rawBuffer);
    // 저역통과 필터(≤1.5kHz)를 이미 거쳤으므로 단순 평균 솎아내기로도 에일리어싱이 없다
    const inv = 1 / decimation;
    for (let i = 0, j = 0; i < BUFFER_SIZE; i++) {
        let s = 0;
        for (let k = 0; k < decimation; k++) s += rawBuffer[j++];
        audioBuffer[i] = s * inv;
    }
}

function handleQuiet(dt) {
    quietMs += dt;
    if (!quietResetDone && quietMs >= QUIET_RESET_MS) {
        quietResetDone = true;
        // 소리가 끊기면 음 확정도 해제 → 다음에 연주하는 음을 즉시 잡음
        pitchHistory.length = 0;
        isLocked = false;
        lockHeldMs = 0;
        committedKey = null;
        pendingKey = null;
        pendingCount = 0;
        hasReading = false;
    }
    if (!quietIdleDone && quietMs >= QUIET_IDLE_MS) {
        quietIdleDone = true;
        targetAngle = 0;
        // 마지막 측정값은 흐리게 남기고, 판정 색/안내문은 대기 상태로 복귀
        document.body.className = detectedNote ? "running has-note idle" : "running";
        highlightString(null);
        setGuide(idlePrompt());
    }
}

// ===============================================
// 피치 감지 (YIN, 차이 함수는 FFT로 계산)
// ===============================================
function detectPitch(buffer, sampleRate, minFreq, maxFreq) {
    const bufferSize = buffer.length;

    // 주파수를 tau(샘플 지연)로 변환
    const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxTau = Math.min(Math.floor(sampleRate / minFreq), MAX_TAU);
    if (maxTau <= minTau + 2 || maxTau >= bufferSize / 2) return -1;

    // 분석 윈도: 최저음의 약 3주기 이상. 버퍼의 "가장 최근" 구간을 사용해 지연을 줄인다.
    const windowSize = Math.min(bufferSize - maxTau, Math.max(4096, 3 * maxTau));
    const offset = bufferSize - windowSize - maxTau;

    // Step 1: 차이 함수 d(τ)
    computeDifference(buffer, offset, windowSize, maxTau);

    // Step 2: 누적 평균 정규화 (CMNDF)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        runningSum += diffBuffer[tau];
        yinBuffer[tau] = runningSum > 0 ? (diffBuffer[tau] * tau) / runningSum : 1;
    }

    // Step 3: 첫 번째로 충분히 깊은 골(주기 후보)을 찾음.
    // 엄격한 임계값의 골이 없을 때만 조금 완화된 임계값의 첫 골을 사용한다.
    // (전역 최솟값을 쓰면 2배 주기 = 한 옥타브 아래로 오검출될 수 있음)
    let bestTau = findFirstDip(minTau, maxTau, YIN_THRESHOLD);
    if (bestTau < 0) bestTau = findFirstDip(minTau, maxTau, YIN_MAX_APERIODICITY);
    if (bestTau < 0) return -1; // 주기성이 약함 → 소음으로 간주

    // Step 3b: 옥타브 위 오검출 방지. 실제 주기가 2τ라면 τ의 골은 얕고 2τ의 골이 훨씬 깊다.
    bestTau = preferTrueOctave(bestTau, maxTau);

    // Step 4: 원시 차이 함수에 포물선 보간 (CMNDF에 보간하면 미세한 편향이 생김)
    let betterTau = bestTau;
    if (bestTau > 1 && bestTau < maxTau) {
        const s0 = diffBuffer[bestTau - 1];
        const s1 = diffBuffer[bestTau];
        const s2 = diffBuffer[bestTau + 1];
        const denom = s0 - 2 * s1 + s2;
        if (denom > 0) {
            const adjustment = (0.5 * (s0 - s2)) / denom;
            if (Math.abs(adjustment) < 1) betterTau = bestTau + adjustment;
        }
    }

    const frequency = sampleRate / betterTau;

    // 범위 체크
    if (!isFinite(frequency) || frequency < minFreq * 0.9 || frequency > maxFreq * 1.1) {
        return -1;
    }
    return frequency;
}

// 강철줄은 배음이 높을수록 조금씩 더 높게 울려(비조화성) 주기 추정이 샤프하게 치우친다.
// 1차 추정값의 약 3배 위를 4차 저역통과로 걸러 기본음 부근 배음만으로 다시 측정한다.
function refinePitch(buffer, sampleRate, estimate) {
    const cutoff = Math.min(estimate * 3.2, sampleRate * 0.45);
    refineBuffer.set(buffer);
    lowpassInPlace(refineBuffer, cutoff, 0.5412, sampleRate); // 2개 직렬 = 4차 버터워스
    lowpassInPlace(refineBuffer, cutoff, 1.3066, sampleRate);
    const refined = detectPitch(refineBuffer, sampleRate, estimate / 1.25, estimate * 1.25);
    return refined > 0 && Math.abs(centsBetween(refined, estimate)) < 100 ? refined : estimate;
}

function lowpassInPlace(x, cutoff, q, sampleRate) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cw = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0;
    const a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const xi = x[i];
        const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = xi; y2 = y1; y1 = y;
        x[i] = y;
    }
}

function findFirstDip(minTau, maxTau, threshold) {
    let tau = minTau;
    // 탐색 시작점이 범위 밖(더 높은 음, 예: 2배음) 골의 끝자락이면 그 골은 건너뛴다.
    // 그대로 두면 경계값(maxFreq)을 음정으로 오인한다.
    if (yinBuffer[tau] < threshold && yinBuffer[tau - 1] <= yinBuffer[tau]) {
        while (tau <= maxTau && yinBuffer[tau] < threshold) tau++;
    }
    for (; tau <= maxTau; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            return tau;
        }
    }
    return -1;
}

function preferTrueOctave(tau, maxTau) {
    const t2 = tau * 2;
    if (t2 + 2 > maxTau || yinBuffer[tau] < 0.05) return tau;
    let best = t2;
    for (let t = t2 - 2; t <= t2 + 2; t++) {
        if (yinBuffer[t] < yinBuffer[best]) best = t;
    }
    return yinBuffer[best] < yinBuffer[tau] * 0.4 ? best : tau;
}

// d(τ) = Σ (x[i] - x[i+τ])² = E0 + E(τ) - 2·r(τ)
// 교차상관 r(τ)를 FFT로 구해 O(N log N)으로 계산 (직접 계산은 O(N·τ)로 모바일에서 프레임 드랍 유발)
function computeDifference(x, offset, windowSize, maxTau) {
    const len = windowSize + maxTau;
    const size = nextPow2(len);
    const t = getFFTTables(size);
    const re = t.re, im = t.im, cr = t.cr, ci = t.ci;

    // 두 실수 신호(윈도 a, 확장 구간 b)를 복소수 하나로 묶어 FFT 1회로 처리
    for (let i = 0; i < size; i++) {
        re[i] = i < windowSize ? x[offset + i] : 0;
        im[i] = i < len ? x[offset + i] : 0;
    }
    fft(re, im, t, false);

    const mask = size - 1;
    for (let k = 0; k < size; k++) {
        const m = (size - k) & mask;
        const xr = re[k], xi = im[k], yr = re[m], yi = im[m];
        const ar = (xr + yr) * 0.5, ai = (xi - yi) * 0.5;   // A_k
        const br = (xi + yi) * 0.5, bi = (yr - xr) * 0.5;   // B_k
        cr[k] = ar * br + ai * bi;                          // conj(A_k)·B_k
        ci[k] = ar * bi - ai * br;
    }
    fft(cr, ci, t, true);

    let e0 = 0;
    for (let i = 0; i < windowSize; i++) {
        const v = x[offset + i];
        e0 += v * v;
    }
    let et = e0;
    const invSize = 1 / size;
    diffBuffer[0] = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        const outV = x[offset + tau - 1];
        const inV = x[offset + tau + windowSize - 1];
        et += inV * inV - outV * outV;
        const d = e0 + et - 2 * cr[tau] * invSize;
        diffBuffer[tau] = d > 0 ? d : 0;
    }
}

function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

const fftTableCache = {};
function getFFTTables(size) {
    if (fftTableCache[size]) return fftTableCache[size];
    const levels = Math.round(Math.log2(size));
    const rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
        let r = 0;
        for (let b = 0, v = i; b < levels; b++, v >>= 1) r = (r << 1) | (v & 1);
        rev[i] = r;
    }
    const half = size >> 1;
    const cos = new Float64Array(half);
    const sin = new Float64Array(half);
    for (let i = 0; i < half; i++) {
        cos[i] = Math.cos((2 * Math.PI * i) / size);
        sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
    const tables = {
        size, rev, cos, sin,
        re: new Float64Array(size), im: new Float64Array(size),
        cr: new Float64Array(size), ci: new Float64Array(size)
    };
    fftTableCache[size] = tables;
    return tables;
}

// 기수-2 반복 FFT (제자리 계산). inverse=true면 역변환(정규화는 호출 측에서)
function fft(re, im, t, inverse) {
    const size = t.size, rev = t.rev, cos = t.cos, sin = t.sin;
    for (let i = 0; i < size; i++) {
        const j = rev[i];
        if (j > i) {
            let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
            tmp = im[i]; im[i] = im[j]; im[j] = tmp;
        }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= size; len <<= 1) {
        const halfLen = len >> 1;
        const step = size / len;
        for (let i = 0; i < size; i += len) {
            for (let j = 0, k = 0; j < halfLen; j++, k += step) {
                const wr = cos[k], wi = sign * sin[k];
                const a = i + j, b = a + halfLen;
                const tr = re[b] * wr - im[b] * wi;
                const ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
    }
}

// ===============================================
// 음 매칭
// ===============================================
function centsBetween(freq, ref) {
    return 1200 * Math.log2(freq / ref);
}

function nearestString(pitch, strings) {
    let best = null;
    for (const s of strings) {
        const c = centsBetween(pitch, s.freq);
        if (!best || Math.abs(c) < Math.abs(best.cents)) {
            best = { key: s.note + s.octave, target: s, cents: c, pitch };
        }
    }
    return best;
}

// 악기 모드: 가장 가까운 줄을 찾되, 다른 줄의 옥타브와 헷갈리지 않도록 순서대로 판단
function matchString(pitch, strings) {
    // 1) 들린 음 그대로 어떤 줄의 ±50¢ 안이면 그 줄
    const direct = nearestString(pitch, strings);
    if (Math.abs(direct.cents) <= 50) return direct;

    // 2) 검출기가 기본음 대신 2배음(한 옥타브 위)을 잡은 경우.
    //    지금 튜닝 중인 줄이거나 거의 정확히 2배일 때만 인정한다.
    //    (넓게 인정하면 많이 풀린 줄을 "다른 줄 + 반대 방향"으로 안내하는 위험한 오판이 생김)
    const octave = nearestString(pitch / 2, strings);
    if (Math.abs(octave.cents) <= 50 &&
        (octave.key === committedKey || Math.abs(octave.cents) <= 25 || Math.abs(direct.cents) > FAR_LIMIT_CENTS)) {
        return octave;
    }

    // 3) 많이 풀리거나 조여진 줄: 가장 가까운 줄로 안내 (범위 밖은 무시)
    return Math.abs(direct.cents) <= FAR_LIMIT_CENTS ? direct : null;
}

function matchChromatic(pitch) {
    const noteNum = Math.round(12 * Math.log2(pitch / 440) + 69);
    const freq = 440 * Math.pow(2, (noteNum - 69) / 12);
    const note = NOTE_STRINGS[((noteNum % 12) + 12) % 12];
    const octave = Math.floor(noteNum / 12) - 1;
    return { key: note + octave, target: { note, octave, freq }, cents: centsBetween(pitch, freq), pitch };
}

// ===============================================
// 튜닝 업데이트
// ===============================================
function updateTuning(match, now, dt) {
    let noteChanged = false;

    if (committedKey === null) {
        // 첫 감지는 즉시 확정
        committedKey = match.key;
        noteChanged = true;
    } else if (match.key !== committedKey) {
        // 성공 알림음이 마이크로 다시 들어오는 동안은 음 전환을 받지 않음
        if (now < beepGuardUntil) return;
        // 현재 확정된 음과 다른 음 → 연속으로 확인될 때만 전환
        if (pendingKey === match.key) {
            pendingCount++;
        } else {
            pendingKey = match.key;
            pendingCount = 1;
        }
        if (pendingCount < NOTE_CONFIRM_FRAMES) return; // 확정 전: 직전 표시 유지
        committedKey = match.key;
        noteChanged = true;
    }
    pendingKey = null;
    pendingCount = 0;

    if (noteChanged) {
        // 새 줄/음: 이전 음의 측정값·판정을 끌고 오지 않음 (줄마다 In tune 확인을 새로)
        pitchHistory.length = 0;
        hasReading = false;
        isLocked = false;
        lockHeldMs = 0;
        highlightString(match.key);
    }

    pitchHistory.push(match.pitch);
    if (pitchHistory.length > HISTORY_SIZE) pitchHistory.shift();
    if (pitchHistory.length < 3) return;

    // 최근 측정값이 흩어져 있으면(줄을 튕긴 직후의 어택, 말소리 등) 표시를 갱신하지 않음
    let lo = Infinity, hi = -Infinity;
    for (const p of pitchHistory) {
        if (p < lo) lo = p;
        if (p > hi) hi = p;
    }
    if (centsBetween(hi, lo) > STABLE_SPREAD_CENTS) return;

    const stablePitch = getMedian(pitchHistory);
    const rawCents = centsBetween(stablePitch, match.target.freq);

    // 센트 스무딩: 크게 움직일 땐 빠르게 따라가고, 거의 맞을 땐 차분하게
    if (!hasReading) {
        cents = rawCents;
        hasReading = true;
    } else {
        const tau = Math.abs(rawCents - cents) > 8 ? CENTS_TAU_FAST_MS : CENTS_TAU_SLOW_MS;
        cents += (rawCents - cents) * (1 - Math.exp(-dt / tau));
    }

    detectedNote = match.target;
    detectedPitch = stablePitch;

    updateLockState(now, dt);
    renderUI();
}

function updateLockState(now, dt) {
    const absCents = Math.abs(cents);

    if (isLocked) {
        if (absCents > UNLOCK_CENTS) {
            isLocked = false;
            lockHeldMs = 0;
        }
    } else if (absCents < LOCK_CENTS) {
        lockHeldMs += dt;
        if (lockHeldMs >= LOCK_HOLD_MS) {
            isLocked = true;
            playSuccessSound();
            beepGuardUntil = now + 350;
        }
    } else {
        lockHeldMs = Math.max(0, lockHeldMs - dt);
    }

    targetAngle = absCents < NEEDLE_DEADZONE ? 0 : centsToAngle(cents);
}

function renderUI() {
    if (!detectedNote) return;

    const name = detectedNote.note;
    setText(noteNameEl, name.charAt(0));
    if (accidentalEl) setText(accidentalEl, name.length > 1 ? "♯" : "");
    setText(octaveEl, String(detectedNote.octave));

    setText(freqEl, detectedPitch.toFixed(1) + " Hz");
    setText(targetNoteEl, detectedNote.freq.toFixed(1) + " Hz");

    const rounded = Math.round(cents);
    setText(centsEl, (rounded > 0 ? "+" : rounded < 0 ? "−" : "") + Math.abs(rounded));

    let tone, message;
    if (isLocked) {
        tone = 'perfect';
        message = "In tune";
    } else if (Math.abs(cents) < LOCK_CENTS) {
        tone = 'perfect';
        message = "Hold steady";
    } else if (cents < 0) {
        tone = 'low';
        message = "Tune up";
    } else {
        tone = 'high';
        message = "Tune down";
    }

    const bodyClass = `running has-note ${tone}${isLocked ? ' locked' : ''}`;
    if (document.body.className !== bodyClass) document.body.className = bodyClass;
    guideMsg.classList.remove('error');
    setGuide(message);
}

function setGuide(text) {
    setText(guideMsg, text);
}

function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

// ===============================================
// 바늘 애니메이션
// ===============================================
function animationLoop(session, timestamp) {
    if (session !== sessionId) return; // 이전 세션의 잔여 루프는 여기서 종료

    const now = typeof timestamp === 'number' ? timestamp : performance.now();
    const dt = lastFrameAt ? Math.min(now - lastFrameAt, 100) : 16;
    lastFrameAt = now;

    // 화면 주사율과 무관하게 같은 속도로 부드럽게 이동
    displayAngle += (targetAngle - displayAngle) * (1 - Math.exp(-dt / NEEDLE_TAU_MS));
    if (Math.abs(targetAngle - displayAngle) < 0.05) displayAngle = targetAngle;
    setNeedle(displayAngle);

    if (isRunning) {
        requestAnimationFrame((t) => animationLoop(session, t));
    }
}

function setNeedle(angle) {
    if (needleGroup) {
        needleGroup.setAttribute('transform', `rotate(${angle.toFixed(2)} ${GAUGE_CX} ${GAUGE_CY})`);
    }
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
