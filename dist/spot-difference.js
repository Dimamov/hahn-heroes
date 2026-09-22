(()=>{
  const open=document.querySelector('#openDifference');
  const games=document.querySelector('#gamesDialog .choices');
  const dialog=document.querySelector('#differenceDialog');
  if(!open||!games||!dialog)return;

  const levels=[
    {id:'approved-1',title:'Nexus Art Room',image:'spot-difference/set-1.jpg',spots:[[.16,.11,.62,.075],[.39,.14,.66,.07],[.08,.29,.80,.08],[.76,.29,.80,.07],[.91,.36,.87,.075]]},
    {id:'approved-2',title:'Hahn Front Entrance',image:'spot-difference/set-2.jpg',spots:[[.13,.18,.68,.075],[.19,.40,.90,.075],[.42,.34,.84,.08],[.63,.38,.88,.07],[.84,.41,.91,.08]]},
    {id:'approved-3',title:'Cardinal Code Study',image:'spot-difference/set-3.jpg',spots:[[.08,.21,.71,.075],[.09,.42,.92,.075],[.48,.42,.92,.08],[.82,.39,.89,.075],[.91,.35,.85,.075]]},
    {id:'approved-4',title:'Cardinals Study Hall',image:'spot-difference/set-4.jpg',spots:[[.08,.29,.79,.075],[.20,.42,.92,.08],[.47,.40,.90,.08],[.66,.34,.84,.08],[.90,.38,.88,.075]]},
    {id:'approved-5',title:'Never Give Up',image:'spot-difference/set-5.jpg',spots:[[.12,.19,.69,.08],[.48,.34,.84,.08],[.83,.20,.70,.08],[.87,.40,.90,.08],[.23,.39,.89,.075]]}
  ];

  games.insertBefore(open,games.querySelector('.close'));
  open.textContent='🔎 SPOT THE DIFFERENCE';
  dialog.innerHTML=`<div class="modal"><div class="diff-top"><small>MINI-GAME · HIDDEN NEXUS</small><span class="diff-count" id="diffLevel"></span></div><h2>🔎 SPOT THE DIFFERENCE</h2><p class="diff-help">Find five changes. Tap either the top or bottom picture. Three wrong taps trigger a focus warning.</p><div id="diffGame"></div><div class="diff-status" id="diffStatus"></div><div class="diff-actions"><button class="close" id="diffBack">Back</button><button class="choice" id="diffNew">NEXT SET</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend','<div class="diff-warning" id="diffWarning" hidden><div class="diff-warning-card"><strong>⚠️ FOCUS, HERO!</strong><p>Three wrong taps detected. Slow down, compare both pictures carefully, and tap only a difference you actually found.</p><button class="choice" id="diffFocus">I’LL LOOK CAREFULLY</button></div></div>');

  const completed=JSON.parse(localStorage.getItem('hahnDifferenceClears')||'{}');
  let level=0,found=new Set(),wrong=0,locked=false,rapid=0,lastTap=0;
  const game=document.querySelector('#diffGame'),status=document.querySelector('#diffStatus'),levelText=document.querySelector('#diffLevel');

  function drawDots(){status.innerHTML=Array.from({length:5},(_,i)=>`<span class="diff-dot ${found.has(i)?'on':''}"></span>`).join('')}
  function addMark(index){
    const spot=levels[level].spots[index];
    const image=game.querySelector('img'),imageRect=image.getBoundingClientRect(),gameRect=game.getBoundingClientRect();
    for(const y of [spot[1],spot[2]]){
      const mark=document.createElement('span');
      mark.className='diff-hit';
      mark.style.left=((imageRect.left-gameRect.left+spot[0]*imageRect.width)/gameRect.width*100)+'%';
      mark.style.top=((imageRect.top-gameRect.top+y*imageRect.height)/gameRect.height*100)+'%';
      game.appendChild(mark);
    }
  }
  function hitIndex(x,y){
    for(let i=0;i<levels[level].spots.length;i++){
      if(found.has(i))continue;
      const [sx,topY,bottomY,r]=levels[level].spots[i];
      if(Math.hypot(x-sx,y-topY)<=r||Math.hypot(x-sx,y-bottomY)<=r)return i;
    }
    return -1;
  }
  function showWarning(){locked=true;document.querySelector('#diffWarning').hidden=false}
  function tapped(e){
    if(locked)return;
    const now=Date.now();rapid=now-lastTap<300?rapid+1:Math.max(0,rapid-1);lastTap=now;
    if(rapid>=3){rapid=0;showWarning();return}
    const rect=game.querySelector('img').getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height,index=hitIndex(x,y);
    if(index>=0){
      found.add(index);addMark(index);drawDots();if(navigator.vibrate)navigator.vibrate(30);
      if(found.size===5){
        locked=true;if(typeof playCorrectSound==='function')playCorrectSound();
        const id=levels[level].id;
        if(!completed[id]){completed[id]=true;localStorage.setItem('hahnDifferenceClears',JSON.stringify(completed));points=Number(points)+20;save();render();note('Set complete! +20 points')}
        else note('Set complete — already rewarded');
        setTimeout(()=>{locked=false;nextLevel()},900);
      }
    }else{
      wrong++;if(typeof playWrongSound==='function')playWrongSound();
      game.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180});
      if(wrong>=3){wrong=0;showWarning()}
    }
  }
  function renderLevel(){
    found=new Set();wrong=0;rapid=0;locked=false;
    const data=levels[level];
    levelText.textContent=`SET ${level+1} / ${levels.length}${completed[data.id]?' · CLEARED':''}`;
    game.innerHTML=`<img src="${data.image}?v=27" alt="${data.title}. Two vertically stacked pictures with five differences.">`;
    game.onclick=tapped;drawDots();
  }
  function nextLevel(){
    const start=level;
    do{level=(level+1)%levels.length;if(!completed[levels[level].id])break}while(level!==start);
    renderLevel();
  }
  open.onclick=()=>{document.querySelector('#gamesDialog').close();const first=levels.findIndex(item=>!completed[item.id]);level=first<0?0:first;renderLevel();dialog.showModal()};
  document.querySelector('#diffNew').onclick=nextLevel;
  document.querySelector('#diffBack').onclick=()=>dialog.close();
  document.querySelector('#diffFocus').onclick=()=>{document.querySelector('#diffWarning').hidden=true;locked=false};
})();
