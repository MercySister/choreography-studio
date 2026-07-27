// template-ui.js —— 场景模版的界面接线：下拉载入 / 存为模版 / 删除。
// 存取逻辑在 template-store.js（存在浏览器 localStorage）。

import * as store from "./template-store.js";

export function initTemplates({ timeline, player, atomsIndex, ui, onLoaded }) {
  const el = {
    select: document.getElementById("templateSelect"),
    saveBtn: document.getElementById("saveTemplateBtn"),
    deleteBtn: document.getElementById("deleteTemplateBtn"),
    hint: document.getElementById("templateHint"),
  };
  if (!el.select) return null; // 该模块不在页面上时安全跳过

  let items = [];

  // 模版里的原子必须都还在当前注册表里，否则是旧版本原子库存的，载入会得到不动的"僵尸片段"
  function usesOnlyKnownAtoms(seq) {
    const tracks = (seq && seq.tracks) || {};
    for (const segs of Object.values(tracks)) {
      if (!Array.isArray(segs)) continue;
      for (const seg of segs) if (seg && seg.atomId && !atomsIndex.byId(seg.atomId)) return false;
    }
    return true;
  }

  function setHint(text, kind = "") {
    el.hint.textContent = text || "";
    el.hint.className = "io-hint" + (kind ? " " + kind : "");
  }

  function defaultHint() {
    setHint("模版存在这个浏览器里（换电脑/清缓存会丢）。要备份或分享，用「导出 JSON」发文件，对方「导入 JSON」即可。");
  }

  async function refreshList(selectId) {
    items = await store.listTemplates();
    el.select.innerHTML =
      '<option value="">载入模版…</option>' +
      items.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    if (selectId) el.select.value = selectId;
    el.deleteBtn.style.display = el.select.value ? "" : "none";
  }

  // ---- 载入 ----
  el.select.addEventListener("change", () => {
    const item = items.find((t) => t.id === el.select.value);
    el.deleteBtn.style.display = el.select.value ? "" : "none";
    if (!item) return;
    if (!usesOnlyKnownAtoms(item.sequence)) {
      setHint(`模版「${item.name}」引用了已删除的原子（旧版本原子库存的），未载入。`, "warn");
      return;
    }
    // 替换 timeline 内部持有的 sequence（保持同一个 timeline 引用，ui/player 闭包才能看到新数据）
    timeline.sequence = timeline.constructor.fromJSON(item.sequence).sequence;
    player.stop();
    ui.exitEdit();
    ui.renderTracks();
    ui.setStartDefault();
    onLoaded && onLoaded();
    setHint(`已载入模版「${item.name}」`, "ok");
  });

  // ---- 存为模版 ----
  el.saveBtn.addEventListener("click", async () => {
    const suggested = timeline.sequence.name && timeline.sequence.name !== "未命名编排" ? timeline.sequence.name : "";
    const name = (window.prompt("给这套编排起个模版名：", suggested) || "").trim();
    if (!name) return;
    if (items.some((t) => t.name === name) && !window.confirm(`已存在同名模版「${name}」，覆盖它吗？`)) return;
    const saved = await store.saveTemplate(name, timeline.toJSON());
    timeline.sequence.name = name; // 当前编排跟着改名，导出文件名会用它
    await refreshList(saved.id);
    setHint(`已保存模版「${name}」`, "ok");
  });

  // ---- 删除 ----
  el.deleteBtn.addEventListener("click", async () => {
    const item = items.find((t) => t.id === el.select.value);
    if (!item) return;
    if (!window.confirm(`删除模版「${item.name}」？`)) return;
    await store.deleteTemplate(item.id);
    await refreshList();
    setHint(`已删除模版「${item.name}」`, "ok");
  });

  defaultHint();
  refreshList();

  return { refreshList };
}
