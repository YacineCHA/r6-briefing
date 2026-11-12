import { MAPS, ROLE, SWAPS, SQUAD_TIPS, SEASON, SITE_ROOMS } from "./data.js";
import { ROOMS } from "./rooms.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FLOORS = ["3F", "2F", "1F", "B"];
const FLOOR_FR = { R: "toit", "3F": "2e étage", "2F": "1er étage", "1F": "Rez", "B": "Sous-sol" };
const MAX = 5;

// Une « soirée » va de 6 h à 6 h : la liste se vide d'elle-même le lendemain.
function nightKey() {
  const d = new Date(Date.now() - 6 * 3600e3);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const uid = () => Math.random().toString(36).slice(2, 10);
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16);

const st = {
  side: ls.get("r6-side", "atk") === "def" ? "def" : "atk",
  q: "", open: null, sel: {}, banned: {}, shift: 0, floor: {}, mode: ls.get("r6-mode", "3d") === "plan" ? "plan" : "3d",
  roster: [], mine: ls.get("r6-mine", []), live: false
};

/* ---------- Stockage de l'équipe ---------- */
let store;

function localStore() {
  const key = "r6-roster-" + nightKey();
  let list = ls.get(key, []);
  const fromUrl = new URLSearchParams(location.search).get("squad");
  if (fromUrl) {
    list = fromUrl.split(",").map(cleanName).filter(Boolean).slice(0, 10).map((name, i) => ({ id: uid(), name, ts: Date.now() + i }));
    ls.set(key, list);
  }
  let cb = () => {};
  const save = () => { ls.set(key, list); cb(list.slice()); };
  return {
    live: false,
    subscribe(f) { cb = f; f(list.slice()); },
    add(name) { const p = { id: uid(), name, ts: Date.now() }; list.push(p); save(); return p.id; },
    remove(id) { list = list.filter((p) => p.id !== id); save(); },
    clear() { list = []; save(); }
  };
}

async function firebaseStore(cfg) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const { initializeApp } = await import(base + "firebase-app.js");
  const { getDatabase, ref, onValue, set, remove } = await import(base + "firebase-database.js");
  const db = getDatabase(initializeApp(cfg));
  const path = "squad/" + nightKey();
  return {
    live: true,
    subscribe(f) {
      onValue(ref(db, path), (snap) => {
        const v = snap.val() || {};
        f(Object.keys(v).map((id) => ({ id, name: cleanName(v[id].name), ts: +v[id].ts || 0 })).filter((p) => p.name));
      }, () => toast("Connexion à la base refusée : vérifie les règles Firebase."));
    },
    add(name) { const id = uid(); set(ref(db, path + "/" + id), { name, ts: Date.now() }); return id; },
    remove(id) { remove(ref(db, path + "/" + id)); },
    clear() { remove(ref(db, path)); }
  };
}

async function initStore() {
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) {
    try { store = await firebaseStore(FIREBASE_CONFIG); }
    catch (e) { console.error(e); store = localStore(); toast("Firebase injoignable, passage en mode local."); }
  } else store = localStore();
  st.live = store.live;
  $("share").hidden = store.live;
  $("sync").textContent = store.live ? "Synchro en direct" : "Mode local : partage le lien";
  $("sync").classList.toggle("live", store.live);
  store.subscribe((list) => {
    st.roster = list.sort((a, b) => a.ts - b.ts);
    renderSquad();
    if (st.open) renderDialog();
  });
}

/* ---------- Équipe ---------- */
const players = () => st.roster.slice(0, MAX);
const count = () => players().length;

function renderSquad() {
  $("count").textContent = count();
  const ul = $("roster");
  if (!st.roster.length) { ul.innerHTML = '<li class="empty">Personne pour l\'instant. Tape ton pseudo et clique « Je joue ».</li>'; return; }
  ul.innerHTML = st.roster.map((p, i) =>
    `<li class="${st.mine.includes(p.id) ? "me" : ""}${i >= MAX ? " bench" : ""}">${esc(p.name)}${i >= MAX ? " <small>remplaçant</small>" : ""}` +
    `<button data-rm="${esc(p.id)}" aria-label="Retirer ${esc(p.name)}" title="Retirer">✕</button></li>`).join("");
}

$("join").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = cleanName($("pseudo").value);
  if (!name) return;
  if (st.roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast(name + " est déjà inscrit."); return; }
  const id = store.add(name);
  st.mine = [...st.mine, id].slice(-10); ls.set("r6-mine", st.mine); ls.set("r6-pseudo", name);
  $("pseudo").value = "";
  toast(st.roster.length >= MAX ? name + " ajouté en remplaçant." : "C'est noté, " + name + " !");
});
$("pseudo").value = ls.get("r6-pseudo", "");
$("roster").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rm]"); if (b) store.remove(b.dataset.rm);
});
$("reset").addEventListener("click", () => {
  if (!st.roster.length) return;
  if (confirm("Vider la liste des joueurs de ce soir pour tout le monde ?")) store.clear();
});
$("share").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("squad", st.roster.map((p) => p.name).join(","));
  try { await navigator.clipboard.writeText(url.toString()); toast("Lien copié : colle-le sur Discord."); }
  catch { prompt("Copie ce lien :", url.toString()); }
});

/* ---------- Camp et recherche ---------- */
function setSide(s) {
  st.side = s; ls.set("r6-side", s);
  document.body.dataset.side = s;
  document.querySelectorAll(".seg [data-side]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === s)));
  renderGrid();
  if (st.open) renderDialog();
}
document.querySelectorAll(".seg [data-side]").forEach((b) => b.addEventListener("click", () => setSide(b.dataset.side)));
$("q").addEventListener("input", (e) => { st.q = e.target.value; renderGrid(); });

/* ---------- Grille ---------- */
const floorsOf = (m) => FLOORS.filter((f) => m.sites.some((s) => s.f === f));
const ops = (list, cls, extra = "") => list.map((o, i) => `<span class="op ${cls} ${extra}" style="--i:${i}">${esc(o)}</span>`).join("");

function ourBans(m) {
  // En attaque on bannit un défenseur, en défense un attaquant.
  return st.side === "atk"
    ? { label: "Défenseurs à bannir", list: m.bd, cls: "d" }
    : { label: "Attaquants à bannir", list: m.ba, cls: "a" };
}

function miniStack(m) {
  const fl = floorsOf(m).slice().reverse();
  return `<div class="mini" aria-hidden="true"><div class="mini-rot">${fl.map((f, i) =>
    `<div class="mini-slab ${f === "B" ? "b" : ""}" style="--l:${i}"></div>`).join("")}</div></div>`;
}

function visible() {
  const q = st.q.trim().toLowerCase();
  if (!q) return MAPS;
  return MAPS.filter((m) => (m.name + " " + m.fr).toLowerCase().includes(q) || m.sites.some((s) => s.n.toLowerCase().includes(q)) ||
    (ROOMS[m.id] && ROOMS[m.id].floors.some((f) => f.r.some((r) => (r[0] + " " + r[3]).toLowerCase().includes(q)))));
}

function renderGrid() {
  const v = visible();
  $("mapcount").textContent = v.length + " / " + MAPS.length + " maps";
  $("grid").innerHTML = v.length ? v.map((m, i) => {
    const b = ourBans(m);
    return `<button class="card" data-map="${m.id}" style="--i:${i}" aria-label="Ouvrir ${esc(m.name)}">
      <div class="card-head"><div><h2 class="card-name">${esc(m.name)}</h2><span class="card-fr">${esc(m.fr)} · ${m.sites.length} sites · ${ROOMS[m.id] ? ROOMS[m.id].floors.reduce((n, f) => n + f.r.length, 0) : 0} pièces</span></div>${m.chk ? '<span class="tag">à vérifier</span>' : ""}</div>
      <div class="card-body">${miniStack(m)}<div><div class="bl">${b.label}</div><div class="ops">${ops(b.list, b.cls, "ban")}</div></div></div>
    </button>`;
  }).join("") : '<p class="empty">Aucune map ne correspond.</p>';
}

$("grid").addEventListener("click", (e) => { const c = e.target.closest("[data-map]"); if (c) openMap(c.dataset.map); });

// Inclinaison 3D des cartes sous la souris
if (!reduced && matchMedia("(hover: hover)").matches) {
  $("grid").addEventListener("pointermove", (e) => {
    const c = e.target.closest(".card"); if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty("--ry", ((x - .5) * 12).toFixed(2) + "deg");
    c.style.setProperty("--rx", ((.5 - y) * 10).toFixed(2) + "deg");
    c.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    c.style.setProperty("--my", (y * 100).toFixed(1) + "%");
  });
  $("grid").addEventListener("pointerout", (e) => {
    const c = e.target.closest(".card");
    if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
  });
}

/* ---------- Détail d'une map ---------- */
const dlg = $("dlg");
let view = { tx: 58, tz: -35 };

function openMap(id) {
  st.open = id;
  history.replaceState(null, "", "#" + id);
  renderDialog();
  if (!dlg.open) dlg.showModal();
}
function closeMap() {
  st.open = null;
  history.replaceState(null, "", location.pathname + location.search);
  if (dlg.open) dlg.close();
}
dlg.addEventListener("close", () => { if (st.open) { st.open = null; history.replaceState(null, "", location.pathname + location.search); } });
dlg.addEventListener("click", (e) => { if (e.target === dlg) closeMap(); });

function swapFor(op, comp, banned) {
  return (SWAPS[op] || []).find((o) => !comp.includes(o) && !banned.includes(o)) || null;
}

function composition(m, s) {
  const comp = st.side === "atk" ? s.a : s.d;
  const banned = st.banned[m.id] || [];
  const final = comp.map((o) => banned.includes(o) ? { o, ban: true, rep: swapFor(o, comp, banned) } : { o });
  const ps = players();
  const n = ps.length;
  const rows = final.map((x, i) => {
    let who, extra = false;
    if (n === 0) who = `<span class="who">Joueur ${i + 1}<small>personne d'inscrit</small></span>`;
    else if (i < n) { const p = ps[(i + st.shift) % n]; who = `<span class="who">${esc(p.name)}<small>${i === 0 ? "priorité 1" : "priorité " + (i + 1)}</small></span>`; }
    else { extra = true; who = `<span class="who">Random<small>à suggérer dans le chat</small></span>`; }
    const name = x.ban ? `<s>${esc(x.o)}</s> → ${esc(x.rep || "au choix")}` : esc(x.o);
    const role = ROLE[x.ban ? x.rep : x.o] || ROLE[x.o] || "";
    return `<li class="${extra ? "extra" : ""}" style="--i:${i}">${who}<button class="opbtn ${x.ban ? "banned" : ""}" data-ban="${esc(x.o)}" title="Marquer comme banni par l'adversaire">${name}<small>${esc(role)}</small></button></li>`;
  }).join("");
  const tipN = Math.max(1, Math.min(n || MAX, MAX));
  return { rows, tip: SQUAD_TIPS[tipN][st.side], n };
}

const FLOOR_ORDER = ["R", "3F", "2F", "1F", "B"];
const FLOOR_LBL = { R: "Toit", "3F": "3F", "2F": "2F", "1F": "1F", B: "Sous-sol" };
const planFloors = (m) => (ROOMS[m.id] ? ROOMS[m.id].floors : []).slice().sort((a, b) => FLOOR_ORDER.indexOf(a.f) - FLOOR_ORDER.indexOf(b.f));

// Classe d'une pièce : « cur » si elle fait partie du site choisi, « obj » si c'est un autre site.
function roomCls(m, sel, floor, name) {
  const lists = SITE_ROOMS[m.id] || [];
  const R = planFloors(m);
  const onFloor = (k) => {
    const sf = m.sites[k].f;
    const there = R.find((f) => f.f === sf);
    return floor === sf || !(there && there.r.some((r) => r[0] === name));
  };
  if ((lists[sel] || []).includes(name) && onFloor(sel)) return "cur";
  if (lists.some((l, k) => k !== sel && l.includes(name) && onFloor(k))) return "obj";
  return "";
}

function roomLabels(m, sel, fl, small) {
  const nopos = ROOMS[m.id] && ROOMS[m.id].nopos;
  if (nopos) return `<div class="nopos">${fl.r.map((r) => `<span class="chipr ${roomCls(m, sel, fl.f, r[0])}">${esc(r[0])}</span>`).join("")}</div>`;
  return fl.r.map((r) => {
    const c = roomCls(m, sel, fl.f, r[0]);
    if (small && !c) return `<i class="dot" style="left:${r[1]}%;top:${r[2]}%"></i>`;
    return `<span class="pl ${c}" style="left:${r[1]}%;top:${r[2]}%"${r[3] ? ` title="${esc(r[3])}"` : ""}>${esc(r[0])}</span>`;
  }).join("");
}

function stack3d(m, sel) {
  const s = m.sites[sel];
  const fls = planFloors(m).filter((f) => f.f !== "R").reverse();
  const hot = new Set([s.f, ...fls.filter((f) => f.r.some((r) => roomCls(m, sel, f.f, r[0]) === "cur")).map((f) => f.f)]);
  const ar = fls.length ? fls[0].ar : 1;
  const W = Math.round(Math.min(270, 270 * Math.sqrt(ar)));
  const H = Math.round(W / ar);
  return `<div class="stage" id="stage" aria-label="Schéma 3D des étages : glisse pour tourner, touche un étage pour l'ouvrir">
    <div class="rot" id="rot" style="--tx:${view.tx}deg;--tz:${view.tz}deg;width:${W}px;height:${H}px;margin:${-H / 2}px 0 0 ${-W / 2}px">
      ${fls.map((fl, l) => `<div class="slab ${fl.f === "B" ? "b" : ""} ${hot.has(fl.f) ? "hot" : "dim"}" style="--l:${l}" data-floor="${fl.f}">
          <div class="slab-floor"></div><div class="slab-edge"></div><span class="slab-label">${fl.f}</span>
          <div class="rooms">${roomLabels(m, sel, fl, true)}</div>
        </div>`).join("")}
    </div>
    <span class="stage-hint">Glisse pour tourner · touche un étage pour voir toutes ses pièces</span>
  </div>`;
}

function flatPlan(m, sel) {
  const fls = planFloors(m);
  const cur = fls.find((f) => f.f === st.floor[m.id]) || fls.find((f) => f.f === m.sites[sel].f) || fls[0];
  if (!cur) return "";
  const nopos = ROOMS[m.id].nopos;
  const list = cur.r.slice().sort((a, b) => a[0].localeCompare(b[0]))
    .map((r) => `<li class="${roomCls(m, sel, cur.f, r[0])}">${esc(r[0])}${r[3] ? `<small>${esc(r[3])}</small>` : ""}</li>`).join("");
  return `<div class="floortabs" role="tablist" aria-label="Étages">${fls.map((f) =>
      `<button role="tab" data-floor="${f.f}" aria-selected="${f.f === cur.f}">${FLOOR_LBL[f.f]}<small>${f.r.length}</small></button>`).join("")}</div>
    ${nopos ? `<div class="planbox">${roomLabels(m, sel, cur, false)}</div>` :
      `<div class="planscroll"><div class="plan" style="aspect-ratio:${cur.ar}">${roomLabels(m, sel, cur, false)}</div></div>`}
    <div class="legend"><span class="lg cur">Site choisi</span><span class="lg obj">Autres sites</span><span class="lg">Pièce</span>${nopos ? "" : "<span>Positions d'après le plan officiel, glisse pour voir tout l'étage sur téléphone.</span>"}</div>
    <details class="roomlist"><summary>Toutes les pièces du ${esc(FLOOR_LBL[cur.f])} (${cur.r.length})</summary><ul>${list}</ul></details>`;
}

function renderDialog() {
  const m = MAPS.find((x) => x.id === st.open); if (!m) return;
  const sel = st.sel[m.id] || 0, s = m.sites[sel];
  const c = composition(m, s);
  const sideLbl = st.side === "atk" ? "Attaque" : "Défense";
  const strat = st.side === "atk" ? m.atk : m.def;
  const sitelist = FLOOR_ORDER.flatMap((f) => m.sites.map((x, k) => ({ x, k })).filter((o) => o.x.f === f))
    .map((o) => `<button class="sitebtn" data-site="${o.k}" aria-pressed="${o.k === sel}"><b>${o.x.f}</b>${esc(o.x.n)}</button>`).join("");
  const mode = st.mode;
  $("dlg-inner").innerHTML = `
    <div class="dlg-head">
      <div><h2 id="dlg-title">${esc(m.name)}</h2><span class="card-fr">${esc(m.fr)}</span></div>
      <div class="dlg-tools">
        <div class="seg" role="group" aria-label="Camp">
          <button class="a" data-dside="atk" aria-pressed="${st.side === "atk"}">Attaque</button>
          <button class="d" data-dside="def" aria-pressed="${st.side === "def"}">Défense</button>
        </div>
        <button class="close" id="close" aria-label="Fermer">✕</button>
      </div>
    </div>
    <p class="blurb">${esc(m.blurb)}</p>
    ${m.chk ? `<p class="note"><b>À vérifier.</b> ${esc(m.chk)}</p>` : ""}
    <p class="links"><a href="https://www.ubisoft.com/fr-fr/game/rainbow-six/siege/game-info/maps/${m.ubi}" target="_blank" rel="noopener">Plans officiels (Ubisoft)</a><a href="https://r6calls.com" target="_blank" rel="noopener">Callouts (r6calls)</a></p>
    <div class="sitelist" role="group" aria-label="Sites">${sitelist}</div>
    <div class="viewbar">
      <div class="seg mode" role="group" aria-label="Vue">
        <button class="b" data-mode="3d" aria-pressed="${mode === "3d"}">Vue 3D</button>
        <button class="b" data-mode="plan" aria-pressed="${mode === "plan"}">Plan par étage</button>
      </div>
      <h3 class="sitename">${esc(s.n)}<small>${s.f} · ${FLOOR_FR[s.f]}</small></h3>
    </div>
    ${s.x ? `<p class="x">${esc(s.x)}</p>` : ""}
    <div class="mapview">${mode === "3d" ? stack3d(m, sel) : flatPlan(m, sel)}</div>
    <div class="dlg-grid">
      <div class="panel">
        <div class="box side">
          <h4>Compo ${sideLbl.toLowerCase()} · ${c.n || "?"} joueur${c.n > 1 ? "s" : ""}</h4>
          <p class="tip">${esc(c.tip)}</p>
          <ul class="assign">${c.rows}</ul>
          <p class="helper">Touche un opérateur s'il est banni : le site propose un remplaçant.</p>
          <div class="row-actions">
            ${c.n > 1 ? '<button class="btn ghost" id="shuffle">Échanger les rôles</button>' : ""}
            ${(st.banned[m.id] || []).length ? '<button class="btn ghost" id="unban">Annuler les bans</button>' : ""}
          </div>
        </div>
      </div>
      <div>
        <div class="box">
          <h4>Strat ${sideLbl.toLowerCase()}</h4>
          <ol class="strat">${strat.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        </div>
        <div class="box">
          <h4>Bans · ${sideLbl}</h4>
          <div class="bans2">
            <div><div class="bl">${st.side === "atk" ? "On bannit (défenseur)" : "On bannit (attaquant)"}</div><div class="ops">${ops(st.side === "atk" ? m.bd : m.ba, st.side === "atk" ? "d" : "a", "ban")}</div></div>
            <div><div class="bl">Eux risquent de bannir</div><div class="ops">${ops(st.side === "atk" ? m.ba : m.bd, st.side === "atk" ? "a" : "d")}</div></div>
          </div>
        </div>
      </div>
    </div>`;
  bindStage();
}

$("dlg-inner").addEventListener("click", (e) => {
  const m = MAPS.find((x) => x.id === st.open); if (!m) return;
  if (e.target.closest("#close")) return closeMap();
  const ds = e.target.closest("[data-dside]"); if (ds) return setSide(ds.dataset.dside);
  if (e.target.closest("#shuffle")) { st.shift++; return renderDialog(); }
  if (e.target.closest("#unban")) { st.banned[m.id] = []; return renderDialog(); }
  const md = e.target.closest("[data-mode]"); if (md) { st.mode = md.dataset.mode; ls.set("r6-mode", st.mode); return renderDialog(); }
  const fl = e.target.closest("[data-floor]");
  if (fl && !dragged) { st.floor[m.id] = fl.dataset.floor; st.mode = "plan"; return renderDialog(); }
  const site = e.target.closest("[data-site]");
  if (site) { st.sel[m.id] = +site.dataset.site; st.floor[m.id] = m.sites[+site.dataset.site].f; return renderDialog(); }
  const b = e.target.closest("[data-ban]");
  if (b) {
    const list = st.banned[m.id] || [], o = b.dataset.ban;
    st.banned[m.id] = list.includes(o) ? list.filter((x) => x !== o) : [...list, o];
    renderDialog();
  }
});

// Rotation de la pile 3D au glisser (souris ou doigt)
let dragged = false;
function bindStage() {
  const stage = $("stage"), rot = $("rot"); if (!stage) return;
  let start = null;
  stage.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, tx: view.tx, tz: view.tz }; dragged = false; });
  stage.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    if (!dragged) { dragged = true; try { stage.setPointerCapture(e.pointerId); } catch {} }
    view.tz = start.tz - dx * 0.4;
    view.tx = Math.max(20, Math.min(78, start.tx - dy * 0.3));
    rot.style.setProperty("--tz", view.tz + "deg");
    rot.style.setProperty("--tx", view.tx + "deg");
  });
  const end = () => { start = null; setTimeout(() => { dragged = false; }, 0); };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
}

/* ---------- Divers ---------- */
let tt;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 2600);
}

$("season").textContent = SEASON.code;
$("season2").textContent = SEASON.code + " (" + SEASON.name + ")";
$("season-name").textContent = SEASON.name;
setSide(st.side);
renderSquad();
initStore();
const h = location.hash.slice(1);
if (MAPS.some((m) => m.id === h)) openMap(h);
