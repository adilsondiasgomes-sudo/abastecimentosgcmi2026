// ═══════════════════════════════════════════════════════════════════
//  db.js — Camada IndexedDB para o Sistema de Abastecimento GCM
//  Substitui localStorage. Capacidade: ~50% do espaço livre em disco.
// ═══════════════════════════════════════════════════════════════════

const DB_NAME    = 'gcm_abastecimento2026_novo';
const DB_VERSION = 2;
const STORE_STATE = 'state';        // estado geral (JSON)
const DB_BACKUP_KEY = 'abastecimento2026-novo-storage';
const DB_BACKUP_UPDATED_AT_KEY = `${DB_BACKUP_KEY}:updatedAt`;
const DB_BACKUP_IDB_SAVED_AT_KEY = `${DB_BACKUP_KEY}:idbSavedAt`;
const STORE_DOCS  = 'comprovantes'; // arquivos binários (Blob)

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      // Store principal: chave = string (ex: 'gcm_state')
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE);
      }
      // Store de comprovantes: chave = id autoincrement, índice por abastecimentoId
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        const s = db.createObjectStore(STORE_DOCS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('abastecimentoId', 'abastecimentoId', { unique: false });
        s.createIndex('trocaOleoId',     'trocaOleoId',     { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE_DOCS);
        if (!s.indexNames.contains('abastecimentoId')) {
          s.createIndex('abastecimentoId', 'abastecimentoId', { unique: false });
        }
        if (!s.indexNames.contains('trocaOleoId')) {
          s.createIndex('trocaOleoId', 'trocaOleoId', { unique: false });
        }
      }
    };

    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function idbGet(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}

function idbSet(store, key, value) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    tx.oncomplete = () => res(req.result);
    tx.onerror    = () => rej(tx.error || req.error);
    tx.onabort    = () => rej(tx.error || req.error);
    req.onerror   = () => rej(req.error);
  }));
}

function idbGetByIndex(store, indexName, value) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx    = db.transaction(store, 'readonly');
    const idx   = tx.objectStore(store).index(indexName);
    const req   = idx.getAll(value);
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  }));
}

function idbAdd(store, value) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(value);
    let newId = null;
    req.onsuccess = () => { newId = req.result; };
    tx.oncomplete = () => res(newId);
    tx.onerror    = () => rej(tx.error || req.error);
    tx.onabort    = () => rej(tx.error || req.error);
    req.onerror   = () => rej(req.error);
  }));
}

function idbDelete(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  }));
}

function idbDeleteByIndex(store, indexName, value) {
  return openDB().then(async db => {
    const items = await idbGetByIndex(store, indexName, value);
    const tx    = db.transaction(store, 'readwrite');
    const os    = tx.objectStore(store);
    items.forEach(item => os.delete(item.id));
    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  });
}

function idbGetAll(store) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  }));
}

// ── API pública de estado ──────────────────────────────────────────
const STATE_KEY = 'gcm_state';

function safeLocalGet(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
function validSavedState(value) { return value && Array.isArray(value.abastecimentos) && Array.isArray(value.veiculos); }
async function dbLoadState() {
  // 1. Tenta carregar do IndexedDB
  const stored = await idbGet(STORE_STATE, STATE_KEY);
  const backupRaw = safeLocalGet(DB_BACKUP_KEY);
  const backupUpdatedAt = safeLocalGet(DB_BACKUP_UPDATED_AT_KEY) || '';
  const idbSavedAt = safeLocalGet(DB_BACKUP_IDB_SAVED_AT_KEY) || '';
  if (stored && !validSavedState(stored)) throw new Error('Estado persistido inválido; restauração necessária.');
  if (stored) {
    // IndexedDB confirmado é a fonte principal; backup local pode estar desatualizado.
    return stored;
  }

  // 2. Migração automática do localStorage
  const legacy = backupRaw || safeLocalGet('gcm_abastecimento2026_novo_v2') || safeLocalGet('gcm_abastecimento2026_novo');
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      if(!validSavedState(parsed)) throw new Error("Backup legado não contém os cadastros completos.");
      await idbSet(STORE_STATE, STATE_KEY, parsed);
      
      
      console.log('[DB] Migração localStorage → IndexedDB concluída.');
      return parsed;
    } catch(e) { console.warn('[DB] Falha na migração:', e); throw e; }
  }
  return null; // sem dados — app vai usar seedState
}

async function dbSaveState(stateObj) {
  await idbSet(STORE_STATE, STATE_KEY, stateObj);
  try { localStorage.setItem(DB_BACKUP_IDB_SAVED_AT_KEY, new Date().toISOString()); } catch(e) { /* IndexedDB já confirmou a gravação. */ }
}

// ── API pública de comprovantes ────────────────────────────────────

/**
 * Salva um comprovante vinculado a um abastecimento ou troca de óleo.
 * @param {Object} doc - { abastecimentoId?, trocaOleoId?, nome, tipo, tamanho, blob }
 * @returns {number} id gerado
 */
async function dbSalvarComprovante(doc) {
  return await idbAdd(STORE_DOCS, {
    abastecimentoId: doc.abastecimentoId || null,
    trocaOleoId:     doc.trocaOleoId     || null,
    nome:    doc.nome,
    tipo:    doc.tipo,    // MIME type
    tamanho: doc.tamanho, // bytes
    data:    doc.data || new Date().toISOString(),
    blob:    doc.blob,    // ArrayBuffer ou Blob
  });
}

/**
 * Retorna todos os comprovantes de um abastecimento.
 */
async function dbGetComprovantes(abastecimentoId) {
  return await idbGetByIndex(STORE_DOCS, 'abastecimentoId', Number(abastecimentoId));
}

/**
 * Retorna comprovantes de uma troca de óleo.
 */
async function dbGetComprovantesOleo(trocaOleoId) {
  return await idbGetByIndex(STORE_DOCS, 'trocaOleoId', Number(trocaOleoId));
}

/**
 * Remove um comprovante pelo id.
 */
async function dbExcluirComprovante(id) {
  await idbDelete(STORE_DOCS, Number(id));
}

/**
 * Remove todos os comprovantes de um abastecimento (ao excluir o registro).
 */
async function dbExcluirComprovantesAbast(abastecimentoId) {
  await idbDeleteByIndex(STORE_DOCS, 'abastecimentoId', Number(abastecimentoId));
}

/**
 * Retorna URL temporária para exibição/download de um comprovante.
 */
function dbComprovantUrl(blob) {
  return URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
}

/**
 * Estatísticas de uso do IndexedDB.
 */
async function dbUsageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const used  = (est.usage  / 1024 / 1024).toFixed(1);
    const quota = (est.quota  / 1024 / 1024 / 1024).toFixed(1);
    return { used: `${used} MB`, quota: `${quota} GB`, pct: ((est.usage/est.quota)*100).toFixed(1) };
  }
  return { used: '?', quota: '?', pct: '?' };
}

function idbGetAllKeys(store) {
  return openDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly');
    const req=tx.objectStore(store).getAllKeys();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  }));
}
