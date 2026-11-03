(function () {
  'use strict';

  const EDIT_KEY = 'seo-portfolio-overrides-v1';
  const CURRENT_HERO_TITLE = '허용과 거부의 근거를<br><em>끝까지 확인합니다.</em>';
  const HERO_COPY_MIGRATION_KEY = 'seo-portfolio-hero-copy-v2';
  const CURRENT_PROOF_INTRO = '8월부터 이어 온 기록에 9월 28일~10월 23일 팀프로젝트·미니실습 기록을 더했습니다. 막히는 구간에서 다시 시도하고, 도움을 받으면 고마움을 표현하고, 팀원의 진행을 확인하는 행동이 반복해서 나타났습니다.';
  const RECORDS_MIGRATION_KEY = 'seo-portfolio-records-v1';
  const CURRENT_PORTFOLIO_SUMMARY = '흩어진 리추얼과 팀프로젝트·미니실습 기록을 자기소개·수치·근거·지원 문서로 구조화하고, 반복해서 나타난 행동까지 확인할 수 있게 만든 공개 포트폴리오입니다.';
  const PROJECT_SUMMARY_MIGRATION_KEY = 'seo-portfolio-project-summary-v1';

  function readOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EDIT_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      if (localStorage.getItem(HERO_COPY_MIGRATION_KEY) !== 'applied') {
        parsed['hero.title.final'] = CURRENT_HERO_TITLE;
        delete parsed['hero.title'];
        localStorage.setItem(EDIT_KEY, JSON.stringify(parsed));
        localStorage.setItem(HERO_COPY_MIGRATION_KEY, 'applied');
      }
      if (localStorage.getItem(RECORDS_MIGRATION_KEY) !== 'applied') {
        parsed['proof.intro'] = CURRENT_PROOF_INTRO;
        localStorage.setItem(EDIT_KEY, JSON.stringify(parsed));
        localStorage.setItem(RECORDS_MIGRATION_KEY, 'applied');
      }
      if (localStorage.getItem(PROJECT_SUMMARY_MIGRATION_KEY) !== 'applied') {
        parsed['projects.portfolio.summary'] = CURRENT_PORTFOLIO_SUMMARY;
        localStorage.setItem(EDIT_KEY, JSON.stringify(parsed));
        localStorage.setItem(PROJECT_SUMMARY_MIGRATION_KEY, 'applied');
      }
      return parsed;
    } catch (error) {
      return {};
    }
  }

  const overrides = readOverrides();
  document.querySelectorAll('[data-editable]').forEach((node) => {
    const key = node.getAttribute('data-editable');
    if (Object.prototype.hasOwnProperty.call(overrides, key)) node.innerHTML = overrides[key];
  });

  const data = window.BRA_DATA;
  if (data && data.metrics) {
    document.querySelectorAll('[data-metric]').forEach((node) => {
      const key = node.getAttribute('data-metric');
      if (Object.prototype.hasOwnProperty.call(data.metrics, key)) node.textContent = data.metrics[key];
    });
    const generated = document.querySelector('[data-generated-at]');
    if (generated) generated.textContent = data.generatedAt;
  }

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('#site-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.matches('a')) {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const buttons = Array.from(document.querySelectorAll('[data-filter]'));
  const cards = Array.from(document.querySelectorAll('.project-card'));
  const empty = document.querySelector('#filter-empty');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-filter');
      buttons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      let visible = 0;
      cards.forEach((card) => {
        const show = filter === 'all' || card.getAttribute('data-category') === filter;
        card.classList.toggle('is-hidden', !show);
        if (show) visible += 1;
      });
      if (empty) empty.hidden = visible !== 0;
    });
  });

  let deferredPrompt;
  const installButton = document.querySelector('#install-button');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    if (installButton) installButton.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
