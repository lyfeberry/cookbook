const DB_NAME='cookingJournalDB',DB_VER=1,STORE='state';
const MODULES=['protein','base','vegetable','sauce'];
const emoji={protein:'🥩',base:'🍝',vegetable:'🥦',sauce:'🫙'};
const app=document.getElementById('app');const dlg=document.getElementById('meal-dialog');
let state={meals:[],ingredientLibrary:{protein:[],base:[],vegetable:[],sauce:[]},shoppingList:[]};
let view='home',editingId=null,deferredPrompt=null;

const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function loadState(){const db=await openDB();const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get('appState');return new Promise(ok=>{req.onsuccess=()=>ok(req.result||state);req.onerror=()=>ok(state)});}
async function saveState(){const db=await openDB();const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,'appState');}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random()+'';
const ratingColor=r=>r<=3?'#4FC3F7':r<=6?'#FFD54F':r<=8?'#FFB74D':'#EF5350';
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const mealPhoto=(m)=>m.photo||m.image||m.imageUrl||m.photoUrl||'';

function ensureInstallButton(){
  let btn=document.getElementById('install-app-btn');
  if(!btn){
    btn=document.createElement('button');
    btn.id='install-app-btn';
    btn.textContent='Install';
    btn.style.display='none';
    document.querySelector('.topbar').appendChild(btn);
  }
  btn.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;btn.style.display='none';};
}


function bindNav(){document.querySelectorAll('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===view);b.onclick=()=>{view=b.dataset.tab;render();};});}
function ingredientsFlat(m){if(typeof m.ingredients==='string')return m.ingredients.split(',').map(s=>s.trim()).filter(Boolean);return MODULES.flatMap(k=>m.ingredients[k]||[])}
function renderHome(){const s=document.getElementById('sort-select').value,q=document.getElementById('search-input').value.toLowerCase(),f=document.getElementById('ingredient-filter').value;let meals=[...state.meals].filter(m=>m.name.toLowerCase().includes(q)&&(!f||ingredientsFlat(m).includes(f)));
if(s==='random') meals=shuffle(meals); if(s==='date') meals.sort((a,b)=>b.date.localeCompare(a.date)); if(s==='rating') meals.sort((a,b)=>b.rating-a.rating); if(s==='az') meals.sort((a,b)=>a.name.localeCompare(b.name));
app.innerHTML=`<div class='meal-grid'>${meals.map(m=>`<article class='card' data-id='${m.id}'><div class='card-media'><img src='${mealPhoto(m)}' alt='${m.name} photo' loading='lazy' onerror="this.style.display=\'none\'"><div class='card-overlay'><h3>${m.name}</h3><span class='rating-pill' style='background:${ratingColor(m.rating)}'>${m.rating}/10</span></div></div></article>`).join('')||"<div class='empty-state'><span class='empty-icon'>🍽️</span><p>No meals logged yet.<br>Tap <b>+ Add Meal</b> to get started.</p></div>"}</div>`;
app.querySelectorAll('.card').forEach(c=>c.onclick=()=>openDetail(c.dataset.id));}
function moduleEditor(module,sel=[]){const all=state.ingredientLibrary[module]||[];return `<details class='module' open><summary>${emoji[module]} ${module}</summary><input data-add='${module}' placeholder='Add/search ingredient'><div class='chips'>${all.map(i=>`<span class='chip ${sel.includes(i)?'selected':''}' data-mod='${module}' data-ing='${i}'>${i}</span>`).join('')}</div></details>`}
function renderAdd(){const m=editingId?state.meals.find(x=>x.id===editingId):null;const mode=m?.mode||'simple';
app.innerHTML=`<form id='meal-form'>
<div class='form-section'><h3>1) Photo & Name</h3><input id='photo' type='file' accept='image/*' capture='environment'><input id='name' required placeholder='Meal name' value='${m?.name||''}'></div>
<div class='form-section'><h3>2) Ingredients Mode</h3><select id='mode'><option value='simple' ${mode==='simple'?'selected':''}>Simple</option><option value='module' ${mode==='module'?'selected':''}>Module</option></select>
<div id='simple-wrap'><textarea id='simple-ingredients' rows='4' placeholder='salt, pepper, ...'>${typeof m?.ingredients==='string'?m.ingredients:''}</textarea></div>
<div id='module-wrap' class='${mode==='module'?'':'hidden'}'>${MODULES.map(k=>moduleEditor(k,m?.mode==='module'?m.ingredients[k]:[])).join('')}</div></div>
<div class='form-section'><h3>3) Rating & Note</h3><input id='rating' type='range' min='1' max='10' value='${m?.rating||5}'><span id='rating-v'></span><textarea id='note' rows='3' placeholder='Notes'>${m?.note||''}</textarea></div>
<button>Save Meal</button></form>`;
const rating=app.querySelector('#rating'),label=app.querySelector('#rating-v');const paint=()=>{const c=ratingColor(+rating.value);rating.style.accentColor=c;label.textContent=`${rating.value}/10`;label.style.color=c};rating.oninput=paint;paint();
app.querySelector('#mode').onchange=e=>{app.querySelector('#simple-wrap').classList.toggle('hidden',e.target.value!=='simple');app.querySelector('#module-wrap').classList.toggle('hidden',e.target.value!=='module');};
app.querySelectorAll('[data-add]').forEach(i=>i.onchange=e=>{const mod=e.target.dataset.add,val=e.target.value.trim().toLowerCase();if(val&&!state.ingredientLibrary[mod].includes(val)){state.ingredientLibrary[mod].push(val);saveState().then(render);} });
app.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>ch.classList.toggle('selected'));
app.querySelector('#meal-form').onsubmit=async e=>{e.preventDefault();const name=app.querySelector('#name').value.trim();const rate=+rating.value;if(!name||!rate) return alert('Name and rating required.');let photo=m?.photo||'';const f=app.querySelector('#photo').files[0];if(f) photo=await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(f)});
const md=app.querySelector('#mode').value;let ingredients=app.querySelector('#simple-ingredients').value.trim();if(md==='module'){ingredients={};MODULES.forEach(mod=>ingredients[mod]=[...app.querySelectorAll(`.chip.selected[data-mod='${mod}']`)].map(x=>x.dataset.ing));}
const meal={id:m?.id||uid(),name,photo,date:m?.date||new Date().toISOString().slice(0,10),mode:md,ingredients,rating:rate,note:app.querySelector('#note').value.trim()};if(m){state.meals=state.meals.map(x=>x.id===m.id?meal:x);}else state.meals.push(meal);await saveState();editingId=null;view='home';render();};}
function openDetail(id){const m=state.meals.find(x=>x.id===id);if(!m)return;
const photo=mealPhoto(m);
const photoHtml=photo?"<img class='dialog-photo' src='"+photo+"' alt='"+m.name+"'>": "<div class='dialog-photo' style='background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:4rem;opacity:.2'>🍽️</div>";
const ingrHtml=typeof m.ingredients==='string'
  ?"<div class='dialog-ingredients'><h4>Ingredients</h4><p style='font-size:.9rem'>"+(m.ingredients||'—')+"</p></div>"
  :"<div class='dialog-ingredients'><h4>Ingredients</h4>"+MODULES.map(k=>(m.ingredients[k]||[]).length?"<div class='dialog-module-row'><span class='dialog-module-label'>"+emoji[k]+" "+k+"</span><span>"+(m.ingredients[k].join(', '))+"</span></div>":"").join('')+"</div>";
const noteHtml=m.note?"<p class='dialog-note'>&ldquo;"+m.note+"&rdquo;</p>":"";
dlg.innerHTML=photoHtml+"<div class='dialog-body'><h2>"+m.name+"</h2><div class='dialog-meta'><span class='dialog-date'>📅 "+m.date+"</span><span class='rating-pill' style='background:"+ratingColor(m.rating)+"'>"+m.rating+"/10</span></div>"+ingrHtml+noteHtml+"<div class='dialog-actions'><button id='edit'>✏️ Edit</button><button id='btn-delete-dialog'>🗑 Delete</button><button id='dlg-close'>✕ Close</button></div></div>";
dlg.showModal();
dlg.querySelector("#dlg-close").onclick=()=>dlg.close();
dlg.querySelector("#edit").onclick=()=>{editingId=id;view="add";dlg.close();render();};
dlg.querySelector("#btn-delete-dialog").onclick=async()=>{if(confirm("Delete meal?")){state.meals=state.meals.filter(x=>x.id!==id);await saveState();dlg.close();render();}}}
function renderShopping(){const byDay={};state.shoppingList.forEach((g,gi)=>{(byDay[g.day]??=[]).push({g,gi});});app.innerHTML=`<div class='form-section'><h3>Plan a meal</h3><select id='mealPick'><option value=''>Select meal</option>${state.meals.map(m=>`<option value='${m.id}'>${m.name}</option>`)}</select><input id='dayPick' placeholder='Day (e.g. Monday)'><button id='planAdd' type='button'>Add planned meal</button></div>
<div class='form-section'><h3>Manual add</h3><input id='mDay' placeholder='Day'><input id='mMeal' placeholder='Meal name'><input id='mItem' placeholder='Ingredient'><button id='mAdd' type='button'>Add item</button></div>
${Object.entries(byDay).map(([day,groups])=>`<div class='shopping-group'><h4>📅 ${day}</h4>${groups.map(({g,gi})=>`<p>🍽️ ${g.meal}</p>${g.items.map((it,ii)=>`<label class='${it.checked?'line-through':''}'><input type='checkbox' data-gi='${gi}' data-ii='${ii}' ${it.checked?'checked':''}> ${it.name}</label><br>`).join('')}`).join('')}</div>`).join('')}
<button id='clear'>Clear list</button>`;
app.querySelectorAll("input[type='checkbox']").forEach(c=>c.onchange=async e=>{const g=state.shoppingList[e.target.dataset.gi],it=g.items[e.target.dataset.ii];it.checked=e.target.checked;await saveState();render();});
app.querySelector('#planAdd').onclick=async()=>{const id=app.querySelector('#mealPick').value,day=app.querySelector('#dayPick').value.trim();const meal=state.meals.find(m=>m.id===id);if(!meal||!day)return;state.shoppingList.push({day,meal:meal.name,items:ingredientsFlat(meal).map(n=>({name:n,checked:false}))});await saveState();render();};
app.querySelector('#mAdd').onclick=async()=>{const day=app.querySelector('#mDay').value.trim(),meal=app.querySelector('#mMeal').value.trim(),item=app.querySelector('#mItem').value.trim();if(!day||!meal||!item)return;let g=state.shoppingList.find(x=>x.day===day&&x.meal===meal);if(!g){g={day,meal,items:[]};state.shoppingList.push(g);}g.items.push({name:item,checked:false});await saveState();render();};
app.querySelector('#clear').onclick=async()=>{if(confirm('Clear shopping list?')){state.shoppingList=[];await saveState();render();}};}
function renderSettings(){app.innerHTML=`<section class='settings-group'><h3>Ingredient Library</h3>${MODULES.map(m=>`<div class='setting-row'><div class='setting-row-header'>${m}</div><div class='setting-chips'>${(state.ingredientLibrary[m]||[]).map((i,idx)=>`<span class='chip'>${i} <button data-del='${m}:${idx}'>x</button></span>`).join('')}</div><div><input id='add-${m}' placeholder='Add ${m}'><button data-addm='${m}'>Add</button></div></div>`).join('')}</section>
<section class='settings-group'><h3>Data</h3><button id='export'>Export JSON</button><input id='import' type='file' accept='application/json'></section>
<section class='settings-group'><h3>About</h3><p>Version 1.0.0</p><p class='small'>Offline-first personal cooking journal PWA.</p></section>`;
app.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const [m,i]=b.dataset.del.split(':');state.ingredientLibrary[m].splice(+i,1);await saveState();render();});
app.querySelectorAll('[data-addm]').forEach(b=>b.onclick=async()=>{const m=b.dataset.addm,v=app.querySelector(`#add-${m}`).value.trim().toLowerCase();if(v&&!state.ingredientLibrary[m].includes(v)){state.ingredientLibrary[m].push(v);await saveState();render();}});
app.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cooking-journal-export.json';a.click();};
app.querySelector('#import').onchange=async e=>{const f=e.target.files[0];if(!f)return;state=JSON.parse(await f.text());await saveState();render();};}
function render(){bindNav();document.getElementById('home-controls').style.display=view==='home'?'flex':'none';const ingSet=[...new Set(state.meals.flatMap(ingredientsFlat))].sort();const sel=document.getElementById('ingredient-filter');sel.innerHTML=`<option value=''>Filter ingredient</option>${ingSet.map(i=>`<option>${i}</option>`).join('')}`;if(view==='home')renderHome();if(view==='add')renderAdd();if(view==='shopping')renderShopping();if(view==='settings')renderSettings();}

['sort-select','search-input','ingredient-filter'].forEach(id=>document.getElementById(id).addEventListener('input',()=>view==='home'&&renderHome()));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=document.getElementById('install-app-btn');if(b)b.style.display='inline-block';});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));
(async()=>{ensureInstallButton();state=await loadState();render();})();
