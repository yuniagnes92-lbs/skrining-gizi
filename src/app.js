import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { firebaseConfig } from './firebase-config.js';


const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,d=1)=>x!=null&&isFinite(x)?x.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const tglPanjang=t=>{try{return new Date(t+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}catch(e){return t}};
const pill=(t,c)=>`<span class="pill ${c}">${esc(t)}</span>`;

/* ---------- Laboratorium ---------- */
const LAB=[
 {k:'alb',n:'Albumin',u:'g/dL',lo:3.5,hi:5.0},
 {k:'hb',n:'Hemoglobin',u:'g/dL',lo:{p:13,w:12},hi:{p:17,w:15}},
 {k:'tlc',n:'Total limfosit',u:'/mm³',lo:1500},
 {k:'leu',n:'Leukosit',u:'10³/µL',lo:4,hi:10},
 {k:'gds',n:'Gula darah sewaktu',u:'mg/dL',lo:70,lt:200},
 {k:'ur',n:'Ureum',u:'mg/dL',lo:10,hi:50},
 {k:'cr',n:'Kreatinin',u:'mg/dL',lo:{p:.7,w:.6},hi:{p:1.3,w:1.1}},
 {k:'kol',n:'Kolesterol total',u:'mg/dL',lt:200},
 {k:'tg',n:'Trigliserida',u:'mg/dL',lt:150},
 {k:'na',n:'Natrium',u:'mmol/L',lo:135,hi:145},
 {k:'kal',n:'Kalium',u:'mmol/L',lo:3.5,hi:5.0},
 {k:'crp',n:'CRP',u:'mg/L',lt:5},
];
const pick=(x,jk)=>x==null?null:typeof x==='object'?x[jk]:x;
const angka=v=>v==null?'':String(v).replace('.',',');
function refText(L,jk){
  const lo=pick(L.lo,jk),hi=pick(L.hi,jk);
  if(lo!=null&&hi!=null) return `${angka(lo)} – ${angka(hi)}`;
  if(lo!=null&&L.lt!=null) return `${angka(lo)} – < ${angka(L.lt)}`;
  if(L.lt!=null) return `< ${angka(L.lt)}`;
  if(lo!=null) return `≥ ${angka(lo)}`;
  return '';
}
function flagLab(L,v,jk){
  if(L.k==='tlc'){ if(v>=1500)return['Normal','ok']; if(v>=1200)return['Deplesi ringan','warn']; if(v>=800)return['Deplesi sedang','bad']; return['Deplesi berat','bad']; }
  if(L.k==='alb'){ if(v>5)return['Tinggi','warn']; if(v>=3.5)return['Normal','ok']; if(v>=2.8)return['Deplesi ringan','warn']; if(v>=2.1)return['Deplesi sedang','bad']; return['Deplesi berat','bad']; }
  const lo=pick(L.lo,jk),hi=pick(L.hi,jk);
  if(lo!=null&&v<lo) return['Rendah','warn'];
  if(hi!=null&&v>hi) return['Tinggi','bad'];
  if(L.lt!=null&&v>=L.lt) return['Tinggi','bad'];
  return['Normal','ok'];
}
function buildLabForm(){
  $('labtab').innerHTML='<span class="h">Pemeriksaan</span><span class="h">Hasil</span><span class="h">Status</span>'+
   LAB.map(L=>`<label class="nm" for="l-${L.k}">${L.n}<small id="lr-${L.k}"></small></label><input id="l-${L.k}" type="number" inputmode="decimal" step="any"><span id="lf-${L.k}"></span>`).join('');
}
function buildRefLab(){
  $('ref-lab').innerHTML='<thead><tr><th>Pemeriksaan</th><th>Satuan</th><th>Laki-laki</th><th>Perempuan</th></tr></thead><tbody>'+
   LAB.map(L=>`<tr><td>${L.n}</td><td>${L.u}</td><td class="n">${refText(L,'p')}</td><td class="n">${refText(L,'w')}</td></tr>`).join('')+'</tbody>';
}

/* ---------- Formulir ---------- */
function readForm(){
  const I={};
  $('form').querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.type==='radio'){ if(el.checked) I[el.name]=el.value; }
    else if(el.type==='checkbox') I[el.id]=el.checked;
    else if(el.id) I[el.id]=el.value;
  });
  return I;
}
function fillForm(I){
  $('form').reset();
  $('form').querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.type==='radio') el.checked = I[el.name]===el.value;
    else if(el.type==='checkbox') el.checked=!!I[el.id];
    else if(el.id && I[el.id]!=null) el.value=I[el.id];
  });
}

function kategoriIMT(i){
  if(i<18.5) return['Berat badan kurang','warn']; if(i<23) return['Normal','ok'];
  if(i<25) return['Berat badan lebih','warn']; if(i<30) return['Obesitas I','bad']; return['Obesitas II','bad'];
}

function hitung(I){
  const n=k=>{const s=String(I[k]??'').replace(',','.').trim(); if(s==='')return null; const v=parseFloat(s); return isFinite(v)?v:null};
  const jk=I.jk||'w', usia=n('f-usia'), bb=n('a-bb'), tb=n('a-tb'), bbl=n('a-bbl');
  const H={jk};
  H.imt = bb&&tb ? bb/((tb/100)**2) : null;
  H.bbi = tb ? (tb-100)*0.9 : null;
  H.wl = bb!=null&&bbl ? (bbl-bb)/bbl*100 : null;
  H.wlKg = bb!=null&&bbl ? bbl-bb : null;
  const betis=n('a-betis'), hgs=n('a-hgs');
  H.betisRendah = betis!=null ? betis < (jk==='p'?34:33) : null;
  H.hgsRendah = hgs!=null ? hgs < (jk==='p'?28:18) : null;

  /* MST */
  let s1=null;
  if(I.mq1==='0') s1=0; else if(I.mq1==='u') s1=2; else if(I.mq1==='y') s1 = I['mst-q1b']==='tt'?2 : (I['mst-q1b']?+I['mst-q1b']:null);
  const s2 = I.mq2==='1'?1 : I.mq2==='0'?0 : null;
  H.mstLengkap = s1!=null && s2!=null;
  H.mst = H.mstLengkap ? s1+s2 : null;
  H.mstRisiko = H.mstLengkap ? (H.mst>=2) : null;

  /* GLIM fenotip */
  const per=I['a-per']||'le6', tua=usia!=null&&usia>=70;
  let fWL=0;
  if(H.wl!=null){ if(per==='le6'){ if(H.wl>10)fWL=2; else if(H.wl>5)fWL=1; } else { if(H.wl>20)fWL=2; else if(H.wl>10)fWL=1; } }
  let fBMI=0;
  if(H.imt!=null){
    if(I['g-cut']==='global'){ if(H.imt<(tua?20:18.5)) fBMI=2; else if(H.imt<(tua?22:20)) fBMI=1; }
    else { if(H.imt<(tua?20:18.5)) fBMI=1; }
  }
  const fOtot=+I['g-otot']||0;
  H.fen={wl:fWL,bmi:fBMI,otot:fOtot};
  const adaFen = fWL||fBMI||fOtot, derajat=Math.max(fWL,fBMI,fOtot);
  const asupan = !!(I['g-as1']||I['g-as2']||I['g-as3']), inf=I['g-inf']||'0';
  const adaEt = asupan || inf!=='0';
  H.adaFen=!!adaFen; H.adaEt=adaEt;
  if(adaFen&&adaEt){
    H.glimMal=true; H.glimStadium=derajat;
    H.glim = derajat===2?'Malnutrisi berat (stadium 2)':'Malnutrisi sedang (stadium 1)';
    H.glimC = derajat===2?'bad':'warn';
    H.glimKet = inf==='akut'?'Terkait penyakit/cedera akut dengan inflamasi berat'
              : inf==='kronis'?'Terkait penyakit kronis dengan inflamasi'
              : 'Terkait asupan/asimilasi kurang tanpa inflamasi bermakna';
  } else {
    H.glimMal=false; H.glimStadium=0;
    const kosong=!adaFen&&!adaEt;
    if(kosong && H.mstRisiko===false){ H.glim='Tidak dinilai'; H.glimC='mut'; H.glimKet='MST < 2, asesmen GLIM tidak diperlukan saat ini.'; }
    else { H.glim='Tidak memenuhi kriteria malnutrisi'; H.glimC='ok';
      H.glimKet = kosong?'Belum ada kriteria fenotip maupun etiologi yang terpenuhi.' : !adaFen?'Ada kriteria etiologi, tetapi belum ada kriteria fenotip.':'Ada kriteria fenotip, tetapi belum ada kriteria etiologi.'; }
  }

  /* Lab */
  H.lab=[];
  LAB.forEach(L=>{ const v=n('l-'+L.k); if(v!=null){ const f=flagLab(L,v,jk); H.lab.push({k:L.k,n:L.n,u:L.u,v,ref:refText(L,jk),s:f[0],c:f[1]}); } });
  return H;
}

const fenLabel=x=>x===2?pill('Berat','bad'):x===1?pill('Sedang','warn'):pill('Tidak','ok');

function renderLive(){
  const I=readForm(), H=hitung(I), jk=H.jk;
  $('mq1b-wrap').hidden = I.mq1!=='y';

  // antropometri
  const ki=H.imt!=null?kategoriIMT(H.imt):null;
  $('antro-out').innerHTML=
   `<div class="row"><span class="k">IMT<code>BB ÷ (TB/100)²</code></span><span class="v">${fmt(H.imt)} ${ki?pill(ki[0],ki[1]):''}</span></div>`+
   `<div class="row"><span class="k">BB ideal<code>(TB − 100) × 0,9</code></span><span class="v">${H.bbi!=null?fmt(H.bbi)+' kg':'–'}</span></div>`+
   `<div class="row"><span class="k">Penurunan BB<code>(BB lalu − BB kini) ÷ BB lalu</code></span><span class="v">${H.wl!=null?fmt(H.wl)+'% ('+fmt(H.wlKg)+' kg)':'–'}</span></div>`+
   (H.betisRendah!=null?`<div class="row"><span class="k">Lingkar betis<code>rujukan ${jk==='p'?'≥ 34':'≥ 33'} cm</code></span><span class="v">${H.betisRendah?pill('Rendah','warn'):pill('Normal','ok')}</span></div>`:'')+
   (H.hgsRendah!=null?`<div class="row"><span class="k">Kekuatan genggam<code>rujukan ${jk==='p'?'≥ 28':'≥ 18'} kg</code></span><span class="v">${H.hgsRendah?pill('Rendah','warn'):pill('Normal','ok')}</span></div>`:'');

  // MST
  const mo=$('mst-out');
  if(!H.mstLengkap){ mo.className='res'; mo.innerHTML='<span class="lbl">Skor MST</span><span class="big">Belum lengkap</span><p>Jawab kedua pertanyaan untuk melihat skor.</p>'; }
  else if(H.mstRisiko){ mo.className='res warn'; mo.innerHTML=`<span class="lbl">Skor MST</span><span class="big">${H.mst} · Berisiko malnutrisi</span><p>Lanjutkan asesmen GLIM di bawah dan rujuk ke dietisien.</p>`; }
  else { mo.className='res ok'; mo.innerHTML=`<span class="lbl">Skor MST</span><span class="big">${H.mst} · Tidak berisiko</span><p>Skrining ulang setiap minggu selama dirawat.</p>`; }

  // GLIM
  const tua=(parseFloat(I['f-usia'])||0)>=70;
  $('glim-fen').innerHTML=
   `<div class="row"><span class="k">Penurunan BB<code>${I['a-per']==='gt6'?'> 6 bln: >10% sedang, >20% berat':'≤ 6 bln: >5% sedang, >10% berat'}</code></span><span class="v">${H.wl!=null?fmt(H.wl)+'% ':''}${fenLabel(H.fen.wl)}</span></div>`+
   `<div class="row"><span class="k">IMT rendah<code>${I['g-cut']==='global'?(tua?'≥70 th: <22 sedang, <20 berat':'<70 th: <20 sedang, <18,5 berat'):(tua?'Asia ≥70 th: <20':'Asia <70 th: <18,5')}</code></span><span class="v">${H.imt!=null?fmt(H.imt)+' ':''}${fenLabel(H.fen.bmi)}</span></div>`+
   `<div class="row"><span class="k">Massa otot berkurang</span><span class="v">${fenLabel(H.fen.otot)}</span></div>`;
  const sup=[]; if(H.betisRendah) sup.push('lingkar betis rendah'); if(H.hgsRendah) sup.push('kekuatan genggam rendah');
  $('otot-hint').textContent = sup.length
    ? `Temuan pendukung: ${sup.join(' dan ')}. Pertimbangkan defisit massa otot.`
    : 'Penilaian massa otot dengan metode tervalidasi (BIA, DXA, CT) atau, bila tidak tersedia, pemeriksaan fisik, lingkar betis, dan kekuatan genggam.';
  const go=$('glim-out');
  go.className='res '+(H.glimC==='mut'?'':H.glimC);
  go.innerHTML=`<span class="lbl">Diagnosis GLIM</span><span class="big">${esc(H.glim)}</span><p>${esc(H.glimKet)}</p>`+
    `<p class="note">Fenotip ${H.adaFen?'terpenuhi':'belum'} · Etiologi ${H.adaEt?'terpenuhi':'belum'}</p>`;

  // Lab
  LAB.forEach(L=>{
    $('lr-'+L.k).textContent=`${refText(L,jk)} ${L.u}`;
    const r=H.lab.find(x=>x.k===L.k); $('lf-'+L.k).innerHTML=r?pill(r.s,r.c):'<span class="mut">–</span>';
  });
}

/* ---------- Database tim (Firebase) ---------- */
const PERAN={admin:'Admin',nakes:'Nakes',petugas:'Petugas'};
const siap=!!(firebaseConfig&&firebaseConfig.apiKey&&!String(firebaseConfig.apiKey).startsWith('ISI'));
let auth=null, fdb=null, ME=null, RECS=[], USERS=[], editId=null;
let unsubMe=null, unsubData=null, unsubUsers=null;

const bolehUbah=r=>!!ME&&(ME.peran==='admin'||r.oleh===ME.uid);
const bolehHapus=r=>!!ME&&(ME.peran==='admin'||(ME.peran==='nakes'&&r.oleh===ME.uid));
const salah=(id,t)=>{ const el=$(id); el.textContent=t||''; el.hidden=!t; };
function toast(t){ const el=$('toast'); el.textContent=t; el.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>el.hidden=true,3000); }
function layar(id){ ['cfg','login','tunggu','main'].forEach(x=>$(x).hidden=x!==id); window.scrollTo({top:0}); }
const idBaru=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function pesanGalat(e){
  const c=(e&&e.code)||'';
  if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Email atau kata sandi salah.';
  if(/email-already-in-use/.test(c)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if(/invalid-email/.test(c)) return 'Format email tidak valid.';
  if(/weak-password/.test(c)) return 'Kata sandi minimal 6 karakter.';
  if(/network-request-failed|unavailable/.test(c)) return 'Tidak ada koneksi internet. Coba lagi.';
  if(/too-many-requests/.test(c)) return 'Terlalu banyak percobaan. Tunggu beberapa menit.';
  if(/permission-denied/.test(c)) return 'Akses ditolak. Pastikan akun Anda sudah disetujui admin.';
  return 'Terjadi kesalahan ('+(c||'tidak diketahui')+').';
}

/* ---------- Masuk & daftar ---------- */
$('btn-ke-daftar').addEventListener('click',()=>{ $('f-masuk').hidden=true; $('f-daftar').hidden=false; });
$('btn-ke-masuk').addEventListener('click',()=>{ $('f-daftar').hidden=true; $('f-masuk').hidden=false; });
$('f-masuk').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('m-email').value.trim(), p=$('m-p').value;
  if(!email||!p) return salah('m-err','Isi email dan kata sandi.');
  $('btn-masuk').disabled=true; salah('m-err','');
  try{ await signInWithEmailAndPassword(auth,email,p); $('m-p').value=''; }
  catch(err){ salah('m-err',pesanGalat(err)); }
  finally{ $('btn-masuk').disabled=false; }
});
$('btn-lupa').addEventListener('click',async()=>{
  const email=$('m-email').value.trim();
  if(!email) return salah('m-err','Isi email Anda dulu, lalu tekan Lupa kata sandi.');
  try{ await sendPasswordResetEmail(auth,email); salah('m-err',''); toast('Tautan ganti sandi dikirim ke '+email); }
  catch(err){ salah('m-err',pesanGalat(err)); }
});
$('f-daftar').addEventListener('submit',async e=>{
  e.preventDefault();
  const nama=$('d-nama').value.trim(), profesi=$('d-prof').value.trim(), email=$('d-email').value.trim(), p=$('d-p').value;
  if(!nama) return salah('d-err','Isi nama lengkap.');
  if(!email) return salah('d-err','Isi email.');
  if(p.length<6) return salah('d-err','Kata sandi minimal 6 karakter.');
  if(p!==$('d-p2').value) return salah('d-err','Kedua kata sandi tidak sama.');
  $('btn-daftar').disabled=true; salah('d-err','');
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,p);
    const uid=cred.user.uid;
    let jadiAdmin=false;
    try{
      const c=await getDoc(doc(fdb,'config','admin'));
      if(!c.exists()){ await setDoc(doc(fdb,'config','admin'),{uid}); jadiAdmin=true; }
    }catch(err){ jadiAdmin=false; }
    await setDoc(doc(fdb,'users',uid),{nama,profesi,email,peran:jadiAdmin?'admin':'petugas',aktif:jadiAdmin,dibuat:new Date().toISOString()});
    $('f-daftar').reset();
    toast(jadiAdmin?'Akun admin dibuat. Selamat bekerja!':'Pendaftaran terkirim. Tunggu persetujuan admin.');
  }catch(err){ salah('d-err',pesanGalat(err)); }
  finally{ $('btn-daftar').disabled=false; }
});
async function keluar(){ try{ await signOut(auth); }catch(e){} }
$('btn-keluar').addEventListener('click',keluar);
$('btn-keluar2').addEventListener('click',keluar);
$('btn-gantisandi').addEventListener('click',async()=>{
  try{ await sendPasswordResetEmail(auth,ME.email); toast('Tautan ganti sandi dikirim ke '+ME.email); }catch(err){ toast(pesanGalat(err)); }
});

function berhentiData(){ if(unsubData){unsubData();unsubData=null;} if(unsubUsers){unsubUsers();unsubUsers=null;} }

function mulai(){
  layar('main');
  perbaruiProfil();
  $('card-admin').hidden=ME.peran!=='admin';
  newForm(); keTab('input');
  $('list').innerHTML='<div class="empty"><b>Memuat data…</b></div>';
  unsubData=onSnapshot(query(collection(fdb,'skrining'),orderBy('tanggal','desc'),limit(1000)),snap=>{
    RECS=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||'')||(b.dibuat||'').localeCompare(a.dibuat||''));
    renderList(); renderAkun();
  },err=>{ $('list').innerHTML=`<div class="empty"><b>Data tidak bisa dimuat</b><span>${esc(pesanGalat(err))}</span></div>`; });
  if(ME.peran==='admin'){
    unsubUsers=onSnapshot(collection(fdb,'users'),s=>{ USERS=s.docs.map(d=>({uid:d.id,...d.data()})); renderUsers(); },()=>{});
  }
}
function perbaruiProfil(){
  $('who-nm').textContent=ME.nama; $('who-av').textContent=(ME.nama[0]||'?').toUpperCase();
  $('who-peran').textContent=PERAN[ME.peran]||ME.peran;
  $('ak-nm').textContent=ME.nama; $('ak-peran').textContent=PERAN[ME.peran]||ME.peran;
  $('ak-prof').textContent=ME.profesi||'–'; $('ak-email').textContent=ME.email||'–';
}

/* ---------- Data skrining ---------- */
function newForm(){
  editId=null; $('form').reset(); $('f-tgl').value=today(); $('editflag').hidden=true;
  $('btn-save').textContent='Simpan data'; renderLive();
}
function simpan(){
  const I=readForm();
  if(!I['f-nama'].trim()){ toast('Isi nama pasien terlebih dahulu'); $('f-nama').focus(); return; }
  if(!I['f-tgl']){ toast('Isi tanggal skrining'); $('f-tgl').focus(); return; }
  const H=hitung(I), now=new Date().toISOString();
  const lama=editId?RECS.find(r=>r.id===editId):null;
  if(lama&&!bolehUbah(lama)){ toast('Anda tidak berhak mengubah data ini'); return; }
  const body={
    tanggal:I['f-tgl'], nama:I['f-nama'].trim(), rm:(I['f-rm']||'').trim(), inp:I,
    ringkas:{imt:H.imt!=null?+H.imt.toFixed(2):null,mst:H.mst,mstRisiko:H.mstRisiko,glim:H.glim,glimC:H.glimC,glimMal:H.glimMal,glimStadium:H.glimStadium},
    oleh:lama?lama.oleh:ME.uid, olehNama:lama?lama.olehNama:ME.nama, olehProfesi:lama?lama.olehProfesi:(ME.profesi||''),
    dibuat:lama?lama.dibuat:now, diubah:now, diubahOleh:ME.nama
  };
  const ref=lama?doc(fdb,'skrining',lama.id):doc(collection(fdb,'skrining'));
  setDoc(ref,body).catch(err=>toast('Gagal menyimpan: '+pesanGalat(err)));
  toast((lama?'Perubahan disimpan':'Tersimpan pada '+tglPanjang(body.tanggal))+(navigator.onLine?'':'. Akan terkirim saat online.'));
  const t=body.tanggal; newForm(); $('f-tgl').value=t;
}

function filtered(){
  const q=$('fq').value.trim().toLowerCase(), t=$('ftgl').value;
  return RECS.filter(r=>(!t||r.tanggal===t)&&(!q||(r.nama||'').toLowerCase().includes(q)||(r.rm||'').toLowerCase().includes(q)));
}
function renderList(){
  const L=$('list'), rows=filtered();
  $('k-tot').textContent=rows.length;
  $('k-mst').textContent=rows.filter(r=>r.ringkas?.mstRisiko).length;
  $('k-glim').textContent=rows.filter(r=>r.ringkas?.glimMal).length;
  $('cnt').textContent=RECS.length?`(${RECS.length})`:'';
  if(!rows.length){
    L.innerHTML = RECS.length
      ? `<div class="empty"><b>Tidak ada data yang cocok</b><span>Ubah tanggal atau kata pencarian.</span></div>`
      : `<div class="empty"><b>Belum ada data pasien</b><span>Isi formulir di menu Input skrining lalu tekan Simpan data. Data akan muncul di sini untuk seluruh tim, dikelompokkan per tanggal.</span><button class="btn sm" type="button" data-go="input">Mulai skrining</button></div>`;
    return;
  }
  const groups=new Map();
  rows.forEach(r=>{ if(!groups.has(r.tanggal)) groups.set(r.tanggal,[]); groups.get(r.tanggal).push(r); });
  L.innerHTML=[...groups].map(([t,rs])=>`<div class="day"><div class="dayh"><b>${esc(tglPanjang(t))}</b><span>${rs.length} pasien</span></div>`+
    rs.map(r=>{
      const s=r.ringkas||{}, c=s.glimMal?s.glimC:(s.mstRisiko?'warn':(s.mstRisiko===false?'ok':''));
      const I=r.inp||{};
      const meta=[r.rm&&('RM '+r.rm), I['f-usia']&&(I['f-usia']+' th'), I.jk==='p'?'L':'P', I['f-ruang']].filter(Boolean).map(esc).join(' · ');
      return `<button type="button" class="pt ${c}" data-id="${esc(r.id)}"><span class="bar"></span><span><span class="nm">${esc(r.nama)}</span><br><span class="meta">${meta}</span><br><span class="meta">oleh ${esc(r.olehNama||'–')}</span></span>`+
        `<span class="tags">${s.mst!=null?pill('MST '+s.mst,s.mstRisiko?'warn':'ok'):pill('MST –','mut')}${s.glimMal?pill(s.glimStadium===2?'GLIM berat':'GLIM sedang',s.glimC):''}</span></button>`;
    }).join('')+'</div>').join('');
}
function renderAkun(){
  $('ak-n').textContent=RECS.length;
  $('ak-d').textContent=new Set(RECS.map(r=>r.tanggal)).size;
  $('ak-last').textContent=RECS.length?tglPanjang(RECS[0].tanggal):'–';
}
function renderUsers(){
  if(!ME||ME.peran!=='admin') return;
  const tunggu=USERS.filter(u=>!u.aktif).length;
  $('tb-akun').textContent='Akun'+(tunggu?` (${tunggu} menunggu)`:'');
  const L=[...USERS].sort((a,b)=>(a.aktif===b.aktif?0:a.aktif?1:-1)||(a.nama||'').localeCompare(b.nama||''));
  $('akun-list').innerHTML=L.length?L.map(u=>{
    const self=u.uid===ME.uid;
    return `<div class="row acc"><span class="k" style="color:var(--fg)"><b>${esc(u.nama)}</b>${self?' (Anda)':''}<code>${esc(u.email||'')} · ${esc(u.profesi||'–')}</code></span>`+
      `<span class="acts">${u.aktif?pill('Aktif','ok'):pill('Menunggu','warn')}`+
      (self?pill(PERAN[u.peran]||u.peran,'info'):
        `<select data-uperan="${esc(u.uid)}" aria-label="Peran ${esc(u.nama)}" style="width:auto;padding:6px 8px">${Object.entries(PERAN).map(([k,v])=>`<option value="${k}"${u.peran===k?' selected':''}>${v}</option>`).join('')}</select>`+
        `<button class="btn sm ${u.aktif?'danger':''}" type="button" data-uaktif="${esc(u.uid)}">${u.aktif?'Nonaktifkan':'Setujui'}</button>`)+
      `</span></div>`;
  }).join(''):'<p class="note">Belum ada akun lain.</p>';
}

function detail(id){
  const r=RECS.find(x=>x.id===id); if(!r) return;
  const I=r.inp||{}, H=hitung(I), ki=H.imt!=null?kategoriIMT(H.imt):null;
  const row=(k,v)=>`<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  $('panel').innerHTML=`
    <div class="dayh"><span>${esc(tglPanjang(r.tanggal))}</span><button class="btn sm ghost" type="button" data-close>Tutup</button></div>
    <h2 id="d-nm">${esc(r.nama)}</h2>
    <div class="card"><div class="rows">
      ${row('No. RM',esc(r.rm||'–'))}${row('Jenis kelamin',I.jk==='p'?'Laki-laki':'Perempuan')}${row('Usia',I['f-usia']?esc(I['f-usia'])+' th':'–')}
      ${row('Ruang',esc(I['f-ruang']||'–'))}${row('Diagnosis',esc(I['f-dx']||'–'))}
    </div></div>
    <div class="card"><h2>Antropometri</h2><div class="rows">
      ${row('BB / TB',`${esc(I['a-bb']||'–')} kg / ${esc(I['a-tb']||'–')} cm`)}
      ${row('IMT',fmt(H.imt)+' '+(ki?pill(ki[0],ki[1]):''))}
      ${row('Penurunan BB',H.wl!=null?fmt(H.wl)+'% ('+(I['a-per']==='gt6'?'> 6 bln':'≤ 6 bln')+')':'–')}
      ${I['a-lila']?row('LiLA',esc(I['a-lila'])+' cm'):''}${I['a-betis']?row('Lingkar betis',esc(I['a-betis'])+' cm '+(H.betisRendah?pill('Rendah','warn'):pill('Normal','ok'))):''}
      ${I['a-hgs']?row('Kekuatan genggam',esc(I['a-hgs'])+' kg '+(H.hgsRendah?pill('Rendah','warn'):pill('Normal','ok'))):''}
    </div></div>
    <div class="res ${H.mstLengkap?(H.mstRisiko?'warn':'ok'):''}"><span class="lbl">MST</span><span class="big">${H.mstLengkap?H.mst+' · '+(H.mstRisiko?'Berisiko malnutrisi':'Tidak berisiko'):'Belum lengkap'}</span></div>
    <div class="res ${H.glimC==='mut'?'':H.glimC}"><span class="lbl">GLIM</span><span class="big">${esc(H.glim)}</span><p>${esc(H.glimKet)}</p></div>
    ${H.lab.length?`<div class="card"><h2>Laboratorium</h2><div class="rows">${H.lab.map(l=>row(`${esc(l.n)}<code>rujukan ${esc(l.ref)} ${esc(l.u)}</code>`,`${angka(l.v)} ${pill(l.s,l.c)}`)).join('')}</div></div>`:''}
    ${I['f-catatan']?`<div class="card"><h2>Catatan</h2><p style="margin:0;white-space:pre-wrap">${esc(I['f-catatan'])}</p></div>`:''}
    <p class="note">Diinput oleh ${esc(r.olehNama||'–')}${r.olehProfesi?' ('+esc(r.olehProfesi)+')':''} · ${esc(new Date(r.dibuat).toLocaleString('id-ID'))}${r.diubah&&r.diubah!==r.dibuat?` · diubah ${esc(r.diubahOleh||'')} ${esc(new Date(r.diubah).toLocaleString('id-ID'))}`:''}</p>
    <div class="btns" id="d-act">
      ${bolehUbah(r)?`<button class="btn" type="button" data-edit="${esc(r.id)}">Edit data</button>`:''}
      <button class="btn ghost" type="button" data-copy="${esc(r.id)}">Skrining ulang pasien ini</button>
      ${bolehHapus(r)?`<button class="btn danger" type="button" data-del="${esc(r.id)}">Hapus</button>`:''}
    </div>`;
  $('sheet').hidden=false;
}
function tutup(){ $('sheet').hidden=true; }
function keTab(t){
  document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-selected',x.dataset.t===t));
  document.querySelectorAll('section.tab').forEach(s=>s.hidden=s.id!=='tab-'+t);
  window.scrollTo({top:0});
}

/* ---------- CSV ---------- */
async function bagikanFile(nama,isi,tipe){
  if(Capacitor.isNativePlatform()){
    const r=await Filesystem.writeFile({path:nama,data:isi,directory:Directory.Cache,encoding:Encoding.UTF8});
    await Share.share({title:nama,url:r.uri,dialogTitle:'Simpan atau kirim file'});
  }else{
    const b=new Blob([isi],{type:tipe}), a=document.createElement('a');
    a.href=URL.createObjectURL(b); a.download=nama; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
  }
}
async function unduhCSV(){
  const rows=filtered();
  if(!rows.length){ toast('Tidak ada data untuk diunduh'); return; }
  const kol=['Tanggal','Nama','No RM','JK','Usia','Ruang','Diagnosis','BB','TB','IMT','BB lalu','Penurunan BB %','LiLA','Lingkar betis','Genggam','Skor MST','Risiko MST','GLIM','Etiologi GLIM',...LAB.map(L=>`${L.n} (${L.u})`),'Catatan','Diinput oleh','Profesi'];
  const q=v=>{ const s=v==null?'':String(v); return /[";\n,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const out=[kol.map(q).join(';')];
  rows.forEach(r=>{
    const I=r.inp||{}, H=hitung(I);
    out.push([r.tanggal,r.nama,r.rm,I.jk==='p'?'L':'P',I['f-usia'],I['f-ruang'],I['f-dx'],I['a-bb'],I['a-tb'],H.imt!=null?H.imt.toFixed(1).replace('.',','):'',I['a-bbl'],H.wl!=null?H.wl.toFixed(1).replace('.',','):'',I['a-lila'],I['a-betis'],I['a-hgs'],
      H.mst??'',H.mstRisiko==null?'':(H.mstRisiko?'Berisiko':'Tidak berisiko'),H.glim,H.glimMal?H.glimKet:'',...LAB.map(L=>I['l-'+L.k]||''),I['f-catatan'],r.olehNama,r.olehProfesi].map(q).join(';'));
  });
  try{ await bagikanFile('skrining-gizi-'+($('ftgl').value||'semua')+'.csv','﻿'+out.join('\r\n'),'text/csv;charset=utf-8'); }
  catch(e){ if(!/cancel/i.test(String(e&&e.message))) toast('File tidak bisa dibagikan'); }
}

/* ---------- Klik ---------- */
document.addEventListener('click',e=>{
  if(e.target.id==='sheet'){ tutup(); return; }
  const b=e.target.closest('button'); if(!b||!ME) return;
  if(b.dataset.t){ keTab(b.dataset.t); return; }
  if(b.dataset.go){ keTab(b.dataset.go); return; }
  if(b.classList.contains('pt')){ detail(b.dataset.id); return; }
  if(b.hasAttribute('data-close')){ tutup(); return; }
  if(b.dataset.edit){
    const r=RECS.find(x=>x.id===b.dataset.edit); if(!r||!bolehUbah(r)) return;
    fillForm(r.inp||{}); editId=r.id; $('edit-nm').textContent=r.nama; $('editflag').hidden=false;
    $('btn-save').textContent='Simpan perubahan'; tutup(); keTab('input'); renderLive(); return;
  }
  if(b.dataset.copy){
    const r=RECS.find(x=>x.id===b.dataset.copy); if(!r) return;
    const I={...r.inp}; ['mq1','mq2','mst-q1b','g-otot','g-inf','g-as1','g-as2','g-as3','f-catatan'].forEach(k=>delete I[k]);
    LAB.forEach(L=>delete I['l-'+L.k]);
    I['a-bbl']=r.inp?.['a-bb']||''; I['a-bb']=''; I['f-tgl']=today();
    editId=null; fillForm(I); $('editflag').hidden=true; $('btn-save').textContent='Simpan data';
    tutup(); keTab('input'); renderLive(); toast('Identitas disalin. BB lalu diisi dari skrining sebelumnya.'); return;
  }
  if(b.dataset.del){
    $('d-act').innerHTML=`<span style="font-weight:600">Hapus data ini secara permanen?</span><button class="btn danger solid" type="button" data-delyes="${esc(b.dataset.del)}">Ya, hapus</button><button class="btn ghost" type="button" data-delno="${esc(b.dataset.del)}">Batal</button>`;
    return;
  }
  if(b.dataset.delno){ detail(b.dataset.delno); return; }
  if(b.dataset.delyes){
    const r=RECS.find(x=>x.id===b.dataset.delyes); if(!r||!bolehHapus(r)) return;
    deleteDoc(doc(fdb,'skrining',r.id)).catch(err=>toast('Gagal menghapus: '+pesanGalat(err)));
    tutup(); toast('Data dihapus'); if(editId===r.id) newForm(); return;
  }
  if(b.dataset.uaktif){
    const u=USERS.find(x=>x.uid===b.dataset.uaktif); if(!u) return;
    updateDoc(doc(fdb,'users',u.uid),{aktif:!u.aktif}).then(()=>toast(u.aktif?`${u.nama} dinonaktifkan`:`${u.nama} disetujui`)).catch(err=>toast(pesanGalat(err)));
    return;
  }
});
document.addEventListener('change',e=>{
  const s=e.target.closest('select[data-uperan]'); if(!s||!ME||ME.peran!=='admin') return;
  updateDoc(doc(fdb,'users',s.dataset.uperan),{peran:s.value}).then(()=>toast('Peran diperbarui')).catch(err=>toast(pesanGalat(err)));
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('sheet').hidden) tutup(); });

$('form').addEventListener('input',renderLive);
$('form').addEventListener('change',renderLive);
$('form').addEventListener('submit',e=>e.preventDefault());
$('btn-save').addEventListener('click',simpan);
$('btn-reset').addEventListener('click',newForm);
$('btn-cancel-edit').addEventListener('click',newForm);
$('fq').addEventListener('input',renderList);
$('ftgl').addEventListener('change',renderList);
$('btn-today').addEventListener('click',()=>{ $('ftgl').value=today(); renderList(); });
$('btn-all').addEventListener('click',()=>{ $('ftgl').value=''; $('fq').value=''; renderList(); });
$('btn-csv').addEventListener('click',unduhCSV);

function statusJaringan(){ $('offline').hidden=navigator.onLine; }
window.addEventListener('online',statusJaringan); window.addEventListener('offline',statusJaringan);

/* ---------- Mulai ---------- */
buildLabForm(); buildRefLab(); statusJaringan();
if(!siap){ layar('cfg'); }
else{
  const app=initializeApp(firebaseConfig);
  auth=initializeAuth(app,{persistence:[indexedDBLocalPersistence,browserLocalPersistence]});
  try{ fdb=initializeFirestore(app,{localCache:persistentLocalCache()}); }
  catch(e){ fdb=initializeFirestore(app,{}); }
  onAuthStateChanged(auth,u=>{
    if(unsubMe){ unsubMe(); unsubMe=null; }
    berhentiData(); ME=null; tutup();
    if(!u){ layar('login'); return; }
    $('tunggu-msg').textContent='Menyiapkan akun…'; layar('tunggu');
    unsubMe=onSnapshot(doc(fdb,'users',u.uid),snap=>{
      if(!snap.exists()){ $('tunggu-msg').textContent='Menyiapkan akun…'; return; }
      const d=snap.data(), lama=ME;
      ME={uid:u.uid,email:u.email,...d};
      if(!d.aktif){ berhentiData(); $('tunggu-msg').textContent='Akun Anda sudah terdaftar dan sedang menunggu persetujuan admin.'; layar('tunggu'); return; }
      if(!lama||!lama.aktif||lama.peran!==d.peran){ berhentiData(); mulai(); }
      else perbaruiProfil();
    },err=>{ $('tunggu-msg').textContent=pesanGalat(err); layar('tunggu'); });
  });
}
