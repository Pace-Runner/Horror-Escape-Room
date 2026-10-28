export const SCORE_COLUMNS={player:'user_id',name:'player_name',time:'time_ms'};
export function formatScoreTime(ms){
  const total=Math.floor(Math.max(0,Number(ms)||0)/10),seconds=Math.floor(total/100),minutes=Math.floor(seconds/60);
  return `${minutes>=60?Math.floor(minutes/60)+':':''}${String(minutes%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.${String(total%100).padStart(2,'0')}`;
}
export function validateNickname(value){
  const nickname=String(value??'').trim(),length=Array.from(nickname).length;
  if(length<2||length>18||!/^[A-Za-z0-9 _-]+$/.test(nickname))throw Error('Use 2–18 letters, numbers, spaces, - or _.');
  return nickname;
}
/** One persistent anonymous identity, and one best row across every difficulty. */
export function createLeaderboardService(client,columns=SCORE_COLUMNS){
  let identifying=null;
  const check=result=>{if(result.error)throw result.error;return result.data;};
  async function identify(){
    if(!client)throw Error('Leaderboard is unavailable. Please try again later.');
    if(!identifying)identifying=(async()=>{
      const {session}=check(await client.auth.getSession());
      if(session?.user?.id)return session.user.id;
      const data=check(await client.auth.signInAnonymously());
      if(!data.user?.id)throw Error('Could not connect to the leaderboard.');return data.user.id;
    })().catch(error=>{identifying=null;throw error;});
    return identifying;
  }
  return {
    async top(){
      await identify();
      const rows=check(await client.from('leaderboard_scores').select(`${columns.name},${columns.time},difficulty`)
        .gt(columns.time,0).order(columns.time,{ascending:true}).order(columns.name,{ascending:true}).limit(10))??[];
      return rows.map(row=>({nickname:row[columns.name],time_ms:row[columns.time],difficulty:row.difficulty}));
    },
    async submit(nickname,run){
      nickname=validateNickname(nickname);
      if(!run||!['released','contained'].includes(run.ending)||!['easy','medium','hard'].includes(run.difficulty)||!Number.isSafeInteger(run.time_ms))
        throw Error('Only completed full-game runs can be submitted.');
      if(run.time_ms<1000||run.time_ms>7200000)throw Error('Leaderboard times must be between 1 second and 2 hours.');
      const player=await identify(),table=()=>client.from('leaderboard_scores');
      const existing=check(await table().select(columns.time).eq(columns.player,player).maybeSingle());
      if(existing&&existing[columns.time]<=run.time_ms)return {improved:false};
      const values={[columns.player]:player,[columns.name]:nickname,[columns.time]:run.time_ms,difficulty:run.difficulty};
      if(!existing){
        const inserted=await table().insert(values);
        if(!inserted.error)return {improved:true};
        // Another tab may have inserted this player's first score meanwhile.
        if(inserted.error.code!=='23505')throw inserted.error;
      }
      const rows=check(await table().update(values).eq(columns.player,player).gt(columns.time,run.time_ms).select(columns.time));
      return {improved:!!rows?.length};
    }
  };
}
