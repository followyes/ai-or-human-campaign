/** Stable stage-ID progress for v0.6.0; old numeric saves are migrated once. */
export function readStableCompletedIds(raw, stages) {
  if (Array.isArray(raw?.completedStageIds)) {
    return [...new Set(raw.completedStageIds.filter(id=>typeof id==='string'&&id.length<100))];
  }
  const count=Number.isInteger(raw?.completed)?Math.max(0,Math.min(raw.completed,stages.length)):0;
  return stages.slice(0,count).map(stage=>stage.uid);
}
export function completedCount(progress,stages) {
  const ids=new Set(progress.completedStageIds || []);
  return stages.filter(s=>ids.has(s.uid)).length;
}
export function isStableStageUnlocked(progress,stage,stages) {
  const index=stages.findIndex(s=>s.uid===stage?.uid);
  if (index<0) return false;
  const ids=new Set(progress.completedStageIds || []);
  return stages.slice(0,index).every(s=>ids.has(s.uid));
}
export function markStableComplete(progress,uid) {
  return {...progress,completedStageIds:[...new Set([...(progress.completedStageIds || []),uid])]};
}
export function keepLiveFields(newProgress,oldProgress) {
  return Array.isArray(oldProgress?.completedStageIds)
    ? {...newProgress,completedStageIds:oldProgress.completedStageIds}
    : newProgress;
}
