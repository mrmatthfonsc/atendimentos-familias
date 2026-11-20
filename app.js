// Atendimentos às Famílias — Educação Infantil, EFAI, EFAF e Ensino Médio (Colégio Antares)
// Login: Firebase Authentication (e-mail e senha) · Dados: Cloud Firestore
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, where,
  onSnapshot, query, orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ASSINATURA_PADRAO } from "./firebase-config.js";
import { LOGO_E, LOGO_A } from "./logos.js";

const STATUS = [
  ['agendado','Agendado'],['confirmado','Confirmado'],['realizado','Realizado'],['faltou','Família faltou'],['cancelado','Cancelado']
];
const STATUS_LBL = Object.fromEntries(STATUS);
const MOTIVOS = ['Acolhimento e adaptação','Desenvolvimento e aprendizagem','Rendimento e avaliações','Tarefas e rotina de estudos','Projeto de vida e vestibular','Comportamento e convivência','Saúde, alimentação e sono','Devolutiva / relatório','Solicitação da família','Outro'];
const LETRAS = ['A','B','C','D','E'];
const TURMAS = ['Infantil 1','Infantil 2','Infantil 3','Infantil 4','Infantil 5','1º ano','2º ano','3º ano','4º ano','5º ano','6º ano','7º ano','8º ano','9º ano','1ª série','2ª série','3ª série'];
const SEGMENTOS = ['Educação Infantil','EFAI','EFAF','Ensino Médio'];
const MODALIDADES = ['Presencial','Online','Telefone'];
const SOLICITANTES = ['Família','Professora da turma','Coordenação','Direção','Psicologia','Outro'];
const PAPEIS = ['Coordenação','Coordenação Bilíngue','Professora da turma','SOEP','DEFE','Psicóloga','Direção','Nutricionista','Auxiliar de turma'];

const S = {
  authUser:null, me:null, perfilOk:false, bootstrap:null,
  usuarios:[], atend:[], config:{}, okA:false,
  tab:'painel', editId:null, fatal:'', gateMsg:'', gateInfo:'', loading:true,
  filtro:{periodo:'proximos', status:'', turma:'', prof:'', q:'', seg:''}, segView:'',
  delArm:false, unsub:[]
};
const $ = s => document.querySelector(s);
const app = document.getElementById('app');


S.calMes = hoje().slice(0,7); S.calDia = hoje(); S.novaData = null;

/* ---------- Firebase ---------- */
let fb, auth, db;
try{
  if(String(firebaseConfig.apiKey).includes('COLE_AQUI')) throw new Error('config');
  fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  db = getFirestore(fb);
  setPersistence(auth, browserLocalPersistence).catch(()=>{});
}catch(e){
  S.fatal = 'O site ainda não está ligado ao Firebase. Preencha o arquivo firebase-config.js com a configuração do seu projeto (veja o LEIAME).';
}

/* ---------- utilidades ---------- */
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pad(n){return String(n).padStart(2,'0')}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function hoje(){return iso(new Date())}
function addDias(s,n){const d=new Date(s+'T12:00');d.setDate(d.getDate()+n);return iso(d)}
function quando(a){return new Date(a.data+'T'+(a.hora||'00:00'))}
const DIAS=['dom','seg','ter','qua','qui','sex','sáb'];
const DIAS_LONGO=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function dataCurta(s){if(!s)return'';const d=new Date(s+'T12:00');return DIAS[d.getDay()]+', '+pad(d.getDate())+'/'+pad(d.getMonth()+1)}
function dataLonga(s){if(!s)return'';const d=new Date(s+'T12:00');return DIAS_LONGO[d.getDay()]+', '+pad(d.getDate())+'/'+pad(d.getMonth()+1)}
function relDia(s){const h=hoje();if(s===h)return'Hoje';if(s===addDias(h,1))return'Amanhã';if(s===addDias(h,-1))return'Ontem';return''}
function fone(t){let d=String(t||'').replace(/\D/g,'');if(!d)return'';if(d.length<=11&&!d.startsWith('55'))d='55'+d;return d}
function waLink(t,msg){const n=fone(t);return n?'https://wa.me/'+n+'?text='+encodeURIComponent(msg):''}
function gmailLink(to,assunto,corpo){return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to||'')+'&su='+encodeURIComponent(assunto)+'&body='+encodeURIComponent(corpo)}
function gcalLink(a){
  const ini=quando(a); const fim=new Date(ini.getTime()+(Number(a.duracao)||30)*60000);
  const f=d=>d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';
  const p=uById(a.profissional);
  const det='Família: '+a.responsavel+(a.parentesco?' ('+a.parentesco+')':'')+'\nTelefone: '+(a.telefone||'—')+'\nMotivo: '+a.motivo+(a.pauta?'\nPauta: '+a.pauta:'')+'\nModalidade: '+a.modalidade;
  let u='https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent('Atendimento · '+a.crianca+' ('+a.turma+')')+'&dates='+f(ini)+'/'+f(fim)+'&ctz=America/Fortaleza&details='+encodeURIComponent(det);
  if(p&&p.email)u+='&add='+encodeURIComponent(p.email);
  return u;
}
function uById(id){return S.usuarios.find(u=>u.id===id)}
const ASS_KEYS=()=>SEGMENTOS.concat(['Coordenação Bilíngue']);
const ASS_PADRAO={'Coordenação Bilíngue':'Coordenação Bilíngue · Colégio Antares','Educação Infantil':'Coordenação da Educação Infantil · Colégio Antares',EFAI:'Coordenação do EFAI · Colégio Antares',EFAF:'Coordenação do EFAF · Colégio Antares','Ensino Médio':'Coordenação do Ensino Médio · Colégio Antares'};
function assinatura(a){const pr=a&&a.profissional?uById(a.profissional):null;const s=a&&a.chave?a.chave:pr&&pr.papel==='bilingue'?'Coordenação Bilíngue':a?seg(a):'Educação Infantil';const m=S.config.assinaturas||{};return m[s]||ASS_PADRAO[s]||S.config.assinatura||ASSINATURA_PADRAO}
let toastT;function toast(m){let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2800)}
function erroMsg(e){
  const c=(e&&e.code)||'';
  const M={
    'auth/invalid-credential':'E-mail ou senha incorretos.','auth/wrong-password':'E-mail ou senha incorretos.','auth/user-not-found':'E-mail ou senha incorretos.',
    'auth/invalid-email':'Digite um e-mail válido.','auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/email-already-in-use':'Já existe uma conta com esse e-mail.','auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
    'auth/network-request-failed':'Sem conexão. Verifique a internet e tente de novo.','auth/operation-not-allowed':'Ative o login por e-mail e senha no Firebase (Authentication → Método de login).',
    'permission-denied':'Você não tem permissão para fazer isso. Fale com o administrador.','unavailable':'Sem conexão com o banco de dados. Tente de novo em instantes.'
  };
  return M[c]||'Algo deu errado. Tente de novo. ('+(c||'erro')+')';
}
const isAdmin=()=>S.me&&S.me.papel==='admin'&&S.me.ativo!==false;
const NIVEL={leitura:0,equipe:1,soep:1,defe:1,coord:2,bilingue:2,direcao:3,admin:4};
const papelDe=u=>(u&&u.papel)||'equipe';
const isCoord=()=>S.me&&['coord','bilingue','direcao'].includes(S.me.papel)&&S.me.ativo!==false;
const isGestor=()=>isAdmin()||isCoord();
const podeEscrever=()=>S.me&&S.me.papel!=='leitura';
const isPrincipal=()=>isAdmin()&&!!S.principal&&S.me.id===S.principal;
const PAPEL_LBL={admin:'Administrador',direcao:'Direção',coord:'Coordenação',bilingue:'Coordenação Bilíngue',soep:'SOEP',defe:'DEFE',equipe:'Equipe',leitura:'Consulta (só leitura)'};

/* ---------- mensagens ---------- */
function msgLembrete(a){return 'Olá, '+primeiroNome(a.responsavel)+'! Tudo bem?\n\nPassando para lembrar do nosso atendimento sobre '+a.crianca+' ('+a.turma+'), '+dataLonga(a.data)+', às '+a.hora+' ('+String(a.modalidade).toLowerCase()+').\n\nPode confirmar sua presença respondendo esta mensagem?\n\n'+assinatura(a)}
function msgAgendado(a){return 'Olá, '+primeiroNome(a.responsavel)+'! Agendamos um atendimento sobre '+a.crianca+' ('+a.turma+') para '+dataLonga(a.data)+', às '+a.hora+' ('+String(a.modalidade).toLowerCase()+').\n\nQualquer imprevisto, é só nos avisar por aqui.\n\n'+assinatura(a)}
function msgEquipe(a){return 'Atendimento '+segCurto(seg(a))+': '+a.crianca+' ('+a.turma+')\n'+dataLonga(a.data)+', '+a.hora+' · '+a.modalidade+'\nFamília: '+a.responsavel+(a.parentesco?' ('+a.parentesco+')':'')+' · '+(a.telefone||'sem telefone')+'\nMotivo: '+a.motivo+(a.pauta?'\nPauta: '+a.pauta:'')+'\nStatus: '+STATUS_LBL[a.status]}

function seg(a){if(a.segmento)return a.segmento;const t=a.turma||'';if(/s[ée]rie/i.test(t)||/\bEM\b/.test(t))return 'Ensino Médio';if(/[6-9]\s*º?\s*ano/i.test(t))return 'EFAF';if(/ano/i.test(t))return 'EFAI';return 'Educação Infantil'}
function segCurto(s){return s==='EFAI'||s==='EFAF'?s:s==='Ensino Médio'?'EM':'EI'}
function meusSegs(){if(!S.me)return [];if(S.me.papel==='admin'||!Array.isArray(S.me.segmentos))return SEGMENTOS.slice();return SEGMENTOS.filter(s=>S.me.segmentos.includes(s))}
function veTudo(){return meusSegs().length===SEGMENTOS.length}
function segToggle(){if(meusSegs().length<2)return '';return '<div class="seg-toggle" role="group" aria-label="Segmento">'+[['','Todos']].concat(meusSegs().map(s=>[s,s])).map(o=>'<button type="button" class="seg-btn" data-seg="'+o[0]+'" aria-pressed="'+(S.segView===o[0])+'">'+o[1]+'</button>').join('')+'</div>'}

/* ---------- alertas ---------- */
function alertas(){
  const now=new Date(), h=hoje(), am=addDias(h,1), lim3=addDias(h,3);
  const ativos=S.atend.filter(a=>a.status==='agendado'||a.status==='confirmado');
  const semRegistro=ativos.filter(a=>quando(a).getTime()+((Number(a.duracao)||30)*60000)<now.getTime());
  const confirmar=S.atend.filter(a=>a.status==='agendado'&&quando(a)>now&&(quando(a)-now)<=72*3600e3);
  const lembrete=ativos.filter(a=>a.data===am&&!a.lembreteEm);
  const retorno=S.atend.filter(a=>a.retorno&&a.retorno>=h&&a.retorno<=lim3);
  return {semRegistro,confirmar,lembrete,retorno,total:new Set([...semRegistro,...confirmar,...lembrete,...retorno].map(a=>a.id)).size};
}

/* ---------- telas ---------- */
function render(){
  if(S.fatal){app.innerHTML=gate('<p class="msg err">'+esc(S.fatal)+'</p>');return}
  if(S.loading){app.innerHTML=gate('<p class="muted">Carregando…</p>');return}
  if(!S.authUser){app.innerHTML=gate(S.bootstrap===false?setupForm():loginForm());setTimeout(()=>{const i=$('#lg-email')||$('#su-nome');i&&i.focus()},0);return}
  if(!S.perfilOk){app.innerHTML=gate('<p class="muted">Carregando seu perfil…</p>');return}
  if(!S.me||S.me.ativo===false){app.innerHTML=gate('<p class="msg err">'+(S.me?'Seu acesso foi desativado.':'Sua conta ainda não foi liberada.')+' Fale com o administrador da coordenação.</p><button class="btn" data-act="sair">Sair</button>');return}
  if(!meusSegs().length){app.innerHTML=gate('<p class="msg info">Sua conta ainda não tem segmento definido. Peça ao administrador para liberar Educação Infantil, EFAI, EFAF ou Ensino Médio para você.</p><button class="btn" data-act="sair">Sair</button>');return}
  document.body.classList.toggle('so-leitura',!podeEscrever());if(!podeEscrever()&&S.tab==='novo')S.tab='painel';
  app.innerHTML=shell();
  renderView();
}
function gate(inner){return '<div class="entry wrap"><div class="entry-in"><section class="entry-hero"><div class="entry-logos"><img class="logo-eus" src="'+LOGO_E+'" alt="Antares Full Time Eusébio"><img class="logo-ant" src="'+LOGO_A+'" alt="Colégio Antares"></div><div class="entry-title"><span class="eyebrow">Colégio Antares · Eusébio</span><h1>Atendimentos às Famílias</h1><p class="entry-lead">Agende, acompanhe e registre os atendimentos com as famílias de todos os segmentos, em um só lugar.</p></div><div class="segs"><div class="seg-card" style="--c:var(--accent)"><b>Educação Infantil</b><span>Infantil I ao V</span></div><div class="seg-card" style="--c:var(--info)"><b>EFAI</b><span>1º ao 5º ano</span></div><div class="seg-card" style="--c:var(--warn)"><b>EFAF</b><span>6º ao 9º ano</span></div><div class="seg-card" style="--c:var(--ok)"><b>Ensino Médio</b><span>1ª à 3ª série</span></div></div><ul class="feats"><li>Agenda e calendário de atendimentos</li><li>Alertas e lembretes por WhatsApp e e-mail</li><li>Ficha de atendimento pronta para imprimir</li></ul><a class="entry-link" href="calendario.html" target="_blank" rel="noopener">Ver o calendário compartilhado →</a></section><section class="entry-card">'+inner+'</section></div></div>'}
function loginForm(){
  return '<div><h2>Entrar</h2><p class="note" style="margin:4px 0 0">Use o e-mail e a senha cadastrados pela coordenação.</p></div>'+
  '<form id="f-login" class="view" style="gap:12px">'+
  (S.gateMsg?'<p class="msg err">'+esc(S.gateMsg)+'</p>':'')+
  (S.gateInfo?'<p class="msg ok">'+esc(S.gateInfo)+'</p>':'')+
  '<label class="field"><span>E-mail</span><input id="lg-email" type="email" name="email" autocomplete="username" required></label>'+
  '<label class="field"><span>Senha</span><input id="lg-senha" type="password" name="password" autocomplete="current-password" required></label>'+
  '<button class="btn primary" type="submit" style="justify-content:center">Entrar</button>'+
  '<button class="btn" type="button" data-act="esqueci" style="justify-content:center">Esqueci minha senha</button></form>'
}
function setupForm(){
  return '<h2>Primeiro acesso</h2><p class="msg info">Primeiro acesso: crie a conta de administrador. Depois você cadastra a equipe na aba Equipe.</p>'+
  '<form id="f-setup" class="view" style="gap:12px">'+
  (S.gateMsg?'<p class="msg err">'+esc(S.gateMsg)+'</p>':'')+
  '<label class="field"><span>Seu nome</span><input id="su-nome" required></label>'+
  '<label class="field"><span>E-mail (será seu login)</span><input id="su-email" type="email" autocomplete="username" required></label>'+
  '<label class="field"><span>Senha (mínimo 6 caracteres)</span><input id="su-senha" type="password" autocomplete="new-password" minlength="6" required></label>'+
  '<label class="field"><span>WhatsApp</span><input id="su-wa" inputmode="tel" placeholder="(85) 9 9999-9999"></label>'+
  '<button class="btn primary" type="submit" style="justify-content:center">Criar administrador</button>'+
  '<button class="btn" type="button" data-act="ja-tenho" style="justify-content:center">Já tenho conta</button></form>'
}
function shell(){
  const al=alertas();
  const tabs=[['painel','Painel',al.total],['agenda','Agenda',0],['novo',S.editId?'Editar atendimento':'Novo atendimento',0],['alunos','Alunos',0],['equipe',isGestor()?'Usuários':'Minha conta',0]];
  return '<header class="top"><div class="wrap">'+
    '<div class="brand"><img class="logo-eus" src="'+LOGO_E+'" alt="Antares Full Time Eusébio"><img class="logo-ant" src="'+LOGO_A+'" alt="Colégio Antares"><span class="logo-sep"></span><div><h1>Atendimentos às Famílias</h1><small>Educação Infantil, EFAI, EFAF e Ensino Médio</small></div></div>'+
    '<div class="me"><span>Olá, <b>'+esc(primeiroNome(S.me.nome))+'</b></span><button class="btn small" data-act="sair">Sair</button></div>'+
    '<nav class="tabs" role="tablist">'+tabs.map(t=>'<button class="tab" role="tab" data-tab="'+t[0]+'" aria-selected="'+(S.tab===t[0])+'">'+esc(t[1])+(t[0]==='painel'?'<span class="badge" id="badge-painel"'+(t[2]?'':' hidden')+'>'+t[2]+'</span>':'')+'</button>').join('')+'</nav>'+
  '</div></header><main class="wrap" id="main"></main>'
}
function renderView(){
  const m=$('#main'); if(!m)return;
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===S.tab)));
  if(S.tab==='painel')m.innerHTML='<div class="view"><div id="live-painel"></div></div>';
  if(S.tab==='agenda')m.innerHTML='<div class="view">'+filtrosHTML()+'<div id="live-agenda"></div></div>';
  if(S.tab==='novo')m.innerHTML='<div class="view">'+formHTML()+'</div>';
  if(S.tab==='alunos'){m.innerHTML='<div class="view">'+alunosHTML()+'</div>';garantirAlunos(anoSel())}
  if(S.tab==='equipe')m.innerHTML='<div class="view">'+(isGestor()?usuariosHTML()+(isAdmin()?assinaturasHTML():''):'')+contaHTML()+'</div>';
  refreshLive();
}
function refreshLive(){
  if(!S.me)return;
  const al=alertas();
  const b=$('#badge-painel'); if(b){b.textContent=al.total;b.hidden=!al.total}
  const p=$('#live-painel'); if(p)p.innerHTML=painelHTML(al);
  const a=$('#live-agenda'); if(a)a.innerHTML=agendaHTML();
  const e=$('#live-equipe'); if(e)e.innerHTML=listaEquipe();
}

function pill(s){return '<span class="pill p-'+esc(s)+'">'+esc(STATUS_LBL[s]||s)+'</span>'}
function card(a,why){
  const p=uById(a.profissional);
  const rel=relDia(a.data);
  const futuro=a.data>addDias(hoje(),1);
  const textoFam=a.status==='agendado'&&futuro?msgAgendado(a):msgLembrete(a);
  const wa1=waLink(a.telefone,textoFam);
  const wa1b=a.telefone2?waLink(a.telefone2,textoFam.replace('Olá, '+primeiroNome(a.responsavel)+'!','Olá, '+primeiroNome(a.responsavel2||a.responsavel)+'!')):'';
  const wa2=p&&p.whatsapp?waLink(p.whatsapp,msgEquipe(a)):'';
  const mail=a.email?gmailLink(a.email,'Atendimento · '+a.crianca,textoFam):'';
  const extra=[];
  if(a.lembreteEm)extra.push('lembrete preparado em '+dataCurta(String(a.lembreteEm).slice(0,10)));
  if(a.retorno)extra.push('retorno previsto '+dataCurta(a.retorno));
  return '<article class="item st-'+esc(a.status)+'">'+
   '<div class="item-time"><b>'+esc(a.hora)+'</b><span>'+esc(rel||dataCurta(a.data))+'</span></div>'+
   '<div style="min-width:0">'+
    (why?'<div class="why">'+esc(why)+'</div>':'')+
    '<div class="item-top"><h3>'+esc(a.crianca)+'</h3><span class="turma">'+esc(a.turma)+'</span><span class="segtag s-'+segCurto(seg(a))+'">'+segCurto(seg(a))+'</span>'+pill(a.status)+'</div>'+
    '<p class="item-sub">'+esc(a.responsavel)+(a.parentesco?' ('+esc(a.parentesco)+')':'')+' · '+esc(a.telefone||'sem telefone')+'</p>'+
    '<p class="item-sub muted">'+esc(a.motivo)+' · '+esc(a.modalidade)+' · '+(Number(a.duracao)||30)+' min · com '+esc(p?p.nome:'—')+(extra.length?' · '+esc(extra.join(' · ')):'')+'</p>'+
    (a.solicitante||quemAtende(a,true)?'<p class="item-sub muted">'+(a.solicitante?'Pedido por: '+esc(a.solicitante):'')+(a.solicitante&&quemAtende(a,true)?' · ':'')+(quemAtende(a,true)?'Participam: '+esc(quemAtende(a,true)):'')+'</p>':'')+
    (a.registro?'<p class="item-sub"><span class="label">Registro</span> '+esc(a.registro)+'</p>':'')+
    '<div class="acts">'+
      (wa1?'<a class="btn small wa" target="_blank" rel="noopener" href="'+esc(wa1)+'" data-mark="'+esc(a.id)+'">WhatsApp '+esc(a.telefone2?primeiroNome(a.responsavel):'família')+'</a>':'')+
      (wa1b?'<a class="btn small wa" target="_blank" rel="noopener" href="'+esc(wa1b)+'" data-mark="'+esc(a.id)+'">WhatsApp '+esc(primeiroNome(a.responsavel2)||'2º resp.')+'</a>':'')+
      (wa2?'<a class="btn small" target="_blank" rel="noopener" href="'+esc(wa2)+'">Avisar '+esc(primeiroNome(p.nome))+'</a>':'')+
      (mail?'<a class="btn small" target="_blank" rel="noopener" href="'+esc(mail)+'">E-mail</a>':'')+
      '<a class="btn small" target="_blank" rel="noopener" href="'+esc(gcalLink(a))+'">Google Agenda</a>'+
      '<button class="btn small" data-act="ficha" data-id="'+esc(a.id)+'">Documentos</button>'+
      '<button class="btn small" data-act="editar" data-id="'+esc(a.id)+'">Editar</button>'+
      '<select aria-label="Status" data-status="'+esc(a.id)+'">'+STATUS.map(s=>'<option value="'+s[0]+'"'+(s[0]===a.status?' selected':'')+'>'+s[1]+'</option>').join('')+'</select>'+
    '</div>'+
   '</div></article>'
}
function painelHTML(al){
  const h=hoje(), sem7=addDias(h,7);
  const doDia=S.atend.filter(a=>a.data===h&&a.status!=='cancelado');
  const prox7=S.atend.filter(a=>a.data>=h&&a.data<=sem7&&a.status!=='cancelado'&&a.status!=='realizado');
  let html='<div class="stats">'+
    stat('Hoje',doDia.length,'hoje',false)+
    stat('Próximos 7 dias',prox7.length,'semana',false)+
    stat('Aguardando confirmação',al.confirmar.length,'confirmar',al.confirmar.length>0)+
    stat('Sem registro',al.semRegistro.length,'passados',al.semRegistro.length>0)+
  '</div>';
  html+='<div class="row">'+segToggle()+'</div>'+waResumoHTML()+linksHTML()+'<div class="cal-wrap"><section class="panel">'+calHTML(al)+'</section><section class="panel">'+diaHTML()+'</section></div>';
  html+='<section class="panel"><h2>Alertas</h2>';
  if(!S.okA)html+='<p class="muted">Carregando…</p>';
  else if(!al.total)html+='<div class="empty"><b>Nenhum alerta no momento.</b><span>Aqui aparecem lembretes para enviar às famílias, confirmações pendentes, atendimentos sem registro e retornos previstos.</span></div>';
  else html+='<div class="alerts">'+
      grupo('Lembrar a família (atendimento amanhã)','var(--sun)',al.lembrete,'Enviar lembrete pelo WhatsApp')+
      grupo('Aguardando confirmação da família (próximas 72h)','var(--info)',al.confirmar,'Confirmar presença')+
      grupo('Atendimentos que já passaram e estão sem registro','var(--bad)',al.semRegistro,'Registrar o que aconteceu')+
      grupo('Retornos previstos (próximos 3 dias)','var(--accent)',al.retorno,'Agendar retorno')+'</div>';
  return html+'</section>';
}

/* ---------- calendário ---------- */
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function primeiroNome(n){return String(n||'').split(' ')[0]}
function calHTML(al){
  const [y,m]=S.calMes.split('-').map(Number);
  const first=new Date(y,m-1,1), start=new Date(y,m-1,1-first.getDay());
  const total=Math.ceil((first.getDay()+new Date(y,m,0).getDate())/7)*7;
  const porDia={}; S.atend.forEach(a=>{if(a.status!=='cancelado'&&(!S.segView||seg(a)===S.segView))(porDia[a.data]=porDia[a.data]||[]).push(a)});
  const alertDias=new Set([...al.lembrete,...al.confirmar,...al.semRegistro].map(a=>a.data).concat(al.retorno.map(a=>a.retorno)));
  const h=hoje(); let cells='';
  for(let i=0;i<total;i++){
    const d=new Date(y,m-1,1-first.getDay()+i), ds=iso(d), fora=d.getMonth()!==m-1;
    const evs=porDia[ds]||[];
    const cls='day'+(fora?' out':'')+(d.getDay()===0||d.getDay()===6?' wknd':'')+(ds===h?' today':'')+(ds===S.calDia?' sel':'');
    cells+='<button type="button" class="'+cls+'" data-dia="'+ds+'" aria-label="'+esc(dataLonga(ds))+': '+evs.length+' atendimento(s)" aria-pressed="'+(ds===S.calDia)+'">'+
      '<span class="n"><span>'+d.getDate()+'</span>'+(alertDias.has(ds)?'<i class="alert-dot"></i>':'')+'</span>'+
      evs.slice(0,2).map(a=>'<span class="ev '+esc(a.status)+'" title="'+esc(a.hora)+'">'+esc(primeiroNome(a.crianca))+'</span>').join('')+
      (evs.length>2?'<span class="more">+'+(evs.length-2)+' mais</span>':'')+
      (evs.length?'<span class="dots">'+evs.map(a=>'<i class="d-'+esc(a.status)+'"></i>').join('')+'</span>':'')+
    '</button>';
  }
  return '<div class="cal-head"><h2>'+MESES[m-1]+' '+y+'</h2>'+
    '<button class="btn small" data-act="copiar-link" aria-expanded="'+!!S.linksAbertos+'">Links do calendário</button>'+'<button class="btn small" data-cal="0">Hoje</button>'+
    '<button class="icon-btn" data-cal="-1" aria-label="Mês anterior">‹</button>'+
    '<button class="icon-btn" data-cal="1" aria-label="Próximo mês">›</button></div>'+
    '<div class="cal">'+['dom','seg','ter','qua','qui','sex','sáb'].map(x=>'<div class="dow">'+x+'</div>').join('')+cells+'</div>'+
    '<div class="legend"><span><i class="d-agendado"></i>Agendado</span><span><i class="d-confirmado"></i>Confirmado</span><span><i class="d-realizado"></i>Realizado</span><span><i class="d-faltou"></i>Família faltou</span><span><i style="background:var(--sun);border-radius:50%"></i>Tem alerta</span></div>';
}
function diaHTML(){
  const ds=S.calDia, rel=relDia(ds);
  const lista=S.atend.filter(a=>a.data===ds&&(!S.segView||seg(a)===S.segView));
  let html='<div class="dia-head"><h2>'+esc(dataLonga(ds).replace(/^./,c=>c.toUpperCase()))+'</h2>'+(rel?'<span class="turma">'+rel+'</span>':'')+'</div>';
  if(!S.okA)return html+'<p class="muted">Carregando…</p>';
  html+=lista.length?'<div class="list">'+lista.map(a=>card(a)).join('')+'</div>':'<div class="empty"><b>Nenhum atendimento neste dia.</b><span>Escolha outro dia no calendário ou agende um novo.</span></div>';
  return html+'<div class="row" style="margin-top:12px"><button class="btn primary" data-act="novo-dia">Agendar neste dia</button></div>';
}

function resumoTexto(sv){
  if(sv===undefined)sv=S.segView;
  const h=hoje(), am=addDias(h,1), al=alertas();
  const vis=a=>!sv||seg(a)===sv;
  const linha=a=>a.hora+' · '+a.crianca+' ('+a.turma+') · '+STATUS_LBL[a.status]+(uById(a.profissional)?' · '+primeiroNome(uById(a.profissional).nome):'');
  const doDia=d=>S.atend.filter(a=>a.data===d&&a.status!=='cancelado'&&vis(a));
  const hj=doDia(h), amn=doDia(am);
  let t='*Atendimentos às Famílias'+(sv?' · '+sv:'')+'*\n\n*Hoje ('+dataCurta(h)+')*\n'+(hj.length?hj.map(linha).join('\n'):'Nenhum atendimento.');
  t+='\n\n*Amanhã ('+dataCurta(am)+')*\n'+(amn.length?amn.map(linha).join('\n'):'Nenhum atendimento.');
  const c=al.confirmar.filter(vis).length, r=al.semRegistro.filter(vis).length;
  if(c||r)t+='\n\n*Atenção:* '+[c?c+' aguardando confirmação':'',r?r+' sem registro':''].filter(Boolean).join(' · ');
  t+='\n\n*Calendário'+(sv?' · '+sv:'')+':* '+baseSite()+(sv?SLUG[sv]:'calendario');
  return t;
}

const SLUG={'Educação Infantil':'ei',EFAI:'efai',EFAF:'efaf','Ensino Médio':'em'};
function baseSite(){return location.origin+location.pathname.replace(/[^/]*$/,'')}
function linksHTML(){
  if(!S.linksAbertos)return '';
  const itens=meusSegs().map(s=>[s,baseSite()+SLUG[s]]);
  if(veTudo())itens.unshift(['Todos os segmentos',baseSite()+'calendario']);
  return '<section class="panel links-box"><h2>Links do calendário (só leitura)</h2>'+
    '<p class="note" style="margin:-6px 0 12px">Quem tiver o link vê os atendimentos do segmento, com o nome da criança, mas não consegue alterar nada. Compartilhe só com quem precisa.</p>'+
    '<div class="links">'+itens.map(([n,u])=>'<div class="link-row"><b>'+esc(n)+'</b><input readonly value="'+esc(u)+'" aria-label="Link '+esc(n)+'" onclick="this.select()"><button class="btn small primary" data-act="copiar-url" data-url="'+esc(u)+'">Copiar</button><a class="btn small" href="'+esc(u)+'" target="_blank" rel="noopener">Abrir</a><a class="btn small wa" target="_blank" rel="noopener" href="'+esc('https://wa.me/?text='+encodeURIComponent('*Calendário de atendimentos · '+n+'*\nConsulte aqui os atendimentos (só leitura): '+u))+'">WhatsApp</a></div>').join('')+'</div></section>';
}
function waResumoHTML(){
  const segs=meusSegs();
  const link=s=>'https://wa.me/?text='+encodeURIComponent(resumoTexto(s));
  const bts=(segs.length>1?segs.map(s=>[segCurto(s),s]):[['Enviar',segs[0]||'']]);
  return '<div class="wa-bar"><span class="wa-lbl">Resumo do dia para o grupo do WhatsApp</span>'+
    bts.map(([r,s])=>'<a class="btn small wa" target="_blank" rel="noopener" href="'+esc(link(s))+'" title="'+esc(s||'Todos')+'">'+esc(r)+'</a>').join('')+
    '<span class="note">Abre o WhatsApp com o texto pronto: escolha o grupo do segmento e envie.</span></div>';
}
function stat(lbl,n,go,hl){return '<button class="stat'+(hl?' hl':'')+'" data-go="'+go+'"><span class="label">'+lbl+'</span><b>'+n+'</b></button>'}
function grupo(t,cor,arr,why){if(!arr.length)return'';return '<div class="alert-group"><h3><span class="dot" style="background:'+cor+'"></span>'+esc(t)+' <span class="muted">('+arr.length+')</span></h3><div class="list">'+arr.map(a=>card(a,why)).join('')+'</div></div>'}

function filtrosHTML(){
  const f=S.filtro;
  const turmas=[...new Set([...TURMAS,...S.atend.map(a=>a.turma).filter(Boolean)])];
  return '<section class="panel"><div class="grid">'+
   '<label class="field"><span>Período</span><select id="fl-periodo">'+[['proximos','Próximos'],['hoje','Hoje'],['semana','Próximos 7 dias'],['passados','Já realizados / passados'],['confirmar','Aguardando confirmação'],['todos','Todos']].map(o=>'<option value="'+o[0]+'"'+(f.periodo===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Status</span><select id="fl-status"><option value="">Todos</option>'+STATUS.map(s=>'<option value="'+s[0]+'"'+(f.status===s[0]?' selected':'')+'>'+s[1]+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Segmento</span><select id="fl-seg"><option value="">Todos</option>'+meusSegs().map(s=>'<option'+(f.seg===s?' selected':'')+'>'+s+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Turma</span><select id="fl-turma"><option value="">Todas</option>'+turmas.map(t=>'<option'+(f.turma===t?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Profissional</span><select id="fl-prof"><option value="">Toda a equipe</option><option value="__me"'+(f.prof==='__me'?' selected':'')+'>Só os meus</option>'+S.usuarios.map(u=>'<option value="'+esc(u.id)+'"'+(f.prof===u.id?' selected':'')+'>'+esc(u.nome)+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>De</span><input id="fl-de" type="date" value="'+esc(f.de||'')+'"></label>'+
   '<label class="field"><span>Até</span><input id="fl-ate" type="date" value="'+esc(f.ate||'')+'"></label>'+
   '<label class="field span-all"><span>Buscar criança ou responsável</span><input id="fl-q" type="search" value="'+esc(f.q)+'" placeholder="Digite um nome"></label>'+
  '</div><div class="row" style="margin-top:12px"><button class="btn primary" data-act="relatorio">Relatório em PDF</button><span class="note">Gera o relatório com os atendimentos filtrados acima, com as logos do Antares.</span></div></section>'
}
function filtrarAgenda(){
  const f=S.filtro, h=hoje(), now=new Date();
  let arr=S.atend.slice();
  if(f.periodo==='proximos')arr=arr.filter(a=>a.data>=h);
  if(f.periodo==='hoje')arr=arr.filter(a=>a.data===h);
  if(f.periodo==='semana')arr=arr.filter(a=>a.data>=h&&a.data<=addDias(h,7));
  if(f.periodo==='passados')arr=arr.filter(a=>quando(a)<now).reverse();
  if(f.periodo==='confirmar')arr=arr.filter(a=>a.status==='agendado'&&quando(a)>now);
  if(f.de)arr=arr.filter(a=>a.data>=f.de);
  if(f.ate)arr=arr.filter(a=>a.data<=f.ate);
  if(f.status)arr=arr.filter(a=>a.status===f.status);
  if(f.seg)arr=arr.filter(a=>seg(a)===f.seg);
  if(f.turma)arr=arr.filter(a=>a.turma===f.turma);
  if(f.prof)arr=arr.filter(a=>a.profissional===(f.prof==='__me'?S.me.id:f.prof));
  if(f.q){const q=f.q.toLowerCase();arr=arr.filter(a=>(a.crianca+' '+a.responsavel).toLowerCase().includes(q))}
  return arr;
}
function agendaHTML(){
  if(!S.okA)return '<p class="muted">Carregando…</p>';
  const arr=filtrarAgenda();
  if(!arr.length)return '<div class="empty"><b>'+(S.atend.length?'Nenhum atendimento com esses filtros.':'Nenhum atendimento cadastrado ainda.')+'</b><span>Os atendimentos agendados aparecem aqui, agrupados por dia.</span><button class="btn primary" data-act="novo">Agendar atendimento</button></div>';
  let out='', dia='';
  arr.forEach(a=>{if(a.data!==dia){dia=a.data;out+=(out?'</div>':'')+'<h3 class="day-head">'+esc(relDia(dia)||dataCurta(dia))+'<small>'+esc(dataLonga(dia))+'</small></h3><div class="list">'}out+=card(a)});
  return '<div>'+out+'</div></div>';
}
function formHTML(){
  const a=S.editId?S.atend.find(x=>x.id===S.editId):null;
  const v=a||Object.assign({status:'agendado',duracao:30,modalidade:'Presencial',profissional:S.me.id,data:S.novaData||addDias(hoje(),1),hora:'08:00'},S.prefill||{});
  const listaAl=S.alunosCache[anoAtual()]||[];if(!a)garantirAlunos(anoAtual());
  const opt=(arr,sel)=>arr.map(o=>'<option'+(o===sel?' selected':'')+'>'+esc(o)+'</option>').join('');
  const ativos=S.usuarios.filter(u=>u.ativo!==false||u.id===v.profissional);
  S.delArm=false;
  return '<form id="f-atend" class="panel"><h2>'+(a?'Editar atendimento':'Novo atendimento')+'</h2><div class="grid">'+
   '<div class="span-all label">Criança e família</div>'+
   '<label class="field"><span>Nome da criança *</span><input id="at-crianca" required list="dl-alunos" autocomplete="off" value="'+esc(v.crianca)+'" placeholder="Digite o nome para buscar nos alunos matriculados"><datalist id="dl-alunos">'+listaAl.filter(x=>x.situacao!=='Cancelado').map(x=>'<option value="'+esc(x.nome)+'">'+esc(x.turma)+'</option>').join('')+'</datalist></label>'+
   '<label class="field"><span>Segmento *</span><select id="at-seg">'+meusSegs().map(s=>'<option'+(s===(v.segmento||(v.turma?seg(v):(S.segView||meusSegs()[0])))?' selected':'')+'>'+s+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Série *</span><input id="at-serie" list="dl-turmas" required value="'+esc(v.serie||partesTurma(v.turma).serie)+'" placeholder="Ex.: Infantil 3, 2º ano, 1ª série"><datalist id="dl-turmas">'+TURMAS.map(t=>'<option value="'+t+'">').join('')+'</datalist></label>'+
   '<label class="field"><span>Turma</span><select id="at-letra"><option value="">Única / não se aplica</option>'+LETRAS.map(l=>'<option'+((v.letra||partesTurma(v.turma).letra)===l?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Responsável *</span><input id="at-resp" required value="'+esc(v.responsavel)+'"></label>'+
   '<label class="field"><span>Parentesco</span><input id="at-par" list="dl-par" value="'+esc(v.parentesco)+'"><datalist id="dl-par"><option value="Mãe"><option value="Pai"><option value="Avó"><option value="Avô"><option value="Responsável legal"></datalist></label>'+
   '<label class="field"><span>WhatsApp da família (opcional)</span><input id="at-tel" inputmode="tel" placeholder="(85) 9 9999-9999" value="'+esc(v.telefone)+'"></label>'+
   '<label class="field"><span>E-mail da família</span><input id="at-email" type="email" value="'+esc(v.email)+'"></label>'+
   '<label class="field"><span>Segundo responsável (opcional)</span><input id="at-resp2" value="'+esc(v.responsavel2)+'" placeholder="Ex.: o pai ou a mãe"></label>'+
   '<label class="field"><span>Parentesco do 2º responsável</span><input id="at-par2" list="dl-par" value="'+esc(v.parentesco2)+'"></label>'+
   '<label class="field"><span>WhatsApp do 2º responsável (opcional)</span><input id="at-tel2" inputmode="tel" placeholder="(85) 9 9999-9999" value="'+esc(v.telefone2)+'"></label>'+
   '<div class="span-all label" style="margin-top:6px">Agendamento</div>'+
   '<label class="field"><span>Data *</span><input id="at-data" type="date" required value="'+esc(v.data)+'"></label>'+
   '<label class="field"><span>Horário *</span><input id="at-hora" type="time" required value="'+esc(v.hora)+'"></label>'+
   '<label class="field"><span>Duração (min)</span><input id="at-dur" type="number" min="10" step="5" value="'+esc(v.duracao||30)+'"></label>'+
   '<label class="field"><span>Modalidade</span><select id="at-mod">'+opt(MODALIDADES,v.modalidade)+'</select></label>'+
   '<label class="field"><span>Motivo *</span><select id="at-motivo">'+opt(MOTIVOS,v.motivo)+'</select></label>'+
   '<label class="field"><span>Quem atende</span><select id="at-prof">'+ativos.map(u=>'<option value="'+esc(u.id)+'"'+(u.id===v.profissional?' selected':'')+'>'+esc(u.nome)+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Quem pediu o atendimento</span><select id="at-pedido">'+opt(SOLICITANTES,v.solicitante||'Família')+'</select></label>'+
   '<div class="field span-all"><span>Quem vai participar pela escola</span><div class="chips">'+PAPEIS.map(p=>'<label class="chip"><input type="checkbox" name="at-part" value="'+esc(p)+'"'+((v.participantes||[]).includes(p)?' checked':'')+'> '+esc(p)+'</label>').join('')+'</div></div>'+
   '<label class="field span-all"><span>Nomes de quem participa (opcional)</span><input id="at-outros" value="'+esc(v.outros)+'" placeholder="Ex.: Prof.ª Ana (Infantil III), Psicóloga Carla"></label>'+
   '<label class="field"><span>Status</span><select id="at-status">'+STATUS.map(s=>'<option value="'+s[0]+'"'+(s[0]===v.status?' selected':'')+'>'+s[1]+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Data de retorno (opcional)</span><input id="at-ret" type="date" value="'+esc(v.retorno)+'"></label>'+
   '<label class="field span-all"><span>Pauta / o que será conversado</span><textarea id="at-pauta">'+esc(v.pauta)+'</textarea></label>'+
   '<div class="span-all label" style="margin-top:6px">Depois do atendimento</div>'+
   '<label class="field span-all"><span>Registro interno (só a equipe vê)</span><textarea id="at-reg" placeholder="O que foi conversado, observações da equipe">'+esc(v.registro)+'</textarea></label>'+
   '<label class="field span-all"><span>Resumo para a família (vai no registro entregue aos pais)</span><textarea id="at-rfam" placeholder="Escreva em linguagem simples o que foi conversado com a família">'+esc(v.resumoFamilia)+'</textarea></label>'+
   '<label class="field span-all"><span>Combinados e próximos passos (também vai para a família)</span><textarea id="at-enc">'+esc(v.encaminhamentos)+'</textarea></label>'+
  '</div><div id="at-msg" style="margin-top:12px"></div><div class="row" style="margin-top:14px">'+
   '<button class="btn primary" type="submit">'+(a?'Salvar alterações':'Agendar atendimento')+'</button>'+
   '<button class="btn" type="button" data-act="cancelar-form">Cancelar</button>'+
   (a?'<button class="btn danger" type="button" data-act="excluir" style="margin-left:auto">Excluir</button>':'')+
  '</div></form>'
}
function contaHTML(){
  const u=S.me;
  return '<section class="panel"><h2>Minha conta</h2><form id="f-conta" class="grid">'+
   '<label class="field"><span>Nome</span><input id="ct-nome" required value="'+esc(u.nome)+'"></label>'+
   '<label class="field"><span>Cargo ou função</span><input id="ct-cargo" value="'+esc(u.cargo)+'"></label>'+
   '<label class="field"><span>WhatsApp (recebe avisos da equipe)</span><input id="ct-wa" inputmode="tel" value="'+esc(u.whatsapp)+'"></label>'+
   '<div class="span-all label" style="margin-top:6px">Resumo diário dos atendimentos</div>'+
   '<label class="chip span-all" style="justify-self:start"><input type="checkbox" id="ct-rmail"'+(u.resumoEmail===false?'':' checked')+'> Receber o resumo por e-mail todo dia</label>'+
   '<label class="chip span-all" style="justify-self:start"><input type="checkbox" id="ct-rwa"'+(u.resumoWhats===false?'':' checked')+'> Receber o resumo no WhatsApp (precisa da chave abaixo)</label>'+
   '<label class="field span-all"><span>Chave do WhatsApp (CallMeBot)</span><input id="ct-key" autocomplete="off" value="'+esc(u.callmebotKey)+'" placeholder="Ex.: 1234567"></label>'+
   '<p class="note span-all" style="margin:0">A chave é gratuita e pessoal: veja como obter em callmebot.com (WhatsApp → Free API). Sem a chave, o resumo chega só por e-mail.</p>'+
   '<div class="span-all row"><button class="btn primary" type="submit">Salvar</button>'+
   '<button class="btn" type="button" data-act="minha-senha">Trocar minha senha</button>'+
   '<span class="note">Login: <b>'+esc(u.email)+'</b></span></div>'+
  '</form></section>'+
  '<section class="panel"><h2>Minha assinatura</h2><p class="note" style="margin:-6px 0 12px">Fica salva na sua conta e pode ser usada nos PDFs dos atendimentos e relatórios.</p>'+
   '<div class="row">'+(imgOk(u.assinaturaImg)?'<img class="sig-grande" src="'+u.assinaturaImg+'" alt="Minha assinatura">':'<span class="note">Nenhuma assinatura salva.</span>')+'</div>'+
   '<div class="row" style="margin-top:10px"><button class="btn" type="button" data-act="minha-ass-pad">Desenhar assinatura</button><label class="btn">Enviar imagem<input type="file" id="minha-ass-arq" accept="image/*" hidden></label>'+(imgOk(u.assinaturaImg)?'<button class="btn danger" type="button" data-act="minha-ass-del">Remover</button>':'')+'</div></section>'
}
function assinaturasHTML(){
  return '<section class="panel"><h2>Assinaturas das mensagens</h2><p class="note" style="margin:0 0 12px">Aparecem no fim das mensagens enviadas às famílias, de acordo com o segmento do atendimento.</p><form id="f-config" class="grid">'+
   ASS_KEYS().map((s,i)=>'<label class="field span-all"><span>'+s+(s==='Coordenação Bilíngue'?' (usada quando quem atende é da Coordenação Bilíngue)':'')+'</span><input id="cf-ass-'+i+'" value="'+esc(assinatura({chave:s}))+'"></label>').join('')+
   '<div class="span-all row"><button class="btn primary" type="submit">Salvar assinaturas</button></div>'+
  '</form></section>';
}
/* ---------- usuários ---------- */
function segsDe(u){return u.papel==='admin'||!Array.isArray(u.segmentos)?SEGMENTOS.slice():SEGMENTOS.filter(s=>u.segmentos.includes(s))}
function podeEditarUsuario(u){
  if(isPrincipal())return true;
  if(isAdmin())return (u.papel||'equipe')!=='admin'||u.id===S.me.id;
  if(!isCoord()||u.id===S.me.id)return false;
  const segs=Array.isArray(u.segmentos)?u.segmentos:[];
  return NIVEL[papelDe(u)]<NIVEL[S.me.papel]&&segs.length>0&&segs.every(s=>meusSegs().includes(s));
}
function usuariosVisiveis(){
  const q=(S.uq||'').toLowerCase(), pf=S.uperfil||'';
  return S.usuarios.filter(u=>isAdmin()||(u.papel!=='admin'&&segsDe(u).some(s=>meusSegs().includes(s))))
    .filter(u=>!pf||(pf==='inativo'?u.ativo===false:(u.papel||'equipe')===pf&&u.ativo!==false))
    .filter(u=>!q||[u.nome,u.email,u.cargo].join(' ').toLowerCase().includes(q))
    .sort((a,b)=>(a.ativo===false)-(b.ativo===false)||String(a.nome).localeCompare(String(b.nome)));
}
function iniciais(n){const p=String(n||'?').trim().split(/\s+/);return (p[0][0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase()}
function usuariosHTML(){
  return '<section class="panel"><div class="u-head"><h2>Usuários</h2>'+
     '<button class="btn primary" data-act="novo-usuario">Novo usuário</button></div>'+
   '<p class="note" style="margin:-4px 0 14px">'+(isPrincipal()?'Você é o administrador principal: pode criar e alterar todos os perfis, inclusive outros administradores.':isAdmin()?'Você pode criar e alterar direções, coordenações, equipe e consulta. Administradores só podem ser alterados pelo administrador principal.':'Como '+PAPEL_LBL[S.me.papel].toLowerCase()+', você pode criar e alterar '+(S.me.papel==='direcao'?'coordenações, equipe e consulta':'equipe e consulta')+' dos seus segmentos: '+esc(meusSegs().join(', '))+'.')+'</p>'+
   '<div id="u-form">'+usuarioFormHTML()+'</div>'+
   '<div class="grid u-filtros"><label class="field"><span>Buscar</span><input id="u-q" type="search" placeholder="Nome, e-mail ou cargo" value="'+esc(S.uq||'')+'"></label>'+
   '<label class="field"><span>Perfil</span><select id="u-perfil"><option value="">Todos</option>'+[['admin','Administradores'],['coord','Coordenações'],['equipe','Equipe'],['inativo','Inativos']].map(o=>'<option value="'+o[0]+'"'+(S.uperfil===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label></div>'+
   '<div id="live-equipe"></div></section>';
}
function listaEquipe(){
  const lista=usuariosVisiveis(), h=hoje();
  if(!lista.length)return '<div class="empty"><b>Ninguém encontrado.</b><span>Mude a busca ou cadastre um novo usuário.</span></div>';
  return '<div class="ulist">'+lista.map(u=>{
    const prox=S.atend.filter(a=>a.profissional===u.id&&a.data>=h&&a.status!=='cancelado').length;
    return '<div class="urow'+(u.ativo===false?' off':'')+'">'+
      '<span class="avatar p-'+esc(u.papel||'equipe')+'" aria-hidden="true">'+esc(iniciais(u.nome))+'</span>'+
      '<div class="who"><b>'+esc(u.nome)+(u.id===S.me.id?' <span class="note">(você)</span>':'')+'</b>'+
        '<span>'+esc([u.cargo,u.email,u.whatsapp].filter(Boolean).join(' · '))+'</span></div>'+
      '<div class="u-tags"><span class="tag ptag-'+esc(u.papel||'equipe')+'">'+(u.ativo===false?'Inativo':(u.id===S.principal?'Admin principal':PAPEL_LBL[u.papel||'equipe']))+'</span>'+
        (u.papel==='admin'?'<span class="note">Todos os segmentos</span>':segsDe(u).map(s=>'<span class="segtag s-'+segCurto(s)+'">'+segCurto(s)+'</span>').join(''))+
        (prox?'<span class="note">'+prox+' próximo(s)</span>':'')+'</div>'+
      (podeEditarUsuario(u)?'<button class="btn small" data-act="editar-usuario" data-id="'+esc(u.id)+'">Editar</button>':'<span class="note u-ro">Só leitura</span>')+
    '</div>'}).join('')+'</div>';
}
function usuarioFormHTML(){
  if(!S.userForm)return '';
  const novo=S.userForm==='novo', u=novo?{papel:'equipe',segmentos:meusSegs().length===1?meusSegs():[],ativo:true}:uById(S.userForm);
  if(!u)return '';
  const eu=!novo&&u.id===S.me.id;
  const todos=['leitura','equipe','soep','defe','coord','bilingue','direcao','admin'];
  const papeis=isPrincipal()?todos:isAdmin()?todos.filter(p=>p!=='admin'):todos.filter(p=>NIVEL[p]<NIVEL[S.me.papel]&&(p!=='defe'||meusSegs().length===SEGMENTOS.length));
  const segsOpc=isAdmin()?SEGMENTOS:meusSegs();
  const marcados=Array.isArray(u.segmentos)?u.segmentos:(novo?[]:SEGMENTOS);
  return '<form id="f-usr" class="u-form"><h3>'+(novo?'Novo usuário':'Editar: '+esc(u.nome))+'</h3><div class="grid">'+
   '<label class="field"><span>Nome *</span><input id="uf-nome" required value="'+esc(u.nome)+'"></label>'+
   '<label class="field"><span>Cargo ou função</span><input id="uf-cargo" value="'+esc(u.cargo)+'" placeholder="Ex.: Coordenadora do EFAI, Psicóloga"></label>'+
   (novo?'<label class="field"><span>E-mail (login) *</span><input id="uf-email" type="email" required autocomplete="off"></label>'+
         '<label class="field"><span>Senha inicial *</span><input id="uf-senha" type="password" minlength="6" required autocomplete="new-password"></label>'
        :'<div class="field"><span>E-mail (login)</span><p style="margin:8px 0 0"><b>'+esc(u.email)+'</b></p></div>')+
   '<label class="field"><span>WhatsApp</span><input id="uf-wa" inputmode="tel" value="'+esc(u.whatsapp)+'" placeholder="(85) 9 9999-9999"></label>'+
   '<label class="field"><span>Perfil</span><select id="uf-papel"'+(eu||papeis.length===1?' disabled':'')+'>'+
     papeis.concat(papeis.includes(u.papel||'equipe')?[]:[u.papel]).map(p=>'<option value="'+p+'"'+((u.papel||'equipe')===p?' selected':'')+'>'+PAPEL_LBL[p]+'</option>').join('')+'</select></label>'+
   '<div class="field span-all" id="uf-segs-box"><span>Segmentos *</span><div class="chips">'+segsOpc.map(s=>'<label class="chip"><input type="checkbox" name="uf-seg" value="'+s+'"'+(marcados.includes(s)?' checked':'')+'> '+s+'</label>').join('')+'</div>'+
     '<span class="note" style="font-weight:600">Cada perfil vê só os segmentos marcados. SOEP é por segmento; DEFE atende todos os segmentos. Consulta só visualiza. Administrador vê todos.</span></div>'+
   (eu?'':'<label class="chip span-all" style="justify-self:start"><input type="checkbox" id="uf-ativo"'+(u.ativo===false?'':' checked')+'> Acesso ativo</label>')+
  '</div><div class="row" style="margin-top:14px">'+
   '<button class="btn primary" type="submit">'+(novo?'Criar usuário':'Salvar alterações')+'</button>'+
   (novo?'':'<button class="btn" type="button" data-act="reset" data-id="'+esc(u.id)+'">Enviar redefinição de senha</button>')+
   '<button class="btn" type="button" data-act="cancelar-usuario">Cancelar</button></div>'+
   (novo?'':'<p class="note" style="margin:10px 0 0">O e-mail de login não pode ser trocado. Se precisar, crie um novo usuário e desative este.</p>')+
  '</form>';
}


/* ---------- quem atende, ficha e calendário compartilhado ---------- */
function quemAtende(a,semPrincipal){
  const p=uById(a.profissional);
  const lista=[];
  if(!semPrincipal&&p)lista.push(p.nome);
  (a.participantes||[]).forEach(x=>lista.push(x));
  if(a.outros)lista.push(a.outros);
  return lista.join(', ');
}
function linkPublico(){const s=S.segView||(meusSegs().length===1?meusSegs()[0]:'');return location.origin+location.pathname.replace(/[^/]*$/,'')+'calendario.html'+(s?'?seg='+({'Educação Infantil':'EI',EFAI:'EFAI',EFAF:'EFAF','Ensino Médio':'EM'}[s]):'')}
function linha(v){return v?esc(v):'<span class="ficha-line"></span>'}
function blocoDoc(t,v){return '<h3>'+t+'</h3><div class="ficha-box">'+(v?esc(v).replace(/\n/g,'<br>'):'<span class="ficha-line"></span><span class="ficha-line"></span><span class="ficha-line"></span>')+'</div>'}
function topoDoc(a,titulo){return '<div class="ficha-top"><img src="'+LOGO_E+'" alt="Antares Full Time Eusébio" class="logo-eus"><img src="'+LOGO_A+'" alt="Colégio Antares" class="logo-ant"><div><h2>'+titulo+'</h2><p>'+esc(seg(a))+' · Colégio Antares</p></div></div>'}
function quemFamilia(a){
  const p=uById(a.profissional);const l=[];
  if(p)l.push(p.nome+(p.cargo?' ('+p.cargo+')':''));
  (a.participantes||[]).forEach(x=>l.push(x));if(a.outros)l.push(a.outros);
  return l.join(', ');
}
function fichaInterna(a){
  const p=uById(a.profissional);
  const rows=[
    ['Criança',a.crianca],['Turma',a.turma],['Responsável',a.responsavel+(a.parentesco?' ('+a.parentesco+')':'')+(a.responsavel2?' · '+a.responsavel2+(a.parentesco2?' ('+a.parentesco2+')':''):'')],['Contato',[a.telefone,a.telefone2,a.email].filter(Boolean).join(' · ')],
    ['Data e horário',dataLonga(a.data)+', '+a.hora+' ('+(Number(a.duracao)||30)+' min)'],['Modalidade',a.modalidade],['Motivo',a.motivo],
    ['Pedido por',a.solicitante],['Responsável pelo atendimento',p?p.nome:''],['Participam pela escola',quemAtende(a,true)],['Status',STATUS_LBL[a.status]]
  ];
  return topoDoc(a,'Relatório de Atendimento (uso interno)')+
    '<table class="ficha-tab">'+rows.map(r=>'<tr><th>'+r[0]+'</th><td>'+linha(r[1])+'</td></tr>').join('')+'</table>'+
    blocoDoc('Pauta',a.pauta)+blocoDoc('Registro interno',a.registro)+blocoDoc('Resumo para a família',a.resumoFamilia)+blocoDoc('Combinados e próximos passos',a.encaminhamentos)+
    '<p class="ficha-ret"><b>Data de retorno:</b> '+(a.retorno?esc(dataLonga(a.retorno)):'____/____/________')+'</p>'+
    assinaturasDoc(a);
}
function registroFamilia(a){
  const p=uById(a.profissional);
  const rows=[['Estudante',a.crianca+' · '+a.turma],['Responsável',a.responsavel+(a.parentesco?' ('+a.parentesco+')':'')],
    ['Data',dataLonga(a.data)+', '+a.hora+' · '+a.modalidade],['Participaram pela escola',quemFamilia(a)],['Assunto',a.motivo]];
  return topoDoc(a,'Registro de Atendimento à Família')+
    '<table class="ficha-tab">'+rows.map(r=>'<tr><th>'+r[0]+'</th><td>'+linha(r[1])+'</td></tr>').join('')+'</table>'+
    blocoDoc('O que conversamos',a.resumoFamilia)+blocoDoc('Combinados e próximos passos',a.encaminhamentos)+
    '<p class="ficha-ret"><b>Próximo encontro:</b> '+(a.retorno?esc(dataLonga(a.retorno)):'a combinar')+'</p>'+
    '<p class="ficha-nota">Este registro resume o atendimento realizado com a família. Em caso de dúvida, procure a coordenação do segmento.</p>'+
    assinaturasDoc(a);
}
function textoEquipe(a){
  const L=[['Criança',a.crianca+' ('+a.turma+')'],['Data',dataLonga(a.data)+', '+a.hora+' · '+a.modalidade],['Família',a.responsavel+(a.parentesco?' ('+a.parentesco+')':'')],
    ['Pedido por',a.solicitante],['Participaram',quemAtende(a,false)],['Motivo',a.motivo],['Status',STATUS_LBL[a.status]],
    ['Principais pontos',a.registro],['Combinados',a.encaminhamentos],['Retorno',a.retorno?dataLonga(a.retorno):'']];
  return '*Resumo de atendimento · '+segCurto(seg(a))+'*\n'+L.filter(x=>x[1]).map(x=>'*'+x[0]+':* '+x[1]).join('\n');
}
function textoFamilia(a){
  return 'Olá, '+primeiroNome(a.responsavel)+'! Tudo bem?\n\nSegue o registro do nosso atendimento sobre '+a.crianca+' ('+a.turma+'), realizado '+dataLonga(a.data)+'.\n\n'+
    '*Assunto:* '+a.motivo+'\n'+
    (a.resumoFamilia?'*O que conversamos:* '+a.resumoFamilia+'\n':'')+
    (a.encaminhamentos?'*Combinados:* '+a.encaminhamentos+'\n':'')+
    '*Próximo encontro:* '+(a.retorno?dataLonga(a.retorno):'a combinar')+'\n\n'+
    'Qualquer dúvida, estamos à disposição.\n\n'+assinatura(a);
}
function docsHTML(a,aba){
  const p=uById(a.profissional);
  const abas=[['familia','Registro para a família'],['equipe','Resumo para a equipe'],['ficha','Relatório do atendimento']];
  let corpo='', acoes='';
  if(aba==='familia'){
    corpo=sigPainel(a)+(a.resumoFamilia?'':'<p class="msg info noprint">O campo <b>Resumo para a família</b> está vazio. Toque em <b>Editar</b> no atendimento para preencher, ou imprima e escreva à mão.</p>')+registroFamilia(a);
    const tf=textoFamilia(a), wa=waLink(a.telefone,tf), em=a.email?gmailLink(a.email,'Registro de atendimento · '+a.crianca,tf):'';
    acoes='<button class="btn primary" data-act="imprimir">Imprimir / salvar PDF</button>'+
      (wa?'<a class="btn wa" target="_blank" rel="noopener" href="'+esc(wa)+'">Enviar no WhatsApp da família</a>':'')+
      (em?'<a class="btn" target="_blank" rel="noopener" href="'+esc(em)+'">Enviar por e-mail</a>':'')+
      '<button class="btn" data-act="copiar-doc" data-txt="familia" data-id="'+esc(a.id)+'">Copiar texto</button>';
  }else if(aba==='equipe'){
    const te=textoEquipe(a), em=p&&p.email?gmailLink(p.email,'Resumo de atendimento · '+a.crianca,te.replace(/\*/g,'')):'';
    corpo=topoDoc(a,'Resumo para a equipe')+'<div class="ficha-box resumo-txt">'+esc(te).replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/\n/g,'<br>')+'</div>'+
      '<p class="note noprint" style="margin-top:8px">Uso interno. Não envie este resumo para a família.</p>';
    acoes='<button class="btn primary" data-act="copiar-doc" data-txt="equipe" data-id="'+esc(a.id)+'">Copiar</button>'+
      '<a class="btn wa" target="_blank" rel="noopener" href="'+esc('https://wa.me/?text='+encodeURIComponent(te))+'">Enviar no WhatsApp da equipe</a>'+
      (em?'<a class="btn" target="_blank" rel="noopener" href="'+esc(em)+'">Enviar por e-mail</a>':'')+
      '<button class="btn" data-act="imprimir">Imprimir</button>';
  }else{
    corpo=sigPainel(a)+fichaInterna(a);
    acoes='<button class="btn primary" data-act="imprimir">Imprimir / salvar PDF</button>';
  }
  return '<div class="ficha-overlay" role="dialog" aria-label="Documentos do atendimento" data-id="'+esc(a.id)+'"><div class="ficha">'+
    '<div class="doc-tabs noprint" role="tablist">'+abas.map(t=>'<button class="tab" role="tab" data-doc="'+t[0]+'" aria-selected="'+(t[0]===aba)+'">'+t[1]+'</button>').join('')+
      '<button class="btn small" data-act="fechar-ficha" style="margin-left:auto">Fechar</button></div>'+
    corpo+
    '<div class="row noprint" style="margin-top:18px">'+acoes+'</div>'+
  '</div></div>';
}
function abrirDocs(id,aba){
  const a=S.atend.find(x=>x.id===id);if(!a)return;
  if(!S.sig||S.sig.id!==id)S.sig={id,lista:sigInicial(a),aberto:false,mudou:false};
  S.docAba=aba;
  document.querySelectorAll('.ficha-overlay').forEach(x=>x.remove());
  document.body.insertAdjacentHTML('beforeend',docsHTML(a,aba));document.body.classList.add('ficha-aberta');
}
let syncT=null;
function agendarSync(){clearTimeout(syncT);syncT=setTimeout(syncPublico,1500)}
function pubData(a){
  return {crianca:a.crianca||'',turma:a.turma||'',data:a.data||'',hora:a.hora||'',quando:a.quando||'',duracao:Number(a.duracao)||30,modalidade:a.modalidade||'',status:a.status||'agendado',atende:quemAtende(a,false),segmento:seg(a)};
}
async function syncPublico(){
  if(!S.okA||!S.okP||!S.usuarios.length||!S.me)return;
  const ids=new Set(), meus=meusSegs();
  for(const a of S.atend){
    ids.add(a.id);
    if(!a.segmento&&isAdmin()){try{await updateDoc(doc(db,'atendimentos',a.id),{segmento:seg(a)})}catch(e){}}
    const w=pubData(a), h=S.pub[a.id];
    if(!h||Object.keys(w).some(k=>w[k]!==h[k])){try{await setDoc(doc(db,'publico',a.id),w)}catch(e){return}}
  }
  for(const id of Object.keys(S.pub)){if(!ids.has(id)&&meus.includes(seg(S.pub[id]))){try{await deleteDoc(doc(db,'publico',id))}catch(e){return}}}
}


/* ---------- anos letivos e alunos ---------- */
function partesTurma(t){const m=String(t||'').trim().match(/^(.*?)\s+([A-E])$/);return m?{serie:m[1],letra:m[2]}:{serie:String(t||'').trim(),letra:''}}
S.alunosCache={};S.alunosLoad={};S.anos=[];S.alMax=100;
function anoAtual(){return S.config.anoAtual||(S.anos.length?S.anos[S.anos.length-1]:String(new Date().getFullYear()))}
function anoSel(){return S.alAno||anoAtual()}
async function garantirAlunos(ano,forcar){
  if(!ano||(!forcar&&(S.alunosCache[ano]||S.alunosLoad[ano])))return;
  S.alunosLoad[ano]=true;
  try{
    let docs=[];
    if(veTudo()&&isAdmin()){docs=(await getDocs(query(collection(db,'alunos'),where('ano','==',ano)))).docs}
    else{for(const s of meusSegs()){docs=docs.concat((await getDocs(query(collection(db,'alunos'),where('ano','==',ano),where('segmento','==',s)))).docs)}}
    S.alunosCache[ano]=docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
  }catch(e){S.alunosCache[ano]=[];toast('Não foi possível carregar os alunos: '+erroMsg(e))}
  S.alunosLoad[ano]=false;
  refreshAlunos();
  const dl=$('#dl-alunos');if(dl&&ano===anoAtual())dl.innerHTML=S.alunosCache[ano].filter(x=>x.situacao!=='Cancelado').map(x=>'<option value="'+esc(x.nome)+'">'+esc(x.turma)+'</option>').join('');
}
function prefillDe(al){
  const pt=partesTurma(al.turma);
  const r1=al.respPedNome?{n:al.respPedNome,p:al.respPedParentesco,t:al.respPedTel,e:al.respPedEmail}:{n:al.respFinNome,p:al.respFinParentesco,t:al.respFinTel,e:al.respFinEmail};
  const r2=al.respPedNome&&al.respFinNome&&al.respFinNome!==al.respPedNome?{n:al.respFinNome,p:al.respFinParentesco,t:al.respFinTel}:{n:'',p:'',t:''};
  return {crianca:al.nome,turma:al.turma,serie:pt.serie,letra:pt.letra,segmento:al.segmento,responsavel:r1.n||'',parentesco:r1.p||'',telefone:r1.t||'',email:r1.e||'',responsavel2:r2.n||'',parentesco2:r2.p||'',telefone2:r2.t||''};
}
function preencherAluno(nome){
  const al=(S.alunosCache[anoAtual()]||[]).find(x=>x.nome===nome);if(!al)return;
  const p=prefillDe(al);const set=(id,v)=>{const el=document.getElementById(id);if(el&&v&&!el.value)el.value=v};
  const se=document.getElementById('at-serie');if(se)se.value=p.serie;const le=document.getElementById('at-letra');if(le)le.value=p.letra;
  const sg=document.getElementById('at-seg');if(sg&&[...sg.options].some(o=>o.value===p.segmento))sg.value=p.segmento;
  set('at-resp',p.responsavel);set('at-par',p.parentesco);set('at-tel',p.telefone);set('at-email',p.email);set('at-resp2',p.responsavel2);set('at-par2',p.parentesco2);set('at-tel2',p.telefone2);
  toast('Dados de '+primeiroNome(nome)+' preenchidos pela matrícula');
}
function alunosHTML(){
  const ano=anoSel(), anos=[...new Set(S.anos.concat([anoAtual()]))].sort();
  let h='<section class="panel"><div class="u-head"><h2>Alunos matriculados</h2>'+
    '<label class="field" style="min-width:140px"><span>Ano letivo</span><select id="al-ano">'+anos.map(a=>'<option'+(a===ano?' selected':'')+'>'+a+'</option>').join('')+'</select></label></div>'+
    (ano===anoAtual()?'<p class="note" style="margin:-4px 0 12px">Ano letivo atual. Ao agendar, o nome da criança busca os alunos deste ano.</p>':'<p class="note" style="margin:-4px 0 12px">Você está vendo '+ano+'. O ano letivo atual é '+anoAtual()+'.</p>')+
    '<div class="grid u-filtros"><label class="field"><span>Buscar</span><input id="al-q" type="search" placeholder="Aluno, turma ou responsável" value="'+esc(S.alQ||'')+'"></label>'+
    (meusSegs().length>1?'<label class="field"><span>Segmento</span><select id="al-seg"><option value="">Todos</option>'+meusSegs().map(s=>'<option'+(S.alSeg===s?' selected':'')+'>'+s+'</option>').join('')+'</select></label>':'')+
    '<label class="field"><span>Situação</span><select id="al-sit">'+[['','Matriculados'],['todos','Todos'],['Cancelado','Cancelados']].map(o=>'<option value="'+o[0]+'"'+((S.alSit||'')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label></div>'+
    '<div id="live-alunos"></div></section>';
  if(isAdmin())h+=importacaoHTML();
  return h;
}
function respLinhas(a){
  const l=[];if(a.respPedNome)l.push([a.respPedNome,a.respPedParentesco,a.respPedTel]);
  if(a.respFinNome&&a.respFinNome!==a.respPedNome)l.push([a.respFinNome,a.respFinParentesco,a.respFinTel]);
  return l.map(r=>'<span>'+esc(r[0])+(r[1]?' ('+esc(r[1])+')':'')+(r[2]?' · '+esc(r[2]):'')+'</span>').join('')||'<span>Sem responsável na planilha</span>';
}
function refreshAlunos(){const el=$('#live-alunos');if(el)el.innerHTML=listaAlunosHTML()}
function listaAlunosHTML(){
  const ano=anoSel(), todos=S.alunosCache[ano];
  if(!todos)return '<p class="muted">Carregando alunos de '+esc(ano)+'…</p>';
  if(!todos.length)return '<div class="empty"><b>Nenhum aluno em '+esc(ano)+'.</b><span>'+(isAdmin()?'Use a importação abaixo para enviar a planilha de matrículas.':'Peça ao administrador para importar a planilha de matrículas deste ano.')+'</span></div>';
  const q=(S.alQ||'').toLowerCase();
  const l=todos.filter(a=>!S.alSeg||a.segmento===S.alSeg)
    .filter(a=>S.alSit==='todos'?true:S.alSit==='Cancelado'?a.situacao==='Cancelado':a.situacao!=='Cancelado'&&a.situacao!=='Fora da última importação')
    .filter(a=>!q||[a.nome,a.turma,a.respPedNome,a.respFinNome].join(' ').toLowerCase().includes(q));
  const cont={};todos.filter(a=>a.situacao==='Matriculado').forEach(a=>{cont[a.segmento]=(cont[a.segmento]||0)+1});
  return '<div class="al-resumo">'+Object.keys(cont).sort((a,b)=>SEGMENTOS.indexOf(a)-SEGMENTOS.indexOf(b)).map(s=>'<span class="segtag s-'+segCurto(s)+'">'+segCurto(s)+' '+cont[s]+'</span>').join('')+'<span class="note">'+l.length+' na lista</span></div>'+
   '<div class="al-list">'+l.slice(0,S.alMax||100).map(a=>
    '<div class="al-row'+(a.situacao!=='Matriculado'?' off':'')+'"><div class="who"><b>'+esc(a.nome)+'</b><span>'+esc(a.turma)+' · '+esc(a.turno||'')+(a.matricula?' · Mat. '+esc(a.matricula):'')+(a.situacao!=='Matriculado'?' · '+esc(a.situacao):'')+'</span></div>'+
    '<div class="who al-resp">'+respLinhas(a)+'</div>'+
    '<button class="btn small primary" data-act="agendar-aluno" data-id="'+esc(a.id)+'">Agendar</button></div>').join('')+'</div>'+
   (l.length>(S.alMax||100)?'<div class="row" style="margin-top:10px"><button class="btn" data-act="mais-alunos">Mostrar mais ('+(l.length-(S.alMax||100))+')</button></div>':'');
}
function importacaoHTML(){
  const anos=[...new Set(S.anos.concat([anoAtual()]))].sort();
  return '<section class="panel"><div class="u-head"><h2>Anos letivos e importação</h2><button class="btn" data-act="abrir-import" aria-expanded="'+!!S.impAberto+'">'+(S.impAberto?'Fechar':'Importar planilha')+'</button></div>'+
   '<div class="grid"><div class="field"><span>Anos letivos</span><div class="chips">'+anos.map(a=>'<span class="chip'+(a===anoAtual()?' on':'')+'">'+a+(a===anoAtual()?' · atual':'')+'</span>').join('')+'</div></div>'+
   '<div class="field"><span>Criar novo ano letivo</span><div class="row"><input id="ano-novo" inputmode="numeric" maxlength="4" placeholder="Ex.: 2027" style="max-width:120px"><button class="btn" data-act="criar-ano">Criar</button>'+
   (anoSel()!==anoAtual()?'<button class="btn" data-act="ano-atual">Tornar '+esc(anoSel())+' o ano atual</button>':'')+'</div></div></div>'+
   (S.impAberto?'<div class="u-form" style="margin-top:14px"><h3>Importar alunos da planilha de matrículas</h3>'+
     '<div class="grid"><label class="field"><span>Importar para o ano letivo</span><select id="imp-ano">'+anos.map(a=>'<option'+(a===((S.imp&&S.imp.ano)||anoSel())?' selected':'')+'>'+a+'</option>').join('')+'</select></label>'+
     '<label class="field"><span>Planilha (.xlsx, .xls ou .csv)</span><input id="imp-arq" type="file" accept=".xlsx,.xls,.csv"></label></div>'+
     '<p class="note" style="margin:8px 0 0">A planilha é lida no seu computador. Só vão para o sistema: aluno, matrícula, série, turma, turno, situação e responsáveis (nome, parentesco, telefone e e-mail). CPF, saúde, cor/raça, endereço e autorizações <b>não</b> são enviados.</p>'+
     '<div id="imp-prev">'+previaHTML()+'</div></div>':'')+
  '</section>';
}
/* leitura da planilha */
function carregarXLSX(){return window.XLSX?Promise.resolve():new Promise((ok,erro)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=()=>erro(new Error('Não foi possível carregar o leitor de planilhas. Verifique a internet.'));document.head.appendChild(s)})}
const normH=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const REGULAR=/^(infantil\s*\d+|\d+\s*º?\s*ano|\d+\s*ª?\s*s[ée]rie)\b/i;
async function lerPlanilha(arq){
  const box=$('#imp-prev');if(!arq)return;
  if(box)box.innerHTML='<p class="muted">Lendo a planilha…</p>';
  try{
    await carregarXLSX();
    const wb=XLSX.read(await arq.arrayBuffer(),{type:'array',cellDates:false});
    const ws=wb.Sheets[wb.SheetNames.find(n=>/aluno/i.test(n))||wb.SheetNames[0]];
    const linhas=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    const hi=linhas.findIndex(r=>r.some(c=>normH(c)==='nome do aluno'));
    if(hi<0)throw new Error('Não encontrei a coluna "Nome do Aluno". Confira se é a planilha de alunos matriculados.');
    const H=linhas[hi].map(normH);
    const col=n=>{const k=normH(n);let i=H.indexOf(k);if(i<0)i=H.findIndex(x=>x.startsWith(k));return i};
    const C={ano:col('Ano Letivo'),unidade:col('Unidade'),serie:col('Série'),turno:col('Turno'),turma:col('Turma'),nome:col('Nome do Aluno'),matricula:col('Nº Matrícula'),situacao:col('Situação da Matrícula'),tipo:col('Tipo de Matrícula'),
      fNome:col('Nome do Responsável Financeiro'),fPar:col('Parentesco do Responsável Financeiro'),fTel:col('Telefone do Responsável Financeiro'),fEmail:col('E-mail do Responsável Financeiro'),
      pNome:col('Nome do Responsável Pedagógico'),pPar:col('Parentesco do Responsável Pedagógico'),pTel:col('Telefone do Responsável Pedagógico'),pEmail:col('E-mail do Responsável Pedagógico')};
    const g=(r,k)=>C[k]>=0?String(r[C[k]]==null?'':r[C[k]]).trim():'';
    const alunos=new Map(), ignorados={}; let anosPlan={};
    linhas.slice(hi+1).forEach(r=>{
      const nome=g(r,'nome');if(!nome)return;
      const serie=g(r,'serie')||g(r,'turma');
      if(!REGULAR.test(serie)){ignorados[serie]=(ignorados[serie]||0)+1;return}
      if(g(r,'ano'))anosPlan[g(r,'ano')]=1;
      const turma=(g(r,'turma')||serie).replace(/\s+-\s+[A-Z]$/,'').trim();
      const mat=g(r,'matricula').replace(/[^\w.-]/g,'');
      const key=mat||nome.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w]+/g,'-').toLowerCase();
      const novo={nome,matricula:mat,serie,turma,turno:g(r,'turno'),unidade:g(r,'unidade'),situacao:g(r,'situacao')||'Matriculado',tipo:g(r,'tipo'),segmento:seg({turma:serie}),
        respPedNome:g(r,'pNome'),respPedParentesco:g(r,'pPar'),respPedTel:g(r,'pTel'),respPedEmail:g(r,'pEmail'),
        respFinNome:g(r,'fNome'),respFinParentesco:g(r,'fPar'),respFinTel:g(r,'fTel'),respFinEmail:g(r,'fEmail'),key};
      const ant=alunos.get(key);
      if(!ant||(ant.situacao==='Cancelado'&&novo.situacao!=='Cancelado'))alunos.set(key,novo);
    });
    S.imp={arquivo:arq.name,ano:(S.imp&&S.imp.ano)||anoSel(),alunos:[...alunos.values()],ignorados,anosPlan:Object.keys(anosPlan)};
  }catch(e){S.imp=null;if(box)box.innerHTML='<p class="msg err">'+esc(e.message||'Não foi possível ler a planilha.')+'</p>';return}
  if(box)box.innerHTML=previaHTML();
  const ano=S.imp.ano;garantirAlunos(ano);
}
function previaHTML(){
  const I=S.imp;if(!I)return '';
  const ativos=I.alunos.filter(a=>a.situacao!=='Cancelado'), canc=I.alunos.length-ativos.length;
  const porSeg={};ativos.forEach(a=>{porSeg[a.segmento]=(porSeg[a.segmento]||0)+1});
  const exist=S.alunosCache[I.ano];
  const ids=new Set(I.alunos.map(a=>I.ano+'_'+a.key));
  const novos=exist?I.alunos.filter(a=>!exist.some(x=>x.id===I.ano+'_'+a.key)).length:null;
  const fora=exist?exist.filter(x=>!ids.has(x.id)&&x.situacao!=='Fora da última importação').length:0;
  const ign=Object.entries(I.ignorados).sort((a,b)=>b[1]-a[1]);
  const anoDif=I.anosPlan.length&&!I.anosPlan.includes(I.ano);
  return '<div class="imp-prev"><h3>Prévia · '+esc(I.arquivo)+'</h3>'+
   (anoDif?'<p class="msg info">A planilha é de <b>'+esc(I.anosPlan.join(', '))+'</b>. Os alunos serão importados em <b>'+esc(I.ano)+'</b>, como base do novo ano. Depois, envie a planilha de '+esc(I.ano)+' para atualizar turmas e situações.</p>':'')+
   '<div class="stats" style="margin:10px 0"><div class="stat"><span class="label">Alunos</span><b>'+I.alunos.length+'</b></div><div class="stat"><span class="label">Matriculados</span><b>'+ativos.length+'</b></div><div class="stat"><span class="label">Cancelados</span><b>'+canc+'</b></div><div class="stat"><span class="label">Novos em '+esc(I.ano)+'</span><b>'+(novos==null?'…':novos)+'</b></div></div>'+
   '<p style="margin:0 0 6px">'+SEGMENTOS.filter(s=>porSeg[s]).map(s=>'<span class="segtag s-'+segCurto(s)+'">'+s+': '+porSeg[s]+'</span>').join(' ')+'</p>'+
   (ign.length?'<details><summary class="note">Linhas ignoradas por não serem turmas regulares ('+ign.reduce((t,x)=>t+x[1],0)+')</summary><p class="note">'+ign.map(x=>esc(x[0])+' ('+x[1]+')').join(' · ')+'</p></details>':'')+
   (fora?'<label class="chip" style="margin-top:10px"><input type="checkbox" id="imp-fora"> Marcar '+fora+' aluno(s) de '+esc(I.ano)+' que não estão nesta planilha como "Fora da última importação"</label>':'')+
   '<div class="row" style="margin-top:12px"><button class="btn primary" data-act="importar">Importar '+I.alunos.length+' alunos em '+esc(I.ano)+'</button></div></div>';
}
async function importarAlunos(btn){
  const I=S.imp;if(!I||!I.alunos.length)return;
  btn.disabled=true;
  try{
    if(!S.anos.includes(I.ano)){await setDoc(doc(db,'anos',I.ano),{criadoEm:serverTimestamp(),criadoPor:S.me.id});S.anos=S.anos.concat(I.ano).sort()}
    const ops=I.alunos.map(a=>{const d=Object.assign({},a);delete d.key;return [I.ano+'_'+a.key,Object.assign(d,{ano:I.ano,atualizadoEm:new Date().toISOString(),importadoPor:S.me.id})]});
    const foraEl=document.getElementById('imp-fora');
    if(foraEl&&foraEl.checked&&S.alunosCache[I.ano]){const ids=new Set(ops.map(o=>o[0]));S.alunosCache[I.ano].filter(x=>!ids.has(x.id)).forEach(x=>ops.push([x.id,{situacao:'Fora da última importação'}]))}
    for(let i=0;i<ops.length;i+=400){
      const b=writeBatch(db);
      ops.slice(i,i+400).forEach(([id,d])=>b.set(doc(db,'alunos',id),d,{merge:true}));
      btn.textContent='Importando… '+Math.min(i+400,ops.length)+' de '+ops.length;
      await b.commit();
    }
    toast(I.alunos.length+' alunos importados em '+I.ano);
    S.alAno=I.ano;S.imp=null;S.impAberto=false;delete S.alunosCache[I.ano];renderView();
  }catch(err){btn.disabled=false;btn.textContent='Tentar de novo';toast(erroMsg(err))}
}


/* ---------- assinaturas do PDF ---------- */
const SIG_TIPOS=[['familia','Responsável pela criança'],['profissional','Profissional responsável'],['coord','Coordenação do segmento'],['bilingue','Coordenação Bilíngue'],['soep','SOEP'],['defe','DEFE'],['direcao','Direção']];
const imgOk=s=>typeof s==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
function pessoaPara(k,a){
  if(k==='profissional')return uById(a.profissional);
  return S.usuarios.find(u=>u.ativo!==false&&u.papel===k&&(k==='bilingue'||k==='defe'||segsDe(u).includes(seg(a))));
}
function sigInicial(a){
  if(Array.isArray(a.assinaturas)&&a.assinaturas.length)return a.assinaturas.map(x=>Object.assign({},x));
  return SIG_TIPOS.map(([k,r])=>{
    const u=k==='familia'?null:pessoaPara(k,a);
    const nome=k==='familia'?(a.responsavel||''):(u?u.nome:'');
    return {k,rotulo:k==='profissional'&&u&&u.cargo?u.cargo:r,nome,uid:u?u.id:'',modo:'nome',img:'',on:k==='familia'||k==='profissional'||(k==='coord'&&!!u&&u.id!==a.profissional)};
  });
}
function assinaturasDoc(a){
  const l=(S.sig&&S.sig.id===a.id?S.sig.lista:sigInicial(a)).filter(x=>x.on);
  if(!l.length)return '';
  return '<div class="ficha-ass n'+Math.min(l.length,3)+'">'+l.map(x=>
    '<div><span class="ass-area">'+(x.modo!=='nome'&&imgOk(x.img)?'<img class="ass-img" src="'+x.img+'" alt="Assinatura de '+esc(x.nome)+'">':'')+'</span>'+
    '<span class="ass-linha"></span><b>'+esc(x.nome||'')+'</b><small>'+esc(x.rotulo)+'</small></div>').join('')+'</div>';
}
function sigPainel(a){
  const S2=S.sig;if(!S2||S2.id!==a.id)return '';
  const pode=podeEscrever();
  let h='<details class="sig-painel noprint"'+(S2.aberto?' open':'')+'><summary><b>Assinaturas do documento</b> <span class="note">'+S2.lista.filter(x=>x.on).length+' selecionada(s) · nome, assinatura na tela ou imagem</span></summary><div class="sig-lista">';
  S2.lista.forEach((x,i)=>{
    const u=x.uid?uById(x.uid):null, salva=u&&imgOk(u.assinaturaImg);
    h+='<div class="sig-item'+(x.on?'':' off')+'">'+
      '<label class="chip"><input type="checkbox" data-sig-on="'+i+'"'+(x.on?' checked':'')+'> '+esc(SIG_TIPOS.find(t=>t[0]===x.k)?SIG_TIPOS.find(t=>t[0]===x.k)[1]:x.rotulo)+'</label>'+
      (x.on?'<input class="sig-nome" data-sig-nome="'+i+'" value="'+esc(x.nome)+'" placeholder="Nome de quem assina" aria-label="Nome">'+
       '<select data-sig-modo="'+i+'" aria-label="Tipo de assinatura"><option value="nome"'+(x.modo==='nome'?' selected':'')+'>Só o nome (assina no papel)</option><option value="tela"'+(x.modo==='tela'?' selected':'')+'>Assinar na tela</option><option value="imagem"'+(x.modo==='imagem'?' selected':'')+'>Imagem da assinatura</option></select>'+
       (x.modo==='tela'?'<button class="btn small" data-act="sig-pad" data-i="'+i+'">'+(imgOk(x.img)?'Assinar de novo':'Assinar agora')+'</button>':'')+
       (x.modo==='imagem'?'<label class="btn small">Enviar imagem<input type="file" accept="image/*" data-sig-arq="'+i+'" hidden></label>'+(salva?'<button class="btn small" data-act="sig-salva" data-i="'+i+'">Usar assinatura salva</button>':''):'')+
       (x.modo!=='nome'&&imgOk(x.img)?'<img class="sig-mini" src="'+x.img+'" alt="">':''):'')+
    '</div>';
  });
  h+='</div><div class="row" style="margin-top:10px">'+(pode?'<button class="btn small primary" data-act="sig-salvar">Salvar assinaturas no atendimento</button>':'')+
    '<span class="note">'+(S2.mudou?'Alterações ainda não salvas.':'As assinaturas aparecem no PDF ao imprimir.')+'</span></div></details>';
  return h;
}
function redesenharDocs(){const a=S.atend.find(x=>x.id===(S.sig&&S.sig.id));if(a){const o=$('.ficha-overlay');const sc=o?o.scrollTop:0;abrirDocs(a.id,S.docAba||'ficha');const n=$('.ficha-overlay');if(n)n.scrollTop=sc}}
function atualizarAssinaturasDoc(){const a=S.atend.find(x=>x.id===(S.sig&&S.sig.id));const box=$('.ficha-overlay .ficha-ass');if(a&&box)box.outerHTML=assinaturasDoc(a)||'<div class="ficha-ass"></div>'}
function lerImagem(arq,maxW,maxH){return new Promise((ok,erro)=>{const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const r=Math.min(1,maxW/im.width,maxH/im.height);const c=document.createElement('canvas');c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/png'))};im.onerror=()=>erro(new Error('Imagem inválida'));im.src=fr.result};fr.onerror=()=>erro(fr.error);fr.readAsDataURL(arq)})}
function abrirPad(titulo,cb){
  const w=document.createElement('div');w.className='pad-overlay';w.setAttribute('role','dialog');
  w.innerHTML='<div class="pad-box"><h3>'+esc(titulo)+'</h3><p class="note">Assine com o dedo ou o mouse no espaço abaixo.</p><canvas width="600" height="200" class="pad"></canvas><div class="row" style="margin-top:10px"><button class="btn primary" data-pad="ok">Usar esta assinatura</button><button class="btn" data-pad="limpar">Limpar</button><button class="btn" data-pad="cancelar">Cancelar</button></div></div>';
  document.body.appendChild(w);
  const c=w.querySelector('canvas'),g=c.getContext('2d');g.lineWidth=2.6;g.lineCap='round';g.lineJoin='round';g.strokeStyle='#14213d';
  let des=false,usou=false;const pt=e=>{const r=c.getBoundingClientRect();return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]};
  c.addEventListener('pointerdown',e=>{des=true;usou=true;c.setPointerCapture(e.pointerId);const [x,y]=pt(e);g.beginPath();g.moveTo(x,y)});
  c.addEventListener('pointermove',e=>{if(!des)return;const [x,y]=pt(e);g.lineTo(x,y);g.stroke()});
  ['pointerup','pointercancel'].forEach(ev=>c.addEventListener(ev,()=>{des=false}));
  w.addEventListener('click',e=>{const b=e.target.closest('[data-pad]');if(!b)return;
    if(b.dataset.pad==='limpar'){g.clearRect(0,0,c.width,c.height);usou=false;return}
    if(b.dataset.pad==='ok'){if(!usou){toast('Faça a assinatura antes de usar');return}cb(c.toDataURL('image/png'))}
    w.remove()});
}
/* ---------- relatório geral ---------- */
function contagem(arr,fn){const m={};arr.forEach(a=>{const k=fn(a)||'—';m[k]=(m[k]||0)+1});return Object.entries(m).sort((x,y)=>y[1]-x[1])}
function relatorioHTML(){
  const arr=filtrarAgenda().slice().sort((x,y)=>String(x.quando).localeCompare(String(y.quando)));
  const f=S.filtro, n=s=>arr.filter(a=>a.status===s).length;
  const per=f.de||f.ate?'De '+(f.de?dataCurta(f.de):'início')+' até '+(f.ate?dataCurta(f.ate):'hoje'):({proximos:'Próximos atendimentos',hoje:'Hoje',semana:'Próximos 7 dias',passados:'Atendimentos já realizados / passados',confirmar:'Aguardando confirmação',todos:'Todos os atendimentos'}[f.periodo]||'');
  const filtros=[per,f.seg||'Todos os segmentos',f.status?STATUS_LBL[f.status]:'',f.turma,f.prof?(f.prof==='__me'?'Meus atendimentos':(uById(f.prof)||{}).nome):''].filter(Boolean).join(' · ');
  const tab=(t,l)=>'<div><h3>'+t+'</h3><table class="ficha-tab rel-mini">'+(l.length?l.map(x=>'<tr><td>'+esc(x[0])+'</td><td class="num">'+x[1]+'</td></tr>').join(''):'<tr><td>—</td><td></td></tr>')+'</table></div>';
  const agora=new Date();
  return '<div class="ficha-overlay" role="dialog" aria-label="Relatório de atendimentos"><div class="ficha rel">'+
    '<div class="row noprint" style="justify-content:flex-end;margin:-8px 0 12px"><button class="btn primary" data-act="imprimir">Imprimir / salvar PDF</button><button class="btn" data-act="fechar-ficha">Fechar</button></div>'+
    '<div class="ficha-top"><img src="'+LOGO_E+'" alt="Antares Full Time Eusébio" class="logo-eus"><img src="'+LOGO_A+'" alt="Colégio Antares" class="logo-ant"><div><h2>Relatório de Atendimentos às Famílias</h2><p>'+esc(filtros)+'</p></div></div>'+
    '<div class="rel-stats">'+[['Total',arr.length],['Realizados',n('realizado')],['Agendados',n('agendado')],['Confirmados',n('confirmado')],['Família faltou',n('faltou')],['Cancelados',n('cancelado')]].map(x=>'<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('')+'</div>'+
    '<div class="rel-grid">'+tab('Por segmento',contagem(arr,a=>seg(a)))+tab('Por motivo',contagem(arr,a=>a.motivo))+tab('Por profissional',contagem(arr,a=>(uById(a.profissional)||{}).nome))+'</div>'+
    '<h3>Atendimentos ('+arr.length+')</h3>'+
    (arr.length?'<table class="ficha-tab rel-lista"><thead><tr><th>Data</th><th>Hora</th><th>Estudante</th><th>Turma</th><th>Seg.</th><th>Motivo</th><th>Atendido por</th><th>Status</th></tr></thead><tbody>'+
      arr.map(a=>'<tr><td>'+esc(dataCurta(a.data))+'</td><td>'+esc(a.hora)+'</td><td>'+esc(a.crianca)+'</td><td>'+esc(a.turma)+'</td><td>'+segCurto(seg(a))+'</td><td>'+esc(a.motivo||'')+'</td><td>'+esc(quemAtende(a,false))+'</td><td>'+esc(STATUS_LBL[a.status]||a.status)+'</td></tr>').join('')+'</tbody></table>':'<p class="note">Nenhum atendimento com esses filtros.</p>')+
    '<p class="ficha-nota">Relatório interno · gerado em '+esc(dataCurta(iso(agora)))+' às '+pad(agora.getHours())+':'+pad(agora.getMinutes())+' por '+esc(S.me.nome)+(S.me.cargo?' ('+esc(S.me.cargo)+')':'')+'.</p>'+
    '<div class="ficha-ass n1" style="margin-top:36px">'+assinaturaUsuario()+'</div>'+
  '</div></div>';
}
function assinaturaUsuario(){const u=S.me;return '<div><span class="ass-area">'+(imgOk(u.assinaturaImg)?'<img class="ass-img" src="'+u.assinaturaImg+'" alt="Assinatura">':'')+'</span>'+'<span class="ass-linha"></span><b>'+esc(u.nome)+'</b><small>'+esc(u.cargo||PAPEL_LBL[u.papel]||'')+'</small></div>'}

/* ---------- ações ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act],[data-go],[data-mark],[data-dia],[data-cal],[data-seg],[data-doc]'); if(!t)return;
  if(t.dataset.doc){const o=t.closest('.ficha-overlay');if(o)abrirDocs(o.dataset.id,t.dataset.doc);return}
  if(t.dataset.seg!==undefined){S.segView=t.dataset.seg;S.filtro.seg=S.segView;refreshLive();return}
  if(t.dataset.dia){S.calDia=t.dataset.dia;S.calMes=t.dataset.dia.slice(0,7);refreshLive();return}
  if(t.dataset.cal){if(t.dataset.cal==='0'){S.calMes=hoje().slice(0,7);S.calDia=hoje()}else{const p=S.calMes.split('-').map(Number);S.calMes=iso(new Date(p[0],p[1]-1+Number(t.dataset.cal),1)).slice(0,7)}refreshLive();return}
  if(t.dataset.mark){
    const a=S.atend.find(x=>x.id===t.dataset.mark);
    if(a&&a.data>=hoje()){updateDoc(doc(db,'atendimentos',a.id),{lembreteEm:new Date().toISOString()}).catch(()=>{})}
    return;
  }
  if(t.dataset.tab){S.novaData=null;S.prefill=null;if(t.dataset.tab!=='novo')S.editId=null;S.tab=t.dataset.tab;render();window.scrollTo(0,0);return}
  if(t.dataset.go){S.tab='agenda';S.filtro={periodo:{hoje:'hoje',semana:'semana',confirmar:'confirmar',passados:'passados'}[t.dataset.go]||'proximos',status:'',turma:'',prof:'',q:'',seg:S.segView};render();return}
  const act=t.dataset.act;
  if(act==='sair'){await signOut(auth);return}
  if(act==='ficha'){const a=S.atend.find(x=>x.id===t.dataset.id);if(a)abrirDocs(a.id,a.status==='realizado'?'familia':'equipe');return}
  if(act==='copiar-doc'){const a=S.atend.find(x=>x.id===t.dataset.id);if(!a)return;const tx=t.dataset.txt==='familia'?textoFamilia(a):textoEquipe(a);try{await navigator.clipboard.writeText(tx);toast('Texto copiado')}catch(e){toast('Não foi possível copiar. Selecione o texto e copie.')}return}
  if(act==='fechar-ficha'){S.sig=null;document.querySelectorAll('.ficha-overlay').forEach(x=>x.remove());document.body.classList.remove('ficha-aberta');return}
  if(act==='imprimir'){window.print();return}
  if(act==='copiar-link'){S.linksAbertos=!S.linksAbertos;refreshLive();return}
  if(act==='copiar-url'){const u=t.dataset.url;try{await navigator.clipboard.writeText(u);toast('Link copiado')}catch(e){const i=t.closest('.link-row').querySelector('input');i.select();toast('Selecione e copie o link')}return}
  if(act==='ja-tenho'){S.bootstrap=true;S.gateMsg='';render();return}
  if(act==='esqueci'){
    const em=($('#lg-email')||{}).value||'';
    if(!em){S.gateMsg='Digite seu e-mail no campo acima e toque de novo em "Esqueci minha senha".';S.gateInfo='';render();return}
    try{await sendPasswordResetEmail(auth,em.trim());S.gateMsg='';S.gateInfo='Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.'}catch(err){S.gateMsg=erroMsg(err);S.gateInfo=''}
    render();setTimeout(()=>{const i=$('#lg-email');if(i)i.value=em},0);return;
  }
  if(act==='minha-senha'){try{await sendPasswordResetEmail(auth,S.me.email);toast('Enviamos um link para '+S.me.email)}catch(err){toast(erroMsg(err))}return}
  if(act==='novo-dia'){S.editId=null;S.novaData=S.calDia;S.tab='novo';render();window.scrollTo(0,0);return}
  if(act==='novo'){S.editId=null;S.novaData=null;S.tab='novo';render();window.scrollTo(0,0);return}
  if(act==='editar'){S.editId=t.dataset.id;S.tab='novo';render();window.scrollTo(0,0);return}
  if(act==='cancelar-form'){S.editId=null;S.tab='agenda';render();return}
  if(act==='excluir'){
    if(!S.delArm){S.delArm=true;t.textContent='Toque de novo para excluir';return}
    try{await deleteDoc(doc(db,'atendimentos',S.editId));S.editId=null;S.tab='agenda';render();toast('Atendimento excluído')}catch(err){$('#at-msg').innerHTML='<p class="msg err">'+esc(erroMsg(err))+'</p>'}
    return;
  }
  if(act==='agendar-aluno'){const al=(S.alunosCache[anoSel()]||[]).find(x=>x.id===t.dataset.id);if(al){S.editId=null;S.novaData=null;S.prefill=prefillDe(al);S.tab='novo';render();window.scrollTo(0,0)}return}
  if(act==='mais-alunos'){S.alMax=(S.alMax||100)+200;refreshAlunos();return}
  if(act==='criar-ano'){const v=(($('#ano-novo')||{}).value||'').trim();if(!/^\d{4}$/.test(v)){toast('Digite o ano com 4 números, ex.: 2027');return}try{await setDoc(doc(db,'anos',v),{criadoEm:serverTimestamp(),criadoPor:S.me.id});if(!S.anos.includes(v))S.anos=S.anos.concat(v).sort();S.alAno=v;S.imp=S.imp&&Object.assign(S.imp,{ano:v});toast('Ano letivo '+v+' criado');renderView()}catch(err){toast(erroMsg(err))}return}
  if(act==='ano-atual'){try{await setDoc(doc(db,'config','geral'),{anoAtual:anoSel()},{merge:true});toast('Ano letivo atual: '+anoSel())}catch(err){toast(erroMsg(err))}return}
  if(act==='abrir-import'){S.impAberto=!S.impAberto;S.imp=null;renderView();return}
  if(act==='importar'){importarAlunos(t);return}
  if(act==='relatorio'){document.querySelectorAll('.ficha-overlay').forEach(x=>x.remove());document.body.insertAdjacentHTML('beforeend',relatorioHTML());document.body.classList.add('ficha-aberta');return}
  if(act==='sig-pad'){const i=+t.dataset.i;abrirPad('Assinatura: '+(S.sig.lista[i].nome||S.sig.lista[i].rotulo),img=>{S.sig.lista[i].img=img;S.sig.mudou=true;S.sig.aberto=true;redesenharDocs()});return}
  if(act==='sig-salva'){const i=+t.dataset.i;const u=uById(S.sig.lista[i].uid);if(u&&imgOk(u.assinaturaImg)){S.sig.lista[i].img=u.assinaturaImg;S.sig.mudou=true;S.sig.aberto=true;redesenharDocs()}return}
  if(act==='sig-salvar'){try{await updateDoc(doc(db,'atendimentos',S.sig.id),{assinaturas:S.sig.lista.map(x=>({k:x.k,rotulo:x.rotulo,nome:x.nome,uid:x.uid||'',modo:x.modo,img:x.modo!=='nome'&&imgOk(x.img)?x.img:'',on:!!x.on}))});S.sig.mudou=false;S.sig.aberto=true;toast('Assinaturas salvas');redesenharDocs()}catch(err){toast(erroMsg(err))}return}
  if(act==='minha-ass-pad'){abrirPad('Minha assinatura',async img=>{try{await updateDoc(doc(db,'usuarios',S.me.id),{assinaturaImg:img});toast('Assinatura salva')}catch(err){toast(erroMsg(err))}});return}
  if(act==='minha-ass-del'){try{await updateDoc(doc(db,'usuarios',S.me.id),{assinaturaImg:''});toast('Assinatura removida')}catch(err){toast(erroMsg(err))}return}
  if(act==='novo-usuario'){S.userForm='novo';renderView();setTimeout(()=>{const i=$('#uf-nome');i&&i.focus()},0);return}
  if(act==='editar-usuario'){S.userForm=t.dataset.id;renderView();setTimeout(()=>{const i=$('#uf-nome');i&&i.focus();$('#u-form').scrollIntoView({block:'start'})},0);return}
  if(act==='cancelar-usuario'){S.userForm=null;renderView();return}
  if(act==='toggle-seg'){const u=uById(t.dataset.id);const s=t.dataset.segV;let l=Array.isArray(u.segmentos)?u.segmentos.slice():SEGMENTOS.slice();l=l.includes(s)?l.filter(x=>x!==s):l.concat(s);try{await updateDoc(doc(db,'usuarios',u.id),{segmentos:SEGMENTOS.filter(x=>l.includes(x))});toast(u.nome.split(' ')[0]+': '+(l.length?l.map(segCurto).join(', '):'nenhum segmento'))}catch(err){toast(erroMsg(err))}return}
  if(act==='toggle-user'){const u=uById(t.dataset.id);try{await updateDoc(doc(db,'usuarios',u.id),{ativo:u.ativo===false});toast(u.ativo===false?'Acesso reativado':'Acesso desativado')}catch(err){toast(erroMsg(err))}return}
  if(act==='reset'){const u=uById(t.dataset.id);try{await sendPasswordResetEmail(auth,u.email);toast('Link de nova senha enviado para '+u.email)}catch(err){toast(erroMsg(err))}return}
});
document.addEventListener('toggle',e=>{if(e.target.classList&&e.target.classList.contains('sig-painel')&&S.sig)S.sig.aberto=e.target.open},true);
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.status){try{await updateDoc(doc(db,'atendimentos',t.dataset.status),{status:t.value,atualizadoEm:new Date().toISOString(),atualizadoPor:S.me.id});toast('Status: '+STATUS_LBL[t.value])}catch(err){toast(erroMsg(err))}return}
  if(t.dataset&&t.dataset.sigOn!==undefined){const x=S.sig.lista[+t.dataset.sigOn];x.on=t.checked;S.sig.mudou=true;S.sig.aberto=true;redesenharDocs();return}
  if(t.dataset&&t.dataset.sigModo!==undefined){const x=S.sig.lista[+t.dataset.sigModo];x.modo=t.value;S.sig.mudou=true;S.sig.aberto=true;redesenharDocs();return}
  if(t.dataset&&t.dataset.sigArq!==undefined){const i=+t.dataset.sigArq;const f0=t.files&&t.files[0];if(!f0)return;try{S.sig.lista[i].img=await lerImagem(f0,500,180);S.sig.mudou=true;S.sig.aberto=true;redesenharDocs()}catch(e){toast('Não foi possível ler a imagem')}return}
  if(t.id==='minha-ass-arq'){const f0=t.files&&t.files[0];if(!f0)return;try{const img=await lerImagem(f0,500,180);await updateDoc(doc(db,'usuarios',S.me.id),{assinaturaImg:img});toast('Assinatura salva')}catch(e){toast(e&&e.code?erroMsg(e):'Não foi possível ler a imagem')}return}
  if(t.id==='al-ano'){S.alAno=t.value;S.alMax=100;renderView();return}
  if(t.id==='al-seg'||t.id==='al-sit'){S[t.id==='al-seg'?'alSeg':'alSit']=t.value;S.alMax=100;refreshAlunos();return}
  if(t.id==='imp-arq'){lerPlanilha(t.files&&t.files[0]);return}
  if(t.id==='imp-ano'){S.imp&&(S.imp.ano=t.value);const p=$('#imp-prev');if(p)p.innerHTML=previaHTML();return}
  if(t.id==='u-perfil'){S.uperfil=t.value;refreshLive();return}
  if(t.id==='uf-papel'){const b=$('#uf-segs-box');if(b)b.hidden=t.value==='admin';const defe=t.value==='defe';document.querySelectorAll('input[name="uf-seg"]').forEach(c=>{if(defe)c.checked=true;c.disabled=defe});return}
  if(t.id&&t.id.startsWith('fl-')&&t.id!=='fl-q'){S.filtro[t.id.slice(3)]=t.value;refreshLive()}
});
let qT;document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.sigNome!==undefined){S.sig.lista[+e.target.dataset.sigNome].nome=e.target.value;S.sig.mudou=true;atualizarAssinaturasDoc();return}if(e.target.id==='at-crianca'){preencherAluno(e.target.value)}if(e.target.id==='al-q'){clearTimeout(qT);qT=setTimeout(()=>{S.alQ=e.target.value.trim();S.alMax=100;refreshAlunos()},200);return}if(e.target.id==='at-serie'){const v=e.target.value,s=document.getElementById('at-seg');if(s){if(/s[ée]rie/i.test(v))s.value='Ensino Médio';else if(/[6-9]\s*º?\s*ano/i.test(v))s.value='EFAF';else if(/ano/i.test(v))s.value='EFAI';else if(/infantil/i.test(v))s.value='Educação Infantil'}}if(e.target.id==='u-q'){clearTimeout(qT);qT=setTimeout(()=>{S.uq=e.target.value.trim();refreshLive()},200);return}if(e.target.id==='fl-q'){clearTimeout(qT);qT=setTimeout(()=>{S.filtro.q=e.target.value.trim();refreshLive()},200)}});

document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;const val=id=>(document.getElementById(id)||{}).value||'';
  const btn=f.querySelector('button[type="submit"]'); if(btn)btn.disabled=true;
  try{
    if(f.id==='f-login'){
      S.gateInfo='';
      try{await signInWithEmailAndPassword(auth,val('lg-email').trim(),val('lg-senha'));S.gateMsg=''}
      catch(err){S.gateMsg=erroMsg(err);render()}
      return;
    }
    if(f.id==='f-setup'){
      const nome=val('su-nome').trim(), email=val('su-email').trim(), wa=val('su-wa').trim();
      try{
        S.criandoAdmin={nome,email,whatsapp:wa};
        await createUserWithEmailAndPassword(auth,email,val('su-senha'));
      }catch(err){S.criandoAdmin=null;S.gateMsg=erroMsg(err);render()}
      return;
    }
    if(f.id==='f-atend'){
      const serieV=val('at-serie').trim(), letraV=val('at-letra');
      const d={crianca:val('at-crianca').trim(),serie:serieV,letra:letraV,turma:serieV+(letraV?' '+letraV:''),responsavel2:val('at-resp2').trim(),parentesco2:val('at-par2').trim(),telefone2:val('at-tel2').trim(),responsavel:val('at-resp').trim(),parentesco:val('at-par').trim(),telefone:val('at-tel').trim(),email:val('at-email').trim(),
        data:val('at-data'),hora:val('at-hora'),duracao:Number(val('at-dur'))||30,modalidade:val('at-mod'),motivo:val('at-motivo'),profissional:val('at-prof'),status:val('at-status'),
        retorno:val('at-ret'),pauta:val('at-pauta').trim(),registro:val('at-reg').trim(),resumoFamilia:val('at-rfam').trim(),encaminhamentos:val('at-enc').trim()};
      d.segmento=val('at-seg');d.solicitante=val('at-pedido');d.participantes=[...document.querySelectorAll('input[name="at-part"]:checked')].map(i=>i.value);d.outros=val('at-outros').trim();
      d.quando=d.data+'T'+d.hora; d.atualizadoEm=new Date().toISOString(); d.atualizadoPor=S.me.id;
      const conflito=S.atend.find(x=>x.id!==S.editId&&x.profissional===d.profissional&&x.data===d.data&&x.hora===d.hora&&x.status!=='cancelado');
      try{
        if(S.editId)await updateDoc(doc(db,'atendimentos',S.editId),d);
        else{d.criadoEm=d.atualizadoEm;d.criadoPor=S.me.id;await setDoc(doc(collection(db,'atendimentos')),d)}
        const novo=!S.editId;S.editId=null;S.tab='agenda';S.filtro={periodo:'proximos',status:'',turma:'',prof:'',q:'',seg:S.segView};render();
        toast(novo?'Atendimento agendado':'Alterações salvas');
        if(conflito)setTimeout(()=>toast('Atenção: '+((uById(d.profissional)||{}).nome||'essa pessoa')+' já tem outro atendimento nesse horário'),2900);
      }catch(err){$('#at-msg').innerHTML='<p class="msg err">'+esc(erroMsg(err))+'</p>'}
      return;
    }
    if(f.id==='f-conta'){
      try{await updateDoc(doc(db,'usuarios',S.me.id),{nome:val('ct-nome').trim(),cargo:val('ct-cargo').trim(),whatsapp:val('ct-wa').trim(),resumoEmail:document.getElementById('ct-rmail').checked,resumoWhats:document.getElementById('ct-rwa').checked,callmebotKey:val('ct-key').trim()});toast('Conta atualizada')}catch(err){toast(erroMsg(err))}
      return;
    }
    if(f.id==='f-usr'){
      const novo=S.userForm==='novo';
      const papel=document.getElementById('uf-papel').value;
      const segs=[...document.querySelectorAll('input[name="uf-seg"]:checked')].map(i=>i.value);
      if(papel!=='admin'&&papel!=='defe'&&!segs.length){toast('Marque pelo menos um segmento');return}
      const ativoEl=document.getElementById('uf-ativo');
      const dados={nome:val('uf-nome').trim(),cargo:val('uf-cargo').trim(),whatsapp:val('uf-wa').trim(),papel,segmentos:papel==='admin'||papel==='defe'?SEGMENTOS.slice():segs};
      if(ativoEl)dados.ativo=ativoEl.checked;
      if(novo){
        const email=val('uf-email').trim().toLowerCase();
        if(S.usuarios.some(u=>String(u.email).toLowerCase()===email)){toast('Já existe um usuário com esse e-mail');return}
        const sec=initializeApp(firebaseConfig,'cadastro-'+Date.now());
        try{
          const cred=await createUserWithEmailAndPassword(getAuth(sec),email,val('uf-senha'));
          await setDoc(doc(db,'usuarios',cred.user.uid),Object.assign(dados,{email,ativo:true,criadoEm:serverTimestamp(),criadoPor:S.me.id}));
          await signOut(getAuth(sec));
          S.userForm=null;renderView();toast(dados.nome+' cadastrado(a)');
        }catch(err){toast(erroMsg(err))}
        finally{deleteApp(sec).catch(()=>{})}
      }else{
        try{await updateDoc(doc(db,'usuarios',S.userForm),dados);S.userForm=null;renderView();toast('Alterações salvas')}catch(err){toast(erroMsg(err))}
      }
      return;
    }
    if(f.id==='f-config'){
      const m={};ASS_KEYS().forEach((s,i)=>{m[s]=val('cf-ass-'+i).trim()||ASS_PADRAO[s]});try{await setDoc(doc(db,'config','geral'),{assinaturas:m});toast('Assinaturas salvas')}catch(err){toast(erroMsg(err))}
    }
  }finally{ if(btn&&document.body.contains(btn))btn.disabled=false }
});

/* ---------- sessão e dados ---------- */
function pararDados(){S.pub={};S.okP=false;S.anos=[];S.alunosCache={};S.alunosLoad={};S.unsub.forEach(u=>{try{u()}catch(e){}});S.unsub=[];S.usuarios=[];S.atend=[];S.okA=false;S.config={}}
function iniciarDados(){
  if(S.unsub.length>1)return;
  S.unsub.push(onSnapshot(collection(db,'usuarios'),snap=>{S.usuarios=snap.docs.map(d=>Object.assign({id:d.id},d.data()));refreshLive();agendarSync()},()=>{}));
  S.unsub.push(onSnapshot(collection(db,'publico'),snap=>{S.pub={};snap.docs.forEach(d=>{S.pub[d.id]=d.data()});S.okP=true;agendarSync()},()=>{}));
  const segs=meusSegs();
  if(!segs.length){S.okA=true;S.atend=[];refreshLive();}
  else S.unsub.push(onSnapshot(veTudo()&&S.me.papel==='admin'?collection(db,'atendimentos'):query(collection(db,'atendimentos'),where('segmento','in',segs)),snap=>{S.atend=snap.docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>String(a.quando).localeCompare(String(b.quando)));S.okA=true;refreshLive();agendarSync()},err=>{if(err.code==='permission-denied'){S.okA=true;refreshLive()}}));
  S.unsub.push(onSnapshot(doc(db,'config','geral'),s=>{S.config=s.exists()?s.data():{};refreshLive()},()=>{}));
  S.unsub.push(onSnapshot(collection(db,'anos'),snap=>{S.anos=snap.docs.map(d=>d.id).sort();refreshLive()},()=>{}));
}
async function criarPerfilAdmin(user){
  const p=S.criandoAdmin; S.criandoAdmin=null;
  const b=writeBatch(db);
  b.set(doc(db,'usuarios',user.uid),{nome:p.nome,email:user.email,whatsapp:p.whatsapp,papel:'admin',ativo:true,criadoEm:serverTimestamp()});
  b.set(doc(db,'config','bootstrap'),{criadoPor:user.uid,criadoEm:serverTimestamp()});
  await b.commit();
}
let perfilUnsub=null;
async function boot(){
  if(S.fatal){render();return}
  try{const b=await getDoc(doc(db,'config','bootstrap'));S.bootstrap=b.exists();S.principal=b.exists()?(b.data()||{}).criadoPor:null}catch(e){S.bootstrap=true}
  onAuthStateChanged(auth,async user=>{
    S.authUser=user; S.me=null; S.perfilOk=false;
    if(perfilUnsub){perfilUnsub();perfilUnsub=null}
    pararDados();
    if(!user){S.loading=false;S.tab='painel';S.editId=null;render();return}
    S.loading=false;render();
    if(S.criandoAdmin){
      try{await criarPerfilAdmin(user);S.bootstrap=true}
      catch(err){S.gateMsg='Não foi possível criar o administrador: já existe um administrador cadastrado. Entre com sua conta ou peça acesso a ele.';await signOut(auth);return}
    }
    perfilUnsub=onSnapshot(doc(db,'usuarios',user.uid),snap=>{
      const antes=S.me;
      S.me=snap.exists()?Object.assign({id:snap.id},snap.data()):null; S.perfilOk=true;
      if(antes&&S.me&&JSON.stringify(antes.segmentos||null)+antes.papel!==JSON.stringify(S.me.segmentos||null)+S.me.papel){pararDados()}
      if(S.me&&S.me.ativo!==false){iniciarDados()}else pararDados();
      if(!antes||!S.me||antes.ativo!==S.me.ativo||antes.papel!==S.me.papel||JSON.stringify(antes.segmentos||null)!==JSON.stringify(S.me.segmentos||null)||!$('#main'))render();else refreshLive();
    },()=>{S.perfilOk=true;S.me=null;render()});
  });
  setInterval(refreshLive,60000);
}
boot();
