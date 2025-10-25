/* ================== Simple, reliable audio (HTMLAudio only) ================== */
const AudioMgr = (() => {
  const el = {
    bgm: new Audio('assets/music_bg.mp3'),
    victory: new Audio('assets/music_victory.mp3'),
    defeat: new Audio('assets/music_defeat.mp3'),
    step: new Audio('assets/sfx_step.mp3'),
    jump: new Audio('assets/sfx_jump.mp3'),
    shoot: new Audio('assets/sfx_shoot.mp3'),
    mega: new Audio('assets/sfx_mega.mp3'),
    megaReady: new Audio('assets/sfx_mega_ready.mp3'),
    hitPlayer: new Audio('assets/sfx_hit_player.mp3'),
    hitVillain: new Audio('assets/sfx_hit_villain.mp3'),
  };
  let enabled = false, primed = false;

  // track live SFX clones so we can stop them when switching levels
  const sfxPlaying = [];

  el.bgm.loop = true; el.bgm.volume = 0.5;

  async function primeAll() {
    if (primed) return;
    primed = true;
    const audios = Object.values(el);
    for (const a of audios) {
      try { a.muted = true; a.currentTime = 0; await a.play(); a.pause(); a.muted = false; } catch {}
    }
  }

  async function startBgm(){ if (!enabled) return; try { el.bgm.currentTime = 0; await el.bgm.play(); } catch {} }
  function stopBgm(){ try{ el.bgm.pause(); }catch{} }

  async function setEnabled(v){ enabled = v; if (enabled) await startBgm(); else stopBgm(); }
  function toggle(){ setEnabled(!enabled); return enabled; }

  function playSfx(name, vol=1){
    const base = el[name]; if (!base) return;
    const a = base.cloneNode(true); a.volume = vol;
    a.play().catch(()=>{});
    sfxPlaying.push(a);
    a.addEventListener('ended', () => {
      const i = sfxPlaying.indexOf(a); if (i >= 0) sfxPlaying.splice(i,1);
    });
  }

  function stopAllSfx(){
    for (const a of sfxPlaying) { try { a.pause(); } catch{} }
    sfxPlaying.length = 0;
  }

  return { primeAll, setEnabled, toggle, playSfx, stopBgm, stopAllSfx };
})();

/* ================== DOM & canvas ================== */
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const keyStateEl = $('keyState'), megaBar = $('megaBar'), musicToggle = $('musicToggle');
const startOverlay = $('startOverlay'), btnStart = $('btnStart');

const W = 1280, H = 720; canvas.width = W; canvas.height = H;

/* Rotate prompt */
const rotateOverlay = $('rotateOverlay');
function checkOrientation(){ rotateOverlay.classList.toggle('show', innerWidth < innerHeight); }
addEventListener('resize', checkOrientation); addEventListener('orientationchange', checkOrientation); checkOrientation();

/* ================== Mobile controls ================== */
let mobileControls, joyWrap, stick, btnShoot, btnMega, leftButtonsEl;
(function injectControls(){
  mobileControls = document.createElement('div');
  mobileControls.id = 'mobileControls';
  mobileControls.innerHTML = `
    <div id="leftButtons" class="leftButtons">
      <button id="btnShoot">Shoot</button>
      <button id="btnMega">Mega</button>
    </div>
    <div id="joystick"><div id="stick"></div></div>`;
  document.body.appendChild(mobileControls);

  btnShoot = $('btnShoot'); btnMega = $('btnMega');
  joyWrap = $('joystick'); stick = $('stick');
  leftButtonsEl = document.getElementById('leftButtons');

  // Move buttons down by 50px so HUD text isn't covered (no CSS edit required)
  if (leftButtonsEl) {
    const currentTop = parseFloat(getComputedStyle(leftButtonsEl).top || '12') || 12;
    leftButtonsEl.style.top = (currentTop + 50) + 'px'; // 12px -> 62px
  }

  // Controls off until Start
  mobileControls.style.pointerEvents = 'none';
})();

/* Joystick logic */
let joyActive=false, joyVec={x:0,y:0}; const JOY_R=75;
let uiModalOpen=false, gameState='idle';

function inTopLeftUiZone(x,y){ const zoneW = Math.max(220, innerWidth*0.28), zoneH = 130; return x < zoneW && y < zoneH; }

// prevent joystick over the actual buttons AND the Music toggle
function isOverElement(x, y, el){
  if (!el) return false; const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function isOverButtons(x,y){ return isOverElement(x,y,leftButtonsEl); }
function isOverMusic(x,y){ return isOverElement(x,y, musicToggle); }

function placeJoystick(x,y){
  const JW=170,JH=170;
  joyWrap.style.left = Math.min(innerWidth-JW-8, Math.max(8, x-JW/2))+'px';
  joyWrap.style.top  = Math.min(innerHeight-JH-8, Math.max(8, y-JH/2))+'px';
  joyWrap.style.display='block';
}
function joyDown(ev){
  if (gameState!=='playing' || uiModalOpen || startOverlay.style.display!=='none') return;
  if (!joyWrap || !stick) return;
  const t = ev.touches ? ev.touches[0] : ev;

  // Hard block: never spawn joystick over buttons or music toggle
  if (isOverButtons(t.clientX, t.clientY)) return;
  if (isOverMusic(t.clientX, t.clientY)) return;

  // Keep the coarse top-left guard too
  if (inTopLeftUiZone(t.clientX, t.clientY)) return;

  if (ev.target && ev.target.closest && ev.target.closest('.leftButtons')) return;
  joyActive=true; placeJoystick(t.clientX, t.clientY); joyMove(ev);
}
function joyPos(ev){ const r=joyWrap.getBoundingClientRect(); const t=ev.touches?ev.touches[0]:ev; return {x:t.clientX-r.left-r.width/2, y:t.clientY-r.top-r.height/2}; }
function joyMove(ev){
  if (!joyActive) return;
  if (ev.cancelable) ev.preventDefault();
  const p=joyPos(ev), m=Math.hypot(p.x,p.y), c=Math.min(m,JOY_R);
  const nx=(m?p.x/m:0)*c, ny=(m?p.y/m:0)*c;
  stick.style.transform = `translate(${nx}px,${ny}px)`;
  joyVec.x = nx/JOY_R; joyVec.y = ny/JOY_R;
}
function joyUp(){ joyActive=false; joyVec.x=0; joyVec.y=0; stick.style.transform='translate(0,0)'; joyWrap.style.display='none'; }

document.addEventListener('touchstart', joyDown, {passive:false});
document.addEventListener('touchmove',  joyMove, {passive:false});
document.addEventListener('touchend',   joyUp,   {passive:false});
document.addEventListener('mousedown',  e=>{ if (gameState==='playing') joyDown(e); }, {passive:false});
document.addEventListener('mousemove',  joyMove, {passive:false});
document.addEventListener('mouseup',    joyUp,   {passive:false});

/* Shoot buttons */
btnShoot.addEventListener('touchstart', e=>{ e.preventDefault(); if(gameState==='playing') shootPrimary(); }, {passive:false});
btnShoot.addEventListener('click', ()=>{ if(gameState==='playing') shootPrimary(); });
btnMega .addEventListener('touchstart', e=>{ e.preventDefault(); if(gameState==='playing') shootMega(); }, {passive:false});
btnMega .addEventListener('click', ()=>{ if(gameState==='playing') shootMega(); });

/* ================== Keyboard (desktop) ================== */
const keys={a:false,d:false,w:false};
addEventListener('keydown', e=>{
  if (e.repeat || gameState!=='playing') return;
  const k=e.key.toLowerCase(); if(k==='a')keys.a=true; if(k==='d')keys.d=true; if(k==='w')keys.w=true;
  if(k==='q')shootPrimary(); if(k==='e')shootMega();
});
addEventListener('keyup', e=>{ const k=e.key.toLowerCase(); if(k==='a')keys.a=false; if(k==='d')keys.d=false; if(k==='w')keys.w=false; });

/* ================== Assets ================== */
function img(src){ const i=new Image(); i.src=src; return i; }
const IMG = {
  bg: img('assets/background_stage1.png'),
  player: img('assets/player.png'),
  villain: img('assets/villain1.png'),
  key: img('assets/key.png'),
  doorClosed: img('assets/doorclose.png'),
  doorOpen: img('assets/dooropen.png'),
  wall1: img('assets/wall1.png'),
  wall2: img('assets/wall2.png'),
  wall3: img('assets/wall3.png'),
  wall4: img('assets/wall4.png'),
  bulletPlayer: img('assets/bullet_player.png'),
  bulletMega: img('assets/bullet_mega.png'),
  bulletVillain: img('assets/bullet_villain.png')
};

/* ================== Game state & constants ================== */
const GRAVITY=2600, MOVE_SPEED=450, JUMP_V=1200;
const GROUND_Y=H-60;
let worldWidth=2000, cameraX=0;

const player={x:40,y:GROUND_Y-100,w:80,h:100,vx:0,vy:0,onGround:false,facing:1,alive:true,hasKey:false,hp:3};
const bullets=[]; const BULLET_SPEED=800, BIG_BULLET_SPEED=700, MEGA_CD=10.0; let megaTimer=MEGA_CD;

let platforms=[], villains=[];
let keyItem={x:1120,y:(GROUND_Y-460)-56,w:56,h:56};
let goal={x:1180,w:96,h:160,open:false,y:GROUND_Y-160};

let currentLevel=1, MAX_LEVEL=10, gameOver=false, victory=false, runFinished=false;

/* ================== Helpers ================== */
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function aabb(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function drawCover(img,dw,dh){ const iw=img.naturalWidth,ih=img.naturalHeight; const s=Math.max(dw/iw,dh/ih); const sw=dw/s,sh=dh/s; const sx=(iw-sw)/2, sy=(ih-sh)/2; ctx.drawImage(img,sx,sy,sw,sh,0,0,dw,dh); }
function drawSprite(img,x,y,w,h,dir,facesRight,fallback='#fff'){
  if(img && img.complete && img.naturalWidth){ ctx.save(); ctx.translate(x+w/2,y); ctx.scale((facesRight?dir:-dir),1); ctx.drawImage(img,-w/2,0,w,h); ctx.restore(); }
  else{ ctx.fillStyle=fallback; ctx.fillRect(x,y,w,h); }
}

/* ================== Level generation ================== */
function findClearDoorX(minC=80){
  const marginL=160, marginR=160, step=60, end=worldWidth-marginR-goal.w;
  for(let x=marginL; x<=end; x+=step){
    const hit = platforms.find(p=> !(x+goal.w<p.x || x>p.x+p.w) && (p.y-(GROUND_Y-goal.h))<minC );
    if(!hit) return clamp(x, marginL, end);
  }
  return clamp(end-120, marginL, end);
}
function buildLevel(level){
  worldWidth = 2000 + (level-1)*400;

  Object.assign(player,{x:40,y:GROUND_Y-player.h,vx:0,vy:0,onGround:true,hasKey:false,alive:true,hp:3});
  bullets.length=0; platforms=[]; villains=[];
  goal={x:worldWidth-140,w:96,h:160,open:false,y:GROUND_Y-160};

  const base=6, extra=Math.min(10,Math.floor((level-1)*1.2)), count=base+extra;
  const marginL=160, marginR=160, usable=worldWidth-marginL-marginR, seg=usable/(count+1);
  const tiers=[GROUND_Y-160, GROUND_Y-260, GROUND_Y-340, GROUND_Y-220];

  for(let i=1;i<=count;i++){
    let px=marginL + seg*i + (Math.random()*60-30);
    const tier=(i+(level%2))%tiers.length, py=tiers[tier];
    const w=240+40*(i%3), h=64, imgTex=[IMG.wall1,IMG.wall2,IMG.wall3,IMG.wall4][i%4];
    px=clamp(px,120,worldWidth-w-120);
    platforms.push({name:`wall${i}`, x:px, y:py, w, h, img:imgTex});
  }

  goal.x = findClearDoorX(80); goal.y = GROUND_Y - goal.h;

  const lastP = platforms[platforms.length-1] || {x:worldWidth-400,y:GROUND_Y-300,w:260};
  keyItem = {x:lastP.x + lastP.w/2 - 28, y:lastP.y - 56, w:56, h:56};

  const vilCount = 1 + Math.floor((level-1)*0.9);
  const baseCD = 1.5 - Math.min(0.9, (level-1)*0.08);
  const bulletMul = 1 + Math.min(1.0, (level-1)*0.1);
  const patrolBase = 80 + level*10;

  for(let i=0;i<vilCount;i++){
    const idx=Math.floor((i+1)*(platforms.length/(vilCount+1)));
    const plat=platforms[clamp(idx,0,platforms.length-1)];
    const left=(plat?plat.x+10:100), right=(plat?plat.x+plat.w-84-10:300);
    const x0=clamp((plat?plat.x+plat.w*0.5:600)+(i%2===0?-20:20), left, right);
    const y0=(plat?plat.y-100:GROUND_Y-100);
    villains.push({x:x0,y:y0,w:84,h:100,vx:0,vy:0,onGround:true,facing:1,alive:true,
      cooldown: baseCD*(0.6+Math.random()*0.8), cdBase: baseCD, bulletMul,
      patrolLeft:left, patrolRight:right, patrolSpeed:patrolBase*(0.8+Math.random()*0.4), patrolDir:(i%2===0?-1:1)});
  }

  cameraX = 0;
}

/* ================== Player actions ================== */
function tryJump(){ if(player.onGround && player.alive){ player.vy=-JUMP_V; player.onGround=false; AudioMgr.playSfx('jump',0.9);} }
function shootPrimary(){ if(!player.alive) return; const dir=player.facing; bullets.push({x:player.x+player.w/2,y:player.y+player.h/2-8,vx:dir*BULLET_SPEED,vy:0,w:32,h:16,from:'player'}); AudioMgr.playSfx('shoot',0.85); }
function shootMega(){ if(!player.alive) return; if(megaTimer>=MEGA_CD){ const dir=player.facing; bullets.push({x:player.x+player.w/2,y:player.y+player.h/2-16,vx:dir*BIG_BULLET_SPEED,vy:0,w:64,h:32,from:'player',big:true}); megaTimer=0; AudioMgr.playSfx('mega',0.95);} }
function villainShoot(v){ if(!v.alive) return; const dir=(player.x<v.x)?-1:1; v.facing=dir; const sp=(BULLET_SPEED*0.85)*(v.bulletMul||1); bullets.push({x:v.x+v.w/2,y:v.y+v.h/2-8,vx:dir*sp,vy:0,w:28,h:16,from:'villain'}); }

/* ================== Start / Music toggle ================== */
async function startGame(){
  await AudioMgr.primeAll();
  await AudioMgr.setEnabled(true);           // starts bgm fresh
  musicToggle.textContent = 'Music: On';

  // Enable controls AFTER start so they never block the button
  mobileControls.style.pointerEvents = '';

  startOverlay.style.display='none';
  gameState='playing'; currentLevel=1; startLevel(currentLevel);
}
btnStart.addEventListener('touchstart', e=>{e.preventDefault(); startGame();}, {passive:false});
btnStart.addEventListener('click', startGame);

musicToggle.addEventListener('click', async ()=>{
  const on = AudioMgr.toggle();
  musicToggle.textContent = on ? 'Music: On' : 'Music: Off';
});

/* ================== Loop ================== */
const ORIENT={ playerFacesRight:true, villainFacesRight:true, bulletPlayerFacesRight:true, bulletMegaFacesRight:true, bulletVillainFacesRight:false };

function render(){
  if (IMG.bg && IMG.bg.complete && IMG.bg.naturalWidth) drawCover(IMG.bg,W,H); else { ctx.fillStyle='#1a1f2b'; ctx.fillRect(0,0,W,H); }
  ctx.save(); ctx.translate(-cameraX,0);

  // ground
  ctx.fillStyle='#3b3b3b'; ctx.fillRect(0,GROUND_Y,Math.max(worldWidth,W),H-GROUND_Y);

  // platforms
  for(const p of platforms){ if(p.img && p.img.complete && p.img.naturalWidth) ctx.drawImage(p.img,p.x,p.y,p.w,p.h); else { ctx.fillStyle='#6a6a6a'; ctx.fillRect(p.x,p.y,p.w,p.h); } }

  // key
  if(!player.hasKey){ const k=IMG.key; if(k && k.complete && k.naturalWidth) ctx.drawImage(k,keyItem.x,keyItem.y,keyItem.w,keyItem.h); else { ctx.fillStyle='#ffd54f'; ctx.fillRect(keyItem.x,keyItem.y,keyItem.w,keyItem.h); } }

  // door
  const d = goal.open ? IMG.doorOpen : IMG.doorClosed;
  if (d && d.complete && d.naturalWidth) ctx.drawImage(d,goal.x,goal.y,goal.w,goal.h); else { ctx.fillStyle='#8a5'; ctx.fillRect(goal.x,goal.y,goal.w,goal.h); }

  // player & villains
  drawSprite(IMG.player, player.x, player.y, player.w, player.h, player.facing, true, '#4ec9f0');
  for(const v of villains){ if(!v.alive) continue; drawSprite(IMG.villain, v.x, v.y, v.w, v.h, v.facing, true, '#f25'); }

  // bullets
  for(const b of bullets){
    const dir=Math.sign(b.vx)||1;
    let imgEl=null, facesRight=true, col='#fff';
    if(b.big){ imgEl=IMG.bulletMega; facesRight=true; col='#9cf'; }
    else if(b.from==='player'){ imgEl=IMG.bulletPlayer; facesRight=true; }
    else { imgEl=IMG.bulletVillain; facesRight=false; col:'#ff8a80'; }
    drawSprite(imgEl, b.x, b.y, b.w, b.h, dir, facesRight, col);
  }

  ctx.restore();
  // HUD text
  ctx.fillStyle='#fff'; ctx.font='16px system-ui, Segoe UI, Roboto';
  ctx.fillText(`HP: ${player.hp}`, 20, 30);
  ctx.fillText(`Level: ${currentLevel} / ${MAX_LEVEL}`, 120, 30);
}

let last = performance.now()/1000;
function step(){
  const now = performance.now()/1000; let dt = Math.min(now-last, 1/30); last = now;
  checkOrientation();

  if (gameState === 'playing') {
    // input
    let move=0; if(keys.a)move-=1; if(keys.d)move+=1; if(Math.abs(joyVec.x)>0.2) move=joyVec.x; if(joyActive && joyVec.y<-0.6) tryJump();
    player.vx = MOVE_SPEED * Math.max(-1, Math.min(1, move));
    if (player.vx !== 0) player.facing = (player.vx>0?1:-1);
    if (keys.w && player.onGround) tryJump();

    // integrate
    const px=player.x, py=player.y;
    player.vy += GRAVITY*dt; player.x += player.vx*dt; player.y += player.vy*dt;

    // ground & bounds
    if (player.y + player.h > GROUND_Y){ player.y = GROUND_Y - player.h; player.vy = 0; player.onGround = true; }
    if (player.y < 0){ player.y = 0; if (player.vy<0) player.vy = 0; }
    if (player.x < 0) player.x = 0; if (player.x + player.w > worldWidth) player.x = worldWidth - player.w;

    // one-way landing
    for (const p of platforms){
      const cx=player.x+player.w/2, over=(cx>p.x+4)&&(cx<p.x+p.w-4);
      const wasAbove=(py+player.h)<=p.y, nowBelow=(player.y+player.h)>=p.y, down=player.vy>=0;
      if (over && wasAbove && nowBelow && down){ player.y=p.y-player.h; player.vy=0; player.onGround=true; }
    }
    // side collisions
    for (const p of platforms){
      if (!(player.x+player.w>p.x && player.x<p.x+p.w && player.y+player.h>p.y && player.y<p.y+p.h)) continue;
      const body=(player.y<p.y+p.h-2)&&(player.y+player.h>p.y+2);
      if (!body) continue;
      if (px + player.w <= p.x){ player.x = p.x - player.w; player.vx = 0; }
      else if (px >= p.x + p.w){ player.x = p.x + p.w; player.vx = 0; }
    }

    // camera
    cameraX = clamp(player.x + player.w/2 - W*0.45, 0, Math.max(0, worldWidth - W));

    // villains patrol + shoot
    for (const v of villains){
      if (!v.alive) continue;
      if (v.onGround){
        v.x += v.patrolDir * v.patrolSpeed * dt;
        if (v.x < v.patrolLeft){ v.x = v.patrolLeft; v.patrolDir = 1; }
        if (v.x > v.patrolRight){ v.x = v.patrolRight; v.patrolDir = -1; }
      }
      v.facing = (player.x < v.x) ? -1 : 1;
      v.cooldown -= dt; if (v.cooldown <= 0){ villainShoot(v); v.cooldown = v.cdBase; }

      const vy0=v.y; v.vy=(v.vy||0)+GRAVITY*dt; v.y+=v.vy*dt; v.onGround=false;
      if (v.y + v.h > GROUND_Y){ v.y = GROUND_Y - v.h; v.vy = 0; v.onGround = true; }
      for (const p of platforms){
        const wasAbove=(vy0+v.h)<=p.y, nowBelow=(v.y+v.h)>=p.y, withinX=(v.x+v.w/2>p.x)&&(v.x+v.w/2<p.x+p.w);
        if (wasAbove && nowBelow && withinX){ v.y=p.y-v.h; v.vy=0; v.onGround=true; }
      }
    }

    // bullets
    for (const b of bullets){ b.x+=b.vx*dt; b.y+=b.vy*dt; }
    for (let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      let hit=false; for (const p of platforms){ if (aabb(b,p)){ hit=true; break; } }
      if (hit && !b.big){ bullets.splice(i,1); continue; }
      if (b.from==='player'){
        for (const v of villains){ if (v.alive && aabb(b,v)){ bullets.splice(i,1); v.alive=false; AudioMgr.playSfx('hitVillain',0.9); break; } }
      }
      if (b.from==='villain' && player.alive && aabb(b,player)){
        bullets.splice(i,1); player.hp--; AudioMgr.playSfx('hitPlayer',0.9);
        if (player.hp<=0 && !gameOver){ gameOver=true; victory=false; runFinished=false; AudioMgr.stopBgm(); AudioMgr.playSfx('defeat',0.95);
          showEndMenu({title:'Defeated!', canNext:false, victoryState:false}); }
      }
      if (b.x<-200||b.x>worldWidth+200||b.y<-200||b.y>H+200) bullets.splice(i,1);
    }

    // key & door
    if (!player.hasKey && aabb(player,keyItem)){ player.hasKey=true; keyStateEl.textContent='✅'; }
    if (player.hasKey && aabb(player,goal) && !victory){
      goal.open=true; victory=true; AudioMgr.stopBgm(); AudioMgr.playSfx('victory',0.95);
      setTimeout(()=>{ gameOver=true; showEndMenu({title: currentLevel<MAX_LEVEL?'Level Clear!':'All Levels Clear! 🎉', canNext: currentLevel<MAX_LEVEL, victoryState:true}); },700);
    }

    // mega cooldown
    if (megaTimer < MEGA_CD){ megaTimer+=dt; if (megaTimer>=MEGA_CD){ megaTimer=MEGA_CD; AudioMgr.playSfx('megaReady',0.8); } }
    megaBar.style.width = `${(megaTimer/MEGA_CD)*100}%`;
  }

  render();
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

/* ================== End menu ================== */
let endMenuEl=null;
function showEndMenu({title='Level Complete!', canNext=true, canRetry=true, canResurrect=true, victoryState=true}={}){
  endMenuEl?.remove();
  endMenuEl=document.createElement('div');
  Object.assign(endMenuEl.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:'9998'});
  endMenuEl.innerHTML=`
    <div style="background:#111;color:#fff;padding:20px 24px;border-radius:12px;min-width:300px;max-width:90vw;text-align:center;font-family:system-ui,Segoe UI,Roboto">
      <div style="font-size:22px;margin-bottom:10px;">${title}</div>
      <div style="font-size:14px;margin-bottom:18px;">Level ${currentLevel} / ${MAX_LEVEL}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
        ${canRetry?`<button id="btnRetry" style="padding:10px 14px;border:0;border-radius:10px;background:#00bcd4;color:#111;cursor:pointer">Retry Level</button>`:''}
        ${canNext?`<button id="btnNext" style="padding:10px 14px;border:0;border-radius:10px;background:#4caf50;color:#111;cursor:pointer">${currentLevel<MAX_LEVEL?'Next Level':'Finish'}</button>`:''}
        <button id="btnEnd" style="padding:10px 14px;border:0;border-radius:10px;background:#f44336;color:#111;cursor:pointer">End Game</button>
        ${(!victoryState && canResurrect)?`<button id="btnAd" style="padding:10px 14px;border:0;border-radius:10px;background:#ffc107;color:#111;cursor:pointer">Resurrect (watch ad)</button>`:''}
      </div>
      <div id="adStatus" style="margin-top:12px;font-size:13px;color:#ccc;"></div>
    </div>`;
  document.body.appendChild(endMenuEl);

  uiModalOpen = true; mobileControls.style.pointerEvents='none';

  // Retry
  endMenuEl.querySelector('#btnRetry')?.addEventListener('click',()=>{ 
    hideEndMenu();
    // Fresh audio for the retry
    AudioMgr.stopAllSfx(); AudioMgr.stopBgm();
    startLevel(currentLevel);
  });

  // Next Level (or Finish)
  endMenuEl.querySelector('#btnNext') ?.addEventListener('click',()=>{ 
    hideEndMenu();
    AudioMgr.stopAllSfx(); AudioMgr.stopBgm();
    if(currentLevel<MAX_LEVEL){ currentLevel++; startLevel(currentLevel); }
    else { runFinished=true; gameOver=true; showStartScreen(); }
  });

  // End Game → back to Start screen
  endMenuEl.querySelector('#btnEnd')  ?.addEventListener('click',()=>{ 
    hideEndMenu();
    AudioMgr.stopAllSfx(); AudioMgr.stopBgm();
    showStartScreen();
  });

  // Ad resurrect
  const adStatus=endMenuEl.querySelector('#adStatus');
  endMenuEl.querySelector('#btnAd')?.addEventListener('click',()=>{
    adStatus.textContent='Playing ad… 3'; let t=3; const timer=setInterval(()=>{ t--; adStatus.textContent = t>0?`Playing ad… ${t}`:'Ad finished!';
      if(t<=0){ clearInterval(timer); hideEndMenu(); resurrectHero(); } },1000);
  });
}
function hideEndMenu(){ endMenuEl?.remove(); endMenuEl=null; uiModalOpen=false; mobileControls.style.pointerEvents=''; }

// Back to Start screen helper
function showStartScreen(){
  // Reset UI + state
  gameOver = false; victory = false; runFinished = true;
  keyStateEl.textContent = '❌';
  // Disable controls layer until Start is tapped again
  mobileControls.style.pointerEvents = 'none';
  // Show the original Start overlay
  startOverlay.style.display = '';
  // Reset player just in case
  Object.assign(player,{x:40,y:GROUND_Y-player.h,vx:0,vy:0,onGround:true,hasKey:false,alive:true,hp:3});
  // Stop all sounds
  AudioMgr.stopAllSfx(); AudioMgr.stopBgm();
  // Toggle button text reflects stopped bgm
  musicToggle.textContent = 'Music: Off';
}

function resurrectHero(){ Object.assign(player,{alive:true,hp:3}); gameOver=false; victory=false; AudioMgr.stopAllSfx(); AudioMgr.stopBgm(); AudioMgr.setEnabled(true); requestAnimationFrame(step); }

/* ================== Level bootstrap ================== */
function startLevel(level){
  gameOver=false; victory=false; runFinished=false; keyStateEl.textContent='❌'; megaTimer=MEGA_CD;

  // Clean audio state between levels; restart main BGM
  AudioMgr.stopAllSfx(); AudioMgr.stopBgm(); AudioMgr.setEnabled(true);
  musicToggle.textContent = 'Music: On';

  buildLevel(level);
}
