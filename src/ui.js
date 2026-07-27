// ui.js —— 交互控件：轨道面板、原子选择器、参数面板、播放控制条。
import { TRACK_NAMES } from "./timeline.js";
import { estimateAtomDurationMs, axesOfAtom } from "./motion-sim.js";
import { exportFileName } from "./template-store.js";

const TRACK_LABELS = {
  motion: "动作 motion",
  face: "表情 face",
  dress: "配饰 dress",
  vibe: "氛围特效 vibe",
  ambientLight: "氛围灯 ambientLight",
};

const TRACK_SHORT = {
  motion: "动作",
  face: "表情",
  dress: "配饰",
  vibe: "氛围特效",
  ambientLight: "氛围灯",
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 去掉浮点尾数：45.0→45，67.5→67.5
const fmt = (n) => (Math.round(n * 100) / 100).toString();

export function initUI({ timeline, player, atomsIndex, atomsData, onChange }) {
  const el = {
    trackTabs: document.getElementById("trackTabs"),
    addCard: document.getElementById("addCard"),
    addToggle: document.getElementById("addToggle"),
    addCloseBtn: document.getElementById("addCloseBtn"),
    atomSelect: document.getElementById("atomSelect"),
    startMsInput: document.getElementById("startMsInput"),
    startHint: document.getElementById("startHint"),
    durationMsInput: document.getElementById("durationMsInput"),
    angleRow: document.getElementById("angleRow"),
    angleInput: document.getElementById("angleInput"),
    angleHint: document.getElementById("angleHint"),
    finalAngleHint: document.getElementById("finalAngleHint"),
    durationHint: document.getElementById("durationHint"),
    coeffRow: document.getElementById("coeffRow"),
    coefRate: document.getElementById("coefRate"),
    coefAmp: document.getElementById("coefAmp"),
    coefRepeat: document.getElementById("coefRepeat"),
    coefDwell: document.getElementById("coefDwell"),
    lightRow: document.getElementById("lightRow"),
    lightColor: document.getElementById("lightColor"),
    lightBrightness: document.getElementById("lightBrightness"),
    lightPeriod: document.getElementById("lightPeriod"),
    addForm: document.querySelector(".add-form"),
    addSegmentBtn: document.getElementById("addSegmentBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    editNote: document.getElementById("editNote"),
    tracksEl: document.getElementById("tracks"),
    playBtn: document.getElementById("playBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    stopBtn: document.getElementById("stopBtn"),
    scrubber: document.getElementById("scrubber"),
    timeLabel: document.getElementById("timeLabel"),
    exampleSelect: document.getElementById("exampleSelect"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    ioNote: document.getElementById("ioNote"),
  };

  // 动作原子的默认目标角度：单目标动作用 defaultParams.angle，路径动作用路径峰值，
  // 多轴固定姿态(收纳位/默认位)无单一角度返回 null。
  function defaultAngleOf(atom) {
    const dp = (atom && atom.defaultParams) || {};
    if (dp.angle !== undefined) return dp.angle;
    if (dp.path) return dp.path.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    return null;
  }

  // 当前正在编辑的通道（由铺开的通道选择器决定）
  let activeTrack = "motion";
  // 正在精细编辑的已有片段 { track, seg }；null 表示"新建"模式
  let editing = null;

  // 选中动作原子时，把角度输入框预填成该原子的默认角度（固定姿态则禁用）
  function syncAngleField() {
    const atom = atomsIndex.byId(el.atomSelect.value);
    const def = defaultAngleOf(atom);
    if (def == null) {
      el.angleInput.value = "";
      el.angleInput.disabled = true;
      el.angleHint.textContent = "固定姿态·无角度";
    } else {
      el.angleInput.disabled = false;
      el.angleInput.value = String(def);
      el.angleHint.textContent = "默认 " + def + "°";
    }
  }

  // 实时算「最终角度 = 角度 × 幅度」并按 DOF 硬件范围限幅提示（见 motion-sim.resolveAtomPlan）
  function updateFinalAngle() {
    if (activeTrack !== "motion" || el.angleInput.disabled) {
      el.finalAngleHint.style.display = "none";
      return;
    }
    const atom = atomsIndex.byId(el.atomSelect.value);
    const angle = parseFloat(el.angleInput.value);
    const amp = parseFloat(el.coefAmp.value);
    if (!isFinite(angle) || !isFinite(amp)) {
      el.finalAngleHint.style.display = "none";
      return;
    }
    const raw = angle * amp;
    const range = atomsIndex.dofRangeOf(atom);
    const final = range ? clamp(raw, range.min, range.max) : raw;
    const isPath = !!(atom && atom.defaultParams && atom.defaultParams.path);
    let html = `最终角度 = <b>${fmt(angle)}°</b> × 幅度 <b>${fmt(amp)}</b> = <b>${fmt(raw)}°</b>`;
    if (range && final !== raw) {
      html += ` <span class="over">→ 超硬件范围(${range.min}~${range.max}°)，实际 <b>${fmt(final)}°</b></span>`;
    }
    if (isPath) html += `<span class="sub">（往返峰值，相对起始姿态）</span>`;
    el.finalAngleHint.innerHTML = html;
    el.finalAngleHint.style.display = "block";
  }

  // 从表单读当前动作系数 / 角度覆盖（加片段和耗时估算共用）
  function readCoeff() {
    return {
      rate: parseFloat(el.coefRate.value) || 1,
      amplitude: parseFloat(el.coefAmp.value) || 1,
      repeat: parseInt(el.coefRepeat.value, 10) || 1,
      dwell: parseFloat(el.coefDwell.value) || 1,
    };
  }
  function currentAngleOverride() {
    const s = el.angleInput.value.trim();
    return s !== "" && !el.angleInput.disabled ? parseFloat(s) : null;
  }

  // 实时对比「片段时长」和「动作预计耗时」：时长不足时动作做不完，给出提醒和一键设为耗时的按钮。
  function updateDurationHint() {
    if (activeTrack !== "motion") {
      el.durationHint.style.display = "none";
      return;
    }
    const atom = atomsIndex.byId(el.atomSelect.value);
    const dur = parseInt(el.durationMsInput.value, 10) || 0;
    const est = estimateAtomDurationMs(atom, readCoeff(), atomsData, currentAngleOverride());
    if (!est) {
      el.durationHint.style.display = "none";
      return;
    }
    let html = `动作预计耗时 ≈ <b>${est} ms</b>`;
    if (dur >= est) {
      const holdMs = dur - est;
      html += ` <span class="ok">✓ 时长 ${dur}ms 够做完${holdMs > 0 ? `，之后保持 ${holdMs}ms` : ""}</span>`;
    } else {
      const pct = Math.max(0, Math.round((dur / est) * 100));
      html += ` <span class="over">⚠ 时长 ${dur}ms 不足，动作只能完成约 ${pct}%</span>`;
      html += ` <button type="button" class="mini-btn" data-setdur="${est}">设为 ${est}ms</button>`;
    }
    el.durationHint.innerHTML = html;
    el.durationHint.style.display = "block";
  }
  // 一键把片段时长设为预计耗时
  el.durationHint.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-setdur]");
    if (!btn) return;
    el.durationMsInput.value = btn.dataset.setdur;
    updateDurationHint();
  });

  function refreshAtomSelect() {
    const trackName = activeTrack;
    const atoms = atomsIndex.byTrack(trackName);
    el.atomSelect.innerHTML = atoms
      .map((a) => `<option value="${a.id}">${a.name}（${a.id}）</option>`)
      .join("");
    const isMotion = trackName === "motion";
    el.angleRow.style.display = isMotion ? "flex" : "none";
    el.coeffRow.style.display = isMotion ? "flex" : "none";
    el.lightRow.style.display = trackName === "ambientLight" ? "flex" : "none";
    if (!editing) el.addSegmentBtn.textContent = `+ 加入「${TRACK_SHORT[trackName]}」轨道`;
    if (isMotion) syncAngleField();
    updateFinalAngle();
    updateDurationHint();
  }

  // 某条轨道当前的结束时间（最后一个片段的末尾），用于"加片段默认接在末尾"
  function trackEnd(trackName) {
    return timeline.getTrack(trackName).reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0);
  }
  // 把开始时间默认填成该轨道末尾（追加模式）。编辑已有片段时不动。at 指定则用指定值（点空白定位）。
  function setStartDefault(at) {
    if (editing) return;
    const end = trackEnd(activeTrack);
    const val = at != null ? at : end;
    el.startMsInput.value = val;
    if (at != null) el.startHint.textContent = `已定位到 ${val}ms`;
    else el.startHint.textContent = end > 0 ? `默认接在末尾(${end}ms)` : "从 0 开始";
    updateDurationHint();
  }

  // "添加片段"面板：默认收起保持轻量。开关在时间线表头（播放按钮前面），
  // 点轨道空白处新增 / 点片段编辑时也会自动展开。
  function setAddCollapsed(collapsed) {
    el.addCard.classList.toggle("collapsed", collapsed);
    el.addToggle.setAttribute("aria-expanded", String(!collapsed));
    el.addToggle.classList.toggle("on", !collapsed);
    el.addToggle.textContent = collapsed ? "＋ 添加片段" : "－ 收起添加";
  }
  function ensureAddExpanded() { setAddCollapsed(false); }
  el.addToggle.addEventListener("click", () => {
    const willExpand = el.addCard.classList.contains("collapsed");
    setAddCollapsed(!willExpand);
    if (willExpand) el.addCard.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  });
  if (el.addCloseBtn) el.addCloseBtn.addEventListener("click", () => { exitEdit(); setAddCollapsed(true); });

  // 铺开的通道选择器：点 tab 切换 activeTrack，高亮对应 tab 和下方时间线轨道
  function selectTrack(trackName) {
    activeTrack = trackName;
    el.trackTabs.querySelectorAll(".track-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.track === trackName);
    });
    refreshAtomSelect();
    highlightActiveTrack();
    setStartDefault();
  }
  el.trackTabs.querySelectorAll(".track-tab").forEach((btn) => {
    btn.addEventListener("click", () => { exitEdit(); selectTrack(btn.dataset.track); });
  });

  el.atomSelect.addEventListener("change", () => {
    if (activeTrack === "motion") syncAngleField();
    updateFinalAngle();
    updateDurationHint();
  });
  el.angleInput.addEventListener("input", () => { updateFinalAngle(); updateDurationHint(); });
  el.coefAmp.addEventListener("input", () => { updateFinalAngle(); updateDurationHint(); });
  // 速率/重复/停留/时长都影响预计耗时
  [el.coefRate, el.coefRepeat, el.coefDwell, el.durationMsInput].forEach((inp) =>
    inp.addEventListener("input", updateDurationHint)
  );
  // 手动改开始时间 = 覆盖默认的"接在末尾"，清掉提示
  el.startMsInput.addEventListener("input", () => { if (!editing) el.startHint.textContent = ""; });
  refreshAtomSelect();
  setStartDefault();

  // 从表单读出一个片段对象（新建和保存修改共用）。onto: 可选，把字段写到已有片段上（保留其它字段）。
  function readSegmentFromForm(trackName, onto) {
    const atomId = el.atomSelect.value;
    const seg = onto || {};
    seg.atomId = atomId;
    seg.startMs = parseInt(el.startMsInput.value, 10) || 0;
    seg.durationMs = parseInt(el.durationMsInput.value, 10) || 500;
    // 每次都清掉可能残留的类型专属字段，再按当前轨道重写，避免改轨道后留下脏字段
    delete seg.coefficients; delete seg.angle;
    delete seg.color; delete seg.brightness; delete seg.periodMs; delete seg.intervalMs;
    if (trackName === "motion") {
      seg.coefficients = readCoeff();
      const ov = currentAngleOverride(); // 固定姿态原子输入框禁用时返回 null
      if (ov != null && isFinite(ov)) seg.angle = ov;
    }
    if (trackName === "ambientLight") {
      seg.color = el.lightColor.value;
      seg.brightness = parseInt(el.lightBrightness.value, 10) || 60;
      const period = parseInt(el.lightPeriod.value, 10);
      if (period > 0) seg[atomId === "LIGHT_STROBE" ? "intervalMs" : "periodMs"] = period;
    }
    return seg;
  }

  el.addSegmentBtn.addEventListener("click", () => {
    if (!el.atomSelect.value) return;
    try {
      if (editing) {
        // 保存修改：就地更新选中片段的字段，重排消重叠，保持选中
        readSegmentFromForm(editing.track, editing.seg);
        timeline.packTrack(editing.track);
        renderTracks();
        onChange();
        el.editNote.textContent = "已保存";
      } else {
        const segment = readSegmentFromForm(activeTrack);
        timeline.addSegment(activeTrack, segment);
        renderTracks();
        onChange();
        setStartDefault(); // 加完自动把开始时间推到新的末尾，便于连续追加
      }
    } catch (err) {
      el.ioNote.textContent = (editing ? "保存失败：" : "添加失败：") + err.message;
    }
  });

  // ---- 精细编辑：点时间线上的片段，把它载入表单改参数，"保存修改"就地更新 ----
  function enterEdit(track, seg) {
    editing = { track, seg };
    ensureAddExpanded(); // 编辑时展开表单
    // 切到该片段所在通道并填充字段（selectTrack 会刷新表单结构）
    selectTrack(track);
    el.atomSelect.value = seg.atomId;
    if (track === "motion") syncAngleField(); // 先按原子填默认，下面再覆盖为片段实际值
    el.startMsInput.value = seg.startMs;
    el.durationMsInput.value = seg.durationMs;
    if (track === "motion") {
      const c = seg.coefficients || {};
      el.coefRate.value = c.rate ?? 1;
      el.coefAmp.value = c.amplitude ?? 1;
      el.coefRepeat.value = c.repeat ?? 1;
      el.coefDwell.value = c.dwell ?? 1;
      if (seg.angle != null && !el.angleInput.disabled) el.angleInput.value = seg.angle;
    }
    if (track === "ambientLight") {
      if (seg.color) el.lightColor.value = seg.color;
      if (seg.brightness != null) el.lightBrightness.value = seg.brightness;
      el.lightPeriod.value = seg.periodMs || seg.intervalMs || "";
    }
    el.addSegmentBtn.textContent = "✓ 保存修改";
    el.cancelEditBtn.style.display = "";
    el.editNote.textContent = "编辑中";
    el.addForm.classList.add("editing");
    updateFinalAngle();
    updateDurationHint();
    renderTracks(); // 重画以高亮选中片段
    el.addForm.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }
  function exitEdit() {
    if (!editing) return;
    editing = null;
    el.addSegmentBtn.textContent = `+ 加入「${TRACK_SHORT[activeTrack]}」轨道`;
    el.cancelEditBtn.style.display = "none";
    el.editNote.textContent = "";
    el.addForm.classList.remove("editing");
    renderTracks();
  }
  el.cancelEditBtn.addEventListener("click", exitEdit);

  // 重叠片段分层：按开始时间贪心地放进第一条"不与已有片段重叠"的层。
  // 返回 Map<seg, laneIndex>；不重叠的轨道所有片段都落在第 0 层。
  function assignLanes(segs) {
    const lanes = new Map();
    const laneEnds = [];   // 每层当前的结束时间
    for (const seg of [...segs].sort((a, b) => a.startMs - b.startMs)) {
      let lane = laneEnds.findIndex((end) => seg.startMs >= end);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = seg.startMs + seg.durationMs;
      lanes.set(seg, lane);
    }
    return lanes;
  }

  // 某片段在它自己的时间范围内，有没有被后面的片段抢走某条轴
  function overriddenAxes(trackName, seg) {
    if (trackName !== "motion") return [];
    const all = timeline.getTrack("motion");
    const mine = new Set(axesOfAtom(atomsIndex.byId(seg.atomId)));
    if (!mine.size) return [];
    const taken = new Set();
    for (let i = all.indexOf(seg) + 1; i < all.length; i++) {
      const other = all[i];
      const overlaps = other.startMs < seg.startMs + seg.durationMs && seg.startMs < other.startMs + other.durationMs;
      if (!overlaps) continue;
      for (const ax of axesOfAtom(atomsIndex.byId(other.atomId))) if (mine.has(ax)) taken.add(ax);
    }
    return [...taken];
  }

  // 只切高亮，不重建 DOM（切换通道 tab 时用）
  function highlightActiveTrack() {
    el.tracksEl.querySelectorAll(".track").forEach((t) => {
      t.classList.toggle("active", t.dataset.track === activeTrack);
    });
  }

  // 片段的简短标签 + 完整参数 tooltip + 是否时长不足的警告。让每个参数在时间线上有清晰表达。
  function segmentInfo(trackName, seg, atom) {
    const name = atom ? atom.name : seg.atomId;
    const t0 = seg.startMs, t1 = seg.startMs + seg.durationMs;
    const lines = [`${name}（${seg.atomId}）`, `时间：${t0} ~ ${t1} ms（时长 ${seg.durationMs}ms）`];
    let label = name;
    let warn = false;

    if (trackName === "motion") {
      const c = seg.coefficients || {};
      const amp = c.amplitude ?? 1;
      const angleSet = seg.angle != null ? seg.angle : defaultAngleOf(atom);
      if (angleSet != null) {
        const range = atomsIndex.dofRangeOf(atom);
        const raw = angleSet * amp;
        const finalA = range ? clamp(raw, range.min, range.max) : raw;
        label += ` ${fmt(finalA)}°`;
        let aLine = `角度：${fmt(angleSet)}°${seg.angle == null ? "(默认)" : ""}`;
        if (amp !== 1) aLine += ` × 幅度${fmt(amp)} → ${fmt(raw)}°`;
        if (range && finalA !== raw) aLine += `（超范围，实际 ${fmt(finalA)}°）`;
        lines.push(aLine);
      }
      const reps = c.repeat ?? 1;
      if (reps > 1) label += ` ×${reps}`;
      lines.push(`速率×${fmt(c.rate ?? 1)}  幅度×${fmt(amp)}  重复×${reps}  停留×${fmt(c.dwell ?? 1)}`);
      const est = estimateAtomDurationMs(atom, c, atomsData, seg.angle != null ? seg.angle : null);
      if (est) {
        if (seg.durationMs >= est) {
          lines.push(`预计耗时 ≈ ${est}ms ✓ 够做完`);
        } else {
          warn = true;
          const pct = Math.max(0, Math.round((seg.durationMs / est) * 100));
          lines.push(`预计耗时 ≈ ${est}ms  ⚠ 时长不足，约完成 ${pct}%（建议 ≥ ${est}ms）`);
        }
      }
    } else if (trackName === "ambientLight") {
      if (seg.color) lines.push(`颜色 ${seg.color}  亮度 ${seg.brightness ?? "-"}`);
      const period = seg.periodMs || seg.intervalMs;
      if (period) lines.push(`周期 ${period}ms`);
    }
    // 动作轨可重叠：若这条片段的某条轴被同时段靠后的片段抢走，明确提示，避免"设了没生效"
    const AXIS_CN = { yaw: "旋转", pitch: "俯仰", roll: "歪头" };
    const lost = overriddenAxes(trackName, seg);
    if (lost.length) {
      warn = true;
      lines.push(`⚠ ${lost.map((a) => AXIS_CN[a] || a).join("/")} 轴被同时段靠后的片段接管，这条在该轴上不生效`);
    }
    return { label, title: lines.join("\n"), warn };
  }

  // 拖拽：左右拖动改开始时间(吸附100ms)，向下拖出删除。保留右上角 × 点击删除。
  const SNAP = 100, DELETE_DY = 46, DRAG_MIN = 3;
  function attachSegmentDrag(block, strip, seg, trackName, maxDuration) {
    block.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".del")) return; // × 走它自己的 click
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const stripW = strip.getBoundingClientRect().width;
      const origStart = seg.startMs;
      let moved = false, deleting = false, newStart = origStart;
      let tip = null;
      block.setPointerCapture(e.pointerId);
      block.classList.add("dragging");

      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) < DRAG_MIN && Math.abs(dy) < DRAG_MIN) return;
        moved = true;
        deleting = dy > DELETE_DY;
        block.classList.toggle("deleting", deleting);
        if (deleting) {
          if (tip) tip.textContent = "松手删除";
          return;
        }
        newStart = Math.max(0, Math.round((origStart + (dx / stripW) * maxDuration) / SNAP) * SNAP);
        block.style.left = (newStart / maxDuration) * 100 + "%";
        if (!tip) {
          tip = document.createElement("div");
          tip.className = "drag-tip";
          strip.appendChild(tip);
        }
        tip.style.left = (newStart / maxDuration) * 100 + "%";
        tip.textContent = `${newStart} ~ ${newStart + seg.durationMs}ms`;
      };
      const onUp = () => {
        block.releasePointerCapture(e.pointerId);
        block.removeEventListener("pointermove", onMove);
        block.removeEventListener("pointerup", onUp);
        if (tip) tip.remove();
        block.classList.remove("dragging", "deleting");
        if (!moved) {
          // 没拖动 = 单击：选中该片段进入精细编辑
          enterEdit(trackName, seg);
          return;
        }
        if (deleting) {
          if (editing && editing.seg === seg) exitEdit();
          const idx = timeline.getTrack(trackName).indexOf(seg);
          if (idx >= 0) timeline.removeSegment(trackName, idx);
        } else {
          seg.startMs = newStart;
          timeline.sortTrack(trackName);
        }
        renderTracks();
        onChange();
      };
      block.addEventListener("pointermove", onMove);
      block.addEventListener("pointerup", onUp);
    });
  }

  function renderTracks() {
    el.tracksEl.innerHTML = "";
    const maxDuration = timeline.getMaxDurationMs();
    for (const trackName of TRACK_NAMES) {
      const wrap = document.createElement("div");
      wrap.className = "track";
      wrap.dataset.track = trackName;
      if (trackName === activeTrack) wrap.classList.add("active");
      const label = document.createElement("div");
      label.className = "track-label";
      const segs = timeline.getTrack(trackName);
      label.innerHTML = `<span>${TRACK_LABELS[trackName]}</span><span>${segs.length} 个片段</span>`;
      wrap.appendChild(label);

      const strip = document.createElement("div");
      strip.className = "track-strip";
      strip.dataset.track = trackName;
      // 点轨道空白处：把新片段定位到那个时间（切到该轨道 + 填开始时间 + 滚到表单）
      strip.addEventListener("click", (e) => {
        if (e.target !== strip && !e.target.classList.contains("empty-track")) return; // 只响应空白
        const rect = strip.getBoundingClientRect();
        const t = Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * maxDuration / 100) * 100);
        exitEdit();
        ensureAddExpanded();
        selectTrack(trackName);
        setStartDefault(t);
        el.addForm.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        el.atomSelect.focus();
      });
      // 动作轨允许重叠 → 把重叠的片段分层摆开（贪心：放进第一条不冲突的层），
      // 否则它们会叠在一起互相盖住看不清。其余轨道不重叠，永远只有 1 层。
      const lanes = assignLanes(segs);
      const laneCount = Math.max(1, ...lanes.values(), 0) + 1;
      if (laneCount > 1) strip.style.height = 8 + laneCount * 32 + "px";

      if (segs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-track";
        empty.textContent = "（空）";
        strip.appendChild(empty);
      } else {
        segs.forEach((seg, i) => {
          const atom = atomsIndex.byId(seg.atomId);
          const info = segmentInfo(trackName, seg, atom);
          const block = document.createElement("div");
          const isSel = editing && editing.seg === seg;
          block.className = "segment" + (info.warn ? " warn" : "") + (isSel ? " selected" : "");
          block.style.left = (seg.startMs / maxDuration) * 100 + "%";
          block.style.width = Math.max((seg.durationMs / maxDuration) * 100, 3) + "%";
          if (laneCount > 1) {
            const lane = lanes.get(seg) || 0;
            block.style.top = 4 + lane * 32 + "px";
            block.style.bottom = "auto";
            block.style.height = "28px";
          }
          block.title = info.title;
          const text = document.createElement("span");
          text.className = "seg-text";
          text.textContent = info.label;
          block.appendChild(text);
          if (info.warn) {
            const w = document.createElement("span");
            w.className = "seg-warn";
            w.textContent = "⚠";
            block.appendChild(w);
          }
          const del = document.createElement("span");
          del.className = "del";
          del.textContent = "×";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            if (editing && editing.seg === seg) exitEdit();
            timeline.removeSegment(trackName, i);
            renderTracks();
            onChange();
          });
          block.appendChild(del);
          attachSegmentDrag(block, strip, seg, trackName, maxDuration);
          strip.appendChild(block);
        });
      }

      const playhead = document.createElement("div");
      playhead.className = "playhead";
      playhead.style.left = "0%";
      playhead.dataset.role = "playhead";
      strip.appendChild(playhead);

      wrap.appendChild(strip);
      el.tracksEl.appendChild(wrap);
    }
    el.scrubber.max = String(maxDuration);
    updatePlayheads(player.elapsedMs, maxDuration);
  }

  function updatePlayheads(elapsedMs, maxDuration) {
    const pct = maxDuration > 0 ? (elapsedMs / maxDuration) * 100 : 0;
    el.tracksEl.querySelectorAll('[data-role="playhead"]').forEach((ph) => {
      ph.style.left = pct + "%";
    });
    el.timeLabel.textContent = `${Math.round(elapsedMs)} / ${Math.round(maxDuration)} ms`;
    el.scrubber.value = String(Math.round(elapsedMs));
    syncTransport();
  }

  // 播放/暂停/停止三个按钮的可用状态与文案，跟着 player 的真实状态走。
  // 每帧都会调（updatePlayheads 里），所以播放自然放到末尾停下时按钮也会自动复位。
  function syncTransport() {
    const playing = player.playing;
    const paused = !playing && player.elapsedMs > 0;
    el.pauseBtn.disabled = !playing;
    el.playBtn.disabled = playing;
    // 暂停在中途时，播放按钮提示是"继续"而不是从头播
    el.playBtn.textContent = paused ? "▶ 继续" : "▶ 播放";
    el.playBtn.classList.toggle("paused", paused);
  }

  el.playBtn.addEventListener("click", () => {
    // 已经播到末尾再点播放：从头开始，否则点了没反应
    if (player.elapsedMs >= player.timeline.getMaxDurationMs()) player.seek(0);
    player.play();
    syncTransport();
  });
  el.pauseBtn.addEventListener("click", () => {
    player.pause();
    syncTransport();
  });
  el.stopBtn.addEventListener("click", () => player.stop());
  el.scrubber.addEventListener("input", () => player.seek(parseInt(el.scrubber.value, 10)));

  el.exportBtn.addEventListener("click", () => {
    const data = JSON.stringify(timeline.toJSON(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // 文件名用「编排名-日期」而不是 combo_1712345678，下载文件夹里好找
    const fileName = exportFileName(timeline.sequence.name);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    el.ioNote.textContent = "已导出 " + fileName;
  });

  el.importInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      timeline.sequence = timeline.constructor.fromJSON(obj).sequence;
      exitEdit();
      renderTracks();
      setStartDefault();
      onChange();
      el.ioNote.textContent = "已导入 " + (obj.name || file.name);
    } catch (err) {
      el.ioNote.textContent = "导入失败：" + err.message;
    }
    e.target.value = "";
  });

  return { renderTracks, updatePlayheads, el, enterEdit, exitEdit, setStartDefault };
}
