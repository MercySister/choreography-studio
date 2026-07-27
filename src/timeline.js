// timeline.js —— 编排数据结构：持有一份符合 sequence.schema.json 形状的 sequence 对象，
// 提供增删片段、计算总时长、导入导出的接口。不做完整 JSON Schema 校验（MVP范围说明见
// ENGINEERING_SPEC.md 第4节），只做最基本的结构保护。

export const TRACK_NAMES = ["motion", "face", "dress", "vibe", "ambientLight"];

// 允许片段在时间上重叠的轨道。动作轨可以，因为三个自由度是独立电机；
// 表情/配饰/特效/灯效是互斥表达，同一时刻只能有一个。
export const OVERLAP_ALLOWED = new Set(["motion"]);

export class Timeline {
  constructor(sequence) {
    this.sequence = normalize(sequence);
    this.packAll(); // 导入/构造时也保证每条轨道无重叠
  }

  static empty(name = "未命名编排") {
    return new Timeline({
      id: "combo_" + Date.now(),
      name,
      version: "0.1.0",
      description: "",
      scenePriority: 4,
      interruptible: true,
      loop: { enabled: false, count: 1 },
      tracks: { motion: [], face: [], dress: [], vibe: [], ambientLight: [] },
    });
  }

  getTrack(trackName) {
    return this.sequence.tracks[trackName] || [];
  }

  addSegment(trackName, segment) {
    if (!TRACK_NAMES.includes(trackName)) throw new Error("未知轨道: " + trackName);
    if (segment.startMs < 0 || segment.durationMs <= 0) throw new Error("startMs/durationMs 非法");
    this.sequence.tracks[trackName].push(segment);
    this.packTrack(trackName);
  }

  removeSegment(trackName, index) {
    this.sequence.tracks[trackName].splice(index, 1);
  }

  // 动作轨允许重叠：Yaw/Pitch/Roll 是三个各自独立的电机，可以同时动
  // （比如"转到45°保持"和"歪头"叠在同一段时间）。其余轨道是互斥表达
  // （同一时刻只能有一个表情/一个配饰），仍然强制不重叠。
  packTrack(trackName) {
    const segs = this.sequence.tracks[trackName];
    if (!segs) return;
    segs.sort((a, b) => a.startMs - b.startMs);
    if (OVERLAP_ALLOWED.has(trackName)) return;   // 只排序，不消重叠
    for (let i = 1; i < segs.length; i++) {
      const prevEnd = segs[i - 1].startMs + segs[i - 1].durationMs;
      if (segs[i].startMs < prevEnd) segs[i].startMs = prevEnd;
    }
  }

  packAll() {
    for (const name of TRACK_NAMES) this.packTrack(name);
  }

  // 兼容旧调用名（拖动移动片段后重排 + 消重叠）
  sortTrack(trackName) {
    this.packTrack(trackName);
  }

  getMaxDurationMs() {
    let max = 0;
    for (const name of TRACK_NAMES) {
      for (const seg of this.getTrack(name)) {
        max = Math.max(max, seg.startMs + seg.durationMs);
      }
    }
    return Math.max(max, 1000); // 地板值，避免空编排时除零
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.sequence));
  }

  static fromJSON(obj) {
    return new Timeline(obj);
  }
}

function normalize(seq) {
  const out = {
    id: seq.id || "combo_" + Date.now(),
    name: seq.name || "未命名编排",
    version: seq.version || "0.1.0",
    description: seq.description || "",
    scenePriority: seq.scenePriority ?? 4,
    interruptible: seq.interruptible ?? true,
    loop: seq.loop || { enabled: false, count: 1 },
    tracks: { motion: [], face: [], dress: [], vibe: [], ambientLight: [] },
  };
  const tracks = seq.tracks || {};
  for (const name of TRACK_NAMES) {
    out.tracks[name] = Array.isArray(tracks[name]) ? tracks[name].slice() : [];
  }
  return out;
}
