import { getStore } from '@netlify/blobs';
import { randomUUID, randomInt } from 'node:crypto';

const headers = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' };
const respond = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
const store = () => getStore('hunch-club-v3');
const cleanCode = s => String(s||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);
const cleanName = s => String(s||'').trim().slice(0,32);
const makeCode = () => Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const gameKey = code => `game-${code}`;
const playerKey = (code,id) => `player-${code}-${id}`;
const pickKey = (code,id) => `pick-${code}-${id}`;
const loadGame = async code => store().get(gameKey(code),{type:'json'});

export default async function handler(req) {
 try {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const data = req.method==='POST' ? await req.json().catch(()=>({})) : {};
  const code = cleanCode(data.code || url.searchParams.get('code'));
  if (action==='create' && req.method==='POST') {
   const name=cleanName(data.name);
   if(!name)return respond({error:'Enter your name.'},400);
   let c, exists;
   do { c=makeCode(); exists=await loadGame(c); } while(exists);
   const hostId=randomUUID(); const hostToken=randomUUID();
   await store().setJSON(gameKey(c),{code:c,hostName:name,hostId,hostToken,status:'Waiting',createdAt:Date.now()});
   await store().setJSON(playerKey(c,hostId),{id:hostId,name,joinedAt:Date.now()});
   return respond({code:c,playerId:hostId,hostToken});
  }
  if(!code || code.length!==6)return respond({error:'Invalid game code.'},400);
  const game=await loadGame(code);
  if(!game)return respond({error:'Game code not found.'},404);
  if(action==='join' && req.method==='POST'){
   if(game.status!=='Waiting')return respond({error:'This game has already started.'},409);
   const name=cleanName(data.name);
   if(!name)return respond({error:'Enter your name.'},400);
   const playerId=randomUUID();
   await store().setJSON(playerKey(code,playerId),{id:playerId,name,joinedAt:Date.now()});
   return respond({code,playerId});
  }
  if(action==='start' && req.method==='POST'){
   if(data.hostToken!==game.hostToken)return respond({error:'Only the host can start.'},403);
   if(game.status==='Waiting')await store().setJSON(gameKey(code),{...game,status:'Started',startedAt:Date.now()});
   return respond({status:'Started'});
  }
  if(action==='pick' && req.method==='POST'){
   if(game.status!=='Started')return respond({error:'Game not started.'},409);
   const playerId=String(data.playerId||'');
   if(!/^[0-9a-f-]{36}$/.test(playerId))return respond({error:'Invalid player.'},400);
   const player=await store().get(playerKey(code,playerId),{type:'json'});
   if(!player)return respond({error:'Player not found.'},404);
   const choice=data.choice;
   if(!['YES','NO'].includes(choice))return respond({error:'Choose YES or NO.'},400);
   const existing=await store().get(pickKey(code,playerId),{type:'json'});
   if(existing)return respond({choice:existing.choice,locked:true});
   await store().setJSON(pickKey(code,playerId),{choice,lockedAt:Date.now()});
   return respond({choice,locked:true});
  }
  if(action==='settle' && req.method==='POST'){
  if(data.hostToken!==game.hostToken)
    return respond({error:'Only the host can settle.'},403);

  if(game.status!=='started')
    return respond({error:'Game not started.'},400);

  if(!['YES','NO'].includes(data.result))
    return respond({error:'Choose YES or NO.'},400);

  await store().setJSON(gameKey(code),{
    ...game,
    status:'settled',
    result:data.result,
    settledAt:Date.now()
  });

  return respond({status:'settled',result:data.result});
}
  if(action==='state' && req.method==='GET'){
   const listed=await store().list({prefix:`player-${code}-`});
   const players=(await Promise.all(listed.blobs.map(b=>store().get(b.key,{type:'json'})))).filter(Boolean).sort((a,b)=>a.joinedAt-b.joinedAt).map(p=>({name:p.name,id:p.id}));
   const playerId=url.searchParams.get('playerId');
   const ownPick=playerId ? await store().get(pickKey(code,playerId),{type:'json'}) : null;
   return respond({code,hostName:game.hostName,status:game.status,players,ownPick:ownPick?.choice||null});
  }
  return respond({error:'Unknown action.'},404);
 } catch(e) { console.error(e); return respond({error:'Server error. Check Netlify function logs.'},500); }
}
export const config={path:'/api/game'};
