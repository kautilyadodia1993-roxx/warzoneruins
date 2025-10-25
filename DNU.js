/* ========= Reliable Audio Manager (WebAudio + HTMLAudio fallback) ========= */
const AudioMgr = (()=>{
  let ctx, gain, bgmSource = null, bgmAudioEl = null, enabled = false, unlocked = false, usingWebAudio = false;
  const sounds = {};
  const urls = {
    step: 'assets/sfx_step.mp3',
    jump: 'assets/sfx_jump.mp3',
    shoot: 'assets/sfx_shoot.mp3',
    mega: 'assets/sfx_mega.mp3',
    megaReady: 'assets/sfx_mega_ready.mp3',
    hitPlayer: 'assets/sfx_hit_player.mp3',
    hitVillain: 'assets/sfx_hit_villain.mp3',
    bgm: 'assets/music_bg.mp3',
    victory: 'assets/music_victory.mp3',
    defeat: 'assets/music_defeat.mp3'
  };

  async function init(){
    if(unlocked) return;
    unlocked = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      gain = ctx.createGain();
      gain.gain.value = 0.8;
      gain.connect(ctx.destination);
      usingWebAudio = true;
    } catch(e){ usingWebAudio = false; }

    for(const [k, url] of Object.entries(urls)){
      const a = new Audio();
      a.src = url;
      a.preload = 'auto';
      sounds[k] = a;
    }
  }

  async function loadBgmBuffer(){
    if(!usingWebAudio) return null;
    try {
      const resp = await fetch(urls.bgm, {cache:'no-store'});
      const arr = await resp.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch(e){
      console.warn('WebAudio fetch/decode failed (likely file:// or CORS). Falling back to HTMLAudio.', e);
      return null;
    }
  }

  async function startBgm(){
    if(!enabled) return;
    if(usingWebAudio && bgmSource){ return; }
    if(!usingWebAudio){
      if(!bgmAudioEl){
        bgmAudioEl = sounds.bgm;
        bgmAudioEl.loop = true;
        bgmAudioEl.volume = 0.45;
      }
      try { await bgmAudioEl.play(); } catch(e){ console.warn('HTMLAudio BGM play blocked:', e); }
      return;
    }
    const buf = await loadBgmBuffer();
    if(!buf){
      usingWebAudio = false;
      return startBgm();
    }
    bgmSource = ctx.createBufferSource();
    bgmSource.buffer = buf;
    bgmSource.loop = true;
    bgmSource.connect(gain);
    try { bgmSource.start(0); } catch(e){ console.warn('WebAudio start failed:', e); }
  }

  function stopBgm(){
    if(usingWebAudio){
      try{ bgmSource && bgmSource.stop(); }catch{}
      bgmSource = null;
    } else {
      try{ bgmAudioEl && bgmAudioEl.pause(); }catch{}
    }
  }

  function setEnabled(v){
    enabled = v;
    if(!unlocked) return;
    if(enabled) startBgm(); else stopBgm();
  }

  function toggle(){
    setEnabled(!enabled);
    return enabled;
  }

  function resumeCtx(){
    if(usingWebAudio && ctx && ctx.state !== 'running'){
      ctx.resume().catch(()=>{});
    }
  }

  function playSfx(name, vol=1){
    const base = sounds[name];
    if(!base) return;
    const a = base.cloneNode(true);
    a.volume = vol;
    a.play().catch(()=>{});
  }

  return { init, startBgm, stopBgm, setEnabled, toggle, resumeCtx, playSfx, urls };
})();

/* ========= Game Setup ========= */
const ASSETS = {
  images: {
    bg: 'assets/background_stage1.png',
    player: 'assets/player.png',
    villain: 'assets/villain1.png',
    key: 'assets/key.png',
    doorClosed: 'assets/doorclose.png',
    doorOpen: 'assets/dooropen.png',
    wall1: 'assets/wall1.png',
    wall2: 'assets/wall2.png',
    wall3: 'assets/wall3.png',
    wall4: 'assets/wall4.png',
    bulletPlayer: 'assets/bullet_player.png',
    bulletMega: 'assets/bullet_mega.png',
    bulletVillain: 'assets/bullet_villain.png'
  }
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const keyStateEl = document.getElementById('keyState');
const megaBar = document.getElementById('megaBar');
const musicToggle = document.getElementById('musicToggle');

let W=1280, H=720;
function resizeCanvas(){ canvas.width = W; canvas.height = H; } resizeCanvas();

// Orientation
const rotateOverlay = document.getElementById('rotateOverlay');
function checkOrientation(){ const landscape = window.innerWidth >= window.innerHeight; rotateOverlay.classList.toggle('show', !landscape); }
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

// Desktop input
const keys = { a:false, d:false, w:false };
window.addEventListener('keydown', e=>{ if(e.repeat) return; if(e.key==='a'||e.key==='A') keys.a=true; if(e.key==='d'||e.key==='D') keys.d=true; if(e.key==='w'||e.key==='W') keys.w=true; if(e.key==='q'||e.key==='Q') shootPrimary(); if(e.key==='e'||e.key==='E') shootMega(); });
window.addEventListener('keyup',   e=>{ if(e.key==='a'||e.key==='A') keys.a=false; if(e.key==='d'||e.key==='D') keys.d=false; if(e.key==='w'||e.key==='W') keys.w=false; });

// Mobile input
const btnShoot = document.getElementById('btnShoot');
const btnMega  = document.getElementById('btnMega');
const joyWrap  = document.getElementById('joystick');
const stick    = document.getElementById('stick');

let joyActive=false, joyVec={x:0,y:0};
const JOY_R = 75;

function placeJoystickAt(clientX, clientY){
  const r = joyWrap.getBoundingClientRect();
  const JW = r.width || 170, JH = r.height || 170;
  const x = Math.min(window.innerWidth - JW - 8, Math.max(8, clientX - JW/2));
  const y = Math.min(window.innerHeight - JH - 8, Math.max(8, clientY - JH/2));
  joyWrap.style.left = x + 'px'; joyWrap.style.top  = y + 'px';
}
function joyPosFromEvent(ev){
  const rect = joyWrap.getBoundingClientRect();
  const t = (ev.touches? ev.touches[0] : ev);
  return { x: t.clientX - rect.left - rect.width/2, y: t.clientY - rect.top - rect.height/2 };
}
function joyDown(ev){ joyActive=true; joyWrap.style.display='block'; if(ev.touches){ placeJoystickAt(ev.touches[0].clientX, ev.touches[0].clientY); } else { placeJoystickAt(ev.clientX, ev.clientY); } joyMove(ev); }
function joyMove(ev){ if(!joyActive) return; ev.preventDefault(); const p=joyPosFromEvent(ev); const mag=Math.hypot(p.x,p.y); const clamped=Math.min(mag, JOY_R); const nx=(mag? p.x/mag:0)*clamped; const ny=(mag? p.y/mag:0)*clamped; stick.style.transform = `translate(${nx}px, ${ny}px)`; joyVec.x = nx/JOY_R; joyVec.y = ny/JOY_R; }
function joyUp(){ joyActive=false; joyVec.x=0; joyVec.y=0; stick.style.transform='translate(0px,0px)'; joyWrap.style.display='none'; }

document.getElementById('mobileControls').addEventListener('touchstart', (e)=>{ if(!e.target.closest('.leftButtons')) joyDown(e); }, {passive:false});
document.getElementById('mobileControls').addEventListener('touchmove', joyMove, {passive:false});
document.getElementById('mobileControls').addEventListener('touchend', joyUp);

canvas.addEventListener('mousedown', joyDown);
window.addEventListener('mousemove', joyMove);
window.addEventListener('mouseup', joyUp);

btnShoot.addEventListener('touchstart', e=>{ e.preventDefault(); shootPrimary(); });
btnShoot.addEventListener('click',      e=>{ shootPrimary(); });
btnMega .addEventListener('touchstart', e=>{ e.preventDefault(); shootMega(); });
btnMega .addEventListener('click',      e=>{ shootMega(); });

// Images
function loadImage(url){ const img=new Image(); img.src=url; return img; }
const IMG = Object.fromEntries(Object.entries(ASSETS.images).map(([k,url])=>[k,loadImage(url)]));

// World
const GRAVITY = 2600;
const MOVE_SPEED = 450;
const JUMP_V = 1200;
const GROUND_Y = H - 60;

const platforms = [
  {name:'wall1', x:  80, y: GROUND_Y - 160, w: 440, h: 64, img: IMG.wall1},
  {name:'wall2', x: 620, y: GROUND_Y - 320, w: 360, h: 64, img: IMG.wall2},
  {name:'wall3', x:1060, y: GROUND_Y - 460, w: 400, h: 64, img: IMG.wall3},
  {name:'wall4', x: 240, y: GROUND_Y - 260, w: 320, h: 64, img: IMG.wall4}
];

const player = { x: 40, y: GROUND_Y-100, w: 80, h: 100, vx:0, vy:0, onGround:false, facing:1, alive:true, hasKey:false, hp:3 };
const villains = [ { x: 880, y: (GROUND_Y-320) - 100, w: 84, h: 100, vx:0, vy:0, onGround:false, facing:-1, alive:true, cooldown: 0.9 } ];

const keyItem = { x: 1120, y: (GROUND_Y - 460) - 56, w: 56, h: 56 };
const goal    = { x: 1180, w: 96, h: 160, open: false }; goal.y = GROUND_Y - goal.h;

const bullets = [];
const BULLET_SPEED = 800;
const BIG_BULLET_SPEED = 700;
const VIL_SHOT_INTERVAL = 1.4;
const MEGA_CD = 10.0; let megaTimer = MEGA_CD;

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function aabb(a,b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function drawCover(img, dstW, dstH){
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(dstW/iw, dstH/ih);
  const sw = dstW / scale, sh = dstH / scale;
  const sx = (iw - sw)/2, sy = (ih - sh)/2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dstW, dstH);
}

function tryJump(){ if(player.onGround && player.alive){ player.vy = -JUMP_V; player.onGround=false; AudioMgr.playSfx('jump', 0.8); } }
function shootPrimary(){ if(!player.alive) return; const dir = player.facing; bullets.push({x:player.x+player.w/2, y:player.y+player.h/2-8, vx:dir*BULLET_SPEED, vy:0, w:32, h:16, from:'player'}); AudioMgr.playSfx('shoot', 0.7); }
function shootMega(){ if(!player.alive) return; if(megaTimer >= MEGA_CD){ const dir = player.facing; bullets.push({x:player.x+player.w/2, y:player.y+player.h/2-16, vx:dir*BIG_BULLET_SPEED, vy:0, w:64, h:32, from:'player', big:true}); megaTimer=0; AudioMgr.playSfx('mega', 0.9); } }
function villainShoot(v){ if(!v.alive) return; const dir = (player.x < v.x) ? -1 : 1; v.facing = dir; bullets.push({x:v.x+v.w/2, y:v.y+v.h/2-8, vx:dir*(BULLET_SPEED*0.85), vy:0, w:28, h:16, from:'villain'}); }

let last=performance.now()/1000; let gameOver=false; let victory=false;

function step(){
  const now=performance.now()/1000; let dt=now-last; last=now; dt=Math.min(dt, 1/30);

  checkOrientation();

  let moveAxis = 0; if(keys.a) moveAxis -= 1; if(keys.d) moveAxis += 1;
  if(Math.abs(joyVec.x) > 0.2) moveAxis = joyVec.x; if(joyActive && joyVec.y < -0.6) { tryJump(); }

  player.vx = MOVE_SPEED * clamp(moveAxis, -1, 1);
  if(player.vx !== 0) player.facing = (player.vx>0? 1 : -1);

  if(keys.w && player.onGround) tryJump();

  // Integrate
  player.vy += GRAVITY*dt; player.x += player.vx*dt; player.y += player.vy*dt;

  // Collide with floor/ceiling and clamp inside window
  if(player.y + player.h > GROUND_Y){ player.y = GROUND_Y - player.h; player.vy=0; player.onGround=true; }
  if(player.y < 0){ player.y = 0; if(player.vy < 0) player.vy = 0; }
  if(player.x < 0){ player.x = 0; }
  if(player.x + player.w > W){ player.x = W - player.w; }

  // Platforms
  for(const p of platforms){
    if(player.x < p.x+p.w && player.x+player.w > p.x){
      if(player.vy>0 && player.y+player.h <= p.y + 20 && player.y+player.h >= p.y - 110){
        if(player.y + player.h > p.y && player.y + player.h < p.y + p.h){
          player.y = p.y - player.h; player.vy=0; player.onGround=true;
        }
      }
    }
    if(aabb(player, p)){
      if(player.x + player.w/2 < p.x + p.w/2) player.x = p.x - player.w; else player.x = p.x + p.w; player.vx = 0;
    }
  }

  // Villain
  for(const v of villains){
    if(!v.alive) continue; v.cooldown -= dt; if(v.cooldown<=0){ villainShoot(v); v.cooldown = VIL_SHOT_INTERVAL; }
    v.vy += GRAVITY*dt; v.y += v.vy*dt; if(v.y + v.h > GROUND_Y){ v.y = GROUND_Y - v.h; v.vy=0; }
    for(const p of platforms){ if(aabb(v,p) && v.vy>0){ v.y = p.y - v.h; v.vy=0; } }
  }

  // Bullets
  for(const b of bullets){ b.x += b.vx*dt; b.y += b.vy*dt; }
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    let hitTile=false; for(const p of platforms){ if(aabb(b,{x:p.x,y:p.y,w:p.w,h:p.h})){ hitTile=true; break; } }
    if(hitTile && !b.big){ bullets.splice(i,1); continue; }
    if(b.from==='player'){ for(const v of villains){ if(v.alive && aabb(b,v)){ bullets.splice(i,1); v.alive=false; AudioMgr.playSfx('hitVillain',0.9); break; } } }
    if(b.from==='villain' && player.alive && aabb(b, player)){ bullets.splice(i,1); player.hp--; AudioMgr.playSfx('hitPlayer',0.9); if(player.hp<=0){ player.alive=false; gameOver=true; } }
    if(b.x < -200 || b.x > W+200 || b.y < -200 || b.y > H+200){ bullets.splice(i,1); }
  }

  // Key
  if(!player.hasKey && aabb(player, keyItem)) { player.hasKey=true; keyStateEl.textContent='✅'; }

  // Door open then end
  if(player.hasKey && aabb(player, goal) && !victory){
    goal.open = true;
    if(!victory){
      victory = true;
      AudioMgr.playSfx('victory',0.9);
      setTimeout(()=>{ gameOver = true; }, 900);
    }
  }

  // Mega cooldown
  if(megaTimer < MEGA_CD){ megaTimer += dt; if(megaTimer >= MEGA_CD){ megaTimer = MEGA_CD; AudioMgr.playSfx('megaReady',0.8); } }
  megaBar.style.width = `${(megaTimer/MEGA_CD)*100}%`;

  draw();
  if(!gameOver) requestAnimationFrame(step);
}

function draw(){
  if(IMG.bg && IMG.bg.complete && IMG.bg.naturalWidth){ drawCover(IMG.bg, W, H); } else { ctx.fillStyle = '#1a1f2b'; ctx.fillRect(0,0,W,H); }
  ctx.fillStyle = '#3b3b3b'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  for(const p of platforms){ if(p.img && p.img.complete && p.img.naturalWidth){ ctx.drawImage(p.img, p.x, p.y, p.w, p.h); } else { ctx.fillStyle='#6a6a6a'; ctx.fillRect(p.x,p.y,p.w,p.h); } }

  if(!player.hasKey){ if(IMG.key&&IMG.key.complete&&IMG.key.naturalWidth){ ctx.drawImage(IMG.key, keyItem.x, keyItem.y, keyItem.w, keyItem.h); } else { ctx.fillStyle='#ffd54f'; ctx.fillRect(keyItem.x,keyItem.y,keyItem.w,keyItem.h); } }

  const doorImg = (goal.open ? IMG.doorOpen : IMG.doorClosed);
  if(doorImg && doorImg.complete && doorImg.naturalWidth){ ctx.drawImage(doorImg, goal.x, goal.y, goal.w, goal.h); } else { ctx.fillStyle='#8a5'; ctx.fillRect(goal.x,goal.y,goal.w,goal.h); }

  if(IMG.player&&IMG.player.complete&&IMG.player.naturalWidth){ ctx.save(); ctx.translate(player.x + player.w/2, player.y); ctx.scale(player.facing,1); ctx.drawImage(IMG.player, -player.w/2, 0, player.w, player.h); ctx.restore(); } else { ctx.fillStyle = '#4ec9f0'; ctx.fillRect(player.x, player.y, player.w, player.h); }

  for(const v of villains){ if(!v.alive) continue; if(IMG.villain&&IMG.villain.complete&&IMG.villain.naturalWidth){ ctx.save(); ctx.translate(v.x+v.w/2, v.y); ctx.scale(v.facing,1); ctx.drawImage(IMG.villain, -v.w/2, 0, v.w, v.h); ctx.restore(); } else { ctx.fillStyle='#f25'; ctx.fillRect(v.x,v.y,v.w,v.h); } }

  for(const b of bullets){ let img = (b.big? IMG.bulletMega : (b.from==='player'? IMG.bulletPlayer : IMG.bulletVillain)); if(img && img.complete && img.naturalWidth){ ctx.drawImage(img, b.x, b.y, b.w, b.h); } else { ctx.fillStyle = b.big? '#9cf' : (b.from==='player'? '#fff' : '#ff8a80'); ctx.fillRect(b.x,b.y,b.w,b.h); } }

  ctx.fillStyle = '#fff'; ctx.font = '16px system-ui, Segoe UI, Roboto'; ctx.fillText(`HP: ${player.hp}`, 20, 30);

  if(gameOver){ ctx.fillStyle='rgba(0,0,0,.4)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='28px system-ui, Segoe UI, Roboto'; ctx.textAlign='center'; ctx.fillText(victory? 'Stage Clear! Door opened.' : 'Defeated! Refresh to retry.', W/2, H/2); ctx.textAlign='left'; }
}

requestAnimationFrame(step);

/* ===== Startup / Unlock Flow ===== */
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('btnStart');

async function userUnlock(){
  await AudioMgr.init();
  AudioMgr.resumeCtx();
}

startBtn.addEventListener('click', async ()=>{
  startOverlay.classList.add('hidden');
  await userUnlock();
  AudioMgr.setEnabled(true);
  musicToggle.textContent = 'Music: On';
});

['pointerdown','touchend','click','keydown'].forEach(evt=>{
  window.addEventListener(evt, async ()=>{
    await userUnlock();
  }, { once:true, capture:true });
});

musicToggle.addEventListener('click', async ()=>{
  await userUnlock();
  const on = AudioMgr.toggle();
  musicToggle.textContent = on ? 'Music: On' : 'Music: Off';
});
