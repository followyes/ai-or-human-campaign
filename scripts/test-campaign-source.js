import assert from 'node:assert/strict';
import {makeDynamicStages,makeStagesFromRows,fetchCampaignStages,CampaignSourceError} from '../js/campaign-source.js';
import {STAGES} from '../js/campaign-core.js';
import {readStableCompletedIds,isStableStageUnlocked,markStableComplete,completedCount} from '../js/campaign-progress.js';

const CFG={projectUrl:'https://new-campaign-001.supabase.co',publishableKey:'sb_publishable_test_public'};
const reply=(items,ok=true,status=200)=>({ok,status,json:async()=>items});
const ids=Array.from({length:9},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const dynamic=[];
for(let stage=1;stage<=9;stage++){
  for(let p=1;p<=(stage===6?10:5);p++) {
    const kind=stage===6?'boss':'normal';
    const content_class=p%2?'human':'ai';
    dynamic.push({stage_id:ids[stage-1],display_number:stage,kind,position:p,content_class,
      storage_path:`${content_class}/photo-${stage}-${p}.avif`});
  }
}
const stages=makeDynamicStages(dynamic,CFG.projectUrl);
assert.equal(stages.length,9);
assert.deepEqual(stages.map(s=>s.images.length),[5,5,5,5,5,10,5,5,5]);
assert.equal(stages[5].isBoss,true);
assert.equal(stages[0].uid,ids[0]);
assert.throws(()=>makeDynamicStages([...dynamic,dynamic[0]],CFG.projectUrl),CampaignSourceError);
assert.throws(()=>makeDynamicStages(dynamic.slice(1),CFG.projectUrl),CampaignSourceError);
assert.throws(()=>makeDynamicStages(dynamic.map((r,i)=>i===0?{...r,storage_path:'../unsafe.avif'}:r),CFG.projectUrl),CampaignSourceError);
let seen;
const full=await fetchCampaignStages({config:CFG,fetchImpl:async(u,o)=>{seen={url:u,options:o};return reply(dynamic);}});
assert.equal(full.ready,true);
assert.equal(full.count,dynamic.length);
assert.equal(full.stages.length,9);
assert.equal(seen.url.pathname,'/rest/v1/campaign_public_cards');
assert.equal(seen.options.headers.apikey,CFG.publishableKey);
const legacy=[];
for(let i=1;i<=6;i++)for(let j=1;j<=(i===6?10:5);j++){
  const content_class=j%2?'human':'ai';legacy.push({level_id:i,position:j,content_class,storage_path:`${content_class}/old-${i}-${j}.avif`});
}
assert.deepEqual(makeStagesFromRows(legacy,CFG.projectUrl).map(s=>s.images.length),STAGES.map(s=>s.images.length));
const backward=await fetchCampaignStages({config:CFG,fetchImpl:async u=>u.pathname.endsWith('/campaign_public_cards')?reply(null,false,404):reply(legacy)});
assert.equal(backward.legacy,true);
assert.equal(backward.stages.length,6);
const unavailable=await fetchCampaignStages({config:CFG,fetchImpl:async()=>reply([])});
assert.equal(unavailable.ready,false);
await assert.rejects(fetchCampaignStages({config:CFG,fetchImpl:async()=>reply(null,false,403)}),CampaignSourceError);
assert.equal((await fetchCampaignStages({config:{projectUrl:'',publishableKey:''}})).ready,false);
let progress={completed:2,hearts:3,nextHeartAt:null};
progress.completedStageIds=readStableCompletedIds(progress,stages);
assert.deepEqual(progress.completedStageIds,ids.slice(0,2));
assert.equal(isStableStageUnlocked(progress,stages[2],stages),true);
assert.equal(isStableStageUnlocked(progress,stages[3],stages),false);
progress=markStableComplete(progress,ids[2]);
assert.equal(completedCount(progress,stages),3);
const without3=stages.filter(s=>s.uid!==ids[2]).map((s,i)=>({...s,id:i+1}));
assert.equal(completedCount(progress,without3),2);
assert.equal(isStableStageUnlocked(progress,without3[2],without3),true);
console.log('PASS: dynamic campaign, legacy compatibility, stable IDs & reindex');
