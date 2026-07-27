// template-store.js —— 场景模版的存取层（整套编排存成一个模版，可自己命名）。
//
// 平台是纯静态页面（无后端），模版存在浏览器 localStorage 里：
//   - 只在当前这台电脑的这个浏览器有效，换电脑/换浏览器/清缓存会丢；
//   - 要备份或和同事共享，用「导出 JSON」把编排存成文件发出去，对方「导入 JSON」即可。
//
// 模版内容格式 = 一份 sequence JSON（和「导出 JSON」完全同格式），所以模版和导出的
// 编排文件可以互相通用：导出的文件能直接导入，导入后再「存为模版」就变成本地模版。

const LS_KEY = "robot.choreography.templates";

// ---------- 文件名 ----------

// 把名字转成安全文件名：去掉路径/非法字符，空格转连字符
export function slugify(name) {
  const s = String(name || "")
    .trim()
    .replace(/[\/\\:*?"<>|]+/g, "")   // 文件系统非法字符
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "");             // 别生成隐藏文件
  return s || "untitled";
}

// 导出文件名：编排名 + 日期，比 combo_1712345678.json 好找
export function exportFileName(name, date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const d = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  return `${slugify(name || "未命名编排")}-${d}.json`;
}

// ---------- 模版读写 ----------

export async function listTemplates() {
  return readLocal();
}

export async function saveTemplate(name, sequence) {
  const seq = JSON.parse(JSON.stringify(sequence));
  seq.name = name; // 模版名就写进编排的 name，载入后名字一致、导出文件名也用它
  const list = readLocal();
  const idx = list.findIndex((t) => t.name === name); // 同名覆盖
  const item = { id: idx >= 0 ? list[idx].id : "tpl_" + Date.now(), name, sequence: seq };
  if (idx >= 0) list[idx] = item; else list.push(item);
  writeLocal(list);
  return item;
}

export async function deleteTemplate(id) {
  writeLocal(readLocal().filter((t) => t.id !== id));
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) { /* 配额满/隐私模式：静默 */ }
}
