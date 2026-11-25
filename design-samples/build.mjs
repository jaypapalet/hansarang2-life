import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createBulletin } from './bulletin.mjs';
import { createCommute } from './commute.mjs';
import { createGuide } from './guide.mjs';
import { createDirectory } from './directory.mjs';
import { createQuick } from './quick.mjs';
import { topicCss, topicTemplates } from './topics.mjs';

const photoBytes = await readFile(new URL('assets/hansarang-complex.webp', import.meta.url));
const photo = 'data:image/webp;base64,' + photoBytes.toString('base64');
const concepts = [createBulletin, createCommute, createGuide, createDirectory, createQuick]
  .map(create => create({photo}));
const output = new URL('dist/', import.meta.url);

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const base = `
  :root { font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic","NanumBarunGothic",system-ui,sans-serif; line-height:1.5; background:#fff; }
  *,*::before,*::after { box-sizing:border-box; }
  body,h1,h2,h3,p,ul,ol,dl,dd,figure { margin:0; }
  img { max-width:100%; }
  button,input { font:inherit; }
  button { cursor:pointer; }
  [hidden] { display:none !important; }
  .concept :focus-visible { outline:2px solid currentColor; outline-offset:3px; }
  .concept [id] { scroll-margin-top:1rem; }
`;

const comparisonCss = `
  .comparison { color:#202833; background:#fff; border-bottom:1px solid #d7dee5; }
  .comparison-inner { width:min(100% - 2rem,86rem); margin-inline:auto; padding:.7rem 0 .55rem; }
  .comparison-header { display:flex; flex-wrap:wrap; align-items:baseline; gap:.3rem .75rem; }
  .comparison-header strong { font-size:.95rem; }
  .comparison-buttons { display:flex; flex-wrap:wrap; column-gap:.95rem; }
  .comparison-buttons button { min-height:44px; padding:.35rem .1rem; color:#465661; border:0; border-bottom:2px solid transparent; background:none; font-size:.875rem; }
  .comparison-buttons button:hover,.comparison-buttons button[aria-pressed="true"] { color:#153e69; }
  .comparison-buttons button[aria-pressed="true"] { border-color:currentColor; font-weight:750; }
  .comparison-buttons button:focus-visible { outline:2px solid #184e85; outline-offset:2px; }
  .comparison-summary { margin-top:.35rem; color:#465661; font-size:.875rem; }
  #concept-preview { display:block; }
`;

function document(title, css, body, script = '') {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <style>${base}\n${topicCss}\n${css}</style>
</head>
<body>
  ${body}
  ${script ? `<script>${script}</script>` : ''}
</body>
</html>
`;
}

const prototype = ({id, html}) => `<div class="concept ${id}">${html}</div>`;

const choices = concepts.map(({id, title}) => `<button type="button" data-sample="${id}" aria-pressed="false" aria-controls="concept-preview">${escapeHtml(title)}</button>`).join('');
const templates = entries => entries.map(concept => `<template id="sample-${concept.id}">${prototype(concept)}</template>`).join('\n');

function viewScript(entries) {
  const descriptions = Object.fromEntries(entries.map(({id, description}) => [id, description]));
  const enhancements = entries.filter(({enhance}) => enhance)
    .map(({id, enhance}) => `${JSON.stringify(id)}:${enhance.toString()}`).join(',');
  return `
  const descriptions = ${JSON.stringify(descriptions)};
  const enhancements = {${enhancements}};
  const defaultId = ${JSON.stringify(entries[0].id)};
  const buttons = [...document.querySelectorAll('[data-sample]')];
  const preview = document.querySelector('#concept-preview');
  const summary = document.querySelector('#comparison-summary');
  const homes = new Map();
  function homeFor(id) {
    if (!homes.has(id)) {
      const root = document.getElementById('sample-' + id).content.firstElementChild.cloneNode(true);
      enhancements[id]?.(root);
      homes.set(id, root);
    }
    return homes.get(id);
  }
  function show(id, topic, focus = false) {
    const template = topic && document.getElementById('topic-' + topic);
    let root;
    if (template && id !== 'quick') {
      root = document.createElement('div');
      root.className = 'concept ' + id;
      root.append(template.content.cloneNode(true));
      root.querySelector('[data-topic-home]').setAttribute('href', '#' + id);
    } else {
      root = homeFor(id);
    }
    preview.replaceChildren(root);
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sample === id)));
    if (summary) summary.textContent = descriptions[id];
    if (focus) {
      const heading = root.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({preventScroll:true});
      window.scrollTo(0, 0);
    }
  }
  function readLocation(focus) {
    const fragment = location.hash.slice(1);
    const [id, topic] = fragment.split('/');
    if (Object.hasOwn(descriptions, id)) {
      show(id, topic, focus);
      return;
    }
    const anchorOwner = fragment.split('-')[0];
    if (Object.hasOwn(descriptions, anchorOwner)) {
      const home = homeFor(anchorOwner);
      const anchor = home.querySelector('#' + CSS.escape(fragment));
      if (anchor) {
        if (home.parentElement !== preview) {
          show(anchorOwner);
          anchor.scrollIntoView();
        }
        return;
      }
    }
    if (!fragment || !focus) show(defaultId);
  }
  for (const button of buttons) button.addEventListener('click', () => {
    const id = button.dataset.sample;
    show(id);
    if (location.protocol !== 'about:') history.replaceState(null, '', '#' + id);
    window.scrollTo(0, 0);
  });
  readLocation(false);
  window.addEventListener('hashchange', () => readLocation(true));
`;
}

await mkdir(output, {recursive: true});
for (const concept of concepts) {
  const routed = concept.id !== 'quick';
  const body = routed ? `<div id="concept-preview"></div>${templates([concept])}${topicTemplates()}` : prototype(concept);
  await writeFile(new URL(`${concept.id}.html`, output), document(concept.title + ' · 한사랑2차', concept.css, body, routed ? viewScript([concept]) : ''));
}

await writeFile(new URL('index.html', output), document(
  '한사랑2차 생활정보 · 시안 비교',
  comparisonCss + concepts.map(concept => concept.css).join('\n'),
  `
  <header class="comparison">
    <div class="comparison-inner">
      <div class="comparison-header"><strong>한사랑2차 생활정보 시안</strong></div>
      <div class="comparison-buttons" role="group" aria-label="비교할 시안">${choices}</div>
      <p id="comparison-summary" class="comparison-summary" aria-live="polite"></p>
    </div>
  </header>
  <div id="concept-preview"></div>
  ${templates(concepts)}
  ${topicTemplates()}`,
  viewScript(concepts),
));
