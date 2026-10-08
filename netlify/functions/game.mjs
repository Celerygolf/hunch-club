import { getStore } from '@netlify/blobs';
import { randomUUID, randomInt } from 'node:crypto';
const store=()=>getStore('hunch-club-v3');
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const clean=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
const code=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const key=c=>`game-${c}`;
export default async function handler(req){
 try{
  const u=new URL(req.url),a=u.searchParams.get('action'),d=req.method==='POST'?await req.json().catch(()=>({})):{};
  if(a==='create'){const c=code(),id=randomUUID(),token=randomUUID(),name=String(d.name||'Player').slice(0,30);
   await store().setJSON(key(c),{code:c,hostName:name,hostId:id,hostToken:token,status:'Waiting',players:[{id,name}]});
   return json({code:c,playerId:id,hostToken:token});}
  const c=clean(d.code||u.searchParams.get('code'));const g=await store().get(key(c),{type:'json'});if(!g)return json({error:'Game code not found.'},404);
  if(a==='join'){const p={id:randomUUID(),name:String(d.name||'Player').slice(0,30)};g.players=[...(g.players||[]),p];await store().setJSON(key(c),g);return json({code:c,playerId:p.id});}
  if(a==='start'){if(d.hostToken!==g.hostToken)return json({error:'Only the host can start.'},403);g.status='Started';await store().setJSON(key(c),g);return json({status:g.status});}
  if(a==='pick'){if(g.status!=='Started')return json({error:'Game not started.'},409);g.picks={...(g.picks||{}),[d.playerId]:d.choice};await store().setJSON(key(c),g);return json({choice:d.choice,locked:true});}
  if(a==='state')return json(g);
  return json({error:'Unknown action'},404);
 }catch(e){return json({error:e.message||'Server error'},500)}
}
export const config={path:'/api/game'};
