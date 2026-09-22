(() => {
  const styles = document.createElement('style');
  styles.textContent = `
    #wordRushDialog{width:min(470px,calc(100% - 20px));max-height:94vh;max-height:94dvh;overflow:auto;border-color:#ffd65c;box-shadow:0 0 34px #ffd65c55}
    .rush-head{text-align:center}.rush-category{margin:9px 0 4px;font-size:clamp(26px,8vw,38px);font-weight:1000;line-height:1;color:#fff;text-shadow:0 0 18px #28b7ff}
    .rush-instruction{font-size:13px;color:#bcd6f7!important;margin:8px 0 12px!important}.rush-timer{width:92px;height:92px;margin:8px auto 12px;border:7px solid #43ef79;border-radius:50%;display:grid;place-items:center;font-size:42px;font-weight:1000;background:#061326;box-shadow:0 0 24px #43ef7977;transition:.15s}
    .rush-timer.warning{border-color:#ffd65c;color:#ffd65c;box-shadow:0 0 28px #ffd65c99}.rush-timer.danger{border-color:#ff365f;color:#ff607e;box-shadow:0 0 32px #ff365faa;animation:rushPulse .38s infinite alternate}
    .rush-letters{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:12px 0}.rush-letter{aspect-ratio:1;border-radius:50%;border:2px solid #55c9ff;background:radial-gradient(circle at 35% 25%,#174a79,#07172d 70%);color:#fff;font-size:22px;font-weight:1000;box-shadow:inset 0 -5px 9px #020713,0 0 9px #28b7ff44;touch-action:manipulation}
    .rush-letter:disabled{color:#5d6680;border-color:#30384c;background:#090e19;box-shadow:none;transform:scale(.9)}.rush-status{text-align:center;min-height:28px;font-weight:950;color:#ffd65c}.rush-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rush-start{border-color:#80ff9c!important;background:linear-gradient(#3bd667,#109739)!important}
    @keyframes rushPulse{from{transform:scale(.96)}to{transform:scale(1.04)}}
  `;
  document.head.appendChild(styles);

  const games = document.querySelector('#gamesDialog .choices');
  if (!games) return;
  const arcadeBack = games.querySelector('.close');
  const launch = document.createElement('button');
  launch.className = 'choice';
  launch.id = 'openWordRush';
  launch.textContent = '⚡ NEXUS WORD RUSH';
  games.insertBefore(launch, arcadeBack);

  const dialog = document.createElement('dialog');
  dialog.id = 'wordRushDialog';
  dialog.innerHTML = `<div class="modal"><div class="rush-head"><small>MINI-GAME · PASS & PLAY</small><h2>⚡ NEXUS WORD RUSH</h2><div class="rush-category" id="rushCategory">READY?</div><p class="rush-instruction" id="rushInstruction">Name something in the category, then tap its first letter before time runs out. Pass the device to the next hero!</p></div><div class="rush-timer" id="rushTimer">10</div><div class="rush-status" id="rushStatus">Tap START ROUND</div><div class="rush-letters" id="rushLetters"></div><div class="rush-actions"><button class="choice rush-start" id="rushStart">START ROUND</button><button class="choice" id="rushNew">NEW CATEGORY</button></div><button class="close" id="rushQuit" style="margin-top:9px;width:100%">Back to Arcade</button></div>`;
  document.body.appendChild(dialog);

  const categories = [
    'Animals','Foods','Things at School','Cartoon Characters','Things That Are Blue','Cities','Sports','Things in a Backpack','Video Games','Superpowers',
    'Things in Space','Movie Characters','Things You Wear','Desserts','Things at the Beach','Jobs','Things That Fly','Musical Instruments','Things in a Kitchen','Book Characters',
    'Things That Are Cold','Things in Michigan','School Subjects','Things with Wheels','Things You Can Draw','Things in a Bedroom','Famous People','Things That Make Noise','Plants','Things at a Party',
    'Anime Characters','Things You Can Build','Things in a Store','Words About Weather','Things That Are Fast','Things in a Park','Things That Glow','Things You Plug In','Things That Smell Good','Things That Make You Laugh'
  ];
  const letters = 'ABCDEFGHJKLMNPRSTUVWY'.split('');
  const timer = dialog.querySelector('#rushTimer');
  const status = dialog.querySelector('#rushStatus');
  const category = dialog.querySelector('#rushCategory');
  const board = dialog.querySelector('#rushLetters');
  const start = dialog.querySelector('#rushStart');
  let seconds = 10;
  let playing = false;
  let interval = 0;
  let used = 0;
  let lastCategory = -1;
  let audio;

  function tone(frequency, duration, volume = .05) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'square';
      gain.gain.value = volume;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
      oscillator.stop(audio.currentTime + duration);
    } catch (_) {}
  }

  function paintTimer() {
    timer.textContent = seconds;
    timer.classList.toggle('warning', seconds <= 5 && seconds > 2);
    timer.classList.toggle('danger', seconds <= 2);
  }

  function stopTimer() {
    clearInterval(interval);
    interval = 0;
  }

  function resetClock() {
    seconds = 10;
    paintTimer();
  }

  function chooseCategory() {
    let next;
    do next = Math.floor(Math.random() * categories.length); while (next === lastCategory && categories.length > 1);
    lastCategory = next;
    category.textContent = categories[next].toUpperCase();
  }

  function drawLetters() {
    board.innerHTML = letters.map(letter => `<button class="rush-letter" data-rush-letter="${letter}" aria-label="Use letter ${letter}">${letter}</button>`).join('');
  }

  function endRound() {
    playing = false;
    stopTimer();
    dialog.querySelectorAll('.rush-letter').forEach(button => button.disabled = true);
    timer.textContent = '💥';
    timer.classList.add('danger');
    status.textContent = `TIME'S UP! ${used} LETTER${used === 1 ? '' : 'S'} CLEARED`;
    start.textContent = 'PLAY AGAIN';
    tone(120, .7, .11);
    if (navigator.vibrate) navigator.vibrate([180, 80, 260]);
    if (used >= 10 && typeof clearOnce === 'function') clearOnce('word-rush-10', 25);
  }

  function beginRound() {
    stopTimer();
    used = 0;
    playing = true;
    chooseCategory();
    drawLetters();
    resetClock();
    status.textContent = 'GO! SAY AN ANSWER, THEN TAP ITS LETTER';
    start.textContent = 'RESTART ROUND';
    tone(660, .12, .06);
    interval = setInterval(() => {
      seconds -= 1;
      paintTimer();
      if (seconds <= 3 && seconds > 0) tone(430 + seconds * 55, .08, .035);
      if (seconds <= 0) endRound();
    }, 1000);
  }

  launch.addEventListener('click', () => {
    document.querySelector('#gamesDialog').close();
    stopTimer();
    playing = false;
    used = 0;
    chooseCategory();
    drawLetters();
    resetClock();
    status.textContent = 'Tap START ROUND';
    start.textContent = 'START ROUND';
    dialog.showModal();
  });
  board.addEventListener('click', event => {
    const button = event.target.closest('[data-rush-letter]');
    if (!button || !playing || button.disabled) return;
    button.disabled = true;
    used += 1;
    resetClock();
    status.textContent = `LETTER ${button.dataset.rushLetter} LOCKED · PASS IT!`;
    tone(820, .09, .045);
    if (used === letters.length) {
      stopTimer();
      playing = false;
      status.textContent = 'PERFECT ROUND! EVERY LETTER CLEARED!';
      timer.textContent = '🏆';
      if (typeof clearOnce === 'function') clearOnce('word-rush-perfect', 50);
    }
  });
  start.addEventListener('click', beginRound);
  dialog.querySelector('#rushNew').addEventListener('click', beginRound);
  dialog.querySelector('#rushQuit').addEventListener('click', () => { stopTimer(); playing = false; dialog.close(); document.querySelector('#gamesDialog').showModal(); });
  dialog.addEventListener('close', () => { stopTimer(); playing = false; });
})();
