import assert from 'node:assert/strict';
import {makeChallengeStages,fetchCampaignStages,CampaignSourceError} from '../js/campaign-source.js';
import {markStableComplete,completedCount,isStableStageUnlocked} from '../js/campaign-progress.js';
import {readFileSync} from 'node:fs';
const cfg={projectUrl:'https://new-campaign-001.supabase.co',publishableKey:'sb_publishable_test_public'};
const mainId='00000000-0000-4000-8000-000000000001';
const challengeId='00000000-0000-4000-8000-000000000002';
const main=[];
for(let i=1;i<=5;i++)main.push({stage_id:mainId,kind:'normal',display_number:1,position:i,
  content_class:i%2?'ai':'human',storage_path:`${i%2?'ai':'human'}/main-${i}.avif`});
const challenges=[];
for(let i=1;i<=20;i++)challenges.push({stage_id:challengeId,challenge_number:1,topic_name:'Rendery 3D',
  anchor_stage_id:mainId,position:i,content_class:i<=10?'ai':'human',
  storage_path:`${i<=10?'ai':'human'}/challenge-${i}.avif`});
const stages=makeChallengeStages(challenges,cfg.projectUrl);
assert.equal(stages.length,1);
assert.equal(stages[0].images.length,20);
assert.equal(stages[0].topic,'Rendery 3D');
assert.equal(stages[0].anchorUid,mainId);
assert.equal(stages[0].isChallenge,true);
assert.throws(()=>makeChallengeStages(challenges.slice(1),cfg.projectUrl),CampaignSourceError);
assert.throws(()=>makeChallengeStages(challenges.map((x,i)=>i===0?{...x,topic_name:'Inny temat'}:x),cfg.projectUrl),CampaignSourceError);
assert.throws(()=>makeChallengeStages(challenges.map((x,i)=>i===0?{...x,content_class:'human',storage_path:'human/x.avif'}:x),cfg.projectUrl),CampaignSourceError);
const fetched=await fetchCampaignStages({config:cfg,fetchImpl:async(url)=>({ok:true,status:200,json:async()=>
  url.pathname.endsWith('campaign_public_challenge_cards')?challenges:main})});
assert.equal(fetched.stages.length,1);
assert.equal(fetched.challenges.length,1);
let progress={completedStageIds:[],hearts:3};
progress=markStableComplete(progress,challengeId);
assert.equal(completedCount(progress,fetched.stages),0,'Challenge does not advance main stages');
assert.equal(isStableStageUnlocked(progress,fetched.stages[0],fetched.stages),true);
assert.ok(!readFileSync(new URL('../js/campaign-map.js',import.meta.url),'utf8').includes('activeStages.push(...activeChallenges)'),
  'Challenge stages are separate from main progression');
assert.ok(readFileSync(new URL('../admin/index.html',import.meta.url),'utf8').includes('id="challenge-enabled"'));
assert.ok(readFileSync(new URL('../js/admin-content.js',import.meta.url),'utf8').includes('challenge_topic'));
console.log('PASS: themed 20-card challenges, strict 10/10 split, independent main progress, SQL guards');
