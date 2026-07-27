// scenes.js —— 可被传感器事件触发的场景库 + 感知事件→场景的绑定规则。
//
// 场景就是一份编排(sequence)，结构和编排编辑器产出的完全一样，所以传感器触发的
// "反应"复用整套播放/渲染管线，不是另起炉灶。每个场景带 scenePriority/interruptible/loop
// ——这正是行为决策器(arbiter.js)做优先级仲裁、判断能否打断的依据。
//
// NFC/触摸/手势/人脸这些感知能力在 产品定义 里目前只有占位标题（硬件已预留：机身有NFC区/触摸区/
// 磁吸区，人脸/手势依赖摄像头）。这里的传感器定义、场景、绑定都是"走在产品定义前面"的提案，
// 标 proposed，交互细节待产品确认。
import { EXAMPLES } from "./examples.js";

// 待机态：无事件时机器人的默认表现（产品定义默认态：FACE_NORMAL 循环）。优先级最低，任何事件都能打断。
export const IDLE_SCENE = {
  id: "scene_idle", name: "待机", version: "0.2.0",
  scenePriority: 0, interruptible: true, loop: { enabled: true, count: -1 },
  tracks: {
    motion: [{ atomId: "ACT_IDLE", startMs: 0, durationMs: 4000 }],
    face: [{ atomId: "FACE_NORMAL", startMs: 0, durationMs: 4000 }],
    dress: [], vibe: [],
    ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 4000, color: "#FFDDAA", brightness: 45 }],
  },
};

const co = { rate: 1, amplitude: 1, repeat: 1, dwell: 1 };

// 场景库。每个场景 = 一份编排。优先级约定：配饰/触摸/手势类=3，唤醒=4，人来/警觉类=5。
export const SCENES = {
  // —— NFC 配饰 ——
  music: EXAMPLES.music, // 话筒 → 音乐律动（复用示例，自带节奏点头的循环编排）
  gift_flowers: {
    id: "scene_gift_flowers", name: "送花", version: "0.2.0",
    scenePriority: 3, interruptible: true, loop: { enabled: true, count: -1 },
    tracks: {
      motion: [
        { atomId: "ACT_TILT", startMs: 0, durationMs: 1600, coefficients: co },
        { atomId: "ACT_NOD", startMs: 1600, durationMs: 1200, coefficients: co },
      ],
      face: [{ atomId: "FACE_SHY", startMs: 0, durationMs: 1200 }, { atomId: "FACE_HAPPY", startMs: 1200, durationMs: 1600 }],
      dress: [{ atomId: "DRESS_FLOWERS", startMs: 0, durationMs: 2800 }],
      vibe: [{ atomId: "VIBE_STAR", startMs: 1200, durationMs: 1600 }],
      ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 2800, color: "#FF9EC4", brightness: 70 }],
    },
  },
  cool_shades: {
    id: "scene_cool_shades", name: "耍酷", version: "0.2.0",
    scenePriority: 3, interruptible: true, loop: { enabled: true, count: -1 },
    tracks: {
      motion: [
        { atomId: "ACT_YAW_LEFT", startMs: 0, durationMs: 1400, coefficients: { rate: 0.6, amplitude: 0.6, repeat: 1, dwell: 1 } },
        { atomId: "ACT_YAW_RIGHT", startMs: 1400, durationMs: 1400, coefficients: { rate: 0.6, amplitude: 0.6, repeat: 1, dwell: 1 } },
      ],
      face: [{ atomId: "FACE_SERIOUS", startMs: 0, durationMs: 2800 }],
      dress: [{ atomId: "DRESS_SUNGLASSES", startMs: 0, durationMs: 2800 }],
      vibe: [],
      ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 2800, color: "#7AC9FF", brightness: 60 }],
    },
  },

  // —— 触摸感应 ——
  shy_pat: { // 摸头 → 害羞
    id: "scene_shy_pat", name: "摸头害羞", version: "0.2.0",
    scenePriority: 3, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [{ atomId: "ACT_TILT", startMs: 0, durationMs: 1800, coefficients: co }],
      face: [{ atomId: "FACE_SHY", startMs: 0, durationMs: 1800 }],
      dress: [], vibe: [{ atomId: "VIBE_STAR", startMs: 200, durationMs: 1200 }],
      ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 1800, color: "#FFB0C4", brightness: 65 }],
    },
  },
  wake: { // 长按屏幕 → 唤醒
    id: "scene_wake", name: "唤醒", version: "0.2.0",
    scenePriority: 4, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [{ atomId: "ACT_PITCH_HOME", startMs: 0, durationMs: 800, coefficients: co }, { atomId: "ACT_NOD", startMs: 800, durationMs: 1000, coefficients: co }],
      face: [{ atomId: "FACE_SURPRISE", startMs: 0, durationMs: 700 }, { atomId: "FACE_HAPPY", startMs: 700, durationMs: 1100 }],
      dress: [], vibe: [],
      ambientLight: [{ atomId: "LIGHT_SWEEP", startMs: 0, durationMs: 900, color: "#FFCD8C" }, { atomId: "LIGHT_BREATHE", startMs: 900, durationMs: 900, color: "#FFDDAA", brightness: 70 }],
    },
  },

  // —— 手势交互 ——
  greet: { // 挥手 → 打招呼
    id: "scene_greet", name: "打招呼", version: "0.2.0",
    scenePriority: 3, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [
        { atomId: "ACT_ROLL_LEFT", startMs: 0, durationMs: 500, coefficients: co },
        { atomId: "ACT_ROLL_RIGHT", startMs: 500, durationMs: 500, coefficients: co },
        { atomId: "ACT_ROLL_LEFT", startMs: 1000, durationMs: 500, coefficients: co },
      ],
      face: [{ atomId: "FACE_HAPPY", startMs: 0, durationMs: 1600 }],
      dress: [{ atomId: "DRESS_HANDSUP", startMs: 0, durationMs: 1600 }],
      vibe: [], ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 1600, color: "#FFE0A0", brightness: 70 }],
    },
  },
  heart_reply: { // 比心 → 比心回应
    id: "scene_heart_reply", name: "比心回应", version: "0.2.0",
    scenePriority: 3, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [{ atomId: "ACT_NOD", startMs: 0, durationMs: 1200, coefficients: co }],
      face: [{ atomId: "FACE_LIKE", startMs: 0, durationMs: 1800 }],
      dress: [{ atomId: "DRESS_HEART", startMs: 0, durationMs: 1800 }],
      vibe: [{ atomId: "VIBE_STAR", startMs: 0, durationMs: 1800 }],
      ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 1800, color: "#FF6F91", brightness: 75 }],
    },
  },

  // —— 人脸识别（人来/警觉类，优先级高，可打断正在进行的娱乐场景）——
  welcome: EXAMPLES.welcome, // 主驾用户 → 迎宾（复用示例）——见下方规则里改写优先级为5
  turn_passenger: { // 副驾用户 → 转向副驾问候
    id: "scene_turn_passenger", name: "转向副驾", version: "0.2.0",
    scenePriority: 5, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [{ atomId: "ACT_TURN_PASSENGER", startMs: 0, durationMs: 1400, coefficients: co }],
      face: [{ atomId: "FACE_EAGER", startMs: 0, durationMs: 700 }, { atomId: "FACE_HAPPY", startMs: 700, durationMs: 1100 }],
      dress: [], vibe: [],
      ambientLight: [{ atomId: "LIGHT_SWEEP", startMs: 0, durationMs: 1000, color: "#FFCD8C" }],
    },
  },
  alert_stranger: { // 陌生人 → 警觉环顾
    id: "scene_alert_stranger", name: "警觉", version: "0.2.0",
    scenePriority: 5, interruptible: true, loop: { enabled: false, count: 1 },
    tracks: {
      motion: [{ atomId: "ACT_AROUND", startMs: 0, durationMs: 2400, coefficients: co }],
      face: [{ atomId: "FACE_SURPRISE", startMs: 0, durationMs: 600 }, { atomId: "FACE_SERIOUS", startMs: 600, durationMs: 1800 }],
      dress: [], vibe: [],
      ambientLight: [{ atomId: "LIGHT_BREATHE", startMs: 0, durationMs: 2400, color: "#7A9CFF", brightness: 55 }],
    },
  },
};

// 传感器元数据：驱动 UI 生成对应控件，也定义了每类传感器的交互语义。
export const SENSORS = [
  { id: "nfc", name: "NFC 配饰感应", triggerVerb: "贴近", hasRemove: true,
    hint: "机身NFC区感应到配饰后触发对应场景" },
  { id: "touch", name: "触摸感应", triggerVerb: "触摸", hasRemove: false,
    hint: "电容触摸区被触摸/长按（也可直接点预览里的机器人屏幕）" },
  { id: "gesture", name: "手势交互", triggerVerb: "识别到", hasRemove: false,
    hint: "摄像头识别到手势后触发（依赖视觉，模拟层直接选手势）" },
  { id: "face", name: "人脸识别", triggerVerb: "识别到", hasRemove: false, isState: true,
    hint: "识别到座舱内人员身份/座位，触发迎宾、转向、警觉等；选“无人”回落待机" },
];

// 感知事件 → 场景 的绑定规则表。value=事件的具体值（配饰ID/触摸类型/手势/人脸身份）。
// scenePriorityOverride：复用示例编排时改写其优先级（迎宾示例本是2，作为人脸触发提到5）。
export const SENSOR_RULES = [
  // NFC 配饰
  { sensor: "nfc", value: "DRESS_MIC", scene: "music", label: "话筒 → 音乐律动" },
  { sensor: "nfc", value: "DRESS_FLOWERS", scene: "gift_flowers", label: "花束 → 送花" },
  { sensor: "nfc", value: "DRESS_SUNGLASSES", scene: "cool_shades", label: "墨镜 → 耍酷" },
  // 触摸
  { sensor: "touch", value: "head_pat", scene: "shy_pat", label: "摸头 → 害羞" },
  { sensor: "touch", value: "screen_longpress", scene: "wake", label: "长按屏幕 → 唤醒" },
  { sensor: "touch", value: "screen_tap", scene: "heart_reply", label: "点屏幕 → 比心回应" },
  // 手势
  { sensor: "gesture", value: "wave", scene: "greet", label: "挥手 → 打招呼" },
  { sensor: "gesture", value: "heart", scene: "heart_reply", label: "比心 → 比心回应" },
  // 人脸
  { sensor: "face", value: "driver", scene: "welcome", label: "主驾用户 → 迎宾", scenePriorityOverride: 5 },
  { sensor: "face", value: "passenger", scene: "turn_passenger", label: "副驾用户 → 转向副驾" },
  { sensor: "face", value: "stranger", scene: "alert_stranger", label: "陌生人 → 警觉" },
  { sensor: "face", value: "none", scene: null, label: "无人 → 回到待机" },
];

// 查规则：给定传感器类型和值，返回 { sceneKey, sequence, priority } 或 null（未绑定）。
// value 为 face 的 "none" 时 scene=null，表示"回落待机"这个特殊动作。
export function resolveScene(sensor, value) {
  const rule = SENSOR_RULES.find((r) => r.sensor === sensor && r.value === value);
  if (!rule) return null;
  if (rule.scene === null) return { sceneKey: null, sequence: null, priority: 0, returnIdle: true };
  const seq = SCENES[rule.scene];
  if (!seq) return null;
  const priority = rule.scenePriorityOverride ?? seq.scenePriority ?? 0;
  return { sceneKey: rule.scene, sequence: seq, priority };
}

// 某个传感器绑定的所有规则（供 UI 生成该传感器的可选值列表）。
export function rulesFor(sensorId) {
  return SENSOR_RULES.filter((r) => r.sensor === sensorId);
}
