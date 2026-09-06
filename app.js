'use strict';

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTES E SEED
// ═══════════════════════════════════════════════════════════════════
const STORAGE_KEY = 'abastecimento2026-novo-storage';
const RESPONSAVEIS = [];

const seedState = {
  tiposPrefixo:['Vtr','MP'],
  perfis:   [{id:1,nome:'ADMIN'},{id:2,nome:'OPERADOR'},{id:3,nome:'CONSULTA'}],
  usuarios: [{id:1,nome:'Administrador do Sistema',login:'admin',perfilId:1,ativo:true}],
  combustiveis: [
    {id:1,nome:'Gasolina',ativo:true},{id:2,nome:'Diesel',ativo:true},
    {id:3,nome:'Etanol',ativo:true},{id:4,nome:'Elétrico',ativo:true}
  ],
  setores: [
    {id:1,nome:'Guarda Municipal de Ipatinga',sigla:'GMI',ativo:true},
    {id:2,nome:'SESCON',sigla:'SESCON',ativo:true},
    {id:3,nome:'Administração',sigla:'ADM',ativo:true},
    {id:4,nome:'Obras',sigla:'OBR',ativo:true}
  ],
  motoristas: [],
  veiculos: [],
  abastecimentos: [],
  trocasOleo: []
};

// ═══════════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const clone = d => JSON.parse(JSON.stringify(d));
const num = v => Number(v || 0);
const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function toIsoDate(d) { return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function today() { return toIsoDate(new Date()); }
function parseIsoDate(v) { return new Date(`${v}T00:00:00`); }

function formatDisplayDate(v, shortYear=true) {
  if (!v) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : parseBrDateToIso(v);
  if (!iso) return String(v||'');
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${shortYear ? y.slice(-2) : y}`;
}

function parseBrDateToIso(v) {
  const raw = String(v||'').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dg = raw.replace(/\D/g,'');
  if (![6,8].includes(dg.length)) return '';
  const dd=Number(dg.slice(0,2)), mm=Number(dg.slice(2,4));
  const yy=dg.slice(4), yr=yy.length===2?2000+Number(yy):Number(yy);
  const dt = new Date(yr,mm-1,dd);
  if (isNaN(dt)||dt.getFullYear()!==yr||dt.getMonth()!==mm-1||dt.getDate()!==dd) return '';
  return toIsoDate(dt);
}

function maskDateValue(v) {
  const d = String(v||'').replace(/\D/g,'').slice(0,8);
  if (d.length<=2) return d;
  if (d.length<=4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function normalizeDateField(sel) {
  const f = qs(sel); if (!f) return;
  const iso = parseBrDateToIso(f.value);
  f.value = iso ? formatDisplayDate(iso) : maskDateValue(f.value);
}

function normalizeText(v) {
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function normalizePrefixo(v) { return String(v||'').replace(/\s+/g,' ').trim(); }

function parsePrefixoPattern(v, fi=1) {
  const raw = normalizePrefixo(v);
  const m = raw.match(/^(VTR|MP)\s*(\d{1,3})$/i);
  if (m) return { tipo: m[1].toUpperCase()==='MP'?'MP':'Vtr', numero: String(Number(m[2])).padStart(3,'0') };
  return { tipo:'Vtr', numero: String(fi).padStart(3,'0') };
}

function buildPrefixo(tipo, numero) {
  return `${String(tipo||'Vtr').toUpperCase()==='MP'?'MP':'Vtr'} ${String(Number(numero||0)).padStart(3,'0')}`;
}

// ═══════════════════════════════════════════════════════════════════
//  STATE / STORAGE
// ═══════════════════════════════════════════════════════════════════
function migrateState(data) {
  const { _comprovantes, _meta, ...cadastros } = data;
  const m = clone(cadastros);
  for (const key of ['motoristas','veiculos','abastecimentos','trocasOleo','usuarios','perfis','setores','combustiveis']) {
    if (m[key] == null) m[key] = clone(seedState[key] || []);
    if (!Array.isArray(m[key])) throw new Error('Cadastro inválido: ' + key);
  }
  m.veiculos = (m.veiculos||[]).map((v,i) => {
    const p = parsePrefixoPattern(v.prefixo, i+1);
    return { ...v,
      descricao: v.descricao||v.prefixo||v.placa||`Veículo ${i+1}`,
      prefixoTipo: v.prefixoTipo||p.tipo,
      prefixoNumero: String(v.prefixoNumero||p.numero).padStart(3,'0'),
      prefixo: v.prefixo||buildPrefixo(p.tipo,p.numero)
    };
  });
  m.trocasOleo = (m.trocasOleo||[]).map(t=>({...t,qtdLitros:t.qtdLitros||0,custoTotal:t.custoTotal||0}));
  m.abastecimentos = (m.abastecimentos||[]).map((it,i) => ({
    ...it,
    inspetorCoordenacao: it.inspetorCoordenacao||'',
    gerenteAbastecimento: it.gerenteAbastecimento||''
  }));
  if (!(m.combustiveis||[]).some(c=>normalizeText(c.nome)==='eletrico')) {
    const nid = Math.max(0,...(m.combustiveis||[]).map(c=>Number(c.id)||0))+1;
    m.combustiveis = [...(m.combustiveis||[]),{id:nid,nome:'Elétrico',ativo:true}];
  }
  // Preserva inclusive listas intencionalmente vazias.
  if (!m.trocasOleo) m.trocasOleo = [];
  if (!m.tiposPrefixo||!m.tiposPrefixo.length) m.tiposPrefixo=['Vtr','MP'];

  // Recalcula kmAtual de cada veículo com base nos registros reais (corrige dados persistidos com KM errado)
  (m.veiculos||[]).forEach(v => {
    if (Number(v.kmAtual) > 0) return;
    const registros = (m.abastecimentos||[]).filter(a => Number(a.veiculoId) === Number(v.id));
    if (registros.length) {
      v.kmAtual = registros.reduce((max,a)=>Math.max(max,Number(a.kmAtual)||0),0);
    }
  });

  return m;
}

// Estado em memória — carregado do IndexedDB no bootstrap
let state = migrateState(clone(seedState)); // provisório até o IndexedDB carregar
let _saveQueue = Promise.resolve();
let storageReady = false;

function backupStateLocally(snapshot) {
  try {
    if (!storageReady) return;
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > 1000000) return;
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(`${STORAGE_KEY}:updatedAt`, new Date().toISOString());
  } catch(e) {
    console.warn('[backupStateLocally]', e);
  }
}

async function saveState() {
  if (!storageReady) throw new Error("Banco não carregado. Reabra o sistema antes de salvar.");
  const snapshot = clone(state);
  backupStateLocally(snapshot);
  _saveQueue = _saveQueue.catch(()=>{}).then(()=>dbSaveState(snapshot));
  await _saveQueue;
}

async function saveStateSync() {
  if (!storageReady) return;
  // Versão que pode ser chamada sem await em contextos legados
  const snapshot = clone(state);
  backupStateLocally(snapshot);
  _saveQueue = _saveQueue.catch(()=>{}).then(()=>dbSaveState(snapshot));
  _saveQueue.catch(e => console.error('[saveState]', e));
  return _saveQueue;
}

window.addEventListener('beforeunload', () => backupStateLocally(clone(state)));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveStateSync();
});
function nextId(col) { return Math.max(0,...state[col].map(i=>Number(i.id)||0))+1; }

// ═══════════════════════════════════════════════════════════════════
//  LOOKUPS
// ═══════════════════════════════════════════════════════════════════
function findById(col,id) { return state[col].find(i=>Number(i.id)===Number(id)); }
function getCombustivelName(id) { return findById('combustiveis',id)?.nome||''; }
function getSetorName(id)       { return findById('setores',id)?.nome||''; }
function getVeiculo(id)         { return findById('veiculos',id); }
function getVeiculoName(id)     { const v=getVeiculo(id); return v?.descricao||v?.prefixo||v?.placa||''; }
function getVeiculoPrefixo(id)  { return getVeiculo(id)?.prefixo||''; }
function getMotorista(id)       { return findById('motoristas',id); }
function getMotoristaName(id)   { return getMotorista(id)?.nome||''; }
function getVehiclePlate(id)    { return getVeiculo(id)?.placa||''; }
function formatStatus(f)        { return f?'Ativo':'Inativo'; }

// ═══════════════════════════════════════════════════════════════════
//  SELECTS
// ═══════════════════════════════════════════════════════════════════
function setSelectOptions(sel, opts, placeholder='Selecione') {
  if (!sel) return;
  const cur = sel.value;
  const ph = placeholder!==null ? `<option value="">${placeholder}</option>` : '';
  sel.innerHTML = ph + opts.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  if (opts.some(o=>String(o.value)===String(cur))) sel.value=cur;
}

function activeOptionsFrom(col, lFn, vFn=i=>i.id) {
  return state[col].filter(i=>i.ativo!==false).map(i=>({value:vFn(i),label:lFn(i)}));
}

function syncFVeiculo() {
  const setorId=qs('#fSetor')?.value||'';
  const veicFiltrados=setorId
    ? state.veiculos.filter(v=>v.ativo!==false&&state.abastecimentos.some(a=>Number(a.veiculoId)===v.id&&Number(a.setorId)===Number(setorId)))
    : state.veiculos.filter(v=>v.ativo!==false);
  setSelectOptions(qs('#fVeiculo'), veicFiltrados.map(v=>({value:v.id,label:`${v.prefixo} · ${v.placa}`})),'Todos');
  setSelectOptions(qs('#fPlaca'),   veicFiltrados.map(v=>({value:v.placa,label:v.placa})),'Todas');
}


function syncSelects() {
  // Tipos de prefixo dinâmicos
  const tpSel=qs('#veiculoPrefixoTipo');
  if(tpSel){
    const cur=tpSel.value;
    tpSel.innerHTML=(state.tiposPrefixo||['Vtr','MP']).map(t=>`<option value="${t}">${t}</option>`).join('');
    if((state.tiposPrefixo||[]).includes(cur)) tpSel.value=cur;
  }
  setSelectOptions(qs('#setorId'),    activeOptionsFrom('setores',s=>s.nome));
  // Prefixo: recarregar sempre que syncSelects for chamado (inclui após cadastro)
  const veiculoIdSel = qs('#veiculoId');
  if (veiculoIdSel) {
    const curVeic = veiculoIdSel.value;
    const veicsAtivos = state.veiculos.filter(v=>v.ativo!==false);
    veiculoIdSel.innerHTML = '<option value="">Selecione</option>' +
      veicsAtivos.map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
    if (veicsAtivos.some(v=>String(v.id)===String(curVeic))) veiculoIdSel.value = curVeic;
  }
  setSelectOptions(qs('#motoristaId'),activeOptionsFrom('motoristas',m=>`${m.nome} · ${m.matricula}`));
  setSelectOptions(qs('#veiculoCombustivel'), activeOptionsFrom('combustiveis',c=>c.nome));
  setSelectOptions(qs('#fSetor'),    activeOptionsFrom('setores',s=>s.nome),'Todos');
  setSelectOptions(qs('#fCombustivel'), activeOptionsFrom('combustiveis',c=>c.nome),'Todos');
  syncFVeiculo(); // popula veículos filtrados por setor
  setSelectOptions(qs('#fPlaca'),    activeOptionsFrom('veiculos',v=>v.placa,v=>v.placa),'Todas');
  setSelectOptions(qs('#fMotorista'),activeOptionsFrom('motoristas',m=>m.nome),'Todos');
  setSelectOptions(qs('#dashAggPlaca'),activeOptionsFrom('veiculos',v=>`${v.prefixo} · ${v.placa}`));
  // Troca de óleo
  setSelectOptions(qs('#trocaOleoVeiculoId'), activeOptionsFrom('veiculos',v=>`${v.prefixo} · ${v.placa}`));
  // Chart agrupamento
  const ca = qs('#chartAgrupamento');
  if (ca) {
    const cur = ca.value;
    ca.innerHTML = '<option value="todos">Todos os veículos</option>' +
      state.veiculos.filter(v=>v.ativo!==false)
        .map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
    if (state.veiculos.some(v=>String(v.id)===String(cur))) ca.value=cur;
  }
  if (!qs('#dashAggPlaca').value && qs('#dashAggPlaca').options.length>1) qs('#dashAggPlaca').selectedIndex=1;
  if (!qs('#fCampoData').value) qs('#fCampoData').value='dataAbastecimento';
  if (!qs('#dashAggCampoData').value) qs('#dashAggCampoData').value='dataAbastecimento';
}

// ═══════════════════════════════════════════════════════════════════
//  NAVEGAÇÃO
// ═══════════════════════════════════════════════════════════════════
const SCREEN_META = {
  dashboard:      ['Gerenciamento de Abastecimento','Controle operacional de abastecimentos, consultas e cadastros.'],
  abastecimentos: ['Gerenciamento de Abastecimento','Lançamento, coordenação e manutenção de registros operacionais.'],
  consulta:       ['Consulta gerencial','Filtros, totais e resultados consolidados.'],
  trocaOleo:      ['Controle de Troca de Óleo','Manutenção preventiva por quilometragem com alertas automáticos.'],
  cadastros:      ['Cadastros','Veículos, motoristas, setores e combustíveis da Guarda Municipal de Ipatinga.'],
  config:         ['Fluxo do sistema','Controles do ambiente e modelo operacional de produção.']
};

function setScreen(screenId) {
  qsa('.screen').forEach(s=>s.classList.toggle('active', s.id===screenId));
  qsa('.menu-item').forEach(b=>b.classList.toggle('active', b.dataset.screen===screenId));
  const [t,sub] = SCREEN_META[screenId]||['',''];
  qs('#screenTitle').textContent = t;
  qs('#screenSubtitle').textContent = sub;
  if(screenId==='consulta') {
    try{ syncComprovantesPrefixoSelect(); }catch(e){}
    setTimeout(()=>{ try{renderComprovantesConsulta();}catch(e){} }, 100);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ABASTECIMENTOS
// ═══════════════════════════════════════════════════════════════════
function updatePrefixoPreview() {
  const tipo = qs('#veiculoPrefixoTipo')?.value||'Vtr';
  const raw  = qs('#veiculoPrefixoNumero')?.value;
  if (qs('#veiculoPrefixo')) qs('#veiculoPrefixo').value = raw ? buildPrefixo(tipo,raw) : '';
}

function updateVehicleInfo() {
  const v = getVeiculo(qs('#veiculoId').value);
  const m = getMotorista(qs('#motoristaId').value);
  qs('#prefixoExibicao').value = v?.prefixo||'';
  setSelectOptions(qs('#placaExibicao'), v?[{value:v.placa,label:v.placa}]:[], v?null:'Selecione o prefixo');
  if (v) qs('#placaExibicao').value = v.placa;
  qs('#combustivelExibicao').value = v ? getCombustivelName(v.combustivelId) : '';
  qs('#matriculaExibicao').value = m?.matricula||'';
  updateValorTotal();
}

function updateValorTotal() {
  qs('#valorTotalExibicao').value = brl(num(qs('#valorUnitario').value)*num(qs('#qtdLitros').value));
}

function limparComprovanteLancamento() {
  const inp = qs('#inputComprovanteLancamento');
  if (inp) inp.value = '';
  const lbl = qs('#comprovanteNomeLancamento');
  if (lbl) lbl.textContent = 'Clique para anexar PDF ou imagem';
  const lblEl = qs('#inputComprovanteLancamento')?.closest('.comprovante-inline')?.querySelector('.comprovante-label-inline');
  if (lblEl) lblEl.classList.remove('has-file');
  const btn = qs('#btnLimparComprovanteLancamento');
  if (btn) btn.style.display = 'none';
}

function clearAbastecimentoForm() {
  qs('#abastecimentoId').value='';
  qs('#formAbastecimento').reset();
  qs('#dataLancamento').value=today();
  qs('#dataAbastecimento').value=today();
  qs('#horaAbastecimento').value='08:00';
  limparComprovanteLancamento();
  qs('#prefixoExibicao').value='';
  setSelectOptions(qs('#placaExibicao'),[],'Selecione o prefixo');
  qs('#combustivelExibicao').value='';
  qs('#matriculaExibicao').value='';
  qs('#valorTotalExibicao').value=brl(0);
}

/**
 * Recalcula e atualiza v.kmAtual com base no maior KM registrado nos abastecimentos
 * do veículo, excluindo opcionalmente um registro (usado ao editar).
 * Isso garante que edições e exclusões sejam refletidas corretamente.
 */
function recalcVeiculoKm(veiculoId, excludeAbastId=null) {
  const v = getVeiculo(veiculoId);
  if (!v) return;
  const registros = state.abastecimentos.filter(a =>
    Number(a.veiculoId) === Number(veiculoId) &&
    (excludeAbastId === null || Number(a.id) !== Number(excludeAbastId))
  );
  // Math.max(...[]) retorna -Infinity — protege com guarda explícita
  v.kmAtual = registros.length ? Math.max(...registros.map(a => num(a.kmAtual))) : 0;
}

function validateAbastecimento(p, editId=null) {
  const v = getVeiculo(p.veiculoId);
  if (!v) return 'Veículo inválido.';
  if (!p.dataLancamento||!p.dataAbastecimento) return 'Informe as datas de lançamento e abastecimento.';
  if (!p.setorId||!p.motoristaId) return 'Preencha setor e motorista.';
  if (!p.inspetorCoordenacao||!p.gerenteAbastecimento) return 'Selecione inspetor em coordenação e gerente.';
  if (p.autorizacao && p.autorizacao.length>6) return 'Autorização deve ter até 6 dígitos.';
  const dup = state.abastecimentos.find(i=>i.autorizacao&&p.autorizacao&&i.autorizacao===p.autorizacao&&Number(i.id)!==Number(editId));
  if (dup) return 'Autorização já cadastrada em outro abastecimento.';

  // Calcula o KM de referência excluindo o próprio registro em edição,
  // assim o valor corrigido não conflita com o valor antigo do mesmo registro.
  const registrosRef = state.abastecimentos.filter(a =>
    Number(a.veiculoId) === Number(p.veiculoId) &&
    (editId === null || Number(a.id) !== Number(editId))
  );
  const kmRef = registrosRef.length ? Math.max(...registrosRef.map(a => num(a.kmAtual))) : 0;

  if (num(p.kmAtual) < kmRef) {
    return `KM informado (${num(p.kmAtual).toLocaleString('pt-BR')}) é menor que o maior KM registrado para este veículo (${kmRef.toLocaleString('pt-BR')}). Verifique o valor ou edite o registro divergente.`;
  }
  if (num(p.valorUnitario)<0||num(p.qtdLitros)<0) return 'Valores não podem ser negativos.';
  return null;
}

function handleAbastecimentoSubmit(e) {
  e.preventDefault();
  const editId = qs('#abastecimentoId').value;
  const _isNewAbast = !editId;
  const p = {
    setorId:num(qs('#setorId').value), veiculoId:num(qs('#veiculoId').value),
    motoristaId:num(qs('#motoristaId').value),
    inspetorCoordenacao:qs('#inspetorCoordenacao').value,
    gerenteAbastecimento:qs('#gerenteAbastecimento').value,
    usuarioId:1,
    dataLancamento:qs('#dataLancamento').value,
    dataAbastecimento:qs('#dataAbastecimento').value,
    horaAbastecimento:qs('#horaAbastecimento').value,
    autorizacao:qs('#autorizacao').value.trim(),
    kmAtual:num(qs('#kmAtual').value),
    valorUnitario:num(qs('#valorUnitario').value),
    qtdLitros:num(qs('#qtdLitros').value),
    valorTotal:+(num(qs('#valorUnitario').value)*num(qs('#qtdLitros').value)).toFixed(2),
    observacao:qs('#observacao').value.trim()
  };
  const err = validateAbastecimento(p, editId||null);
  if (err) { alert(err); return; }
  if (editId) {
    const idx = state.abastecimentos.findIndex(i=>Number(i.id)===Number(editId));
    state.abastecimentos[idx] = {...state.abastecimentos[idx],...p};
  } else {
    state.abastecimentos.push({id:nextId('abastecimentos'),...p,criadoEm:new Date().toISOString()});
  }
  // Recalcula kmAtual do veículo com base em todos os registros (corrige persistência após edição)
  recalcVeiculoKm(p.veiculoId);
  saveStateSync(); syncSelects(); renderAll();
  // Upload comprovante se novo registro e há arquivo selecionado
  (async () => {
    const inp = qs('#inputComprovanteLancamento');
    if (_isNewAbast && inp && inp.files.length) {
      const nId = Math.max(...state.abastecimentos.map(a=>Number(a.id)));
      const f = inp.files[0];
      if (f.size <= 20*1024*1024) {
        const buf = await f.arrayBuffer();
        await dbSalvarComprovante({abastecimentoId:nId,nome:f.name,tipo:f.type,tamanho:f.size,blob:new Blob([buf],{type:f.type})}).catch(()=>{});
      }
    }
    clearAbastecimentoForm();
  })();
}

function editAbastecimento(id) {
  const it = findById('abastecimentos',id); if (!it) return;
  qs('#abastecimentoId').value=it.id;
  qs('#dataLancamento').value=it.dataLancamento||today();
  qs('#dataAbastecimento').value=it.dataAbastecimento||today();
  qs('#horaAbastecimento').value=it.horaAbastecimento;
  qs('#setorId').value=it.setorId;
  qs('#veiculoId').value=it.veiculoId;
  qs('#motoristaId').value=it.motoristaId;
  qs('#inspetorCoordenacao').value=it.inspetorCoordenacao||'';
  qs('#gerenteAbastecimento').value=it.gerenteAbastecimento||'';
  qs('#kmAtual').value=it.kmAtual;
  qs('#autorizacao').value=it.autorizacao||'';
  qs('#valorUnitario').value=it.valorUnitario;
  qs('#qtdLitros').value=it.qtdLitros;
  qs('#observacao').value=it.observacao||'';
  updateVehicleInfo();
  setScreen('abastecimentos');
  window.scrollTo({top:0,behavior:'smooth'});
}

function deleteAbastecimento(id) {
  if (!confirm('Excluir este abastecimento?')) return;
  const abast = findById('abastecimentos', id);
  const veiculoId = abast?.veiculoId;
  state.abastecimentos = state.abastecimentos.filter(i=>Number(i.id)!==Number(id));
  // Recalcula KM do veículo após exclusão para não manter valor fantasma
  if (veiculoId) recalcVeiculoKm(veiculoId);
  saveStateSync();
  dbExcluirComprovantesAbast(Number(id)).catch(()=>{});
  renderAll();
}

function clearAllLancamentos() {
  if (!state.abastecimentos.length) { alert('Não há lançamentos para limpar.'); return; }
  if (!confirm('Confirma a exclusão de todos os lançamentos?')) return;
  state.abastecimentos=[]; saveStateSync(); clearAbastecimentoForm(); renderAll();
  alert('Todos os lançamentos foram removidos.');
}

// ═══════════════════════════════════════════════════════════════════
//  FILTROS / CONSULTA
// ═══════════════════════════════════════════════════════════════════
function resolveRelativeRange(type, qty) {
  const q = Math.max(1,num(qty||1));
  const end = parseIsoDate(today()); let start=parseIsoDate(today()); let label='Período livre';
  if (type==='dias')    { start.setDate(end.getDate()-(q-1)); label=`Últimos ${q} dia(s)`; }
  else if (type==='semanas') { start.setDate(end.getDate()-((q*7)-1)); label=`Últimas ${q} semana(s)`; }
  else if (type==='meses')   { start=new Date(end.getFullYear(),end.getMonth()-q+1,1); label=`Últimos ${q} mês(es)`; }
  else if (type==='anos')    { start=new Date(end.getFullYear()-q+1,0,1); label=`Últimos ${q} ano(s)`; }
  return {start:toIsoDate(start),end:toIsoDate(end),label};
}

function getConsultaFilters() {
  const campoData = qs('#fCampoData').value||'dataAbastecimento';
  const pt=qs('#fPeriodoTipo').value, pv=qs('#fPeriodoValor').value;
  const rel = pt ? resolveRelativeRange(pt,pv||1) : null;
  return {
    id: qs('#fId').value, campoData,
    dataIni: rel?rel.start:(qs('#fDataIni').value||''),
    dataFim: rel?rel.end  :(qs('#fDataFim').value||''),
    periodoLabel: rel?rel.label:'Período livre',
    setorId:qs('#fSetor').value, veiculoId:qs('#fVeiculo').value,
    placa:qs('#fPlaca').value, motoristaId:qs('#fMotorista').value,
    combustivelId:qs('#fCombustivel')?.value||'',
    autorizacao:qs('#fAutorizacao').value.trim(), termoLivre:qs('#fTermoLivre').value.trim()
  };
}

function matchesFreeText(item, termo) {
  if (!termo) return true;
  const blob = normalizeText([item.id,item.autorizacao,item.observacao,
    getSetorName(item.setorId),getVeiculoName(item.veiculoId),getVeiculoPrefixo(item.veiculoId),
    getVehiclePlate(item.veiculoId),getMotoristaName(item.motoristaId),
    item.inspetorCoordenacao,item.gerenteAbastecimento,item.kmAtual,item.valorTotal,item.qtdLitros
  ].join(' '));
  return blob.includes(normalizeText(termo));
}

function getFilteredAbastecimentos(f=getConsultaFilters()) {
  return state.abastecimentos.filter(it => {
    const dt = it[f.campoData]||it.dataAbastecimento;
    if (f.id && Number(it.id)!==Number(f.id)) return false;
    if (f.dataIni && dt<f.dataIni) return false;
    if (f.dataFim && dt>f.dataFim) return false;
    if (f.setorId    && Number(it.setorId)!==Number(f.setorId))       return false;
    if (f.veiculoId  && Number(it.veiculoId)!==Number(f.veiculoId))   return false;
    if (f.placa      && getVehiclePlate(it.veiculoId)!==f.placa)      return false;
    if (f.motoristaId && Number(it.motoristaId)!==Number(f.motoristaId)) return false;
    if (f.combustivelId) {
      const veiculo = getVeiculo(it.veiculoId);
      if (!veiculo || Number(veiculo.combustivelId) !== Number(f.combustivelId)) return false;
    }
    if (f.autorizacao && String(it.autorizacao||'')!==f.autorizacao)  return false;
    if (!matchesFreeText(it, f.termoLivre)) return false;
    return true;
  }).sort((a,b)=>b.id-a.id);
}

function clearConsulta() {
  ['#fId','#fDataIni','#fDataFim','#fAutorizacao','#fPeriodoValor','#fTermoLivre'].forEach(s=>{if(qs(s))qs(s).value='';});
  ['#fSetor','#fVeiculo','#fPlaca','#fMotorista','#fCombustivel'].forEach(s=>{if(qs(s))qs(s).value='';});
  qs('#fCampoData').value='dataAbastecimento'; qs('#fPeriodoTipo').value='';
  syncFVeiculo();
  renderConsulta();
}

// ═══════════════════════════════════════════════════════════════════
//  RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════
function buildFiltrosResumo(f) {
  const L=[]; const cl=f.campoData==='dataLancamento'?'Data de lançamento':'Data de abastecimento';
  if (f.id) L.push(`ID: ${f.id}`);
  if (f.dataIni||f.dataFim) L.push(`${cl}: ${f.dataIni?formatDisplayDate(f.dataIni,false):'início'} até ${f.dataFim?formatDisplayDate(f.dataFim,false):'fim'} (${f.periodoLabel})`);
  else if (f.periodoLabel!=='Período livre') L.push(`Período: ${f.periodoLabel}`);
  if (f.setorId)     L.push(`Setor: ${getSetorName(f.setorId)}`);
  if (f.veiculoId)   L.push(`Veículo: ${getVeiculoPrefixo(f.veiculoId)}`);
  if (f.placa)       L.push(`Placa: ${f.placa}`);
  if (f.motoristaId) L.push(`Motorista: ${getMotoristaName(f.motoristaId)}`);
  if (f.combustivelId) L.push(`Combustível: ${getCombustivelName(f.combustivelId)}`);
  if (f.autorizacao) L.push(`Autorização: ${f.autorizacao}`);
  if (f.termoLivre)  L.push(`Busca livre: "${f.termoLivre}"`);
  return L.length ? L.join(' · ') : 'Todos os registros (sem filtros ativos)';
}

function imprimirRelatorio() {
  const f=getConsultaFilters(), dados=getFilteredAbastecimentos(f);
  if (!dados.length) { alert('Nenhum registro para imprimir.'); return; }
  const totL=dados.reduce((s,i)=>s+num(i.qtdLitros),0);
  const totV=dados.reduce((s,i)=>s+num(i.valorTotal),0);
  const dt=new Date().toLocaleString('pt-BR');
  const rows=dados.map(it=>`<tr>
    <td>${it.id}</td><td>${formatDisplayDate(it.dataLancamento,false)}</td>
    <td>${formatDisplayDate(it.dataAbastecimento,false)}</td><td>${it.horaAbastecimento||''}</td>
    <td>${getSetorName(it.setorId)}</td><td>${getVeiculoPrefixo(it.veiculoId)}</td>
    <td>${getVehiclePlate(it.veiculoId)}</td><td>${getMotoristaName(it.motoristaId)}</td>
    <td>${it.inspetorCoordenacao||''}</td><td>${it.gerenteAbastecimento||''}</td>
    <td>${it.kmAtual||''}</td>
    <td>${getCombustivelName(getVeiculo(it.veiculoId)?.combustivelId||0)}</td>
    <td align="right">${num(it.qtdLitros).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
    <td align="right">${brl(it.valorTotal)}</td><td>${it.autorizacao||''}</td>
  </tr>`).join('');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Relatório Abastecimento GCM Ipatinga</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  .hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:10px}
  .hdr img{height:124px;width:auto;object-fit:contain}.hdr h1{font-size:13px;color:#0e2147;text-transform:uppercase;font-weight:700}
  .hdr h2{font-size:11px;color:#333;margin-top:2px}.hdr p{font-size:9px;color:#666;margin-top:3px}
  .flt{background:#eef2fa;border-left:4px solid #1a3a6b;padding:5px 9px;margin-bottom:10px;font-size:9px}
  .flt b{color:#0e2147}.tots{display:flex;gap:10px;margin-bottom:10px}
  .tot{flex:1;border:1px solid #ccd6eb;border-top:3px solid #1a3a6b;border-radius:4px;padding:5px 8px;text-align:center}
  .tot span{display:block;font-size:8px;color:#666;text-transform:uppercase}.tot strong{display:block;font-size:13px;color:#0e2147;margin-top:1px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:8.5px}
  thead tr{background:#0e2147}thead th{padding:5px 4px;color:#fff;text-align:left;font-weight:700;text-transform:uppercase;white-space:nowrap}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:4px;border-bottom:1px solid #e0e6f0}
  tfoot tr{background:#dce8f8;font-weight:700}tfoot td{padding:5px 4px;border-top:2px solid #0e2147}
  .foot{margin-top:12px;border-top:1px solid #ccd6eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#888}
  @media print{@page{margin:1cm;size:A4 landscape}}</style></head><body>
  <div class="hdr"><img src="./assets/brasao-gcm.png" onerror="this.style.display='none'"/>
  <div><h1>Prefeitura Municipal de Ipatinga — Guarda Civil Municipal</h1>
  <h2>Relatório de Controle de Abastecimento de Viaturas</h2><p>Emitido em: ${dt}</p></div></div>
  <div class="flt"><b>Filtros:</b> ${buildFiltrosResumo(f)}</div>
  <div class="tots">
    <div class="tot"><span>Registros</span><strong>${dados.length}</strong></div>
    <div class="tot"><span>Total litros</span><strong>${totL.toLocaleString('pt-BR',{minimumFractionDigits:2})} L</strong></div>
    <div class="tot"><span>Valor total</span><strong>${brl(totV)}</strong></div>
    <div class="tot"><span>Ticket médio</span><strong>${dados.length?brl(totV/dados.length):brl(0)}</strong></div>
  </div>
  <table><thead><tr><th>ID</th><th>Lançamento</th><th>Abastecimento</th><th>Hora</th><th>Setor</th>
  <th>Prefixo</th><th>Placa</th><th>Motorista</th><th>Inspetor</th><th>Gerente</th>
  <th>KM</th><th>Combustível</th><th>Litros</th><th>Valor</th><th>Autorização</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="12" style="text-align:right">TOTAIS →</td>
  <td align="right">${totL.toLocaleString('pt-BR',{minimumFractionDigits:2})} L</td>
  <td align="right">${brl(totV)}</td><td></td></tr></tfoot></table>
  <div class="foot"><span>Guarda Civil Municipal de Ipatinga</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=1150,height=780');
  if (!win) { alert('Permita pop-ups para imprimir.'); return; }
  win.document.write(html); win.document.close();
}

function exportarCsv() {
  const f=getConsultaFilters(), dados=getFilteredAbastecimentos(f);
  if (!dados.length) { alert('Nenhum registro para exportar.'); return; }
  const esc=v=>{const s=String(v===null||v===undefined?'':v);return(s.includes(';')||s.includes('"')||s.includes('\n'))?`"${s.replace(/"/g,'""')}"`:(s);};
  const hdr=['ID','Data Lançamento','Data Abastecimento','Hora','Setor','Prefixo','Placa','Motorista','Inspetor','Gerente','KM','Combustível','Litros','Valor Total','Valor Unitário','Autorização','Observação'];
  const rows=dados.map(it=>[it.id,formatDisplayDate(it.dataLancamento,false),formatDisplayDate(it.dataAbastecimento,false),
    it.horaAbastecimento||'',getSetorName(it.setorId),getVeiculoPrefixo(it.veiculoId),getVehiclePlate(it.veiculoId),
    getMotoristaName(it.motoristaId),it.inspetorCoordenacao||'',it.gerenteAbastecimento||'',it.kmAtual||'',
    getCombustivelName(getVeiculo(it.veiculoId)?.combustivelId||0),
    num(it.qtdLitros).toFixed(2).replace('.',','),num(it.valorTotal).toFixed(2).replace('.',','),
    num(it.valorUnitario).toFixed(2).replace('.',','),it.autorizacao||'',it.observacao||''
  ].map(esc).join(';'));
  const csv='\uFEFF'+[hdr.join(';'),...rows].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`relatorio-abastecimento-gcmi-${today().replace(/-/g,'')}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
//  TROCA DE ÓLEO
// ═══════════════════════════════════════════════════════════════════
function downloadBlob(blob, filename) {
  if (window.navigator?.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

// Blocos divisíveis por 3 mantêm a concatenação base64 válida.
async function attachmentJsonBlob(doc) {
  if (!(doc.blob instanceof Blob) && !(doc.blob instanceof ArrayBuffer) && !ArrayBuffer.isView(doc.blob)) {
    throw new Error('Comprovante inválido: ' + (doc.nome || doc.id));
  }
  const blob = doc.blob instanceof Blob ? doc.blob : new Blob([doc.blob]);
  const metadata = {id:doc.id, abastecimentoId:doc.abastecimentoId||null,
    trocaOleoId:doc.trocaOleoId||null, nome:doc.nome, tipo:doc.tipo||blob.type||'application/octet-stream',
    tamanho:blob.size, data:doc.data||''};
  const parts=[JSON.stringify(metadata).slice(0,-1)+',"b64":"'];
  const size=3*256*1024;
  for(let offset=0;offset<blob.size;offset+=size){
    const bytes=new Uint8Array(await blob.slice(offset,offset+size).arrayBuffer());
    const chars=[];
    for(let i=0;i<bytes.length;i+=8192) chars.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
    parts.push(new Blob([btoa(chars.join(''))]));
  }
  parts.push('"}');
  return new Blob(parts);
}

async function buildBackupBlob(snapshot, keys, readDoc) {
  const parts=['{'];
  let first=true;
  for(const [key,value] of Object.entries(snapshot)) {
    if(key.startsWith('_')) continue;
    if(!first) parts.push(','); first=false;
    parts.push(JSON.stringify(key)+':');
    if(Array.isArray(value)) {
      parts.push('[');
      value.forEach((item,i)=>{if(i)parts.push(',');parts.push(new Blob([JSON.stringify(item)]));});
      parts.push(']');
    } else parts.push(JSON.stringify(value));
  }
  if(!first)parts.push(',');
  parts.push('"_meta":'+JSON.stringify({sistema:'Gerenciamento de Abastecimento GCMI',versao:'2026.1',
    exportadoEm:new Date().toISOString(),totalComprovantes:keys.length})+',"_comprovantes":[');
  for(let i=0;i<keys.length;i++) {
    const doc=await readDoc(keys[i]);
    if(!doc)throw new Error('Comprovante não encontrado: '+keys[i]);
    if(i)parts.push(',');
    parts.push(await attachmentJsonBlob(doc));
  }
  parts.push(']}');
  return new Blob(parts,{type:'application/json;charset=utf-8'});
}

async function exportJson() {
  const btn=qs('#btnExportar');
  if(btn?.disabled)return;
  try {
    if(btn){btn.disabled=true;btn.textContent='Exportando...';}
    setImportStatus('Salvando e preparando backup completo...','info');
    await saveState();
    const snapshot=clone(state);
    const keys=await idbGetAllKeys('comprovantes');
    const blob=await buildBackupBlob(snapshot,keys,key=>idbGet('comprovantes',key));
    downloadBlob(blob,'gcm-abastecimentosgcmi2026-'+today().replace(/-/g,'')+'.json');
    setImportStatus('Download iniciado: '+snapshot.abastecimentos.length+' lançamento(s), '+keys.length+' comprovante(s).','success');
  } catch(e) {
    setImportStatus('Backup não concluído: '+e.message,'error');
    alert('Não foi possível exportar o backup completo. '+e.message);
  } finally {
    if(btn){btn.disabled=false;btn.textContent='⬇ Exportar JSON';}
  }
}

async function salvarDadosManual() {
  const btn=qs('#btnSalvarDados');
  try {
    if(btn) { btn.disabled=true; btn.textContent='Salvando...'; }
    setImportStatus('Salvando dados...','info');
    await saveState();
    dbUsageInfo().then(info => {
      const el=qs('#dbUsageInfo');
      if(el) el.textContent=`IndexedDB: ${info.used} usados de ${info.quota} disponíveis (${info.pct}%)`;
    }).catch(()=>{});
    setImportStatus(`Dados salvos com sucesso em ${new Date().toLocaleString('pt-BR')}.`,'success');
  } catch(e) {
    const msg=e instanceof Error?e.message:'Falha ao salvar dados.';
    setImportStatus(`Falha no salvamento: ${msg}`,'error');
    alert(`Não foi possível salvar. ${msg}`);
  } finally {
    if(btn) { btn.disabled=false; btn.textContent='Salvar dados'; }
  }
}

function calcCustoTotalOleo() {
  const vl=num(qs('#trocaOleoValorLitro')?.value||0);
  const qt=num(qs('#trocaOleoQtdLitros')?.value||0);
  const el=qs('#trocaOleoCustoTotal');
  if (el) el.value=(vl&&qt)?brl(vl*qt):'';
}

function calcProximaKm() {
  const km=num(qs('#trocaOleoKm').value), iv=num(qs('#trocaOleoIntervalo').value);
  qs('#trocaOleoProximaKm').value = (km&&iv) ? `${(km+iv).toLocaleString('pt-BR')} km` : '';
}

function clearTrocaOleoForm() {
  qs('#trocaOleoId').value=''; qs('#formTrocaOleo').reset();
  qs('#trocaOleoData').value=today();
  qs('#trocaOleoIntervalo').value=5000;
  qs('#trocaOleoProximaKm').value='';
  if(qs('#trocaOleoTipoOleo')) qs('#trocaOleoTipoOleo').value='';
  if(qs('#trocaOleoValorLitro')) qs('#trocaOleoValorLitro').value='';
  if(qs('#trocaOleoQtdLitros')) qs('#trocaOleoQtdLitros').value='';
  if(qs('#trocaOleoCustoTotal')) qs('#trocaOleoCustoTotal').value='';
}

function handleTrocaOleoSubmit(e) {
  e.preventDefault();
  const editId=qs('#trocaOleoId').value;
  const veiculoId=num(qs('#trocaOleoVeiculoId').value);
  if (!veiculoId) { alert('Selecione o veículo.'); return; }
  const dataRaw=qs('#trocaOleoData').value;
  const data=dataRaw; // type=date entrega yyyy-mm-dd diretamente
  if (!data) { alert('Informe a data da troca.'); return; }
  const km=num(qs('#trocaOleoKm').value);
  const intervalo=num(qs('#trocaOleoIntervalo').value);
  const payload={veiculoId,data,km,intervalo,proximaKm:km+intervalo,
    tipoOleo:qs('#trocaOleoTipoOleo').value||'',
    valorLitro:num(qs('#trocaOleoValorLitro').value)||0,
    qtdLitros:num(qs('#trocaOleoQtdLitros').value)||0,
    custoTotal:+(num(qs('#trocaOleoValorLitro').value)*num(qs('#trocaOleoQtdLitros').value)).toFixed(2),
    obs:qs('#trocaOleoObs').value.trim()};
  if (editId) {
    const idx=state.trocasOleo.findIndex(i=>Number(i.id)===Number(editId));
    state.trocasOleo[idx]={...state.trocasOleo[idx],...payload};
  } else {
    state.trocasOleo.push({id:nextId('trocasOleo'),...payload,criadoEm:new Date().toISOString()});
  }
  saveStateSync(); clearTrocaOleoForm(); renderTrocaOleo(); renderDashboard();
  alert('Troca de óleo registrada com sucesso!');
}

function editTrocaOleo(id) {
  const it=findById('trocasOleo',id); if (!it) return;
  qs('#trocaOleoId').value=it.id;
  qs('#trocaOleoVeiculoId').value=it.veiculoId;
  qs('#trocaOleoData').value=it.data; // type=date aceita yyyy-mm-dd
  qs('#trocaOleoKm').value=it.km;
  qs('#trocaOleoIntervalo').value=it.intervalo;
  qs('#trocaOleoTipoOleo').value=it.tipoOleo||'';
  qs('#trocaOleoValorLitro').value=it.valorLitro||'';
  qs('#trocaOleoQtdLitros').value=it.qtdLitros||'';
  if(qs('#trocaOleoCustoTotal')) qs('#trocaOleoCustoTotal').value=it.custoTotal?brl(it.custoTotal):'';
  qs('#trocaOleoObs').value=it.obs||'';
  calcProximaKm();
  setScreen('trocaOleo'); window.scrollTo({top:0,behavior:'smooth'});
}

function deleteTrocaOleo(id) {
  if (!confirm('Excluir este registro de troca de óleo?')) return;
  state.trocasOleo=state.trocasOleo.filter(i=>Number(i.id)!==Number(id));
  saveStateSync(); renderTrocaOleo(); renderDashboard();
}

function getTrocaStatus(veiculoId) {
  const v=getVeiculo(veiculoId); if (!v) return null;
  const trocas=(state.trocasOleo||[]).filter(t=>Number(t.veiculoId)===Number(veiculoId)).sort((a,b)=>b.km-a.km);
  if (!trocas.length) return {status:'sem',v,ultima:null,proxima:null,kmAtual:v.kmAtual,pct:0,falta:null};
  const ultima=trocas[0];
  const kmAtual=v.kmAtual;
  const falta=ultima.proximaKm-kmAtual;
  const percorrido=kmAtual-ultima.km;
  const pct=Math.min(100,Math.round(percorrido/ultima.intervalo*100));
  const status=falta<=0?'vencido':falta<=500?'proximo':'ok';
  return {status,v,ultima,proxima:ultima.proximaKm,kmAtual,falta,pct};
}

function renderTrocaOleoCards() {
  const wrap=qs('#trocaOleoCards'); if (!wrap) return;
  wrap.innerHTML=state.veiculos.filter(v=>v.ativo!==false).map(v=>{
    const s=getTrocaStatus(v.id); if (!s) return '';
    const lbl={vencido:'⚠️ VENCIDA',proximo:'⚡ PRÓXIMA',ok:'✅ OK',sem:'Sem registro'}[s.status];
    const fillCls=s.status==='sem'?'fill-ok':`fill-${s.status}`;
    return `<div class="to-card ${s.status}" onclick="abrirModalTrocaOleo(${v.id})" title="Ver histórico completo">
      <div class="to-card-title">${s.v.prefixo}</div>
      <div class="to-card-placa">${s.v.placa}</div>
      ${s.ultima?`
        <div class="to-card-row"><span>Última troca</span><strong>${s.ultima.km.toLocaleString('pt-BR')} km</strong></div>
        <div class="to-card-row"><span>KM atual</span><strong>${s.kmAtual.toLocaleString('pt-BR')} km</strong></div>
        <div class="to-card-row"><span>Próxima troca</span><strong>${s.proxima.toLocaleString('pt-BR')} km</strong></div>
        <div class="to-card-row"><span>${s.falta>=0?'Faltam':'Excedeu'}</span><strong>${Math.abs(s.falta).toLocaleString('pt-BR')} km</strong></div>
        <div class="to-km-bar"><div class="to-km-fill ${fillCls}" style="width:${s.pct}%"></div></div>
      `:`<div style="font-size:12px;opacity:.45;margin-top:8px">Nenhuma troca registrada</div>`}
      <span class="to-card-status ${s.status}">${lbl}</span>
    </div>`;
  }).join('');
}

function renderTrocaOleoTabela() {
  const tbody=qs('#trocaOleoTabela'); if (!tbody) return;
  const ord=[...(state.trocasOleo||[])].sort((a,b)=>b.id-a.id);
  tbody.innerHTML=ord.length?ord.map(it=>`<tr>
    <td>${it.id}</td><td>${getVeiculoPrefixo(it.veiculoId)}</td><td>${getVehiclePlate(it.veiculoId)}</td>
    <td>${formatDisplayDate(it.data,false)}</td>
    <td>${num(it.km).toLocaleString('pt-BR')}</td><td>${num(it.intervalo).toLocaleString('pt-BR')}</td>
    <td>${num(it.proximaKm).toLocaleString('pt-BR')}</td>
    <td>${it.tipoOleo||'-'}</td>
    <td>${it.qtdLitros?num(it.qtdLitros).toLocaleString('pt-BR')+' L':'-'}</td>
    <td>${it.valorLitro?brl(it.valorLitro)+'/L':'-'}</td>
    <td>${it.custoTotal?brl(it.custoTotal):'-'}</td>
    <td>${it.obs||''}</td>
    <td><div class="row-actions">
      <button class="icon-btn edit" data-action="edit-trocaOleo" data-id="${it.id}">Editar</button>
      <button class="icon-btn delete" data-action="delete-trocaOleo" data-id="${it.id}">Excluir</button>
    </div></td>
  </tr>`).join(''):'<tr><td colspan="13">Nenhuma troca registrada.</td></tr>';
}

function renderTrocaOleo() { renderTrocaOleoCards(); renderTrocaOleoTabela(); }

function renderAlertasOleo() {
  // Alertas inline (abaixo dos cards) — mantido apenas para referência, agora principal é o card
  const wrap=qs('#dashAlertasOleo'); if (!wrap) return;
  const vencidos=state.veiculos.filter(v=>v.ativo!==false)
    .map(v=>getTrocaStatus(v.id)).filter(s=>s&&s.status==='vencido');
  wrap.innerHTML=''; // limpar; alertas agora são exibidos no card #5

  // Atualizar card de alerta
  const cardAlerta=qs('#dashCardAlerta');
  const textoAlerta=qs('#dashAlertaTexto');
  if (cardAlerta&&textoAlerta) {
    if (vencidos.length>0) {
      cardAlerta.style.display='';
      textoAlerta.textContent=vencidos.length===1
        ? vencidos[0].v.prefixo
        : `${vencidos.length} viaturas`;
    } else {
      cardAlerta.style.display='none';
    }
  }
}

function abrirModalAlertasVencidos() {
  const vencidos=state.veiculos.filter(v=>v.ativo!==false)
    .map(v=>getTrocaStatus(v.id)).filter(s=>s&&s.status==='vencido');
  const rows=vencidos.map(s=>`
    <div class="modal-status-bar vencido" style="margin-bottom:8px">
      <div style="flex:1">
        <strong>${s.v.prefixo} · ${s.v.placa}</strong>
        <span style="display:block;font-size:11px;margin-top:3px">
          KM atual: ${s.kmAtual.toLocaleString('pt-BR')} · 
          Próxima troca prevista: ${s.proxima?.toLocaleString('pt-BR')} km · 
          Excedeu: ${Math.abs(s.falta).toLocaleString('pt-BR')} km
        </span>
        ${s.ultima?`<span style="display:block;font-size:11px;opacity:.7">Última troca: ${formatDisplayDate(s.ultima.data,false)} com ${num(s.ultima.km).toLocaleString('pt-BR')} km</span>`:''}
      </div>
      <button class="btn" onclick="fecharModalAlertasVencidos();setScreen('trocaOleo')" style="margin-left:12px;padding:5px 12px;font-size:12px;background:rgba(200,50,50,.2);color:#ffaaaa;border:1px solid rgba(200,50,50,.4);border-radius:8px;cursor:pointer">Ver</button>
    </div>`).join('');
  qs('#modalAlertasVencidosConteudo').innerHTML=vencidos.length
    ? rows
    : '<p style="text-align:center;color:rgba(243,232,198,.45);padding:20px">Nenhuma troca vencida no momento.</p>';
  qs('#modalAlertasVencidos').classList.add('open');
}

function fecharModalAlertasVencidos() {
  qs('#modalAlertasVencidos').classList.remove('open');
}

function imprimirModalAlertasVencidos() {
  const vencidos=state.veiculos.filter(v=>v.ativo!==false)
    .map(v=>getTrocaStatus(v.id)).filter(s=>s&&s.status==='vencido');
  const dt=new Date().toLocaleString('pt-BR');
  const rows=vencidos.map(s=>`<tr style="background:#fff2f2">
    <td>${s.v.prefixo}</td><td>${s.v.placa}</td>
    <td>${s.ultima?formatDisplayDate(s.ultima.data,false):'—'}</td>
    <td>${s.kmAtual.toLocaleString('pt-BR')}</td>
    <td>${s.proxima?.toLocaleString('pt-BR')||'—'}</td>
    <td style="color:#c00;font-weight:700">${Math.abs(s.falta).toLocaleString('pt-BR')} km</td>
  </tr>`).join('');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Alertas Troca de Óleo</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  h1{font-size:13px;color:#8b1c1c;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead tr{background:#8b1c1c}thead th{padding:6px;color:#fff;font-weight:700;text-align:left}
  tbody td{padding:5px;border-bottom:1px solid #eee}
  .foot{margin-top:12px;font-size:8px;color:#888}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <h1>⚠️ ALERTA — Trocas de Óleo Vencidas · ${dt}</h1>
  <table><thead><tr><th>Prefixo</th><th>Placa</th><th>Última troca</th><th>KM atual</th><th>KM prevista</th><th>Excedeu</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6">Nenhuma irregularidade.</td></tr>'}</tbody></table>
  <div class="foot">Guarda Civil Municipal de Ipatinga · ${dt}</div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=900,height=600');
  if (!win){alert('Permita pop-ups.');return;}
  win.document.write(html);win.document.close();
}

function imprimirTrocaOleo() {
  const dt=new Date().toLocaleString('pt-BR');
  const rows=state.veiculos.filter(v=>v.ativo!==false).map(v=>{
    const s=getTrocaStatus(v.id);
    if (!s||!s.ultima) return `<tr><td>${v.prefixo}</td><td>${v.placa}</td><td colspan="5" style="color:#888">Sem registro</td></tr>`;
    const lbl={vencido:'⚠️ VENCIDA',proximo:'⚡ PRÓXIMA',ok:'✅ OK'}[s.status]||'OK';
    return `<tr><td>${v.prefixo}</td><td>${v.placa}</td>
      <td>${formatDisplayDate(s.ultima.data,false)}</td>
      <td>${s.ultima.km.toLocaleString('pt-BR')}</td>
      <td>${s.kmAtual.toLocaleString('pt-BR')}</td>
      <td>${s.proxima.toLocaleString('pt-BR')}</td>
      <td>${lbl}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Troca de Óleo GCM Ipatinga</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  .hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:12px}
  .hdr img{height:124px;width:auto;object-fit:contain}.hdr h1{font-size:13px;color:#0e2147;font-weight:700;text-transform:uppercase}
  .hdr h2{font-size:11px;color:#333;margin-top:2px}.hdr p{font-size:9px;color:#666;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead tr{background:#0e2147}thead th{padding:6px 5px;color:#fff;font-weight:700;text-transform:uppercase}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:5px;border-bottom:1px solid #e0e6f0}
  .foot{margin-top:12px;border-top:1px solid #ccd6eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#888}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <div class="hdr"><img src="./assets/brasao-gcm.png" onerror="this.style.display='none'"/>
  <div><h1>Prefeitura Municipal de Ipatinga — Guarda Civil Municipal</h1>
  <h2>Relatório de Controle de Troca de Óleo de Viaturas</h2><p>Emitido em: ${dt}</p></div></div>
  <table><thead><tr><th>Prefixo</th><th>Placa</th><th>Última troca</th><th>KM troca</th><th>KM atual</th><th>Próxima (KM)</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="foot"><span>Guarda Civil Municipal de Ipatinga</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=900,height=650');
  if (!win) { alert('Permita pop-ups para imprimir.'); return; }
  win.document.write(html); win.document.close();
}

// ═══════════════════════════════════════════════════════════════════
//  GRÁFICO TROCA DE ÓLEO
// ═══════════════════════════════════════════════════════════════════
let _cOleo=null, _cOleoPi=null, _cOleoPreco=null;

function getNMonths(n) {
  const months=[]; const now=new Date();
  for (let i=n-1;i>=0;i--) {
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({
      label:`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
      iso:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    });
  }
  return months;
}

function renderGraficoOleo() {
  if (typeof Chart==='undefined') return;
  const veicSel=qs('#oilChartVeiculo')?.value||'todos';
  const nMeses=Number(qs('#oilChartPeriodo')?.value||12);
  const metrica=qs('#oilChartMetrica')?.value||'custo';
  const months=getNMonths(nMeses);
  const veiculoIds=veicSel==='todos'?state.veiculos.filter(v=>v.ativo!==false).map(v=>v.id):[Number(veicSel)];
  const gc='rgba(214,156,56,.12)', tc='rgba(243,232,198,.5)';

  const getData=(m)=>{
    const its=(state.trocasOleo||[]).filter(t=>veiculoIds.includes(num(t.veiculoId))&&(t.data||'').startsWith(m.iso));
    return {
      custo:its.reduce((s,i)=>s+num(i.custoTotal),0),
      litros:its.reduce((s,i)=>s+num(i.qtdLitros),0),
      qtd:its.length
    };
  };
  const data12m=months.map(getData);
  const valores=data12m.map(d=>d[metrica]);
  const labels=months.map(m=>m.label);
  const tcb=(ctx)=>{const v=ctx.parsed.y;if(metrica==='custo')return ` ${brl(v)}`;if(metrica==='litros')return ` ${v.toLocaleString('pt-BR')} L`;return ` ${v}`;};

  if(_cOleo){_cOleo.destroy();_cOleo=null;}
  const ctx1=qs('#chartOleoPrincipal')?.getContext('2d');
  if(ctx1) _cOleo=new Chart(ctx1,{type:'bar',data:{labels,datasets:[{label:'',data:valores,backgroundColor:labels.map((_,i)=>CHART_COLORS[i%6]),borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:tcb}}},scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,font:{size:9}},grid:{color:gc}}}}});

  if(_cOleoPi){_cOleoPi.destroy();_cOleoPi=null;}
  const ctx2=qs('#chartOleoPizza')?.getContext('2d');
  if(ctx2){
    const vl=state.veiculos.filter(v=>v.ativo!==false&&veiculoIds.includes(v.id));
    const pd=vl.map(v=>(state.trocasOleo||[]).filter(t=>Number(t.veiculoId)===v.id&&months.some(m=>(t.data||'').startsWith(m.iso))).reduce((s,i)=>s+num(i.custoTotal),0));
    _cOleoPi=new Chart(ctx2,{type:'doughnut',data:{labels:vl.map(v=>v.prefixo),datasets:[{data:pd,backgroundColor:CHART_COLORS,borderWidth:1,borderColor:'rgba(0,0,0,.3)'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:tc,font:{size:11},boxWidth:12}},tooltip:{callbacks:{label:ctx=>` ${brl(ctx.parsed)}`}}}}});
  }

  if(_cOleoPreco){_cOleoPreco.destroy();_cOleoPreco=null;}
  const ctx3=qs('#chartOleoPreco')?.getContext('2d');
  if(ctx3){
    const pr=months.map(m=>{
      const its=(state.trocasOleo||[]).filter(t=>veiculoIds.includes(num(t.veiculoId))&&(t.data||'').startsWith(m.iso)&&num(t.qtdLitros)>0);
      const tC=its.reduce((s,i)=>s+num(i.custoTotal),0),tL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
      return tL>0?+(tC/tL).toFixed(3):null;
    });
    _cOleoPreco=new Chart(ctx3,{type:'line',data:{labels,datasets:[{label:'R$/L',data:pr,borderColor:'rgba(78,207,126,.9)',backgroundColor:'rgba(78,207,126,.1)',borderWidth:2,fill:true,tension:.35,pointRadius:4,pointBackgroundColor:'#4ecf7e',spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y!=null?` R$ ${ctx.parsed.y.toLocaleString('pt-BR',{minimumFractionDigits:3})}/L`:' sem dados'}}},scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,font:{size:9}},grid:{color:gc}}}}});
  }
}

function abrirModalGraficoOleo() {
  const modal=qs('#modalGraficoOleo'); if (!modal) return;
  const ca=qs('#oilChartVeiculo');
  if(ca){
    const cur=ca.value;
    ca.innerHTML='<option value="todos">Todos os veículos</option>'+
      state.veiculos.filter(v=>v.ativo!==false).map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
    if(state.veiculos.some(v=>String(v.id)===String(cur))) ca.value=cur;
  }
  modal.classList.add('open');
  setTimeout(renderGraficoOleo,80);
}

function fecharModalGraficoOleo() { qs('#modalGraficoOleo')?.classList.remove('open'); }

function imprimirGraficoOleo() {
  const veicSel=qs('#oilChartVeiculo')?.value||'todos';
  const nMeses=Number(qs('#oilChartPeriodo')?.value||12);
  const months=getNMonths(nMeses);
  const veiculoIds=veicSel==='todos'?state.veiculos.filter(v=>v.ativo!==false).map(v=>v.id):[Number(veicSel)];
  const dt=new Date().toLocaleString('pt-BR');

  // Totais por veículo
  const vl=state.veiculos.filter(v=>v.ativo!==false&&veiculoIds.includes(v.id));
  const rowsVtr=vl.map(v=>{
    const its=(state.trocasOleo||[]).filter(t=>Number(t.veiculoId)===v.id&&months.some(m=>(t.data||'').startsWith(m.iso)));
    const totCusto=its.reduce((s,i)=>s+num(i.custoTotal),0);
    const totLitros=its.reduce((s,i)=>s+num(i.qtdLitros),0);
    const qtd=its.length;
    return `<tr><td>${v.prefixo}</td><td>${v.placa}</td><td>${qtd}</td><td>${totLitros.toLocaleString('pt-BR')} L</td><td>${brl(totCusto)}</td></tr>`;
  }).join('');

  // Trocas parciais
  const trocas=(state.trocasOleo||[]).filter(t=>veiculoIds.includes(num(t.veiculoId))&&months.some(m=>(t.data||'').startsWith(m.iso))).sort((a,b)=>b.id-a.id);
  const rowsTrocas=trocas.map(t=>`<tr>
    <td>${formatDisplayDate(t.data,false)}</td>
    <td>${getVeiculoPrefixo(t.veiculoId)}</td>
    <td>${getVehiclePlate(t.veiculoId)}</td>
    <td>${t.tipoOleo||'-'}</td>
    <td>${num(t.qtdLitros).toLocaleString('pt-BR')} L</td>
    <td>${brl(t.valorLitro)}/L</td>
    <td>${brl(t.custoTotal)}</td>
  </tr>`).join('');

  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Relatório Troca de Óleo</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  h1{font-size:13px;color:#0e2147;font-weight:700;border-bottom:3px solid #0e2147;padding-bottom:8px;margin-bottom:12px}
  h2{font-size:11px;color:#0e2147;margin:12px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:14px}
  thead tr{background:#0e2147}thead th{padding:5px;color:#fff;font-weight:700;text-align:left}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:4px 5px;border-bottom:1px solid #eee}
  .foot{margin-top:10px;font-size:8px;color:#888;border-top:1px solid #ccc;padding-top:6px}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <h1>Relatório de Troca de Óleo — GCM Ipatinga · ${dt}</h1>
  <h2>Totais por Viatura (últimos ${nMeses} meses)</h2>
  <table><thead><tr><th>Prefixo</th><th>Placa</th><th>Nº trocas</th><th>Litros total</th><th>Custo total</th></tr></thead>
  <tbody>${rowsVtr||'<tr><td colspan="5">Sem dados.</td></tr>'}</tbody></table>
  <h2>Trocas Parciais (detalhado)</h2>
  <table><thead><tr><th>Data</th><th>Prefixo</th><th>Placa</th><th>Tipo óleo</th><th>Litros</th><th>Valor/L</th><th>Custo total</th></tr></thead>
  <tbody>${rowsTrocas||'<tr><td colspan="7">Sem dados.</td></tr>'}</tbody></table>
  <div class="foot">Guarda Civil Municipal de Ipatinga · ${dt}</div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=1100,height=700');
  if(!win){alert('Permita pop-ups.');return;}
  win.document.write(html);win.document.close();
}


// ═══════════════════════════════════════════════════════════════════
//  GRÁFICOS (modal)
// ═══════════════════════════════════════════════════════════════════
let _cP=null,_cPi=null,_cPr=null,_cSubAmp=null;
let _subGraficoAtual=null;
const CHART_COLORS=['rgba(241,197,103,.85)','rgba(26,107,56,.85)','rgba(37,92,243,.85)','rgba(209,67,67,.85)','rgba(120,80,200,.85)','rgba(20,150,150,.85)'];

// Nomes curtos dos meses em pt-BR
const MESES_CURTOS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Estado do navegador de ano no gráfico
let _chartAno = new Date().getFullYear();

function getMonthsForYear(ano) {
  const months=[];
  for(let m=0;m<12;m++){
    months.push({
      label: MESES_CURTOS[m],
      iso: `${ano}-${String(m+1).padStart(2,'0')}`,
      mes: m, ano
    });
  }
  return months;
}

function get12Months() {
  // legado — retorna meses do ano corrente do navegador de gráfico
  return getMonthsForYear(_chartAno);
}

// ── Plugins Chart.js: halos pulsantes + drop lines verticais ──────
const haloPulsePlugin = {
  id:'haloPulse',
  afterDraw(chart){
    const c2=chart.ctx;
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      if(meta.type!=='line') return;
      meta.data.forEach((pt,i)=>{
        if(ds.data[i]==null) return;
        const t=Date.now()/800;
        const pulse=0.5+0.5*Math.sin(t+i*0.8);
        const r=pt.options.radius*(1.8+pulse*1.2);
        c2.save();c2.beginPath();c2.arc(pt.x,pt.y,r,0,2*Math.PI);
        c2.fillStyle=`rgba(241,197,103,${0.08+pulse*0.1})`;
        c2.fill();c2.restore();
      });
    });
    chart._hPraf&&cancelAnimationFrame(chart._hPraf);
    chart._hPraf=requestAnimationFrame(()=>{if(chart.canvas?.isConnected)chart.draw();});
  }
};
const droplinePlugin = {
  id:'droplines',
  afterDatasetsDraw(chart){
    const c2=chart.ctx;
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      if(meta.type!=='line') return;
      const bottom=chart.scales.y?.bottom||0;
      meta.data.forEach((pt,i)=>{
        if(ds.data[i]==null) return;
        c2.save();c2.setLineDash([3,5]);
        c2.strokeStyle='rgba(214,156,56,.15)';c2.lineWidth=1;
        c2.beginPath();c2.moveTo(pt.x,pt.y);c2.lineTo(pt.x,bottom);
        c2.stroke();c2.restore();
      });
    });
  }
};
if(typeof Chart!=='undefined'){
  if(!Chart.registry.plugins.get('haloPulse'))  Chart.register(haloPulsePlugin);
  if(!Chart.registry.plugins.get('droplines'))  Chart.register(droplinePlugin);
}

function buildLineDs(label,data,color,fill){
  return{label,data,borderColor:color,backgroundColor:fill,borderWidth:3,fill:true,
    tension:0.45,pointBackgroundColor:color,pointBorderColor:'#0a1624',pointBorderWidth:2,
    pointRadius:6,pointHoverRadius:9,pointHoverBackgroundColor:color,
    pointHoverBorderColor:'#fff',pointHoverBorderWidth:2,spanGaps:true};
}
function chartScaleOpts(tc,gc,yLabel){
  return{
    x:{ticks:{color:tc,font:{size:10},maxRotation:45},grid:{color:gc},border:{color:'rgba(214,156,56,.2)'}},
    y:{ticks:{color:tc,font:{size:10},count:6},grid:{color:gc,borderDash:[4,4]},
      border:{color:'rgba(214,156,56,.2)',dash:[4,4]},
      title:{display:!!yLabel,text:yLabel,color:tc,font:{size:10}}}
  };
}

// ══════════════════════════════════════════════════════
//  Estado de seleção de VTRs no gráfico
// ══════════════════════════════════════════════════════
let _chartVtrSelecionadas = new Set(); // ids; vazio = todas

function renderVtrSelector() {
  const wrap = qs('#chartVtrSelector'); if(!wrap) return;
  const veics = state.veiculos.filter(v=>v.ativo!==false);
  const todos = _chartVtrSelecionadas.size === 0;

  wrap.innerHTML = `<button class="vtr-toggle-all" id="btnVtrTodos"
    onclick="toggleTodosVtr()">✦ Todas</button>` +
    veics.map((v,ci)=>{
      const cor = VTR_COLORS[ci%VTR_COLORS.length].replace('.9)',',.9)');
      const bdr = VTR_COLORS[ci%VTR_COLORS.length];
      const ativo = todos || _chartVtrSelecionadas.has(v.id);
      return `<button class="vtr-toggle ${ativo?'':'off'}"
        style="background:${ativo?VTR_FILLS[ci%VTR_FILLS.length]:''}; border-color:${ativo?bdr:''}; color:${ativo?bdr:''}"
        onclick="toggleVtr(${v.id},${ci})">${v.prefixo}</button>`;
    }).join('');
}

function toggleTodosVtr() {
  _chartVtrSelecionadas.clear();
  renderVtrSelector();
  atualizarTituloGrafico();
  renderCharts();
}

function toggleVtr(id, ci) {
  // Se estava em modo "todos", iniciar com todos selecionados
  if(_chartVtrSelecionadas.size===0){
    state.veiculos.filter(v=>v.ativo!==false).forEach(v=>_chartVtrSelecionadas.add(v.id));
  }
  if(_chartVtrSelecionadas.has(id)) {
    _chartVtrSelecionadas.delete(id);
    // Se ficar vazio, volta para "todos"
    if(_chartVtrSelecionadas.size===0) { renderVtrSelector(); atualizarTituloGrafico(); renderCharts(); return; }
  } else {
    _chartVtrSelecionadas.add(id);
  }
  renderVtrSelector();
  atualizarTituloGrafico();
  renderCharts();
}

function getVeicsFiltrados() {
  const todos = state.veiculos.filter(v=>v.ativo!==false);
  if(_chartVtrSelecionadas.size===0) return todos;
  return todos.filter(v=>_chartVtrSelecionadas.has(v.id));
}

function atualizarTituloGrafico() {
  const el = qs('#chartTituloModal'); if(!el) return;
  const metricaLabel = {valor:'Valor total',litros:'Litros',qtd:'Nº Abastecimentos',mediaLitro:'Preço R$/L'}[qs('#chartMetrica')?.value||'valor'];
  const veics = getVeicsFiltrados();
  const veicsStr = veics.length===state.veiculos.filter(v=>v.ativo!==false).length
    ? 'Todos os veículos'
    : veics.map(v=>v.prefixo).join(' · ');
  el.textContent = `📊 ${metricaLabel} — ${veicsStr} · ${_chartAno}`;
}

// ── Paleta extendida para múltiplas VTRs ──────────────
const VTR_COLORS = [
  'rgba(241,197,103,.9)','rgba(78,207,126,.9)','rgba(100,160,255,.9)',
  'rgba(255,120,120,.9)','rgba(200,120,255,.9)','rgba(255,180,60,.9)',
  'rgba(60,220,220,.9)','rgba(255,100,180,.9)',
];
const VTR_FILLS = VTR_COLORS.map(c=>c.replace('.9)','.15)'));

// Mapa: id de VTR → índice de cor global (estável mesmo filtrando)
function getVtrColorIdx(veiculoId) {
  const all = state.veiculos.filter(v=>v.ativo!==false);
  const idx = all.findIndex(v=>v.id===veiculoId);
  return idx>=0?idx:0;
}

function buildVtrLineDs(label,data,colorIdx,stacked){
  const c=VTR_COLORS[colorIdx%VTR_COLORS.length];
  const f=VTR_FILLS[colorIdx%VTR_FILLS.length];
  return{label,data,borderColor:c,backgroundColor:stacked?c:f,
    borderWidth:3,fill:stacked?true:false,tension:0.42,
    pointBackgroundColor:c,pointBorderColor:'#0a1624',pointBorderWidth:2,
    pointRadius:5,pointHoverRadius:8,spanGaps:true};
}
function buildVtrBarDs(label,data,colorIdx){
  return{label,data,
    backgroundColor:VTR_FILLS[colorIdx%VTR_FILLS.length],
    borderColor:VTR_COLORS[colorIdx%VTR_COLORS.length],
    borderWidth:2,borderRadius:4,borderSkipped:false};
}
function chartAxesOpts(tc,gc,yLabel){
  return{
    x:{ticks:{color:tc,font:{size:10}},grid:{color:gc},border:{color:'rgba(214,156,56,.2)'}},
    y:{ticks:{color:tc,font:{size:10},count:6},
      grid:{color:gc,borderDash:[4,4]},
      border:{color:'rgba(214,156,56,.2)',dash:[4,4]},
      title:{display:!!yLabel,text:yLabel,color:tc,font:{size:10}},
      stacked:false}
  };
}

function renderCharts() {
  if(typeof Chart==='undefined') return;
  const metrica  = qs('#chartMetrica')?.value  || 'valor';
  const tipoRaw  = qs('#chartTipo')?.value     || 'bar';
  const months   = get12Months();
  const tc='rgba(243,232,198,.55)', gc='rgba(214,156,56,.1)';
  const veicsFilt = getVeicsFiltrados();
  const veicsAll  = state.veiculos.filter(v=>v.ativo!==false);

  atualizarTituloGrafico();

  function getVal(its){
    if(metrica==='valor')     return its.reduce((s,i)=>s+num(i.valorTotal),0);
    if(metrica==='litros')    return its.reduce((s,i)=>s+num(i.qtdLitros),0);
    if(metrica==='qtd')       return its.length;
    if(metrica==='mediaLitro'){const tV=its.reduce((s,i)=>s+num(i.valorTotal),0),tL=its.reduce((s,i)=>s+num(i.qtdLitros),0);return tL>0?+(tV/tL).toFixed(3):null;}
    return 0;
  }
  const yLabel={valor:'R$',litros:'Litros',qtd:'Abastecimentos',mediaLitro:'R$/L'}[metrica]||'';
  const isStack=tipoRaw==='bar-stack', isArea=tipoRaw==='area';
  const chartType=(tipoRaw==='line'||isArea)?'line':'bar';
  const tooltipStyle={backgroundColor:'rgba(8,18,36,.95)',borderColor:'rgba(214,156,56,.4)',borderWidth:1,titleColor:'#f1c567',bodyColor:'#f3e8c6',padding:10};

  // ── Gráfico principal comparativo ──
  if(_cP){_cP.destroy();_cP=null;}
  const ctx1=qs('#chartPrincipal')?.getContext('2d');
  if(ctx1){
    const datasets=veicsFilt.map(v=>{
      const ci=getVtrColorIdx(v.id);
      const data=months.map(m=>{const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(m.iso));return getVal(its);});
      return chartType==='line'?buildVtrLineDs(v.prefixo,data,ci,isArea):buildVtrBarDs(v.prefixo,data,ci);
    });
    const axes=chartAxesOpts(tc,gc,yLabel);
    if(isStack){axes.x.stacked=true;axes.y.stacked=true;}
    _cP=new Chart(ctx1,{type:chartType,data:{labels:months.map(m=>m.label),datasets},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{labels:{color:tc,font:{size:10},boxWidth:10,padding:12}},
          tooltip:{...tooltipStyle,callbacks:{label:ctx=>{
            const v=ctx.parsed.y;
            if(v==null) return `${ctx.dataset.label}: —`;
            return metrica==='valor'?`${ctx.dataset.label}: ${brl(v)}`:
              metrica==='litros'?`${ctx.dataset.label}: ${v.toLocaleString('pt-BR')} L`:
              metrica==='mediaLitro'?`${ctx.dataset.label}: R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:3})}/L`:
              `${ctx.dataset.label}: ${v}`;
          }}}
        },scales:axes}});
  }

  // ── Pizza: distribuição valor por VTR no ano ──
  if(_cPi){_cPi.destroy();_cPi=null;}
  const ctx2=qs('#chartPizza')?.getContext('2d');
  if(ctx2){
    const labels2=veicsFilt.map(v=>v.prefixo);
    const data2=veicsFilt.map(v=>{const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`));return its.reduce((s,i)=>s+num(i.valorTotal),0);});
    const bgs=veicsFilt.map(v=>VTR_COLORS[getVtrColorIdx(v.id)%VTR_COLORS.length]);
    _cPi=new Chart(ctx2,{type:'doughnut',data:{labels:labels2,datasets:[{data:data2,backgroundColor:bgs,borderWidth:2,borderColor:'rgba(5,12,24,.6)',hoverOffset:12}]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},cutout:'60%',
        plugins:{legend:{labels:{color:tc,font:{size:10},boxWidth:10,padding:8}},
          tooltip:{...tooltipStyle,callbacks:{label:ctx=>` ${ctx.label}: ${brl(ctx.parsed)}`}}}}});
  }

  // ── Preço médio R$/L por mês ──
  if(_cPr){_cPr.destroy();_cPr=null;}
  const ctx3=qs('#chartPreco')?.getContext('2d');
  if(ctx3){
    const datasets3=veicsFilt.map(v=>{
      const ci=getVtrColorIdx(v.id);
      const pr=months.map(m=>{const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(m.iso)&&num(a.qtdLitros)>0);const tV=its.reduce((s,i)=>s+num(i.valorTotal),0),tL=its.reduce((s,i)=>s+num(i.qtdLitros),0);return tL>0?+(tV/tL).toFixed(3):null;});
      return buildVtrLineDs(v.prefixo,pr,ci,false);
    });
    _cPr=new Chart(ctx3,{type:'line',data:{labels:months.map(m=>m.label),datasets:datasets3},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{color:tc,font:{size:9},boxWidth:8,padding:6}},
          tooltip:{...tooltipStyle,callbacks:{label:ctx=>ctx.parsed.y!=null?`${ctx.dataset.label}: R$ ${ctx.parsed.y.toLocaleString('pt-BR',{minimumFractionDigits:3})}/L`:` ${ctx.dataset.label}: —`}}},
        scales:chartAxesOpts(tc,gc,'R$/Litro')}});
  }

  // ── Ranking: Qtd.(L) + KM/L por VTR no ano ──
  let _cRank=qs('#chartRanking')?._chartInst;
  if(_cRank){_cRank.destroy();}
  const ctx4=qs('#chartRanking')?.getContext('2d');
  if(ctx4){
    const ranked=veicsAll.map(v=>{
      const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`));
      const totL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
      // KM/L: variação de KM / litros totais
      const kms=its.map(a=>num(a.kmAtual)).filter(k=>k>0).sort((a,b)=>a-b);
      const kmL=kms.length>=2&&totL>0?+((kms[kms.length-1]-kms[0])/totL).toFixed(2):null;
      return{label:v.prefixo,litros:totL,kmL,ci:getVtrColorIdx(v.id)};
    }).sort((a,b)=>b.litros-a.litros);

    const rChart=new Chart(ctx4,{
      type:'bar',
      data:{
        labels:ranked.map(r=>r.label),
        datasets:[
          {label:'Litros (L)',data:ranked.map(r=>r.litros),backgroundColor:ranked.map(r=>VTR_FILLS[r.ci%VTR_FILLS.length]),borderColor:ranked.map(r=>VTR_COLORS[r.ci%VTR_COLORS.length]),borderWidth:2,borderRadius:4,yAxisID:'yL'},
          {label:'KM/L',data:ranked.map(r=>r.kmL),type:'line',borderColor:'rgba(241,197,103,.9)',backgroundColor:'rgba(241,197,103,.15)',borderWidth:2,pointRadius:5,pointBackgroundColor:'#f1c567',yAxisID:'yKm',spanGaps:true},
        ]
      },
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:500},
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{color:tc,font:{size:9},boxWidth:8,padding:6}},
          tooltip:{...tooltipStyle,callbacks:{label:ctx=>{
            if(ctx.dataset.label==='Litros (L)') return ` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString('pt-BR')} L`;
            return ctx.parsed.x!=null?` ${ctx.dataset.label}: ${ctx.parsed.x} km/L`:' KM/L: —';
          }}}},
        scales:{
          x:{display:false},
          yL:{ticks:{color:tc,font:{size:10}},grid:{display:false},border:{color:'rgba(214,156,56,.2)'}},
          yKm:{display:false,position:'right'},
        }}
    });
    if(qs('#chartRanking')) qs('#chartRanking')._chartInst=rChart;
  }
}


function abrirModalGraficos() {
  const modal=qs('#modalGraficos'); if(!modal) return;
  // Garantir ano válido
  const anos=[...new Set(state.abastecimentos.map(a=>(a.dataAbastecimento||'').slice(0,4)).filter(Boolean).map(Number))];
  if(anos.length&&!anos.includes(_chartAno)) _chartAno=Math.max(...anos);
  if(!_chartAno) _chartAno=new Date().getFullYear();
  if(qs('#chartAnoDisplay')) qs('#chartAnoDisplay').textContent=_chartAno;
  // Inicializar seletor de VTRs (padrão: todos)
  _chartVtrSelecionadas.clear();
  renderVtrSelector();
  atualizarTituloGrafico();
  modal.classList.add('open');
  setTimeout(renderCharts, 80);
}

function fecharModalGraficos() {
  qs('#modalGraficos')?.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════════════
function renderDashboard() {
  qs('#dashTotalRegistros').textContent=state.abastecimentos.length;
  qs('#dashTotalLitros').textContent=state.abastecimentos.reduce((s,i)=>s+num(i.qtdLitros),0).toLocaleString('pt-BR');
  qs('#dashTotalValor').textContent=brl(state.abastecimentos.reduce((s,i)=>s+num(i.valorTotal),0));
  qs('#dashVeiculosAtivos').textContent=state.veiculos.filter(v=>v.ativo!==false).length;

  // Média R$/L — últimos 30 dias
  const corte30=new Date(); corte30.setDate(corte30.getDate()-30);
  const corteIso=corte30.toISOString().slice(0,10);
  const ult30=state.abastecimentos.filter(a=>(a.dataAbastecimento||'')>=corteIso&&num(a.qtdLitros)>0);
  const totV30=ult30.reduce((s,i)=>s+num(i.valorTotal),0);
  const totL30=ult30.reduce((s,i)=>s+num(i.qtdLitros),0);
  const mediaEl=qs('#dashMediaPreco');
  if(mediaEl) mediaEl.textContent=totL30>0?'R$ '+(totV30/totL30).toFixed(3).replace('.',','):'-';

  // Card: abastecimentos hoje
  const hojeIso = today();
  const abastHoje = state.abastecimentos.filter(a=>(a.dataAbastecimento||'')===hojeIso);
  const valorHoje = abastHoje.reduce((s,i)=>s+num(i.valorTotal),0);
  const hojeEl = qs('#dashHoje');
  const hojeValEl = qs('#dashHojeValor');
  if(hojeEl) hojeEl.textContent = abastHoje.length;
  if(hojeValEl) hojeValEl.textContent = abastHoje.length ? brl(valorHoje) : 'nenhum hoje';

  // Card: motoristas distintos — últimos 30 dias
  const motoristas30 = new Set(ult30.map(a=>a.motoristaId)).size;
  const motEl = qs('#dashMotoristasAtivos');
  if(motEl) motEl.textContent = motoristas30||'-';

  const latest=[...state.abastecimentos].sort((a,b)=>b.id-a.id);
  qs('#dashUltimos').innerHTML=latest.length?latest.map(it=>`<tr>
    <td>${it.id}</td><td>${formatDisplayDate(it.dataAbastecimento)}</td>
    <td>${getVeiculoPrefixo(it.veiculoId)}</td><td>${getVehiclePlate(it.veiculoId)}</td>
    <td>${getMotoristaName(it.motoristaId)}</td><td>${brl(it.valorTotal)}</td>
  </tr>`).join(''):`<tr><td colspan="6">Sem dados.</td></tr>`;
  renderAlertasOleo();
  calculateDashAgg();
}

function renderAbastecimentosTable() {
  // ─── Sprint 1: ordenação flexível por data de abastecimento, data de lançamento ou ID ───
  const campo = qs('#abastOrdemCampo')?.value || 'dataAbastecimento';
  const dir   = qs('#abastOrdemDir')?.value   || 'desc';
  const mult  = dir === 'asc' ? 1 : -1;

  const ordered = [...state.abastecimentos].sort((a, b) => {
    if (campo === 'id') {
      return (Number(a.id) - Number(b.id)) * mult;
    }
    // Ordenação por data com desempate por hora e ID
    const aData = a[campo] || a.dataAbastecimento || '';
    const bData = b[campo] || b.dataAbastecimento || '';
    const aHora = a.horaAbastecimento || '00:00';
    const bHora = b.horaAbastecimento || '00:00';
    const aKey  = `${aData}T${aHora}`;
    const bKey  = `${bData}T${bHora}`;
    if (aKey === bKey) return (Number(a.id) - Number(b.id)) * mult;
    return aKey < bKey ? -1 * mult : 1 * mult;
  });

  qs('#abastecimentosTabela').innerHTML = ordered.length ? ordered.map(it=>`
    <tr data-id="${it.id}">
      <td><button class="icon-btn expand" data-action="expand-row" data-id="${it.id}">▶</button></td>
      <td>${it.id}</td>
      <td>${formatDisplayDate(it.dataAbastecimento)}</td>
      <td>${getVeiculoPrefixo(it.veiculoId)}</td>
      <td>${getVehiclePlate(it.veiculoId)}</td>
      <td>${getSetorName(it.setorId)}</td>
      <td>${getMotoristaName(it.motoristaId)}</td>
      <td>${it.kmAtual}</td>
      <td>${num(it.qtdLitros).toLocaleString('pt-BR')}</td>
      <td>${brl(it.valorTotal)}</td>
      <td><div class="row-actions">
        <button class="icon-btn edit" data-action="edit-abastecimento" data-id="${it.id}">Editar</button>
        <button class="icon-btn delete" data-action="delete-abastecimento" data-id="${it.id}">Excluir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="11">Nenhum registro.</td></tr>`;
}

function toggleRowDetail(id) {
  const tr = qs(`#abastecimentosTabela tr[data-id="${id}"]`);
  if (!tr) return;
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('row-detail')) {
    next.remove();
    tr.querySelector('[data-action="expand-row"]').textContent='▶';
    return;
  }
  const it = findById('abastecimentos',id); if (!it) return;
  const detail = document.createElement('tr');
  detail.className='row-detail';
  detail.innerHTML=`<td colspan="11"><div class="detail-inner">
    <div class="detail-item"><span>Data lançamento</span><strong>${formatDisplayDate(it.dataLancamento,false)}</strong></div>
    <div class="detail-item"><span>Hora</span><strong>${it.horaAbastecimento||'-'}</strong></div>
    <div class="detail-item"><span>Inspetor coordenação</span><strong>${it.inspetorCoordenacao||'-'}</strong></div>
    <div class="detail-item"><span>Gerente abastecimento</span><strong>${it.gerenteAbastecimento||'-'}</strong></div>
    <div class="detail-item"><span>Autorização</span><strong>${it.autorizacao||'-'}</strong></div>
    <div class="detail-item"><span>Valor unitário</span><strong>${brl(it.valorUnitario)}/L</strong></div>
    <div class="detail-item"><span>Combustível</span><strong>${getCombustivelName(getVeiculo(it.veiculoId)?.combustivelId)}</strong></div>
    <div class="detail-item"><span>Observação</span><strong>${it.observacao||'-'}</strong></div>
    <div class="detail-item" style="grid-column:1/-1;margin-top:4px">
      <button class="btn btn-small" onclick="abrirModalComprovantes(${it.id})"
        style="background:rgba(78,207,126,.15);border:1px solid rgba(78,207,126,.3);color:#4ecf7e;padding:5px 14px;font-size:11px;border-radius:8px;cursor:pointer">
        📎 Ver / Anexar comprovantes
      </button>
    </div>
  </div></td>`;
  tr.after(detail);
  tr.querySelector('[data-action="expand-row"]').textContent='▼';
}

function renderConsulta() {
  const f=getConsultaFilters(), data=getFilteredAbastecimentos(f);
  const cl=f.campoData==='dataLancamento'?'lançamento':'abastecimento';
  qs('#consultaTotal').textContent=data.length;
  qs('#consultaLitros').textContent=data.reduce((s,i)=>s+num(i.qtdLitros),0).toLocaleString('pt-BR');
  qs('#consultaValor').textContent=brl(data.reduce((s,i)=>s+num(i.valorTotal),0));
  qs('#consultaPeriodoInfo').textContent=`${f.periodoLabel} · data de ${cl}: ${f.dataIni?formatDisplayDate(f.dataIni,false):'sem início'} até ${f.dataFim?formatDisplayDate(f.dataFim,false):'sem fim'}`;
  qs('#consultaTabela').innerHTML=data.length?data.map(it=>`
    <tr data-cid="${it.id}">
      <td><button class="icon-btn expand" data-action="expand-consulta" data-id="${it.id}">▶</button></td>
      <td>${it.id}</td>
      <td>${formatDisplayDate(it.dataLancamento)}</td>
      <td>${formatDisplayDate(it.dataAbastecimento)}</td>
      <td>${it.horaAbastecimento}</td>
      <td>${getSetorName(it.setorId)}</td>
      <td>${getVeiculoPrefixo(it.veiculoId)}</td>
      <td>${getVehiclePlate(it.veiculoId)}</td>
      <td>${getMotoristaName(it.motoristaId)}</td>
      <td>${it.kmAtual}</td>
      <td>${num(it.qtdLitros).toLocaleString('pt-BR')}</td>
      <td>${brl(it.valorTotal)}</td>
    </tr>`).join(''):`<tr><td colspan="12">Nenhum registro encontrado.</td></tr>`;
}

function toggleConsultaDetail(id) {
  const tr=qs(`#consultaTabela tr[data-cid="${id}"]`); if (!tr) return;
  const next=tr.nextElementSibling;
  if (next&&next.classList.contains('row-detail')) { next.remove(); tr.querySelector('[data-action="expand-consulta"]').textContent='▶'; return; }
  const it=findById('abastecimentos',id); if (!it) return;
  const detail=document.createElement('tr');
  detail.className='row-detail';
  detail.innerHTML=`<td colspan="12"><div class="detail-inner">
    <div class="detail-item"><span>Inspetor coordenação</span><strong>${it.inspetorCoordenacao||'-'}</strong></div>
    <div class="detail-item"><span>Gerente abastecimento</span><strong>${it.gerenteAbastecimento||'-'}</strong></div>
    <div class="detail-item"><span>Valor unitário</span><strong>${brl(it.valorUnitario)}/L</strong></div>
    <div class="detail-item"><span>Autorização</span><strong>${it.autorizacao||'-'}</strong></div>
    <div class="detail-item"><span>Combustível</span><strong>${getCombustivelName(getVeiculo(it.veiculoId)?.combustivelId)}</strong></div>
    <div class="detail-item"><span>Observação</span><strong>${it.observacao||'-'}</strong></div>
  </div></td>`;
  tr.after(detail);
  tr.querySelector('[data-action="expand-consulta"]').textContent='▼';
}

function renderCadastros() {
  qs('#veiculosTabela').innerHTML=state.veiculos.map(it=>`<tr>
    <td>${it.prefixoTipo||(it.prefixo||'').split(' ')[0]||''}</td>
    <td>${it.prefixoNumero||(it.prefixo||'').split(' ')[1]||''}</td>
    <td>${it.marcaModelo||'-'}</td>
    <td>${it.placa}</td><td>${getCombustivelName(it.combustivelId)}</td>
    <td>${formatStatus(it.ativo!==false)}</td>
    <td><div class="row-actions">
      <button class="icon-btn edit" data-action="edit-veiculo" data-id="${it.id}">Editar</button>
      <button class="icon-btn delete" data-action="delete-veiculo" data-id="${it.id}">Excluir</button>
    </div></td>
  </tr>`).join('');
  qs('#motoristasTabela').innerHTML=state.motoristas.map(it=>`<tr>
    <td>${it.nome}</td><td>${it.matricula}</td><td>${formatStatus(it.ativo!==false)}</td>
    <td><div class="row-actions">
      <button class="icon-btn edit" data-action="edit-motorista" data-id="${it.id}">Editar</button>
      <button class="icon-btn delete" data-action="delete-motorista" data-id="${it.id}">Excluir</button>
    </div></td>
  </tr>`).join('');
  qs('#setoresTabela').innerHTML=state.setores.map(it=>`<tr>
    <td>${it.nome}</td><td>${it.sigla||''}</td>
    <td><div class="row-actions">
      <button class="icon-btn edit" data-action="edit-setor" data-id="${it.id}">Editar</button>
      <button class="icon-btn delete" data-action="delete-setor" data-id="${it.id}">Excluir</button>
    </div></td>
  </tr>`).join('');
  qs('#combustiveisTabela').innerHTML=state.combustiveis.map(it=>`<tr>
    <td>${it.nome}</td>
    <td><div class="row-actions">
      <button class="icon-btn edit" data-action="edit-combustivel" data-id="${it.id}">Editar</button>
      <button class="icon-btn delete" data-action="delete-combustivel" data-id="${it.id}">Excluir</button>
    </div></td>
  </tr>`).join('');
}

function renderAll() {
  renderDashboard();
  renderAbastecimentosTable();
  renderConsulta();
  renderCadastros();
  renderTrocaOleo();
}

// ═══════════════════════════════════════════════════════════════════
//  CADASTROS
// ═══════════════════════════════════════════════════════════════════
function genericSave(col, vals, editSel, clearFn) {
  const editId=qs(editSel).value;
  if (editId) {
    const idx=state[col].findIndex(i=>Number(i.id)===Number(editId));
    state[col][idx]={...state[col][idx],...vals};
  } else {
    state[col].push({id:nextId(col),...vals});
  }
  saveStateSync(); clearFn(); syncSelects(); renderAll();
}

function clearVeiculoForm() {
  qs('#veiculoEditId').value=''; qs('#formVeiculo').reset();
  if(qs('#veiculoMarcaModelo')) qs('#veiculoMarcaModelo').value='';
  syncSelects(); qs('#veiculoPrefixoNumero').value='';
  qs('#veiculoAtivo').value='true'; updatePrefixoPreview();
}
function clearMotoristaForm() {
  qs('#motoristaEditId').value=''; qs('#formMotorista').reset(); qs('#motoristaAtivo').value='true';
}
function clearSetorForm()      { qs('#setorEditId').value=''; qs('#formSetor').reset(); }
function clearCombustivelForm(){ qs('#combustivelEditId').value=''; qs('#formCombustivel').reset(); }

function handleVeiculoSubmit(e) {
  e.preventDefault();
  const placa=qs('#veiculoPlaca').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tipo=qs('#veiculoPrefixoTipo').value||'Vtr';
  const raw=qs('#veiculoPrefixoNumero').value;
  const pnum=String(Number(raw||0)).padStart(3,'0');
  const prefixo=buildPrefixo(tipo,raw);
  const editId=Number(qs('#veiculoEditId').value||0);
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/i.test(placa)) return alert('Informe a placa no formato atual ABC1D23.');
  if (!raw||Number(raw)<1||Number(raw)>999) return alert('Informe o número do prefixo entre 001 e 999.');
  if (state.veiculos.find(i=>String(i.placa||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===placa&&Number(i.id)!==editId)) return alert('Já existe veículo com esta placa.');
  if (state.veiculos.find(i=>normalizeText(i.prefixo)===normalizeText(prefixo)&&Number(i.id)!==editId)) return alert('Já existe veículo com este prefixo.');
  genericSave('veiculos',{descricao:prefixo,prefixoTipo:tipo,prefixoNumero:pnum,prefixo,placa,
    marcaModelo:(qs('#veiculoMarcaModelo')?.value||'').trim(),
    combustivelId:num(qs('#veiculoCombustivel').value),
    kmAtual:findById('veiculos',editId)?.kmAtual||0,
    ativo:qs('#veiculoAtivo').value==='true'},'#veiculoEditId',clearVeiculoForm);
}

function handleMotoristaSubmit(e) {
  e.preventDefault();
  const mat=qs('#motoristaMatricula').value.trim();
  if (state.motoristas.find(i=>i.matricula===mat&&Number(i.id)!==Number(qs('#motoristaEditId').value||0))) return alert('Já existe motorista com esta matrícula.');
  genericSave('motoristas',{nome:qs('#motoristaNome').value.trim().toUpperCase(),matricula:mat,ativo:qs('#motoristaAtivo').value==='true'},'#motoristaEditId',clearMotoristaForm);
}

function handleSetorSubmit(e) {
  e.preventDefault();
  genericSave('setores',{nome:qs('#setorNome').value.trim(),sigla:qs('#setorSigla').value.trim(),ativo:true},'#setorEditId',clearSetorForm);
}

function handleCombustivelSubmit(e) {
  e.preventDefault();
  genericSave('combustiveis',{nome:qs('#combustivelNome').value.trim(),ativo:true},'#combustivelEditId',clearCombustivelForm);
}

function editEntity(col, id) {
  const it=findById(col,id); if (!it) return;
  if (col==='veiculos') {
    const p=parsePrefixoPattern(it.prefixo,it.id);
    qs('#veiculoEditId').value=it.id; qs('#veiculoPrefixoTipo').value=it.prefixoTipo||p.tipo;
    qs('#veiculoPrefixoNumero').value=it.prefixoNumero||p.numero;
    qs('#veiculoPlaca').value=it.placa; qs('#veiculoCombustivel').value=it.combustivelId;
    if(qs('#veiculoMarcaModelo')) qs('#veiculoMarcaModelo').value=it.marcaModelo||'';
    qs('#veiculoAtivo').value=String(it.ativo!==false); updatePrefixoPreview();
  }
  if (col==='motoristas') {
    qs('#motoristaEditId').value=it.id; qs('#motoristaNome').value=it.nome;
    qs('#motoristaMatricula').value=it.matricula; qs('#motoristaAtivo').value=String(it.ativo!==false);
  }
  if (col==='setores')     { qs('#setorEditId').value=it.id; qs('#setorNome').value=it.nome; qs('#setorSigla').value=it.sigla||''; }
  if (col==='combustiveis'){ qs('#combustivelEditId').value=it.id; qs('#combustivelNome').value=it.nome; }
  setScreen('cadastros');
}

function deleteEntity(col, id) {
  const dep={
    veiculos:    state.abastecimentos.some(i=>Number(i.veiculoId)===Number(id)),
    motoristas:  state.abastecimentos.some(i=>Number(i.motoristaId)===Number(id)),
    setores:     state.abastecimentos.some(i=>Number(i.setorId)===Number(id)),
    combustiveis:state.veiculos.some(i=>Number(i.combustivelId)===Number(id))
  };
  if (dep[col]) return alert('Não é possível excluir: existem registros vinculados.');
  if (!confirm('Confirmar exclusão?')) return;
  state[col]=state[col].filter(i=>Number(i.id)!==Number(id));
  saveStateSync(); syncSelects(); renderAll();
}

// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD AGG
// ═══════════════════════════════════════════════════════════════════
function calculateDashAgg() {
  const veiculoId=qs('#dashAggPlaca')?.value;
  const periodoTipo=qs('#dashAggPeriodoTipo')?.value||'dias';
  const periodoValor=Number(qs('#dashAggPeriodoValor')?.value||1);
  const campoData=qs('#dashAggCampoData')?.value||'dataAbastecimento';
  const res=qs('#dashAggResultado'); if(!res) return;
  if(!veiculoId){res.innerHTML='Selecione uma placa para calcular.';return;}
  const v=getVeiculo(Number(veiculoId));
  if(!v){res.innerHTML='Veículo não encontrado.';return;}
  const agora=new Date();
  let ini=new Date(agora);
  if(periodoTipo==='dias')    ini.setDate(agora.getDate()-periodoValor);
  if(periodoTipo==='semanas') ini.setDate(agora.getDate()-periodoValor*7);
  if(periodoTipo==='meses')   ini.setMonth(agora.getMonth()-periodoValor);
  if(periodoTipo==='anos')    ini.setFullYear(agora.getFullYear()-periodoValor);
  const iniIso=ini.toISOString().slice(0,10);
  const fimIso=agora.toISOString().slice(0,10);
  const abastPeriodo=state.abastecimentos.filter(a=>
    Number(a.veiculoId)===Number(veiculoId)&&
    (a[campoData]||'')>=iniIso&&(a[campoData]||'')<=fimIso
  ).sort((a,b)=>(a[campoData]||'').localeCompare(b[campoData]||''));
  const totLitros=abastPeriodo.reduce((s,i)=>s+num(i.qtdLitros),0);
  const totValor=abastPeriodo.reduce((s,i)=>s+num(i.valorTotal),0);
  const totQtd=abastPeriodo.length;
  const mediaPreco=totLitros>0?(totValor/totLitros).toFixed(3):'—';
  // KM percorridos no período
  const kms=abastPeriodo.map(a=>num(a.kmAtual)).filter(k=>k>0).sort((a,b)=>a-b);
  const kmPercorrido=kms.length>=2?kms[kms.length-1]-kms[0]:null;
  const kmL=kmPercorrido&&totLitros>0?(kmPercorrido/totLitros).toFixed(2):null;
  const tipoLabel={dias:'dia(s)',semanas:'semana(s)',meses:'mês/meses',anos:'ano(s)'}[periodoTipo];
  res.innerHTML=totQtd===0
    ?`<span style="opacity:.45">Nenhum abastecimento no período.</span>`
    :`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px">
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Veículo</span><br><strong style="color:#f1c567">${v.prefixo} · ${v.placa}</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Período</span><br><strong>${periodoValor} ${tipoLabel}</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Faixa</span><br><strong>${formatDisplayDate(iniIso,false)} → ${formatDisplayDate(fimIso,false)}</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Abastecimentos</span><br><strong>${totQtd}</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Litros total</span><br><strong>${totLitros.toLocaleString('pt-BR')} L</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Valor total</span><br><strong>${brl(totValor)}</strong></div>
        <div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">Preço médio/L</span><br><strong>R$ ${mediaPreco}/L</strong></div>
        ${kmL?`<div><span style="color:rgba(243,232,198,.45);font-size:10px;text-transform:uppercase;letter-spacing:.3px">KM/L estimado</span><br><strong>${kmL} km/L</strong></div>`:''}
      </div>`;
  // Gráfico de barras: litros por abastecimento
  renderDashAggChart(abastPeriodo);
}

let _cDashAgg = null;
function renderDashAggChart(abastPeriodo) {
  if(typeof Chart==='undefined') return;
  const canvas=qs('#dashAggChart'); if(!canvas) return;
  if(_cDashAgg){_cDashAgg.destroy();_cDashAgg=null;}
  if(!abastPeriodo.length) return;
  const tc='rgba(243,232,198,.5)', gc='rgba(214,156,56,.1)';
  const labels=abastPeriodo.map(a=>formatDisplayDate(a.dataAbastecimento,false));
  const litros=abastPeriodo.map(a=>num(a.qtdLitros));
  const valores=abastPeriodo.map(a=>num(a.valorTotal));
  _cDashAgg=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[
      {label:'Litros',data:litros,backgroundColor:'rgba(214,156,56,.5)',borderColor:'rgba(214,156,56,.9)',borderWidth:1,borderRadius:4,yAxisID:'yL'},
      {label:'Valor (R$)',data:valores,type:'line',borderColor:'rgba(78,207,126,.9)',backgroundColor:'rgba(78,207,126,.1)',borderWidth:2,pointRadius:4,pointBackgroundColor:'#4ecf7e',tension:0.35,yAxisID:'yV'},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      animation:{duration:400},
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:tc,font:{size:9},boxWidth:8,padding:8}},
        tooltip:{backgroundColor:'rgba(8,18,36,.95)',borderColor:'rgba(214,156,56,.4)',borderWidth:1,titleColor:'#f1c567',bodyColor:'#f3e8c6',padding:8,
          callbacks:{label:ctx=>ctx.dataset.label==='Litros'?` ${ctx.parsed.y.toLocaleString('pt-BR')} L`:` ${brl(ctx.parsed.y)}`}}
      },
      scales:{
        x:{ticks:{color:tc,font:{size:8},maxRotation:45},grid:{color:gc},border:{color:'rgba(214,156,56,.2)'}},
        yL:{position:'left',ticks:{color:tc,font:{size:8}},grid:{color:gc,borderDash:[4,4]},title:{display:true,text:'Litros',color:tc,font:{size:8}}},
        yV:{position:'right',ticks:{color:tc,font:{size:8}},grid:{display:false},title:{display:true,text:'R$',color:tc,font:{size:8}}}
      }
    }
  });
}


function setImportStatus(msg,tone='info') {
  const el=qs('#importStatus'); if (!el) return;
  el.textContent=msg; el.dataset.tone=tone;
}

function validateImportedState(data) {
  if (!data||typeof data!=='object'||Array.isArray(data)) throw new Error('Arquivo inválido.');
  ['perfis','usuarios','combustiveis','setores','motoristas','veiculos','abastecimentos'].forEach(k=>{
    if (!Array.isArray(data[k])) throw new Error(`Estrutura JSON incompatível: coleção "${k}" ausente.`);
  });
}

function importJson(event) {
  const file=event.target.files?.[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=async ()=>{
    try {
      const raw=JSON.parse(String(reader.result||'{}'));
      validateImportedState(raw);
      const imp=migrateState(raw);
      const nComp=(raw._comprovantes||[]).length;
      const msg=`Importar "${file.name}"?\n` +
        `• ${imp.abastecimentos.length} abastecimento(s)\n` +
        `• ${imp.veiculos.length} veículo(s)\n` +
        `• ${nComp} comprovante(s)\n\nOs dados atuais serão substituídos.`;
      if (!confirm(msg)) { setImportStatus('Cancelado.','warning'); return; }
      setImportStatus('Importando dados...','info');
      state=imp; saveStateSync();
      // Reimportar comprovantes se presentes
      if(nComp>0){
        setImportStatus(`Importando ${nComp} comprovante(s)...`,'info');
        for(const d of raw._comprovantes){
          try {
            // Converter base64 → Blob
            const bin=atob(d.b64||'');
            const arr=new Uint8Array(bin.length);
            for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
            const blob=new Blob([arr],{type:d.tipo||'application/octet-stream'});
            await dbSalvarComprovante({
              abastecimentoId:d.abastecimentoId,
              trocaOleoId:d.trocaOleoId||null,
              nome:d.nome, tipo:d.tipo, tamanho:d.tamanho,
              data:d.data, blob
            });
          } catch(e){ console.warn('Comprovante ignorado:',d.nome,e); }
        }
      }
      await bootstrap(); setScreen('config');
      setImportStatus(`Importado: ${imp.abastecimentos.length} lançamento(s), ${imp.veiculos.length} veículo(s), ${nComp} comprovante(s).`,'success');
      alert('Importação concluída com sucesso!');
    } catch(err) {
      const msg=err instanceof Error?err.message:'Falha ao ler arquivo.';
      setImportStatus(`Falha: ${msg}`,'error'); alert(`Não foi possível importar. ${msg}`);
    } finally { event.target.value=''; }
  };
  reader.onerror=()=>{ setImportStatus('Erro ao acessar arquivo.','error'); event.target.value=''; };
  reader.readAsText(file,'utf-8');
}


// ═══════════════════════════════════════════════════════════════════
//  MESCLAR JSON — une dados externos com os locais sem substituir
// ═══════════════════════════════════════════════════════════════════
function mesclarJson(event) {
  const file = event.target.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const raw = JSON.parse(String(reader.result||'{}'));
      validateImportedState(raw);
      const ext = migrateState(raw);
      const nComp = (raw._comprovantes||[]).length;

      // Contar o que será mesclado antes de confirmar
      const novosAbast = ext.abastecimentos.filter(
        a => !state.abastecimentos.some(b => Number(b.id)===Number(a.id))
      );
      const novasOleo = (ext.trocasOleo||[]).filter(
        t => !(state.trocasOleo||[]).some(b => Number(b.id)===Number(t.id))
      );
      const novosVeic = ext.veiculos.filter(
        v => !state.veiculos.some(b => Number(b.id)===Number(v.id))
      );
      const novosMotor = ext.motoristas.filter(
        m => !state.motoristas.some(b => Number(b.id)===Number(m.id))
      );

      const msg =
        `Mesclar "${file.name}" com os dados atuais?

` +
        `Serão adicionados:
` +
        `• ${novosAbast.length} abastecimento(s) novo(s)
` +
        `• ${novasOleo.length} troca(s) de óleo nova(s)
` +
        `• ${novosVeic.length} veículo(s) novo(s)
` +
        `• ${novosMotor.length} motorista(s) novo(s)
` +
        `• ${nComp} comprovante(s)

` +
        `Registros duplicados (mesmo ID) serão ignorados.
` +
        `Seus dados atuais NÃO serão apagados.`;

      if(!confirm(msg)) { setImportStatus('Mesclagem cancelada.','warning'); return; }

      setImportStatus('Mesclando dados...','info');

      // ── Mesclar cada coleção por ID ──
      function mesclarColecao(local, externo) {
        const ids = new Set(local.map(i=>Number(i.id)));
        const novos = externo.filter(i=>!ids.has(Number(i.id)));
        return [...local, ...novos];
      }

      state.abastecimentos = mesclarColecao(state.abastecimentos, ext.abastecimentos);
      state.trocasOleo     = mesclarColecao(state.trocasOleo||[], ext.trocasOleo||[]);
      state.veiculos       = mesclarColecao(state.veiculos, ext.veiculos);
      state.motoristas     = mesclarColecao(state.motoristas, ext.motoristas);
      state.setores        = mesclarColecao(state.setores, ext.setores);
      state.combustiveis   = mesclarColecao(state.combustiveis, ext.combustiveis);

      // ── Atualizar KM dos veículos para o maior registrado ──
      state.veiculos.forEach(v => {
        const extV = ext.veiculos.find(ev=>Number(ev.id)===Number(v.id));
        if(extV && num(extV.kmAtual) > num(v.kmAtual)) v.kmAtual = extV.kmAtual;
      });

      // ── Renumerar IDs para evitar colisões em lançamentos futuros ──
      // (mantém os IDs originais, apenas garante que nextId() não colide)
      // nextId() já usa Math.max(...ids)+1, então é automático

      saveStateSync();

      // ── Mesclar comprovantes (apenas os novos — por abastecimentoId não existente) ──
      let compMesclados = 0;
      if(nComp > 0) {
        setImportStatus(`Mesclando ${nComp} comprovante(s)...`,'info');
        // IDs de abastecimentos que já têm comprovantes locais
        const docsLocais = await idbGetAll('comprovantes');
        const abastComComp = new Set(docsLocais.map(d=>Number(d.abastecimentoId)));

        for(const d of raw._comprovantes) {
          // Só importa se o abastecimento não tem comprovante ainda
          if(!d.b64) continue;
          if(abastComComp.has(Number(d.abastecimentoId))) continue;
          try {
            const bin = atob(d.b64);
            const arr = new Uint8Array(bin.length);
            for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
            const blob = new Blob([arr],{type:d.tipo||'application/octet-stream'});
            await dbSalvarComprovante({
              abastecimentoId: d.abastecimentoId,
              trocaOleoId: d.trocaOleoId||null,
              nome: d.nome, tipo: d.tipo, tamanho: d.tamanho,
              data: d.data, blob
            });
            compMesclados++;
          } catch(e){ console.warn('Comprovante ignorado:', d.nome, e); }
        }
      }

      await bootstrap();
      setImportStatus(
        `✅ Mesclagem concluída: +${novosAbast.length} abastecimento(s), ` +
        `+${novasOleo.length} troca(s) de óleo, ` +
        `+${novosVeic.length} veículo(s), ` +
        `+${compMesclados} comprovante(s) importado(s).`,
        'success'
      );
      alert(
        `Mesclagem concluída com sucesso!\n\n` +
        `+${novosAbast.length} abastecimento(s) adicionado(s)\n` +
        `+${novasOleo.length} troca(s) de óleo adicionada(s)\n` +
        `+${novosVeic.length} veículo(s) adicionado(s)\n` +
        `+${compMesclados} comprovante(s) importado(s)`
      );
    } catch(err) {
      const msg = err instanceof Error ? err.message : 'Falha ao ler arquivo.';
      setImportStatus(`Falha na mesclagem: ${msg}`,'error');
      alert(`Não foi possível mesclar. ${msg}`);
    } finally { event.target.value=''; }
  };
  reader.onerror = () => { setImportStatus('Erro ao acessar arquivo.','error'); event.target.value=''; };
  reader.readAsText(file, 'utf-8');
}

function resetDemo() {
  if (!confirm('Deseja restaurar os dados de demonstração?')) return;
  state=migrateState(clone(seedState)); saveStateSync(); bootstrap();
}

// ═══════════════════════════════════════════════════════════════════
//  GERENCIAR TIPOS DE PREFIXO (item 6)
// ═══════════════════════════════════════════════════════════════════
function abrirModalGerenciarTipos() {
  renderListaTipos();
  qs('#modalGerenciarTipos').classList.add('open');
}

function fecharModalGerenciarTipos() {
  qs('#modalGerenciarTipos').classList.remove('open');
}

function renderListaTipos() {
  const lista=qs('#listaTiposPrefixo'); if(!lista) return;
  const tipos=state.tiposPrefixo||['Vtr','MP'];
  lista.innerHTML=tipos.map((t,i)=>`
    <div class="tipo-prefixo-item">
      <span>${t}</span>
      <div class="tipo-actions">
        ${i>0?`<button onclick="moverTipo(${i},-1)" title="Mover para cima">↑</button>`:'<button disabled style="opacity:.2">↑</button>'}
        ${i<tipos.length-1?`<button onclick="moverTipo(${i},1)" title="Mover para baixo">↓</button>`:'<button disabled style="opacity:.2">↓</button>'}
        ${tipos.length>1?`<button onclick="removerTipo(${i})" title="Remover">🗑</button>`:'<button disabled style="opacity:.2">🗑</button>'}
      </div>
    </div>`).join('');
}

function adicionarTipoPrefixo() {
  const inp=qs('#novoTipoPrefixo'); if(!inp) return;
  const val=inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!val) return;
  if((state.tiposPrefixo||[]).includes(val)){alert('Tipo já existe.');return;}
  state.tiposPrefixo=[...(state.tiposPrefixo||['Vtr','MP']),val];
  saveStateSync(); syncSelects(); renderListaTipos();
  inp.value='';
}

function removerTipo(idx) {
  const tipos=state.tiposPrefixo||[];
  if(tipos.length<=1){alert('É necessário ao menos um tipo.');return;}
  if(!confirm(`Remover o tipo "${tipos[idx]}"?`)) return;
  state.tiposPrefixo=tipos.filter((_,i)=>i!==idx);
  saveStateSync(); syncSelects(); renderListaTipos();
}

function moverTipo(idx,dir) {
  const tipos=[...(state.tiposPrefixo||[])];
  const nIdx=idx+dir;
  if(nIdx<0||nIdx>=tipos.length) return;
  [tipos[idx],tipos[nIdx]]=[tipos[nIdx],tipos[idx]];
  state.tiposPrefixo=tipos;
  saveStateSync(); renderListaTipos();
}


// ═══════════════════════════════════════════════════════════════════
//  MODAIS NEON
// ═══════════════════════════════════════════════════════════════════
let _modalTrocaVeiculoId = null;

function abrirModalTrocaOleo(veiculoId) {
  const v = getVeiculo(veiculoId); if (!v) return;
  _modalTrocaVeiculoId = veiculoId;
  const s = getTrocaStatus(veiculoId);
  const statusLbl = {vencido:'⚠️ VENCIDA',proximo:'⚡ PRÓXIMA',ok:'✅ OK',sem:'Sem registro'}[s?.status||'sem'];
  qs('#modalTrocaTitulo').textContent = `🛢️ ${v.prefixo} · ${v.placa}`;
  const trocas = [...(state.trocasOleo||[])].filter(t=>Number(t.veiculoId)===Number(veiculoId)).sort((a,b)=>b.km-a.km);
  const statusHtml = s ? `<div class="modal-status-bar ${s.status||'sem'}">
    <strong>${statusLbl}</strong>
    ${s.ultima?`&nbsp;·&nbsp; KM atual: <strong>${s.kmAtual.toLocaleString('pt-BR')}</strong> &nbsp;·&nbsp;
    Próxima troca: <strong>${s.proxima?.toLocaleString('pt-BR')} km</strong> &nbsp;·&nbsp;
    ${s.falta>=0?'Faltam':'Excedeu'}: <strong>${Math.abs(s.falta).toLocaleString('pt-BR')} km</strong>`:''}
  </div>` : '';
  const tabela = trocas.length ? `
    <table>
      <thead><tr><th>Data</th><th>KM troca</th><th>Intervalo</th><th>KM próxima</th><th>Tipo óleo</th><th>Qtd. L</th><th>Valor/L</th><th>Custo total</th><th>Observação</th></tr></thead>
      <tbody>${trocas.map(it=>`<tr>
        <td>${formatDisplayDate(it.data,false)}</td>
        <td>${num(it.km).toLocaleString('pt-BR')}</td>
        <td>${num(it.intervalo).toLocaleString('pt-BR')}</td>
        <td>${num(it.proximaKm).toLocaleString('pt-BR')}</td>
        <td>${it.tipoOleo||'-'}</td>
        <td>${it.valorLitro?brl(it.valorLitro)+'/L':'-'}</td>
        <td>${it.obs||'-'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p style="color:rgba(243,232,198,.45);font-size:13px;text-align:center;padding:20px">Nenhuma troca registrada para este veículo.</p>';
  qs('#modalTrocaOleoConteudo').innerHTML = statusHtml + tabela;
  qs('#modalTrocaOleoDetalhe').classList.add('open');
}

function fecharModalTrocaOleo() {
  qs('#modalTrocaOleoDetalhe').classList.remove('open');
  _modalTrocaVeiculoId = null;
}

function imprimirModalTrocaOleo() {
  if (!_modalTrocaVeiculoId) return;
  const v = getVeiculo(_modalTrocaVeiculoId); if (!v) return;
  const trocas = [...(state.trocasOleo||[])].filter(t=>Number(t.veiculoId)===Number(_modalTrocaVeiculoId)).sort((a,b)=>b.km-a.km);
  const dt = new Date().toLocaleString('pt-BR');
  const rows = trocas.map(it=>`<tr>
    <td>${formatDisplayDate(it.data,false)}</td>
    <td>${num(it.km).toLocaleString('pt-BR')}</td>
    <td>${num(it.intervalo).toLocaleString('pt-BR')}</td>
    <td>${num(it.proximaKm).toLocaleString('pt-BR')}</td>
    <td>${it.tipoOleo||'-'}</td>
    <td>${it.valorLitro?brl(it.valorLitro)+'/L':'-'}</td>
    <td>${it.obs||'-'}</td>
  </tr>`).join('');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Troca de Óleo — ${v.prefixo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  .hdr{border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:12px}
  .hdr h1{font-size:13px;color:#0e2147;font-weight:700;text-transform:uppercase}
  .hdr h2{font-size:11px;color:#333;margin-top:2px}.hdr p{font-size:9px;color:#666;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead tr{background:#0e2147}thead th{padding:6px 5px;color:#fff;font-weight:700;text-transform:uppercase}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:5px;border-bottom:1px solid #e0e6f0}
  .foot{margin-top:12px;border-top:1px solid #ccd6eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#888}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <div class="hdr"><h1>Guarda Civil Municipal de Ipatinga</h1>
  <h2>Histórico de Troca de Óleo — ${v.prefixo} · ${v.placa}</h2><p>Emitido em: ${dt}</p></div>
  <table><thead><tr><th>Data</th><th>KM troca</th><th>Intervalo</th><th>KM próxima</th><th>Tipo óleo</th><th>Valor/L</th><th>Observação</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="7">Sem registros.</td></tr>'}</tbody></table>
  <div class="foot"><span>Guarda Civil Municipal de Ipatinga</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=900,height=650');
  if (!win) { alert('Permita pop-ups para imprimir.'); return; }
  win.document.write(html); win.document.close();
}

let _modalAbastId = null;

function abrirModalAbastecimento(id) {
  const it = findById('abastecimentos', id); if (!it) return;
  _modalAbastId = id;
  const v = getVeiculo(it.veiculoId);
  qs('#modalAbastTitulo').textContent = `⛽ Abastecimento #${it.id} — ${getVeiculoPrefixo(it.veiculoId)}`;
  qs('#modalAbastConteudo').innerHTML = `
    <div class="modal-detail-grid">
      <div class="modal-detail-item"><span>Data lançamento</span><strong>${formatDisplayDate(it.dataLancamento,false)}</strong></div>
      <div class="modal-detail-item"><span>Data abastecimento</span><strong>${formatDisplayDate(it.dataAbastecimento,false)}</strong></div>
      <div class="modal-detail-item"><span>Hora</span><strong>${it.horaAbastecimento||'-'}</strong></div>
      <div class="modal-detail-item"><span>Setor</span><strong>${getSetorName(it.setorId)}</strong></div>
      <div class="modal-detail-item"><span>Prefixo</span><strong>${getVeiculoPrefixo(it.veiculoId)}</strong></div>
      <div class="modal-detail-item"><span>Placa</span><strong>${getVehiclePlate(it.veiculoId)}</strong></div>
      <div class="modal-detail-item"><span>Combustível</span><strong>${getCombustivelName(v?.combustivelId)}</strong></div>
      <div class="modal-detail-item"><span>Motorista</span><strong>${getMotoristaName(it.motoristaId)}</strong></div>
      <div class="modal-detail-item"><span>Matrícula</span><strong>${getMotorista(it.motoristaId)?.matricula||'-'}</strong></div>
      <div class="modal-detail-item"><span>Inspetor coordenação</span><strong>${it.inspetorCoordenacao||'-'}</strong></div>
      <div class="modal-detail-item"><span>Gerente abastecimento</span><strong>${it.gerenteAbastecimento||'-'}</strong></div>
      <div class="modal-detail-item"><span>Autorização</span><strong>${it.autorizacao||'-'}</strong></div>
      <div class="modal-detail-item"><span>KM atual</span><strong>${num(it.kmAtual).toLocaleString('pt-BR')}</strong></div>
      <div class="modal-detail-item"><span>Litros</span><strong>${num(it.qtdLitros).toLocaleString('pt-BR',{minimumFractionDigits:2})} L</strong></div>
      <div class="modal-detail-item"><span>Valor unitário</span><strong>${brl(it.valorUnitario)}/L</strong></div>
      <div class="modal-detail-item"><span>Valor total</span><strong>${brl(it.valorTotal)}</strong></div>
      ${it.observacao?`<div class="modal-detail-item" style="grid-column:1/-1"><span>Observação</span><strong>${it.observacao}</strong></div>`:''}
    </div>`;
  qs('#modalAbastecimentoDetalhe').classList.add('open');
  // Carregar comprovantes na seção embutida
  renderComprovantesModal(id);
}

function fecharModalAbastecimento() {
  qs('#modalAbastecimentoDetalhe').classList.remove('open');
  _modalAbastId = null;
}

function abrirComprovantesDesdModal() {
  const id = _modalAbastId;
  fecharModalAbastecimento();
  if (id) abrirModalComprovantes(id);
}

function imprimirModalAbastecimento() {
  if (!_modalAbastId) return;
  const it = findById('abastecimentos', _modalAbastId); if (!it) return;
  const v = getVeiculo(it.veiculoId);
  const dt = new Date().toLocaleString('pt-BR');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Abastecimento #${it.id}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  .hdr{border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:12px}
  .hdr h1{font-size:13px;color:#0e2147;font-weight:700;text-transform:uppercase}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;margin-bottom:12px}
  .item span{display:block;font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.3px}
  .item strong{display:block;font-size:11px;color:#111;font-weight:700;margin-top:1px}
  .foot{margin-top:12px;border-top:1px solid #ccd6eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#888}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <div class="hdr"><h1>Guarda Civil Municipal de Ipatinga — Comprovante de Abastecimento #${it.id}</h1>
  <p>Emitido em: ${dt}</p></div>
  <div class="grid">
    <div class="item"><span>Data lançamento</span><strong>${formatDisplayDate(it.dataLancamento,false)}</strong></div>
    <div class="item"><span>Data abastecimento</span><strong>${formatDisplayDate(it.dataAbastecimento,false)}</strong></div>
    <div class="item"><span>Hora</span><strong>${it.horaAbastecimento||'-'}</strong></div>
    <div class="item"><span>Setor</span><strong>${getSetorName(it.setorId)}</strong></div>
    <div class="item"><span>Prefixo</span><strong>${getVeiculoPrefixo(it.veiculoId)}</strong></div>
    <div class="item"><span>Placa</span><strong>${getVehiclePlate(it.veiculoId)}</strong></div>
    <div class="item"><span>Combustível</span><strong>${getCombustivelName(v?.combustivelId)}</strong></div>
    <div class="item"><span>Motorista</span><strong>${getMotoristaName(it.motoristaId)}</strong></div>
    <div class="item"><span>Matrícula</span><strong>${getMotorista(it.motoristaId)?.matricula||'-'}</strong></div>
    <div class="item"><span>Inspetor</span><strong>${it.inspetorCoordenacao||'-'}</strong></div>
    <div class="item"><span>Gerente</span><strong>${it.gerenteAbastecimento||'-'}</strong></div>
    <div class="item"><span>Autorização</span><strong>${it.autorizacao||'-'}</strong></div>
    <div class="item"><span>KM atual</span><strong>${num(it.kmAtual).toLocaleString('pt-BR')}</strong></div>
    <div class="item"><span>Litros</span><strong>${num(it.qtdLitros).toFixed(2).replace('.',',')} L</strong></div>
    <div class="item"><span>Valor unitário</span><strong>${brl(it.valorUnitario)}/L</strong></div>
    <div class="item"><span>Valor total</span><strong>${brl(it.valorTotal)}</strong></div>
    ${it.observacao?`<div class="item" style="grid-column:1/-1"><span>Observação</span><strong>${it.observacao}</strong></div>`:''}
  </div>
  <div class="foot"><span>Guarda Civil Municipal de Ipatinga</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`;
  const win=window.open('','_blank','width=900,height=650');
  if (!win) { alert('Permita pop-ups para imprimir.'); return; }
  win.document.write(html); win.document.close();
}

// ═══════════════════════════════════════════════════════════════════
//  COMPROVANTES — Upload, visualização e exclusão
// ═══════════════════════════════════════════════════════════════════

async function abrirModalComprovantes(abastecimentoId) {
  const it = findById('abastecimentos', abastecimentoId);
  if (!it) return;
  const modal = qs('#modalComprovantes');
  if (!modal) return;
  qs('#modalComprovantesId').value = abastecimentoId;
  qs('#modalComprovantesTitulo').textContent =
    `📎 Comprovantes — Abastecimento #${abastecimentoId} · ${getVeiculoPrefixo(it.veiculoId)}`;
  await renderListaComprovantes(abastecimentoId);
  modal.classList.add('open');
}

async function renderListaComprovantes(abastecimentoId) {
  const lista = qs('#listaComprovantes');
  if (!lista) return;
  lista.innerHTML = '<div style="color:rgba(243,232,198,.4);font-size:12px;padding:8px">Carregando...</div>';
  try {
    const docs = await dbGetComprovantes(Number(abastecimentoId));
    if (!docs.length) {
      lista.innerHTML = '<div style="color:rgba(243,232,198,.35);font-size:13px;text-align:center;padding:20px">Nenhum comprovante anexado.</div>';
      return;
    }
    lista.innerHTML = docs.map(d => {
      const isImg = d.tipo && d.tipo.startsWith('image/');
      const isPdf = d.tipo === 'application/pdf';
      const icon  = isImg ? '🖼' : isPdf ? '📄' : '📎';
      const sz    = d.tamanho > 1024*1024
        ? `${(d.tamanho/1024/1024).toFixed(1)} MB`
        : `${(d.tamanho/1024).toFixed(0)} KB`;
      return `<div class="comprovante-item">
        <span class="comprovante-icon">${icon}</span>
        <div class="comprovante-info">
          <strong>${d.nome}</strong>
          <span>${sz} · ${new Date(d.data).toLocaleString('pt-BR')}</span>
        </div>
        <div class="comprovante-actions">
          <button class="btn btn-small" onclick="visualizarComprovante(${d.id})">👁 Ver</button>
          <button class="btn btn-small btn-danger" onclick="excluirComprovante(${d.id},${abastecimentoId})">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    lista.innerHTML = '<div style="color:#ff9999;font-size:12px">Erro ao carregar comprovantes.</div>';
  }
}

async function uploadComprovante() {
  const abastecimentoId = Number(qs('#modalComprovantesId').value);
  const input = qs('#inputComprovante');
  if (!input || !input.files.length) return;
  const file = input.files[0];
  // Limite de 20MB por arquivo
  if (file.size > 20 * 1024 * 1024) {
    alert('Arquivo muito grande. Limite: 20 MB por comprovante.');
    return;
  }
  const btnUp = qs('#btnUploadComprovante');
  if (btnUp) { btnUp.textContent = '⏳ Salvando...'; btnUp.disabled = true; }
  try {
    const arrayBuffer = await file.arrayBuffer();
    await dbSalvarComprovante({
      abastecimentoId,
      nome:    file.name,
      tipo:    file.type,
      tamanho: file.size,
      blob:    new Blob([arrayBuffer], { type: file.type }),
    });
    input.value = '';
    await renderListaComprovantes(abastecimentoId);
    // Atualizar contador no botão do modal de detalhe
    atualizarBadgeComprovante(abastecimentoId);
  } catch(e) {
    alert('Erro ao salvar comprovante: ' + e.message);
  } finally {
    if (btnUp) { btnUp.textContent = '⬆ Enviar'; btnUp.disabled = false; }
  }
}

async function visualizarComprovante(docId) {
  try {
    const all = await idbGetAll('comprovantes');
    const doc = all.find(d => d.id === docId);
    if (!doc) { alert('Comprovante não encontrado.'); return; }
    const blob = doc.blob instanceof Blob ? doc.blob : new Blob([doc.blob], { type: doc.tipo });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e) {
    alert('Erro ao abrir comprovante: ' + e.message);
  }
}

async function visualizarComprovanteAbastecimento(abastecimentoId) {
  const docs = await dbGetComprovantes(Number(abastecimentoId)).catch(()=>[]);
  if (!docs.length) {
    alert('Este abastecimento ainda não possui comprovante anexado.');
    abrirModalComprovantes(abastecimentoId);
    return;
  }
  if (docs.length === 1) {
    visualizarComprovante(docs[0].id);
    return;
  }
  abrirModalComprovantes(abastecimentoId);
}

async function imprimirComprovanteAbastecimento(abastecimentoId) {
  const it = findById('abastecimentos', abastecimentoId);
  const docs = await dbGetComprovantes(Number(abastecimentoId)).catch(()=>[]);
  if (!docs.length) {
    alert('Este abastecimento ainda não possui comprovante anexado.');
    abrirModalComprovantes(abastecimentoId);
    return;
  }
  const dt = new Date().toLocaleString('pt-BR');
  const parts = [];
  for (const doc of docs) {
    const blob = doc.blob instanceof Blob ? doc.blob : new Blob([doc.blob], { type: doc.tipo || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if ((doc.tipo||'').startsWith('image/')) {
      parts.push(`<section class="doc"><h2>${doc.nome||'Comprovante'}</h2><img src="${url}" /></section>`);
    } else if (doc.tipo === 'application/pdf') {
      parts.push(`<section class="doc"><h2>${doc.nome||'Comprovante PDF'}</h2><iframe src="${url}"></iframe></section>`);
    } else {
      parts.push(`<section class="doc"><h2>${doc.nome||'Comprovante'}</h2><p>Arquivo anexado. Abra pelo sistema para visualizar este formato.</p></section>`);
    }
  }
  const w = window.open('','_blank','width=1000,height=700');
  if (!w) { alert('Permita pop-ups para imprimir.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Comprovante #${abastecimentoId}</title>
  <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#111}
  .hdr{border-bottom:3px solid #0e2147;margin-bottom:14px;padding-bottom:10px}
  .hdr h1{font-size:15px;color:#0e2147;margin:0;text-transform:uppercase}
  .hdr p{font-size:11px;color:#555;margin:4px 0 0}
  .doc{break-inside:avoid;margin:0 0 18px}.doc h2{font-size:12px;color:#0e2147;margin:0 0 8px}
  img{max-width:100%;max-height:88vh;display:block;margin:auto}iframe{width:100%;height:88vh;border:1px solid #ccd6eb}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <div class="hdr"><h1>Comprovante de abastecimento #${abastecimentoId}</h1>
  <p>Autorização: ${it?.autorizacao||'-'} · ${getVeiculoPrefixo(it?.veiculoId)} · ${getVehiclePlate(it?.veiculoId)} · Emitido em ${dt}</p></div>
  ${parts.join('')}
  <script>window.onload=function(){setTimeout(function(){window.print();},500)}<\/script></body></html>`);
  w.document.close();
}

async function excluirComprovante(docId, abastecimentoId) {
  if (!confirm('Excluir este comprovante?')) return;
  await dbExcluirComprovante(docId);
  await renderListaComprovantes(abastecimentoId);
  atualizarBadgeComprovante(abastecimentoId);
}

async function atualizarBadgeComprovante(abastecimentoId) {
  const docs = await dbGetComprovantes(Number(abastecimentoId)).catch(()=>[]);
  const badge = qs(`[data-badge-abast="${abastecimentoId}"]`);
  if (badge) badge.textContent = docs.length > 0 ? ` (${docs.length})` : '';
}

function fecharModalComprovantes() {
  qs('#modalComprovantes')?.classList.remove('open');
}


// ═══════════════════════════════════════════════════════════════════
//  CONSULTA DE COMPROVANTES
// ═══════════════════════════════════════════════════════════════════
function syncComprovantesPrefixoSelect() {
  const sel = qs('#fComprovantePrefixo'); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os veículos</option>' +
    state.veiculos.filter(v=>v.ativo!==false)
      .map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
  if (state.veiculos.some(v=>String(v.id)===String(cur))) sel.value = cur;
}

async function renderComprovantesConsulta() {
  const lista = qs('#listaComprovantesConsulta'); if (!lista) return;
  const veiculoId   = qs('#fComprovantePrefixo')?.value;
  const periodoVal  = qs('#fComprovantePeriodoTipo')?.value;
  const tipoFiltro  = qs('#fComprovanteTipo')?.value;
  const nomeFiltro  = (qs('#fComprovanteNome')?.value||'').toLowerCase().trim();
  const dataIni     = qs('#fComprovanteDataIni')?.value;
  const dataFim     = qs('#fComprovanteDataFim')?.value;

  lista.innerHTML = '<div style="color:rgba(243,232,198,.4);font-size:12px;padding:8px;text-align:center">Carregando...</div>';
  try {
    // Filtrar abastecimentos — sem filtro = todos
    let abastFiltrados = (veiculoId && veiculoId!=='')
      ? state.abastecimentos.filter(a=>Number(a.veiculoId)===Number(veiculoId))
      : [...state.abastecimentos];

    // Filtro de período
    if(periodoVal&&periodoVal!=='custom'){
      const dias=Number(periodoVal);
      const corte=new Date(); corte.setDate(corte.getDate()-dias);
      const corteIso=corte.toISOString().slice(0,10);
      abastFiltrados=abastFiltrados.filter(a=>(a.dataAbastecimento||'')>=corteIso);
    } else if(periodoVal==='custom'){
      if(dataIni) abastFiltrados=abastFiltrados.filter(a=>(a.dataAbastecimento||'')>=dataIni);
      if(dataFim) abastFiltrados=abastFiltrados.filter(a=>(a.dataAbastecimento||'')<=dataFim);
    }

    // Buscar comprovantes
    const resultados = [];
    for(const a of abastFiltrados){
      const docs = await dbGetComprovantes(a.id);
      docs.forEach(d=>resultados.push({...d,abast:a}));
    }

    // Filtro tipo de arquivo
    let filtrados = resultados;
    if(tipoFiltro==='pdf')   filtrados=filtrados.filter(d=>d.tipo==='application/pdf');
    if(tipoFiltro==='image') filtrados=filtrados.filter(d=>d.tipo?.startsWith('image/'));
    if(tipoFiltro==='other') filtrados=filtrados.filter(d=>d.tipo!=='application/pdf'&&!d.tipo?.startsWith('image/'));
    if(nomeFiltro) filtrados=filtrados.filter(d=>(d.nome||'').toLowerCase().includes(nomeFiltro));

    // Resumo
    const resumoEl=qs('#comprovantesResumo');
    if(resumoEl){
      const totSz=filtrados.reduce((s,d)=>s+num(d.tamanho),0);
      const szStr=totSz>1024*1024?`${(totSz/1024/1024).toFixed(1)} MB`:`${(totSz/1024).toFixed(0)} KB`;
      resumoEl.textContent=filtrados.length?`${filtrados.length} comprovante(s) · ${szStr} total`:'Nenhum resultado';
    }

    if(!filtrados.length){
      lista.innerHTML='<div style="color:rgba(243,232,198,.35);font-size:13px;text-align:center;padding:24px">Nenhum comprovante encontrado com esses filtros.</div>';
      return;
    }

    lista.innerHTML=filtrados.sort((a,b)=>b.abast.id-a.abast.id).map(d=>{
      const isImg=d.tipo?.startsWith('image/');
      const isPdf=d.tipo==='application/pdf';
      const icon=isImg?'🖼':isPdf?'📄':'📎';
      const sz=d.tamanho>1024*1024?`${(d.tamanho/1024/1024).toFixed(1)} MB`:`${(d.tamanho/1024).toFixed(0)} KB`;
      return `<div class="comprovante-item">
        <span class="comprovante-icon">${icon}</span>
        <div class="comprovante-info">
          <strong>${d.nome}</strong>
          <span>Abast. #${d.abast.id} · ${getVeiculoPrefixo(d.abast.veiculoId)} · ${getVehiclePlate(d.abast.veiculoId)} · ${formatDisplayDate(d.abast.dataAbastecimento,false)} · ${sz}</span>
        </div>
        <div class="comprovante-actions">
          <button class="btn btn-small" onclick="visualizarComprovante(${d.id})">👁 Ver</button>
          <button class="btn btn-small btn-danger" onclick="excluirComprovanteConsulta(${d.id})">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch(e){
    lista.innerHTML='<div style="color:#ff9999;font-size:12px;padding:8px">Erro ao carregar.</div>';
    console.error(e);
  }
}

async function excluirComprovanteConsulta(docId) {
  if (!confirm('Excluir este comprovante?')) return;
  await dbExcluirComprovante(docId);
  renderComprovantesConsulta();
}

async function imprimirComprovantesConsulta() {
  const veiculoId = qs('#fComprovantePrefixo')?.value;
  const abastFiltrados = veiculoId
    ? state.abastecimentos.filter(a=>Number(a.veiculoId)===Number(veiculoId))
    : state.abastecimentos;
  const resultados = [];
  for (const a of abastFiltrados) {
    const docs = await dbGetComprovantes(a.id);
    docs.forEach(d => resultados.push({ ...d, abast: a }));
  }
  if (!resultados.length) { alert('Nenhum comprovante para imprimir.'); return; }
  const dt = new Date().toLocaleString('pt-BR');
  const rows = resultados.map(d=>{
    const sz = d.tamanho>1024*1024?`${(d.tamanho/1024/1024).toFixed(1)} MB`:`${(d.tamanho/1024).toFixed(0)} KB`;
    return `<tr><td>${d.abast.id}</td><td>${getVeiculoPrefixo(d.abast.veiculoId)}</td><td>${getVehiclePlate(d.abast.veiculoId)}</td><td>${formatDisplayDate(d.abast.dataAbastecimento,false)}</td><td>${d.nome}</td><td>${sz}</td><td>${new Date(d.data).toLocaleString('pt-BR')}</td></tr>`;
  }).join('');
  const w=window.open('','_blank','width=1000,height=650');
  if(!w){alert('Permita pop-ups.');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Comprovantes</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:14px}
  h1{font-size:13px;color:#0e2147;border-bottom:3px solid #0e2147;padding-bottom:8px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse}thead tr{background:#0e2147}thead th{padding:5px;color:#fff;font-size:9px;text-align:left}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:4px 5px;border-bottom:1px solid #eee}
  .foot{margin-top:10px;font-size:8px;color:#888}@media print{@page{margin:1cm;size:A4}}</style></head><body>
  <h1>Comprovantes de Abastecimento — GCM Ipatinga · ${dt}</h1>
  <table><thead><tr><th>Abast.#</th><th>Prefixo</th><th>Placa</th><th>Data</th><th>Arquivo</th><th>Tamanho</th><th>Enviado em</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="foot">GCM Ipatinga · ${dt}</div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}


function imprimirGrafico() {
  const canvas=qs('#chartPrincipal');
  if(!canvas){alert('Nenhum gráfico para imprimir.');return;}
  const img=canvas.toDataURL('image/png');
  const titulo=qs('#chartTituloModal')?.textContent||'Análise Comparativa';
  const dt=new Date().toLocaleString('pt-BR');
  const logoPath='./assets/brasao-gcm.png';
  const w=window.open('','_blank','width=1000,height=700');
  if(!w){alert('Permita pop-ups.');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${titulo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:16px}
  .hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:14px}
  .hdr img{height:124px;width:auto;object-fit:contain}
  .hdr-text h1{font-size:14px;color:#0e2147;font-weight:800;text-transform:uppercase}
  .hdr-text h2{font-size:12px;color:#333;margin-top:3px}
  .hdr-text p{font-size:8px;color:#888;margin-top:2px}
  .chart-img{max-width:100%;border:1px solid #ccd6eb;border-radius:4px}
  .foot{margin-top:12px;font-size:8px;color:#888;border-top:1px solid #ccd6eb;padding-top:6px;display:flex;justify-content:space-between}
  @media print{@page{margin:1cm;size:A4 landscape}}</style></head><body>
  <div class="hdr">
    <img src="${logoPath}" alt="GCM Ipatinga" onerror="this.style.display='none'" />
    <div class="hdr-text">
      <h1>Guarda Civil Municipal de Ipatinga</h1>
      <h2>${titulo}</h2>
      <p>Emitido em: ${dt}</p>
    </div>
  </div>
  <img class="chart-img" src="${img}" />
  <div class="foot"><span>GCM Ipatinga — Gerenciamento de Abastecimento</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}


// ═══════════════════════════════════════════════════════════════════
//  SUB-GRÁFICOS AMPLIADOS (clique nos gráficos inferiores)
// ═══════════════════════════════════════════════════════════════════
function abrirSubGrafico(tipo) {
  _subGraficoAtual = tipo;
  const modal = qs('#modalSubGrafico'); if(!modal) return;
  const tc='rgba(243,232,198,.55)', gc='rgba(214,156,56,.1)';
  const tt={backgroundColor:'rgba(8,18,36,.95)',borderColor:'rgba(214,156,56,.4)',borderWidth:1,titleColor:'#f1c567',bodyColor:'#f3e8c6',padding:10};
  const veicsFilt=getVeicsFiltrados();
  const veicsAll=state.veiculos.filter(v=>v.ativo!==false);
  const months=get12Months();

  if(_cSubAmp){_cSubAmp.destroy();_cSubAmp=null;}
  const tabDiv=qs('#subGraficoTabela'); if(tabDiv) tabDiv.innerHTML='';

  // ── PIZZA: valor por VTR + detalhes completos ao clicar ──
  if(tipo==='pizza'){
    qs('#subGraficoTitulo').textContent=`🍕 Valor total por veículo — ${_chartAno}`;
    const labels=veicsAll.map(v=>v.prefixo);
    const dataVal=veicsAll.map(v=>state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`)).reduce((s,i)=>s+num(i.valorTotal),0));
    const bgs=veicsAll.map(v=>VTR_COLORS[getVtrColorIdx(v.id)%VTR_COLORS.length]);
    const ctx=qs('#chartSubAmpliado')?.getContext('2d');
    if(ctx){
      _cSubAmp=new Chart(ctx,{type:'doughnut',
        data:{labels,datasets:[{data:dataVal,backgroundColor:bgs,borderWidth:2,borderColor:'rgba(5,12,24,.6)',hoverOffset:18}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'52%',animation:{duration:600},
          plugins:{
            legend:{position:'right',labels:{color:tc,font:{size:12},boxWidth:14,padding:14}},
            tooltip:{...tt,callbacks:{label:c=>` ${c.label}: ${brl(c.parsed)}`}}
          }
        }
      });

      // Clique na fatia → detalhes completos da VTR
      ctx.canvas.onclick=(evt)=>{
        const pts=_cSubAmp.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
        if(!pts.length) return;
        const idx=pts[0].index;
        const v=veicsAll[idx]; if(!v) return;
        const its=state.abastecimentos
          .filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`))
          .sort((a,b)=>(a.dataAbastecimento||'').localeCompare(b.dataAbastecimento||''));
        const totL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
        const totV=its.reduce((s,i)=>s+num(i.valorTotal),0);
        const kms=its.map(a=>num(a.kmAtual)).filter(k=>k>0).sort((a,b)=>a-b);
        const kmL=kms.length>=2&&totL>0?+((kms[kms.length-1]-kms[0])/totL).toFixed(2):null;
        const mediaP=totL>0?(totV/totL).toFixed(3):'—';
        // Header resumo
        const hdr=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
          ${[['🚗 Prefixo',v.prefixo],['🔢 Placa',v.placa],['⛽ Abastecimentos',its.length],['💧 Litros totais',totL.toLocaleString('pt-BR')+' L'],['💰 Valor total',brl(totV)],['📊 Preço médio',`R$ ${mediaP}/L`],['🛣 KM/L estimado',kmL?kmL+' km/L':'—'],['📅 Ano',_chartAno]]
          .map(([k,v2])=>`<div style="background:rgba(214,156,56,.07);border:1px solid rgba(214,156,56,.15);border-radius:8px;padding:8px 10px">
            <div style="font-size:9px;color:rgba(243,232,198,.45);text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px">${k}</div>
            <div style="font-size:13px;color:#f3e8c6;font-weight:700">${v2}</div></div>`).join('')}
        </div>`;
        // Tabela detalhada de todos os abastecimentos
        const rows=its.map(a=>`<tr>
          <td>${formatDisplayDate(a.dataAbastecimento,false)}</td>
          <td>${a.horaAbastecimento||'—'}</td>
          <td>${getSetorName(a.setorId)}</td>
          <td>${getMotoristaName(a.motoristaId)}</td>
          <td>${num(a.kmAtual).toLocaleString('pt-BR')} km</td>
          <td>${num(a.qtdLitros).toLocaleString('pt-BR')} L</td>
          <td>${brl(a.valorUnitario)}/L</td>
          <td>${brl(a.valorTotal)}</td>
          <td>${a.autorizacao||'—'}</td>
        </tr>`).join('');
        tabDiv.innerHTML=hdr+`<table>
          <thead><tr><th>Data</th><th>Hora</th><th>Setor</th><th>Motorista</th><th>KM atual</th><th>Litros</th><th>R$/L</th><th>Total</th><th>Autorização</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="9" style="text-align:center;opacity:.4">Nenhum registro no período.</td></tr>'}</tbody>
        </table>`;
      };
    }
    // Tabela resumo inicial (sem VTR selecionada)
    const total=dataVal.reduce((s,v)=>s+v,0);
    tabDiv.innerHTML=`<div style="font-size:11px;color:rgba(243,232,198,.4);margin-bottom:8px;font-style:italic">Clique em uma fatia para ver todos os abastecimentos da viatura</div>
      <table><thead><tr><th>Veículo</th><th>Placa</th><th>Abastecimentos</th><th>Litros</th><th>Valor total</th><th>% do total</th></tr></thead><tbody>${
      veicsAll.map((v,i)=>{
        const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`));
        const totL=its.reduce((s,ii)=>s+num(ii.qtdLitros),0);
        const pct=total>0?(dataVal[i]/total*100).toFixed(1):'0.0';
        return`<tr style="cursor:pointer" onclick="abrirSubGraficoPizzaVtr(${v.id})" title="Ver detalhes da ${v.prefixo}">
          <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bgs[i]};margin-right:6px"></span>${v.prefixo}</td>
          <td>${v.placa}</td><td>${its.length}</td><td>${totL.toLocaleString('pt-BR')} L</td><td>${brl(dataVal[i])}</td><td>${pct}%</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  // ── KM/ABASTECIMENTO + CONSUMO TOTAL ──
  else if(tipo==='preco'){
    qs('#subGraficoTitulo').textContent=`⛽ KM por Abastecimento e Consumo (L) — ${_chartAno}`;
    // Dataset 1: litros por mês por VTR (barras)
    // Dataset 2: nº de abastecimentos por mês (linha)
    const datasets=[];
    veicsFilt.forEach((v,ci2)=>{
      const realCi=getVtrColorIdx(v.id);
      const litrosMes=months.map(m=>{const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(m.iso));return its.reduce((s,i)=>s+num(i.qtdLitros),0);});
      datasets.push({...buildVtrBarDs(v.prefixo+' (L)',litrosMes,realCi),yAxisID:'yL'});
    });
    // Linha de nº total de abastecimentos (todos os veículos)
    const qtdMes=months.map(m=>state.abastecimentos.filter(a=>veicsFilt.some(v=>v.id===Number(a.veiculoId))&&(a.dataAbastecimento||'').startsWith(m.iso)).length);
    datasets.push({label:'Nº abastecimentos',data:qtdMes,type:'line',borderColor:'rgba(241,197,103,.9)',backgroundColor:'rgba(241,197,103,.15)',borderWidth:2,pointRadius:5,pointBackgroundColor:'#f1c567',yAxisID:'yQtd',spanGaps:true,tension:0.35});
    const ctx=qs('#chartSubAmpliado')?.getContext('2d');
    if(ctx) _cSubAmp=new Chart(ctx,{type:'bar',data:{labels:months.map(m=>m.label),datasets},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{color:tc,font:{size:10},boxWidth:10,padding:8}},tooltip:{...tt}},
        scales:{
          x:{ticks:{color:tc,font:{size:10}},grid:{color:gc},border:{color:'rgba(214,156,56,.2)'}},
          yL:{type:'linear',position:'left',ticks:{color:tc,font:{size:10},count:6},grid:{color:gc,borderDash:[4,4]},title:{display:true,text:'Litros',color:tc,font:{size:10}}},
          yQtd:{type:'linear',position:'right',ticks:{color:tc,font:{size:10}},grid:{display:false},title:{display:true,text:'Nº Abast.',color:tc,font:{size:10}}}
        }}});
    // Tabela: litros e qtd por mês por VTR
    const rows2=months.map(m=>{
      const cols=veicsFilt.map(v=>{
        const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(m.iso));
        const totL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
        return its.length?`${its.length}× · ${totL.toLocaleString('pt-BR')} L`:'—';
      }).join('</td><td>');
      return`<tr><td>${m.label}</td><td>${cols}</td></tr>`;
    }).join('');
    tabDiv.innerHTML=`<table><thead><tr><th>Mês</th>${veicsFilt.map(v=>`<th>${v.prefixo}</th>`).join('')}</tr></thead><tbody>${rows2}</tbody></table>`;
  }

  // ── RANKING: Litros totais + KM/L ──
  else if(tipo==='ranking'){
    qs('#subGraficoTitulo').textContent=`🏆 Ranking — Litros Totais e KM/L — ${_chartAno}`;
    const ranked=veicsAll.map(v=>{
      const its=state.abastecimentos.filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`));
      const totL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
      const tV=its.reduce((s,i)=>s+num(i.valorTotal),0);
      const kms=its.map(a=>num(a.kmAtual)).filter(k=>k>0).sort((a,b)=>a-b);
      const kmL=kms.length>=2&&totL>0?+((kms[kms.length-1]-kms[0])/totL).toFixed(2):null;
      const mediaP=totL>0?(tV/totL).toFixed(3):null;
      return{v,litros:totL,kmL,tV,qtd:its.length,mediaP,ci:getVtrColorIdx(v.id)};
    }).sort((a,b)=>b.litros-a.litros);
    const ctx=qs('#chartSubAmpliado')?.getContext('2d');
    if(ctx) _cSubAmp=new Chart(ctx,{type:'bar',
      data:{labels:ranked.map(r=>r.v.prefixo),
        datasets:[
          {label:'Litros (L)',data:ranked.map(r=>r.litros),backgroundColor:ranked.map(r=>VTR_FILLS[r.ci%VTR_FILLS.length]),borderColor:ranked.map(r=>VTR_COLORS[r.ci%VTR_COLORS.length]),borderWidth:2,borderRadius:5,yAxisID:'yL'},
          {label:'KM/L',data:ranked.map(r=>r.kmL),type:'line',borderColor:'rgba(241,197,103,.9)',backgroundColor:'rgba(241,197,103,.15)',borderWidth:2,pointRadius:7,pointBackgroundColor:'#f1c567',yAxisID:'yKm',spanGaps:true},
        ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:500},interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{color:tc,font:{size:11},boxWidth:10,padding:10}},
          tooltip:{...tt,callbacks:{label:c=>{
            if(c.dataset.label==='Litros (L)') return ` Litros: ${c.parsed.x.toLocaleString('pt-BR')} L`;
            return c.parsed.x!=null?` KM/L: ${c.parsed.x} km/L`:' KM/L: —';
          }}}},
        scales:{x:{display:false},
          yL:{ticks:{color:tc,font:{size:12}},grid:{display:false},border:{color:'rgba(214,156,56,.2)'}},
          yKm:{display:false,position:'right'}}}});
    tabDiv.innerHTML=`<table><thead><tr>
      <th>Pos.</th><th>Veículo</th><th>Placa</th><th>Abastecimentos</th>
      <th>Litros totais</th><th>Valor total</th><th>Preço médio/L</th><th>KM/L est.</th>
    </tr></thead><tbody>${
      ranked.map((r,i)=>`<tr>
        <td><strong>${i+1}º</strong></td><td>${r.v.prefixo}</td><td>${r.v.placa}</td>
        <td>${r.qtd}</td><td>${r.litros.toLocaleString('pt-BR')} L</td><td>${brl(r.tV)}</td>
        <td>${r.mediaP?`R$ ${r.mediaP}/L`:'—'}</td><td>${r.kmL!=null?r.kmL+' km/L':'—'}</td>
      </tr>`).join('')
    }</tbody></table>`;
  }

  modal.classList.add('open');
}

// Clique na linha da tabela de pizza → detalha VTR
function abrirSubGraficoPizzaVtr(veiculoId) {
  const v=state.veiculos.find(vv=>vv.id===Number(veiculoId)); if(!v) return;
  const tabDiv=qs('#subGraficoTabela'); if(!tabDiv) return;
  const its=state.abastecimentos
    .filter(a=>Number(a.veiculoId)===v.id&&(a.dataAbastecimento||'').startsWith(`${_chartAno}-`))
    .sort((a,b)=>(a.dataAbastecimento||'').localeCompare(b.dataAbastecimento||''));
  const totL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
  const totV=its.reduce((s,i)=>s+num(i.valorTotal),0);
  const kms=its.map(a=>num(a.kmAtual)).filter(k=>k>0).sort((a,b)=>a-b);
  const kmL=kms.length>=2&&totL>0?+((kms[kms.length-1]-kms[0])/totL).toFixed(2):null;
  const mediaP=totL>0?(totV/totL).toFixed(3):'—';
  const ci=getVtrColorIdx(v.id);
  const cor=VTR_COLORS[ci%VTR_COLORS.length];
  const hdr=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
    <div style="width:14px;height:14px;border-radius:50%;background:${cor};flex-shrink:0"></div>
    <strong style="font-size:14px;color:#f1c567">${v.prefixo} · ${v.placa}</strong>
    <span style="font-size:11px;color:rgba(243,232,198,.5);margin-left:auto">${_chartAno}</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">${
    [['Abastecimentos',its.length],['Litros totais',totL.toLocaleString('pt-BR')+' L'],
     ['Valor total',brl(totV)],['Preço médio','R$ '+mediaP+'/L'],['KM/L estimado',kmL?kmL+' km/L':'—']].map(([k,val])=>
    `<div style="background:rgba(214,156,56,.07);border:1px solid rgba(214,156,56,.12);border-radius:7px;padding:7px 10px">
      <div style="font-size:9px;color:rgba(243,232,198,.4);text-transform:uppercase;letter-spacing:.3px">${k}</div>
      <div style="font-size:12px;color:#f3e8c6;font-weight:700;margin-top:2px">${val}</div></div>`).join('')}
  </div>`;
  const rows=its.map(a=>`<tr>
    <td>${formatDisplayDate(a.dataAbastecimento,false)}</td>
    <td>${a.horaAbastecimento||'—'}</td>
    <td>${getSetorName(a.setorId)}</td>
    <td>${getMotoristaName(a.motoristaId)}</td>
    <td>${num(a.kmAtual).toLocaleString('pt-BR')} km</td>
    <td>${num(a.qtdLitros).toLocaleString('pt-BR')} L</td>
    <td>${brl(a.valorUnitario)}/L</td>
    <td>${brl(a.valorTotal)}</td>
    <td>${a.autorizacao||'—'}</td>
  </tr>`).join('');
  tabDiv.innerHTML=hdr+`<table>
    <thead><tr><th>Data</th><th>Hora</th><th>Setor</th><th>Motorista</th><th>KM atual</th><th>Litros</th><th>R$/L</th><th>Total</th><th>Autorização</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="9" style="text-align:center;opacity:.4">Sem registros.</td></tr>'}</tbody>
  </table>`;
  tabDiv.scrollTop=0;
}


function fecharSubGrafico() {
  qs('#modalSubGrafico')?.classList.remove('open');
  _subGraficoAtual=null;
}

function imprimirSubGrafico() {
  const canvas=qs('#chartSubAmpliado');
  const tabDiv=qs('#subGraficoTabela');
  const titulo=qs('#subGraficoTitulo')?.textContent||'Gráfico';
  const dt=new Date().toLocaleString('pt-BR');
  const imgSrc=canvas?canvas.toDataURL('image/png'):'';
  const tabelaHtml=tabDiv?.innerHTML||'';
  const logoPath='./assets/brasao-gcm.png';
  const w=window.open('','_blank','width=1000,height=750');
  if(!w){alert('Permita pop-ups.');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${titulo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:16px}
  .hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:14px}
  .hdr img{height:124px;width:auto;object-fit:contain}
  .hdr-text h1{font-size:13px;color:#0e2147;font-weight:800;text-transform:uppercase}
  .hdr-text h2{font-size:11px;color:#333;font-weight:400;margin-top:2px}
  .hdr-text p{font-size:8px;color:#888;margin-top:2px}
  .chart-img{max-width:100%;border:1px solid #ccd6eb;border-radius:4px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:9px;margin-top:10px}
  thead tr{background:#0e2147}thead th{padding:5px 6px;color:#fff;font-weight:700;text-align:left}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:4px 6px;border-bottom:1px solid #e0e6f0}
  .foot{margin-top:12px;font-size:8px;color:#888;border-top:1px solid #ccd6eb;padding-top:6px;display:flex;justify-content:space-between}
  @media print{@page{margin:1cm;size:A4 landscape}}</style></head><body>
  <div class="hdr">
    <img src="${logoPath}" alt="Logo GCM Ipatinga" onerror="this.style.display='none'" />
    <div class="hdr-text">
      <h1>Guarda Civil Municipal de Ipatinga</h1>
      <h2>${titulo}</h2>
      <p>Emitido em: ${dt}</p>
    </div>
  </div>
  ${imgSrc?`<img class="chart-img" src="${imgSrc}" />`:''}
  ${tabelaHtml}
  <div class="foot"><span>GCM Ipatinga — Sistema de Gerenciamento de Abastecimento</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}


// ═══════════════════════════════════════════════════════════════════
//  COMPROVANTES EMBUTIDOS NO MODAL DE DETALHES
// ═══════════════════════════════════════════════════════════════════

async function renderComprovantesModal(abastecimentoId) {
  const lista = qs('#listaComprovantesModal'); if(!lista) return;
  lista.innerHTML = '<div class="comp-vazio">Carregando...</div>';
  try {
    const docs = await dbGetComprovantes(Number(abastecimentoId));
    if(!docs.length) {
      lista.innerHTML = '<div class="comp-vazio">Nenhum comprovante anexado.</div>';
      return;
    }
    lista.innerHTML = docs.map(d => {
      const isImg = d.tipo?.startsWith('image/');
      const isPdf = d.tipo === 'application/pdf';
      const icon  = isImg ? '🖼' : isPdf ? '📄' : '📎';
      const sz    = d.tamanho > 1024*1024
        ? `${(d.tamanho/1024/1024).toFixed(1)} MB`
        : `${(d.tamanho/1024).toFixed(0)} KB`;
      const dataStr = d.data ? new Date(d.data).toLocaleString('pt-BR') : '';
      return `<div class="comp-row">
        <span class="comp-row-icon">${icon}</span>
        <div class="comp-row-info">
          <strong>${d.nome}</strong>
          <span>${sz}${dataStr?' · '+dataStr:''}</span>
        </div>
        <div class="comp-row-actions">
          <button class="comp-btn-ver" onclick="visualizarComprovanteModal(${d.id})">👁 Ver</button>
          <button class="comp-btn-del" onclick="excluirComprovanteModal(${d.id},${abastecimentoId})">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    lista.innerHTML = '<div class="comp-vazio" style="color:#ff9999">Erro ao carregar.</div>';
    console.error(e);
  }
}

async function uploadComprovanteModal() {
  const inp = qs('#inputComprovanteModal');
  const abastecimentoId = _modalAbastId;
  if(!inp || !inp.files.length || !abastecimentoId) return;
  const file = inp.files[0];
  if(file.size > 20*1024*1024) { alert('Arquivo muito grande. Limite: 20 MB.'); inp.value=''; return; }
  const lista = qs('#listaComprovantesModal');
  if(lista) lista.innerHTML = '<div class="comp-vazio">Salvando...</div>';
  try {
    const buf = await file.arrayBuffer();
    await dbSalvarComprovante({
      abastecimentoId: Number(abastecimentoId),
      nome: file.name, tipo: file.type, tamanho: file.size,
      blob: new Blob([buf], {type: file.type})
    });
    inp.value = '';
    await renderComprovantesModal(abastecimentoId);
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
    await renderComprovantesModal(abastecimentoId);
  }
}

async function visualizarComprovanteModal(docId) {
  try {
    const all = await idbGetAll('comprovantes');
    const doc = all.find(d => d.id === docId);
    if(!doc) { alert('Comprovante não encontrado.'); return; }
    const blob = doc.blob instanceof Blob ? doc.blob : new Blob([doc.blob], {type: doc.tipo});
    const isImg = doc.tipo?.startsWith('image/');
    if(isImg) {
      // Lightbox inline
      const url = URL.createObjectURL(blob);
      const img = qs('#lightboxImg');
      const nome = qs('#lightboxNome');
      if(img) { img.src = url; img._blobUrl = url; }
      if(nome) nome.textContent = doc.nome;
      qs('#lightboxViewer').classList.add('open');
    } else {
      // PDF ou outro: nova aba
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  } catch(e) {
    alert('Erro ao abrir: ' + e.message);
  }
}

function fecharLightbox() {
  const lb = qs('#lightboxViewer');
  if(!lb) return;
  lb.classList.remove('open');
  const img = qs('#lightboxImg');
  if(img && img._blobUrl) { URL.revokeObjectURL(img._blobUrl); img._blobUrl = null; img.src = ''; }
}

async function excluirComprovanteModal(docId, abastecimentoId) {
  if(!confirm('Excluir este comprovante?')) return;
  await dbExcluirComprovante(docId);
  await renderComprovantesModal(abastecimentoId);
}


// ═══════════════════════════════════════════════════════════════════
//  SPLASH CARDS — detalhamento dos cards do dashboard
// ═══════════════════════════════════════════════════════════════════
let _splashTipo = null;
let _splashConsultaFilters = null;
let _splashLitrosView = 'cards';

function isConsultaScreenActive() {
  return qs('#consulta')?.classList.contains('active');
}

function getSplashBaseAbastecimentos() {
  const base = _splashConsultaFilters
    ? getFilteredAbastecimentos(_splashConsultaFilters)
    : state.abastecimentos;
  return [...base].sort((a,b)=>b.id-a.id);
}

function getSplashContextCards(miniCard) {
  if (!_splashConsultaFilters) return '';
  const f = _splashConsultaFilters;
  const itens = [];
  if (f.autorizacao) itens.push(miniCard('Autorização', f.autorizacao));
  if (f.id) itens.push(miniCard('ID filtrado', f.id));
  if (f.dataIni || f.dataFim) itens.push(miniCard('Período consulta', `${f.dataIni?formatDisplayDate(f.dataIni,false):'início'} até ${f.dataFim?formatDisplayDate(f.dataFim,false):'fim'}`));
  if (f.setorId) itens.push(miniCard('Setor', getSetorName(f.setorId)));
  if (f.veiculoId) itens.push(miniCard('Veículo', getVeiculoPrefixo(f.veiculoId)));
  if (f.placa) itens.push(miniCard('Placa', f.placa));
  if (f.motoristaId) itens.push(miniCard('Motorista', getMotoristaName(f.motoristaId).split(' ').slice(0,2).join(' ')));
  if (f.combustivelId) itens.push(miniCard('Combustível', getCombustivelName(f.combustivelId)));
  if (f.termoLivre) itens.push(miniCard('Busca livre', f.termoLivre));
  return itens.join('');
}

// ── Splash "Total de Abastecimentos": helper Todos ────────────────
function splashAbastSetTodos() {
  const i = qs('#splashAbastDataIni'); if (i) i.value = '';
  const f = qs('#splashAbastDataFim'); if (f) f.value = '';
  renderSplashAbast();
}

// ── Splash "Total de Abastecimentos": render reativo ──────────────
function renderSplashAbast() {
  if (_splashTipo !== 'abastecimentos') return;
  const dataIni  = qs('#splashAbastDataIni')?.value  || '';
  const dataFim  = qs('#splashAbastDataFim')?.value  || '';
  const veicFilt = qs('#splashAbastVeiculo')?.value  || '';
  const combFilt = qs('#splashAbastCombustivel')?.value || '';
  const baseAbast = getSplashBaseAbastecimentos();

  // Label período para subtítulo
  let rangeLabel = '';
  if (dataIni && dataFim) rangeLabel = `${formatDisplayDate(dataIni,false)} → ${formatDisplayDate(dataFim,false)}`;
  else if (dataIni) rangeLabel = `a partir de ${formatDisplayDate(dataIni,false)}`;
  else if (dataFim) rangeLabel = `até ${formatDisplayDate(dataFim,false)}`;
  const subEl = qs('#splashLitrosSubperiodo');
  if (subEl) subEl.textContent = rangeLabel;

  const abastFilt = baseAbast.filter(a => {
    const dt = a.dataAbastecimento || a.dataLancamento || '';
    if (dataIni && dt < dataIni) return false;
    if (dataFim && dt > dataFim) return false;
    if (veicFilt && String(a.veiculoId) !== String(veicFilt)) return false;
    if (combFilt) {
      const v = getVeiculo(a.veiculoId);
      if (!v || String(v.combustivelId) !== String(combFilt)) return false;
    }
    return true;
  }).sort((a,b) => b.id - a.id);

  const totL = abastFilt.reduce((s,i)=>s+num(i.qtdLitros),0);
  const totV = abastFilt.reduce((s,i)=>s+num(i.valorTotal),0);
  const veicsUsados = new Set(abastFilt.map(a=>a.veiculoId)).size;

  function miniCard(label, valor) {
    return `<div class="splash-mini-card"><span>${label}</span><strong>${valor}</strong></div>`;
  }

  const resumo = qs('#splashCardResumo');
  if (resumo) {
    resumo.innerHTML =
      getSplashContextCards(miniCard) +
      miniCard('Registros', abastFilt.length) +
      miniCard('Litros total', totL.toLocaleString('pt-BR',{minimumFractionDigits:1}) + ' L') +
      miniCard('Valor total', brl(totV)) +
      miniCard('Viaturas', veicsUsados) +
      miniCard('Data inicial', dataIni ? formatDisplayDate(dataIni, false) : '—') +
      miniCard('Data final', dataFim ? formatDisplayDate(dataFim, false) : '—');
  }

  const lista = qs('#splashCardLista');
  if (lista) {
    if (!abastFilt.length) {
      lista.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(243,232,198,.3);font-size:13px">Nenhum registro para os filtros selecionados.</div>`;
    } else {
      lista.innerHTML = `<table>
        <thead><tr><th>ID</th><th>Data</th><th>Prefixo</th><th>Placa</th><th>Motorista</th><th>Setor</th><th>Combustível</th><th>Litros</th><th>Valor</th></tr></thead>
        <tbody>${abastFilt.map(a=>`<tr onclick="fecharSplashCard();abrirModalAbastecimento(${a.id})" style="cursor:pointer">
          <td>#${a.id}</td>
          <td>${formatDisplayDate(a.dataAbastecimento,false)}</td>
          <td>${getVeiculoPrefixo(a.veiculoId)}</td>
          <td>${getVehiclePlate(a.veiculoId)}</td>
          <td>${getMotoristaName(a.motoristaId)}</td>
          <td>${getSetorName(a.setorId)}</td>
          <td>${getCombustivelName(getVeiculo(a.veiculoId)?.combustivelId||0)}</td>
          <td>${num(a.qtdLitros).toLocaleString('pt-BR')} L</td>
          <td>${brl(a.valorTotal)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    }
  }
}

function abrirSplashCard(tipo) {
  _splashTipo = tipo;
  _splashConsultaFilters = isConsultaScreenActive() ? clone(getConsultaFilters()) : null;
  const modal = qs('#modalSplashCard'); if(!modal) return;
  const resumo = qs('#splashCardResumo');
  const lista  = qs('#splashCardLista');
  const titulo = qs('#splashCardTitulo');

  const abast = getSplashBaseAbastecimentos();
  const veics = state.veiculos.filter(v=>v.ativo!==false);

  function miniCard(label, valor) {
    return `<div class="splash-mini-card"><span>${label}</span><strong>${valor}</strong></div>`;
  }

  if(tipo === 'abastecimentos') {
    titulo.textContent = _splashConsultaFilters ? 'Consulta filtrada - abastecimentos' : '⛽ Total de Abastecimentos';
    // Mostrar barra de filtros
    const filtrosEl = qs('#splashAbastFiltros');
    if (filtrosEl) filtrosEl.style.display = '';

    // Datas padrão: últimos 30 dias
    const iniEl = qs('#splashAbastDataIni');
    const fimEl = qs('#splashAbastDataFim');
    if (_splashConsultaFilters) {
      if (iniEl) iniEl.value = _splashConsultaFilters.dataIni || '';
      if (fimEl) fimEl.value = _splashConsultaFilters.dataFim || '';
    } else {
      const fimPadrao = today();
      const iniDate = new Date(); iniDate.setDate(iniDate.getDate() - 29);
      if (iniEl && !iniEl.value) iniEl.value = toIsoDate(iniDate);
      if (fimEl && !fimEl.value) fimEl.value = fimPadrao;
    }

    // Popular veículos
    const vSel = qs('#splashAbastVeiculo');
    if (vSel) {
      vSel.innerHTML = '<option value="">Todos os veículos</option>' +
        state.veiculos.filter(v=>v.ativo!==false)
          .map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
    }
    // Popular combustíveis
    const cSel = qs('#splashAbastCombustivel');
    if (cSel) {
      cSel.innerHTML = '<option value="">Todos os combustíveis</option>' +
        state.combustiveis.filter(c=>c.ativo!==false)
          .map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
    }

    renderSplashAbast();

    ['splashAbastDataIni','splashAbastDataFim','splashAbastVeiculo','splashAbastCombustivel'].forEach(id => {
      const el = qs('#'+id); if (!el) return;
      el.removeEventListener('change', renderSplashAbast);
      el.addEventListener('change', renderSplashAbast);
    });
  }

  else if(tipo === 'litros') {
    titulo.textContent = _splashConsultaFilters ? 'Consulta filtrada - litros por veiculo' : '💧 Litros no Período — por Veículo';

    // Mostrar barra de filtros
    const filtrosEl = qs('#splashLitrosFiltros');
    if (filtrosEl) filtrosEl.style.display = '';

    // Datas padrão: último mês
    const iniEl = qs('#splashLitrosDataIni');
    const fimEl = qs('#splashLitrosDataFim');
    if (_splashConsultaFilters) {
      if (iniEl) iniEl.value = _splashConsultaFilters.dataIni || '';
      if (fimEl) fimEl.value = _splashConsultaFilters.dataFim || '';
    } else {
      const fimPadrao = today();
      const iniDate = new Date(); iniDate.setDate(iniDate.getDate() - 29);
      const iniPadrao = toIsoDate(iniDate);
      if (iniEl) iniEl.value = iniPadrao;
      if (fimEl) fimEl.value = fimPadrao;
    }

    // Popular veículos
    const veicSel = qs('#splashLitrosVeiculo');
    if (veicSel) {
      veicSel.innerHTML = '<option value="">Todos os veículos</option>' +
        state.veiculos.filter(v=>v.ativo!==false)
          .map(v=>`<option value="${v.id}">${v.prefixo} · ${v.placa}</option>`).join('');
    }

    // Popular combustíveis
    const combSel = qs('#splashLitrosCombustivel');
    if (combSel) {
      combSel.innerHTML = '<option value="">Todos os combustíveis</option>' +
        state.combustiveis.filter(c=>c.ativo!==false)
          .map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
    }

    // View padrão
    _splashLitrosView = 'cards';
    splashLitrosSetView('cards');

    renderSplashLitros();

    // Listeners reativos
    ['splashLitrosDataIni','splashLitrosDataFim','splashLitrosVeiculo','splashLitrosCombustivel'].forEach(id => {
      const el = qs('#'+id);
      if (el) {
        el.removeEventListener('change', renderSplashLitros);
        el.addEventListener('change', renderSplashLitros);
      }
    });
  }

  else if(tipo === 'valor') {
    titulo.textContent = '💰 Valor Total — por Veículo';
    if (_splashConsultaFilters) titulo.textContent = 'Consulta filtrada - valor por veiculo';
    const porVeic = veics.map(v=>{
      const its = abast.filter(a=>Number(a.veiculoId)===v.id);
      const totV2 = its.reduce((s,i)=>s+num(i.valorTotal),0);
      const totL2 = its.reduce((s,i)=>s+num(i.qtdLitros),0);
      return { v, valor: totV2, litros: totL2, qtd: its.length,
        mediaL: totL2>0?(totV2/totL2).toFixed(3):null };
    }).filter(r => !_splashConsultaFilters || r.qtd > 0)
      .sort((a,b)=>b.valor-a.valor);
    const totGeral = porVeic.reduce((s,r)=>s+r.valor,0);
    const totLitrosValor = porVeic.reduce((s,r)=>s+r.litros,0);
    const totRegistrosValor = porVeic.reduce((s,r)=>s+r.qtd,0);
    const registroUnicoValor = _splashConsultaFilters?.autorizacao && abast.length === 1 ? abast[0] : null;
    const maxV = porVeic[0]?.valor||1;
    resumo.innerHTML =
      getSplashContextCards(miniCard) +
      miniCard('Valor total', brl(totGeral)) +
      miniCard('Maior gasto', porVeic[0]?.v.prefixo||'—') +
      (registroUnicoValor ? miniCard('KM registro', num(registroUnicoValor.kmAtual).toLocaleString('pt-BR') + ' km') : miniCard('Veículos', porVeic.filter(r=>r.valor>0).length)) +
      (registroUnicoValor ? miniCard('Data abast.', formatDisplayDate(registroUnicoValor.dataAbastecimento,false)) : miniCard('Abastecimentos', totRegistrosValor)) +
      miniCard('Litros total', totLitrosValor.toLocaleString('pt-BR',{minimumFractionDigits:1}) + ' L');
    lista.innerHTML = `<table>
      <thead><tr><th>Prefixo</th><th>Placa</th><th>Abastecimentos</th><th>Litros</th><th>Preço médio/L</th><th>Valor total</th><th>% do total</th></tr></thead>
      <tbody>${porVeic.map(r=>{
        const pct = totGeral>0?(r.valor/totGeral*100).toFixed(1):'0.0';
        const bar = `<div style="height:6px;border-radius:3px;background:rgba(78,207,126,.1);width:100%;min-width:80px">
          <div style="height:100%;border-radius:3px;background:rgba(78,207,126,.6);width:${totGeral>0?r.valor/maxV*100:0}%"></div></div>`;
        return `<tr>
          <td>${r.v.prefixo}</td><td>${r.v.placa}</td>
          <td>${r.qtd}</td>
          <td>${r.litros.toLocaleString('pt-BR')} L</td>
          <td>${r.mediaL?'R$ '+r.mediaL+'/L':'—'}</td>
          <td><strong>${brl(r.valor)}</strong></td>
          <td>${pct}%&nbsp;<div style="display:inline-block;vertical-align:middle;width:60px">${bar}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    if (registroUnicoValor) {
      lista.innerHTML += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:12px 14px;border:1px solid rgba(214,156,56,.22);border-radius:10px;background:rgba(214,156,56,.06);flex-wrap:wrap">
        <div style="display:flex;gap:18px;flex-wrap:wrap;color:#f3e8c6;font-size:13px">
          <span><strong style="color:#f1c567">KM:</strong> ${num(registroUnicoValor.kmAtual).toLocaleString('pt-BR')} km</span>
          <span><strong style="color:#f1c567">Data:</strong> ${formatDisplayDate(registroUnicoValor.dataAbastecimento,false)}</span>
          <span><strong style="color:#f1c567">Autorização:</strong> ${registroUnicoValor.autorizacao||'-'}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="visualizarComprovanteAbastecimento(${registroUnicoValor.id})">Ver comprovante</button>
          <button class="btn btn-print" onclick="imprimirComprovanteAbastecimento(${registroUnicoValor.id})">Imprimir comprovante</button>
        </div>
      </div>`;
    }
  }

  else if(tipo === 'precoMedio') {
    titulo.textContent = '⛽ Evolução do Preço R$/L';
    // Últimos 12 meses
    const meses = getNMonths(12);
    const totaisM = meses.map(m => {
      const its = state.abastecimentos.filter(a=>(a.dataAbastecimento||'').startsWith(m.iso)&&num(a.qtdLitros)>0);
      const tV=its.reduce((s,i)=>s+num(i.valorTotal),0);
      const tL=its.reduce((s,i)=>s+num(i.qtdLitros),0);
      return { label:m.label, media:tL>0?+(tV/tL).toFixed(3):null, qtd:its.length, tL, tV };
    });
    // Resumo geral
    const tVG=state.abastecimentos.filter(a=>num(a.qtdLitros)>0).reduce((s,i)=>s+num(i.valorTotal),0);
    const tLG=state.abastecimentos.filter(a=>num(a.qtdLitros)>0).reduce((s,i)=>s+num(i.qtdLitros),0);
    const mediaGeral = tLG>0?(tVG/tLG).toFixed(3):'—';
    const mediaValidos = totaisM.filter(m=>m.media!==null);
    const maxM = mediaValidos.length?Math.max(...mediaValidos.map(m=>m.media)):1;
    const minM = mediaValidos.length?Math.min(...mediaValidos.map(m=>m.media)):0;
    resumo.innerHTML =
      miniCard('Média geral histórica', 'R$ '+mediaGeral+'/L') +
      miniCard('Maior preço (12m)', mediaValidos.length?'R$ '+Math.max(...mediaValidos.map(m=>m.media)).toFixed(3).replace('.',',')+'/L':'—') +
      miniCard('Menor preço (12m)', mediaValidos.length?'R$ '+Math.min(...mediaValidos.map(m=>m.media)).toFixed(3).replace('.',',')+'/L':'—') +
      miniCard('Total litros', tLG.toLocaleString('pt-BR')+' L');
    // Tabela por mês
    lista.innerHTML = `<table>
      <thead><tr><th>Mês</th><th>Abastecimentos</th><th>Litros</th><th>Valor total</th><th>Média R$/L</th><th>Variação</th></tr></thead>
      <tbody>${totaisM.map((m,i)=>{
        const prev = totaisM.slice(0,i).reverse().find(p=>p.media!==null);
        let var_html = '—';
        if(m.media!==null && prev?.media) {
          const diff = m.media - prev.media;
          const pct = (diff/prev.media*100).toFixed(1);
          const cor = diff>0?'#ff9999':diff<0?'#4ecf7e':'rgba(243,232,198,.5)';
          var_html = `<span style="color:${cor};font-weight:700">${diff>0?'+':''}${pct}%</span>`;
        }
        const barW = maxM>minM&&m.media?((m.media-minM)/(maxM-minM)*100).toFixed(0):0;
        return `<tr>
          <td><strong>${m.label}</strong></td>
          <td>${m.qtd}</td>
          <td>${m.tL.toLocaleString('pt-BR')} L</td>
          <td>${brl(m.tV)}</td>
          <td>${m.media?'<strong>R$ '+m.media.toLocaleString('pt-BR',{minimumFractionDigits:3})+'/L</strong>':'—'}</td>
          <td style="min-width:120px">${var_html}
            ${m.media?`<div style="margin-top:4px;height:5px;border-radius:3px;background:rgba(255,255,255,.08);width:100%">
              <div style="height:100%;border-radius:3px;background:rgba(241,197,103,.6);width:${barW}%"></div></div>`:''}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  else if(tipo === 'veiculos') {
    titulo.textContent = '🚗 Veículos Ativos';
    resumo.innerHTML =
      miniCard('Total ativos', veics.length) +
      miniCard('Total cadastrados', state.veiculos.length) +
      miniCard('Inativos', state.veiculos.filter(v=>v.ativo===false).length);
    lista.innerHTML = `<table>
      <thead><tr><th>Prefixo</th><th>Placa</th><th>Marca/Modelo</th><th>Combustível</th><th>KM atual</th><th>Abastecimentos</th><th>Último abast.</th><th>Status</th></tr></thead>
      <tbody>${state.veiculos.map(v=>{
        const its = abast.filter(a=>Number(a.veiculoId)===v.id);
        const ultimo = its[0];
        return `<tr>
          <td><strong>${v.prefixo}</strong></td>
          <td>${v.placa}</td>
          <td>${v.marcaModelo||'—'}</td>
          <td>${getCombustivelName(v.combustivelId)}</td>
          <td>${num(v.kmAtual).toLocaleString('pt-BR')} km</td>
          <td>${its.length}</td>
          <td>${ultimo?formatDisplayDate(ultimo.dataAbastecimento,false):'—'}</td>
          <td><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;
            background:${v.ativo!==false?'rgba(78,207,126,.15)':'rgba(200,50,50,.15)'};
            color:${v.ativo!==false?'#4ecf7e':'#ff9999'};
            border:1px solid ${v.ativo!==false?'rgba(78,207,126,.3)':'rgba(200,50,50,.3)'}">
            ${v.ativo!==false?'Ativo':'Inativo'}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  else if(tipo === 'hoje') {
    titulo.textContent = '📅 Abastecimentos de Hoje';
    const hojeIso = today();
    const hojeAbast = abast.filter(a=>(a.dataAbastecimento||'')===hojeIso);
    const hojeL = hojeAbast.reduce((s,i)=>s+num(i.qtdLitros),0);
    const hojeV = hojeAbast.reduce((s,i)=>s+num(i.valorTotal),0);
    resumo.innerHTML =
      miniCard('Registros hoje', hojeAbast.length) +
      miniCard('Litros', hojeL.toLocaleString('pt-BR',{minimumFractionDigits:1})+' L') +
      miniCard('Valor total', brl(hojeV)) +
      miniCard('Viaturas', new Set(hojeAbast.map(a=>a.veiculoId)).size);
    lista.innerHTML = hojeAbast.length ? `<table>
      <thead><tr><th>ID</th><th>Hora</th><th>Prefixo</th><th>Placa</th><th>Motorista</th><th>Combustível</th><th>Litros</th><th>KM</th><th>Autorização</th><th>Valor</th></tr></thead>
      <tbody>${hojeAbast.map(a=>`<tr onclick="fecharSplashCard();abrirModalAbastecimento(${a.id})" style="cursor:pointer">
        <td>#${a.id}</td><td>${a.horaAbastecimento||'—'}</td>
        <td>${getVeiculoPrefixo(a.veiculoId)}</td><td>${getVehiclePlate(a.veiculoId)}</td>
        <td>${getMotoristaName(a.motoristaId)}</td>
        <td>${getCombustivelName(getVeiculo(a.veiculoId)?.combustivelId||0)}</td>
        <td>${num(a.qtdLitros).toLocaleString('pt-BR')} L</td>
        <td>${num(a.kmAtual).toLocaleString('pt-BR')} km</td>
        <td>${a.autorizacao||'—'}</td>
        <td>${brl(a.valorTotal)}</td>
      </tr>`).join('')}</tbody>
    </table>` : `<div style="text-align:center;padding:40px;color:rgba(243,232,198,.3);font-size:13px">Nenhum abastecimento registrado hoje.</div>`;
  }

  else if(tipo === 'motoristas') {
    titulo.textContent = '👤 Motoristas — Últimos 30 dias';
    const corte30 = new Date(); corte30.setDate(corte30.getDate()-30);
    const corteIso = toIsoDate(corte30);
    const abast30 = abast.filter(a=>(a.dataAbastecimento||'')>=corteIso);
    // Agrupa por motorista
    const porMot = state.motoristas.filter(m=>m.ativo!==false).map(m=>{
      const its = abast30.filter(a=>Number(a.motoristaId)===m.id);
      return { m, qtd:its.length, litros:its.reduce((s,i)=>s+num(i.qtdLitros),0), valor:its.reduce((s,i)=>s+num(i.valorTotal),0) };
    }).filter(r=>r.qtd>0).sort((a,b)=>b.qtd-a.qtd);
    resumo.innerHTML =
      miniCard('Motoristas ativos', porMot.length) +
      miniCard('Total abast.', abast30.length) +
      miniCard('Mais abastecimentos', porMot[0]?.m.nome.split(' ')[0]||'—') +
      miniCard('Período', `últimos 30 dias`);
    lista.innerHTML = porMot.length ? `<table>
      <thead><tr><th>Motorista</th><th>Matrícula</th><th>Abastecimentos</th><th>Litros</th><th>Valor total</th></tr></thead>
      <tbody>${porMot.map(r=>`<tr>
        <td><strong>${r.m.nome}</strong></td>
        <td>${r.m.matricula||'—'}</td>
        <td>${r.qtd}</td>
        <td>${r.litros.toLocaleString('pt-BR',{minimumFractionDigits:1})} L</td>
        <td>${brl(r.valor)}</td>
      </tr>`).join('')}</tbody>
    </table>` : `<div style="text-align:center;padding:40px;color:rgba(243,232,198,.3);font-size:13px">Nenhum abastecimento nos últimos 30 dias.</div>`;
  }

  modal.classList.add('open');
}

function fecharSplashCard() {
  qs('#modalSplashCard')?.classList.remove('open');
  const filtrosEl = qs('#splashLitrosFiltros');
  if (filtrosEl) filtrosEl.style.display = 'none';
  const filtrosAbEl = qs('#splashAbastFiltros');
  if (filtrosAbEl) filtrosAbEl.style.display = 'none';
  const cardsEl = qs('#splashLitrosCards');
  if (cardsEl) { cardsEl.style.display = 'none'; cardsEl.innerHTML = ''; }
  const listaEl = qs('#splashCardLista');
  if (listaEl) listaEl.style.display = '';
  const subEl = qs('#splashLitrosSubperiodo');
  if (subEl) subEl.textContent = '';
  _splashTipo = null;
  _splashConsultaFilters = null;
}

// ── Litros por Veículo: helper "Todos" ───────────────────────────
function splashLitrosSetTodos() {
  const iniEl = qs('#splashLitrosDataIni');
  const fimEl = qs('#splashLitrosDataFim');
  if (iniEl) iniEl.value = '';
  if (fimEl) fimEl.value = '';
  renderSplashLitros();
}

// ── Litros por Veículo: renderização com filtros ──────────────────
function renderSplashLitros() {
  if (_splashTipo !== 'litros') return;

  const dataIni    = qs('#splashLitrosDataIni')?.value  || '';
  const dataFim    = qs('#splashLitrosDataFim')?.value  || '';
  const veicFiltro = qs('#splashLitrosVeiculo')?.value  || '';
  const combFiltro = qs('#splashLitrosCombustivel')?.value || '';

  // Label do período
  let periodoLabel = 'Todos os registros';
  let dataRangeLabel = 'todos os registros';
  if (dataIni && dataFim) {
    periodoLabel = `${formatDisplayDate(dataIni, false)} → ${formatDisplayDate(dataFim, false)}`;
    dataRangeLabel = periodoLabel;
  } else if (dataIni) {
    periodoLabel = `A partir de ${formatDisplayDate(dataIni, false)}`;
    dataRangeLabel = `a partir de ${formatDisplayDate(dataIni, false)}`;
  } else if (dataFim) {
    periodoLabel = `Até ${formatDisplayDate(dataFim, false)}`;
    dataRangeLabel = `até ${formatDisplayDate(dataFim, false)}`;
  }

  // Atualizar subtítulo
  const subEl = qs('#splashLitrosSubperiodo');
  if (subEl) subEl.textContent = dataRangeLabel !== 'todos os registros' ? dataRangeLabel : '';

  // Filtrar abastecimentos por período
  const abastFilt = getSplashBaseAbastecimentos().filter(a => {
    const dt = a.dataAbastecimento || a.dataLancamento || '';
    if (dataIni && dt < dataIni) return false;
    if (dataFim && dt > dataFim) return false;
    return true;
  });

  // Filtrar veículos por seleção e combustível
  const veics = state.veiculos.filter(v => {
    if (v.ativo === false) return false;
    if (veicFiltro && String(v.id) !== String(veicFiltro)) return false;
    if (combFiltro && String(v.combustivelId) !== String(combFiltro)) return false;
    return true;
  });

  const porVeic = veics.map(v => {
    const its = abastFilt.filter(a => Number(a.veiculoId) === v.id);
    return {
      v,
      litros: its.reduce((s,i) => s + num(i.qtdLitros), 0),
      valor:  its.reduce((s,i) => s + num(i.valorTotal), 0),
      qtd: its.length
    };
  }).filter(r => !_splashConsultaFilters || r.qtd > 0)
    .sort((a,b) => b.litros - a.litros);

  const totL     = porVeic.reduce((s,r) => s + r.litros, 0);
  const totV     = porVeic.reduce((s,r) => s + r.valor,  0);
  const maxL     = porVeic[0]?.litros || 1;
  const comAbast = porVeic.filter(r => r.litros > 0);

  // Mini-cards de resumo
  function miniCard(label, valor, sub) {
    return `<div class="splash-mini-card">
      <span>${label}</span><strong>${valor}</strong>
      ${sub ? `<div style="font-size:9px;color:rgba(243,232,198,.35);margin-top:3px">${sub}</div>` : ''}
    </div>`;
  }

  const combNome = combFiltro ? getCombustivelName(combFiltro) : '';

  const resumo = qs('#splashCardResumo');
  if (resumo) {
    resumo.innerHTML =
      miniCard('Período', periodoLabel) +
      miniCard('Litros total', totL.toLocaleString('pt-BR',{minimumFractionDigits:1}) + ' L') +
      miniCard('Valor total', brl(totV)) +
      miniCard('Veículos c/ abast.', comAbast.length) +
      (combNome ? miniCard('Combustível', combNome) : '') +
      miniCard('Maior consumo', comAbast[0]?.v.prefixo || '—');
  }

  // ── View: CARDS ──
  const cardsEl = qs('#splashLitrosCards');
  if (_splashLitrosView === 'cards' && cardsEl) {
    if (!porVeic.length) {
      cardsEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(243,232,198,.3);font-size:13px">
        Nenhum registro para os filtros selecionados.</div>`;
    } else {
      cardsEl.innerHTML = porVeic.map(r => {
        const pct  = totL > 0 ? (r.litros / totL * 100).toFixed(1) : '0.0';
        const barW = maxL > 0 ? (r.litros / maxL * 100).toFixed(1) : '0';
        const zeroC = r.litros === 0 ? ' zero' : '';
        const combustivel = getCombustivelName(r.v.combustivelId);
        return `<div class="litros-veic-card${zeroC}">
          <div class="lvc-prefixo">${r.v.prefixo}</div>
          <div class="lvc-placa">${r.v.placa}${combustivel ? ' · ' + combustivel : ''}</div>
          <div class="lvc-litros">${r.litros.toLocaleString('pt-BR',{minimumFractionDigits:1})}</div>
          <div class="lvc-litros-label">litros consumidos</div>
          <div class="lvc-abast">${r.qtd} abastecimento${r.qtd!==1?'s':''} · ${brl(r.valor)}</div>
          <div class="lvc-bar-wrap"><div class="lvc-bar-fill" style="width:${barW}%"></div></div>
          <div class="lvc-pct">${pct}% do total</div>
        </div>`;
      }).join('');
    }
  }

  // ── View: TABELA ──
  const listaEl = qs('#splashCardLista');
  if (_splashLitrosView === 'tabela' && listaEl) {
    if (!porVeic.length) {
      listaEl.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(243,232,198,.3);font-size:13px">
        Nenhum registro para os filtros selecionados.</div>`;
    } else {
      listaEl.innerHTML = `<table>
        <thead><tr>
          <th>Prefixo</th><th>Placa</th><th>Combustível</th>
          <th>Abastecimentos</th><th>Litros</th><th>Valor total</th>
          <th>% do total</th><th>Barra</th>
        </tr></thead>
        <tbody>${porVeic.map(r => {
          const pct  = totL > 0 ? (r.litros / totL * 100).toFixed(1) : '0.0';
          const barW = maxL > 0 ? (r.litros / maxL * 100).toFixed(0) : '0';
          const bar  = `<div style="height:6px;border-radius:3px;background:rgba(214,156,56,.12);width:100%;min-width:80px">
            <div style="height:100%;border-radius:3px;background:rgba(214,156,56,.65);width:${barW}%"></div></div>`;
          return `<tr>
            <td><strong>${r.v.prefixo}</strong></td>
            <td>${r.v.placa}</td>
            <td>${getCombustivelName(r.v.combustivelId)||'—'}</td>
            <td>${r.qtd}</td>
            <td><strong>${r.litros.toLocaleString('pt-BR',{minimumFractionDigits:2})} L</strong></td>
            <td>${brl(r.valor)}</td>
            <td>${pct}%</td>
            <td style="min-width:100px">${bar}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    }
  }
}

function splashLitrosSetView(v) {
  _splashLitrosView = v;
  const cardsEl  = qs('#splashLitrosCards');
  const tabelaEl = qs('#splashCardLista');
  const btnC = qs('#splashViewCards');
  const btnT = qs('#splashViewTabela');
  if (v === 'cards') {
    if (cardsEl)  cardsEl.style.display  = '';
    if (tabelaEl) tabelaEl.style.display = 'none';
    if (btnC) btnC.classList.add('active');
    if (btnT) btnT.classList.remove('active');
  } else {
    if (cardsEl)  cardsEl.style.display  = 'none';
    if (tabelaEl) { tabelaEl.style.display = ''; tabelaEl.style.padding = '12px 20px 8px'; }
    if (btnC) btnC.classList.remove('active');
    if (btnT) btnT.classList.add('active');
  }
  renderSplashLitros();
}


function imprimirSplashCard() {
  const titulo = qs('#splashCardTitulo')?.textContent||'';
  const resumo = qs('#splashCardResumo')?.innerHTML||'';
  const tabela = qs('#splashCardLista')?.innerHTML||'';
  const dt = new Date().toLocaleString('pt-BR');
  const logoPath = './assets/brasao-gcm.png';
  const w = window.open('','_blank','width=1000,height=700');
  if(!w){alert('Permita pop-ups.');return;}
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${titulo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:16px}
  .hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e2147;padding-bottom:10px;margin-bottom:12px}
  .hdr img{height:124px;width:auto;object-fit:contain}.hdr-text h1{font-size:13px;color:#0e2147;font-weight:800;text-transform:uppercase}
  .hdr-text h2{font-size:11px;color:#333;margin-top:2px}.hdr-text p{font-size:8px;color:#888;margin-top:2px}
  .resumo{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .resumo>div{background:#f4f7fb;border:1px solid #ccd6eb;border-radius:6px;padding:7px 12px}
  .resumo span{display:block;font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.3px}
  .resumo strong{font-size:14px;color:#0e2147;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead tr{background:#0e2147}thead th{padding:5px 6px;color:#fff;font-weight:700;text-align:left}
  tbody tr:nth-child(even){background:#f4f7fb}tbody td{padding:4px 6px;border-bottom:1px solid #e0e6f0}
  .foot{margin-top:12px;font-size:8px;color:#888;border-top:1px solid #ccd6eb;padding-top:6px;display:flex;justify-content:space-between}
  @media print{@page{margin:1cm;size:A4}}</style></head><body>
  <div class="hdr">
    <img src="${logoPath}" onerror="this.style.display='none'" />
    <div class="hdr-text"><h1>Guarda Civil Municipal de Ipatinga</h1><h2>${titulo}</h2><p>Emitido em: ${dt}</p></div>
  </div>
  <div class="resumo">${resumo}</div>
  ${tabela}
  <div class="foot"><span>GCM Ipatinga — Sistema de Gerenciamento de Abastecimento</span><span>${dt}</span></div>
  <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}


// ═══════════════════════════════════════════════════════════════════
//  BINDING — único, limpo, sem duplicatas
// ═══════════════════════════════════════════════════════════════════
function bindAll() {
  // Menu
  qsa('.menu-item').forEach(b=>b.addEventListener('click',()=>setScreen(b.dataset.screen)));

  // Delegação de ações em tabelas
  document.body.addEventListener('click', e=>{
    const btn=e.target.closest('[data-action]'); if (!btn) return;
    const {action,id}=btn.dataset;
    if (action==='edit-abastecimento')   editAbastecimento(id);
    if (action==='delete-abastecimento') deleteAbastecimento(id);
    if (action==='expand-row')           toggleRowDetail(id);
    if (action==='expand-consulta')      toggleConsultaDetail(id);
    if (action==='edit-veiculo')         editEntity('veiculos',id);
    if (action==='delete-veiculo')       deleteEntity('veiculos',id);
    if (action==='edit-motorista')       editEntity('motoristas',id);
    if (action==='delete-motorista')     deleteEntity('motoristas',id);
    if (action==='edit-setor')           editEntity('setores',id);
    if (action==='delete-setor')         deleteEntity('setores',id);
    if (action==='edit-combustivel')     editEntity('combustiveis',id);
    if (action==='delete-combustivel')   deleteEntity('combustiveis',id);
    if (action==='edit-trocaOleo')       editTrocaOleo(id);
    if (action==='delete-trocaOleo')     deleteTrocaOleo(id);
  });

  // Click em linha da tabela de abastecimentos abre modal
  qs('#abastecimentosTabela').addEventListener('click', e=>{
    if (e.target.closest('[data-action]')) return; // ignorar botões de ação
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    abrirModalAbastecimento(tr.dataset.id);
  });

  // Click em linha da tabela de consulta abre modal
  qs('#consultaTabela').addEventListener('click', e=>{
    if (e.target.closest('[data-action]')) return;
    const tr = e.target.closest('tr[data-cid]'); if (!tr) return;
    abrirModalAbastecimento(tr.dataset.cid);
  });

  // Fechar modais neon com ESC ou clique no fundo
  qs('#modalTrocaOleoDetalhe').addEventListener('click', e=>{ if(e.target===qs('#modalTrocaOleoDetalhe')) fecharModalTrocaOleo(); });
  qs('#modalAbastecimentoDetalhe').addEventListener('click', e=>{ if(e.target===qs('#modalAbastecimentoDetalhe')) fecharModalAbastecimento(); });
  const mgo=qs('#modalGraficoOleo'); if(mgo) mgo.addEventListener('click',e=>{if(e.target===mgo)fecharModalGraficoOleo();});
  const mav=qs('#modalAlertasVencidos'); if(mav) mav.addEventListener('click',e=>{if(e.target===mav)fecharModalAlertasVencidos();});
  const mgt=qs('#modalGerenciarTipos'); if(mgt) mgt.addEventListener('click',e=>{if(e.target===mgt)fecharModalGerenciarTipos();});

  // Formulários
  qs('#formAbastecimento').addEventListener('submit', handleAbastecimentoSubmit);
  qs('#formVeiculo').addEventListener('submit', handleVeiculoSubmit);
  qs('#formMotorista').addEventListener('submit', handleMotoristaSubmit);
  qs('#formSetor').addEventListener('submit', handleSetorSubmit);
  qs('#formCombustivel').addEventListener('submit', handleCombustivelSubmit);
  qs('#formTrocaOleo').addEventListener('submit', handleTrocaOleoSubmit);

  // Campos abastecimento
  qs('#veiculoId').addEventListener('change', updateVehicleInfo);
  qs('#motoristaId').addEventListener('change', updateVehicleInfo);
  qs('#valorUnitario').addEventListener('input', updateValorTotal);
  qs('#qtdLitros').addEventListener('input', updateValorTotal);

  // Campos de data agora são type=date (calendário nativo do browser)
  // Não requerem máscara manual

  // Prefixo veículo
  qs('#veiculoPrefixoTipo').addEventListener('change', updatePrefixoPreview);
  qs('#veiculoPrefixoNumero').addEventListener('input', updatePrefixoPreview);

  // Troca de óleo
  qs('#trocaOleoKm').addEventListener('input', calcProximaKm);
  qs('#trocaOleoIntervalo').addEventListener('input', calcProximaKm);
  const vl=qs('#trocaOleoValorLitro'); if(vl) vl.addEventListener('input', calcCustoTotalOleo);
  const ql=qs('#trocaOleoQtdLitros'); if(ql) ql.addEventListener('input', calcCustoTotalOleo);
  qs('#btnCancelarTrocaOleo').addEventListener('click', clearTrocaOleoForm);
  qs('#btnImprimirTrocaOleo').addEventListener('click', imprimirTrocaOleo);

  // Botões abastecimento
  qs('#btnCancelarEdicao').addEventListener('click', clearAbastecimentoForm);

  // Botões consulta
  // btnFiltrarConsulta removido — filtros são automáticos
  qs('#btnLimparConsulta').addEventListener('click', clearConsulta);
  qs('#btnImprimirRelatorio').addEventListener('click', imprimirRelatorio);
  qs('#btnExportarCsv').addEventListener('click', exportarCsv);
  qs('#btnAbrirGraficos').addEventListener('click', abrirModalGraficos);
  const btnGraficoOleo=qs('#btnGraficoOleo');
  if(btnGraficoOleo) btnGraficoOleo.addEventListener('click', abrirModalGraficoOleo);

  // Modal gráficos
  qs('#btnFecharModal').addEventListener('click', fecharModalGraficos);
  qs('#modalGraficos').addEventListener('click', e=>{ if (e.target===qs('#modalGraficos')) fecharModalGraficos(); });
  ['#oilChartVeiculo','#oilChartPeriodo','#oilChartMetrica'].forEach(sel=>{
    const el2=qs(sel); if(el2) el2.addEventListener('change',renderGraficoOleo);
  });
  ['#chartMetrica','#chartTipo'].forEach(sel=>{
    const el=qs(sel); if(el) el.addEventListener('change', renderCharts);
  });
  // Navegação de ano
  const btnAnoAnt=qs('#btnAnoAnterior');
  const btnAnoPrx=qs('#btnAnoProximo');
  if(btnAnoAnt) btnAnoAnt.addEventListener('click',()=>{
    _chartAno--; if(qs('#chartAnoDisplay')) qs('#chartAnoDisplay').textContent=_chartAno;
    const det=qs('#chartPizzaDetalhe'); if(det) det.style.display='none';
    renderCharts();
  });
  if(btnAnoPrx) btnAnoPrx.addEventListener('click',()=>{
    _chartAno++; if(qs('#chartAnoDisplay')) qs('#chartAnoDisplay').textContent=_chartAno;
    const det=qs('#chartPizzaDetalhe'); if(det) det.style.display='none';
    renderCharts();
  });
  // Scroll do mouse no gráfico principal → navega entre meses (muda o ano)
  const mainWrap=qs('#chartMainWrap');
  if(mainWrap) mainWrap.addEventListener('wheel', e=>{
    e.preventDefault();
    const delta = e.deltaY>0 ? -1 : 1; // scroll down = retrocede
    _chartAno += delta;
    if(qs('#chartAnoDisplay')) qs('#chartAnoDisplay').textContent=_chartAno;
    const det=qs('#chartPizzaDetalhe'); if(det) det.style.display='none';
    renderCharts();
  },{passive:false});
  // Imprimir gráfico
  const btnImpGraf=qs('#btnImprimirGrafico');
  if(btnImpGraf) btnImpGraf.addEventListener('click', imprimirGrafico);

  // Botões dashboard
  // Calcular consumo agora é automático — sem botão

  // Filtros automáticos consulta — todos reativos, sem botão "Aplicar"
  // Cascata setor → veículo
  const fSetorEl=qs('#fSetor');
  if(fSetorEl) fSetorEl.addEventListener('change',()=>{ syncFVeiculo(); renderConsulta(); });

  ['#fPeriodoTipo','#fPeriodoValor','#fDataIni','#fDataFim','#fCampoData',
   '#fVeiculo','#fPlaca','#fMotorista','#fCombustivel','#fAutorizacao','#fTermoLivre','#fId'].forEach(sel=>{
    const el=qs(sel); if (!el) return;
    el.addEventListener('change', renderConsulta);
    if (el.tagName==='INPUT') el.addEventListener('input', renderConsulta);
  });

  // Dashboard agg automático
  ['#dashAggPlaca','#dashAggPeriodoTipo','#dashAggPeriodoValor','#dashAggCampoData'].forEach(sel=>{
    const el=qs(sel); if (!el) return;
    el.addEventListener('change', calculateDashAgg);
    if (el.tagName==='INPUT') el.addEventListener('input', calculateDashAgg);
  });

  // Config
  qs('#btnImportar').addEventListener('click', ()=>qs('#inputImportarJson').click());
  qs('#inputImportarJson').addEventListener('change', importJson);
  qs('#btnMesclar').addEventListener('click', ()=>qs('#inputMesclarJson').click());
  qs('#inputMesclarJson').addEventListener('change', mesclarJson);
  qs('#btnSalvarDados')?.addEventListener('click', salvarDadosManual);
  qs('#btnExportar').addEventListener('click', exportJson);
  qs('#btnLimparLancamentos').addEventListener('click', clearAllLancamentos);
  qs('#btnResetDemo').addEventListener('click', resetDemo);

  // Tela cheia
  const btnFS=qs('#btnFullscreen');
  if (btnFS) {
    btnFS.addEventListener('click', ()=>{
      const target = qs('.app-shell') || document.documentElement;
      if (!document.fullscreenElement) {
        target.requestFullscreen().catch(err=>{
          // Fallback: tenta no documentElement
          document.documentElement.requestFullscreen().catch(()=>{});
        });
      } else {
        document.exitFullscreen().catch(()=>{});
      }
    });
    document.addEventListener('fullscreenchange', ()=>{
      const isFS = !!document.fullscreenElement;
      btnFS.title = isFS ? 'Sair de tela cheia' : 'Tela cheia';
      btnFS.textContent = isFS ? '⊡' : '⛶';
      // Garante que ao sair do fullscreen o layout volta ao normal
      if (!isFS) {
        document.body.style.overflow = '';
      }
    });
  }

  // ESC fecha todos os modais
  // Comprovantes consulta — busca automática ao mudar qualquer filtro
  function _autoRenderComp() { renderComprovantesConsulta(); }

  // Todos os selects e inputs disparam busca automaticamente
  ['#fComprovantePrefixo','#fComprovantePeriodoTipo','#fComprovanteTipo'].forEach(sel=>{
    const el=qs(sel); if(el) el.addEventListener('change', _autoRenderComp);
  });
  const fNomeComp=qs('#fComprovanteNome');
  if(fNomeComp){
    let _nomeTimer;
    fNomeComp.addEventListener('input',()=>{
      clearTimeout(_nomeTimer);
      _nomeTimer=setTimeout(_autoRenderComp, 400); // debounce 400ms
    });
  }
  // Datas personalizadas
  ['#fComprovanteDataIni','#fComprovanteDataFim'].forEach(sel=>{
    const el=qs(sel); if(el) el.addEventListener('change', _autoRenderComp);
  });
  // Toggle campos de data personalizada
  const fPeriodoComp=qs('#fComprovantePeriodoTipo');
  if(fPeriodoComp) fPeriodoComp.addEventListener('change',()=>{
    const custom=fPeriodoComp.value==='custom';
    const w1=qs('#fCompDataIniWrap'),w2=qs('#fCompDataFimWrap');
    if(w1)w1.style.display=custom?'':'none';
    if(w2)w2.style.display=custom?'':'none';
  });
  // Limpar filtros
  const btnLimpaComp=qs('#btnLimparFiltroComp');
  if(btnLimpaComp) btnLimpaComp.addEventListener('click',()=>{
    ['#fComprovantePrefixo','#fComprovantePeriodoTipo','#fComprovanteTipo','#fComprovanteNome'].forEach(s=>{const el=qs(s);if(el)el.value='';});
    ['#fComprovanteDataIni','#fComprovanteDataFim'].forEach(s=>{const el=qs(s);if(el)el.value='';});
    const w1=qs('#fCompDataIniWrap'),w2=qs('#fCompDataFimWrap');
    if(w1)w1.style.display='none'; if(w2)w2.style.display='none';
    const r=qs('#comprovantesResumo');if(r)r.textContent='';
    _autoRenderComp(); // recarrega mostrando todos
  });
  const btnImprComp=qs('#btnImprimirComprovantes');
  if(btnImprComp) btnImprComp.addEventListener('click',imprimirComprovantesConsulta);

  // Sync comprovante select when consulta screen is opened
  const origSetScreen=window.setScreen;

  document.addEventListener('keydown', e=>{
    if (e.key==='Escape') {
      // Lightbox tem prioridade — fecha primeiro
      if(qs('#lightboxViewer')?.classList.contains('open')) { fecharLightbox(); return; }
      fecharModalGraficos();
      fecharModalTrocaOleo();
      fecharModalAbastecimento();
      fecharModalGraficoOleo();
      fecharModalAlertasVencidos();
      fecharModalGerenciarTipos();
      fecharModalComprovantes();
      fecharSubGrafico();
      fecharSplashCard();
    }
  });
  // Clique no fundo do lightbox fecha
  const lb=qs('#lightboxViewer');
  if(lb) lb.addEventListener('click', e=>{ if(e.target===lb) fecharLightbox(); });
  // Modal comprovantes: fechar pelo fundo
  const mc=qs('#modalComprovantes');
  if(mc) mc.addEventListener('click',e=>{if(e.target===mc)fecharModalComprovantes();});
  const msa=qs('#modalSubGrafico');
  if(msa) msa.addEventListener('click',e=>{if(e.target===msa)fecharSubGrafico();});
  const msc=qs('#modalSplashCard');
  if(msc) msc.addEventListener('click',e=>{if(e.target===msc)fecharSplashCard();});
  // Upload trigger
  const btnUp=qs('#btnUploadComprovante');
  if(btnUp) btnUp.addEventListener('click', uploadComprovante);
  const inpUp=qs('#inputComprovante');
  if(inpUp) inpUp.addEventListener('change',()=>{
    const btnUp2=qs('#btnUploadComprovante');
    if(btnUp2&&inpUp.files.length) btnUp2.disabled=false;
  });
  // Comprovante no formulário de lançamento
  const inpLanc=qs('#inputComprovanteLancamento');
  if(inpLanc) inpLanc.addEventListener('change',()=>{
    const file=inpLanc.files[0]; if(!file) return;
    const lbl=qs('#comprovanteNomeLancamento');
    if(lbl) lbl.textContent='📎 '+file.name;
    const lblEl=inpLanc.closest('.comprovante-inline')?.querySelector('.comprovante-label-inline');
    if(lblEl) lblEl.classList.add('has-file');
    const btn=qs('#btnLimparComprovanteLancamento');
    if(btn) btn.style.display='';
  });

  // ─── Sprint 1: listeners de ordenação da tabela de abastecimentos ───
  qs('#abastOrdemCampo')?.addEventListener('change', renderAbastecimentosTable);
  qs('#abastOrdemDir')  ?.addEventListener('change', renderAbastecimentosTable);
}

// ═══════════════════════════════════════════════════════════════════
//  RELÓGIO DIGITAL
// ═══════════════════════════════════════════════════════════════════
const DIAS_PT=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const MESES_PT=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function tickRelogio() {
  const now=new Date();
  const hEl=qs('#relogioHora');
  const dEl=qs('#relogioData');
  if(hEl) hEl.textContent=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  if(dEl) {
    const dia=DIAS_PT[now.getDay()];
    const d=now.getDate();
    const mes=MESES_PT[now.getMonth()];
    const ano=now.getFullYear();
    dEl.textContent=`${dia}, ${d} de ${mes} de ${ano}`;
  }
}


// ═══════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════
async function bootstrap() {
  // Mostrar loading enquanto IndexedDB carrega
  document.body.insertAdjacentHTML('beforeend',
    '<div id="dbLoading" style="position:fixed;inset:0;background:rgba(5,12,24,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;gap:16px">' +
    '<div style="font-size:32px">⚙️</div>' +
    '<div style="color:#f1c567;font-family:monospace;font-size:16px;letter-spacing:2px">Iniciando banco de dados...</div>' +
    '<div style="width:200px;height:3px;background:rgba(214,156,56,.2);border-radius:2px"><div id="dbLoadBar" style="width:0%;height:100%;background:#f1c567;border-radius:2px;transition:width .4s"></div></div>' +
    '</div>');

  const bar = qs('#dbLoadBar');
  if(bar) bar.style.width='30%';

  try {
    // Carregar estado do IndexedDB (com migração automática do localStorage)
    const loaded = await dbLoadState();
    if(bar) bar.style.width='70%';
    if (loaded) {
      state = migrateState(loaded);
    } else {
      state = migrateState(clone(seedState));
      await dbSaveState(state);
    }
  } catch(e) {
    console.error('[bootstrap] Falha ao carregar banco:', e);
    const loading=qs('#dbLoading');
    if(loading)loading.textContent='Não foi possível carregar os dados. Nenhum registro foi substituído. Feche e reabra o sistema. Detalhe: '+e.message;
    return;
  }

  storageReady = true;
  if(bar) bar.style.width='100%';
  setTimeout(()=>{ const el=qs('#dbLoading'); if(el) el.remove(); }, 350);

  tickRelogio();
  setInterval(tickRelogio,1000);
  setTimeout(()=>{
    const el=qs('#trocaOleoCards');
    if(el) el.addEventListener('wheel', e=>{
      if(Math.abs(e.deltaX)>Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * 1.5;
    },{passive:false});
    const eu=qs('#dashUltimosScroll');
    if(eu) eu.addEventListener('wheel', e=>{
      e.preventDefault();
      eu.scrollTop += e.deltaY;
    },{passive:false});
  }, 300);
  // Atualizar uso de armazenamento
  dbUsageInfo().then(info => {
    const el=qs('#dbUsageInfo');
    if(el) el.textContent=`IndexedDB: ${info.used} usados de ${info.quota} disponíveis (${info.pct}%)`;
  });
  syncSelects();
  clearAbastecimentoForm();
  clearVeiculoForm();
  clearMotoristaForm();
  clearTrocaOleoForm();
  qs('#dashAggPeriodoTipo').value='dias';
  qs('#dashAggPeriodoValor').value=30;
  renderAll();
  setScreen('dashboard');
}

bindAll();
bootstrap();
