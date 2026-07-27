// music-ui.js —— 音乐律动模式的浏览器适配层：把三种音源的音频流做FFT，聚合成CDC同款的
// 12频段数据喂给 MusicRhythmEngine（纯逻辑，见 music-sim.js），把引擎输出的姿态偏移/
// 表情/配饰实时渲染到机器人预览上。
//
// 三种音源：
//   file — 本地音频文件（Web Audio 解码播放，声音走本页输出）
//   mic  — 麦克风：听电脑外放/环境里正在放的音乐，任何播放器都适用（分析用，不回放，避免啸叫）
//   tab  — 浏览器标签页音频捕获(getDisplayMedia)：适合网页版音乐播放器，信号最干净；
//          macOS 的 Chrome 只支持捕获"标签页"的音频，不支持整个系统（分享时要勾选"共享标签页音频"）
//
// mic/tab 需要安全上下文(https 或 localhost)——双击 file:// 打开时这两项不可用，UI会提示。
// 真车上这一层会被"订阅CDC频谱属性(ID_MUSIC_FRQ)"替代，引擎层不用改。
import { aggregateBands, MusicRhythmEngine, GENRES } from "./music-sim.js";

// ACT_IDLE 默认位（三轴：yaw旋转/pitch俯仰/roll歪头，全零=头部竖直正对车内）
const IDLE_POSE = { yaw: 0, pitch: 0, roll: 0 };
// 俯仰 v0.4.0：-30°(低头) ~ +30°(抬头)，0=正前方。音乐点头向下(负=低头)。
const PITCH_RANGE = { min: -30, max: 30 };
const ROLL_RANGE = { min: -20, max: 20 };
const YAW_RANGE = { min: -180, max: 180 };  // ±180°（0正前方，±180背对）

export function initMusicMode({ renderer, atomsIndex, player }) {
  const el = {
    source: document.getElementById("sourceSelect"),
    file: document.getElementById("musicFile"),
    fileLabel: document.getElementById("musicFileLabel"),
    playBtn: document.getElementById("musicPlayBtn"),
    stopBtn: document.getElementById("musicStopBtn"),
    genreSelect: document.getElementById("genreSelect"),
    axis: {
      pitch: { on: document.getElementById("axisPitch"), div: document.getElementById("pitchDiv"), amp: document.getElementById("pitchAmp") },
      roll: { on: document.getElementById("axisRoll"), div: document.getElementById("rollDiv"), amp: document.getElementById("rollAmp") },
      yaw: { on: document.getElementById("axisYaw"), div: document.getElementById("yawDiv"), amp: document.getElementById("yawAmp") },
    },
    status: document.getElementById("musicStatus"),
    meters: {
      rhythm: document.getElementById("meterRhythm"),
      groove: document.getElementById("meterGroove"),
      emotion: document.getElementById("meterEmotion"),
      highlight: document.getElementById("meterHighlight"),
    },
  };

  for (const g of GENRES) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    el.genreSelect.appendChild(opt);
  }

  // 读取UI上每个自由度独立的律动配置（启用/频次/幅度）
  function readBeatConfig() {
    const axes = {};
    for (const a of ["pitch", "roll", "yaw"]) {
      axes[a] = {
        on: el.axis[a].on.checked,
        div: parseFloat(el.axis[a].div.value) || 2,
        amp: parseFloat(el.axis[a].amp.value) || 16,
      };
    }
    return { axes };
  }
  // 用户改任一轴的配置时实时应用到正在运行的引擎，不打断播放
  for (const a of ["pitch", "roll", "yaw"]) {
    for (const ctrl of [el.axis[a].on, el.axis[a].div, el.axis[a].amp]) {
      ctrl.addEventListener("change", () => { if (engine) engine.setConfig(readBeatConfig()); });
    }
  }

  let audioEl = null;      // file 模式的播放元素
  let objectUrl = null;
  let mediaStream = null;  // mic/tab 模式的采集流
  let sourceNode = null;   // 当前接进 analyser 的音源节点
  let monitoring = false;  // analyser 是否接到了扬声器（仅 file 模式需要）
  let ctx = null;
  let analyser = null;
  let fftBuf = null;
  let engine = null;
  let loopTimer = null;
  let running = false;

  const SOURCE_HINTS = {
    file: "选择本地音频文件后点\"开始律动\"。",
    mic: "点\"开始律动\"后浏览器会请求麦克风权限——用电脑外放播放任意音乐即可，任何播放器都适用。",
    tab: "点\"开始律动\"后选择正在放音乐的浏览器标签页，并勾选\"共享标签页音频\"（macOS的Chrome只能捕获标签页音频，不支持整个系统）。",
  };

  function refreshSourceUI() {
    const mode = el.source.value;
    el.fileLabel.style.display = mode === "file" ? "inline-flex" : "none";
    el.playBtn.disabled = running || (mode === "file" && !audioEl);
    if (!running) el.status.textContent = SOURCE_HINTS[mode];
    if ((mode === "mic" || mode === "tab") && !window.isSecureContext) {
      el.status.textContent = "麦克风/标签页捕获需要通过 http(s) 访问（本地服务器或线上部署），双击打开的 file:// 页面用不了。";
      el.playBtn.disabled = true;
    }
  }
  el.source.addEventListener("change", () => { stop(true); refreshSourceUI(); });

  el.file.addEventListener("change", () => {
    const f = el.file.files[0];
    if (!f) return;
    stop(true);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    // 每换一个文件建一个新的 <audio>：createMediaElementSource 对同一个元素只能建一次
    audioEl = new Audio(objectUrl);
    audioEl.addEventListener("ended", () => stop()); // 产品定义: 音乐停止→平滑进入停止态
    el.playBtn.disabled = false;
    el.status.textContent = "已选择：" + f.name + "，点\"开始律动\"播放并解析。";
  });

  el.genreSelect.addEventListener("change", () => {
    if (engine) engine.setGenre(el.genreSelect.value || null);
  });

  function ensureAnalyser() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 8192; // 低频档要分出0-30/30-50/50-100Hz，需要≈5.4Hz的bin分辨率
      analyser.smoothingTimeConstant = 0.35; // 平滑调低保留瞬态，鼓点的能量突增(onset)才检测得出来
      fftBuf = new Uint8Array(analyser.frequencyBinCount);
    }
  }

  function setMonitoring(on) {
    if (on && !monitoring) analyser.connect(ctx.destination);
    if (!on && monitoring) analyser.disconnect(ctx.destination);
    monitoring = on;
  }

  async function start() {
    if (running) return;
    const mode = el.source.value;
    ensureAnalyser();
    if (ctx.state === "suspended") await ctx.resume();
    try {
      if (sourceNode) { try { sourceNode.disconnect(); } catch (e) {} sourceNode = null; }

      if (mode === "file") {
        if (!audioEl) return;
        if (!audioEl._srcNode) audioEl._srcNode = ctx.createMediaElementSource(audioEl);
        sourceNode = audioEl._srcNode;
        sourceNode.connect(analyser);
        setMonitoring(true); // 本地文件要能听见
        await audioEl.play();
      } else if (mode === "mic") {
        // 关掉回声消除/降噪/自动增益：这些是为语音通话设计的，会把音乐的鼓点和高频削掉
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        sourceNode = ctx.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);
        setMonitoring(false); // 只分析不回放，避免麦克风→扬声器啸叫
      } else {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        mediaStream.getVideoTracks().forEach((t) => t.stop()); // 只要音频，画面立即释放
        const track = mediaStream.getAudioTracks()[0];
        if (!track) {
          mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
          el.status.textContent = "所选内容没有音频——分享时请选\"Chrome标签页\"并勾选\"共享标签页音频\"。";
          return;
        }
        track.addEventListener("ended", () => stop()); // 用户点了浏览器的"停止共享"
        sourceNode = ctx.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);
        setMonitoring(false); // 标签页自己在响，不重复回放
      }
    } catch (err) {
      el.status.textContent = "获取音源失败：" + (err && err.name === "NotAllowedError" ? "权限被拒绝" : err.message || err);
      return;
    }

    engine = new MusicRhythmEngine(readBeatConfig());
    engine.setGenre(el.genreSelect.value || null);
    player.stop(); // 时间线播放和音乐律动互斥，同一时间只有一个在驱动预览
    running = true;
    el.playBtn.disabled = true;
    el.stopBtn.disabled = false;
    // 用固定频率 setInterval 而不是 requestAnimationFrame：rAF 在后台/被遮挡的标签页会被
    // 浏览器节流到几乎停摆（切去别的标签听歌是常见用法），且固定30fps也更接近真车CDC
    // 按固定频率推送频谱的形态
    loopTimer = setInterval(loop, 33);
  }

  function loop() {
    if (!running) return;
    analyser.getByteFrequencyData(fftBuf);
    const bands = aggregateBands(fftBuf, ctx.sampleRate, analyser.fftSize);
    const out = engine.feed(bands, performance.now());

    // 姿态：引擎输出的是相对默认位(全零)的三轴偏移量（只有选定的律动自由度非零），
    // 这里按DOF范围兜底限幅。
    const pose = {
      yaw: Math.min(YAW_RANGE.max, Math.max(YAW_RANGE.min, IDLE_POSE.yaw + out.pose.yawOffset)),
      pitch: Math.min(PITCH_RANGE.max, Math.max(PITCH_RANGE.min, IDLE_POSE.pitch + out.pose.pitchOffset)),
      roll: Math.min(ROLL_RANGE.max, Math.max(ROLL_RANGE.min, IDLE_POSE.roll + out.pose.rollOffset)),
    };
    const frame = {
      motion: null,
      face: out.faceAtomId ? { atomId: out.faceAtomId } : null,
      dress: out.dressAtomId ? { atomId: out.dressAtomId } : null,
      vibe: out.vibeAtomId ? { atomId: out.vibeAtomId } : null,
      ambientLight: null,
    };
    renderer.render(frame, atomsIndex, pose);

    for (const [name, meterEl] of Object.entries(el.meters)) {
      meterEl.style.width = Math.round(out.channels[name]) + "%";
    }
    el.status.textContent = out.active
      ? `BPM ${out.bpm || "…"} · 曲风 ${out.genre || "识别中"}${el.genreSelect.value ? "(手动)" : "(自动)"}${out.beat ? " · ♪拍" : ""}`
      : "等待声音信号…（静音/间奏进入空态）";
  }

  function stop(silent = false) {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    if (audioEl && !audioEl.paused) audioEl.pause();
    if (audioEl) audioEl.currentTime = 0;
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (e) {} sourceNode = null; }
    const wasRunning = running;
    running = false;
    el.stopBtn.disabled = true;
    for (const meterEl of Object.values(el.meters)) meterEl.style.width = "0%";
    refreshSourceUI();
    if (wasRunning && !silent) {
      player.stop(); // 借时间线的stop把机器人渲染回编排的0时刻状态
      el.status.textContent = "已停止。";
    }
  }

  el.playBtn.addEventListener("click", start);
  el.stopBtn.addEventListener("click", () => stop());

  // 用户回头去操作时间线（播放/拖动/切示例）时，自动退出音乐律动，避免两边同时驱动预览
  for (const id of ["playBtn", "scrubber", "exampleSelect"]) {
    const target = document.getElementById(id);
    if (target) {
      target.addEventListener(id === "playBtn" ? "click" : "input", () => { if (running) stop(true); });
      if (id === "exampleSelect") target.addEventListener("change", () => { if (running) stop(true); });
    }
  }

  refreshSourceUI();
  return { stop, isRunning: () => running };
}
