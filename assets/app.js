const STORAGE_KEY = 'travel-planner-v5';
const VIEW_STORAGE_KEY = 'travel-planner-simple-mode';
const COLLAPSE_STORAGE_KEY = 'travel-planner-collapsed-days';
const ONBOARDING_SEEN_KEY = 'travel-planner-onboarding-seen';
const BACKUP_HISTORY_KEY = 'travel-planner-backup-history-v1';
const BACKUP_HISTORY_MIN_INTERVAL_MS = 10*60*1000; // 直近のスナップショットから10分未満なら上書きし、容量消費を抑える
const LEGACY_STORAGE_KEYS = ['hokkaido-trip-v2', 'trip-planner-v4'];
const CATS = {
  food:         { label:'食事',   cls:'tag-food' },
  snack:        { label:'おやつ', cls:'tag-snack' },
  sightseeing:  { label:'観光',   cls:'tag-sightseeing' },
  nature:       { label:'自然',   cls:'tag-nature' },
  activity:     { label:'体験',   cls:'tag-activity' },
  stay:         { label:'宿泊',   cls:'tag-stay' },
};
const TR = [
  { val:'ferry',  label:'フェリー',   sym:'⛴' },
  { val:'car',    label:'自家用車',   sym:'🚗' },
  { val:'train',  label:'電車',       sym:'🚃' },
  { val:'bus',    label:'バス',       sym:'🚌' },
  { val:'plane',  label:'飛行機',     sym:'✈️' },
  { val:'walk',   label:'徒歩',       sym:'🚶' },
  { val:'taxi',   label:'タクシー',   sym:'🚕' },
  { val:'rental', label:'レンタカー', sym:'🚙' },
  { val:'other',  label:'その他',     sym:'✎' },
];
const CURRENCIES = {
  JPY:{code:'JPY',symbol:'¥',  minor:0,locale:'ja-JP',label:'日本円 (¥)'},
  USD:{code:'USD',symbol:'$',  minor:2,locale:'en-US',label:'米ドル ($)'},
  EUR:{code:'EUR',symbol:'€',  minor:2,locale:'de-DE',label:'ユーロ (€)'},
  GBP:{code:'GBP',symbol:'£',  minor:2,locale:'en-GB',label:'英ポンド (£)'},
  KRW:{code:'KRW',symbol:'₩',  minor:0,locale:'ko-KR',label:'韓国ウォン (₩)'},
  CNY:{code:'CNY',symbol:'元', minor:2,locale:'zh-CN',label:'中国元 (元)'},
  TWD:{code:'TWD',symbol:'NT$',minor:0,locale:'zh-TW',label:'台湾ドル (NT$)'},
  THB:{code:'THB',symbol:'฿',  minor:2,locale:'th-TH',label:'タイバーツ (฿)'},
  AUD:{code:'AUD',symbol:'A$', minor:2,locale:'en-AU',label:'豪ドル (A$)'},
  SGD:{code:'SGD',symbol:'S$', minor:2,locale:'en-SG',label:'シンガポールドル (S$)'},
};
let tripCurrency='JPY';
function curCfg(){ return CURRENCIES[tripCurrency]||CURRENCIES.JPY; }
function curFactor(){ return Math.pow(10, curCfg().minor); }
function curStep(){ return curCfg().minor>0 ? '0.01' : '1'; }
function roundMoney(v){ const f=curFactor(); return Math.round((Number(v)||0)*f)/f; }
function moneyToUnits(v){ return Math.round((Number(v)||0)*curFactor()); }
function setTripCurrency(code){ tripCurrency=CURRENCIES[code]?code:'JPY'; scheduleSave(); render(); }

let wishes = [], days = [], members=[], expenses=[], nid=100, ndid=50, neid=200, nmid=1, nxid=1, pendingWid=null, saveTimer=null, openInsertKey=null, openReservationKey=null;
let simpleMode = false;
let collapsedDayIds = new Set();
let lastSaveErrorToastAt = 0;
let activeTab='wish';
const tabScrollPositions={wish:0,plan:0,today:0,items:0,settle:0};
try {
  const storedViewMode=localStorage.getItem(VIEW_STORAGE_KEY);
  simpleMode = storedViewMode===null ? window.matchMedia('(max-width: 640px)').matches : storedViewMode==='1';
} catch(e) { simpleMode = window.matchMedia('(max-width: 640px)').matches; }
try {
  collapsedDayIds = new Set(JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY)||'[]').map(Number).filter(Boolean));
} catch(e) { collapsedDayIds = new Set(); }

// ── storage ──────────────────────────────────────────
function setSave(status, msg) {
  const b=document.getElementById('save-badge'), t=document.getElementById('save-text');
  b.className='save-badge '+status; t.textContent=msg;
}
function scheduleSave() {
  setSave('saving','未保存');
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(save, 900);
}
function notifySaveErrorOnce(){
  const now = Date.now();
  if(now - lastSaveErrorToastAt < 60 * 1000) return;
  lastSaveErrorToastAt = now;
  showToast('保存容量を超えた可能性があります。JSON保存でバックアップしてください');
}
function plannerData(){
  return {title:document.getElementById('trip-title').value,currency:tripCurrency,wishes,days,members,expenses};
}
function saveBackupHistory(data){
  try{
    const raw=JSON.stringify(data);
    let history=JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY)||'[]');
    if(!Array.isArray(history)) history=[];
    if(history[0]?.data===raw) return;
    const last=history[0];
    const lastAge=last ? Date.now()-new Date(last.savedAt).getTime() : Infinity;
    if(last && lastAge < BACKUP_HISTORY_MIN_INTERVAL_MS){
      history[0]={savedAt:new Date().toISOString(),data:raw};
    } else {
      history.unshift({savedAt:new Date().toISOString(),data:raw});
    }
    localStorage.setItem(BACKUP_HISTORY_KEY,JSON.stringify(history.slice(0,5)));
  }catch(e){}
}
function save() {
  setSave('saving','保存中…');
  try {
    const data=plannerData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    saveBackupHistory(data);
    setSave('saved','保存済み ✓');
  } catch(e) {
    setSave('','保存失敗');
    notifySaveErrorOnce();
  }
}
const CHANGELOG = [
  { date: '2026-06-23', items: [
    '地図機能を、Googleマップ・Google検索を開く外部リンクに統合し、シンプルにしました',
    '精算タブに「金額の計算を補助するものであり、実際の決済・送金は行わない」旨の注意書きを追加しました',
    '「行きたい場所」リストの表示順を、登録した順になるよう変更しました',
    'カードの文字量によって表示がずれていた問題を修正し、見た目を統一しました'
  ] }
];
function showChangelog(){
  const bd=document.createElement('div');
  bd.className='modal-backdrop';
  bd.innerHTML=`<div class="modal">
    <div class="modal-title">更新履歴</div>
    <div class="modal-list">${CHANGELOG.map(entry=>{
      const d=new Date(entry.date);
      const label=Number.isNaN(d.getTime()) ? entry.date : d.toLocaleDateString('ja-JP');
      return `<div style="padding:10px 12px;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px">${esc(label)}</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">${entry.items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      </div>`;
    }).join('')}</div>
    <button class="modal-cancel" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>
  </div>`;
  document.body.appendChild(bd);
}
function showBackupHistory(){
  let history=[];
  try{ history=JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY)||'[]'); }catch(e){}
  if(!Array.isArray(history) || !history.length){ showToast('復元できる保存履歴はまだありません'); return; }
  const bd=document.createElement('div');
  bd.className='modal-backdrop';
  bd.innerHTML=`<div class="modal">
    <div class="modal-title">保存履歴から復元</div>
    <div class="geocode-help">直近5件を端末内に保存しています。復元前の現在データも履歴へ残します。</div>
    <div class="modal-list">${history.map((item,index)=>{
      const d=new Date(item.savedAt);
      const label=Number.isNaN(d.getTime()) ? item.savedAt : d.toLocaleString('ja-JP');
      let title='';
      try{ title=JSON.parse(item.data)?.title||'名称未設定'; }catch(e){}
      return `<button class="modal-item" onclick="restoreBackupHistory(${index})">${esc(label)}<br><span style="font-size:11px;color:var(--muted)">${esc(title)}</span></button>`;
    }).join('')}</div>
    <button class="modal-cancel" onclick="this.closest('.modal-backdrop').remove()">キャンセル</button>
  </div>`;
  document.body.appendChild(bd);
}
function restoreBackupHistory(index){
  let history=[];
  try{ history=JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY)||'[]'); }catch(e){}
  const item=Array.isArray(history)?history[Number(index)]:null;
  if(!item) return;
  if(!confirm('選択した保存履歴で現在の内容を置き換えます。よろしいですか？')) return;
  try{
    saveBackupHistory(plannerData());
    const data=JSON.parse(item.data);
    document.getElementById('trip-title').value=data.title||'';
    tripCurrency=CURRENCIES[data.currency]?data.currency:'JPY';
    wishes=data.wishes||[]; days=data.days||[]; members=data.members||[]; expenses=data.expenses||[];
    normalizeData(); refreshIds(); save(); render();
    document.querySelector('.modal-backdrop')?.remove();
    showToast('保存履歴を復元しました');
  }catch(e){ showToast('この保存履歴を復元できませんでした'); }
}
function load() {
  try {
    let raw=localStorage.getItem(STORAGE_KEY);
    let migrated=false;
    if(!raw){
      for(const key of LEGACY_STORAGE_KEYS){
        raw=localStorage.getItem(key);
        if(raw){ migrated=true; break; }
      }
    }
    if(raw) {
      const d=JSON.parse(raw);
      document.getElementById('trip-title').value = d.title||'';
      tripCurrency = CURRENCIES[d.currency] ? d.currency : 'JPY';
      wishes=d.wishes||[]; days=d.days||[]; members=d.members||[]; expenses=d.expenses||[];
      normalizeData();
      const removedLegacyDays = removeLegacyEmptyDefaultDays();
      refreshIds();
      if(migrated || removedLegacyDays){
        localStorage.setItem(STORAGE_KEY, JSON.stringify(plannerData()));
      }
      if(migrated){
        setSave('saved','旧データ移行済み ✓');
      } else if(removedLegacyDays){
        setSave('saved','初期データを整理しました ✓');
      } else {
        setSave('saved','保存済み ✓');
      }
    } else { loadDefaults(); }
  } catch(e) {
    loadDefaults();
    setSave('','読み込み失敗');
    showToast('保存データを読み込めませんでした。「データ管理」→「保存履歴」から復元できないか確認してください');
  }
  render();
}
function loadDefaults() {
  // 初期候補・初期予定は空にして、旅行ごとに自由に作れるテンプレートにする
  tripCurrency='JPY';
  wishes=[];
  days=[];
  members=[];
  expenses=[];
  refreshIds();
  setSave('','未保存');
}

function resetPlanner(){
  const ok=confirm('現在の旅行タイトル・候補地・旅程をすべてリセットします。必要な場合は先に「JSON保存」でバックアップしてください。よろしいですか？');
  if(!ok) return;
  if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
  try{
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach(key=>localStorage.removeItem(key));
  }catch(e){}
  document.getElementById('trip-title').value='';
  wishes=[];
  days=[];
  members=[];
  expenses=[];
  pendingWid=null;
  openInsertKey=null;
  refreshIds();
  render();
  setSave('','未保存');
  showToast('旅行プランをリセットしました');
}

function refreshIds(){
  const wids=wishes.map(w=>Number(w.id)||0), dids=days.map(d=>Number(d.id)||0), eids=days.flatMap(d=>(d.entries||[]).map(e=>Number(e.id)||0));
  nid  = wids.length  ? Math.max(...wids)+1  : 100;
  ndid = dids.length  ? Math.max(...dids)+1  : 50;
  neid = eids.length  ? Math.max(...eids)+1  : 200;
  nmid = members.length ? Math.max(...members.map(m=>Number(m.id)||0))+1 : 1;
  nxid = expenses.length ? Math.max(...expenses.map(x=>Number(x.id)||0))+1 : 1;
}

function removeLegacyEmptyDefaultDays(){
  // 以前の版で自動作成されていた空の1〜3日目だけの予定枠は、未編集なら削除する
  const title = (document.getElementById('trip-title').value||'').trim();
  if(title || wishes.length) return false;
  if(!Array.isArray(days) || days.length!==3) return false;
  const isDefault = days.every((d,idx)=>
    d && String(d.label||'')===(idx+1)+'日目' && !(d.date||'') && !(d.memo||'') && Array.isArray(d.entries) && d.entries.length===0
  );
  if(!isDefault) return false;
  days=[];
  return true;
}

function normalizeData(){
  // normalizeDataではIDを採番せず、型と欠損フィールドの整形だけを行う。
  // ID欠損や重複は ensureUniqueIds() で既存最大値を見ながら安全に補完する。
  wishes=(wishes||[]).map(w=>({
    id:Number(w.id)||null,
    name:w.name||'',
    cat:CATS[w.cat] ? w.cat : 'sightseeing',
    url:w.url||'',
    memo:w.memo||'',
    conflictMemo:w.conflictMemo||'',
    scheduledRefs:Array.isArray(w.scheduledRefs) ? w.scheduledRefs.filter(r=>r && r.dayId!=null && r.entryId!=null).map(r=>({dayId:Number(r.dayId)||r.dayId, entryId:Number(r.entryId)||r.entryId})) : []
  }));
  days=(days||[]).map((d,idx)=>({
    id:Number(d.id)||null,
    label:d.label||((idx+1)+'日目'),
    date:d.date||'',
    memo:d.memo||'',
    entries:(d.entries||[]).map(e=> e.type==='transport'
      ? {id:Number(e.id)||null,type:'transport',mode:e.mode||'ferry',modeText:e.modeText||'',from:e.from||'',to:e.to||'',depart:e.depart||'',arrive:e.arrive||'',duration:e.duration||'',cost:Math.max(0,Number(e.cost)||0),note:e.note||'',url:e.url||'',reservation:normalizeReservation(e.reservation)}
      : {id:Number(e.id)||null,type:'spot',name:e.name||'',cat:CATS[e.cat] ? e.cat : 'sightseeing',arrive:e.arrive||'',leave:e.leave||'',nextMove:String(e.nextMove||((e.driveMinutes!=null&&e.driveMinutes!=='')?`車 ${e.driveMinutes}分`:'')),checkoutDate:e.checkoutDate||'',checkoutTime:e.checkoutTime||'',checkoutMemo:e.checkoutMemo||'',cost:Math.max(0,Number(e.cost)||0),note:e.note||'',url:e.url||'',reservation:normalizeReservation(e.reservation)})
  }));
  members=(members||[]).map(m=>({id:Number(m.id)||null,name:String(m.name||'').trim()})).filter(m=>m.name);
  assignUniqueIds(members,1);
  const validMemberIds=new Set(members.map(m=>m.id));
  expenses=(expenses||[]).map(x=>{
    const weightsRaw=(x.weights && typeof x.weights==='object' && !Array.isArray(x.weights)) ? x.weights : {};
    const weights={};
    Object.keys(weightsRaw).forEach(k=>{ const id=Number(k), w=Number(weightsRaw[k]); if(validMemberIds.has(id) && Number.isFinite(w) && w>=0) weights[id]=w; });
    return {
      id:Number(x.id)||null,
      label:String(x.label||'').trim(),
      dayId:Number(x.dayId)||null,
      entryId:Number(x.entryId)||null,
      payerId:Number(x.payerId)||null,
      amount:Math.max(0,roundMoney(x.amount)),
      participantIds:[...new Set((Array.isArray(x.participantIds)?x.participantIds:[]).map(Number).filter(id=>validMemberIds.has(id)))],
      splitMode:x.splitMode==='weight'?'weight':'equal',
      weights,
      date:/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||'')) ? String(x.date) : '',
      note:String(x.note||'')
    };
  }).filter(x=>x.label && x.amount>0 && validMemberIds.has(x.payerId) && x.participantIds.length);
  assignUniqueIds(expenses,1);
  ensureUniqueIds();
  cleanupScheduledRefs();
}

function assignUniqueIds(items, startAt){
  const validIds=items.map(x=>Number(x.id)||0).filter(x=>x>0);
  let next=validIds.length ? Math.max(...validIds)+1 : startAt;
  const seen=new Set();
  items.forEach(item=>{
    let id=Number(item.id)||0;
    if(id<=0 || seen.has(id)){
      while(seen.has(next)) next++;
      id=next++;
    }
    item.id=id;
    seen.add(id);
  });
}

function ensureUniqueIds(){
  assignUniqueIds(wishes, 100);
  assignUniqueIds(days, 50);
  const entries=[];
  days.forEach(d=>(d.entries||[]).forEach(e=>entries.push(e)));
  assignUniqueIds(entries, 200);
  refreshIds();
}


function updateSimpleModeButton(){
  document.querySelectorAll('.simple-mode-btn, #simple-mode-btn').forEach(btn=>{
    btn.classList.toggle('active', simpleMode);
    btn.textContent = simpleMode ? '通常編集' : '簡易表示';
    btn.title = simpleMode ? '通常編集モードに戻します' : '旅先で見やすい簡易表示に切り替えます';
  });
}

function toggleSimpleMode(){
  simpleMode = !simpleMode;
  try { localStorage.setItem(VIEW_STORAGE_KEY, simpleMode ? '1' : '0'); } catch(e) {}
  openInsertKey=null;
  openReservationKey=null;
  renderDays();
  renderWishes();
  updateSimpleModeButton();
}
function saveCollapsedDays(){
  try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...collapsedDayIds])); } catch(e) {}
}
function isDayCollapsed(dayId){ return collapsedDayIds.has(Number(dayId)); }
function toggleDayCollapse(dayId){
  dayId=Number(dayId);
  if(collapsedDayIds.has(dayId)) collapsedDayIds.delete(dayId); else collapsedDayIds.add(dayId);
  saveCollapsedDays();
  openInsertKey=null;
  openReservationKey=null;
  renderDays();
}
function collapseAllDays(){
  collapsedDayIds = new Set(days.map(d=>Number(d.id)).filter(Boolean));
  saveCollapsedDays();
  openInsertKey=null;
  openReservationKey=null;
  renderDays();
}
function expandAllDays(){
  collapsedDayIds = new Set();
  saveCollapsedDays();
  openInsertKey=null;
  openReservationKey=null;
  renderDays();
}
function daySummary(day){
  const entryCount=(day.entries||[]).length;
  const checkoutCount=checkoutItemsForDay(day).length;
  const total=entryCount+checkoutCount;
  return total ? `${total}件` : '予定なし';
}
function renderDayJumpBar(){
  const el=document.getElementById('day-jumps');
  if(!el) return;
  if(!days.length){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='flex';
  const today=todayString();
  const buttons=days.map(day=>{
    const isToday=day.date===today;
    const date=day.date ? ' ' + formatShortDate(day.date) : '';
    const fold=isDayCollapsed(day.id) ? '・閉' : '';
    return `<button class="day-jump-btn${isToday?' today':''}" onclick="jumpToDay(${day.id})" title="${esc(day.label)}へ移動">${esc(day.label)}${esc(date)}${fold}</button>`;
  }).join('');
  const modeText = simpleMode ? '通常編集' : '簡易表示';
  const modeTitle = simpleMode ? '通常編集モードに戻します' : '旅先で見やすい簡易表示に切り替えます';
  const controls=`<span class="day-jump-controls"><button class="day-jump-btn day-jump-action view-toggle-btn${simpleMode?' active':''}" id="simple-mode-btn" onclick="toggleSimpleMode()" title="${modeTitle}">${modeText}</button><button class="day-jump-btn day-jump-action" onclick="collapseAllDays()" title="すべての日程を折り畳む">すべて閉じる</button><button class="day-jump-btn day-jump-action" onclick="expandAllDays()" title="すべての日程を開く">すべて開く</button></span>`;
  el.innerHTML=`<span class="day-jump-label">日別ジャンプ</span>${buttons}${controls}`;
}
function jumpToDay(dayId){
  const el=document.getElementById('day-block-'+dayId);
  if(!el) return;
  el.scrollIntoView({behavior:'smooth', block:'start'});
}
function formatShortDate(dateStr){
  if(!dateStr) return '';
  const m=String(dateStr).match(/^\d{4}-(\d{2})-(\d{2})$/);
  if(!m) return dateStr;
  return Number(m[1])+'/'+Number(m[2]);
}

// ── tabs ────────────────────────────────────────────
function showTab(t) {
  const tabs=['wish','plan','today','items','settle'];
  if(!tabs.includes(t)) return;
  tabScrollPositions[activeTab]=window.scrollY||document.documentElement.scrollTop||0;
  document.querySelectorAll('.tab').forEach((b,i)=>{
    const selected=tabs[i]===t;
    b.classList.toggle('active',selected);
    b.setAttribute('aria-selected',selected?'true':'false');
    b.tabIndex=selected?0:-1;
  });
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
  if(t==='today') renderToday();
  if(t==='items') renderBelongings();
  if(t==='settle') renderSettlement();
  activeTab=t;
  setTimeout(()=>window.scrollTo({top:tabScrollPositions[t]||0,left:0,behavior:'auto'}),0);
}
function handleTabKeydown(event) {
  const tabs=['wish','plan','today','items','settle'];
  const i=tabs.indexOf(activeTab);
  if(i<0) return;
  let next;
  if(event.key==='ArrowRight') next=(i+1)%tabs.length;
  else if(event.key==='ArrowLeft') next=(i-1+tabs.length)%tabs.length;
  else if(event.key==='Home') next=0;
  else if(event.key==='End') next=tabs.length-1;
  else return;
  event.preventDefault();
  showTab(tabs[next]);
  document.getElementById('tab-'+tabs[next]).focus();
}

// ── wish list ────────────────────────────────────────
function addWish() {
  const inp=document.getElementById('wi'), name=inp.value.trim(), cat=document.getElementById('wc').value;
  if(!name) return;
  wishes.push({id:nid++,name,cat,url:'',memo:'',conflictMemo:''});
  inp.value=''; renderWishes(); scheduleSave();
}
function removeWish(id) { wishes=wishes.filter(w=>w.id!==id); renderWishes(); scheduleSave(); }
function updateWishUrl(id,val) { const w=wishes.find(x=>x.id===id); if(w){w.url=val;scheduleSave();} }
function updateWishMemo(id,val) { const w=wishes.find(x=>x.id===id); if(w){w.memo=val;scheduleSave();} }
function updateWishConflictMemo(id,val,el) {
  const w=wishes.find(x=>x.id===id);
  if(!w) return;
  w.conflictMemo=val;
  if(el){
    el.classList.toggle('has-conflict', !!val.trim());
    const card=el.closest('.wcard');
    const badge=card ? card.querySelector('[data-conflict-badge]') : null;
    if(badge) badge.style.display = val.trim() ? '' : 'none';
  }
  scheduleSave();
}
function updateWishName(id,val) { const w=wishes.find(x=>x.id===id); if(w){w.name=val;scheduleSave();} }
function updateWishCat(id,val) { const w=wishes.find(x=>x.id===id); if(w && CATS[val]){w.cat=val;renderWishes();scheduleSave();} }

function findDayAndEntry(dayId, entryId){
  const d=days.find(x=>x.id===dayId);
  if(!d) return null;
  const e=(d.entries||[]).find(x=>x.id===entryId);
  return e ? {day:d, entry:e} : null;
}
function cleanupScheduledRefs(){
  wishes.forEach(w=>{
    const seen=new Set();
    w.scheduledRefs=(w.scheduledRefs||[]).filter(r=>{
      if(!findDayAndEntry(r.dayId,r.entryId)) return false;
      const key=r.dayId+'-'+r.entryId;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}
function wishScheduledRefs(w){
  return (w.scheduledRefs||[]).filter(r=>findDayAndEntry(r.dayId,r.entryId));
}
function scheduledLabel(w){
  const refs=wishScheduledRefs(w);
  if(!refs.length) return '';
  return refs.map(r=>{
    const hit=findDayAndEntry(r.dayId,r.entryId);
    if(!hit) return '';
    const d=hit.day;
    return d.label + (d.date ? ' ' + d.date : '');
  }).filter(Boolean).join(' / ');
}

function moveToDay(wid) {
  pendingWid=wid;
  if(days.length===0){
    addDay();
    addPendingWishAt(0, 0);
    return;
  }
  if(days.length===1){ showPositionPicker(days[0].id); return; }
  showDayPickerForWish();
}
function showDayPickerForWish(){
  if(pendingWid==null) return;
  const bd=document.createElement('div');
  bd.className='modal-backdrop';
  bd.innerHTML=`<div class="modal">
    <div class="modal-title">どの日に追加しますか？</div>
    <div class="modal-list">${days.map((d,i)=>`<button class="modal-item" onclick="this.closest('.modal-backdrop').remove();showPositionPicker(${d.id})">${esc(d.label)}${d.date?' ('+esc(d.date)+')':''}</button>`).join('')}</div>
    <button class="modal-cancel" onclick="this.closest('.modal-backdrop').remove();pendingWid=null">キャンセル</button>
  </div>`;
  document.body.appendChild(bd);
}
function entrySummary(e){
  if(!e) return '予定';
  if(e.type==='transport'){
    const m=TR.find(x=>x.val===e.mode)||TR[0];
    const route=[e.from,e.to].filter(Boolean).join(' → ');
    return (m.label||'移動') + (route ? '：' + route : '');
  }
  return e.name || 'スポット';
}
function positionOptionsForDay(day){
  const entries=day.entries||[];
  if(!entries.length){
    return `<button class="modal-item" onclick="addPendingWishAtByDayId(${day.id},0);this.closest('.modal-backdrop').remove()">この日の予定に追加</button>`;
  }
  const buttons=[];
  buttons.push(`<button class="modal-item" onclick="addPendingWishAtByDayId(${day.id},0);this.closest('.modal-backdrop').remove()">先頭に追加（${esc(entrySummary(entries[0]))} の前）</button>`);
  entries.forEach((e,i)=>{
    const label=i===entries.length-1 ? `末尾に追加（${entrySummary(e)} の後）` : `${entrySummary(e)} の後に追加`;
    buttons.push(`<button class="modal-item" onclick="addPendingWishAtByDayId(${day.id},${i+1});this.closest('.modal-backdrop').remove()">${esc(label)}</button>`);
  });
  return buttons.join('');
}
function showPositionPicker(dayId){
  if(pendingWid==null) return;
  const d=days.find(x=>x.id===dayId);
  if(!d){ pendingWid=null; return; }
  const w=wishes.find(x=>x.id===pendingWid);
  const bd=document.createElement('div');
  bd.className='modal-backdrop';
  bd.innerHTML=`<div class="modal">
    <div class="modal-title">${esc(w?w.name:'候補地')}をどこに追加しますか？</div>
    <div class="modal-list">${positionOptionsForDay(d)}</div>
    ${days.length>1?`<button class="modal-cancel" onclick="this.closest('.modal-backdrop').remove();showDayPickerForWish()">日付選択に戻る</button>`:''}
    <button class="modal-cancel" onclick="this.closest('.modal-backdrop').remove();pendingWid=null">キャンセル</button>
  </div>`;
  document.body.appendChild(bd);
}
function addPendingWishAtByDayId(dayId,index){
  const di=days.findIndex(d=>d.id===dayId);
  addPendingWishAt(di,index);
}
function addPendingWishAt(di,index){
  const w=wishes.find(x=>x.id===pendingWid); if(!w){pendingWid=null;return;}
  const d=days[di]; if(!d){pendingWid=null;return;}
  const wid=pendingWid;
  pendingWid=null;
  insertWishAt(d.id,index,wid);
}
function doMove(di) {
  // 旧バージョン互換用。現在は moveToDay() から showPositionPicker() を経由する。
  const d=days[di];
  if(!d){ pendingWid=null; return; }
  addPendingWishAt(di, (d.entries||[]).length);
}

function compactTextLine(label, text, cls=''){
  const v=String(text||'').trim();
  if(!v) return '';
  return `<div class="wish-compact-text ${cls}"><strong>${esc(label)}：</strong>${esc(v)}</div>`;
}
function renderWishCompactDetails(w){
  const lines=[];
  if(w.memo) lines.push(compactTextLine('メモ', w.memo));
  if(w.conflictMemo) lines.push(compactTextLine('競合', w.conflictMemo, 'conflict'));
  if(w.url) lines.push(compactTextLine('URL', w.url));
  return lines.length ? `<div class="wish-compact-meta">${lines.join('')}</div>` : '';
}
function renderWishes() {
  cleanupScheduledRefs();
  const list=document.getElementById('wlist'), empty=document.getElementById('wempty');
  if(!wishes.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const unscheduled=wishes.filter(w=>wishScheduledRefs(w).length===0);
  const scheduled=wishes.filter(w=>wishScheduledRefs(w).length>0);
  const renderCard=(w,isScheduled)=>{
    const c=CATS[w.cat]||CATS.sightseeing;
    const hu=isSafeHttpUrl(w.url);
    const status=scheduledLabel(w);
    if(simpleMode){
      return `<div class="wcard compact${isScheduled?' scheduled':''}">
        <div class="wcard-r1">
          <span class="tag ${c.cls}">${esc(c.label)}</span>
          <span class="wish-compact-name">${esc(w.name || '未入力スポット')}</span>
        </div>
        <div class="card-actions">
          ${status?`<span class="wish-status">登録済み：${esc(status)}</span>`:''}
          <span class="conflict-badge" style="${w.conflictMemo?'':'display:none'}">競合あり</span>
          <button class="move-btn" onclick="moveToDay(${w.id})">${isScheduled?'もう一度追加':'旅程へ →'}</button>
          <details class="card-more">
            <summary aria-label="${esc(w.name||'候補地')}のその他の操作">その他</summary>
            <div class="card-more-menu">
              ${hu?`<button class="wish-open-btn" data-url="${esc(w.url)}" onclick="openUrlFromButton(this)">保存したURLを開く</button>`:''}
              <button class="map-btn" onclick="openGoogleMapForWish(${w.id})">Googleマップ</button>
              <button class="map-btn" onclick="openGoogleSearchForWish(${w.id})">Google検索</button>
              <button class="icon-btn danger-action" onclick="removeWish(${w.id})" title="削除"><span class="desktop-action-label">✕</span><span class="mobile-action-label">✕ この候補を削除</span></button>
            </div>
          </details>
        </div>
        ${renderWishCompactDetails(w)}
      </div>`;
    }
    return `<div class="wcard${isScheduled?' scheduled':''}">
      <div class="wcard-r1">
        <select class="cat-sel ${c.cls}" title="分類" onchange="updateWishCat(${w.id},this.value)">${catOptions(w.cat||'sightseeing')}</select>
        <input class="wish-name-inp" type="text" value="${esc(w.name)}" placeholder="場所・スポット名" oninput="updateWishName(${w.id},this.value)" />
      </div>
      <div class="card-actions">
        ${status?`<span class="wish-status">登録済み：${esc(status)}</span>`:''}
        <span class="conflict-badge" data-conflict-badge style="${w.conflictMemo?'':'display:none'}">競合あり</span>
        <button class="move-btn" onclick="moveToDay(${w.id})">${isScheduled?'もう一度追加':'旅程へ →'}</button>
        <details class="card-more">
          <summary aria-label="${esc(w.name||'候補地')}のその他の操作">その他</summary>
          <div class="card-more-menu">
            <button class="map-btn" onclick="openGoogleMapForWish(${w.id})">Googleマップ</button>
            <button class="map-btn" onclick="openGoogleSearchForWish(${w.id})">Google検索</button>
            <button class="icon-btn danger-action" onclick="removeWish(${w.id})" title="削除"><span class="desktop-action-label">✕</span><span class="mobile-action-label">✕ この候補を削除</span></button>
          </div>
        </details>
      </div>
      <div class="wcard-r2">
        <div class="url-field">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12.5 7.5l-5 5M8 5.5l1-1a3.536 3.536 0 115 5l-1 1M11 14.5l-1 1a3.536 3.536 0 11-5-5l1-1"/></svg>
          <input class="url-inp" type="url" value="${esc(w.url||'')}" placeholder="URLをペースト" oninput="updateWishUrl(${w.id},this.value)" />
          ${hu?`<a class="url-open" href="${esc(w.url)}" target="_blank" rel="noopener" title="開く"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 3h6v6M17 3l-8 8M9 5H5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-4"/></svg></a>`:''}
        </div>
      </div>
      <div class="wcard-r2">
        <div class="url-field">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h12M4 10h12M4 15h8"/></svg>
          <textarea class="url-inp" rows="2" placeholder="一言メモ（例：営業時間確認、駐車場注意）" oninput="updateWishMemo(${w.id},this.value)">${esc(w.memo||'')}</textarea>
        </div>
      </div>
      <div class="wcard-r2">
        <div class="url-field">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3l8 14H2L10 3z"/><path d="M10 8v4M10 15h.01"/></svg>
          <textarea class="url-inp conflict-inp${w.conflictMemo?' has-conflict':''}" rows="2" placeholder="競合・保留メモ（例：麦彩の丘と競合、時間が厳しければ外す）" oninput="updateWishConflictMemo(${w.id},this.value,this)">${esc(w.conflictMemo||'')}</textarea>
        </div>
      </div>
    </div>`;
  };
  const sections=[];
  sections.push(`<div class="wish-section-title">未登録の候補 <span class="wish-count">${unscheduled.length}</span></div>` + (unscheduled.length ? unscheduled.map(w=>renderCard(w,false)).join('') : '<div class="empty-msg" style="padding:14px">未登録の候補はありません。</div>'));
  if(scheduled.length){
    sections.push(`<div class="wish-section-title sub">登録済みの候補 <span class="wish-count">${scheduled.length}</span></div>` + scheduled.map(w=>renderCard(w,true)).join(''));
  }
  list.innerHTML=sections.join('');
}

// ── itinerary ─────────────────────────────────────────
function addDay(){days.push({id:ndid++,label:(days.length+1)+'日目',date:'',memo:'',entries:[]});relabelDefaultDays();renderDays();scheduleSave();}
function relabelDefaultDays(){
  days.forEach((d,idx)=>{
    if(/^\d+日目$/.test(d.label||'')){
      d.label=(idx+1)+'日目';
    }
  });
}
function moveDay(dayId, dir){
  const i=days.findIndex(d=>d.id===dayId);
  if(i<0) return;
  const j=i+dir;
  if(j<0 || j>=days.length) return;
  [days[i],days[j]]=[days[j],days[i]];
  relabelDefaultDays();
  render();
  scheduleSave();
}
function removeDay(){
  // 最後の1日だけは安全のため残す仕様。空テンプレートの0件状態もここで扱う。
  if(days.length<=1)return;
  const last=days[days.length-1];
  if(last.entries.length&&!confirm(last.label+'にアイテムがあります。削除しますか？'))return;
  days.pop();
  relabelDefaultDays();
  cleanupScheduledRefs();
  render();
  scheduleSave();
}
function addSpot(dayId){
  const inp=document.getElementById('sp-'+dayId),name=inp.value.trim();
  if(!name){ showToast('スポット名を入力してください'); if(inp) inp.focus(); return; }
  insertSpotAt(dayId, null, name, inp);
}
function addTr(dayId){
  insertTransportAt(dayId, null);
}
function linkDirectSpotToWish(dayId, entry){
  const normalizedName=String(entry.name||'').trim().replace(/\s+/g,' ').toLowerCase();
  let w=wishes.find(x=>String(x.name||'').trim().replace(/\s+/g,' ').toLowerCase()===normalizedName);
  if(!w){
    w={
      id:nid++,
      name:entry.name,
      cat:entry.cat,
      url:entry.url||'',
      memo:entry.note||'',
      conflictMemo:'',
      scheduledRefs:[]
    };
    wishes.push(w);
  }
  if(!Array.isArray(w.scheduledRefs)) w.scheduledRefs=[];
  if(!w.scheduledRefs.some(r=>r.dayId===dayId && r.entryId===entry.id)){
    w.scheduledRefs.push({dayId,entryId:entry.id});
  }
}
function insertSpotAt(dayId, index, name, inputEl){
  const d=days.find(x=>x.id===dayId);if(!d)return false;
  const n=(name||'').trim();if(!n)return false;
  const entry={id:neid++,type:'spot',name:n,cat:'sightseeing',arrive:'',leave:'',nextMove:'',checkoutDate:'',checkoutTime:'',checkoutMemo:'',note:'',url:'',reservation:emptyReservation()};
  if(index===null || index===undefined || index<0 || index>d.entries.length){d.entries.push(entry);}else{d.entries.splice(index,0,entry);}
  linkDirectSpotToWish(d.id,entry);
  if(inputEl) inputEl.value='';
  render();scheduleSave();
  return true;
}
function insertSpotFromInline(dayId, index){
  const inp=document.getElementById(`ins-sp-${dayId}-${index}`);
  if(!inp)return;
  const val=inp.value;
  if(!val.trim()){ showToast('スポット名を入力してください'); inp.focus(); return; }
  const ok=insertSpotAt(dayId, index, val, inp);
  if(ok){ openInsertKey=null; renderDays(); }
}
function wishInsertOptions(){
  if(!wishes.length) return '<option value="">行きたい場所がありません</option>';
  const unscheduled=wishes.filter(w=>wishScheduledRefs(w).length===0);
  const scheduled=wishes.filter(w=>wishScheduledRefs(w).length>0);
  const option=w=>`<option value="${w.id}">${esc(w.name)}${wishScheduledRefs(w).length>0?'（登録済み）':''}</option>`;
  const groups=[];
  if(unscheduled.length) groups.push(`<optgroup label="未登録の候補">${unscheduled.map(option).join('')}</optgroup>`);
  if(scheduled.length) groups.push(`<optgroup label="登録済みの候補">${scheduled.map(option).join('')}</optgroup>`);
  return '<option value="">行きたい場所から選択</option>'+groups.join('');
}
function insertWishAt(dayId, index, wid){
  const d=days.find(x=>x.id===dayId); if(!d) return false;
  const w=wishes.find(x=>x.id===Number(wid)); if(!w){ showToast('候補地を選んでください'); return false; }
  const entryId=neid++;
  const entry={id:entryId,type:'spot',name:w.name,cat:w.cat,arrive:'',leave:'',nextMove:'',checkoutDate:'',checkoutTime:'',checkoutMemo:'',note:w.memo||'',url:w.url||'',reservation:emptyReservation()};
  if(index===null || index===undefined || index<0 || index>d.entries.length){ d.entries.push(entry); } else { d.entries.splice(index,0,entry); }
  if(!Array.isArray(w.scheduledRefs)) w.scheduledRefs=[];
  w.scheduledRefs.push({dayId:d.id, entryId});
  openInsertKey=null;
  render();
  scheduleSave();
  showToast('候補地をこの位置に追加しました');
  return true;
}
function insertWishFromInline(dayId,index){
  const sel=document.getElementById(`ins-wish-${dayId}-${index}`);
  if(!sel || !sel.value){ showToast('候補地を選んでください'); if(sel) sel.focus(); return; }
  insertWishAt(dayId,index,sel.value);
}
function entryPlaceName(e){
  if(!e)return '';
  if(e.type==='transport') return e.to || e.from || '';
  return e.name || '';
}
function insertTransportAt(dayId, index){
  const d=days.find(x=>x.id===dayId);if(!d)return;
  let from='', to='';
  if(index!==null && index!==undefined){
    from=entryPlaceName(d.entries[index-1]);
    to=entryPlaceName(d.entries[index]);
  }
  const entry={id:neid++,type:'transport',mode:'car',modeText:'',from,to,depart:'',arrive:'',duration:'',note:'',url:'',reservation:emptyReservation()};
  if(index===null || index===undefined || index<0 || index>d.entries.length){d.entries.push(entry);}else{d.entries.splice(index,0,entry);}
  renderDays();scheduleSave();
}
function insertTransportFromInline(dayId,index){
  openInsertKey=null;
  insertTransportAt(dayId,index);
}
function insertKey(dayId,index){ return dayId+'-'+index; }
function toggleInsert(dayId,index){
  const key=insertKey(dayId,index);
  openInsertKey = openInsertKey===key ? null : key;
  renderDays();
  if(openInsertKey===key){
    setTimeout(()=>{ const inp=document.getElementById(`ins-sp-${dayId}-${index}`); if(inp) inp.focus(); }, 0);
  }
}
function closeInsert(){ openInsertKey=null; renderDays(); }
function renderInsertRow(dayId,index,label){
  const safeLabel=esc(label||'ここに追加');
  const key=insertKey(dayId,index);
  if(openInsertKey!==key){
    return `<div class="insert-row"><button class="insert-toggle" onclick="toggleInsert(${dayId},${index})">＋ ${safeLabel}</button></div>`;
  }
  return `<div class="insert-row open">
    <span class="insert-label">＋ ${safeLabel}</span>
    <input type="text" id="ins-sp-${dayId}-${index}" placeholder="スポット名をここに追加" onkeydown="if(event.key==='Enter')insertSpotFromInline(${dayId},${index})" />
    <button class="insert-spot-btn" onclick="insertSpotFromInline(${dayId},${index})">スポット追加</button>
    <select id="ins-wish-${dayId}-${index}" title="行きたい場所から選択">${wishInsertOptions()}</select>
    <button class="insert-spot-btn" onclick="insertWishFromInline(${dayId},${index})">候補から追加</button>
    <button class="insert-tr-btn" onclick="insertTransportFromInline(${dayId},${index})">移動追加</button>
    <button class="insert-cancel-btn" onclick="closeInsert()">閉じる</button>
  </div>`;
}
function delEntry(dayId,eid){
  const d=days.find(x=>x.id===dayId);if(!d)return;
  d.entries=d.entries.filter(e=>e.id!==eid);cleanupScheduledRefs();render();scheduleSave();
}
function moveEntry(dayId,eid,dir){
  const d=days.find(x=>x.id===dayId);if(!d)return;
  const i=d.entries.findIndex(e=>e.id===eid);if(i<0)return;
  const j=i+dir;if(j<0||j>=d.entries.length)return;
  [d.entries[i],d.entries[j]]=[d.entries[j],d.entries[i]];
  renderDays();scheduleSave();
}
function setDay(dayId,f,v){const d=days.find(x=>x.id===dayId);if(d){d[f]=v;scheduleSave();}}
function setEntry(dayId,eid,f,v){const d=days.find(x=>x.id===dayId);if(!d)return;const e=d.entries.find(x=>x.id===eid);if(e){e[f]=v;scheduleSave();}}
function setEntryR(dayId,eid,f,v){setEntry(dayId,eid,f,v);renderDays();}
function updateEntrySpotName(dayId,eid,value){
  const hit=findDayAndEntry(Number(dayId),Number(eid));
  if(!hit || hit.entry.type!=='spot') return;
  const name=String(value||'').trim();
  if(!name){ showToast('スポット名は空にできません'); renderDays(); return; }
  hit.entry.name=name;
  const linkedWish=wishes.find(w=>(w.scheduledRefs||[]).some(r=>Number(r.dayId)===Number(dayId)&&Number(r.entryId)===Number(eid)));
  if(linkedWish){
    linkedWish.name=name;
    (linkedWish.scheduledRefs||[]).forEach(ref=>{
      const linked=findDayAndEntry(Number(ref.dayId),Number(ref.entryId));
      if(linked?.entry?.type==='spot') linked.entry.name=name;
    });
  }
  render();
  scheduleSave();
  showToast(linkedWish?'候補地と旅程の名前を更新しました':'スポット名を更新しました');
}
function catOptions(selected){
  return Object.entries(CATS).map(([val,c])=>`<option value="${val}"${selected===val?' selected':''}>${c.label}</option>`).join('');
}
function dayDateById(dayId){
  const d=days.find(x=>x.id===dayId);
  return d ? (d.date||'') : '';
}
function checkoutItemsForDay(day){
  if(!day || !day.date) return [];
  const out=[];
  days.forEach(srcDay=>{
    (srcDay.entries||[]).forEach(e=>{
      if(e.type==='spot' && e.cat==='stay' && e.checkoutDate===day.date && srcDay.id!==day.id){
        out.push({sourceDay:srcDay, entry:e});
      }
    });
  });
  return out;
}
function renderCheckoutNotice(item, isLast){
  const e=item.entry, src=item.sourceDay;
  const meta=[e.checkoutTime?('出発 '+esc(e.checkoutTime)):'', src.date?('宿泊日 '+esc(src.date)):''].filter(Boolean).join('　');
  const note=e.checkoutMemo?`<div class="checkout-note">${esc(e.checkoutMemo)}</div>`:'';
  const card=`<div class="checkout-card"><div class="checkout-title">↳ チェックアウト：${esc(e.name)}</div>${meta?`<div class="checkout-meta">${meta}</div>`:''}${note}</div>`;
  return `<div class="entry checkout-entry"><div class="tl"><div class="dot dot-stay"></div>${!isLast?'<div class="vl"></div>':''}</div><div class="ecard">${card}</div></div>`;
}


function emptyReservation(){ return {name:'',number:'',time:'',url:'',memo:'',items:''}; }
function normalizeReservation(r){
  r = r && typeof r === 'object' ? r : {};
  return {name:r.name||'', number:r.number||'', time:r.time||'', url:r.url||'', memo:r.memo||'', items:r.items||''};
}
function hasReservation(e){
  const r=normalizeReservation(e && e.reservation);
  return !!(r.name || r.number || r.time || r.url || r.memo || r.items);
}
function reservationKey(dayId,eid){ return dayId+'-'+eid; }
function toggleReservation(dayId,eid){
  const key=reservationKey(dayId,eid);
  openReservationKey = openReservationKey===key ? null : key;
  render();
}
function setReservation(dayId,eid,f,v){
  const d=days.find(x=>x.id===dayId); if(!d) return;
  const e=(d.entries||[]).find(x=>x.id===eid); if(!e) return;
  e.reservation=normalizeReservation(e.reservation);
  e.reservation[f]=v;
  scheduleSave();
  renderBelongings();
}
function renderReservationPanel(dayId,e){
  e.reservation=normalizeReservation(e.reservation);
  const key=reservationKey(dayId,e.id);
  const open=openReservationKey===key;
  const has=hasReservation(e);
  const r=e.reservation;
  const label=has ? '予約情報あり' : '予約情報';
  return `<div class="reservation-box">
    <button class="res-toggle${has?' has-res':''}" onclick="toggleReservation(${dayId},${e.id})">${open?'▾':'▸'} ${label}</button>
    ${open?`<div class="res-panel">
      <input type="text" value="${esc(r.name)}" placeholder="予約名・予約先" oninput="setReservation(${dayId},${e.id},'name',this.value)" />
      <input type="text" value="${esc(r.number)}" placeholder="予約番号・受付番号" oninput="setReservation(${dayId},${e.id},'number',this.value)" />
      <input type="text" value="${esc(r.time)}" placeholder="予約時刻・集合時刻" oninput="setReservation(${dayId},${e.id},'time',this.value)" />
      <input type="url" value="${esc(r.url)}" placeholder="予約ページURL" oninput="setReservation(${dayId},${e.id},'url',this.value)" />
      <textarea rows="2" placeholder="予約メモ（支払状況、キャンセル期限、人数、注意点など）" oninput="setReservation(${dayId},${e.id},'memo',this.value)">${esc(r.memo)}</textarea>
      <textarea rows="2" placeholder="必要なもの（例：QRコード、身分証、タオル、同意書）" oninput="setReservation(${dayId},${e.id},'items',this.value)">${esc(r.items)}</textarea>
    </div>`:''}
  </div>`;
}
function todayString(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function formatTodayLabel(dateStr){ return formatDateForPrint(dateStr || todayString()); }

function renderDayBlock(day){
    if(simpleMode) return renderCompactDayBlock(day, true);
    const dayIndex=days.findIndex(d=>d.id===day.id);
    const collapsed=isDayCollapsed(day.id);
    if(collapsed){
      return `<div class="day-block collapsed" id="day-block-${day.id}">
        <div class="day-hdr">
          <span class="day-label">${esc(day.label)}</span>
          <span class="day-date-inp">${esc(day.date||'')}</span>
          ${day.memo?`<span class="day-memo-inp">${esc(day.memo)}</span>`:''}
          <span class="day-collapsed-summary">折り畳み中：${esc(daySummary(day))}</span>
          <span class="day-order">
            <button class="mini-btn day-fold-btn" onclick="toggleDayCollapse(${day.id})" title="この日程を開く">開く</button>
            <button class="mini-btn" onclick="moveDay(${day.id},-1)" ${dayIndex<=0?'disabled':''} title="この日程を上へ">日↑</button>
            <button class="mini-btn" onclick="moveDay(${day.id},1)" ${dayIndex>=days.length-1?'disabled':''} title="この日程を下へ">日↓</button>
          </span>
        </div>
      </div>`;
    }
    const checkoutItems=checkoutItemsForDay(day);
    const checkoutHtml=checkoutItems.map((item,idx)=>renderCheckoutNotice(item, idx===checkoutItems.length-1 && !(day.entries||[]).length)).join('');
    const body=!(day.entries||[]).length
      ? (checkoutHtml || `<div class="empty-msg" style="padding:12px">↓ 下からスポット・移動を追加してください</div>`)
      : checkoutHtml + day.entries.map((e,i)=>{
          const insertBefore = i===0 ? renderInsertRow(day.id,0,'先頭に追加') : '';
          const last=i===day.entries.length-1;
          const dc=e.type==='transport'?'dot-tr':('dot-'+(e.cat||'sightseeing'));
          let card;
          if(e.type==='spot'){
            const c=CATS[e.cat]||CATS.sightseeing;
            const hu=e.url&&e.url.startsWith('http');
            card=`<div class="spot-card cat-${esc(e.cat||'sightseeing')}">
              <div class="spot-r1">
                <select class="cat-sel ${c.cls}" title="分類" onchange="setEntryR(${day.id},${e.id},'cat',this.value)">${catOptions(e.cat||'sightseeing')}</select>
                <input class="spot-name-edit" type="text" value="${esc(e.name)}" title="スポット名を編集" onchange="updateEntrySpotName(${day.id},${e.id},this.value)" />
              </div>
              <div class="card-actions">
                <details class="card-more">
                  <summary aria-label="${esc(e.name||'スポット')}のその他の操作">その他</summary>
                  <div class="card-more-menu">
                    <button class="map-btn" onclick="openGoogleMapForEntry(${day.id},${e.id})">Googleマップ</button>
                    <button class="map-btn" onclick="openGoogleSearchForEntry(${day.id},${e.id})">Google検索</button>
                    <span class="order-btns"><button class="mini-btn" onclick="moveEntry(${day.id},${e.id},-1)" title="上へ"><span class="desktop-action-label">↑</span><span class="mobile-action-label">↑ 上へ</span></button><button class="mini-btn" onclick="moveEntry(${day.id},${e.id},1)" title="下へ"><span class="desktop-action-label">↓</span><span class="mobile-action-label">↓ 下へ</span></button></span>
                    <button class="icon-btn danger-action" onclick="delEntry(${day.id},${e.id})" title="削除"><span class="desktop-action-label">✕</span><span class="mobile-action-label">✕ この予定を削除</span></button>
                  </div>
                </details>
              </div>
              <div class="time-row">
                <span class="time-lbl">到着</span>
                <input class="time-inp" type="time" value="${esc(e.arrive||'')}" oninput="setEntry(${day.id},${e.id},'arrive',this.value)" onchange="setEntry(${day.id},${e.id},'arrive',this.value)" />
                ${e.cat==='stay'?'':`<span class="time-lbl">出発</span>
                <input class="time-inp" type="time" value="${esc(e.leave||'')}" oninput="setEntry(${day.id},${e.id},'leave',this.value)" onchange="setEntry(${day.id},${e.id},'leave',this.value)" />`}
                ${!last?`<label class="quick-drive">次への移動 <input type="text" value="${esc(e.nextMove||'')}" placeholder="例：徒歩10分、バス約20分" oninput="setEntry(${day.id},${e.id},'nextMove',this.value)" /></label>`:''}
                <textarea class="note-inp" rows="1" placeholder="メモ" oninput="setEntry(${day.id},${e.id},'note',this.value)">${esc(e.note||'')}</textarea>
              </div>
              <div class="time-row">
                <span class="time-lbl">費用</span>
                <input class="time-inp" type="number" min="0" step="${curStep()}" inputmode="${curCfg().minor>0?'decimal':'numeric'}" style="width:120px" value="${e.cost?esc(String(e.cost)):''}" placeholder="任意" oninput="setEntry(${day.id},${e.id},'cost',this.value)" />
                <span class="time-lbl">${esc(curCfg().symbol)}（入場料・食事代など）</span>
              </div>
              ${e.cat==='stay'?`<div class="stay-extra-row">
                <span class="stay-extra-label">宿泊またぎ</span>
                <span class="time-lbl">チェックアウト日</span>
                <input class="day-date-inp" type="date" value="${esc(e.checkoutDate||'')}" onchange="setEntry(${day.id},${e.id},'checkoutDate',this.value)" />
                <span class="time-lbl">出発</span>
                <input class="time-inp" type="time" value="${esc(e.checkoutTime||'')}" oninput="setEntry(${day.id},${e.id},'checkoutTime',this.value)" onchange="setEntry(${day.id},${e.id},'checkoutTime',this.value)" onblur="setEntryR(${day.id},${e.id},'checkoutTime',this.value)" />
                <textarea class="note-inp checkout-note-inp" rows="1" placeholder="チェックアウトメモ" oninput="setEntry(${day.id},${e.id},'checkoutMemo',this.value)">${esc(e.checkoutMemo||'')}</textarea>
                <button class="mini-btn" onclick="setEntry(${day.id},${e.id},'checkoutDate','');setEntry(${day.id},${e.id},'checkoutTime','');setEntry(${day.id},${e.id},'checkoutMemo','');renderDays();" title="チェックアウト表示を解除">解除</button>
              </div>`:''}
              <div class="url-row">
                <div class="url-field">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--hint)"><path d="M12.5 7.5l-5 5M8 5.5l1-1a3.536 3.536 0 115 5l-1 1M11 14.5l-1 1a3.536 3.536 0 11-5-5l1-1"/></svg>
                  <input class="url-inp" type="url" value="${esc(e.url)}" placeholder="URLをペースト" oninput="setEntry(${day.id},${e.id},'url',this.value)" />
                  ${hu?`<a class="url-open" href="${esc(e.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 3h6v6M17 3l-8 8M9 5H5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-4"/></svg></a>`:''}
                </div>
              </div>
              ${renderReservationPanel(day.id,e)}
            </div>`;
          } else {
            const m=TR.find(x=>x.val===e.mode)||TR[0];
            const opts=TR.map(x=>`<option value="${x.val}"${e.mode===x.val?' selected':''}>${x.sym} ${x.label}</option>`).join('');
            const customMode=e.mode==='other' ? `<input class="tr-place tr-custom" type="text" value="${esc(e.modeText||'')}" placeholder="移動手段" oninput="setEntry(${day.id},${e.id},'modeText',this.value)" />` : '';
            const hu=e.url&&e.url.startsWith('http');
            card=`<div class="tr-card">
              <div class="tr-r1">
                <select class="tr-sel" onchange="setEntryR(${day.id},${e.id},'mode',this.value)">${opts}</select>
                ${customMode}
                <input class="tr-place" type="text" value="${esc(e.from||'')}" placeholder="出発地" oninput="setEntry(${day.id},${e.id},'from',this.value)" />
                <span class="tr-arrow">→</span>
                <input class="tr-place" type="text" value="${esc(e.to||'')}" placeholder="目的地" oninput="setEntry(${day.id},${e.id},'to',this.value)" />
                <span class="time-lbl">出発</span>
                <input class="tr-time" type="time" value="${esc(e.depart||'')}" oninput="setEntry(${day.id},${e.id},'depart',this.value)" onchange="setEntry(${day.id},${e.id},'depart',this.value)" />
                <span class="time-lbl">到着</span>
                <input class="tr-time" type="time" value="${esc(e.arrive||'')}" oninput="setEntry(${day.id},${e.id},'arrive',this.value)" onchange="setEntry(${day.id},${e.id},'arrive',this.value)" />
                <input class="tr-dur" type="text" value="${esc(e.duration||'')}" placeholder="所要時間" oninput="setEntry(${day.id},${e.id},'duration',this.value)" />
              </div>
              <div class="card-actions">
                <details class="card-more">
                  <summary aria-label="移動予定のその他の操作">その他</summary>
                  <div class="card-more-menu">
                    <button class="map-btn" onclick="openMapForEntry(${day.id},${e.id})">Googleマップ</button>
                    <span class="order-btns"><button class="mini-btn" onclick="moveEntry(${day.id},${e.id},-1)" title="上へ"><span class="desktop-action-label">↑</span><span class="mobile-action-label">↑ 上へ</span></button><button class="mini-btn" onclick="moveEntry(${day.id},${e.id},1)" title="下へ"><span class="desktop-action-label">↓</span><span class="mobile-action-label">↓ 下へ</span></button></span>
                    <button class="icon-btn danger-action" onclick="delEntry(${day.id},${e.id})" title="削除"><span class="desktop-action-label">✕</span><span class="mobile-action-label">✕ この移動を削除</span></button>
                  </div>
                </details>
              </div>
              <div class="tr-memo-row">
                <span class="tr-memo-label">移動メモ</span>
                <textarea class="tr-note" rows="1" placeholder="乗り場・予約番号・注意点など" oninput="setEntry(${day.id},${e.id},'note',this.value)">${esc(e.note||'')}</textarea>
              </div>
              <div class="tr-memo-row">
                <span class="tr-memo-label">費用</span>
                <input class="tr-time" type="number" min="0" step="${curStep()}" inputmode="${curCfg().minor>0?'decimal':'numeric'}" style="width:120px" value="${e.cost?esc(String(e.cost)):''}" placeholder="任意" oninput="setEntry(${day.id},${e.id},'cost',this.value)" />
                <span class="tr-memo-label">${esc(curCfg().symbol)}（運賃・高速代など）</span>
              </div>
              <div class="tr-r2">
                <div class="url-field">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--hint)"><path d="M12.5 7.5l-5 5M8 5.5l1-1a3.536 3.536 0 115 5l-1 1M11 14.5l-1 1a3.536 3.536 0 11-5-5l1-1"/></svg>
                  <input class="url-inp" type="url" value="${esc(e.url)}" placeholder="URLをペースト（予約ページなど）" oninput="setEntry(${day.id},${e.id},'url',this.value)" />
                  ${hu?`<a class="url-open" href="${esc(e.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 3h6v6M17 3l-8 8M9 5H5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-4"/></svg></a>`:''}
                </div>
              </div>
              ${renderReservationPanel(day.id,e)}
            </div>`;
          }
          return `${insertBefore}<div class="entry">
            <div class="tl"><div class="dot ${dc}"></div>${!last?'<div class="vl"></div>':''}</div>
            <div class="ecard">${card}</div>
          </div>${renderInsertRow(day.id,i+1,last?'末尾に追加':'ここに追加')}`;
        }).join('');
    return `<div class="day-block" id="day-block-${day.id}">
      <div class="day-hdr">
        <span class="day-label">${esc(day.label)}</span>
        <input class="day-date-inp" type="date" value="${esc(day.date||'')}" onchange="setDay(${day.id},'date',this.value)" />
        <input class="day-memo-inp" type="text" value="${esc(day.memo||'')}" placeholder="メモ（例：移動日、観光メイン、ホテル周辺）" oninput="setDay(${day.id},'memo',this.value)" />
        <span class="day-order">
          <button class="mini-btn day-fold-btn" onclick="toggleDayCollapse(${day.id})" title="この日程を折り畳む">閉じる</button>
          <button class="mini-btn" onclick="moveDay(${day.id},-1)" ${dayIndex<=0?'disabled':''} title="この日程を上へ">日↑</button>
          <button class="mini-btn" onclick="moveDay(${day.id},1)" ${dayIndex>=days.length-1?'disabled':''} title="この日程を下へ">日↓</button>
        </span>
      </div>
      <div class="day-body">${body}${dayCostNote(day)}</div>
      <div class="add-row">
        <input type="text" id="sp-${day.id}" placeholder="スポット・観光地を直接入力" onkeydown="if(event.key==='Enter')addSpot(${day.id})" />
        <button class="add-spot-btn" onclick="addSpot(${day.id})">＋ スポット</button>
        <button class="add-tr-btn" onclick="addTr(${day.id})">＋ 移動</button>
      </div>
    </div>`;

}

function dayCost(day){ return (day.entries||[]).reduce((s,e)=>s+(Number(e.cost)||0),0); }
function tripCost(){ return days.reduce((s,d)=>s+dayCost(d),0); }
function dayCostNote(day){
  const c=dayCost(day);
  return c>0 ? `<div class="checkout-meta" style="text-align:right;padding:4px 8px;font-weight:700;color:var(--teal-d)">この日の概算費用：${yen(c)}</div>` : '';
}
function renderDays(){
  cleanupScheduledRefs();
  collapsedDayIds = new Set([...collapsedDayIds].filter(id=>days.some(d=>d.id===id)));
  saveCollapsedDays();
  renderDayJumpBar();
  updateSimpleModeButton();
  const daysEl=document.getElementById('days');
  if(!days.length){
    daysEl.innerHTML='<div class="empty-msg" style="padding:18px">まだ日程がありません。「＋ 日を追加」から作成してください</div>';
    return;
  }
  const total=tripCost();
  const totalHtml = total>0 ? `<div class="tool-note" style="font-weight:600;color:var(--teal-d)">旅行全体の概算費用：${yen(total)}（各スポット・移動の費用欄の合計。精算タブの実支払いとは別の、計画用の目安です）</div>` : '';
  daysEl.innerHTML=totalHtml+days.map(day=>renderDayBlock(day)).join('');
}

function renderCompactDayBlock(day, withId=false){
  const checkoutItems=checkoutItemsForDay(day);
  const checkoutHtml=checkoutItems.map(item=>{
    const e=item.entry, src=item.sourceDay;
    const meta=[e.checkoutTime?('出発 '+esc(e.checkoutTime)):'', src.date?('宿泊日 '+esc(src.date)):''].filter(Boolean).join('　');
    return `<div class="entry checkout-entry"><div class="tl"><div class="dot dot-stay"></div></div><div class="ecard"><div class="checkout-card"><div class="checkout-title">↳ チェックアウト：${esc(e.name)}</div>${meta?`<div class="checkout-meta">${meta}</div>`:''}${e.checkoutMemo?`<div class="checkout-note">${esc(e.checkoutMemo)}</div>`:''}</div></div></div>`;
  }).join('');
  const entries=(day.entries||[]).map((e,i)=>{
    const last=i===day.entries.length-1;
    const dc=e.type==='transport'?'dot-tr':('dot-'+(e.cat||'sightseeing'));
    let card='';
    if(e.type==='spot'){
      const c=CATS[e.cat]||CATS.sightseeing;
      const time=[e.arrive?('到着 '+esc(e.arrive)):'', (e.cat!=='stay' && e.leave)?('出発 '+esc(e.leave)):'', (e.cat==='stay' && e.checkoutDate)?('チェックアウト '+esc(formatDateForPrint(e.checkoutDate))+(e.checkoutTime?' '+esc(e.checkoutTime):'')):'', (!last && String(e.nextMove||'').trim())?('次へ '+esc(e.nextMove)):'' ].filter(Boolean).join('　');
      const res=hasReservation(e)?'<span class="compact-badge">予約あり</span>':'';
      const link=isSafeHttpUrl(e.url)?`<button class="map-btn" data-url="${esc(e.url)}" onclick="openUrlFromButton(this)">リンク</button>`:'';
      const badges=(res||link)?`<div class="compact-badges">${res}${link}</div>`:'';
      card=`<div class="spot-card cat-${esc(e.cat||'sightseeing')}"><div class="spot-r1"><span class="tag ${c.cls}">${c.label}</span><span class="spot-name">${esc(e.name)}</span></div><div class="card-actions"><details class="card-more"><summary aria-label="${esc(e.name||'スポット')}の地図操作">地図</summary><div class="card-more-menu"><button class="map-btn" onclick="openGoogleMapForEntry(${day.id},${e.id})">Googleマップ</button><button class="map-btn" onclick="openGoogleSearchForEntry(${day.id},${e.id})">Google検索</button></div></details></div>${time?`<div class="checkout-meta">${time}</div>`:''}${e.note?`<div class="compact-note">${esc(e.note)}</div>`:''}${badges}</div>`;
    }else{
      const m=TR.find(x=>x.val===e.mode)||TR[0];
      const route=[e.from||'', e.to||''].filter(Boolean).map(esc).join(' → ');
      const time=[e.depart?('出発 '+esc(e.depart)):'', e.arrive?('到着 '+esc(e.arrive)):'', e.duration?('所要 '+esc(e.duration)):''].filter(Boolean).join('　');
      const res=hasReservation(e)?'<span class="compact-badge">予約あり</span>':'';
      const link=isSafeHttpUrl(e.url)?`<button class="map-btn" data-url="${esc(e.url)}" onclick="openUrlFromButton(this)">リンク</button>`:'';
      const badges=(res||link)?`<div class="compact-badges">${res}${link}</div>`:'';
      card=`<div class="tr-card"><div class="tr-r1"><span class="tr-sel" style="border:none;background:transparent;padding-left:0">${esc(m.sym+' '+(e.mode==='other'&&e.modeText?e.modeText:m.label))}</span>${route?`<span class="spot-name">${route}</span>`:''}</div><div class="card-actions"><details class="card-more"><summary aria-label="移動ルートの地図操作">地図</summary><div class="card-more-menu"><button class="map-btn" onclick="openMapForEntry(${day.id},${e.id})">Googleマップ</button></div></details></div>${time?`<div class="checkout-meta">${time}</div>`:''}${e.note?`<div class="compact-note">${esc(e.note)}</div>`:''}${badges}</div>`;
    }
    return `<div class="entry"><div class="tl"><div class="dot ${dc}"></div>${!last?'<div class="vl"></div>':''}</div><div class="ecard">${card}</div></div>`;
  }).join('');
  const body=checkoutHtml + (entries || '<div class="empty-msg" style="padding:12px">今日の予定カードはありません。</div>');
  const idAttr = withId ? ` id="day-block-${day.id}"` : '';
  const collapsed = withId && isDayCollapsed(day.id);
  if(collapsed){
    return `<div class="day-block collapsed"${idAttr}><div class="day-hdr"><span class="day-label">${esc(day.label)}</span><span class="day-date-inp">${esc(day.date||'')}</span>${day.memo?`<span class="day-memo-inp">${esc(day.memo)}</span>`:''}<span class="day-collapsed-summary">折り畳み中：${esc(daySummary(day))}</span><span class="day-order"><button class="mini-btn day-fold-btn" onclick="toggleDayCollapse(${day.id})" title="この日程を開く">開く</button></span></div></div>`;
  }
  return `<div class="day-block"${idAttr}><div class="day-hdr"><span class="day-label">${esc(day.label)}</span><span class="day-date-inp">${esc(day.date||'')}</span>${day.memo?`<span class="day-memo-inp">${esc(day.memo)}</span>`:''}${withId?`<span class="day-order"><button class="mini-btn day-fold-btn" onclick="toggleDayCollapse(${day.id})" title="この日程を折り畳む">閉じる</button></span>`:''}</div><div class="day-body">${body}${dayCostNote(day)}</div></div>`;
}
function renderTodayDayBlock(day){ return renderCompactDayBlock(day, false); }

function renderToday(){
  const el=document.getElementById('today-days');
  if(!el) return;
  const today=todayString();
  const matched=days.filter(d=>d.date===today);
  if(!matched.length){
    const hasDates=days.some(d=>d.date);
    el.innerHTML=`<div class="today-date-note">今日：${esc(formatTodayLabel(today))}</div><div class="empty-msg" style="padding:18px">${hasDates?'今日の日付に一致する予定はありません。':'日付がまだ設定されていません。旅程タブで各日の旅行日を入れてください。'}</div>`;
    return;
  }
  el.innerHTML=`<div class="today-date-note">今日：${esc(formatTodayLabel(today))}</div>` + matched.map(day=>renderTodayDayBlock(day)).join('');
}


function splitNeededItems(text){
  return String(text||'')
    .split(/[\n,、]/)
    .map(x=>x.trim())
    .filter(Boolean);
}
function entryDisplayTitle(e){
  if(!e) return '';
  if(e.type==='transport'){
    const mode=modeLabel(e.mode,e.modeText);
    const route=[e.from||'', e.to||''].filter(Boolean).join(' → ');
    return route ? `${mode}：${route}` : mode;
  }
  return e.name || 'スポット';
}
function entryTimeSummary(e){
  if(!e) return '';
  if(e.type==='transport'){
    return [e.depart?('出発 '+e.depart):'', e.arrive?('到着 '+e.arrive):'', e.duration?('所要 '+e.duration):''].filter(Boolean).join('　');
  }
  return [e.arrive?('到着 '+e.arrive):'', (e.cat!=='stay' && e.leave)?('出発 '+e.leave):'', (e.cat==='stay' && e.checkoutDate)?('チェックアウト '+formatShortDate(e.checkoutDate)+(e.checkoutTime?' '+e.checkoutTime:'')):''].filter(Boolean).join('　');
}
function collectNeededItems(){
  const out=[];
  days.forEach(day=>{
    (day.entries||[]).forEach(e=>{
      const r=normalizeReservation(e.reservation);
      if(!r.items || !r.items.trim()) return;
      out.push({day, entry:e, reservation:r, items:splitNeededItems(r.items)});
    });
  });
  return out;
}
function renderBelongings(){
  const el=document.getElementById('needed-list');
  if(!el) return;
  const rows=collectNeededItems();
  if(!rows.length){
    el.innerHTML='<div class="empty-msg" style="padding:18px">予約情報の「必要なもの」に入力された内容はまだありません。</div>';
    return;
  }
  const total=rows.reduce((sum,r)=>sum+(r.items.length||1),0);
  const cards=rows.map(row=>{
    const dayText=[row.day.label||'', row.day.date?formatShortDate(row.day.date):''].filter(Boolean).join(' ');
    const title=entryDisplayTitle(row.entry);
    const time=entryTimeSummary(row.entry);
    const res=[row.reservation.name?('予約先：'+esc(row.reservation.name)):'', row.reservation.number?('番号：'+esc(row.reservation.number)):'', row.reservation.time?('時刻：'+esc(row.reservation.time)):'', time?esc(time):''].filter(Boolean).join('　');
    const chips=row.items.length ? `<div class="needed-items">${row.items.map(item=>`<span class="needed-chip">${esc(item)}</span>`).join('')}</div>` : `<div class="needed-raw">${esc(row.reservation.items)}</div>`;
    return `<div class="needed-card"><div class="needed-r1"><span class="needed-day">${esc(dayText||'日付未設定')}</span><span class="needed-title">${esc(title)}</span><button class="map-btn" onclick="showTab('plan');setTimeout(()=>jumpToDay(${row.day.id}),0)">日程へ</button></div>${res?`<div class="needed-meta">${res}</div>`:''}${chips}</div>`;
  }).join('');
  el.innerHTML=`<div class="items-summary">予約に紐づく必要物品：${rows.length}件の予約 / ${total}項目</div>${cards}`;
}

function yen(value){
  const cfg=curCfg();
  const n=Number(value)||0;
  return cfg.symbol+n.toLocaleString(cfg.locale,{minimumFractionDigits:cfg.minor,maximumFractionDigits:cfg.minor});
}
function memberById(id){ return members.find(m=>m.id===Number(id)); }
function addSettlementMember(){
  const input=document.getElementById('settle-member-name');
  const name=(input?.value||'').trim();
  if(!name){ showToast('メンバー名を入力してください'); input?.focus(); return; }
  if(members.some(m=>m.name===name)){ showToast('同じ名前のメンバーがいます'); return; }
  members.push({id:nmid++,name});
  if(input) input.value='';
  renderSettlement();
  scheduleSave();
}
function removeSettlementMember(id){
  id=Number(id);
  if(expenses.some(x=>x.payerId===id || x.participantIds.includes(id))){
    showToast('このメンバーを使った支払いを先に削除してください');
    return;
  }
  members=members.filter(m=>m.id!==id);
  renderSettlement();
  scheduleSave();
}
function settlementPlaceRows(){
  const out=[];
  days.forEach(day=>(day.entries||[]).forEach(entry=>{
    out.push({dayId:day.id,entryId:entry.id,label:entryDisplayTitle(entry),dayLabel:[day.label,day.date?formatShortDate(day.date):''].filter(Boolean).join(' ')});
  }));
  return out;
}
function settlementPlaceOptions(){
  const rows=settlementPlaceRows();
  return '<option value="">自由入力</option>'+rows.map(r=>`<option value="${r.dayId}:${r.entryId}">${esc(r.dayLabel+' / '+r.label)}</option>`).join('');
}
function expensePlaceChanged(select){
  const [dayId,entryId]=String(select.value||'').split(':').map(Number);
  const row=settlementPlaceRows().find(r=>r.dayId===dayId&&r.entryId===entryId);
  const input=document.getElementById('expense-label');
  if(row&&input) input.value=row.label;
}
function addExpense(){
  if(members.length<1){ showToast('先に旅行メンバーを追加してください'); return; }
  const label=(document.getElementById('expense-label')?.value||'').trim();
  const amount=roundMoney(Number(document.getElementById('expense-amount')?.value)||0);
  const payerId=Number(document.getElementById('expense-payer')?.value);
  const participantIds=[...document.querySelectorAll('[data-expense-person]:checked')].map(el=>Number(el.value));
  const note=(document.getElementById('expense-note')?.value||'').trim();
  const date=(document.getElementById('expense-date')?.value||todayString());
  const placeValue=document.getElementById('expense-place')?.value||'';
  const [dayId,entryId]=placeValue.split(':').map(Number);
  if(!label){ showToast('支払い内容・場所を入力してください'); return; }
  if(amount<=0){ showToast('金額を正しく入力してください'); return; }
  if(!memberById(payerId)){ showToast('支払った人を選択してください'); return; }
  if(!participantIds.length){ showToast('負担する人を1人以上選択してください'); return; }
  const weights={};
  participantIds.forEach(id=>{
    const wEl=document.querySelector(`[data-expense-weight="${id}"]`);
    const w=wEl?Number(wEl.value):1;
    weights[id]=Number.isFinite(w)&&w>=0?w:1;
  });
  const usedWeights=participantIds.map(id=>weights[id]);
  const splitMode=(new Set(usedWeights).size>1) ? 'weight' : 'equal';
  if(splitMode==='weight' && usedWeights.every(w=>w===0)){ showToast('割合がすべて0です。1人以上に1以上を設定してください'); return; }
  expenses.push({id:nxid++,label,amount,payerId,participantIds,splitMode,weights:splitMode==='weight'?weights:{},note,date,dayId:dayId||null,entryId:entryId||null});
  renderSettlement();
  scheduleSave();
  showToast('支払いを登録しました');
}
function updateExpenseDate(id,value){
  const expense=expenses.find(x=>x.id===Number(id));
  if(!expense) return;
  expense.date=/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  scheduleSave();
}
function removeExpense(id){
  expenses=expenses.filter(x=>x.id!==Number(id));
  renderSettlement();
  scheduleSave();
}
// 各参加者の負担額を「通貨の最小単位（円なら1円、ドルなら1セント）」の整数で返す。
// splitMode==='weight' のときは weights の比率で配分し、端数は小数部の大きい人へ順に割り当てる。
function expenseSharesUnits(expense){
  const ids=expense.participantIds.filter(id=>memberById(id));
  if(!ids.length) return new Map();
  const totalUnits=moneyToUnits(expense.amount);
  let weights;
  if(expense.splitMode==='weight' && expense.weights){
    weights=ids.map(id=>{ const w=Number(expense.weights[id]); return Number.isFinite(w)&&w>0?w:0; });
    if(weights.every(w=>w===0)) weights=ids.map(()=>1);
  } else {
    weights=ids.map(()=>1);
  }
  const weightSum=weights.reduce((a,b)=>a+b,0);
  const raw=ids.map((id,i)=>totalUnits*weights[i]/weightSum);
  const units=raw.map(Math.floor);
  let remainder=totalUnits-units.reduce((a,b)=>a+b,0);
  const order=ids.map((id,i)=>({i,frac:raw[i]-units[i]})).sort((a,b)=>b.frac-a.frac);
  for(let k=0; k<remainder && order.length; k++){ units[order[k%order.length].i]+=1; }
  const shares=new Map();
  ids.forEach((id,i)=>shares.set(id,units[i]));
  return shares;
}
// 表示用：最小単位を実際の金額（円・ドルなど）に戻したもの
function expenseShares(expense){
  const f=curFactor();
  const out=new Map();
  expenseSharesUnits(expense).forEach((u,id)=>out.set(id,u/f));
  return out;
}
function settlementCalculation(){
  // 計算はすべて最小単位の整数で行い、最後に金額へ戻す（小数の誤差を防ぐ）
  const f=curFactor();
  const balanceUnits=new Map(members.map(m=>[m.id,0]));
  expenses.forEach(expense=>{
    if(!balanceUnits.has(expense.payerId)) return;
    balanceUnits.set(expense.payerId,balanceUnits.get(expense.payerId)+moneyToUnits(expense.amount));
    expenseSharesUnits(expense).forEach((units,id)=>balanceUnits.set(id,(balanceUnits.get(id)||0)-units));
  });
  const balance=new Map([...balanceUnits].map(([id,u])=>[id,u/f]));
  const creditors=[...balanceUnits].filter(([,v])=>v>0).map(([id,value])=>({id,value})).sort((a,b)=>b.value-a.value);
  const debtors=[...balanceUnits].filter(([,v])=>v<0).map(([id,value])=>({id,value:-value})).sort((a,b)=>b.value-a.value);
  const transfers=[];
  let ci=0,di=0;
  while(ci<creditors.length&&di<debtors.length){
    const amount=Math.min(creditors[ci].value,debtors[di].value);
    if(amount>0) transfers.push({fromId:debtors[di].id,toId:creditors[ci].id,amount:amount/f});
    creditors[ci].value-=amount;
    debtors[di].value-=amount;
    if(creditors[ci].value===0) ci++;
    if(debtors[di].value===0) di++;
  }
  return {balance,transfers};
}
function renderSettlement(){
  const membersEl=document.getElementById('settle-members');
  const formEl=document.getElementById('expense-form-area');
  const listEl=document.getElementById('expense-list');
  const resultEl=document.getElementById('settlement-result');
  if(!membersEl||!formEl||!listEl||!resultEl) return;
  const curSel=document.getElementById('trip-currency');
  if(curSel) curSel.innerHTML=Object.values(CURRENCIES).map(c=>`<option value="${c.code}"${c.code===tripCurrency?' selected':''}>${esc(c.label)}</option>`).join('');
  membersEl.innerHTML=members.length
    ? members.map(m=>`<span class="member-chip">${esc(m.name)}<button onclick="removeSettlementMember(${m.id})" title="削除">×</button></span>`).join('')
    : '<span class="empty-msg">メンバーを追加してください。</span>';
  if(!members.length){
    formEl.innerHTML='<div class="empty-msg">支払いを登録するには、先に旅行メンバーを追加してください。</div>';
  }else{
    const cfg=curCfg();
    const memberOptions=members.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
    const checks=members.map(m=>`<label class="expense-person"><input type="checkbox" data-expense-person value="${m.id}" checked>${esc(m.name)}</label>`).join('');
    const weightRows=members.map(m=>`<label class="expense-person"><span>${esc(m.name)}</span><input type="number" class="expense-weight" data-expense-weight="${m.id}" min="0" step="1" value="1" style="width:54px;margin-left:4px"></label>`).join('');
    formEl.innerHTML=`<div class="expense-form">
      <label class="expense-field"><span class="expense-field-label">支払日</span><input id="expense-date" type="date" value="${todayString()}" /></label>
      <label class="expense-field"><span class="expense-field-label">旅程の場所</span><select id="expense-place" onchange="expensePlaceChanged(this)">${settlementPlaceOptions()}</select></label>
      <label class="expense-field"><span class="expense-field-label">支払った人</span><select id="expense-payer">${memberOptions}</select></label>
      <label class="expense-field"><span class="expense-field-label">金額（${esc(cfg.symbol)}）</span><input id="expense-amount" type="number" min="${curStep()}" step="${curStep()}" inputmode="${cfg.minor>0?'decimal':'numeric'}" placeholder="${cfg.minor>0?'例：120.00':'例：12000'}" /></label>
      <label class="expense-field expense-note"><span class="expense-field-label">支払い内容・場所</span><input id="expense-label" type="text" placeholder="例：入場料、夕食、高速料金" /></label>
      <label class="expense-field expense-note"><span class="expense-field-label">メモ（任意）</span><input id="expense-note" type="text" placeholder="例：クーポン利用、現金払い" /></label>
      <div class="expense-participants"><strong style="font-size:12px;width:100%">負担する人</strong>${checks}</div>
      <details class="expense-participants" style="display:block"><summary style="cursor:pointer;font-size:12px;font-weight:700">負担の割合を調整（任意・通常は均等割り）</summary>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${weightRows}</div>
        <div class="geocode-help" style="margin-top:4px">数字の比で負担を分けます（例：2と1なら2対1）。0にするとその人は負担なし。上の「負担する人」にチェックが入っている人だけが対象です。</div>
      </details>
      <div class="expense-actions"><button class="expense-add-btn" onclick="addExpense()">支払いを登録</button></div>
    </div>`;
  }
  listEl.innerHTML=expenses.length ? expenses.map(x=>{
    const payer=memberById(x.payerId);
    const participantNames=x.participantIds.map(id=>memberById(id)?.name).filter(Boolean);
    const shares=expenseShares(x);
    const shareText=x.participantIds.map(id=>{const m=memberById(id);return m?`${m.name} ${yen(shares.get(id)||0)}`:'';}).filter(Boolean).join(' / ');
    const splitNote=x.splitMode==='weight'?'（割合指定）':'';
    return `<div class="expense-card"><div class="expense-r1"><span class="expense-place">${esc(x.label)}</span><span class="expense-amount">${yen(x.amount)}</span><input class="day-date-inp" type="date" value="${esc(x.date||'')}" title="支払日" onchange="updateExpenseDate(${x.id},this.value)" /><button class="mini-btn" onclick="removeExpense(${x.id})">削除</button></div><div class="expense-meta">支払者：${esc(payer?.name||'不明')}　負担者：${esc(participantNames.join('、'))}${splitNote}${x.note?'　メモ：'+esc(x.note):''}<br>内訳：${esc(shareText)}</div></div>`;
  }).join('') : '<div class="empty-msg">支払いはまだ登録されていません。</div>';
  const total=expenses.reduce((sum,x)=>sum+moneyToUnits(x.amount),0)/curFactor();
  const calc=settlementCalculation();
  const balances=members.map(m=>{
    const value=calc.balance.get(m.id)||0;
    const cls=value>0?'balance-plus':value<0?'balance-minus':'';
    const text=value>0?`受取 ${yen(value)}`:value<0?`支払 ${yen(-value)}`:'精算なし';
    return `<div class="balance-card"><div class="balance-name">${esc(m.name)}</div><div class="balance-value ${cls}">${text}</div></div>`;
  }).join('');
  const transfers=calc.transfers.map(t=>`<div class="transfer-card"><strong>${esc(memberById(t.fromId)?.name||'不明')}</strong><span class="transfer-arrow">→</span><strong>${esc(memberById(t.toId)?.name||'不明')}</strong><span class="transfer-amount">${yen(t.amount)}</span></div>`).join('');
  resultEl.innerHTML=`<div class="settle-total">登録支払い合計：${yen(total)} / ${expenses.length}件</div>${members.length?`<div class="settle-summary">${balances}</div>`:''}${transfers||'<div class="empty-msg">現在、必要な送金はありません。</div>'}`;
}


function render(){renderOnboardingBanner();renderWishes();renderDays();renderToday();renderBelongings();renderSettlement();}
function renderOnboardingBanner(){
  const el=document.getElementById('onboarding-banner');
  if(!el) return;
  let seen=false;
  try{ seen = localStorage.getItem(ONBOARDING_SEEN_KEY)==='1'; }catch(e){}
  const isEmpty = wishes.length===0 && days.length===0;
  el.style.display = (!seen && isEmpty) ? '' : 'none';
}
function dismissOnboarding(){
  try{ localStorage.setItem(ONBOARDING_SEEN_KEY,'1'); }catch(e){}
  renderOnboardingBanner();
}
function loadSampleTrip(){
  if(wishes.length || days.length || members.length || expenses.length){
    if(!confirm('現在のデータをサンプルデータで置き換えます。よろしいですか？')) return;
  }
  document.getElementById('trip-title').value='サンプル旅行プラン（北海道3日間）';
  tripCurrency='JPY';
  wishes=[
    {id:1,name:'富良野ラベンダー畑',cat:'nature',url:'',memo:'7〜8月が見頃',conflictMemo:'',scheduledRefs:[]},
    {id:2,name:'白金 青い池',cat:'nature',url:'',memo:'午前中が綺麗',conflictMemo:'',scheduledRefs:[]},
    {id:3,name:'札幌スープカレー店',cat:'food',url:'',memo:'予約推奨',conflictMemo:'',scheduledRefs:[]}
  ];
  days=[
    {id:1,date:'',memo:'札幌入り・市内観光',entries:[
      {id:1,type:'spot',name:'大通公園',cat:'sightseeing',arrive:'',leave:'',nextMove:'徒歩10分',checkoutDate:'',checkoutTime:'',checkoutMemo:'',cost:'',note:'',url:'',reservation:''},
      {id:2,type:'transport',mode:'train',customMode:'',from:'札幌',to:'美瑛',depart:'',arrive:'',duration:'1時間30分',note:'乗り場・予約番号など',cost:'',url:'',reservation:''}
    ]},
    {id:2,date:'',memo:'美瑛・富良野エリア',entries:[
      {id:3,type:'spot',name:'美瑛の丘',cat:'nature',arrive:'',leave:'',nextMove:'',checkoutDate:'',checkoutTime:'',checkoutMemo:'',cost:'',note:'',url:'',reservation:''}
    ]},
    {id:3,date:'',memo:'帰路',entries:[]}
  ];
  members=[{id:1,name:'自分'},{id:2,name:'友人'}];
  expenses=[{id:1,label:'ホテル代',amount:20000,payerId:1,participantIds:[1,2],splitMode:'equal',weights:{}}];
  normalizeData(); refreshIds();
  dismissOnboarding();
  save(); render();
  showToast('サンプルデータを読み込みました。試したあとは「データ管理」→「リセット」で消せます');
}


// ── backup / import / maps ───────────────────────────
function safeTitle(){
  return (document.getElementById('trip-title').value.trim()||'旅行プラン').replace(/[\s\/\\:*?"<>|]/g,'_');
}
function backupPayload(){
  return {app:'travel-planner',version:19,exportedAt:new Date().toISOString(),title:document.getElementById('trip-title').value,currency:tripCurrency,wishes,days,members,expenses};
}
function backupFilename(){
  return safeTitle()+'_バックアップ.json';
}
function backupJSONText(){
  return JSON.stringify(backupPayload(),null,2);
}
function downloadTextFile(filename, text, type){
  const blob=new Blob([text],{type:type||'application/json'});
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJSON(){
  try{
    save();
    downloadTextFile(backupFilename(), backupJSONText(), 'application/json');
    showToast('JSONバックアップを保存しました');
  }catch(e){showToast('JSON保存に失敗しました');}
}
async function shareJSON(){
  try{
    save();
    const filename=backupFilename();
    const text=backupJSONText();
    const blob=new Blob([text],{type:'application/json'});
    const title=document.getElementById('trip-title').value.trim()||'旅行プラン';
    if(navigator.share && typeof File!=='undefined'){
      const file=new File([blob], filename, {type:'application/json'});
      if(!navigator.canShare || navigator.canShare({files:[file]})){
        await navigator.share({title:title, text:'旅行プランのバックアップJSONです。同じHTMLの「読込」から取り込めます。', files:[file]});
        showToast('共有メニューを開きました');
        return;
      }
    }
    if(navigator.share){
      await navigator.share({title:title, text:'旅行プランの共有です。ファイル共有に対応していない環境なので、アプリ内の「JSON保存」でバックアップを保存し、相手に送ってください。'});
      showToast('共有メニューを開きました');
      return;
    }
    downloadTextFile(filename, text, 'application/json');
    showToast('共有に未対応のため、JSONを保存しました');
  }catch(e){
    // ユーザーが共有をキャンセルした場合もここに来ることがあります。
    if(e && (e.name==='AbortError' || e.name==='NotAllowedError')){ showToast('共有をキャンセルしました'); return; }
    try{ downloadTextFile(backupFilename(), backupJSONText(), 'application/json'); showToast('共有できなかったため、JSONを保存しました'); }
    catch(_){ showToast('共有に失敗しました'); }
  }
}
function triggerImport(){ document.getElementById('json-import').click(); }
function importJSONFile(ev){
  const file=ev.target.files&&ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    // 先に選択欄をリセットしておく（キャンセルしても同じファイルを再選択できるように）
    ev.target.value='';
    try{
      const data=JSON.parse(reader.result);
      if(!data || !Array.isArray(data.days) || !Array.isArray(data.wishes)) throw new Error('bad data');
      if(!confirm('現在の入力内容を、読み込んだバックアップで置き換えます。よろしいですか？')) return;
      document.getElementById('trip-title').value=data.title||'';
      tripCurrency=CURRENCIES[data.currency]?data.currency:'JPY';
      wishes=data.wishes||[]; days=data.days||[]; members=data.members||[]; expenses=data.expenses||[];
      normalizeData();
      save(); render(); showToast('バックアップを読み込みました');
    }catch(e){showToast('読み込めないJSONです');}
  };
  reader.readAsText(file,'utf-8');
}
function isSafeHttpUrl(url){
  const s = String(url || '').trim();
  try {
    const u = new URL(s, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch(e) {
    return false;
  }
}
function openUrl(url){
  const s = String(url || '').trim();
  if(!isSafeHttpUrl(s)){
    showToast('httpまたはhttpsのURLだけ開けます');
    return;
  }
  window.open(s,'_blank','noopener,noreferrer');
}
function openUrlFromButton(button){
  openUrl(button && button.getAttribute ? button.getAttribute('data-url') : '');
}
function openGoogleSearch(name){
  const q=String(name||'').trim();
  if(!q){ showToast('検索する施設名がありません'); return; }
  openUrl('https://www.google.com/search?q='+encodeURIComponent(q));
}
function openGoogleSearchForWish(id){
  const wish=wishes.find(w=>w.id===Number(id));
  if(wish) openGoogleSearch(wish.name);
}
function openGoogleSearchForEntry(dayId,eid){
  const hit=findDayAndEntry(Number(dayId),Number(eid));
  if(hit?.entry?.type==='spot') openGoogleSearch(hit.entry.name);
}
function openGoogleMapForWish(id){
  const wish=wishes.find(w=>w.id===Number(id));
  if(wish) openUrl('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(wish.name));
}
function openGoogleMapForEntry(dayId,eid){
  const hit=findDayAndEntry(Number(dayId),Number(eid));
  if(hit?.entry?.type==='spot') openUrl('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(hit.entry.name));
}
function mapTravelMode(mode){
  if(mode==='train' || mode==='bus') return 'transit';
  if(mode==='walk') return 'walking';
  if(mode==='car' || mode==='ferry' || mode==='taxi' || mode==='rental') return 'driving';
  return '';
}
function mapDirflg(mode){
  if(mode==='train' || mode==='bus') return 'r';
  if(mode==='walk') return 'w';
  if(mode==='car' || mode==='ferry' || mode==='taxi' || mode==='rental') return 'd';
  return '';
}
function openMapForEntry(dayId,eid){
  const d=days.find(x=>x.id===dayId); if(!d) return;
  const e=d.entries.find(x=>x.id===eid); if(!e) return;
  if(e.type!=='transport') return;
  const origin=(e.from||'').trim(), dest=(e.to||'').trim();
  if(origin && dest){
    const travelMode = mapTravelMode(e.mode);
    const dirflg = mapDirflg(e.mode);
    const modeParam = travelMode ? '&travelmode='+encodeURIComponent(travelMode) : '';
    const dirflgParam = dirflg ? '&dirflg='+encodeURIComponent(dirflg) : '';
    openUrl('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(origin)+'&destination='+encodeURIComponent(dest)+modeParam+dirflgParam);
  }else{
    showToast('出発地と目的地を入れるとルートを開けます');
  }
}

// ── PDF ──────────────────────────────────────────────
function modeLabel(mode, modeText){
  if(mode==='other' && modeText) return modeText;
  const m=TR.find(x=>x.val===mode);
  return m ? (m.sym+' '+m.label) : '移動';
}
function formatDateForPrint(dateStr){
  if(!dateStr) return '';
  const parts = String(dateStr).split('-');
  if(parts.length!==3) return dateStr;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}
function tripDateRangeText(){
  const dates = days.map(d=>d.date).filter(Boolean).sort();
  if(!dates.length) return '旅行期間：未設定';
  const first = dates[0], last = dates[dates.length-1];
  return first===last ? `旅行日：${formatDateForPrint(first)}` : `旅行期間：${formatDateForPrint(first)} 〜 ${formatDateForPrint(last)}`;
}

function reservationPrintLine(e){
  if(!hasReservation(e)) return '';
  const r=normalizeReservation(e.reservation);
  const parts=[r.name?('予約先：'+esc(r.name)):'', r.number?('番号：'+esc(r.number)):'', r.time?('時刻：'+esc(r.time)):'', r.memo?esc(r.memo):'', r.items?('必要なもの：'+esc(r.items)):'', r.url?esc(r.url):''].filter(Boolean).join('　');
  return parts ? `<div class="p-res">予約情報：${parts}</div>` : '';
}

function buildPrintArea(){
  const title = esc(document.getElementById('trip-title').value.trim() || '旅行プラン');
  const today = new Date();
  const outputDate = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const period = esc(tripDateRangeText());
  const sub = esc('出力日：'+outputDate);
  const dayHtml = days.map(day=>{
    const printEntries = [...checkoutItemsForDay(day).map(item=>({type:'checkout', item})), ...(day.entries||[])];
    const entries = printEntries.map((e,i)=>{
      const last = i === printEntries.length-1;
      if(e.type==='checkout'){
        const se=e.item.entry, sd=e.item.sourceDay;
        const meta=[se.checkoutTime?('出発 '+esc(se.checkoutTime)):'', sd.date?('宿泊日 '+esc(sd.date)):''].filter(Boolean).join('　');
        const checkoutNote = se.checkoutMemo ? `<div class="p-meta">${esc(se.checkoutMemo)}</div>` : '';
        return `<div class="p-entry"><div class="p-dot-wrap"><div class="p-dot stay"></div>${!last?'<div class="p-vl"></div>':''}</div><div class="p-card sp stay"><div class="p-card-r1"><span class="p-tag stay">宿泊</span><span class="p-name">チェックアウト：${esc(se.name)}</span></div>${meta?`<div class="p-meta">${meta}</div>`:''}${checkoutNote}</div></div>`;
      }
      if(e.type==='transport'){
        const route = [e.from, e.to].filter(Boolean).map(esc).join(' → ');
        const time = [e.depart?('出発 '+esc(e.depart)):'', e.arrive?('到着 '+esc(e.arrive)):'', e.duration?('所要 '+esc(e.duration)):''].filter(Boolean).join('　');
        const note = e.note ? `<div class="p-meta">${esc(e.note)}</div>` : '';
        const url = e.url ? `<div class="p-url">${esc(e.url)}</div>` : '';
        const res = reservationPrintLine(e);
        return `<div class="p-entry"><div class="p-dot-wrap"><div class="p-dot tr"></div>${!last?'<div class="p-vl"></div>':''}</div><div class="p-card tr"><div class="p-card-r1"><span class="p-tr-mode">${esc(modeLabel(e.mode,e.modeText))}</span>${route?`<span class="p-name">${route}</span>`:''}</div>${time?`<div class="p-meta">${time}</div>`:''}${note}${res}${url}</div></div>`;
      }
      const c=CATS[e.cat]||CATS.sightseeing;
      const cat=e.cat||'sightseeing';
      const entryIndex=(day.entries||[]).indexOf(e);
      const hasNextEntry=entryIndex>=0 && entryIndex<(day.entries||[]).length-1;
      const time = [e.arrive?('到着 '+esc(e.arrive)):'', (e.cat!=='stay' && e.leave)?('出発 '+esc(e.leave)):'', (e.cat==='stay' && e.checkoutDate)?('チェックアウト '+esc(formatDateForPrint(e.checkoutDate))+(e.checkoutTime?' '+esc(e.checkoutTime):'')):'', (hasNextEntry && String(e.nextMove||'').trim())?('次へ '+esc(e.nextMove)):'' ].filter(Boolean).join('　');
      const note = e.note ? `<div class="p-meta">${esc(e.note)}</div>` : '';
      const checkoutNote = (e.cat==='stay' && e.checkoutMemo) ? `<div class="p-meta">チェックアウトメモ：${esc(e.checkoutMemo)}</div>` : '';
      const url = e.url ? `<div class="p-url">${esc(e.url)}</div>` : '';
      const res = reservationPrintLine(e);
      const dot = e.cat || 'sightseeing';
      return `<div class="p-entry"><div class="p-dot-wrap"><div class="p-dot ${dot}"></div>${!last?'<div class="p-vl"></div>':''}</div><div class="p-card sp ${esc(cat)}"><div class="p-card-r1"><span class="p-tag ${esc(cat)}">${esc(c.label)}</span><span class="p-name">${esc(e.name)}</span></div>${time?`<div class="p-meta">${time}</div>`:''}${note}${checkoutNote}${res}${url}</div></div>`;
    }).join('') || '<div class="p-meta">予定はまだありません</div>';
    const headRight = [day.date, day.memo].filter(Boolean).map(esc).join('　');
    return `<section class="p-day"><div class="p-day-hdr"><span class="p-day-lbl">${esc(day.label)}</span><span class="p-day-memo">${headRight}</span></div>${entries}</section>`;
  }).join('');
  const neededRows=collectNeededItems();
  const neededCount=neededRows.reduce((sum,row)=>sum+row.items.length,0);
  const neededCards=neededRows.map(row=>{
    const dayText=[row.day.label||'',row.day.date?formatShortDate(row.day.date):''].filter(Boolean).join(' ');
    const itemHtml=row.items.map(item=>`<span class="p-item-chip">□ ${esc(item)}</span>`).join('');
    return `<div class="p-items-card"><div class="p-items-title"><span class="p-items-day">${esc(dayText||'日付未設定')}</span><span class="p-items-name">${esc(entryDisplayTitle(row.entry))}</span></div><div class="p-items-list">${itemHtml}</div></div>`;
  }).join('');
  const itemsHtml=`<section class="p-items-section"><div class="p-items-hdr"><span class="p-items-hdr-lbl">持ち物リスト</span><span class="p-items-count">${neededRows.length}件の予約 / ${neededCount}項目</span></div>${neededCards||'<div class="p-items-empty">予約情報に登録された持ち物はありません。</div>'}</section>`;
  document.getElementById('print-area').innerHTML = `<div class="p-cover"><div class="p-cover-title">${title}</div><div class="p-cover-sub">旅のしおり / PDF保存用</div><div class="p-cover-sub">${period}　${sub}</div></div><div class="p-section-title">旅程</div>${dayHtml}${itemsHtml}`;
}
async function exportPDF(){
  // jsPDFの標準フォントは日本語に弱いため、ブラウザの印刷機能を使う方式に変更。
  // Chrome / Edge / Safari の「PDFに保存」なら日本語フォントがそのまま使われ、文字化けしにくいです。
  save();
  buildPrintArea();
  const prevTitle = document.title;
  document.title = safeTitle() + '_旅のしおり';
  showToast('印刷画面で「PDFに保存」を選んでください');
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 500);
  }, 150);
}

// ── toast ─────────────────────────────────────────────
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function applyAccessibilityLabels(root=document){
  const selector='input:not([type="hidden"]), select, textarea';
  const fields=[];
  if(root.matches?.(selector)) fields.push(root);
  root.querySelectorAll?.(selector).forEach(el=>fields.push(el));
  fields.forEach(el=>{
    if(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.labels?.length) return;
    let label=el.getAttribute('title') || el.getAttribute('placeholder');
    if(!label){
      if(el.classList.contains('cat-sel')) label='分類';
      else if(el.classList.contains('tr-sel')) label='移動手段';
      else if(el.type==='date') label='日付';
      else if(el.type==='time') label='時刻';
      else if(el.type==='checkbox') label='選択';
      else if(el.type==='number') label='数値';
      else label='入力欄';
    }
    el.setAttribute('aria-label',label);
  });
}

function enhanceModalAccessibility(backdrop){
  if(!backdrop || backdrop.dataset.accessible==='1') return;
  backdrop.dataset.accessible='1';
  const modal=backdrop.querySelector('.modal');
  if(!modal) return;
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('tabindex','-1');
  const title=modal.querySelector('.modal-title');
  if(title){
    if(!title.id) title.id='modal-title-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    modal.setAttribute('aria-labelledby',title.id);
  }
  const close=()=>{
    pendingWid=null;
    backdrop.remove();
  };
  backdrop.addEventListener('keydown',event=>{
    if(event.key==='Escape'){ event.preventDefault(); close(); }
    if(event.key==='Tab'){
      const focusable=[...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
      if(!focusable.length){ event.preventDefault(); modal.focus(); return; }
      const first=focusable[0], last=focusable[focusable.length-1];
      if(event.shiftKey && document.activeElement===first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement===last){ event.preventDefault(); first.focus(); }
    }
  });
  backdrop.addEventListener('click',event=>{ if(event.target===backdrop) close(); });
  applyAccessibilityLabels(modal);
  setTimeout(()=>{ (modal.querySelector('button, input, select, textarea, a[href]')||modal).focus(); },0);
}

function syncResponsiveDetails(root=document){
  const desktop=window.matchMedia('(min-width: 641px)').matches;
  const details=[];
  if(root.matches?.('details.header-more, details.card-more')) details.push(root);
  root.querySelectorAll?.('details.header-more, details.card-more').forEach(el=>details.push(el));
  details.forEach(el=>{
    if(desktop) el.setAttribute('open','');
    else el.removeAttribute('open');
  });
}

const accessibilityObserver=new MutationObserver(records=>{
  records.forEach(record=>record.addedNodes.forEach(node=>{
    if(!(node instanceof Element)) return;
    applyAccessibilityLabels(node);
    syncResponsiveDetails(node);
    if(node.matches('.modal-backdrop')) enhanceModalAccessibility(node);
    node.querySelectorAll?.('.modal-backdrop').forEach(enhanceModalAccessibility);
  }));
});
accessibilityObserver.observe(document.body,{childList:true,subtree:true});
applyAccessibilityLabels(document);
syncResponsiveDetails(document);

document.addEventListener('click',event=>{
  if(window.matchMedia('(min-width: 641px)').matches) return;
  const menuButton=event.target.closest?.('.card-more-menu button, .header-menu button');
  if(menuButton) setTimeout(()=>menuButton.closest('details')?.removeAttribute('open'),0);
  document.querySelectorAll('details.card-more[open], details.header-more[open]').forEach(details=>{
    if(!details.contains(event.target)) details.removeAttribute('open');
  });
});

function updateStickyOffset(){
  const header=document.querySelector('.header');
  const tabs=document.querySelector('.tabs');
  if(header){
    document.documentElement.style.setProperty('--sticky-offset', header.offsetHeight + 'px');
  }
  const headerH = header ? header.offsetHeight : 56;
  const tabsH = tabs ? tabs.offsetHeight : 43;
  document.documentElement.style.setProperty('--plan-sticky-top', (headerH + tabsH) + 'px');
}
window.addEventListener('resize', ()=>{ syncResponsiveDetails(document); updateStickyOffset(); });
window.addEventListener('orientationchange', () => setTimeout(updateStickyOffset, 250));
setInterval(() => {
  const todayPanel = document.getElementById('panel-today');
  if(todayPanel && todayPanel.classList.contains('active')){
    renderToday();
  }
}, 60 * 1000);
window.addEventListener('beforeunload', () => {
  // 入力直後にタブを閉じても、デバウンス待ちの変更をlocalStorageへ同期保存する。
  if(saveTimer){
    clearTimeout(saveTimer);
    saveTimer=null;
    save();
  }
});

window.addEventListener('beforeprint', () => {
  // ブラウザメニューや Ctrl+P から直接印刷した場合も、PDF用レイアウトを事前生成する。
  if(!document.getElementById('print-map')) buildPrintArea();
});

load();
updateStickyOffset();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
