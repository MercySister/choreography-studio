// motion-sim.js —— 机械姿态仿真：把"当前激活的 motion 原子 + 片段系数"，按 atoms.json 里
// DOF 的真实速度限制，逐帧插值成连续的机械姿态(yaw旋转/pitch俯仰/roll歪头，结构方案三轴)。
//
// 模型：舵机式限速跟随（rate-limited follower）。每条轴（升降/弯折/旋转）各自维护一个当前值，
// 每帧朝目标关键帧推进一小步，步长 = DOF速度 × 速率系数 × dt，不会瞬间跳变。到达关键帧后按
// 停留系数决定的时长暂停，再走向下一个关键帧；path 型原子(点头/摇头/环顾四周)按 atoms.json
// 里定义的 path 数组顺序跟随，循环次数 = 原子自身 repeat × 编排里的重复系数；endStrategy为
// "return"的单目标原子，到达并停留后会自动追加一段"回到片段开始前姿态"的关键帧。
//
// 已知局限（待定，见 atoms.json）：DOF_YAW/DOF_PITCH/DOF_ROLL 的 speedRange 目前是待执行器
// 标定的占位值，过渡节奏会显得偏快；一旦拿到真实标定数据，只需要更新 atoms.json 里对应的
// speedRange，本模块会自动使用新值，不需要改这里的逻辑。

export const AXES = ["yaw", "pitch", "roll"];
const AXIS_DOF = { yaw: "DOF_YAW", pitch: "DOF_PITCH", roll: "DOF_ROLL" };
const DEFAULT_DWELL_MS = 500;

// L1 单轴原子在 atoms.json 里只标了涉及哪个DOF和方向范围，没有具体的目标幅度——
// 这里补一份演示默认值（会被幅度系数缩放，标注为待产品确认的占位）。
const L1_DEFAULTS = {
  ACT_YAW_LEFT: { axis: "yaw", target: 45 },
  ACT_YAW_RIGHT: { axis: "yaw", target: -45 },
  ACT_PITCH_HOME: { axis: "pitch", target: 0 },   // 立正回到竖直0°（俯仰已改为前倾方向，无朝天）
  ACT_ROLL_LEFT: { axis: "roll", target: 15 },
  ACT_ROLL_RIGHT: { axis: "roll", target: -15 },
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function dofOf(atomsData, dofId) {
  return atomsData.dof.find((d) => d.id === dofId) || null;
}

function dofRange(atomsData, dofId) {
  const dof = dofOf(atomsData, dofId);
  return dof ? dof.range : { min: -Infinity, max: Infinity };
}

// DOF 的兜底速度（当原子自己没有 defaultParams.speedDegPerSec 时使用），
// 取 atoms.json 里 speedRange.max（均为待定占位，待执行器标定后更新数据即可）。
function fallbackSpeed(atomsData, dofId) {
  const dof = dofOf(atomsData, dofId);
  return (dof && dof.speedRange && dof.speedRange.max) || 60;
}

function axisForDof(dofId) {
  return AXES.find((a) => AXIS_DOF[a] === dofId) || null;
}

// 把一个 motion 原子 + 片段系数解析成"每条轴要走的关键帧序列"。
// prePose: 片段开始前的姿态 {yaw,pitch,roll}，供 endStrategy=return 的原子做"回位"用。
// angleOverride: 片段上设置的目标角度(°)，覆盖原子的默认角度/路径峰值；null 表示用原子默认。
//   - 单目标动作(转向/抬头/低头/左右转等)：直接把目标角度换成 angleOverride
//   - 路径动作(点头/摇头/环顾/歪头逗趣)：把路径整体缩放到峰值 = angleOverride
//   - 多轴固定姿态(收纳位/默认位)：无单一角度，忽略 angleOverride
function resolveAtomPlan(atomDef, coeff, atomsData, prePose, angleOverride) {
  const amp = coeff.amplitude ?? 1;
  const rate = Math.max(0.01, coeff.rate ?? 1);
  const dwellCoef = coeff.dwell ?? 1;
  const repeatCoef = coeff.repeat ?? 1;
  const dp = atomDef.defaultParams || {};
  const plan = {};

  function addSingleAxis(axis, targetMag, speed, path) {
    const range = dofRange(atomsData, AXIS_DOF[axis]);
    const baseDwell = dp.dwellMs || DEFAULT_DWELL_MS;
    const holdMs = baseDwell * dwellCoef;
    const repeatCount = Math.max(1, Math.round((dp.repeat || 1) * repeatCoef));
    // path 型原子(点头/摇头/环顾四周)的关键帧是"相对片段开始前姿态的偏移量"，不是绝对角度——
    // 比如点头的 path=[0,15,0] 表示"不动/+15°/回到不动"，而不是"转到绝对0°再到绝对15°"，
    // 否则默认位弯折基线60°时会先猛甩到0°，变成一个和"点头"语义完全不符的大动作。
    // 单目标原子（前倾/转向主驾等）的 targetMag 则是 DOF 坐标系下的绝对目标角度，不做偏移。
    const rawPath = path ? path.map((v) => prePose[axis] + v * amp) : [targetMag * amp];
    const scaledPath = rawPath.map((v) => clamp(v, range.min, range.max));
    // 单目标 return 型原子（如后仰）到达终点后还要追加一段"回位"关键帧，所以终点本身
    // 不是真正的最后一帧——它仍然要按停留系数停顿，不能提前把 holdMs 清零。
    const hasReturnLeg = atomDef.endStrategy === "return" && !path;
    const waypoints = [];
    for (let r = 0; r < repeatCount; r++) {
      scaledPath.forEach((v, i) => {
        const isLast = !hasReturnLeg && r === repeatCount - 1 && i === scaledPath.length - 1;
        waypoints.push({ value: v, holdMs: isLast ? 0 : holdMs });
      });
    }
    if (hasReturnLeg) {
      waypoints.push({ value: prePose[axis], holdMs: 0 });
    }
    plan[axis] = { waypoints, speed: speed * rate };
  }

  if (dp.path) {
    const axis = axisForDof(atomDef.dof[0]);
    const speed = dp.speedDegPerSec || fallbackSpeed(atomsData, atomDef.dof[0]);
    let path = dp.path;
    if (angleOverride != null) {
      // 把路径缩放到峰值 = angleOverride（保持点头/摇头的往返形状，只改幅度）
      const peak = path.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
      const scale = peak !== 0 ? angleOverride / peak : 1;
      path = path.map((v) => v * scale);
    }
    if (axis) addSingleAxis(axis, null, speed, path);
  } else if (dp.angle !== undefined) {
    const axis = axisForDof(atomDef.dof[0]);
    const speed = dp.speedDegPerSec || fallbackSpeed(atomsData, atomDef.dof[0]);
    const target = angleOverride != null ? angleOverride : dp.angle;
    if (axis) addSingleAxis(axis, target, speed);
  } else if (dp.yaw !== undefined || dp.pitch !== undefined || dp.roll !== undefined) {
    // 多轴直达原子（安全位/默认位）：固定参考姿态，不做幅度/角度缩放。
    for (const axis of AXES) {
      if (dp[axis] === undefined) continue;
      const range = dofRange(atomsData, AXIS_DOF[axis]);
      const speed = fallbackSpeed(atomsData, AXIS_DOF[axis]);
      plan[axis] = { waypoints: [{ value: clamp(dp[axis], range.min, range.max), holdMs: 0 }], speed: speed * rate };
    }
  } else if (L1_DEFAULTS[atomDef.id]) {
    const { axis, target } = L1_DEFAULTS[atomDef.id];
    const speed = fallbackSpeed(atomsData, atomDef.dof[0]);
    addSingleAxis(axis, angleOverride != null ? angleOverride : target, speed);
  }

  return plan;
}

// 估算一个动作片段真正"做完"需要多少毫秒：限速跟随把每条轴的关键帧走完的总时间
// （行程 = |Δ角度| / 速度；再加各关键帧的停留），多轴并行取最大。用于 UI 提醒：
// 片段时长 < 预计耗时时，动作会在没走完时就被片段结束/下一个片段打断。
// prePose 缺省用默认位(ACT_IDLE)，即"从回正姿态起手"的估算。
export function estimateAtomDurationMs(atomDef, coeff, atomsData, angleOverride = null, prePose = null) {
  if (!atomDef) return 0;
  const idle = atomsData.motionAtoms.find((a) => a.id === "ACT_IDLE").defaultParams;
  const pre = prePose || { yaw: idle.yaw, pitch: idle.pitch, roll: idle.roll };
  const plan = resolveAtomPlan(atomDef, coeff || {}, atomsData, pre, angleOverride);
  let maxMs = 0;
  for (const axis of AXES) {
    const p = plan[axis];
    if (!p) continue;
    let t = 0;
    let cur = pre[axis];
    for (const wp of p.waypoints) {
      t += (Math.abs(wp.value - cur) / Math.max(0.01, p.speed)) * 1000 + (wp.holdMs || 0);
      cur = wp.value;
    }
    if (t > maxMs) maxMs = t;
  }
  return Math.round(maxMs);
}

class AxisFollower {
  constructor(initialValue) {
    this.value = initialValue;
    this._waypoints = [];
    this._speed = 60;
    this._holdMs = 0;
    this._planKey = null;
  }

  // force=true：即使 planKey 没变也重新载入关键帧（instant 快照时用，避免读到已被连续播放
  // 消耗掉的空 waypoints——那会导致"已转到位的动作在停止/拖动时被错误重置成0"的 bug）。
  drive(planKey, waypoints, speed, force = false) {
    if (!force && planKey === this._planKey) return;
    this._planKey = planKey;
    this._waypoints = waypoints.slice();
    this._speed = speed;
    this._holdMs = 0;
  }

  // 快照到当前关键帧目标（instant 跳变时用）。不清空 waypoints，恢复连续播放时能接着走。
  snapToFirstTarget(idleValue) {
    const wp = this._waypoints[0];
    this.value = wp ? wp.value : idleValue;
    this._holdMs = 0;
  }

  tick(dtMs) {
    if (this._holdMs > 0) {
      this._holdMs -= dtMs;
      return this.value;
    }
    const wp = this._waypoints[0];
    if (!wp) return this.value;
    const maxStep = (this._speed * dtMs) / 1000;
    const diff = wp.value - this.value;
    if (Math.abs(diff) <= maxStep) {
      this.value = wp.value;
      this._waypoints.shift();
      if (wp.holdMs > 0) this._holdMs = wp.holdMs;
    } else {
      this.value += Math.sign(diff) * maxStep;
    }
    return this.value;
  }
}

export class MotionSimulator {
  constructor(atomsData, atomsIndex) {
    this.atomsData = atomsData;
    this.atomsIndex = atomsIndex;
    const idle = atomsData.motionAtoms.find((a) => a.id === "ACT_IDLE").defaultParams;
    this._idle = idle;
    this.followers = {
      yaw: new AxisFollower(idle.yaw),
      pitch: new AxisFollower(idle.pitch),
      roll: new AxisFollower(idle.roll),
    };
    this._activeSegRef = undefined;
    this._prePose = { ...idle };
    this._plan = {};
  }

  // seg: 当前 motion 轨道的激活片段（或 null）；dtMs: 距上一帧过去的毫秒数；
  // instant: 为 true 时（拖动进度条/切换示例）直接跳到目标姿态，不做限速插值。
  tick(seg, dtMs, { instant = false } = {}) {
    if (seg !== this._activeSegRef) {
      this._prePose = {
        yaw: this.followers.yaw.value,
        pitch: this.followers.pitch.value,
        roll: this.followers.roll.value,
      };
      this._activeSegRef = seg;
      const atomDef = seg && this.atomsIndex.byId(seg.atomId);
      const angleOverride = seg && seg.angle != null ? seg.angle : null;
      this._plan = atomDef ? resolveAtomPlan(atomDef, seg.coefficients || {}, this.atomsData, this._prePose, angleOverride) : {};
    }

    for (const axis of AXES) {
      const p = this._plan[axis];
      if (p) {
        // instant 时强制重载 waypoints（force），保证快照读到的是完整计划而不是已消耗的空队列
        this.followers[axis].drive(seg, p.waypoints, p.speed, instant);
      } else {
        this.followers[axis].drive("idle:" + axis, [{ value: this._idle[axis], holdMs: 0 }], fallbackSpeed(this.atomsData, AXIS_DOF[axis]), instant);
      }
      if (instant) this.followers[axis].snapToFirstTarget(this._idle[axis]);
    }

    return {
      yaw: this.followers.yaw.tick(instant ? 0 : dtMs),
      pitch: this.followers.pitch.tick(instant ? 0 : dtMs),
      roll: this.followers.roll.tick(instant ? 0 : dtMs),
    };
  }
}
