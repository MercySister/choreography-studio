// main.js —— 启动装配：把 atoms / timeline / player / render / ui 串起来。
import { ATOMS, buildAtomsIndex } from "./atoms.js";
import { EXAMPLES } from "./examples.js";
import { Timeline } from "./timeline.js";
import { Player } from "./player.js";
import { MotionSimulator } from "./motion-sim.js";
import { RobotRenderer } from "./render.js";
import { buildHeadDepth, buildNeckColumn } from "./robot-shape.js";
import { initUI } from "./ui.js";
import { initMusicMode } from "./music-ui.js";
import { initSimulator } from "./simulator-ui.js";
import { initTemplates } from "./template-ui.js";

const atomsIndex = buildAtomsIndex(ATOMS);

// 草稿持久化：编排的每次改动都写进 localStorage，刷新/关页面不丢工作。
// 读取失败（首次打开/数据损坏/隐私模式禁用存储）时回落到迎宾示例。
const DRAFT_KEY = "robot.choreography.draft";

// 草稿里的所有原子ID都得在当前注册表里存在，否则这份草稿是旧版原子库时代存的
// （比如 v0.1 的升降/前倾原子在 v0.2 已删除）——整份丢弃回落到示例，避免时间线上
// 出现播放时不动的"僵尸片段"。
function draftUsesOnlyKnownAtoms(seq) {
  const tracks = (seq && seq.tracks) || {};
  for (const segs of Object.values(tracks)) {
    if (!Array.isArray(segs)) continue;
    for (const seg of segs) {
      if (seg && seg.atomId && !atomsIndex.byId(seg.atomId)) return false;
    }
  }
  return true;
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!draftUsesOnlyKnownAtoms(obj)) {
      localStorage.removeItem(DRAFT_KEY); // 清掉不兼容的旧草稿，下次不再尝试
      return null;
    }
    return Timeline.fromJSON(obj);
  } catch (e) { /* 数据损坏或存储不可用，走默认示例 */ }
  return null;
}

function saveDraft(tl) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(tl.toJSON()));
  } catch (e) { /* 存储不可用(隐私模式/配额满)时静默跳过，不影响编辑 */ }
}

const timeline = loadDraft() || Timeline.fromJSON(EXAMPLES.welcome);
window.__timeline = timeline; // 调试/测试钩子：在控制台或冒烟测试里读取当前编排

const motionSim = new MotionSimulator(ATOMS, atomsIndex);

// 造出头/颈的立体体积（密集横截面薄片），否则 Yaw 转到侧面时平面会退化成线
// step 必须 ≲0.5px：边缘朝向视线的薄片会被抗锯齿成半透明细线，间距大了侧面就出现条纹。
// depth 对齐产品形态：头部是有明显厚度的胶囊模组，颈部截面接近圆柱（46×40）。
buildHeadDepth(document.getElementById("headDepth"), { depth: 44, step: 0.5, radius: 60 });
buildNeckColumn(document.getElementById("neck"), { width: 46, depth: 40, centerZ: -22, step: 0.5 });

const renderer = new RobotRenderer({
  headEl: document.getElementById("head"),
  yawGroupEl: document.getElementById("yawGroup"),
  pitchGroupEl: document.getElementById("pitchGroup"),
  ambientEl: document.getElementById("ambient"),
  eyeLEl: document.getElementById("eyeL"),
  eyeREl: document.getElementById("eyeR"),
  eyeSlotLEl: document.getElementById("eyeSlotL"),
  eyeSlotREl: document.getElementById("eyeSlotR"),
  faceMarksEl: document.getElementById("faceMarks"),
  captionEl: document.getElementById("caption"),
  badgesEl: document.getElementById("badges"),
  eyesEl: document.getElementById("eyes"),
  screenDressEl: document.getElementById("screenDress"),
  screenVibeEl: document.getElementById("screenVibe"),
});

let lastTickTs = null;
const player = new Player(timeline, {
  onTick(frame, elapsedMs, maxMs, instant) {
    let dtMs = 0;
    if (!instant) {
      const now = performance.now();
      dtMs = lastTickTs == null ? 0 : now - lastTickTs;
      lastTickTs = now;
    }
    const pose = motionSim.tick(frame.motionSegs || frame.motion, dtMs, { instant });
    renderer.render(frame, atomsIndex, pose);
    ui.updatePlayheads(elapsedMs, maxMs);
  },
});

const ui = initUI({
  timeline,
  player,
  atomsIndex,
  atomsData: ATOMS,
  onChange() {
    player.setTimeline(timeline);
    saveDraft(timeline);
  },
});
window.__ui = ui; // 调试/测试钩子：暴露 UI 内部方法（如 enterEdit）
window.__player = player; // 调试/测试钩子：播放/暂停/停止状态

document.getElementById("exampleSelect").addEventListener("change", (e) => {
  const key = e.target.value;
  if (!key || !EXAMPLES[key]) return;
  // 直接替换 timeline 实例内部持有的 sequence 数据（而不是整个 timeline 对象），
  // 这样 ui.js / player.js 里闭包捕获的同一个 timeline 引用能一起看到新数据，不需要额外同步。
  timeline.sequence = Timeline.fromJSON(EXAMPLES[key]).sequence;
  player.stop();
  ui.renderTracks();
  ui.setStartDefault();
  saveDraft(timeline);
  ui.el.ioNote.textContent = "已载入示例：" + timeline.sequence.name;
});

// 场景模版：载入 / 存为模版 / 删除（存在浏览器 localStorage）
const templates = initTemplates({
  timeline, player, atomsIndex, ui,
  onLoaded() { saveDraft(timeline); },
});
window.__templates = templates; // 调试/测试钩子

const musicMode = initMusicMode({ renderer, atomsIndex, player });
const simulator = initSimulator({ renderer, atomsIndex, motionSim });
// 进入感知模拟时，先停掉时间轴播放和音乐律动（同一时间只有一个驱动预览）
simulator.setStopOtherDrivers(() => {
  player.stop();
  if (musicMode && musicMode.isRunning && musicMode.isRunning()) musicMode.stop();
});

// ---- 一级模块切换：场景编排 / 音光派对 / 感知模拟 ----
// 机器人预览常驻左侧；右侧按模块切换。切走某模块时停掉它的驱动，保证同一时间只有一个在驱动预览。
const moduleTabs = document.getElementById("moduleTabs");
const modulePanels = [...document.querySelectorAll(".module-panel")];
function switchModule(name) {
  moduleTabs.querySelectorAll(".module-tab").forEach((b) => {
    const on = b.dataset.module === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  modulePanels.forEach((p) => { p.hidden = p.dataset.module !== name; });
  if (name !== "party" && musicMode.isRunning()) musicMode.stop();
  if (name !== "sensing" && simulator.isRunning()) simulator.stop();
  if (name !== "scene") player.stop();
  else player.seek(player.elapsedMs); // 进入场景编排：按时间线当前帧刷新机器人
}
moduleTabs.querySelectorAll(".module-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchModule(btn.dataset.module));
});
window.__switchModule = switchModule; // 调试/测试钩子

// ---- 使用教程弹窗 ----
// 用原生 <dialog>：遮罩、ESC 关闭、焦点陷阱都是浏览器自带的，不用自己实现。
{
  const dlg = document.getElementById("helpDialog");
  const openBtn = document.getElementById("helpBtn");
  const closeBtn = document.getElementById("helpCloseBtn");
  if (dlg && openBtn) {
    openBtn.addEventListener("click", () => dlg.showModal());
    closeBtn && closeBtn.addEventListener("click", () => dlg.close());
    // 点遮罩（dialog 元素本身的空白区，即内容框以外）关闭
    dlg.addEventListener("click", (e) => {
      if (e.target !== dlg) return;          // 点到内容区就不关
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }
}

ui.renderTracks();
{
  const initialFrame = player.computeFrame(0);
  const initialPose = motionSim.tick(initialFrame.motionSegs || initialFrame.motion, 0, { instant: true });
  renderer.render(initialFrame, atomsIndex, initialPose);
}
