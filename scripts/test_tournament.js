'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Full NSEL tournament simulation — group stage → knockout → final
// 16 teams · 4 groups of 4 · advance 2 per group · 3 group rounds
// Mirrors the EXACT bot logic from botolaInteractions.js
// Cleans up all test data on exit.
// ─────────────────────────────────────────────────────────────────────────────
const { db } = require('/home/ubuntu/goatsi/src/utils/database');

// ── Colours ───────────────────────────────────────────────────────────────────
const B  = s => `\x1b[1m${s}\x1b[0m`;
const DIM= s => `\x1b[2m${s}\x1b[0m`;
const GRN= s => `\x1b[32m${s}\x1b[0m`;
const YLW= s => `\x1b[33m${s}\x1b[0m`;
const RED= s => `\x1b[31m${s}\x1b[0m`;
const BLU= s => `\x1b[34m${s}\x1b[0m`;
const MAG= s => `\x1b[35m${s}\x1b[0m`;
const CYN= s => `\x1b[36m${s}\x1b[0m`;

const HR  = () => console.log(B(CYN('═'.repeat(60))));
const H1  = s  => { HR(); console.log(B(CYN(`  ${s}`))); HR(); };
const H2  = s  => console.log(`\n${B(YLW(`▶  ${s}`))}`);
const H3  = s  => console.log(`\n  ${B(BLU(s))}`);
const OK  = s  => console.log(`  ${GRN('✓')}  ${s}`);
const LI  = s  => console.log(`  ${DIM('·')}  ${s}`);
const ERR = s  => console.log(`  ${RED('✗')}  ${s}`);
const pad = (s,n) => String(s).padEnd(n);

// ── Score generators ──────────────────────────────────────────────────────────
const rg  = () => [0,0,0,1,1,1,1,2,2,2,3,3,4][Math.floor(Math.random()*13)];
function koScore(){ let h,a; do{ h=rg(); a=rg(); }while(h===a); return [h,a]; }

// ── 16-team pool ──────────────────────────────────────────────────────────────
const POOL=[
  ['Real Madrid','RMA'],['FC Barcelona','BAR'],['Bayern Munich','BAY'],['PSG','PSG'],
  ['Liverpool FC','LIV'],['Manchester City','MCI'],['Juventus','JUV'],['AC Milan','MIL'],
  ['Inter Milan','INT'],['Atletico Madrid','ATL'],['Borussia Dortmund','BVB'],['Porto','POR'],
  ['Benfica','SLB'],['Ajax','AJX'],['AS Roma','ROM'],['Napoli','NAP'],
];
const shuffle = a => { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; };

// ── Bot helpers (exact copy of botolaInteractions.js internal functions) ──────
const getTeam = id => db.findById('teams', id) || { name:`#${id}`, short_name:`#${id}` };

function runGroupDraw(tid, tpg=4){
  const rows = db.get('tournament_teams').filter(tt=>tt.tournament_id===tid);
  const shuf = [...rows].sort(()=>Math.random()-0.5);
  'ABCDEFGHIJKLMNOP'.split('').slice(0, Math.ceil(shuf.length/tpg))
    .forEach((letter, gi) => {
      shuf.slice(gi*tpg, gi*tpg+tpg).forEach(tt =>
        db.update('tournament_teams', tt.id, { group_name: letter })
      );
    });
}

function generateGroupSchedule(tid){
  const rows = db.get('tournament_teams').filter(tt=>tt.tournament_id===tid);
  const groups = {};
  for(const tt of rows){ const g=tt.group_name||'A'; if(!groups[g])groups[g]=[]; groups[g].push(tt); }
  for(const gTeams of Object.values(groups)){
    const arr=[...gTeams]; if(arr.length%2!==0) arr.push(null);
    const nR=arr.length-1, half=arr.length/2;
    const fixed=arr[0], rot=arr.slice(1);
    for(let r=0;r<nR;r++){
      const rt=[fixed,...rot];
      for(let i=0;i<half;i++){
        const h=rt[i], a=rt[rt.length-1-i];
        if(h&&a) db.insert('matches',{tournament_id:tid,home_team_id:h.team_id,away_team_id:a.team_id,
          stage:'group',round:r+1,leg:1,status:'pending',home_score:null,away_score:null});
      }
      rot.unshift(rot.pop());
    }
  }
}

function updateStandings(tid, matchId, hs, as_){
  const m=db.findById('matches',matchId); if(!m) return;
  const t=db.findById('tournaments',tid); if(!t) return;
  const wp=t.win_pts??3, dp=t.draw_pts??1, lp=t.loss_pts??0;
  const h=db.findOne('tournament_teams',tt=>tt.tournament_id===tid&&tt.team_id===m.home_team_id);
  const a=db.findOne('tournament_teams',tt=>tt.tournament_id===tid&&tt.team_id===m.away_team_id);
  if(hs>as_){
    if(h)db.update('tournament_teams',h.id,{wins:(h.wins||0)+1,points:(h.points||0)+wp,goals_for:(h.goals_for||0)+hs,goals_against:(h.goals_against||0)+as_});
    if(a)db.update('tournament_teams',a.id,{losses:(a.losses||0)+1,points:(a.points||0)+lp,goals_for:(a.goals_for||0)+as_,goals_against:(a.goals_against||0)+hs});
  } else if(as_>hs){
    if(h)db.update('tournament_teams',h.id,{losses:(h.losses||0)+1,points:(h.points||0)+lp,goals_for:(h.goals_for||0)+hs,goals_against:(h.goals_against||0)+as_});
    if(a)db.update('tournament_teams',a.id,{wins:(a.wins||0)+1,points:(a.points||0)+wp,goals_for:(a.goals_for||0)+as_,goals_against:(a.goals_against||0)+hs});
  } else {
    if(h)db.update('tournament_teams',h.id,{draws:(h.draws||0)+1,points:(h.points||0)+dp,goals_for:(h.goals_for||0)+hs,goals_against:(h.goals_against||0)+as_});
    if(a)db.update('tournament_teams',a.id,{draws:(a.draws||0)+1,points:(a.points||0)+dp,goals_for:(a.goals_for||0)+as_,goals_against:(a.goals_against||0)+hs});
  }
  db.update('matches',matchId,{status:'played',home_score:hs,away_score:as_});
}

function generateKnockoutBracket(tid){
  const t=db.findById('tournaments',tid);
  const advance=t.advance_per_group||2;
  const rows=db.get('tournament_teams').filter(tt=>tt.tournament_id===tid&&tt.group_name);
  const groups={};
  for(const tt of rows){ const g=tt.group_name; if(!groups[g])groups[g]=[]; groups[g].push(tt); }
  const qualifiers=[];
  for(const gTeams of Object.values(groups)){
    gTeams.sort((a,b)=>{const d=(b.points||0)-(a.points||0);return d||((b.goals_for||0)-(b.goals_against||0))-((a.goals_for||0)-(a.goals_against||0));});
    qualifiers.push(...gTeams.slice(0,advance));
  }
  const shuf=[...qualifiers].sort(()=>Math.random()-0.5);
  const numMatches=Math.floor(shuf.length/2);
  for(let i=0;i+1<shuf.length;i+=2){
    db.insert('matches',{tournament_id:tid,home_team_id:shuf[i].team_id,away_team_id:shuf[i+1].team_id,
      stage:'knockout',round:numMatches,leg:1,status:'pending',home_score:null,away_score:null});
  }
}

// Fixed advanceKnockout — mirrors the patched bot version
function advanceKnockout(tid){
  const matches=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='knockout');
  // Lowest round number = most advanced stage (Final=1 < SF=2 < QF=4)
  const completedRounds=[...new Set(matches.filter(m=>m.status==='played').map(m=>m.round))]
    .filter(r=>matches.filter(m=>m.round===r).every(m=>m.status==='played'))
    .sort((a,b)=>a-b);
  if(!completedRounds.length) return false;
  const curRound=completedRounds[0];
  const curPlayed=matches.filter(m=>m.round===curRound&&m.status==='played');
  const nextRound=Math.floor(curRound/2);
  if(nextRound<1){ db.update('tournaments',tid,{status:'finished'}); return 'finished'; }
  if(matches.some(m=>m.round===nextRound)) return false; // already exists
  const winners=curPlayed.map(m=>m.home_score>m.away_score?m.home_team_id:m.away_score>m.home_score?m.away_team_id:(m.pen_winner||m.away_team_id));
  for(let i=0;i+1<winners.length;i+=2){
    db.insert('matches',{tournament_id:tid,home_team_id:winners[i],away_team_id:winners[i+1],
      stage:'knockout',round:nextRound,leg:1,status:'pending',home_score:null,away_score:null});
  }
  return nextRound;
}

// ── Display helpers ───────────────────────────────────────────────────────────
const roundName = r => r===1?'FINAL':r===2?'SEMI-FINAL':`QUARTER-FINAL (R${r})`;

function printRoundSchedule(tid, round, label){
  const matches=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='group'&&m.round===round);
  H3(`📅  Schedule — ${label}  (${matches.length} matches)`);
  const byGroup={};
  matches.forEach(m=>{
    const tt=db.findOne('tournament_teams',r=>r.tournament_id===tid&&r.team_id===m.home_team_id);
    const g=tt?.group_name||'?'; if(!byGroup[g])byGroup[g]=[];
    byGroup[g].push(m);
  });
  for(const [g,ms] of Object.entries(byGroup).sort())
    ms.forEach(m=>LI(`Grp ${g}:  ${pad(getTeam(m.home_team_id).name,22)} vs  ${getTeam(m.away_team_id).name}`));
}

function printRoundResults(tid, round, label){
  const matches=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='group'&&m.round===round&&m.status==='played');
  H3(`⚽  Results — ${label}  (${matches.length} matches)`);
  const byGroup={};
  matches.forEach(m=>{
    const tt=db.findOne('tournament_teams',r=>r.tournament_id===tid&&r.team_id===m.home_team_id);
    const g=tt?.group_name||'?'; if(!byGroup[g])byGroup[g]=[];
    byGroup[g].push(m);
  });
  for(const [g,ms] of Object.entries(byGroup).sort()){
    ms.forEach(m=>{
      const icon=m.home_score>m.away_score?GRN('W'):m.away_score>m.home_score?RED('L'):YLW('D');
      LI(`Grp ${g}:  ${pad(getTeam(m.home_team_id).name,22)}  ${B(m.home_score)} – ${B(m.away_score)}  ${pad(getTeam(m.away_team_id).name,22)}  ${icon}`);
    });
  }
}

function printStandings(tid, label){
  H3(`📊  Standings — After ${label}`);
  const rows=db.get('tournament_teams').filter(tt=>tt.tournament_id===tid);
  const groups={};
  rows.forEach(tt=>{ const g=tt.group_name||'?'; if(!groups[g])groups[g]=[]; groups[g].push(tt); });
  for(const [g,gRows] of Object.entries(groups).sort()){
    gRows.sort((a,b)=>(b.points||0)-(a.points||0)||((b.goals_for||0)-(b.goals_against||0))-((a.goals_for||0)-(a.goals_against||0)));
    console.log(`\n     ${B(`Group ${g}`)}`);
    console.log(`     ${'Pos  Team                    Pts  W  D  L   GF  GA  GD'}`);
    console.log(`     ${'─'.repeat(54)}`);
    gRows.forEach((row,i)=>{
      const t=getTeam(row.team_id);
      const gd=(row.goals_for||0)-(row.goals_against||0);
      const qualify=i<2?GRN('  ◆'):'   ';
      console.log(`     ${String(i+1).padStart(2)}.  ${pad(t.name,22)}  ${String(row.points||0).padStart(3)}  ${String(row.wins||0).padStart(1)}  ${String(row.draws||0).padStart(1)}  ${String(row.losses||0).padStart(1)}   ${String(row.goals_for||0).padStart(2)}  ${String(row.goals_against||0).padStart(2)}  ${(gd>=0?'+':'')+gd}${qualify}`);
    });
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
H1('NSEL S99 TEST — Full Tournament Simulation');
console.log(`  16 teams · 4 groups of 4 · advance top-2 per group · 3 group rounds\n`);

const teamIds=[], ttIds=[], matchIds=[];
let tid=null;
let errors=0;

try {
  // ── Step 1: Create tournament ────────────────────────────────────────────
  H2('1 · Create Tournament');
  const old=db.get('tournaments').find(t=>t.template==='NSEL'&&t.season===99);
  if(old){
    db.get('matches').filter(m=>m.tournament_id===old.id).forEach(m=>db.delete('matches',m.id));
    db.get('tournament_teams').filter(tt=>tt.tournament_id===old.id).forEach(tt=>db.delete('tournament_teams',tt.id));
    db.delete('tournaments',old.id);
  }
  const t=db.insert('tournaments',{
    name:'NSEL S99',template:'NSEL',season:99,status:'active',
    registration_open:false,type:'group_knockout',team_count:16,
    teams_per_group:4,advance_per_group:2,players_per_team:1,encounters:1,
    win_pts:3,draw_pts:1,loss_pts:0,forfeit_pts:0,
    channels:{},panel1_ref:null,panel2_ref:null,panel3_ref:null,
    winner_role_id:null,registration_role_id:null,winners_history_ref:null,
  });
  tid=t.id;
  OK(`Tournament ID ${tid} — NSEL S99 — 16 teams, 4 groups of 4, advance 2`);

  // ── Step 2: Enroll 16 teams ──────────────────────────────────────────────
  H2('2 · Enroll 16 Teams');
  for(const [name,short_name] of shuffle([...POOL]).slice(0,16)){
    const tm=db.insert('teams',{name,short_name,category:'Test',emoji:'⚽'});
    teamIds.push(tm.id);
    const tt=db.insert('tournament_teams',{tournament_id:tid,team_id:tm.id,group_name:null,
      wins:0,draws:0,losses:0,goals_for:0,goals_against:0,points:0});
    ttIds.push(tt.id);
  }
  OK(`16 teams enrolled`);

  // ── Step 3: Group draw ───────────────────────────────────────────────────
  H2('3 · Group Draw');
  runGroupDraw(tid,4);
  const groupMap={};
  db.get('tournament_teams').filter(tt=>tt.tournament_id===tid).forEach(tt=>{
    const g=tt.group_name||'?'; if(!groupMap[g])groupMap[g]=[];
    groupMap[g].push(getTeam(tt.team_id).name);
  });
  for(const [g,names] of Object.entries(groupMap).sort())
    OK(`Group ${g}:  ${names.join('  ·  ')}`);

  // ── Step 4: Generate schedule ────────────────────────────────────────────
  H2('4 · Generate Group Stage Schedule');
  generateGroupSchedule(tid);
  const allGroup=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='group');
  allGroup.forEach(m=>matchIds.push(m.id));
  const rounds=[...new Set(allGroup.map(m=>m.round))].sort((a,b)=>a-b);
  OK(`${allGroup.length} matches · ${rounds.length} rounds  (${rounds.map(r=>`R${r}`).join(', ')})`);

  // Validate: 4 teams/group × 3 rounds = 6 matches/group × 4 groups = 24 total
  if(allGroup.length!==24){ ERR(`Expected 24 matches, got ${allGroup.length}`); errors++; }
  else OK('Match count correct: 24 matches (6 per group × 4 groups)');

  // Validate: each team plays exactly once per round
  for(const r of rounds){
    const rm=allGroup.filter(m=>m.round===r);
    const appearances={};
    rm.forEach(m=>{
      appearances[m.home_team_id]=(appearances[m.home_team_id]||0)+1;
      appearances[m.away_team_id]=(appearances[m.away_team_id]||0)+1;
    });
    const bad=Object.entries(appearances).filter(([,c])=>c!==1);
    if(bad.length){ ERR(`Round ${r}: ${bad.length} teams play more than once!`); errors++; }
    else OK(`Round ${r}: every team plays exactly once ✓`);
  }

  // ── Step 5: Group stage — round by round ─────────────────────────────────
  H2('5 · Group Stage — Round by Round');

  for(const [ri, r] of rounds.entries()){
    const label=`Round ${r}`;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(B(`  GROUP STAGE — ${label}`));
    console.log('─'.repeat(60));

    // Show schedule for this round
    printRoundSchedule(tid, r, label);

    // Play all matches in this round
    const rm=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='group'&&m.round===r);
    for(const m of rm){ const hs=rg(),as_=rg(); updateStandings(tid,m.id,hs,as_); }

    // Show results for this round
    printRoundResults(tid, r, label);

    // Show standings after this round
    printStandings(tid, label);

    // Show schedule of NEXT round (if not last)
    if(ri<rounds.length-1){
      printRoundSchedule(tid, rounds[ri+1], `Round ${rounds[ri+1]} (Next)`);
    }
  }

  // ── Step 6: Advance to Knockout ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  H2('6 · Advance to Knockout Stage');
  generateKnockoutBracket(tid);
  const koMatches=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='knockout');
  koMatches.forEach(m=>{ if(!matchIds.includes(m.id)) matchIds.push(m.id); });
  const koRounds=[...new Set(koMatches.map(m=>m.round))].sort((a,b)=>b-a);
  OK(`${koMatches.length} KO matches generated`);
  OK(`Stages: ${koRounds.map(r=>`${roundName(r)} (${koMatches.filter(m=>m.round===r).length} matches)`).join('  →  ')}`);

  // ── Step 7: Knockout Stage ───────────────────────────────────────────────
  H2('7 · Knockout Stage');

  let advResult=true;
  let safetyCounter=0;
  while(advResult!=='finished' && safetyCounter<10){
    safetyCounter++;
    const pending=db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='knockout'&&m.status==='pending');
    if(!pending.length) break;
    const curRound=pending[0].round;
    const rName=roundName(curRound);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(B(MAG(`  KO STAGE — ${rName}`)));
    console.log('─'.repeat(60));

    // Schedule
    H3(`📅  Bracket / Schedule — ${rName}`);
    pending.filter(m=>m.round===curRound).forEach(m=>
      LI(`${pad(getTeam(m.home_team_id).name,22)}  vs  ${getTeam(m.away_team_id).name}`)
    );

    // Play all matches
    for(const m of pending.filter(mm=>mm.round===curRound)){
      const[hs,as_]=koScore();
      db.update('matches',m.id,{status:'played',home_score:hs,away_score:as_});
    }

    // Results
    H3(`⚽  Results — ${rName}`);
    db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='knockout'&&m.round===curRound&&m.status==='played')
      .forEach(m=>{
        const w=m.home_score>m.away_score?m.home_team_id:m.away_team_id;
        LI(`${pad(getTeam(m.home_team_id).name,22)}  ${B(m.home_score)} – ${B(m.away_score)}  ${pad(getTeam(m.away_team_id).name,22)}  ${GRN('→ '+getTeam(w).name)}`);
      });

    // Advance
    advResult=advanceKnockout(tid);

    // Collect new match IDs
    db.get('matches').filter(m=>m.tournament_id===tid&&m.stage==='knockout'&&!matchIds.includes(m.id))
      .forEach(m=>matchIds.push(m.id));

    if(advResult==='finished'){
      const finalM=db.get('matches').find(m=>m.tournament_id===tid&&m.stage==='knockout'&&m.round===1&&m.status==='played');
      if(finalM){
        const champId=finalM.home_score>finalM.away_score?finalM.home_team_id:finalM.away_team_id;
        const champ=getTeam(champId);
        console.log(`\n${B(CYN('═'.repeat(60)))}`);
        console.log(B(CYN(`  🏆  CHAMPION:  ${champ.name}  (${champ.short_name})`)));
        console.log(B(CYN('═'.repeat(60))));
      }
    }
  }
  if(safetyCounter>=10){ ERR('Safety limit hit — potential infinite loop'); errors++; }

  // ── Step 8: Final validation ─────────────────────────────────────────────
  H2('8 · Validation');
  const finalT=db.findById('tournaments',tid);
  const allM=db.get('matches').filter(m=>m.tournament_id===tid);
  const played=allM.filter(m=>m.status==='played').length;
  const pending=allM.filter(m=>m.status==='pending').length;
  OK(`Tournament status: ${B(finalT.status)}`);
  OK(`Total matches: ${allM.length}  |  Played: ${played}  |  Pending: ${pending}`);
  OK(`Group: ${allM.filter(m=>m.stage==='group').length}  |  Knockout: ${allM.filter(m=>m.stage==='knockout').length}`);
  if(finalT.status!=='finished'){ ERR('Tournament not finished!'); errors++; }
  else OK('Tournament correctly marked finished ✓');
  if(pending>0){ ERR(`${pending} matches still pending`); errors++; }
  else OK('All matches played ✓');
  console.log(errors===0 ? `\n  ${GRN(B('ALL CHECKS PASSED ✓'))}` : `\n  ${RED(B(`${errors} CHECK(S) FAILED`))}`);

} catch(err){
  console.error(`\n${RED('ERROR: '+err.message)}`);
  console.error(err.stack);
} finally {
  H2('Cleanup');
  let n=0;
  for(const id of matchIds)  { try{db.delete('matches',id);n++;}catch(_){} }
  for(const id of ttIds)     { try{db.delete('tournament_teams',id);n++;}catch(_){} }
  for(const id of teamIds)   { try{db.delete('teams',id);n++;}catch(_){} }
  if(tid!==null)              { try{db.delete('tournaments',tid);n++;}catch(_){} }
  OK(`Removed ${n} test records — DB restored`);
  console.log('');
}
process.exit(0);
