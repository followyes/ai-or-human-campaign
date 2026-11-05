/** Public, read-only campaign catalog. No admin credentials in this module. */
import { STAGES } from './campaign-core.js';
import { buildPublicStorageUrl, resolveSupabasePublicConfig } from './content-source.js';

const BUCKET = 'game-images';
const LEGACY_COUNTS = [5, 5, 5, 5, 5, 10];
const PAGE = 500;
export class CampaignSourceError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? {cause} : undefined);
    this.name = 'CampaignSourceError';
    this.code = code;
  }
}

function isValidPhoto(row) {
  return ['human','ai'].includes(row?.content_class) &&
    typeof row.storage_path === 'string' &&
    row.storage_path.startsWith(`${row.content_class}/`) &&
    /\.(avif|webp|png|jpe?g)$/i.test(row.storage_path);
}

// Compatibility with the original six levels before the SQL migration is run.
export function makeStagesFromRows(rows, projectUrl) {
  if (!Array.isArray(rows)) throw new CampaignSourceError('INVALID_RESPONSE', 'Niepoprawna lista zdjęć.');
  if (rows.length !== 35) return null;
  const stages = STAGES.map(stage => ({...stage, uid: `legacy-${stage.id}`, images: []}));
  const positions = new Set();
  for (const row of rows) {
    if (!Number.isInteger(row?.level_id) || row.level_id < 1 || row.level_id > 6 ||
      !Number.isInteger(row.position) || row.position < 1 || row.position > LEGACY_COUNTS[row.level_id-1] ||
      !isValidPhoto(row)) throw new CampaignSourceError('INVALID_ROW','Nieprawidłowe przypisanie zdjęcia.');
    const key = `${row.level_id}/${row.position}`;
    if (positions.has(key)) throw new CampaignSourceError('DUPLICATE_POSITION','Powtórzona pozycja zdjęcia.');
    positions.add(key);
    stages[row.level_id-1].images.push({
      id:`legacy-${key}`, type:row.content_class, imagePosition:row.position-1,
      src:buildPublicStorageUrl(projectUrl,BUCKET,row.storage_path)
    });
  }
  for (let i=0;i<6;i++) {
    if (stages[i].images.length !== LEGACY_COUNTS[i]) throw new CampaignSourceError('INCOMPLETE_LEVEL','Brak części zdjęć.');
    stages[i].images.sort((a,b)=>a.imagePosition-b.imagePosition);
  }
  return stages;
}

/** Validates every stage fully; no partially uploaded stage is playable. */
export function makeDynamicStages(rows, projectUrl) {
  if (!Array.isArray(rows)) throw new CampaignSourceError('INVALID_RESPONSE','Niepoprawna lista etapów.');
  const stages = new Map();
  const usedPaths = new Set();
  for (const row of rows) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row?.stage_id || '') ||
      !Number.isInteger(row.display_number) || row.display_number < 1 ||
      !['normal','boss'].includes(row.kind) || !Number.isInteger(row.position) ||
      !isValidPhoto(row)) throw new CampaignSourceError('INVALID_ROW','Błędne dane poziomu w Supabase.');
    const expected = row.kind === 'boss' ? 10 : 5;
    if (row.position < 1 || row.position > expected || usedPaths.has(row.storage_path)) {
      throw new CampaignSourceError('INVALID_POSITION','Powtórzona lub nieprawidłowa karta.');
    }
    usedPaths.add(row.storage_path);
    const current = stages.get(row.stage_id) || {
      id:row.display_number, uid:row.stage_id, isBoss:row.kind==='boss',
      title:row.kind==='boss' ? 'Walka z bossem' : `Poziom ${row.display_number}`,
      images:[], positions:new Set()
    };
    if (current.id !== row.display_number || current.isBoss !== (row.kind==='boss') ||
      current.positions.has(row.position)) throw new CampaignSourceError('INVALID_STAGE','Niespójne dane poziomu.');
    current.positions.add(row.position);
    current.images.push({
      id:`${row.stage_id}/${row.position}`, type:row.content_class, imagePosition:row.position-1,
      src:buildPublicStorageUrl(projectUrl,BUCKET,row.storage_path)
    });
    stages.set(row.stage_id,current);
  }
  const list=[...stages.values()].sort((a,b)=>a.id-b.id);
  for (let i=0;i<list.length;i++) {
    const stage=list[i];
    const expected=stage.isBoss?10:5;
    if (stage.id !== i+1 || stage.images.length !== expected) {
      throw new CampaignSourceError('INCOMPLETE_LEVEL','Baza zwróciła niekompletne etapy.');
    }
    stage.images.sort((a,b)=>a.imagePosition-b.imagePosition);
    delete stage.positions;
  }
  return list;
}

async function fetchRows({projectUrl,publishableKey}, table, select, fetchImpl) {
  const all=[];
  for (let offset=0;offset<10000;offset+=PAGE) {
    const url=new URL(`${projectUrl}/rest/v1/${table}`);
    url.searchParams.set('select',select);
    url.searchParams.set('order', table==='campaign_public_cards'?'display_number.asc,position.asc':'level_id.asc,position.asc');
    if (table==='campaign_level_images') url.searchParams.set('is_active','eq.true');
    url.searchParams.set('limit',String(PAGE));
    url.searchParams.set('offset',String(offset));
    let response;
    try { response=await fetchImpl(url,{method:'GET',cache:'no-store',headers:{Accept:'application/json',apikey:publishableKey}}); }
    catch(error) { throw new CampaignSourceError('NETWORK','Nie można połączyć się z Supabase.',error); }
    if (!response?.ok) {
      const error = new CampaignSourceError('HTTP',`Baza zwróciła HTTP ${response?.status || '?'}.`);
      error.status=response?.status;
      throw error;
    }
    let batch;
    try {batch=await response.json();} catch(error) {throw new CampaignSourceError('JSON','Nieprawidłowa odpowiedź bazy.',error);}
    if (!Array.isArray(batch)) throw new CampaignSourceError('INVALID_RESPONSE','Baza nie zwróciła listy.');
    all.push(...batch);
    if (batch.length<PAGE) return all;
  }
  throw new CampaignSourceError('PAGINATION','Limit pobierania kampanii osiągnięty.');
}

export async function fetchCampaignStages({config,fetchImpl=globalThis.fetch}={}) {
  const resolved=resolveSupabasePublicConfig(config);
  if (!resolved.configured) return {ready:false,count:0,stages:null};
  if (typeof fetchImpl!=='function') throw new CampaignSourceError('NO_FETCH','Brak API fetch.');
  let rows;
  try {
    rows=await fetchRows(resolved,'campaign_public_cards',
      'stage_id,display_number,kind,position,content_class,storage_path',fetchImpl);
  } catch(error) {
    // Until 06_automatyczne_poziomy.sql is executed, keep the original six levels running.
    if (error?.status!==404) throw error;
    const legacy=await fetchRows(resolved,'campaign_level_images',
      'level_id,position,content_class,storage_path',fetchImpl);
    return {ready:legacy.length===35,count:legacy.length,stages:makeStagesFromRows(legacy,resolved.projectUrl),legacy:true};
  }
  if (!rows.length) return {ready:false,count:0,stages:null};
  return {ready:true,count:rows.length,stages:makeDynamicStages(rows,resolved.projectUrl),legacy:false};
}
