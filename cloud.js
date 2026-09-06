'use strict';
// A chave publicável identifica o projeto. As permissões são verificadas pelo banco.
const cloudClient = window.supabase.createClient(
  'https://rattnvysckapxyenhbfu.supabase.co',
  'sb_publishable_ddbC7GSGhP_zIq4NL_zMhw_pNSl1Gnw',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}
);
const CLOUD_BUCKET = 'frota-comprovantes';
let cloudRevision = null;
let cloudBlocked = false;
let cloudPending = 0;
let cloudLastSnapshot = null;
window.FROTA_CLOUD = true;

function cloudStatus(message, failed=false) {
  const el=document.getElementById('cloudStatus');
  if(el){el.textContent=message;el.style.background=failed?'#862727':'#163d35';}
}
function cloudCheck(result) { if(result.error) throw result.error; return result.data; }
function cloudFailure(error) {
  cloudBlocked=true;
  cloudStatus('Não salvo: '+error.message,true);
  const panel=document.getElementById('cloudFailure');
  panel.hidden=false;
  document.getElementById('cloudFailureText').textContent='O envio não foi confirmado. '+error.message;
}
function cloudGuard(){if(cloudBlocked)throw new Error('Gravação bloqueada após falha. Recarregue os dados para continuar.');}

// Substitui a camada local somente nesta edição conectada.
dbLoadState = async function() {
  const allowed=cloudCheck(await cloudClient.rpc('frota_autorizado'));
  if(!allowed)throw new Error('Seu usuário não está autorizado a acessar a frota.');
  const row=cloudCheck(await cloudClient.from('frota_estado').select('dados,revisao').eq('id',1).maybeSingle());
  cloudRevision=row?Number(row.revisao):0;
  cloudLastSnapshot=row?JSON.stringify(row.dados):null;
  cloudBlocked=false;
  cloudStatus('Conectado ao Supabase');
  return row?row.dados:null;
};
dbSaveState = async function(snapshot) {
  cloudGuard();
  if(cloudRevision===null)throw new Error('Carregue os dados antes de salvar.');
  const serialized=JSON.stringify(snapshot);
  if(serialized===cloudLastSnapshot)return;
  cloudPending++;
  cloudStatus('Salvando no Supabase…');
  try {
    const revision=cloudCheck(await cloudClient.rpc('frota_salvar',{p_dados:snapshot,p_revisao:cloudRevision}));
    cloudRevision=Number(revision);
    cloudLastSnapshot=serialized;
    cloudStatus('Salvo no Supabase • '+new Date().toLocaleTimeString('pt-BR'));
  } catch(e){cloudFailure(e);throw e;} finally{cloudPending--;}
};

async function cloudRows(field, value) {
  let query=cloudClient.from('frota_comprovantes').select('*').eq('excluido',false).order('id');
  if(field)query=query.eq(field,value);
  // Paginação evita truncar backups ao atingir o limite padrão da API.
  const rows=[];
  for(let start=0;;start+=500){
    const batch=cloudCheck(await query.range(start,start+499));
    rows.push(...batch);
    if(batch.length<500)return rows;
  }
}
async function cloudDocument(row) {
  const blob=cloudCheck(await cloudClient.storage.from(CLOUD_BUCKET).download(row.caminho));
  return {id:Number(row.id),abastecimentoId:row.abastecimento_id,trocaOleoId:row.troca_oleo_id,
    nome:row.nome,tipo:row.tipo,tamanho:row.tamanho,data:row.data,blob};
}
dbSalvarComprovante = async function(doc) {
  cloudGuard();
  const blob=doc.blob instanceof Blob?doc.blob:new Blob([doc.blob],{type:doc.tipo});
  if(blob.size>50*1024*1024)throw new Error('O comprovante excede 50 MB.');
  const path=crypto.randomUUID();
  cloudPending++;
  try {
    cloudCheck(await cloudClient.storage.from(CLOUD_BUCKET).upload(path,blob,{contentType:doc.tipo||'application/octet-stream',upsert:false}));
    const row=cloudCheck(await cloudClient.from('frota_comprovantes').insert({
      abastecimento_id:doc.abastecimentoId||null,troca_oleo_id:doc.trocaOleoId||null,
      nome:doc.nome,tipo:doc.tipo||'application/octet-stream',tamanho:blob.size,
      data:doc.data||new Date().toISOString(),caminho:path
    }).select('id').single());
    return Number(row.id);
  } finally {cloudPending--;}
};
dbGetComprovantes=async id=>Promise.all((await cloudRows('abastecimento_id',Number(id))).map(cloudDocument));
dbGetComprovantesOleo=async id=>Promise.all((await cloudRows('troca_oleo_id',Number(id))).map(cloudDocument));
dbExcluirComprovante=async id=>{
  cloudGuard();
  cloudCheck(await cloudClient.from('frota_comprovantes').update({excluido:true}).eq('id',Number(id)));
};
dbExcluirComprovantesAbast=async id=>{
  cloudGuard();
  cloudCheck(await cloudClient.from('frota_comprovantes').update({excluido:true}).eq('abastecimento_id',Number(id)));
};
idbGetAllKeys=async store=>{
  if(store!=='comprovantes')throw new Error('Coleção não suportada.');
  return (await cloudRows()).map(row=>Number(row.id));
};
idbGet=async(store,id)=>{
  if(store!=='comprovantes')throw new Error('Coleção não suportada.');
  const row=cloudCheck(await cloudClient.from('frota_comprovantes').select('*').eq('id',id).eq('excluido',false).single());
  return cloudDocument(row);
};
idbGetAll=async store=>{
  if(store!=='comprovantes')throw new Error('Coleção não suportada.');
  const result=[];
  for(const row of await cloudRows())result.push(await cloudDocument(row));
  return result;
};
dbUsageInfo=async()=>({used:'armazenamento privado',quota:'Supabase',pct:'—'});

async function cloudStart(startApplication) {
  const login=document.getElementById('cloudLogin');
  const message=document.getElementById('cloudLoginMessage');
  const form=document.getElementById('cloudLoginForm');
  const appNodes=[...document.body.children].filter(el=>!['cloudLogin','cloudBar','cloudFailure'].includes(el.id)&&!['SCRIPT','STYLE'].includes(el.tagName));
  appNodes.forEach(el=>el.inert=true);
  const launch=async()=>{
    if(!cloudCheck(await cloudClient.rpc('frota_autorizado')))throw new Error('Este e-mail não tem acesso autorizado ao sistema.');
    login.remove();
    appNodes.forEach(el=>el.inert=false);
    document.getElementById('cloudBar').hidden=false;
    document.getElementById('cloudSignOut').onclick=async()=>{
      if(cloudPending){cloudStatus('Aguarde o término do salvamento.',true);return;}
      const {error}=await cloudClient.auth.signOut();
      if(error){cloudStatus(error.message,true);return;}
      location.reload();
    };
    await startApplication();
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button');button.disabled=true;message.textContent='Entrando…';
    try{
      cloudCheck(await cloudClient.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value}));
      form.password.value='';
      await launch();
    }catch(e){message.textContent=e.message;}finally{button.disabled=false;}
  };
  try{
    const {session}=cloudCheck(await cloudClient.auth.getSession());
    if(session)await launch();
  }catch(e){message.textContent=e.message;}
  window.addEventListener('beforeunload',event=>{
    if(cloudPending||cloudBlocked){event.preventDefault();event.returnValue='';}
  });
}
