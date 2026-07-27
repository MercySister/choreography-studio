// player.js —— 播放引擎：给定一个 Timeline 和当前时间，算出每条轨道当前应该激活哪个片段。
import { TRACK_NAMES } from "./timeline.js";

// 给定一份 sequence.tracks 和时间 t，算出每条轨道当前激活的片段（或 null）。
// 抽成独立函数供 Player 和 arbiter（传感器触发的场景播放）共用，避免重复实现。
export function frameAt(tracks, t) {
  const frame = {};
  for (const name of TRACK_NAMES) {
    const segs = (tracks && tracks[name]) || [];
    frame[name] = segs.find((s) => t >= s.startMs && t < s.startMs + s.durationMs) || null;
  }
  return frame;
}

export class Player {
  constructor(timeline, { onTick } = {}) {
    this.timeline = timeline;
    this.onTick = onTick || (() => {});
    this.playing = false;
    this.elapsedMs = 0;
    this._lastTs = 0;
    this._raf = null;
  }

  setTimeline(timeline) {
    this.timeline = timeline;
    this.elapsedMs = 0;
    this._emit(true);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._lastTs = performance.now();
    const loop = (ts) => {
      if (!this.playing) return;
      const dt = ts - this._lastTs;
      this._lastTs = ts;
      this.elapsedMs += dt;
      const max = this.timeline.getMaxDurationMs();
      if (this.elapsedMs >= max) {
        const loopCfg = this.timeline.sequence.loop || {};
        if (loopCfg.enabled) {
          this.elapsedMs = 0;
        } else {
          this.elapsedMs = max;
          this.playing = false;
        }
      }
      this._emit();
      if (this.playing) this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  stop() {
    this.pause();
    this.elapsedMs = 0;
    this._emit(true);
  }

  seek(ms) {
    this.elapsedMs = Math.max(0, Math.min(ms, this.timeline.getMaxDurationMs()));
    this._emit(true);
  }

  // instant: true 表示这一帧是"跳变"而不是连续播放的一步（拖动进度条/停止/切换编排），
  // 姿态仿真层据此决定要不要跳过限速插值直接对齐目标姿态。
  _emit(instant = false) {
    const frame = this.computeFrame(this.elapsedMs);
    this.onTick(frame, this.elapsedMs, this.timeline.getMaxDurationMs(), instant);
  }

  // 返回 { motion: segmentOrNull, face: ..., dress: ..., vibe: ..., ambientLight: ... }
  computeFrame(t) {
    return frameAt(this.timeline.sequence.tracks, t);
  }
}
