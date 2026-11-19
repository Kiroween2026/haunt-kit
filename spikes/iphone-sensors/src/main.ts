// Haunt Kit - Spike: iPhone Sensor Test (Task A1)
// Follows .kiro/steering/tech.md and ANISH_PROMPTS.md requirements

/**
 * Sensor sample conforming to @haunt-kit/protocol
 */
export type Sample = {
  t: number; // Elapsed ms since recording start
  ax: number; // m/s² with gravity (DeviceMotionEvent.accelerationIncludingGravity)
  ay: number;
  az: number;
  linearAx?: number; // m/s² without gravity (DeviceMotionEvent.acceleration)
  linearAy?: number;
  linearAz?: number;
  gx: number; // deg/s rotation rate
  gy: number;
  gz: number;
  alpha: number; // degrees orientation
  beta: number;
  gamma: number;
  rms?: number; // 0..1 mic loudness
};

export type RecordingMeta = {
  label: string;
  os: string;
  browser: string;
  sampleRateHz: number;
  recordedAt: string;
};

export type GhostRecording = {
  meta: RecordingMeta;
  samples: Sample[];
};

// UI Elements
const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
const btnRecord = document.getElementById("btn-record") as HTMLButtonElement;
const inputLabel = document.getElementById("record-label") as HTMLInputElement;
const securityWarning = document.getElementById("security-warning") as HTMLElement;
const statusBanner = document.getElementById("status-banner") as HTMLElement;
const recordProgressContainer = document.getElementById("record-progress-container") as HTMLElement;
const recordProgressBar = document.getElementById("record-progress-bar") as HTMLElement;
const recordStatus = document.getElementById("record-status") as HTMLElement;

// Status Pills
const pillSecure = document.getElementById("pill-secure") as HTMLElement;
const pillMotion = document.getElementById("pill-motion") as HTMLElement;
const pillMic = document.getElementById("pill-mic") as HTMLElement;
const pillWakeLock = document.getElementById("pill-wakelock") as HTMLElement;
const pillHz = document.getElementById("pill-hz") as HTMLElement;

// Readout Values
const valAx = document.getElementById("val-ax") as HTMLElement;
const valAy = document.getElementById("val-ay") as HTMLElement;
const valAz = document.getElementById("val-az") as HTMLElement;
const valLx = document.getElementById("val-lx") as HTMLElement;
const valLy = document.getElementById("val-ly") as HTMLElement;
const valLz = document.getElementById("val-lz") as HTMLElement;
const valGx = document.getElementById("val-gx") as HTMLElement;
const valGy = document.getElementById("val-gy") as HTMLElement;
const valGz = document.getElementById("val-gz") as HTMLElement;
const valOa = document.getElementById("val-oa") as HTMLElement;
const valOb = document.getElementById("val-ob") as HTMLElement;
const valOg = document.getElementById("val-og") as HTMLElement;
const valRms = document.getElementById("val-rms") as HTMLElement;
const meterBarFill = document.getElementById("meter-bar-fill") as HTMLElement;

// Runtime State
let isRunning = false;
let isRecording = false;
let wakeLockSentinel: WakeLockSentinel | null = null;
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let micMediaStream: MediaStream | null = null;
const pcmBuffer = new Float32Array(512);

// Latest Telemetry Cache
let curAx = 0;
let curAy = 0;
let curAz = 0;
let curLx = 0;
let curLy = 0;
let curLz = 0;
let curGx = 0;
let curGy = 0;
let curGz = 0;
let curAlpha = 0;
let curBeta = 0;
let curGamma = 0;
let curRms = 0;

// Frequency Tracking (Sliding window of timestamps in ms)
const motionTimestamps: number[] = [];
let hzIntervalTimer: number | null = null;

// Recording State
let recordingStartTime = 0;
const recordedSamples: Sample[] = [];
let recordingAnimationId: number | null = null;

// Utility formatting
function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "0.00";
  return n.toFixed(digits);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// OS and Browser detection
function getOS(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
}

function getBrowser(): string {
  const ua = navigator.userAgent;
  if (/CriOS|Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/FxiOS|Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua) && !/Chrome|CriOS/.test(ua)) return "Safari";
  if (/Edg/.test(ua)) return "Edge";
  return "Unknown Browser";
}

// Check security context on boot
function checkSecurityContext(): void {
  const isSecure = window.isSecureContext;
  if (isSecure) {
    pillSecure.textContent = "HTTPS: OK";
    pillSecure.className = "pill pill-ok";
  } else {
    pillSecure.textContent = "HTTPS: Insecure";
    pillSecure.className = "pill pill-err";
    securityWarning.style.display = "block";
  }
}

// Screen Wake Lock helper
async function requestScreenWakeLock(): Promise<void> {
  if ("wakeLock" in navigator && navigator.wakeLock) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      pillWakeLock.textContent = "Wake Lock: Active";
      pillWakeLock.className = "pill pill-ok";

      wakeLockSentinel.addEventListener("release", () => {
        wakeLockSentinel = null;
        if (isRunning) {
          pillWakeLock.textContent = "Wake Lock: Released";
          pillWakeLock.className = "pill pill-warn";
        }
      });
    } catch (err) {
      console.warn("Wake Lock request error:", err);
      pillWakeLock.textContent = "Wake Lock: Failed";
      pillWakeLock.className = "pill pill-warn";
    }
  } else {
    pillWakeLock.textContent = "Wake Lock: Unsupported";
    pillWakeLock.className = "pill pill-dim";
  }
}

// Re-acquire Wake Lock when Safari returns from background
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && isRunning && !wakeLockSentinel) {
    await requestScreenWakeLock();
  }
});

// Calculate RMS loudness from current microphone audio frame
function computeMicLoudness(): number {
  if (!analyserNode) return 0;
  analyserNode.getFloatTimeDomainData(pcmBuffer);

  let sumSquares = 0;
  for (let i = 0; i < pcmBuffer.length; i++) {
    const val = pcmBuffer[i] ?? 0;
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / pcmBuffer.length);
  // Clamp between 0.0 and 1.0
  return Math.min(1, Math.max(0, rms));
}

// UI render loop for values & audio level
function updateDisplay(): void {
  // Acceleration
  valAx.textContent = fmt(curAx);
  valAy.textContent = fmt(curAy);
  valAz.textContent = fmt(curAz);

  // Linear Acceleration
  valLx.textContent = fmt(curLx);
  valLy.textContent = fmt(curLy);
  valLz.textContent = fmt(curLz);

  // Rotation rate
  valGx.textContent = fmt(curGx);
  valGy.textContent = fmt(curGy);
  valGz.textContent = fmt(curGz);

  // Orientation
  valOa.textContent = `${fmt(curAlpha)}°`;
  valOb.textContent = `${fmt(curBeta)}°`;
  valOg.textContent = `${fmt(curGamma)}°`;

  // Mic Loudness
  if (analyserNode) {
    curRms = computeMicLoudness();
    valRms.textContent = curRms.toFixed(3);
    const pct = Math.min(100, Math.round(curRms * 100));
    meterBarFill.style.width = `${pct}%`;
  }

  if (isRunning) {
    requestAnimationFrame(updateDisplay);
  }
}

// DeviceMotionEvent handler
function handleDeviceMotion(event: DeviceMotionEvent): void {
  const now = performance.now();
  motionTimestamps.push(now);

  // accelerationIncludingGravity
  if (event.accelerationIncludingGravity) {
    curAx = event.accelerationIncludingGravity.x ?? 0;
    curAy = event.accelerationIncludingGravity.y ?? 0;
    curAz = event.accelerationIncludingGravity.z ?? 0;
  }

  // acceleration (linear, without gravity)
  if (event.acceleration) {
    curLx = event.acceleration.x ?? 0;
    curLy = event.acceleration.y ?? 0;
    curLz = event.acceleration.z ?? 0;
  }

  // rotationRate
  if (event.rotationRate) {
    curGx = event.rotationRate.alpha ?? 0;
    curGy = event.rotationRate.beta ?? 0;
    curGz = event.rotationRate.gamma ?? 0;
  }

  // If currently recording, capture this sample
  if (isRecording) {
    const t = Math.round(now - recordingStartTime);
    const sample: Sample = {
      t,
      ax: round4(curAx),
      ay: round4(curAy),
      az: round4(curAz),
      linearAx: round4(curLx),
      linearAy: round4(curLy),
      linearAz: round4(curLz),
      gx: round4(curGx),
      gy: round4(curGy),
      gz: round4(curGz),
      alpha: round4(curAlpha),
      beta: round4(curBeta),
      gamma: round4(curGamma),
      rms: round4(computeMicLoudness()),
    };
    recordedSamples.push(sample);
  }
}

// DeviceOrientationEvent handler
function handleDeviceOrientation(event: DeviceOrientationEvent): void {
  curAlpha = event.alpha ?? 0;
  curBeta = event.beta ?? 0;
  curGamma = event.gamma ?? 0;
}

// Calculate live Hz using sliding 1-second window
function updateHz(): void {
  const cutoff = performance.now() - 1000;
  while (motionTimestamps.length > 0 && (motionTimestamps[0] ?? 0) < cutoff) {
    motionTimestamps.shift();
  }
  const hz = motionTimestamps.length;
  pillHz.textContent = `${hz.toFixed(1)} Hz`;
}

// Start sensors and permissions on single user tap
async function startSensors(): Promise<void> {
  statusBanner.textContent = "Requesting permissions...";
  statusBanner.className = "alert alert-info";

  // 1. Motion permission on iOS 13+
  type DevicePermissionFunc = () => Promise<"granted" | "denied">;
  const MotionEvent = window.DeviceMotionEvent as unknown as {
    requestPermission?: DevicePermissionFunc;
  };

  if (typeof MotionEvent?.requestPermission === "function") {
    try {
      const motionState = await MotionEvent.requestPermission();
      if (motionState !== "granted") {
        statusBanner.textContent = "Motion permission was denied.";
        statusBanner.className = "alert alert-error";
        pillMotion.textContent = "Motion: Denied";
        pillMotion.className = "pill pill-err";
        return;
      }
      pillMotion.textContent = "Motion: Granted";
      pillMotion.className = "pill pill-ok";
    } catch (err) {
      statusBanner.textContent = `Motion permission error: ${String(err)}`;
      statusBanner.className = "alert alert-error";
      pillMotion.textContent = "Motion: Error";
      pillMotion.className = "pill pill-err";
      return;
    }
  } else {
    // Non-iOS or older browser with standard permission
    pillMotion.textContent = "Motion: Active";
    pillMotion.className = "pill pill-ok";
  }

  // Orientation permission (some iOS versions require separate request)
  const OrientationEvent = window.DeviceOrientationEvent as unknown as {
    requestPermission?: DevicePermissionFunc;
  };
  if (typeof OrientationEvent?.requestPermission === "function") {
    try {
      await OrientationEvent.requestPermission();
    } catch (err) {
      console.warn("DeviceOrientationEvent permission warning:", err);
    }
  }

  // 2. Microphone via getUserMedia (computed strictly locally as RMS)
  try {
    micMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(micMediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    source.connect(analyserNode);

    pillMic.textContent = "Mic: Active";
    pillMic.className = "pill pill-ok";
  } catch (err) {
    console.warn("Microphone access error:", err);
    pillMic.textContent = "Mic: Blocked/None";
    pillMic.className = "pill pill-warn";
  }

  // 3. Screen Wake Lock
  await requestScreenWakeLock();

  // 4. Attach event listeners
  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
  window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });

  isRunning = true;
  btnStart.textContent = "✓ Sensors Running";
  btnStart.disabled = true;
  btnStart.classList.replace("btn-primary", "btn-secondary");
  btnRecord.disabled = false;

  statusBanner.textContent = "Sensors active! Streaming real-time telemetry.";
  statusBanner.className = "alert alert-info";

  // Start telemetry loop and Hz monitor
  requestAnimationFrame(updateDisplay);
  if (!hzIntervalTimer) {
    hzIntervalTimer = window.setInterval(updateHz, 500);
  }
}

// 5-second recording flow
function startRecording(): void {
  if (isRecording || !isRunning) return;

  isRecording = true;
  recordedSamples.length = 0;
  recordingStartTime = performance.now();

  btnRecord.disabled = true;
  recordProgressContainer.style.display = "block";
  recordProgressBar.style.width = "0%";
  recordStatus.textContent = "Recording in progress... (0.0s / 5.0s)";

  const durationMs = 5000;

  function onFrame(): void {
    const elapsed = performance.now() - recordingStartTime;
    const progress = Math.min(1, elapsed / durationMs);
    recordProgressBar.style.width = `${(progress * 100).toFixed(1)}%`;
    recordStatus.textContent = `Recording... ${(elapsed / 1000).toFixed(1)}s / 5.0s (${recordedSamples.length} samples)`;

    if (elapsed < durationMs) {
      recordingAnimationId = requestAnimationFrame(onFrame);
    } else {
      stopAndExportRecording();
    }
  }

  recordingAnimationId = requestAnimationFrame(onFrame);
}

function stopAndExportRecording(): void {
  isRecording = false;
  if (recordingAnimationId) {
    cancelAnimationFrame(recordingAnimationId);
    recordingAnimationId = null;
  }

  recordProgressBar.style.width = "100%";
  btnRecord.disabled = false;

  const sampleCount = recordedSamples.length;
  const sampleRateHz = Math.round((sampleCount / 5) * 10) / 10;
  const label = inputLabel.value.trim() || "unlabeled";

  const exportPayload: GhostRecording = {
    meta: {
      label,
      os: getOS(),
      browser: getBrowser(),
      sampleRateHz,
      recordedAt: new Date().toISOString(),
    },
    samples: recordedSamples,
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `ghost-recording-${label}-${timestamp}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  recordStatus.textContent = `✓ Recorded ${sampleCount} samples (${sampleRateHz} Hz). Downloaded: ${filename}`;
}

// Wire buttons
btnStart.addEventListener("click", () => {
  startSensors().catch((err) => {
    statusBanner.textContent = `Start error: ${String(err)}`;
    statusBanner.className = "alert alert-error";
  });
});

btnRecord.addEventListener("click", () => {
  startRecording();
});

// Initialize on page load
checkSecurityContext();
