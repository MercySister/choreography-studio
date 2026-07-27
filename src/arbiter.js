// arbiter.js —— 行为决策器：感知模拟器的"大脑"。
// 接收传感器事件 → 查规则表拿到候选场景 → 按 scenePriority / interruptible 做优先级仲裁 →
// 决定当前该播哪套场景；并逐帧推进当前场景的播放（含循环/结束回落待机）。
//
// 仲裁规则（对齐 产品定义 场景优先级/打断逻辑）：
//   - 无场景在播（待机中）：任何有绑定的事件都能触发
//   - 候选优先级 > 当前：更高优先级总能打断（产品定义"更高优先级打断"）
//   - 候选优先级 == 当前 且 当前可打断：后触发者接管（产品定义"相同优先级后触发可打断"）
//   - 候选优先级 < 当前，或相同但当前不可打断：忽略
// 结束回落：非循环场景播完 → 回到待机态；配饰移开(remove)且当前场景正是它触发的 → 回到待机态。
import { frameAt } from "./player.js";
import { resolveScene } from "./scenes.js";

function seqMaxMs(seq) {
  let max = 0;
  for (const segs of Object.values(seq.tracks || {})) {
    for (const s of segs || []) max = Math.max(max, s.startMs + s.durationMs);
  }
  return Math.max(max, 1);
}

export class BehaviorArbiter {
  constructor(idleScene) {
    this.idleScene = idleScene;
    this.active = null;      // { sceneKey, sequence, priority, interruptible, sourceTag, elapsedMs } 或 null(待机)
    this._idleElapsed = 0;
  }

  // 当前正在表达的场景（待机时返回 idleScene 的信息），供 UI 显示状态用。
  current() {
    if (!this.active) return { sceneKey: "idle", name: this.idleScene.name, priority: this.idleScene.scenePriority, isIdle: true };
    return { sceneKey: this.active.sceneKey, name: this.active.sequence.name, priority: this.active.priority, isIdle: false };
  }

  // 处理一个传感器事件。返回决策结果 { action: "trigger"|"ignore"|"return-idle", ... } 供 UI 反馈/日志。
  dispatch(event) {
    if (event.type === "remove") {
      // 只有当前场景正是这个配饰触发的，移开才回落待机；否则不影响别的场景
      if (this.active && this.active.sourceTag === event.value) {
        this.active = null;
        this._idleElapsed = 0;
        return { action: "return-idle", reason: "配饰移开" };
      }
      return { action: "ignore", reason: "移开的不是当前场景来源" };
    }

    // type === "tag"：一次感知触发（配饰贴近/触摸/手势/人脸识别）
    const resolved = resolveScene(event.sensor, event.value);
    if (!resolved) return { action: "ignore", reason: "该事件未绑定场景" };

    // 特例：人脸"无人"这类规则不触发场景，而是回落待机（前提是当前场景可打断）
    if (resolved.returnIdle) {
      if (this.active && !this.active.interruptible) {
        return { action: "ignore", reason: "当前场景不可打断" };
      }
      this.active = null;
      this._idleElapsed = 0;
      return { action: "return-idle", reason: "无人" };
    }

    const candPriority = resolved.priority ?? 0;

    if (this.active) {
      const curPriority = this.active.priority;
      const curInterruptible = this.active.interruptible;
      const canInterrupt = candPriority > curPriority || (candPriority === curPriority && curInterruptible);
      if (!canInterrupt) {
        return { action: "ignore", reason: `优先级不足（当前${curPriority}${curInterruptible ? "" : "·不可打断"}）` };
      }
    }

    this.active = {
      sceneKey: resolved.sceneKey,
      sequence: resolved.sequence,
      priority: candPriority,
      interruptible: resolved.sequence.interruptible !== false,
      sourceTag: event.value,
      elapsedMs: 0,
    };
    return { action: "trigger", sceneKey: resolved.sceneKey, name: resolved.sequence.name, priority: candPriority };
  }

  // 逐帧推进。dtMs=距上一帧毫秒。返回 { frame, sceneName, sceneKey, isIdle, justReturnedToIdle }。
  tick(dtMs) {
    if (!this.active) {
      const seq = this.idleScene;
      const max = seqMaxMs(seq);
      this._idleElapsed = (this._idleElapsed + dtMs) % max; // 待机恒循环
      return { frame: frameAt(seq.tracks, this._idleElapsed), sceneName: seq.name, sceneKey: "idle", isIdle: true, justReturnedToIdle: false };
    }

    const seq = this.active.sequence;
    const max = seqMaxMs(seq);
    this.active.elapsedMs += dtMs;
    const loopCfg = seq.loop || {};
    let justReturnedToIdle = false;
    if (this.active.elapsedMs >= max) {
      if (loopCfg.enabled) {
        this.active.elapsedMs = this.active.elapsedMs % max;
      } else {
        // 非循环场景播完 → 回落待机
        this.active = null;
        this._idleElapsed = 0;
        justReturnedToIdle = true;
        const idle = this.idleScene;
        return { frame: frameAt(idle.tracks, 0), sceneName: idle.name, sceneKey: "idle", isIdle: true, justReturnedToIdle };
      }
    }
    return {
      frame: frameAt(seq.tracks, this.active.elapsedMs),
      sceneName: seq.name, sceneKey: this.active.sceneKey, isIdle: false, justReturnedToIdle,
    };
  }

  // 复位到待机（退出模拟模式时用）
  reset() {
    this.active = null;
    this._idleElapsed = 0;
  }
}
