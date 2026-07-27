// robot-shape.js —— 用"密集堆叠的横截面薄片"给头部和颈部造出真实体积。
//
// 为什么需要：CSS 3D 里没有真正的立体几何，一个 div 永远是一张**没有厚度的平面**。
// 原来头部只用了 前/中/后 三张平行面板来假装厚度——正面看没问题，但 Yaw 转到 ±90°
// 时这三张面板全部与视线平行，各自退化成一条线，机器人就"消失"成几道竖线。
//
// 解法：把实体沿 Z 轴切成很多张等间距的横截面薄片（间距 ≈1px）。
//   - 正面看：所有薄片重合，轮廓和单张面板一样干净；
//   - 侧面看：薄片一张挨一张排开，边缘拼成一个连续的实心侧面，不再露缝。
// 间距必须 ≲1px，否则侧面会看到条纹缝隙（这正是原来 14px 间距失败的原因）。
//
// 薄片是启动时构建一次的静态子节点，逐帧变换只作用在父级运动学组上，没有额外开销。

// 头部：胶囊形沿 Z 轴直挤出，最后几片略微内收做出背壳的圆角
export function buildHeadDepth(el, { depth = 28, step = 1, radius = 60 } = {}) {
  if (!el) return 0;
  el.innerHTML = "";
  const count = Math.max(2, Math.round(depth / step));
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= count; i++) {
    const z = -(i / count) * depth;
    const t = i / count;                       // 0=贴前面板 1=最后面
    const taper = Math.max(0, (t - 0.82) / 0.18); // 最后 18% 开始收边，做圆润背壳
    const inset = taper * 5;
    const layer = document.createElement("div");
    layer.className = "shape-layer";
    layer.style.inset = `${inset.toFixed(2)}px ${(inset * 1.4).toFixed(2)}px`;
    layer.style.borderRadius = radius + "px";
    // 越往后越暗，形成侧面的明暗过渡（侧视时这就是主要的形体光影）
    const g = Math.round(38 - 30 * t);
    layer.style.background = `rgb(${g},${g},${Math.round(g * 1.12)})`;
    layer.style.transform = `translateZ(${z.toFixed(2)}px)`;
    frag.appendChild(layer);
  }
  el.appendChild(frag);
  return count;
}

// 颈部：椭圆截面的柱体。每片的宽度按椭圆方程收缩，侧视时轮廓才是圆柱而不是方板。
export function buildNeckColumn(el, { width = 46, depth = 28, centerZ = -16, step = 1 } = {}) {
  if (!el) return 0;
  el.innerHTML = "";
  const Rz = depth / 2;
  const count = Math.max(3, Math.round(depth / step));
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;   // -1..1
    const z = centerZ + t * Rz;
    // 椭圆截面：|t|→1 时宽度收到 0，这里留个下限免得最外片消失
    const w = Math.max(6, width * Math.sqrt(Math.max(0, 1 - t * t)));
    const layer = document.createElement("div");
    layer.className = "shape-layer neck-layer";
    layer.style.width = w.toFixed(2) + "px";
    layer.style.transform = `translateX(-50%) translateZ(${z.toFixed(2)}px)`;
    // 前亮后暗 + 中间偏亮，读作圆柱高光
    const shade = Math.round(20 + 26 * Math.max(0, 1 - Math.abs(t + 0.15) * 1.6));
    layer.style.background = `linear-gradient(90deg,
      rgb(${shade * 0.45 | 0},${shade * 0.45 | 0},${shade * 0.5 | 0}) 0%,
      rgb(${shade},${shade},${Math.round(shade * 1.15)}) 48%,
      rgb(${shade * 0.4 | 0},${shade * 0.4 | 0},${shade * 0.45 | 0}) 100%)`;
    frag.appendChild(layer);
  }
  el.appendChild(frag);
  return count;
}
