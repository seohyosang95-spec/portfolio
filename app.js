const $ = (id) => document.getElementById(id);
const statusBox = $('statusBox');
const privateBox = $('privateBox');
const passkeyList = $('passkeyList');
const evidenceBox = $('evidenceBox');

const { startRegistration, startAuthentication, browserSupportsWebAuthn } = SimpleWebAuthnBrowser;

function showStatus(message, type = 'info') {
  statusBox.textContent = message;
  statusBox.dataset.type = type;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function username() {
  return $('username').value.trim().toLowerCase();
}

function passkeyName() {
  return $('passkeyName').value.trim();
}

async function registerPasskey() {
  if (!browserSupportsWebAuthn()) {
    showStatus('이 브라우저는 WebAuthn/패스키를 지원하지 않습니다.', 'error');
    return;
  }
  if (!username() || !passkeyName()) {
    showStatus('계정 이름과 패스키 이름을 모두 입력하세요.', 'error');
    return;
  }

  try {
    showStatus('등록용 일회용 질문(challenge)을 서버에서 받는 중…');
    const optionsJSON = await api('/api/register/options', {
      method: 'POST',
      body: JSON.stringify({ username: username(), passkeyName: passkeyName() }),
    });

    const attResp = await startRegistration({ optionsJSON });

    const result = await api('/api/register/verify', {
      method: 'POST',
      body: JSON.stringify({ username: username(), response: attResp }),
    });

    showStatus(`패스키 등록 성공. 현재 ${result.passkeyCount}개가 등록되어 있습니다.`, 'success');
    await loginPasskey();
  } catch (error) {
    const cancelled = error.name === 'NotAllowedError';
    showStatus(cancelled ? '패스키 등록이 취소되었습니다. 서버에는 새 패스키가 저장되지 않았습니다.' : `등록 실패: ${error.message}`, 'error');
  }
}

async function loginPasskey() {
  if (!browserSupportsWebAuthn()) {
    showStatus('이 브라우저는 WebAuthn/패스키를 지원하지 않습니다.', 'error');
    return;
  }
  if (!username()) {
    showStatus('로그인할 계정 이름을 입력하세요.', 'error');
    return;
  }

  try {
    showStatus('로그인용 새 challenge를 서버에서 받는 중…');
    const optionsJSON = await api('/api/login/options', {
      method: 'POST',
      body: JSON.stringify({ username: username() }),
    });

    const authResp = await startAuthentication({ optionsJSON });
    await api('/api/login/verify', {
      method: 'POST',
      body: JSON.stringify({ username: username(), response: authResp }),
    });

    showStatus('패스키 서명 검증 성공. 로그인되었습니다.', 'success');
    await refreshSession();
  } catch (error) {
    showStatus(`로그인 실패: ${error.message}`, 'error');
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST', body: '{}' });
  privateBox.innerHTML = '<p class="locked">🔒 로그인 전에는 비공개 내용 자체를 서버에서 보내지 않습니다.</p>';
  passkeyList.innerHTML = '<li>로그인 후 확인할 수 있습니다.</li>';
  showStatus('로그아웃했습니다. 기존 세션 쿠키는 폐기되었습니다.', 'success');
  await refreshSession();
}

async function loadPrivate() {
  try {
    const data = await api('/api/private');
    privateBox.innerHTML = `
      <div class="private-ok">✅ ${escapeHtml(data.username)} 계정 인증 완료</div>
      <ul>${data.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <p class="fake-note">※ 모두 과제용으로 만들어 넣은 가상 자료이며 실제 개인정보가 아닙니다.</p>
    `;
  } catch (error) {
    privateBox.innerHTML = `<p class="locked">🔒 ${escapeHtml(error.message)} (HTTP ${error.status || '?'})</p>`;
  }
}

async function loadPasskeys() {
  try {
    const data = await api('/api/passkeys');
    if (!data.passkeys.length) {
      passkeyList.innerHTML = '<li>등록된 패스키가 없습니다. 마지막 패스키 삭제 후 세션이 끝나면 다시 들어갈 수 없습니다.</li>';
      return;
    }
    passkeyList.innerHTML = data.passkeys.map((p) => `
      <li class="passkey-row">
        <span><strong>${escapeHtml(p.name)}</strong><br><small>${new Date(p.createdAt).toLocaleString('ko-KR')}</small></span>
        <button class="danger small" data-delete-passkey="${encodeURIComponent(p.id)}">삭제</button>
      </li>`).join('');

    document.querySelectorAll('[data-delete-passkey]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('이 패스키를 서버의 허용 목록에서 삭제할까요?')) return;
        const id = decodeURIComponent(button.dataset.deletePasskey);
        try {
          const result = await api(`/api/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
          showStatus(result.message, 'success');
          await loadPasskeys();
          await loadEvidence();
        } catch (error) {
          showStatus(`삭제 실패: ${error.message}`, 'error');
        }
      });
    });
  } catch {
    passkeyList.innerHTML = '<li>로그인 후 확인할 수 있습니다.</li>';
  }
}

async function testOtherAccount() {
  const other = $('otherAccount').value.trim().toLowerCase();
  if (!other) {
    showStatus('테스트할 다른 계정 이름을 입력하세요.', 'error');
    return;
  }
  try {
    await api('/api/private/test-other-account', {
      method: 'POST',
      body: JSON.stringify({ username: other }),
    });
    showStatus('같은 계정을 입력해 정상 조회되었습니다. 다른 계정을 입력하면 403이어야 합니다.', 'info');
  } catch (error) {
    showStatus(`교차 계정 접근 차단 확인: HTTP ${error.status} — ${error.message}`, error.status === 403 ? 'success' : 'error');
  }
  await loadEvidence();
}

async function refreshSession() {
  const session = await api('/api/session');
  $('sessionState').textContent = session.loggedIn
    ? `로그인됨: ${session.username}`
    : '로그아웃 상태';
  $('logoutBtn').disabled = !session.loggedIn;
  $('loadPrivateBtn').disabled = !session.loggedIn;
  $('otherTestBtn').disabled = !session.loggedIn;
  if (session.loggedIn) {
    await loadPrivate();
    await loadPasskeys();
  }
  await loadEvidence();
}

async function loadEvidence() {
  try {
    const data = await api('/api/evidence');
    const rows = data.evidence.slice(0, 20);
    evidenceBox.innerHTML = rows.length ? rows.map((e) => `
      <tr>
        <td>${new Date(e.at).toLocaleString('ko-KR')}</td>
        <td>${escapeHtml(e.type)}</td>
        <td>${escapeHtml(e.username || '-')}</td>
        <td>${escapeHtml(String(e.status || '-'))}</td>
        <td><code>${escapeHtml(e.challengePreview || e.publicKeyPreview || e.note || e.reason || '-')}</code></td>
      </tr>`).join('') : '<tr><td colspan="5">아직 기록이 없습니다.</td></tr>';
  } catch (error) {
    evidenceBox.innerHTML = `<tr><td colspan="5">기록 불러오기 실패: ${escapeHtml(error.message)}</td></tr>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

$('registerBtn').addEventListener('click', registerPasskey);
$('loginBtn').addEventListener('click', loginPasskey);
$('logoutBtn').addEventListener('click', logout);
$('loadPrivateBtn').addEventListener('click', loadPrivate);
$('otherTestBtn').addEventListener('click', testOtherAccount);
$('refreshEvidenceBtn').addEventListener('click', loadEvidence);

refreshSession().catch((error) => showStatus(`초기화 오류: ${error.message}`, 'error'));
