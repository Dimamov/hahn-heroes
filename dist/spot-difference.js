(()=>{
  const open=document.querySelector('#openDifference');
  const games=document.querySelector('#gamesDialog .choices');
  const dialog=document.querySelector('#differenceDialog');
  if(!open||!games||!dialog)return;

  // Each pair shows more changes than the five needed to clear a set.
  // Coordinates are fractions of the complete, vertically stacked artwork.
  const levels=[
    {id:'approved-1',title:'Nexus Art Room',image:'spot-difference/set-1.jpg',spots:[
      {top:[.18,.12],bottom:[.18,.62]},{top:[.06,.23],bottom:[.06,.73]},
      {top:[.44,.10],bottom:[.44,.60]},{top:[.65,.10],bottom:[.69,.60]},
      {top:[.89,.10],bottom:[.89,.60]},{top:[.67,.32],bottom:[.67,.82]},
      {top:[.77,.29],bottom:[.77,.79]},{top:[.92,.35],bottom:[.92,.85]},
      {top:[.12,.38],bottom:[.12,.88]},{top:[.30,.41],bottom:[.30,.91]}
    ]},
    {id:'approved-2',title:'Hahn Front Entrance',image:'spot-difference/set-2.jpg',spots:[
      {top:[.13,.22],bottom:[.13,.72]},{top:[.14,.41],bottom:[.14,.91]},
      {top:[.38,.43],bottom:[.38,.93]},{top:[.56,.42],bottom:[.56,.92]},
      {top:[.66,.38],bottom:[.66,.88]},{top:[.89,.40],bottom:[.89,.90]},
      {top:[.92,.29],bottom:[.92,.79]}
    ]},
    {id:'approved-3',title:'Cardinal Code Study',image:'spot-difference/set-3.jpg',spots:[
      {top:[.08,.19],bottom:[.08,.69]},{top:[.10,.35],bottom:[.10,.85]},
      {top:[.48,.13],bottom:[.48,.63]},{top:[.39,.35],bottom:[.39,.85]},
      {top:[.48,.42],bottom:[.48,.92]},{top:[.80,.30],bottom:[.80,.80]},
      {top:[.83,.39],bottom:[.83,.89]},{top:[.94,.40],bottom:[.94,.90]}
    ]},
    {id:'approved-4',title:'Cardinals Study Hall',image:'spot-difference/set-4.jpg',spots:[
      {top:[.48,.10],bottom:[.48,.60]},{top:[.86,.10],bottom:[.86,.60]},
      {top:[.11,.31],bottom:[.11,.81]},{top:[.29,.39],bottom:[.29,.89]},
      {top:[.47,.43],bottom:[.47,.93]},{top:[.74,.37],bottom:[.74,.87]},
      {top:[.94,.35],bottom:[.94,.85]},{top:[.09,.45],bottom:[.09,.95]}
    ]},
    {id:'approved-5',title:'Never Give Up',image:'spot-difference/set-5.jpg',spots:[
      {top:[.13,.13],bottom:[.13,.63]},{top:[.17,.28],bottom:[.17,.78]},
      {top:[.35,.37],bottom:[.35,.87]},{top:[.52,.10],bottom:[.52,.60]},
      {top:[.61,.26],bottom:[.61,.76]},{top:[.88,.18],bottom:[.88,.68]},
      {top:[.89,.42],bottom:[.89,.92]}
    ]}
  ];

  games.insertBefore(open,games.querySelector('.close'));
  open.textContent='🔎 SPOT THE DIFFERENCE';
  dialog.innerHTML=`<div class="modal"><div class="diff-top"><small>MINI-GAME · HIDDEN NEXUS</small><span class="diff-count" id="diffLevel"></span></div><h2>🔎 SPOT THE DIFFERENCE</h2><p class="diff-help">Find five changes. Tap either the top or bottom picture. A few wrong taps trigger a focus reminder.</p><div id="diffGame"></div><div class="diff-status" id="diffStatus"></div><div class="diff-actions"><button class="close" id="diffBack">Back</button><button class="choice" id="diffNew">NEXT SET</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend','<div class="diff-warning" id="diffWarning" hidden><div class="diff-warning-card"><strong>⚠️ FOCUS, HERO!</strong><p>Pause and take another look. Slow down, compare both pictures carefully, and tap only a difference you actually found.</p><button class="choice" id="diffFocus">I’LL LOOK CAREFULLY</button></div></div>');

  const completed=JSON.parse(localStorage.getItem('hahnDifferenceClears')||'{}');
  let level=0,found=new Set(),wrong=0,locked=false,rapid=0,lastTap=0;
  const game=document.querySelector('#diffGame'),status=document.querySelector('#diffStatus'),levelText=document.querySelector('#diffLevel');

  function drawDots(){status.innerHTML=Array.from({length:5},(_,i)=>`<span class="diff-dot ${i<found.size?'on':''}"></span>`).join('')}
  // The image element can contain empty space from object-fit: contain.
  // Convert taps and markers using the rectangle of the painted image.
  function paintedImageRect(){
    const image=game.querySelector('img'),box=image.getBoundingClientRect();
    const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    return {left:box.left+(box.width-width)/2,top:box.top+(box.height-height)/2,width,height};
  }
  function addMark(index){
    const spot=levels[level].spots[index],imageRect=paintedImageRect(),gameRect=game.getBoundingClientRect();
    for(const [x,y] of [spot.top,spot.bottom]){
      const mark=document.createElement('span');
      mark.className='diff-hit';
      mark.style.left=((imageRect.left-gameRect.left+x*imageRect.width)/gameRect.width*100)+'%';
      mark.style.top=((imageRect.top-gameRect.top+y*imageRect.height)/gameRect.height*100)+'%';
      game.appendChild(mark);
    }
  }
  function hitIndex(x,y){
    let nearest=-1,distance=Infinity;
    for(let i=0;i<levels[level].spots.length;i++){
      
      const spot=levels[level].spots[i],grade=typeof getPlayerGrade==='function'?getPlayerGrade():5,hitRadius=grade<=2?.105:grade<=4?.085:.065;
      const d=Math.min(Math.hypot(x-spot.top[0],y-spot.top[1]),Math.hypot(x-spot.bottom[0],y-spot.bottom[1]));
      if(d<=hitRadius&&d<distance){nearest=i;distance=d}
    }
    return nearest;
  }
  function showWarning(){locked=true;document.querySelector('#diffWarning').hidden=false}
  function tapped(e){
    if(locked)return;
    const now=Date.now();rapid=now-lastTap<300?rapid+1:Math.max(0,rapid-1);lastTap=now;
    if(rapid>=7){rapid=0;showWarning();return}
    const rect=paintedImageRect(),x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return; // Empty margins are not mistakes.
    const index=hitIndex(x,y);
    if(index>=0){
      if(found.has(index))return;
      found.add(index);addMark(index);drawDots();if(navigator.vibrate)navigator.vibrate(30);
      if(found.size===5){
        locked=true;if(typeof playCorrectSound==='function')playCorrectSound();
        const id=levels[level].id;
        if(!completed[id]){completed[id]=true;localStorage.setItem('hahnDifferenceClears',JSON.stringify(completed));points=Number(points)+20;save();render();note('Set complete! +20 points')}
        else note('Set complete — already rewarded');
        showAnaResult('success',{detail:'All five differences found!',onContinue:()=>{locked=false;nextLevel()}});
      }
    }else{
      wrong++;if(typeof playWrongSound==='function')playWrongSound();
      game.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180});
      if(wrong>=(typeof getPlayerGrade==='function'&&getPlayerGrade()<=2?5:3)){wrong=0;locked=true;showAnaResult('retry',{detail:'Compare both pictures before your next tap.',onContinue:()=>{locked=false}})}
    }
  }
  function renderLevel(){
    found=new Set();wrong=0;rapid=0;locked=false;
    const data=levels[level];
    levelText.textContent=`SET ${level+1} / ${levels.length}${completed[data.id]?' · CLEARED':''}`;
    game.innerHTML=`<img src="${data.image}?v=45" alt="${data.title}. Two vertically stacked pictures. Find any five changes.">`;
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
