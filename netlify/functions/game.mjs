import { getStore } from '@netlify/blobs';
import { randomUUID, randomInt } from 'node:crypto';
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const store=()=>getStore('hunch-club-v4');
const codeClean=s=>String(s||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);
const nameClean=s=>String(s||'').trim().slice(0,32);
const makeCode=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const gameKey=c=>`game-${c}`;
const playerKey=(c,id)=>`player-${c}-${id}`;
const pickKey=(c,n,id)=>`pick-${c}-${n}-${id}`;
const load=async key=>store().get(key,{type:'json'});
const save=async(key,val)=>store().setJSON(key,val);
const allPlayers=async code=>{const found=await store().list({prefix:`player-${code}-`});return (await Promise.all(found.blobs.map(b=>load(b.key)))).filter(Boolean).sort((a,b)=>a.joinedAt-b.joinedAt)};
const question={title:'Will there be a goal in the first half?',note:'Test question — not linked to a live match.'};
export default async function handler(req){
 try{
  const url=new URL(req.url),action=url.searchParams.get('action');
  const data=req.method==='POST'?await req.json().catch(()=>({})):{};
  if(action==='create'&&req.method==='POST'){
   const name=nameClean(data.name);if(!name)return respond({error:'Enter your name.'},400);
   let code;do{code=makeCode()}while(await load(gameKey(code)));
   const hostId=randomUUID(),hostToken=randomUUID();
   await save(gameKey(code),{code,hostName:name,hostId,hostToken,status:'Waiting',round:1,createdAt:Date.now()});
   await save(playerKey(code,hostId),{id:hostId,name,joinedAt:Date.now(),alive:true});
   return respond({code,playerId:hostId,hostToken});
  }
  const code=codeClean(data.code||url.searchParams.get('code'));
  if(code.length!==6)return respond({error:'Invalid game code.'},400);
  const game=await load(gameKey(code));if(!game)return respond({error:'Game code not found.'},404);
  if(action==='join'&&req.method==='POST'){
   if(game.status!=='Waiting')return respond({error:'This game has already started.'},409);
   const name=nameClean(data.name);if(!name)return respond({error:'Enter your name.'},400);
   const playerId=randomUUID();await save(playerKey(code,playerId),{id:playerId,name,joinedAt:Date.now(),alive:true});
   return respond({code,playerId});
  }
  if(action==='start'&&req.method==='POST'){
   if(data.hostToken!==game.hostToken)return respond({error:'Only the host can start.'},403);
   if(game.status!=='Waiting')return respond({error:'Game already started.'},409);
   await save(gameKey(code),{...game,status:'Started',startedAt:Date.now()});return respond({status:'Started'});
  }
  if(action==='pick'&&req.method==='POST'){
   if(game.status!=='Started')return respond({error:'Predictions are closed.'},409);
   const id=String(data.playerId||''),choice=data.choice;
   if(!/^[0-9a-f-]{36}$/.test(id))return respond({error:'Invalid player.'},400);
   if(!['YES','NO'].includes(choice))return respond({error:'Choose YES or NO.'},400);
   const player=await load(playerKey(code,id));if(!player)return respond({error:'Player not found.'},404);
   if(!player.alive)return respond({error:'You have been eliminated.'},409);
   const key=pickKey(code,game.round,id),existing=await load(key);
   if(existing)return respond({choice:existing.choice,locked:true});
   await save(key,{choice,lockedAt:Date.now()});return respond({choice,locked:true});
  }
  if(action==='settle'&&req.method==='POST'){
   if(data.hostToken!==game.hostToken)return respond({error:'Only the host can settle.'},403);
   if(game.status!=='Started')return respond({error:'Game not ready to settle.'},409);
   if(!['YES','NO'].includes(data.result))return respond({error:'Choose YES or NO.'},400);
   const players=await allPlayers(code),alive=players.filter(p=>p.alive);
   const picks=await Promise.all(alive.map(p=>load(pickKey(code,game.round,p.id))));
   if(picks.some(p=>!p))return respond({error:'Wait for every remaining player to lock a prediction.'},409);
   await Promise.all(alive.map((p,i)=>save(playerKey(code,p.id),{...p,alive:picks[i].choice===data.result})));
   const survivors=alive.filter((p,i)=>picks[i].choice===data.result);
   const status=survivors.length<=1?'Finished':'Settled';
   await save(gameKey(code),{...game,status,result:data.result,settledAt:Date.now()});
   return respond({status,result:data.result,survivors:survivors.length});
  }
  if(action==='next'&&req.method==='POST'){
   if(data.hostToken!==game.hostToken)return respond({error:'Only the host can continue.'},403);
   if(game.status!=='Settled')return respond({error:'This round is not ready.'},409);
   await save(gameKey(code),{...game,status:'Started',round:game.round+1,result:null});
   return respond({status:'Started',round:game.round+1});
  }
  if(action==='state'&&req.method==='GET'){
   const players=await allPlayers(code),playerId=url.searchParams.get('playerId');
   const own=players.find(p=>p.id===playerId);
   const picks=await Promise.all(players.map(p=>load(pickKey(code,game.round,p.id))));
   return respond({code,hostName:game.hostName,status:game.status,round:game.round,question,result:game.result||null,
    players:players.map((p,i)=>({id:p.id,name:p.name,alive:p.alive,picked:!!picks[i],choice:game.status==='Settled'||game.status==='Finished'?picks[i]?.choice||null:null})),
    ownPick:picks[players.findIndex(p=>p.id===playerId)]?.choice||null,ownAlive:own?.alive??false,
    winner:game.status==='Finished'?players.filter(p=>p.alive).map(p=>p.name):null});
  }
  return respond({error:'Unknown action.'},404);
 }catch(e){console.error(e);return respond({error:'Server error. Check Netlify function logs.'},500)}
}
export const config={path:'/api/game'};
