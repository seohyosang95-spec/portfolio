(function () {
  'use strict';

  const STORAGE_KEY = 'seo-portfolio-overrides-v1';
  const CURRENT_HERO_TITLE = '허용과 거부의 근거를<br><em>끝까지 확인합니다.</em>';
  const HERO_COPY_MIGRATION_KEY = 'seo-portfolio-hero-copy-v2';
  const CURRENT_PROOF_INTRO = '8월부터 이어 온 기록에 9월 28일~10월 23일 팀프로젝트·미니실습 기록을 더했습니다. 막히는 구간에서 다시 시도하고, 도움을 받으면 고마움을 표현하고, 팀원의 진행을 확인하는 행동이 반복해서 나타났습니다.';
  const RECORDS_MIGRATION_KEY = 'seo-portfolio-records-v1';
  const CURRENT_PORTFOLIO_SUMMARY = '흩어진 리추얼과 팀프로젝트·미니실습 기록을 자기소개·수치·근거·지원 문서로 구조화하고, 반복해서 나타난 행동까지 확인할 수 있게 만든 공개 포트폴리오입니다.';
  const PROJECT_SUMMARY_MIGRATION_KEY = 'seo-portfolio-project-summary-v1';
  const defaults = window.PORTFOLIO_CONTENT || {};
  const fields = Array.from(document.querySelectorAll('[data-editor-key]'));
  const form = document.querySelector('#editor-form');
  const status = document.querySelector('#save-status');
  const resetButton = document.querySelector('#reset-button');
  const exportButton = document.querySelector('#export-button');
  const importFile = document.querySelector('#import-file');

  function readOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      if (localStorage.getItem(HERO_COPY_MIGRATION_KEY) !== 'applied') {
        parsed['hero.title.final'] = CURRENT_HERO_TITLE;
        delete parsed['hero.title'];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        localStorage.setItem(HERO_COPY_MIGRATION_KEY, 'applied');
      }
      if (localStorage.getItem(RECORDS_MIGRATION_KEY) !== 'applied') {
        parsed['proof.intro'] = CURRENT_PROOF_INTRO;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        localStorage.setItem(RECORDS_MIGRATION_KEY, 'applied');
      }
      if (localStorage.getItem(PROJECT_SUMMARY_MIGRATION_KEY) !== 'applied') {
        parsed['projects.portfolio.summary'] = CURRENT_PORTFOLIO_SUMMARY;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        localStorage.setItem(PROJECT_SUMMARY_MIGRATION_KEY, 'applied');
      }
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function fillForm(values) {
    fields.forEach((field) => {
      const key = field.getAttribute('data-editor-key');
      field.value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : (defaults[key] || '');
    });
  }

  function collectForm() {
    const values = {};
    fields.forEach((field) => {
      const key = field.getAttribute('data-editor-key');
      const value = field.value;
      if (value.trim() && value !== defaults[key]) values[key] = value;
    });
    return values;
  }

  function saveForm(event) {
    if (event) event.preventDefault();
    const values = collectForm();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      const savedAt = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
      setStatus(`저장됨 · ${savedAt} · 미리보기에서 확인하세요.`);
    } catch (error) {
      setStatus('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  function resetForm() {
    if (!window.confirm('저장된 편집 내용을 모두 지우고 기본 내용으로 돌아갈까요?')) return;
    localStorage.removeItem(STORAGE_KEY);
    fillForm({});
    setStatus('기본 내용으로 되돌렸습니다.');
  }

  function exportContent() {
    const blob = new Blob([JSON.stringify(collectForm(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'seo-hyosang-portfolio-content.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('현재 내용을 JSON 파일로 내보냈습니다.');
  }

  function importContent(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error('invalid');
        const allowed = {};
        fields.forEach((field) => {
          const key = field.getAttribute('data-editor-key');
          if (typeof imported[key] === 'string') allowed[key] = imported[key];
        });
        fillForm(allowed);
        setStatus('JSON 내용을 불러왔습니다. 확인 후 변경 저장을 눌러 적용하세요.');
      } catch (error) {
        setStatus('JSON 파일을 읽지 못했습니다. 이 편집실에서 내보낸 파일인지 확인해 주세요.');
      }
      importFile.value = '';
    };
    reader.readAsText(file);
  }

  fillForm(readOverrides());
  form?.addEventListener('submit', saveForm);
  resetButton?.addEventListener('click', resetForm);
  exportButton?.addEventListener('click', exportContent);
  importFile?.addEventListener('change', importContent);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
