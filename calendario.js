// Calendário compartilhado (somente leitura) — Atendimentos às Famílias (EI, EFAI, EFAF e EM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { LOGO_E, LOGO_A } from "./logos.js";

const STATUS_LBL = {agendado:'Agendado',confirmado:'Confirmado',realizado:'Realizado',faltou:'Família faltou',cancelado:'Cancelado'};
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_LONGO=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const hoje=()=>iso(new Date());
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dataLonga(s){const d=new Date(s+'T12:00');const t=DIAS_LONGO[d.getDay()]+', '+pad(d.getDate())+'/'+pad(d.getMonth()+1);return t.charAt(0).toUpperCase()+t.slice(1)}
function relDia(s){const h=new Date();const a=iso(h);h.setDate(h.getDate()+1);const b=iso(h);return s===a?'Hoje':s===b?'Amanhã':''}

const S={itens:[],ok:false,mes:hoje().slice(0,7),dia:hoje(),erro:'',segView:''};
function seg(a){if(a.segmento)return a.segmento;const t=a.turma||'';if(/s[ée]rie/i.test(t)||/\bEM\b/.test(t))return 'Ensino Médio';if(/[6-9]\s*º?\s*ano/i.test(t))return 'EFAF';if(/ano/i.test(t))return 'EFAI';return 'Educação Infantil'}
function segCurto(s){return s==='EFAI'||s==='EFAF'?s:s==='Ensino Médio'?'EM':'EI'}
const SEG_URL=window.SEG_FIXO||{EI:'Educação Infantil',EFAI:'EFAI',EFAF:'EFAF',EM:'Ensino Médio'}[(new URLSearchParams(location.search).get('seg')||'').toUpperCase()]||'';
if(SEG_URL)S.segView=SEG_URL;
const vis=a=>!S.segView||seg(a)===S.segView;
function segToggle(){if(SEG_URL)return '';return '<div class="seg-toggle" role="group" aria-label="Segmento">'+[['','Todos'],['Educação Infantil','Educação Infantil'],['EFAI','EFAI'],['EFAF','EFAF'],['Ensino Médio','Ensino Médio']].map(o=>'<button type="button" class="seg-btn" data-seg="'+o[0]+'" aria-pressed="'+(S.segView===o[0])+'">'+o[1]+'</button>').join('')+'</div>'}

const app=document.getElementById('app');

function render(){
  const [y,m]=S.mes.split('-').map(Number);
  const first=new Date(y,m-1,1);
  const total=Math.ceil((first.getDay()+new Date(y,m,0).getDate())/7)*7;
  const porDia={};S.itens.forEach(a=>{if(a.status!=='cancelado'&&vis(a))(porDia[a.data]=porDia[a.data]||[]).push(a)});
  const h=hoje();let cells='';
  for(let i=0;i<total;i++){
    const d=new Date(y,m-1,1-first.getDay()+i),ds=iso(d),fora=d.getMonth()!==m-1,evs=porDia[ds]||[];
    const cls='day'+(fora?' out':'')+(d.getDay()===0||d.getDay()===6?' wknd':'')+(ds===h?' today':'')+(ds===S.dia?' sel':'');
    cells+='<button type="button" class="'+cls+'" data-dia="'+ds+'" aria-pressed="'+(ds===S.dia)+'" aria-label="'+esc(dataLonga(ds))+': '+evs.length+' atendimento(s)">'+
      '<span class="n"><span>'+d.getDate()+'</span></span>'+
      evs.slice(0,2).map(a=>'<span class="ev '+esc(a.status)+'" title="'+esc(a.hora)+'">'+esc(String(a.crianca).split(' ')[0])+'</span>').join('')+
      (evs.length>2?'<span class="more">+'+(evs.length-2)+' mais</span>':'')+
      (evs.length?'<span class="dots">'+evs.map(a=>'<i class="d-'+esc(a.status)+'"></i>').join('')+'</span>':'')+'</button>';
  }
  const lista=S.itens.filter(a=>a.data===S.dia&&vis(a));
  const rel=relDia(S.dia);
  app.innerHTML=
   '<header class="top"><div class="wrap"><div class="brand"><img class="logo-eus" src="'+LOGO_E+'" alt="Antares Full Time Eusébio"><img class="logo-ant" src="'+LOGO_A+'" alt="Colégio Antares"><span class="logo-sep"></span><div><h1>Calendário de Atendimentos</h1><small>'+(SEG_URL||'Educação Infantil, EFAI, EFAF e Ensino Médio')+'</small></div></div><span class="tag">Somente leitura</span></div></header>'+
   '<main class="wrap"><div class="view">'+
   (S.erro?'<p class="msg err">'+esc(S.erro)+'</p>':'')+
   segToggle()+'<div class="cal-wrap"><section class="panel">'+
    '<div class="cal-head"><h2>'+MESES[m-1]+' '+y+'</h2><button class="btn small" data-cal="0">Hoje</button><button class="icon-btn" data-cal="-1" aria-label="Mês anterior">‹</button><button class="icon-btn" data-cal="1" aria-label="Próximo mês">›</button></div>'+
    '<div class="cal">'+['dom','seg','ter','qua','qui','sex','sáb'].map(x=>'<div class="dow">'+x+'</div>').join('')+cells+'</div>'+
    '<div class="legend"><span><i class="d-agendado"></i>Agendado</span><span><i class="d-confirmado"></i>Confirmado</span><span><i class="d-realizado"></i>Realizado</span><span><i class="d-faltou"></i>Família faltou</span></div>'+
   '</section><section class="panel">'+
    '<div class="dia-head"><h2>'+esc(dataLonga(S.dia))+'</h2>'+(rel?'<span class="turma">'+rel+'</span>':'')+'</div>'+
    (!S.ok?'<p class="muted">Carregando…</p>':lista.length?'<div class="list">'+lista.map(a=>
      '<article class="item st-'+esc(a.status)+'"><div class="item-time"><b>'+esc(a.hora)+'</b><span>'+(Number(a.duracao)||30)+' min</span></div><div style="min-width:0">'+
      '<div class="item-top"><h3>'+esc(a.crianca)+'</h3><span class="turma">'+esc(a.turma)+'</span><span class="segtag s-'+segCurto(seg(a))+'">'+segCurto(seg(a))+'</span><span class="pill p-'+esc(a.status)+'">'+esc(STATUS_LBL[a.status]||a.status)+'</span></div>'+
      '<p class="item-sub muted">'+esc(a.modalidade)+(a.atende?' · com '+esc(a.atende):'')+'</p></div></article>').join('')+'</div>'
     :'<div class="empty"><b>Nenhum atendimento neste dia.</b></div>')+
   '</section></div>'+
   '<p class="note">Atualiza sozinho. Para agendar ou alterar, use o sistema de Atendimentos às Famílias.</p>'+
   '</div></main>';
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-dia],[data-cal],[data-seg]');if(!t)return;
  if(t.dataset.seg!==undefined){S.segView=t.dataset.seg;render();return}
  if(t.dataset.dia){S.dia=t.dataset.dia;S.mes=S.dia.slice(0,7)}
  else if(t.dataset.cal==='0'){S.mes=hoje().slice(0,7);S.dia=hoje()}
  else{const p=S.mes.split('-').map(Number);S.mes=iso(new Date(p[0],p[1]-1+Number(t.dataset.cal),1)).slice(0,7)}
  render();
});
render();
try{
  const db=getFirestore(initializeApp(firebaseConfig));
  onSnapshot(collection(db,'publico'),snap=>{
    S.itens=snap.docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>String(a.quando).localeCompare(String(b.quando)));
    S.ok=true;S.erro='';render();
  },()=>{S.ok=true;S.erro='Não foi possível carregar o calendário agora. Tente recarregar a página.';render()});
}catch(e){S.ok=true;S.erro='O calendário ainda não está configurado.';render()}
setInterval(render,60000);
