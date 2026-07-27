// render.js —— 把 motion-sim 算出的连续姿态、player 算出的当前帧，映射成机器人预览的实际视觉状态。
// 表情/氛围灯这里的形状/颜色/动效映射是 MVP 阶段的示意实现（用于验证数据模型和交互是否顺畅），
// 不是最终美术定稿；正式项目里这一层会被替换成真实的美术资源/渲染引擎。

const HEART_PATH = "M24 42C24 42 4 28 4 15C4 8 9.5 3 16 3C20 3 23 5.5 24 8C25 5.5 28 3 32 3C38.5 3 44 8 44 15C44 28 24 42 24 42Z";

// 表情原子 -> 眼形/颜色/姿态。左右眼可分别指定（left/right），默认取 both。
//
// 可用字段：
//   w/h/r      眼睛尺寸与圆角（r 支持 "水平/垂直" 双半径写法，用来做弧形眼）
//   bg         自定义背景，覆盖纯色填充（眩晕的同心圆蚊香眼）
//   clip       自定义形状路径（比心用）
//   tilt       眼睛倾斜角(°)。**正值 = 内眼角向下**（生气/严肃），**负值 = 外眼角向下**（难过/委屈）。
//              左右眼自动镜像，这是把"眉毛情绪"做进纯眼睛表达的关键手段。
//   dy / dx    整体上下 / 左右偏移(px)：低垂(困倦)、上瞟(思考)、侧看(左看右看)
//   gap        双眼间距(px)，默认 20。瞪大时拉开、严肃时收紧
//   mark       附加符号：blush腮红 / tear眼泪 / sweat汗滴 / question问号 / zzz / spiral / dots / sparkle
//   anim       wobble = 左右晃动
//
// 设计原则：每个情绪必须在**形状或符号**上可区分，不能只靠颜色区分（原来 难过/哭泣、
// 困惑/眩晕 就是只换了颜色，看不出差别）。
export const FACE_SHAPES = {
  // ---- 中性 ----
  FACE_NORMAL:   { both: { w: 40, h: 40, r: "32%" }, color: "#ffe3bf" },
  // 瞪圆 + 拉开间距 + 微微上移：吃惊
  FACE_SURPRISE: { both: { w: 46, h: 46, r: "50%" }, gap: 26, dy: -2, color: "#ffd9a0" },
  // 一大一小 + 歪斜 + 问号：困惑（和眩晕区分开）
  FACE_CONFUSE:  { left: { w: 42, h: 42, r: "50%" }, right: { w: 30, h: 28, r: "45%" },
                   tilt: -7, mark: "question", color: "#d8ccff" },
  FACE_CLOSE:    { both: { w: 42, h: 6, r: "40% 40% 10% 10% / 90% 90% 20% 20%" }, color: "#caa06a" },
  // 下垂弧 + 整体下沉 + zzz：困倦
  FACE_SLEEPY:   { both: { w: 42, h: 12, r: "10% 10% 60% 60% / 20% 20% 100% 100%" },
                   dy: 6, mark: "zzz", color: "#c8a273" },
  // 同心圆"蚊香眼" + 晃动：眩晕（原来只是紫色圆点，和常态几乎没区别）
  FACE_DIZZY:    { both: { w: 42, h: 42, r: "50%",
                     bg: "radial-gradient(circle, #cfc3f0 0 26%, transparent 26% 46%, #cfc3f0 46% 66%, transparent 66% 84%, #cfc3f0 84%)" },
                   mark: "spiral", anim: "wobble", color: "#cfc3f0" },
  // 上瞟 + 一眼眯起 + 思考点：思考
  FACE_THINK:    { left: { w: 40, h: 16, r: "40% 40% 30% 30%" }, right: { w: 38, h: 32, r: "36%" },
                   dy: -4, mark: "dots", color: "#a8dcf0" },
  // 眯眼 + 内角下压 + 收紧间距：认真
  FACE_SERIOUS:  { both: { w: 44, h: 20, r: "18%" }, tilt: 8, gap: 15, color: "#e8c58a" },
  // 左看/右看：双眼整体大幅平移 + 远端那只明显压窄（透视感）。位移幅度必须够大，
  // 否则和常态几乎看不出差别——纯色果冻眼没有瞳孔，只能靠"整体挪位 + 挤压"表达视线。
  FACE_LEFT:     { left: { w: 44, h: 40, r: "34%" }, right: { w: 22, h: 34, r: "50%" }, dx: -18, gap: 16, color: "#ffe3bf" },
  FACE_RIGHT:    { left: { w: 22, h: 34, r: "50%" }, right: { w: 44, h: 40, r: "34%" }, dx: 18, gap: 16, color: "#ffe3bf" },

  // ---- 正向 ----
  // 上弯的实心拱形（∩ ∩）——最经典的开心眯眼
  FACE_HAPPY:    { both: { w: 42, h: 24, r: "50% 50% 0 0 / 100% 100% 0 0" }, color: "#ffcf7a" },
  // 开心弧 + 腮红：害羞
  FACE_SHY:      { both: { w: 38, h: 20, r: "50% 50% 0 0 / 100% 100% 0 0" }, mark: "blush", color: "#ffb0c4" },
  // 睁得更大 + 星芒：期待
  FACE_EAGER:    { both: { w: 46, h: 44, r: "44%" }, mark: "sparkle", color: "#ffd98a" },
  // 一只笑弧 + 一只圆睁：眨眼
  FACE_WINK:     { left: { w: 42, h: 24, r: "50% 50% 0 0 / 100% 100% 0 0" }, right: { w: 40, h: 40, r: "46%" },
                   color: "#ffd9a0" },
  FACE_LIKE:     { both: { w: 48, h: 44, r: "0%", clip: HEART_PATH }, color: "#ff6f91" },

  // ---- 负向 ----
  // 外眼角下垂 + 下沉：难过
  FACE_SAD:      { both: { w: 40, h: 30, r: "20% 20% 55% 55% / 25% 25% 60% 60%" },
                   tilt: -13, dy: 4, color: "#8fa6c4" },
  // 内眼角强烈下压 + 眯窄：生气
  FACE_ANGRY:    { both: { w: 44, h: 22, r: "18% 18% 40% 40%" }, tilt: 17, gap: 16, color: "#ff6b4a" },
  // 圆眼 + 汗滴 + 晃动：紧张
  FACE_NERVOUS:  { both: { w: 38, h: 38, r: "32%" }, mark: "sweat", anim: "wobble", color: "#e8c58a" },
  // 一长一短的平线（不对称）：无语（和闭眼区分开）
  FACE_SILENT:   { left: { w: 28, h: 6, r: "10%" }, right: { w: 42, h: 6, r: "10%" }, color: "#b0aca4" },
  // 难过形 + 落泪：哭泣
  FACE_CRY:      { both: { w: 40, h: 30, r: "20% 20% 55% 55% / 25% 25% 60% 60%" },
                   tilt: -13, dy: 4, mark: "tear", color: "#7fa8d6" },
};

// 情绪辅助符号的 DOM 片段（画在眼睛所在的屏幕层上）
export const FACE_MARK_HTML = {
  blush:    '<i class="fm-blush l"></i><i class="fm-blush r"></i>',
  tear:     '<i class="fm-tear l"></i><i class="fm-tear r"></i>',
  sweat:    '<i class="fm-sweat"></i>',
  question: '<i class="fm-glyph fm-q">?</i>',
  zzz:      '<i class="fm-glyph fm-z">z</i>',
  spiral:   '<i class="fm-glyph fm-sp">@</i>',
  dots:     '<i class="fm-glyph fm-dots">• • •</i>',
  sparkle:  '<i class="fm-glyph fm-sk">✦</i>',
};
const DEFAULT_FACE_SHAPE = FACE_SHAPES.FACE_NORMAL;

// 配饰/氛围特效的占位图标（emoji）。这是"有视觉呈现"和"正式美术资源"之间的折中：
// 让编排预览时能直观看到配饰/特效出现的时机和组合效果，而不是只有一行文字徽章；
// 等美术图标到位后，把这两张表换成图片路径、渲染处换成 <img> 即可。
const DRESS_ICONS = {
  DRESS_MIC: "🎤", DRESS_GUITAR: "🎸", DRESS_BASS: "🪕", DRESS_BATON: "🪄",
  DRESS_SAX: "🎷", DRESS_DJ: "🎧", DRESS_FLAG: "🚩", DRESS_BALLOON: "🎈",
  DRESS_PHONE: "📱", DRESS_UMBRELLA: "☂️", DRESS_FLOWERS: "💐", DRESS_BOOK: "📖",
  DRESS_CAMERA: "📷", DRESS_STEER: "🛞", DRESS_ENERGY: "🔮", DRESS_MAP: "🗺️",
  DRESS_HANDSUP: "🙋", DRESS_REDFLOWER: "🌺", DRESS_AGREE: "👍", DRESS_HEART: "🫶",
  DRESS_CLAP: "👏", DRESS_HIGHFIVE: "✋", DRESS_SIX: "🤙", DRESS_MEDAL: "🏅",
  DRESS_LUCKYMONEY: "🧧", DRESS_COVEREYES: "🙈", DRESS_YEAH: "✌️", DRESS_LISTEN: "👂",
  DRESS_LOLLIPOP: "🍭", DRESS_MELON: "🍉", DRESS_CAKE: "🎂", DRESS_ICECREAM: "🍦",
  DRESS_TEA: "🍵", DRESS_MILKTEA: "🧋", DRESS_COFFEE: "☕", DRESS_TANGHULU: "🍡",
  DRESS_SUNGLASSES: "🕶️", DRESS_NECKTIE: "🎀", DRESS_GOLDCHAIN: "⛓️", DRESS_SCARF: "🧣",
};
const VIBE_ICONS = {
  VIBE_LIGHTNING: "⚡", VIBE_SUN: "☀️", VIBE_CLOUD: "☁️", VIBE_STAR: "✨",
  VIBE_SNOW: "❄️", VIBE_RAIN: "🌧️", VIBE_WIND: "🌬️", VIBE_FIREWORK: "🎆",
  VIBE_STREAMER: "🎊", VIBE_BUTTERFLY: "🦋", VIBE_RAINBOW: "🌈",
};

// 氛围灯原子 -> 环形光 class + 默认色
const LIGHT_STYLES = {
  LIGHT_BREATHE: { cls: "breathe", color: "#ffddaa" },
  LIGHT_GRADIENT: { cls: "sweep", color: "#ffcd8c" },
  LIGHT_SOLID: { cls: "", color: "#ffddaa" },
  LIGHT_STROBE: { cls: "strobe", color: "#ff6b4a" },
  LIGHT_SWEEP: { cls: "sweep", color: "#ffcd8c" },
  LIGHT_RIPPLE: { cls: "ripple", color: "#7ac9ff" },
  LIGHT_OFF: { cls: "off", color: "rgba(0,0,0,0)" },
};

export class RobotRenderer {
  constructor({ headEl, yawGroupEl, pitchGroupEl, ambientEl, eyeLEl, eyeREl, eyeSlotLEl, eyeSlotREl,
                faceMarksEl, captionEl, badgesEl, eyesEl, screenDressEl, screenVibeEl }) {
    this.headEl = headEl;
    this.yawGroupEl = yawGroupEl || null;
    this.pitchGroupEl = pitchGroupEl || null;
    this.ambientEl = ambientEl;
    this.eyeLEl = eyeLEl;
    this.eyeREl = eyeREl;
    this.eyeSlotLEl = eyeSlotLEl || null;
    this.eyeSlotREl = eyeSlotREl || null;
    this.faceMarksEl = faceMarksEl || null;
    this.captionEl = captionEl;
    this.badgesEl = badgesEl;
    this.eyesEl = eyesEl || null;
    this.screenDressEl = screenDressEl || null;
    this.screenVibeEl = screenVibeEl || null;
    this._lastFaceId = null;
  }

  // frame: player.computeFrame() 的结果；pose: motion-sim 算出的连续 {yaw,pitch,roll}
  render(frame, atomsIndex, pose) {
    this._renderMotion(pose);
    this._renderFace(frame.face);
    this._renderLight(frame.ambientLight);
    this._renderBadges(frame.dress, frame.vibe, atomsIndex);
    this._renderCaption(frame, atomsIndex);
  }

  // 机械结构的正面视角映射（这是唯一的物理运动部分，屏幕内容不参与）：
  //   旋转 yaw(±180°)  → 头部左右转向(rotateY 3D，1:1真实角度)，±180°背对(见后脑勺)
  //   俯仰 pitch(-30~+30°) → 0=正前方，+30抬头/-30低头(rotateX 3D)，轴心在屏下1/3（结构方案：
  //                       Pitch铰链轴线在屏下1/3高度，transform-origin 与之对应）。v0.4.0双向
  //   歪头 roll(±20°)   → 屏面绕中心左右倾斜(rotateZ)
  //
  // 镜面约定：机器人放在仪表台上正面朝向用户，就像照镜子——机器人的"左转"(DOF正方向)
  // 应该出现在用户视角的左边。所以显示时对 yaw/roll 取镜像(乘 MIRROR=-1)，让预览里的
  // 左右和用户的左右一致。数据模型/下发给固件的角度值不变，这只是呈现层的视角约定。
  _renderMotion(pose) {
    if (!pose) return;
    const MIRROR = -1;
    // 三个自由度按真实电机布置分层驱动三个嵌套变换组（见 index.html / styles.css 运动学链）：
    //   Yaw电机在底座        → yawGroupEl 绕底座竖轴 rotateY，带动 颈+头 整体转身
    //   Pitch电机在颈-底座连接 → pitchGroupEl 绕颈根 rotateX，带动 颈+头 整体前倾/后仰(大弧线鞠躬)
    //   Roll电机在屏-颈连接   → headEl 绕颈顶(屏下1/3, origin 66%) rotateZ，只有头歪、颈不动
    // 镜面约定(MIRROR=-1)：机器人正对用户，"左转/左歪"显示到用户视角左边；下发固件的角度不受影响。

    // Yaw：0=正对用户，±90=侧面，±180=背对（看到后脑勺/屏幕背面）。1:1 映射不压缩。
    const yawDeg = Math.max(-180, Math.min(180, pose.yaw)) * MIRROR;
    // Pitch：0=正前方，+30=抬头，-30=低头。抬头(正)顶边后仰=rotateX正，低头(负)顶边朝用户=rotateX负。
    const pitchDeg = Math.max(-30, Math.min(30, pose.pitch));
    // Roll：±20，绕头部自身竖轴歪。
    const rollDeg = Math.max(-20, Math.min(20, pose.roll)) * MIRROR;

    // perspective 在 .stage 上，各组 preserve-3d 逐层传递：头部前后面板(厚度)随倾斜真实透视。
    if (this.yawGroupEl) this.yawGroupEl.style.transform = `rotateY(${yawDeg.toFixed(2)}deg)`;
    if (this.pitchGroupEl) this.pitchGroupEl.style.transform = `rotateX(${pitchDeg.toFixed(2)}deg)`;
    // head 仍需 translateX(-50%) 居中(自身 left:50%)，再叠加 roll 的 rotateZ。
    this.headEl.style.transform = `translateX(-50%) rotateZ(${(-rollDeg).toFixed(2)}deg)`;
  }

  _renderFace(seg) {
    const atomId = seg ? seg.atomId : null;
    // 表情只在**切换时**重建：符号(眼泪/汗滴)带动画，每帧重写 innerHTML 会把动画一直打断
    if (atomId === this._lastFaceId) return;
    this._lastFaceId = atomId;

    const shape = (seg && FACE_SHAPES[seg.atomId]) || DEFAULT_FACE_SHAPE;
    const L = shape.left || shape.both;
    const R = shape.right || shape.both;

    for (const [el, s] of [[this.eyeLEl, L], [this.eyeREl, R]]) {
      el.style.width = s.w + "px";
      el.style.height = s.h + "px";
      if (s.clip) {
        el.style.clipPath = `path("${s.clip}")`;
        el.style.borderRadius = "0";
      } else {
        el.style.clipPath = "none";
        el.style.borderRadius = s.r;
      }
      // s.bg 允许用自定义背景（如眩晕的同心圆"蚊香眼"）覆盖纯色填充
      el.style.background = s.bg || shape.color;
      el.style.setProperty("--eg", shape.color);   // 发光色始终用主色
      el.classList.toggle("wobble", shape.anim === "wobble");
      el.classList.remove("bounce");
      void el.offsetWidth;   // 强制重排，让 bounce 动画每次切表情都能重放
      el.classList.add("bounce");
    }

    // 位移/倾斜放在外层 slot 上：.eye 自身的果冻动画也在写 transform，写同一层会被覆盖。
    // tilt 左右镜像 —— 正值内眼角向下(生气)，负值外眼角向下(难过)。
    const tilt = shape.tilt || 0, dy = shape.dy || 0, dx = shape.dx || 0;
    if (this.eyeSlotLEl && this.eyeSlotREl) {
      this.eyeSlotLEl.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`;
      this.eyeSlotREl.style.transform = `translate(${dx}px, ${dy}px) rotate(${-tilt}deg)`;
    }
    if (this.eyesEl) this.eyesEl.style.gap = (shape.gap != null ? shape.gap : 20) + "px";

    if (this.faceMarksEl) {
      this.faceMarksEl.innerHTML = shape.mark ? FACE_MARK_HTML[shape.mark] || "" : "";
    }
  }

  _renderLight(seg) {
    const style = (seg && LIGHT_STYLES[seg.atomId]) || LIGHT_STYLES.LIGHT_BREATHE;
    const color = (seg && seg.color) || style.color;
    // 亮度(0-100)转成发光色的不透明度——亮度是编排片段里真实可调的参数，
    // 产品定义场景里"呼吸，亮度20%到60%"这类描述对应的就是这个值。
    const brightness = seg && seg.brightness != null ? seg.brightness : 60;
    this.ambientEl.className = "ambient " + style.cls;
    this.ambientEl.style.setProperty("--glow-color", withAlpha(color, brightness / 100));
    // 呼吸周期/频闪间隔：优先用片段里显式设置的值，其次是原子定义的默认动效节奏。
    const periodMs = seg && (seg.periodMs || seg.intervalMs);
    this.ambientEl.style.animationDuration = periodMs ? periodMs + "ms" : "";
    this.ambientEl.style.setProperty("--ring-a", "#4a4a4f");
    this.ambientEl.style.setProperty("--ring-b", "#232326");
  }

  // 配饰/氛围特效是屏幕内容（和眼睛合成在同一块屏幕里），不是屏幕外的实体物件——
  // 参照产品定义呈现层合成图：手持/互动/食物类配饰显示在眼睛下方，穿戴类（墨镜等）盖在眼睛
  // 位置（眼睛弱化让位），氛围特效是屏幕上缘的点缀图标。
  _renderBadges(dressSeg, vibeSeg, atomsIndex) {
    this.badgesEl.innerHTML = "";
    if (dressSeg) {
      const atom = atomsIndex.byId(dressSeg.atomId);
      const icon = DRESS_ICONS[dressSeg.atomId] || "";
      this.badgesEl.appendChild(makeBadge((icon ? icon + " " : "") + (atom ? atom.name : dressSeg.atomId), "dress"));
    }
    if (vibeSeg) {
      const atom = atomsIndex.byId(vibeSeg.atomId);
      const icon = VIBE_ICONS[vibeSeg.atomId] || "";
      this.badgesEl.appendChild(makeBadge((icon ? icon + " " : "") + (atom ? atom.name : vibeSeg.atomId), "vibe"));
    }

    if (this.screenDressEl) {
      const atom = dressSeg ? atomsIndex.byId(dressSeg.atomId) : null;
      const icon = dressSeg ? DRESS_ICONS[dressSeg.atomId] || "" : "";
      const wearable = !!(atom && atom.category === "穿戴类");
      const changed = this.screenDressEl.textContent !== icon;
      this.screenDressEl.textContent = icon;
      this.screenDressEl.classList.toggle("wearable", wearable);
      if (changed) {
        this.screenDressEl.classList.remove("on");
        if (icon) {
          void this.screenDressEl.offsetWidth;
          this.screenDressEl.classList.add("on");
        }
      } else {
        this.screenDressEl.classList.toggle("on", !!icon);
      }
      if (this.eyesEl) {
        this.eyesEl.classList.toggle("make-room", !!icon && !wearable);
        this.eyesEl.classList.toggle("behind-wearable", !!icon && wearable);
      }
    }
    if (this.screenVibeEl) {
      const icon = vibeSeg ? VIBE_ICONS[vibeSeg.atomId] || "" : "";
      this.screenVibeEl.textContent = icon;
      this.screenVibeEl.classList.toggle("on", !!icon);
    }
  }

  _renderCaption(frame, atomsIndex) {
    const parts = [];
    for (const key of ["motion", "face", "dress", "vibe", "ambientLight"]) {
      const seg = frame[key];
      if (!seg) continue;
      const atom = atomsIndex.byId(seg.atomId);
      parts.push(atom ? atom.name : seg.atomId);
    }
    this.captionEl.textContent = parts.length ? parts.join(" · ") : "待机";
  }
}

// 把 "#rrggbb" 十六进制色转成带指定不透明度的 rgba()；不是hex格式(如 rgba/transparent)时原样返回。
function withAlpha(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
}

function makeBadge(text, kind) {
  const el = document.createElement("span");
  el.className = "badge " + kind;
  el.textContent = text;
  return el;
}
