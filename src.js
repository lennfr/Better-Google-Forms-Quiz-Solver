(function () {
  if (document.body.dataset.gfqsInjected) return;

  function extract() {
    try {
      const questions = window.FB_PUBLIC_LOAD_DATA_[1][1];
      const found = [];
      questions.forEach((q) => {
        (q[4] || []).forEach((entry) => {
          const validation = entry[4];
          if (!validation || !validation.length) return;
          const rule = validation[0];
          let value = null;
          if (rule[0] === 1 && rule[1] === 5) value = rule[2][0];
          if (rule[0] === 2 && rule[1] === 100) value = rule[2][0];
          if (value !== null) found.push({ entryId: entry[0], value });
        });
      });
      return found;
    } catch (ex) { console.error('gfqs: FB_PUBLIC_LOAD_DATA_ parse failed', ex); return null; }
  }

  const extracted = extract();

if (extracted === null) {
  alert('You must be on a Google Form.');
  return;
}
  document.body.dataset.gfqsInjected = '1';

  const style = (el, s) => (Object.assign(el.style, s), el);

  function getTheme() {
    const bar = [...document.querySelectorAll('div')].find((el) => {
      if (el.children.length || el.textContent.trim()) return false;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.height > 12 || r.width < 100 || r.top > 400) return false;
      const bg = getComputedStyle(el).backgroundColor;
      return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)';
    });
    if (bar) return getComputedStyle(bar).backgroundColor;
    const btn = document.querySelector('div[role="button"]');
    if (btn) {
      const bg = getComputedStyle(btn).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
      return getComputedStyle(btn).color;
    }
    return '#673ab7';
  }

  function findFormHead() {
    const heading = document.querySelector('[role="heading"][aria-level="1"]');
    if (heading) {
      let node = heading;
      for (let i = 0; i < 2 && node.parentElement; i++) node = node.parentElement;
      return node;
    }
    const firstQuestion = document.querySelector('div[data-params]');
    if (firstQuestion) {
      let node = firstQuestion;
      while (node.parentElement && node.parentElement.children.length <= 2) node = node.parentElement;
      return node.parentElement || node;
    }
    return document.body;
  }

  function deepestTextSpan(el) {
    const spans = [...el.querySelectorAll('span')].filter((s) => s.children.length === 0 && s.textContent.trim());
    return spans[spans.length - 1] || el;
  }

  // dupe btn to use native styling
 function btnTemplate(selector = 'div[role="button"]') {
  const original = document.querySelector(selector);
  if (!original) return null;
  const clone = original.cloneNode(true);
  const attrs = ['jscontroller', 'jsaction', 'jsname', 'id', 'aria-disabled'];
  [clone, ...clone.querySelectorAll('*')].forEach((element) => {
    attrs.forEach((attr) => element.removeAttribute(attr));
  });
  return clone;
}

  function mapToDom() {
    const map = new Map();
    document.querySelectorAll('div[data-params]').forEach((area) => {
      try {
        const raw = area.getAttribute('data-params');
        const decoded = JSON.parse('[' + raw.substr(raw.indexOf('['), raw.length));
        const entryId = decoded[0][4][0][0];
        map.set(entryId, area);
      } catch (ex) {}
    });
    return map;
  }

function buildAnswers(fromData) {
const domMap = mapToDom();
return fromData
.map((a) => ({
...a,
area: domMap.get(a.entryId),
status: 'idle'
}))
.filter((a) => a.area);
}

  function findTarget(area) {
    const input = area.querySelector('input[type="text"], input[type="number"], textarea');
    if (input) return { type: 'text', el: input };
    const choice = area.querySelector('[role="radio"], [role="checkbox"]');
    if (choice) return { type: 'choice', el: choice };
    return null;
  }

  function readCurrent(answer, target) {
    if (target.type === 'text') return target.el.value;
    const selected = answer.area.querySelector('[role="radio"][aria-checked="true"], [role="checkbox"][aria-checked="true"]');
    return selected ? (selected.getAttribute('aria-label') || '').trim() : null;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  // prevent google forms saving weridness
function simulateTyping(el, value) {
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
}

  function fillOne(answer) {
    const target = findTarget(answer.area);
    if (!target) return false;
    if (target.type === 'text') { simulateTyping(target.el, answer.value); return true; }
    for (const opt of answer.area.querySelectorAll('[role="radio"], [role="checkbox"]')) {
      if ((opt.getAttribute('aria-label') || '').trim() === String(answer.value).trim()) { opt.click(); return true; }
    }
    return false;
  }

  function refreshStatus(answer, target, onChange) {
    const current = readCurrent(answer, target);
    const matches = current !== null && current !== '' && String(current).trim() === String(answer.value).trim();
    const status = current === null || current === '' ? 'idle' : matches ? 'match' : 'mismatch';
    if (status !== answer.status) { answer.status = status; onChange(); }
  }

  function paintButton(btn, status, theme) {
    const map = {
      idle: { text: '↓', color: theme, border: '#dadce0' },
      match: { text: '✓', color: '#188038', border: '#188038' },
      mismatch: { text: '✕', color: '#d93025', border: '#d93025' }
    }[status];
    btn.textContent = map.text;
    style(btn, { color: map.color, borderColor: map.border });
  }

  function initFillBtn(answer, target, theme, onChange) {
    const anchor = target.el.closest('.Xb9hP') || target.el.parentElement || answer.area;
    if (getComputedStyle(anchor).position === 'static') style(anchor, { position: 'relative' });

    const btn = style(document.createElement('div'), {
      position: 'absolute', top: '50%', right: '4px', transform: 'translateY(-50%)',
      width: '22px', height: '22px', borderRadius: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: '12px',
      background: '#fff', border: '1px solid #dadce0', cursor: 'pointer', zIndex: '5', userSelect: 'none'
    });
    btn.title = `Fill: ${answer.value}`;
    btn.onmouseenter = () => style(btn, { background: '#f6fafe' });
    btn.onmouseleave = () => style(btn, { background: '#fff' });
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fillOne(answer); };
    anchor.appendChild(btn);
    paintButton(btn, answer.status, theme);

    const recheck = () => refreshStatus(answer, target, () => { paintButton(btn, answer.status, theme); onChange(); });
    target.el.addEventListener('input', recheck);
    target.el.addEventListener('change', recheck);
    answer.area.addEventListener('click', recheck, true);
    recheck();
  }

  function initFillAll(answers, theme) {
    const host = findFormHead();
    if (!host) return null;

    const template = btnTemplate();
    const btn = template || style(document.createElement('div'), {
      fontFamily: 'Google Sans, Roboto, Arial, sans-serif', fontSize: '14px', fontWeight: '500',
      display: 'inline-block', padding: '0 24px', lineHeight: '36px', borderRadius: '4px',
      border: '1px solid #dadce0', userSelect: 'none', cursor: 'pointer', width: 'fit-content', color: theme
    });
    style(btn, { marginTop: '10px' });
    const label = deepestTextSpan(btn);
    host.appendChild(btn);

    if (!answers.length) {
      label.textContent = '(No Compatible Questions Found)';
      style(btn, { cursor: 'not-allowed', opacity: '0.5', pointerEvents: 'none' });
      return null;
    }

    label.textContent = `Fill Answers (${answers.length})`;
    btn.addEventListener('click', () => answers.forEach((a) => a.status !== 'match' && fillOne(a)));
    return { label };
  }

  function updFillAll(ref, answers) {
    if (!ref) return;
    const remaining = answers.filter((a) => a.status !== 'match').length;
    ref.label.textContent = remaining === 0
      ? `✓ Filled (${answers.length}/${answers.length})`
      : `Fill Answers (${remaining} remaining)`;
  }
  const theme = getTheme();
 const answers = buildAnswers(extracted);
  const fillAllRef = initFillAll(answers, theme);
  answers.forEach((a) => {
    const target = findTarget(a.area);
    if (target) initFillBtn(a, target, theme, () => updFillAll(fillAllRef, answers));
  });
})();
