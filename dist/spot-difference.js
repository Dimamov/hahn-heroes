(()=>{
  const open=document.querySelector('#openDifference');
  const games=document.querySelector('#gamesDialog .choices');
  const dialog=document.querySelector('#differenceDialog');
  if(!open||!games||!dialog)return;

  games.insertBefore(open,games.querySelector('.close'));
  open.textContent='🔎 SPOT THE DIFFERENCE';
  dialog.innerHTML=`<div class="modal"><div class="diff-top"><small>MINI-GAME · HIDDEN NEXUS</small><span class="diff-count" id="diffLevel"></span></div><h2>🔎 SPOT THE DIFFERENCE</h2><p class="diff-help">Find five changes. Tap either picture. Three careless taps trigger a focus warning.</p><div id="diffGame"></div><div class="diff-status" id="diffStatus"></div><div class="diff-actions"><button class="close" id="diffBack">Back</button><button class="choice" id="diffNew">NEXT SET</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend','<div class="diff-warning" id="diffWarning" hidden><div class="diff-warning-card"><strong>⚠️ FOCUS, HERO!</strong><p>Three wrong taps detected. Slow down, compare both pictures carefully, and tap only a difference you actually found.</p><button class="choice" id="diffFocus">I’LL LOOK CAREFULLY</button></div></div>');

  const images=[
    'episode-1/Episode-1-Panel-05-Meet-The-Keeper-App.jpg',
    'episode-1/Episode-1-Panel-06-Ana-Steps-Forward-App.jpg',
    'episode-1/Episode-1-Panel-07-The-First-Keeper-App.jpg',
    'episode-1/Episode-1-Panel-08-Journey-Begins-App.jpg'
  ];
  const completed=JSON.parse(localStorage.getItem('hahnDifferenceClears')||'{}');
  let level=0,found=new Set(),wrong=0,locked=false;
  const game=document.querySelector('#diffGame'),status=document.querySelector('#diffStatus'),levelText=document.querySelector('#diffLevel');

  function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  function buildLevel(index){
    const r=mulberry32(90210+index*7919),spots=[];
    while(spots.length<5){
      const p={x:12+r()*76,y:14+r()*72};
      if(spots.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>17))spots.push(p);
    }
    return{image:images[index%images.length],position:`${42+Math.round(r()*16)}% ${34+Math.round(r()*32)}%`,spots};
  }
  const levels=[]; // Old auto-generated 50-level command disabled; approved purpose-built sets will replace it.
  function drawDots(){status.innerHTML=Array.from({length:5},(_,i)=>`<span class="diff-dot ${found.has(i)?'on':''}"></span>`).join('')}
  function mark(scene,i){const p=levels[level].spots[i],m=document.createElement('span');m.className='diff-hit';m.style.left=p.x+'%';m.style.top=p.y+'%';scene.appendChild(m)}
  function nearest(x,y){let best=-1,dist=Infinity;levels[level].spots.forEach((p,i)=>{const d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=i}});return dist<=8.5?best:-1}
  const imageCache=new Map();
  function getImage(src){if(imageCache.has(src))return imageCache.get(src);const p=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src});imageCache.set(src,p);return p}
  function drawCover(ctx,img,w,h,position){
    const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight),sw=w/scale,sh=h/scale;
    const parts=position.split(' '),px=parseFloat(parts[0])/100,py=parseFloat(parts[1])/100;
    const sx=(img.naturalWidth-sw)*px,sy=(img.naturalHeight-sh)*py;
    ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  }
  async function paintScene(canvas,data,changed){
    const rect=canvas.parentElement.getBoundingClientRect(),ratio=Math.min(2,devicePixelRatio||1),w=Math.max(600,Math.round(rect.width*ratio)),h=Math.max(260,Math.round(rect.height*ratio));
    canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),img=await getImage(data.image);drawCover(ctx,img,w,h,data.position);if(!changed)return;
    data.spots.forEach((p,i)=>{
      const x=p.x/100*w,y=p.y/100*h,r=Math.max(15,w*.027),sx=Math.max(0,x-r),sy=Math.max(0,y-r),size=Math.min(r*2,w-sx,h-sy);
      const patch=document.createElement('canvas');patch.width=size;patch.height=size;patch.getContext('2d').drawImage(canvas,sx,sy,size,size,0,0,size,size);
      ctx.save();ctx.beginPath();ctx.ellipse(x,y,r*.82,r*.68,0,0,Math.PI*2);ctx.clip();
      if(i%3===0){ctx.filter='hue-rotate(95deg) saturate(1.25)';ctx.drawImage(patch,sx,sy)}
      else if(i%3===1){ctx.translate(x*2,0);ctx.scale(-1,1);ctx.drawImage(patch,sx,sy)}
      else{ctx.filter='grayscale(.78) brightness(1.08)';ctx.drawImage(patch,sx,sy)}
      ctx.restore();ctx.filter='none';
    });
  }
  function tapped(e){
    if(locked)return;const scene=e.currentTarget,rect=scene.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*100,y=(e.clientY-rect.top)/rect.height*100,i=nearest(x,y);
    if(i>=0){
      if(found.has(i))return;found.add(i);document.querySelectorAll('.diff-scene').forEach(s=>mark(s,i));drawDots();if(window.navigator.vibrate)navigator.vibrate(30);
      if(found.size===5){locked=true;if(typeof playCorrectSound==='function')playCorrectSound();const key='level-'+level;if(!completed[key]){completed[key]=true;localStorage.setItem('hahnDifferenceClears',JSON.stringify(completed));points=Number(points)+20;save();render();note('Set complete! +20 points')}else note('Set complete — already rewarded');setTimeout(()=>{locked=false;nextLevel()},900)}
    }else{
      wrong++;if(typeof playWrongSound==='function')playWrongSound();scene.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180});
      if(wrong>=3){wrong=0;locked=true;document.querySelector('#diffWarning').hidden=false}
    }
  }
  function renderLevel(){
    found=new Set();wrong=0;locked=false;const data=levels[level];levelText.textContent=`SET ${level+1} / 50${completed['level-'+level]?' · CLEARED':''}`;game.innerHTML='';
    for(let side=0;side<2;side++){
      const scene=document.createElement('div');scene.className='diff-scene';scene.setAttribute('aria-label',side?'Changed picture':'Original picture');const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Hidden Nexus scene featuring Ana or the First Keeper');scene.appendChild(canvas);
      scene.addEventListener('pointerup',tapped);game.appendChild(scene);
      requestAnimationFrame(()=>paintScene(canvas,data,side===1));
    }
    drawDots();
  }
  function nextLevel(){const start=level;do{level=(level+1)%50;if(!completed['level-'+level])break}while(level!==start);renderLevel()}
  open.onclick=()=>{document.querySelector('#gamesDialog').close();const first=levels.findIndex((_,i)=>!completed['level-'+i]);level=first<0?0:first;renderLevel();dialog.showModal()};
  document.querySelector('#diffNew').onclick=nextLevel;
  document.querySelector('#diffBack').onclick=()=>dialog.close();
  document.querySelector('#diffFocus').onclick=()=>{document.querySelector('#diffWarning').hidden=true;locked=false};
})();
