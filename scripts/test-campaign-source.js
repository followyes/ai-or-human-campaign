import assert from 'node:assert/strict';
import { fetchCampaignStages, makeStagesFromRows, CampaignSourceError } from '../js/campaign-source.js';
import { STAGES } from '../js/campaign-core.js';

const CFG = { projectUrl: 'https://new-campaign-001.supabase.co', publishableKey: 'sb_publishable_test_public' };
const rows = [];
for (let stage=1;stage<=6;stage++) {
  for (let pos=1;pos<=(stage===6?10:5);pos++) {
    const content_class=pos%2===0?'ai':'human';
    rows.push({level_id:stage,position:pos,content_class,storage_path:`${content_class}/level-${stage}-${pos}.webp`});
  }
}
const reply = (items, ok=true, status=200) => ({ok,status,json:async()=>items});
assert.equal(makeStagesFromRows([], CFG.projectUrl),null);
const list=makeStagesFromRows(rows, CFG.projectUrl);
assert.deepEqual(list.map(s=>s.images.length),[5,5,5,5,5,10]);
assert.deepEqual(list.map(s=>s.id), STAGES.map(s=>s.id));
assert.match(list[0].images[0].src,/\/storage\/v1\/object\/public\/game-images\/human\/level-1-1.webp$/);
assert.equal(list[0].images[0].type,'human');
assert.throws(()=>makeStagesFromRows([...rows.slice(0,1),rows[0],...rows.slice(2)],CFG.projectUrl),CampaignSourceError);
assert.throws(()=>makeStagesFromRows(rows.map((r,i)=>i===0?{...r,storage_path:'../unsafe.webp'}:r),CFG.projectUrl),CampaignSourceError);
assert.throws(()=>makeStagesFromRows(rows.map((r,i)=>i===0?{...r,level_id:7}:r),CFG.projectUrl),CampaignSourceError);
let seen;
const full=await fetchCampaignStages({config:CFG,fetchImpl:async(u,o)=>{seen={url:u,options:o};return reply(rows)}});
assert.equal(full.ready,true);
assert.equal(full.count,35);
assert.equal(seen.options.headers.apikey, CFG.publishableKey);
assert.equal(seen.url.searchParams.get('is_active'),'eq.true');
assert.equal(seen.url.searchParams.get('limit'),'36');
const missing=await fetchCampaignStages({config:CFG,fetchImpl:async()=>reply(rows.slice(0,5))});
assert.equal(missing.ready,false);
assert.equal(missing.count,5);
await assert.rejects(fetchCampaignStages({config:CFG,fetchImpl:async()=>reply(null,false,403)}),CampaignSourceError);
await assert.rejects(fetchCampaignStages({config:{...CFG,projectUrl:'https://kopmcnabslumyweebjgf.supabase.co'},fetchImpl:async()=>reply([])}));
assert.equal((await fetchCampaignStages({config:{projectUrl:'',publishableKey:''}})).ready,false);
console.log('campaign source: 12 checks PASSED');
