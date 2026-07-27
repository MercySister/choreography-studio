// simulator-ui.js —— 感知模拟器的交互层：四个传感器（NFC/触摸/手势/人脸）的触发面板 + 运行循环。
// 把传感器事件喂给 BehaviorArbiter（决策器），决策器算出当前该表达的场景帧，这里过一遍
// MotionSimulator 得到连续机械姿态后渲染到预览。面板控件由 SENSORS + 规则表数据驱动生成——
// 加一个新传感器/新绑定，改 scenes.js 的数据即可，这一层不用动。
//
// 与时间轴播放、音乐律动一样是预览的驱动者之一，同一时间只有一个在驱动：进入模拟时停掉
// 另外两个；用户回去编辑（播放/拖动/切示例）或开始音乐律动时，自动退出模拟。
import { BehaviorArbiter } from "./arbiter.js";
import { IDLE_SCENE, SENSORS, rulesFor } from "./scenes.js";

export function initSimulator({ renderer, atomsIndex, motionSim }) {
  const panelEl = document.getElementById("sensorPanel");
  const el = {
    toggleBtn: document.getElementById("simToggleBtn"),
    state: document.getElementById("simState"),
    current: document.getElementById("simCurrent"),
    log: document.getElementById("simLog"),
    card: document.getElementById("simToggleBtn").closest(".card"),
    screen: document.getElementById("screen"),
  };

  // 传感器某个可选值的显示名：NFC 用配饰原子名，其余用规则 label 里"→"前的部分
  function valueLabel(rule) {
    if (rule.sensor === "nfc") {
      const atom = atomsIndex.byId(rule.value);
      return (atom ? atom.name : rule.value) + " → " + rule.label.split("→")[1].trim();
    }
    return rule.label;
  }

  // 数据驱动生成每个传感器一行控件
  const selects = {};
  for (const sensor of SENSORS) {
    const rules = rulesFor(sensor.id);
    if (!rules.length) continue;
    const row = document.createElement("div");
    row.className = "form-row sensor-row";
    const label = document.createElement("label");
    label.className = "sensor-name";
    label.textContent = sensor.name;
    const sel = document.createElement("select");
    for (const rule of rules) {
      const opt = document.createElement("option");
      opt.value = rule.value;
      opt.textContent = valueLabel(rule);
      sel.appendChild(opt);
    }
    selects[sensor.id] = sel;
    const trigBtn = document.createElement("button");
    trigBtn.className = "btn secondary";
    trigBtn.textContent = sensor.triggerVerb;
    trigBtn.addEventListener("click", () => fire(sensor.id, "tag"));
    row.append(label, sel, trigBtn);
    if (sensor.hasRemove) {
      const rmBtn = document.createElement("button");
      rmBtn.className = "btn secondary";
      rmBtn.textContent = "移开";
      rmBtn.addEventListener("click", () => fire(sensor.id, "remove"));
      row.appendChild(rmBtn);
    }
    panelEl.appendChild(row);
  }

  const arbiter = new BehaviorArbiter(IDLE_SCENE);
  let running = false;
  let loopTimer = null;
  let firstFrame = true;
  let lastTickTs = 0;
  let stopOtherDrivers = () => {};

  function log(msg, kind) {
    const line = document.createElement("div");
    line.className = "ev-" + (kind || "ignore");
    const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    line.textContent = `[${t}] ${msg}`;
    el.log.prepend(line);
    while (el.log.childElementCount > 30) el.log.lastChild.remove();
  }

  // 按真实流逝时间推进，而不是固定步长——即使定时器被浏览器节流（标签页失焦时压到≥1s/次），
  // 场景时长/回落时机也不会漂移。dt 上限 200ms，避免长时间挂起后一帧巨跳。
  function renderTick() {
    const now = performance.now();
    const dtMs = firstFrame ? 0 : Math.min(200, now - lastTickTs);
    lastTickTs = now;
    const out = arbiter.tick(dtMs);
    const pose = motionSim.tick(out.frame.motionSegs || out.frame.motion, dtMs, { instant: firstFrame });
    firstFrame = false;
    renderer.render(out.frame, atomsIndex, pose);
    el.current.textContent = out.isIdle ? "待机" : out.sceneName;
    if (out.justReturnedToIdle) log("场景播放结束 → 回到待机", "idle");
  }

  function start() {
    if (running) return;
    stopOtherDrivers();
    running = true;
    firstFrame = true;
    lastTickTs = performance.now();
    arbiter.reset();
    el.toggleBtn.textContent = "■ 退出模拟";
    el.state.textContent = "运行中 · 待机";
    el.card.classList.add("sim-running");
    el.screen.classList.add("touchable");
    log("进入模拟模式（待机）", "idle");
    loopTimer = setInterval(renderTick, 33);
  }

  function stop() {
    if (!running) return;
    clearInterval(loopTimer);
    loopTimer = null;
    running = false;
    arbiter.reset();
    el.toggleBtn.textContent = "▷ 进入模拟";
    el.state.textContent = "未运行";
    el.current.textContent = "—";
    el.card.classList.remove("sim-running");
    el.screen.classList.remove("touchable");
  }

  // 触发一个传感器事件（type: "tag" 一次感知 / "remove" 配饰移开）
  function fire(sensorId, type, forcedValue) {
    if (!running) start();
    const value = forcedValue != null ? forcedValue : selects[sensorId].value;
    const sensor = SENSORS.find((s) => s.id === sensorId);
    const shownRule = rulesFor(sensorId).find((r) => r.value === value);
    const shown = shownRule ? valueLabel(shownRule).split("→")[0].trim() : value;
    const res = arbiter.dispatch({ sensor: sensorId, type, value });
    if (type === "remove") {
      log(res.action === "return-idle" ? `移开「${shown}」→ 回到待机` : `移开「${shown}」→ 无变化（${res.reason}）`, res.action === "return-idle" ? "idle" : "ignore");
    } else if (res.action === "trigger") {
      log(`${sensor.name}「${shown}」→ 触发场景「${res.name}」(优先级${res.priority})`, "trigger");
    } else if (res.action === "return-idle") {
      log(`${sensor.name}「${shown}」→ 回到待机`, "idle");
    } else {
      log(`${sensor.name}「${shown}」→ 忽略（${res.reason}）`, "ignore");
    }
    el.state.textContent = "运行中 · " + arbiter.current().name;
  }

  // 直接点预览里的机器人屏幕 = 触摸"点屏幕"事件（模拟器最直观的触摸交互）
  el.screen.addEventListener("click", () => {
    if (!running) return;
    fire("touch", "tag", "screen_tap");
    if (selects.touch) selects.touch.value = "screen_tap";
  });

  el.toggleBtn.addEventListener("click", () => (running ? stop() : start()));

  // 用户回到编辑/音乐律动时自动退出模拟，避免多个驱动同时抢预览
  for (const id of ["playBtn", "scrubber", "exampleSelect", "musicPlayBtn"]) {
    const target = document.getElementById(id);
    if (!target) continue;
    const evt = id === "scrubber" ? "input" : id === "exampleSelect" ? "change" : "click";
    target.addEventListener(evt, () => { if (running) stop(); });
  }

  return {
    setStopOtherDrivers(fn) { stopOtherDrivers = fn || (() => {}); },
    stop,
    isRunning: () => running,
  };
}
