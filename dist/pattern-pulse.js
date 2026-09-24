(() => {
  const icons = [
    ['core', 'Nexus Core'], ['cardinal', 'Cardinal Flame'], ['wolf', 'Wolf Spirit'],
    ['lightning', 'Lightning Strike'], ['eye', 'Nexus Eye'], ['star', 'Star Burst'],
    ['shadow', 'Shadow Orb'], ['ana', 'Ana']
  ];
  const dialog = document.querySelector('#patternDialog');
  const prompt = dialog.querySelector('#patternPrompt');
  const display = dialog.querySelector('#patternDisplay');
  const choices = dialog.querySelector('#patternChoices');
  const charge = dialog.querySelector('#pulseCharge');
  const fill = dialog.querySelector('#pulseChargeFill');
  const stats = dialog.querySelector('#pulseStats');
  const mode = dialog.querySelector('#pulseSilly');
  const daily = dialog.querySelector('#pulseDaily');
  const start = dialog.querySelector('#pulseStart');
  let run = 0, round = 0, sequence = [], answer = [], index = 0, hintUsed = false;
  let streak = Number(localStorage.getItem('hahnPulseStreak') || 0);
  let best = Number(localStorage.getItem('hahnPulseBest') || 0);
  let active = false, silly = false, dailyMode = false, timeout = null, context = null;
  const pause = ms => new Promise(resolve => { timeout = setTimeout(resolve, ms); });
  const dateKey = () => new Date().toLocaleDateString('en-CA');
  function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function randomForRound() {
    if (!dailyMode) return Math.random;
    const seed = Number(dateKey().replaceAll('-', '')) + round * 10007;
    return seeded(seed);
  }
  function sound(icon, playful = silly) {
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') context.resume();
      const osc = context.createOscillator(), gain = context.createGain();
      osc.type = playful ? (icon % 2 ? 'sawtooth' : 'triangle') : 'sine';
      osc.frequency.setValueAtTime(playful ? (icon % 2 ? 190 : 690) : 330 + icon * 65, context.currentTime);
      if (playful) osc.frequency.exponentialRampToValueAtTime(icon % 2 ? 85 : 290, context.currentTime + .15);
      gain.gain.setValueAtTime(.065, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .19);
      osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime + .2);
    } catch (_) { /* Visual play remains available when audio is blocked. */ }
  }
  function tile(icon, cls = '') {
    const [id, name] = icons[icon];
    return `<span class="pulse-icon ${cls}" role="img" aria-label="${name}"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="pattern-icons.svg#${id}"></use></svg></span>`;
  }
  function update() {
    const amount = Math.round((round + index / Math.max(1, answer.length)) / 3 * 100);
    fill.style.width = amount + '%';
    charge.setAttribute('aria-valuenow', amount);
    stats.textContent = `STREAK ${streak} · PERSONAL BEST ${best} · ${dailyMode ? 'DAILY PATTERN' : 'FREE PLAY'}`;
  }
  function drawChoices() {
    const count = round === 0 ? 5 : round === 1 ? 7 : 8;
    choices.innerHTML = icons.slice(0, count).map((_, i) => `<button type="button" class="pulse-choice" data-icon="${i}" aria-label="${icons[i][1]}">${tile(i)}</button>`).join('');
  }
  async function watch() {
    const id = ++run;
    active = false; index = 0; hintUsed = false;
    const length = [3, 5, 7][round], rand = randomForRound(), pool = round === 0 ? 5 : round === 1 ? 7 : 8;
    sequence = Array.from({length}, () => Math.floor(rand() * pool));
    // The final round introduces a clear rule while retaining all seven flashes.
    answer = round === 2 ? sequence.filter((_, n) => n !== 1) : sequence.slice();
    choices.innerHTML = '';
    prompt.textContent = `ROUND ${round + 1} / 3 · WATCH`;
    display.innerHTML = '<span class="pulse-instruction">Watch the Nexus signals</span>';
    update(); await pause(420); if (id !== run || !dialog.open) return;
    for (const icon of sequence) {
      display.innerHTML = tile(icon, 'pulse-flash'); sound(icon);
      await pause([610, 485, 370][round]); if (id !== run || !dialog.open) return;
      display.innerHTML = ''; await pause([175, 140, 115][round]); if (id !== run || !dialog.open) return;
    }
    prompt.textContent = 'REMEMBER';
    display.innerHTML = '<span class="pulse-instruction">Hold that pattern in your mind…</span>';
    await pause(620); if (id !== run || !dialog.open) return;
    prompt.textContent = 'REPEAT';
    display.innerHTML = `<span class="pulse-instruction">${round === 2 ? 'Skip the SECOND signal. Repeat the rest.' : 'Tap the signals in order.'}</span>`;
    drawChoices(); active = true;
  }
  function finish() {
    active = false; choices.innerHTML = '';
    streak++; best = Math.max(best, streak);
    localStorage.setItem('hahnPulseStreak', String(streak));
    localStorage.setItem('hahnPulseBest', String(best));
    fill.style.width = '100%'; charge.setAttribute('aria-valuenow', '100');
    display.innerHTML = `${tile(7, 'pulse-victory')}<span class="pulse-instruction">NEXUS POWER UP!</span>`;
    prompt.textContent = 'ANA’S VICTORY!';
    display.classList.add('pulse-celebrate');
    const key = dailyMode ? `pattern-daily-${dateKey()}` : 'pattern-v2-first';
    const earned = typeof clearOnce === 'function' ? clearOnce(key, dailyMode ? 30 : 25) : false;
    if (streak === 3 && typeof clearOnce === 'function') clearOnce('pattern-streak-first-three', 10);
    update();
    window.dispatchEvent(new CustomEvent('nexus:played',{detail:{id:'pattern'}}));
    showAnaResult('success', {detail:`Nexus Charge full · ${streak} win streak${earned ? ' · Points earned!' : ' · Already rewarded'}`, button:'POWER UP!', onContinue:()=>{display.classList.remove('pulse-celebrate');dialog.close()}});
  }
  function miss() {
    active = false;
    if (!hintUsed) {
      hintUsed = true; index = 0; update();
      prompt.textContent = 'SOFT RESET · WATCH THE HINT';
      choices.innerHTML = '';
      display.innerHTML = tile(answer[0], 'pulse-hint'); sound(answer[0]);
      showAnaResult('retry', {detail:'Here’s the first signal. Take a breath and try this round again.', onContinue:()=>{display.innerHTML = '<span class="pulse-instruction">Start from the first signal.</span>';drawChoices();active = true;prompt.textContent = 'REPEAT · ONE HINT USED'}});
    } else {
      streak = 0; localStorage.setItem('hahnPulseStreak','0'); update();
      showAnaResult('retry', {detail:'Nexus Charge reset. Watch carefully and build it up again.', onContinue:()=>{round = 0; watch()}});
    }
  }
  choices.addEventListener('click', e => {
    const button = e.target.closest('[data-icon]'); if (!button || !active) return;
    const icon = Number(button.dataset.icon); sound(icon); button.classList.add('pulse-tapped');
    setTimeout(() => button.classList.remove('pulse-tapped'), 220);
    if (icon !== answer[index]) { miss(); return; }
    index++; update();
    display.innerHTML = `<span class="pulse-instruction">${index} / ${answer.length} signals remembered</span>`;
    if (index !== answer.length) return;
    active = false; choices.innerHTML = '';
    if (round === 2) { finish(); return; }
    round++; prompt.textContent = 'POWER UP!';
    display.innerHTML = tile(7, 'pulse-victory') + '<span class="pulse-instruction">Nexus Charge rising!</span>';
    timeout = setTimeout(watch, 850);
  });
  document.querySelector('#openPattern').onclick = () => {
    document.querySelector('#gamesDialog').close();
    run++; active = false; round = 0; display.classList.remove('pulse-celebrate');
    dailyMode = false; daily.checked = false; silly = mode.checked;
    prompt.textContent = 'WATCH → REMEMBER → REPEAT → POWER UP';
    display.innerHTML = `${tile(0)}${tile(1)}${tile(2)}`;
    choices.innerHTML = ''; start.hidden = false; update(); dialog.showModal();
  };
  start.onclick = () => { start.hidden = true; silly = mode.checked; dailyMode = daily.checked; round = 0; watch(); };
  dialog.addEventListener('close', () => { run++; active = false; clearTimeout(timeout); });
})();
