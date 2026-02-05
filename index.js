const $ = s => document.querySelector(s);
const KEY="habits_v2";
const PREF="habits_pref_v1";

function localDayKey(d = new Date()){
  // timezone-safe YYYY-MM-DD based on local date, not UTC
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function daysBetweenLocal(a,b){
  // treat keys as local dates (no timezone surprises)
  const [ay,am,ad]=a.split("-").map(Number);
  const [by,bm,bd]=b.split("-").map(Number);
  const A = new Date(ay, am-1, ad, 12,0,0);
  const B = new Date(by, bm-1, bd, 12,0,0);
  return Math.round((B-A)/(1000*60*60*24));
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

let todayKey = localDayKey();
$("#today").textContent = "Today: " + todayKey;

let habits = JSON.parse(localStorage.getItem(KEY) || "[]");
let pref = JSON.parse(localStorage.getItem(PREF) || '{"sort":"created"}');

function save(){
  localStorage.setItem(KEY, JSON.stringify(habits));
}
function savePref(){
  localStorage.setItem(PREF, JSON.stringify(pref));
}

function getSortedHabits(){
  const arr = [...habits];
  const sort = pref.sort || "created";

  const checked = h => h.lastCheck === todayKey;

  if(sort === "name"){
    arr.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  }else if(sort === "streak"){
    arr.sort((a,b)=> (b.streak||0) - (a.streak||0));
  }else if(sort === "last"){
    arr.sort((a,b)=> (b.lastCheck||"").localeCompare(a.lastCheck||""));
  }else if(sort === "today"){
    arr.sort((a,b)=> (checked(b) - checked(a)) || ((b.streak||0)-(a.streak||0)));
  }else{
    // created/newest: we keep insertion order; newest at top (unshift does that)
  }
  return arr;
}

function updateRing(done,total){
  const pct = total ? Math.round((done/total)*100) : 0;
  $("#ring").style.setProperty("--p", pct + "%");
  $("#ringText").textContent = pct + "%";
}

function render(){
  const list=$("#list");
  list.innerHTML="";
  let done=0;

  const sorted = getSortedHabits();

  sorted.forEach(h=>{
    const checkedToday = h.lastCheck === todayKey;
    if(checkedToday) done++;

    const el=document.createElement("div");
    el.className="habit " + (checkedToday ? "ok" : "");

    el.innerHTML = `
      <div style="min-width:220px">
        <div class="name">${escapeHtml(h.name)}</div>
        <div class="meta">
          Streak: <b>${h.streak||0}</b> • Best: <b>${h.best||0}</b> • Last: ${h.lastCheck||"—"}
        </div>
      </div>
      <div class="right">
        <button class="tiny ${checkedToday ? "" : "primary"}" data-act="check">Check-in</button>
        <button class="tiny" data-act="edit">Edit</button>
        <button class="tiny" data-act="reset">Reset</button>
        <button class="tiny" data-act="del">Delete</button>
      </div>
    `;

    el.querySelectorAll("button").forEach(btn=>{
      btn.onclick=()=>{
        const act=btn.dataset.act;
        if(act==="check") checkIn(h.id);
        if(act==="edit") editHabit(h.id);
        if(act==="reset") resetHabit(h.id);
        if(act==="del") delHabit(h.id);
      };
    });
    list.appendChild(el);
  });

  $("#totalPill").textContent = "Habits: " + habits.length;
  $("#donePill").textContent = "Checked today: " + done;
  $("#bestPill").textContent = "Best streak: " + (habits.length ? Math.max(...habits.map(x=>x.best||0)) : 0);

  updateRing(done, habits.length);
}

function addHabit(){
  const name=$("#habitName").value.trim();
  if(!name) return;
  habits.unshift({
    id: crypto.randomUUID(),
    name,
    streak: 0,
    best: 0,
    lastCheck: null,
    createdAt: Date.now()
  });
  $("#habitName").value="";
  save(); render();
}

function checkIn(id){
  const h=habits.find(x=>x.id===id);
  if(!h) return;

  if(h.lastCheck === todayKey) return;

  if(!h.lastCheck){
    h.streak = 1;
  }else{
    const gap = daysBetweenLocal(h.lastCheck, todayKey);
    h.streak = (gap===1) ? ((h.streak||0) + 1) : 1;
  }
  h.best = Math.max(h.best||0, h.streak);
  h.lastCheck = todayKey;

  save(); render();
}

function resetHabit(id){
  const h=habits.find(x=>x.id===id);
  if(!h) return;
  h.streak = 0;
  h.lastCheck = null;
  save(); render();
}

function editHabit(id){
  const h=habits.find(x=>x.id===id);
  if(!h) return;
  const next = prompt("Edit habit name:", h.name || "");
  if(next === null) return;
  const name = next.trim();
  if(!name) return;
  h.name = name;
  save(); render();
}

/* Undo delete */
let undoTimer = null;
let lastDeleted = null;

function showSnack(message, onUndo){
  $("#snackMsg").innerHTML = message;
  $("#snack").classList.add("show");

  $("#undoBtn").onclick = () => {
    hideSnack();
    if(onUndo) onUndo();
  };
  $("#closeSnack").onclick = hideSnack;

  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideSnack, 5000);
}
function hideSnack(){
  $("#snack").classList.remove("show");
  clearTimeout(undoTimer);
  undoTimer = null;
}

function delHabit(id){
  const idx = habits.findIndex(x=>x.id===id);
  if(idx === -1) return;

  lastDeleted = { item: habits[idx], index: idx };
  habits.splice(idx,1);

  save(); render();

  showSnack(`Deleted <b>${escapeHtml(lastDeleted.item.name)}</b>.`, () => {
    if(!lastDeleted) return;
    habits.splice(lastDeleted.index, 0, lastDeleted.item);
    lastDeleted = null;
    save(); render();
  });
}

/* CSV export/import */
function toCSV(){
  const header = ["id","name","streak","best","lastCheck","createdAt"];
  const rows = habits.map(h => [
    h.id,
    (h.name||"").replaceAll('"','""'),
    h.streak||0,
    h.best||0,
    h.lastCheck||"",
    h.createdAt||""
  ]);
  const lines = [
    header.join(","),
    ...rows.map(r => `${r[0]},"${r[1]}",${r[2]},${r[3]},${r[4]},${r[5]}`)
  ];
  return lines.join("\n");
}
function download(filename, text){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"text/csv"}));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function parseCSV(text){
  // Simple CSV parse for our schema (handles quoted habit name)
  const lines = text.trim().split(/\r?\n/);
  if(lines.length < 2) return [];

  const out = [];
  for(let i=1;i<lines.length;i++){
    const line = lines[i].trim();
    if(!line) continue;

    // id,"name",streak,best,lastCheck,createdAt
    // Split first by commas, but keep quoted name intact
    const firstComma = line.indexOf(",");
    const id = line.slice(0, firstComma);

    const rest = line.slice(firstComma+1);
    const match = rest.match(/^"((?:[^"]|"")*)",([^,]*),([^,]*),([^,]*),([^,]*)$/);
    if(!match) continue;

    const name = match[1].replaceAll('""','"');
    const streak = Number(match[2] || 0);
    const best = Number(match[3] || 0);
    const lastCheck = (match[4] || "").trim() || null;
    const createdAt = Number(match[5] || Date.now());

    out.push({
      id: id || crypto.randomUUID(),
      name,
      streak: Number.isFinite(streak) ? streak : 0,
      best: Number.isFinite(best) ? best : 0,
      lastCheck,
      createdAt
    });
  }
  return out;
}

/* Midnight rollover (tab can stay open) */
function syncToday(){
  const nowKey = localDayKey();
  if(nowKey !== todayKey){
    todayKey = nowKey;
    $("#today").textContent = "Today: " + todayKey;
    render();
  }
}
setInterval(syncToday, 20_000);

/* Wiring */
$("#addBtn").onclick = addHabit;
$("#habitName").addEventListener("keydown", e=>{ if(e.key==="Enter") addHabit(); });

$("#sortSel").value = pref.sort || "created";
$("#sortSel").onchange = () => {
  pref.sort = $("#sortSel").value;
  savePref();
  render();
};

$("#exportBtn").onclick = () => {
  const csv = toCSV();
  const fname = `habits-backup-${todayKey}.csv`;
  download(fname, csv);
};

$("#importBtn").onclick = () => $("#file").click();
$("#file").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const text = await f.text();
  const incoming = parseCSV(text);

  if(!incoming.length){
    showSnack("Import failed. CSV format not recognized.", null);
    e.target.value="";
    return;
  }

  // merge by id (incoming overwrites)
  const map = new Map(habits.map(h => [h.id, h]));
  incoming.forEach(h => map.set(h.id, h));
  habits = Array.from(map.values()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  save(); render();
  showSnack(`Imported <b>${incoming.length}</b> habit(s).`, null);
  e.target.value="";
});

render();
