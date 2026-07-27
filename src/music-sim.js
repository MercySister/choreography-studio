// music-sim.js —— 音乐律动算法引擎，对应产品定义《音光派对·基础模式》。
//
// 这是纯逻辑模块（不依赖DOM/WebAudio），输入是"12频段频谱帧 + 时间戳"，正好对应真车上
// CDC下发的 ID_MUSIC_FRQ (0x2141FF0E, int[12]) 数据形状——模拟平台里频谱来自 Web Audio
// 对本地音频的FFT（见 music-ui.js 适配层），真机上换成CDC属性订阅即可，算法层不用改。
// 固件实现时可以直接对照这份逻辑（节拍检测阈值、幅度公式、通道映射都按产品定义公式写）。
//
// 产品定义行为映射（4通道层）：
//   节奏层 int[0-2] (0-100Hz)   → 节拍到达时上下点头，幅度=能量/100×最大60°，速率=1/BPM×1
//   律动层 int[3-5] (100-500Hz) → 左右摆头，幅度=能量/100×最大45°，速率=1/BPM×0.5
//   情绪层 int[6-8] (500Hz-3kHz)→ 按曲风展示1个表情+配饰，持续到音乐结束
//   亮点层 int[9-11](3k-20kHz)  → 高频尖峰随机触发 拍手/击掌 展示1次
// 异常处理（产品定义表）：无频谱→空态；频谱突变→限幅+平滑；音乐停止→平滑回停止态。

// 产品定义 12频段的频率范围(Hz)，用于把FFT结果聚合成CDC同款数据
export const BAND_RANGES = [
  [0, 30], [30, 50], [50, 100],          // 节奏层
  [100, 200], [200, 300], [300, 500],    // 律动层
  [500, 1000], [1000, 2000], [2000, 3000], // 情绪层
  [3000, 5000], [5000, 10000], [10000, 20000], // 亮点层
];

// 把FFT字节数组(0-255)聚合成12频段能量(0-100)，模拟CDC的 ID_MUSIC_FRQ 输出
export function aggregateBands(fftBytes, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  return BAND_RANGES.map(([lo, hi]) => {
    const from = Math.max(0, Math.floor(lo / binHz));
    const to = Math.min(fftBytes.length - 1, Math.max(from, Math.ceil(hi / binHz) - 1));
    let sum = 0;
    for (let i = from; i <= to; i++) sum += fftBytes[i];
    return (sum / (to - from + 1) / 255) * 100;
  });
}

// 产品定义的BPM→曲风映射表每档列了多个候选（60-100:古典/民谣/爵士…），且130-140是表里的空档；
// 自动推测时每档取一个代表曲风，用户可在UI里手动指定，两处待定都等产品补充规则后替换。
export function genreFromBpm(bpm) {
  if (!bpm) return null;
  if (bpm < 100) return "古典音乐";
  if (bpm < 130) return "流行乐";
  if (bpm < 150) return "舞曲"; // 产品定义表格130-140空档，归入140-150档处理
  return "爵士";
}

// 曲风→表情/配饰/氛围特效（产品定义"音乐律动(7个)"场景表）。
// 产品定义写的"兴奋"(摇滚)、"平和"(说唱)在20个基础表情原子里不存在，"电吉他"配饰也不存在——
// 用语义最近的原子代替并标注待定，待产品确认后修正。
export const GENRE_PRESETS = {
  "流行乐":  { face: "FACE_HAPPY", dress: "DRESS_MIC" },
  "古典音乐": { face: "FACE_CLOSE", dress: "DRESS_BATON" },
  "民谣":    { face: "FACE_CLOSE", dress: "DRESS_GUITAR" },
  "摇滚":    { face: "FACE_EAGER", dress: "DRESS_SUNGLASSES", vibe: "VIBE_LIGHTNING", note: "产品定义为兴奋+电吉他，原子库无对应" },
  "爵士":    { face: "FACE_CLOSE", dress: "DRESS_SAX" },
  "说唱":    { face: "FACE_NORMAL", dress: "DRESS_GOLDCHAIN", note: "产品定义为平和，原子库无对应" },
  "舞曲":    { face: "FACE_WINK", dress: "DRESS_DJ" },
};
export const GENRES = Object.keys(GENRE_PRESETS);

const CHANNELS = { rhythm: [0, 2], groove: [3, 5], emotion: [6, 8], highlight: [9, 11] };
const BEAT_REFRACTORY_MS = 280;   // 两拍最小间隔（≈214BPM上限），防止把同一个鼓点识别成两拍
const BEAT_WINDOW_MS = 1600;      // 节拍检测的能量滑动窗口
const HIGHLIGHT_COOLDOWN_MS = 2000;
const HIGHLIGHT_SHOW_MS = 800;
const SILENCE_ENERGY = 1.5;
const SILENCE_HOLD_MS = 600;

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// 每个自由度轴的律动特性：波形(nod-down=向下点头/sine=双向摆)、幅度上限(受硬件行程约束)、
// 相位偏移(多轴组合时错开相位，让复合运动更自然，如歪头+旋转错开1/4拍成"绕圈"感)。
// 俯仰"点头"：拍点向下(低头方向，负值)点一下再回正——自然的音乐点头（v0.4.0 pitch 负=低头）。
const AXIS_PROFILE = {
  pitch: { wave: "nod-down", maxAmp: 30, phase: 0 },  // 点头：向下(低头)点，幅度上限30°
  roll: { wave: "sine", maxAmp: 20, phase: 0.25 },    // 歪头±20°，左右摇摆
  yaw: { wave: "sine", maxAmp: 50, phase: 0.5 },      // 旋转±150°，左右摆头
};
const ALL_AXES = ["pitch", "roll", "yaw"];

// 每个自由度独立的律动配置默认值：{ on:是否启用, div:频次(几拍一个周期), amp:幅度(°) }。
// 频次/幅度按轴单独设——比如俯仰每2拍点头、旋转每4拍转一次，组合成"转到左边点个头、
// 转到右边点个头"的复合律动。
const DEFAULT_AXIS_CFG = {
  pitch: { on: true, div: 2, amp: 18 },
  roll: { on: true, div: 2, amp: 16 },
  yaw: { on: false, div: 4, amp: 30 },
};

function normAxisCfg(axes) {
  const out = {};
  for (const a of ALL_AXES) {
    const d = DEFAULT_AXIS_CFG[a];
    const c = (axes && axes[a]) || {};
    out[a] = {
      on: c.on != null ? !!c.on : d.on,
      div: c.div > 0 ? c.div : d.div,
      amp: c.amp != null ? c.amp : d.amp,
    };
  }
  return out;
}

export class MusicRhythmEngine {
  // 可编排配置：
  //   axes    每个自由度独立的 { on, div(频次), amp(幅度) }——频次/幅度按轴单独设置。
  //   rateCoef 速率系数（产品定义可配置参数）
  constructor({ axes, rateCoef = 1.0 } = {}) {
    this.axisCfg = normAxisCfg(axes);
    this.rateCoef = rateCoef;
    this.genreOverride = null;

    this._ch = { rhythm: 0, groove: 0, emotion: 0, highlight: 0 }; // 平滑后的通道能量(展示/幅度用)
    this._rhythmFast = 0;   // 弱平滑的节奏层能量（节拍检测要保留尖峰）
    this._highFast = 0;
    this._fluxHist = [];    // 节奏层能量滑动窗口 [{t, e}]，供均值电平和上升沿检测用
    this._lastBeatT = -Infinity;
    this._intervals = [];   // 最近的节拍间隔，取中位数算BPM
    this._bpm = 0;
    // 锁相摆动器：BPM锁定后按节拍频率连续摆动，检测到的拍点只负责把相位拉回整拍，
    // 这样即使个别鼓点漏检，点头也不会中断——比"每个鼓点单独触发一次动作"稳得多
    this._beatPhase = 0;    // 以"拍"为单位的相位（含整数部分=累计拍数）
    this._axisAmp = { pitch: 0, roll: 0, yaw: 0 }; // 各轴平滑后的律动幅度
    this._highlightAtom = null;
    this._highlightUntil = -Infinity;
    this._lastHighlightT = -Infinity;
    this._silentSince = null;
    this._lastT = null;
  }

  setGenre(name) { this.genreOverride = GENRE_PRESETS[name] ? name : null; }

  // 实时更新律动配置（用户在UI上改每轴的启用/频次/幅度时调用），不打断已锁定的相位
  setConfig({ axes, rateCoef } = {}) {
    if (axes) this.axisCfg = normAxisCfg(axes);
    if (rateCoef != null) this.rateCoef = rateCoef;
  }

  // bands: 12频段能量(0-100)；tMs: 单调时间戳。返回本帧的行为输出。
  feed(bands, tMs) {
    const dt = this._lastT == null ? 16 : clamp(tMs - this._lastT, 0, 100);
    this._lastT = tMs;

    // --- 通道能量：限幅（频谱突变）+ EMA平滑 ---
    const raw = {};
    for (const [name, [a, b]] of Object.entries(CHANNELS)) {
      let sum = 0;
      for (let i = a; i <= b; i++) sum += clamp(bands[i] ?? 0, 0, 100);
      raw[name] = sum / (b - a + 1);
      const prev = this._ch[name];
      const limited = clamp(raw[name], prev - 40, prev + 40); // 限幅
      this._ch[name] = prev + (limited - prev) * 0.35;        // 平滑
    }
    this._rhythmFast = this._rhythmFast * 0.35 + raw.rhythm * 0.65;
    this._highFast = this._highFast * 0.35 + raw.highlight * 0.65;

    // --- 静音检测：无频谱数据/音乐停止 → 空态，动作平滑归零 ---
    const total = (raw.rhythm + raw.groove + raw.emotion + raw.highlight) / 4;
    if (total < SILENCE_ENERGY) {
      if (this._silentSince == null) this._silentSince = tMs;
    } else {
      this._silentSince = null;
    }
    const active = !(this._silentSince != null && tMs - this._silentSince >= SILENCE_HOLD_MS);

    // --- 节拍检测：双条件——能量高于滑动窗口均值(适应贝斯持续轰鸣的整体电平)，
    //     且相对约110ms前有明显上升(上升沿门控，防止能量平台期连续误触发)。
    //     不用逐帧能量差：8192点FFT的积分窗约186ms，真实音频的鼓点上升沿会被抹平到
    //     十几帧，单帧差值太小检不出来（合成信号能过、真歌过不了的坑，已实测踩过）---
    this._fluxHist.push({ t: tMs, e: this._rhythmFast });
    while (this._fluxHist.length && this._fluxHist[0].t < tMs - BEAT_WINDOW_MS) this._fluxHist.shift();
    const mean = this._fluxHist.reduce((s, h) => s + h.e, 0) / (this._fluxHist.length || 1);
    let past = null;
    for (let i = this._fluxHist.length - 1; i >= 0; i--) {
      if (this._fluxHist[i].t <= tMs - 110) { past = this._fluxHist[i]; break; }
    }
    const rise = this._rhythmFast - (past ? past.e : 0);
    let beat = false;
    if (active &&
        this._rhythmFast > mean * 1.2 + 3 &&
        rise > 3 &&
        tMs - this._lastBeatT >= BEAT_REFRACTORY_MS) {
      beat = true;
      const interval = tMs - this._lastBeatT;
      this._lastBeatT = tMs;
      if (interval >= 250 && interval <= 1500) {
        this._intervals.push(interval);
        if (this._intervals.length > 8) this._intervals.shift();
        this._bpm = Math.round(60000 / median(this._intervals)); // 产品定义: BPM=60/节拍间隔
      }
    }
    const beatInterval = this._bpm > 0 ? 60000 / this._bpm : 0;

    // --- 锁相摆动器：BPM锁定后相位按拍频连续推进；拍点做"软校准"而不是硬吸附 ---
    const locked = active && beatInterval > 0;
    if (locked) {
      this._beatPhase += (dt / beatInterval) * this.rateCoef;
      // 软同步：把相位往最近整拍轻推15%，而不是 Math.round 直接跳——消除节拍检测抖动
      // 带来的姿态突跳（这是之前"抽搐感"的一大来源）
      if (beat) {
        const nearest = Math.round(this._beatPhase);
        this._beatPhase += (nearest - this._beatPhase) * 0.15;
      }
    }

    // --- 多自由度律动：每个启用的轴各自按自己的频次(div)和幅度(amp)律动，相位错开形成复合动作。
    //     例：俯仰div=2(每2拍点头)+旋转div=4(每4拍转一次) → 转到一边点个头、转到另一边点个头。
    //     波形用平滑正弦/升余弦，没有尖峰不抽搐；幅度能量驱动+保底，慢平滑渐变(500ms)避免抽动。---
    const pose = { yawOffset: 0, pitchOffset: 0, rollOffset: 0 };
    for (const axis of ALL_AXES) {
      const cfg = this.axisCfg[axis];
      const profile = AXIS_PROFILE[axis];
      const enabled = locked && cfg.on;
      const ampCap = Math.min(cfg.amp, profile.maxAmp);
      const energy = axis === "pitch" ? this._ch.rhythm : this._ch.groove;
      const ampTarget = enabled ? Math.max(energy / 100, 0.5) * ampCap : 0;
      this._axisAmp[axis] += (ampTarget - this._axisAmp[axis]) * Math.min(1, dt / 500);
      if (this._axisAmp[axis] < 0.05) { this._axisAmp[axis] = 0; continue; }
      // 每轴用自己的频次 div 算相位周期
      const cyclePhase = this._beatPhase / Math.max(0.25, cfg.div) + profile.phase;
      const frac = ((cyclePhase % 1) + 1) % 1;
      pose[axis + "Offset"] = profile.wave === "nod-down"
        // 点头：拍点向下(低头，负值)点到 -amp，拍间回到正前方(0)——自然的音乐点头
        ? -this._axisAmp[axis] * (0.5 + 0.5 * Math.cos(2 * Math.PI * frac))
        // 歪头/摆头双向：平滑正弦左右摆，一个周期一个来回
        : this._axisAmp[axis] * Math.sin(2 * Math.PI * frac);
    }
    if (!locked && active) {
      // 有声音但还没锁定BPM：呼吸般的轻微漂移，别僵住
      const tSec = tMs / 1000;
      for (const axis of ALL_AXES) {
        if (!this.axisCfg[axis].on) continue;
        const profile = AXIS_PROFILE[axis];
        pose[axis + "Offset"] = profile.wave === "nod-down"
          ? -1.5 * (0.5 + 0.5 * Math.cos(tSec))
          : 3 * Math.sin(tSec * 0.6 + profile.phase * 6);
      }
    }

    // --- 亮点层→高频尖峰随机触发拍手/击掌，展示1次，带冷却 ---
    if (active &&
        this._highFast > this._ch.highlight * 1.6 + 8 &&
        tMs - this._lastHighlightT >= HIGHLIGHT_COOLDOWN_MS) {
      this._highlightAtom = (tMs & 1) === 0 ? "DRESS_CLAP" : "DRESS_HIGHFIVE";
      this._highlightUntil = tMs + HIGHLIGHT_SHOW_MS;
      this._lastHighlightT = tMs;
    }
    const highlight = tMs < this._highlightUntil ? this._highlightAtom : null;

    // --- 情绪层→曲风表情/配饰（手动指定优先，否则按BPM推测）---
    const genre = this.genreOverride || genreFromBpm(this._bpm);
    const preset = (active && genre && GENRE_PRESETS[genre]) || null;

    return {
      active,
      beat,
      bpm: this._bpm,
      genre: active ? genre : null,
      channels: { ...this._ch },
      beatAxes: ALL_AXES.filter((a) => this.axisCfg[a].on), // 当前启用的律动轴（供UI显示）
      // 姿态偏移量（相对默认位0/0/0），启用的自由度轴非零，适配层按DOF范围限幅
      pose,
      faceAtomId: preset ? preset.face : null,
      dressAtomId: highlight || (preset ? preset.dress : null), // 亮点层优先级最高(产品定义)
      vibeAtomId: preset ? preset.vibe || null : null,
    };
  }
}
