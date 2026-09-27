(() => {
  const lines = {
    success: [
      'You did it! Every step you practiced brought you here.',
      'That was brilliant, hero. Keep that spark going!',
      'I knew you could solve it. Your focus paid off!',
      'Great work! The Nexus is brighter with you on the team.',
      'You kept going and made it through. I’m proud of you!',
      'Mission complete! Take a breath and celebrate that win.'
    ],
    retry: [
      'Take a breath, look closely, and try again. You’ve got this.',
      'A missed attempt is a clue. Focus on one step at a time.',
      'I’m still with you. Slow down and give it another shot!',
      'Even heroes need practice. Look for the pattern and try again.',
      'You can do hard things. Reset, focus, and go again!',
      'That attempt taught you something. Let’s use it next time.'
    ]
  };
  const last = {success: -1, retry: -1};
  const root = document.createElement('dialog');
  root.id = 'anaResult';
  root.innerHTML = '<div class="ana-result-card" role="alertdialog" aria-modal="true" aria-labelledby="anaResultTitle" aria-describedby="anaResultText"><div class="ana-result-art" role="img" aria-label="Ana cheering you on"></div><small>MESSAGE FROM ANA</small><h2 id="anaResultTitle"></h2><p id="anaResultText"></p><p id="anaResultDetail"></p><button type="button" id="anaResultButton" class="choice"></button></div>';
  document.body.append(root);
  let action = null;
  function hide() {
    root.close();
    document.querySelector('#anaResultButton').blur();
    const callback = action;
    action = null;
    if (callback) callback();
  }
  root.querySelector('button').addEventListener('click', hide);
  root.addEventListener('cancel', event => { event.preventDefault(); hide(); });
  window.showAnaResult = (kind, {detail = '', onContinue = null, button = ''} = {}) => {
    kind = kind === 'success' ? 'success' : 'retry';
    const options = lines[kind];
    let index = Math.floor(Math.random() * (options.length - 1));
    if (index >= last[kind]) index++;
    last[kind] = index;
    root.dataset.kind = kind;
    root.querySelector('#anaResultTitle').textContent = kind === 'success' ? 'Great work, hero!' : 'You can try again!';
    root.querySelector('#anaResultText').textContent = options[index];
    root.querySelector('#anaResultDetail').textContent = detail;
    root.querySelector('#anaResultButton').textContent = button || (kind === 'success' ? 'CONTINUE' : 'TRY AGAIN');
    action = onContinue;
    root.showModal();
    root.querySelector('button').focus();
  };
})();
