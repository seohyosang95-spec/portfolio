import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const REDIS_KEY = 'assignment8:passkey-db:v1';

const PORT = process.env.PORT || 3000;
const RP_NAME = process.env.RP_NAME || '서효상 정보보안 포트폴리오';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-before-deploying';
const SESSION_COOKIE = 't08_session';
const SESSION_MAX_AGE_SEC = 60 * 60;
const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;

const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null;

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'app.js'));
});

function emptyDb() {
  return {
    users: {},
    challenges: {},
    evidence: [],
  };
}

function ensureLocalDb() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

async function readDb() {
  if (redis) {
    const saved = await redis.get(REDIS_KEY);

    if (!saved) {
      const initial = emptyDb();
      await redis.set(REDIS_KEY, initial);
      return initial;
    }

    return typeof saved === 'string' ? JSON.parse(saved) : saved;
  }

  ensureLocalDb();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

async function writeDb(db) {
  if (redis) {
    await redis.set(REDIS_KEY, db);
    return;
  }

  ensureLocalDb();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function normalizeUsername(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

function safeName(value = '') {
  return String(value).trim().replace(/[<>]/g, '').slice(0, 40);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;

  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const result = {};

  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');

    if (idx === -1) continue;

    result[part.slice(0, idx).trim()] =
      decodeURIComponent(part.slice(idx + 1).trim());
  }

  return result;
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const payload = verifySessionToken(token);

  return payload?.username || null;
}

function setSession(res, username) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const token = signSession({ username, exp });
  const secure = ORIGIN.startsWith('https://');

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}${secure ? '; Secure' : ''}`,
  );
}

function clearSession(res) {
  const secure = ORIGIN.startsWith('https://');

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

function requireAuth(req, res, next) {
  const username = currentUser(req);

  if (!username) {
    return res.status(401).json({
      ok: false,
      error: '패스키 로그인이 필요합니다.',
    });
  }

  req.username = username;
  next();
}

function challengeExpired(row) {
  return !row?.createdAt || Date.now() - row.createdAt > CHALLENGE_MAX_AGE_MS;
}

async function addEvidence(type, details) {
  const db = await readDb();

  db.evidence.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    type,
    ...details,
  });

  db.evidence = db.evidence.slice(0, 100);

  await writeDb(db);
}

function getOrCreateUser(db, username) {
  if (!db.users[username]) {
    db.users[username] = {
      id: crypto.randomBytes(32).toString('base64url'),
      username,
      displayName: username,
      passkeys: [],
      privateItems: [
        `${username} 전용 프로젝트 메모: 탐지 룰 개선 아이디어 정리`,
        `${username} 전용 지원 목록: 보안기업 A · B · C (과제용 가상 자료)`,
        `${username} 전용 학습 회고: Wireshark와 이벤트 로그 복습 기록`,
      ],
      createdAt: new Date().toISOString(),
    };
  }

  return db.users[username];
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    rpID: RP_ID,
    origin: ORIGIN,
    storage: redis ? 'upstash-redis' : 'local-file',
  });
});

app.post('/api/register/options', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const passkeyName = safeName(req.body.passkeyName);

    if (!username) {
      return res.status(400).json({
        ok: false,
        error: '계정 이름을 입력하세요.',
      });
    }

    if (!passkeyName) {
      return res.status(400).json({
        ok: false,
        error: '패스키 이름을 입력하세요.',
      });
    }

    const db = await readDb();
    const user = getOrCreateUser(db, username);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.username,
      userDisplayName: user.displayName,
      userID: Buffer.from(user.id, 'base64url'),
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    db.challenges[`reg:${username}`] = {
      challenge: options.challenge,
      passkeyName,
      createdAt: Date.now(),
      used: false,
    };

    await writeDb(db);

    await addEvidence('registration-challenge', {
      username,
      challengePreview: `${options.challenge.slice(0, 12)}…`,
      note: '등록 요청마다 서버가 새 challenge를 생성함',
    });

    res.json(options);
  } catch (error) {
    console.error('register/options', error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/api/register/verify', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const response = req.body.response;

  const db = await readDb();
  const user = db.users[username];
  const challengeRow = db.challenges[`reg:${username}`];

  if (!user || !challengeRow || challengeRow.used || challengeExpired(challengeRow)) {
    if (challengeRow) {
      challengeRow.used = true;
      await writeDb(db);
    }

    await addEvidence('registration-failed', {
      username,
      status: 400,
      reason: '등록 challenge 없음/재사용/만료',
    });

    return res.status(400).json({
      ok: false,
      error: '등록 질문이 없거나 이미 사용되었거나 만료되었습니다.',
    });
  }

  challengeRow.used = true;
  await writeDb(db);

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      supportedAlgorithmIDs: [-7, -257],
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('등록 검증에 실패했습니다.');
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const db2 = await readDb();
    const user2 = db2.users[username];

    if (!user2) {
      throw new Error('등록 중 계정 정보를 찾을 수 없습니다.');
    }

    const already = user2.passkeys.some((p) => p.id === credential.id);

    if (!already) {
      user2.passkeys.push({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: response.response?.transports || credential.transports || [],
        name: challengeRow.passkeyName,
        createdAt: new Date().toISOString(),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      });
    }

    delete db2.challenges[`reg:${username}`];

    await writeDb(db2);

    await addEvidence('registration-success', {
      username,
      status: 200,
      passkeyName: challengeRow.passkeyName,
      credentialIdPreview: `${credential.id.slice(0, 10)}…`,
      publicKeyPreview: `${Buffer.from(credential.publicKey)
        .toString('base64url')
        .slice(0, 24)}…`,
      note: '서버에는 공개키가 저장되며 개인키는 요청 본문에 포함되지 않음',
    });

    res.json({
      ok: true,
      verified: true,
      passkeyCount: user2.passkeys.length,
    });
  } catch (error) {
    console.error('register/verify', error);

    await addEvidence('registration-failed', {
      username,
      status: 400,
      reason: error.message,
    });

    res.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/api/login/options', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);

    const db = await readDb();
    const user = db.users[username];

    if (!user || user.passkeys.length === 0) {
      return res.status(404).json({
        ok: false,
        error: '등록된 패스키가 없는 계정입니다.',
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: user.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports,
      })),
      userVerification: 'preferred',
    });

    db.challenges[`auth:${username}`] = {
      challenge: options.challenge,
      createdAt: Date.now(),
      used: false,
    };

    await writeDb(db);

    await addEvidence('login-challenge', {
      username,
      challengePreview: `${options.challenge.slice(0, 12)}…`,
      note: '로그인 요청마다 서버가 새 challenge를 생성함',
    });

    res.json(options);
  } catch (error) {
    console.error('login/options', error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/api/login/verify', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const response = req.body.response;

  const db = await readDb();
  const user = db.users[username];
  const challengeRow = db.challenges[`auth:${username}`];

  if (!user || !challengeRow || challengeRow.used || challengeExpired(challengeRow)) {
    if (challengeRow) {
      challengeRow.used = true;
      await writeDb(db);
    }

    await addEvidence('login-failed', {
      username,
      status: 400,
      reason: '로그인 challenge 없음/재사용/만료',
    });

    return res.status(400).json({
      ok: false,
      error: '로그인 질문이 없거나 이미 사용되었거나 만료되었습니다.',
    });
  }

  challengeRow.used = true;
  await writeDb(db);

  const passkey = user.passkeys.find((p) => p.id === response.id);

  if (!passkey) {
    await addEvidence('login-failed', {
      username,
      status: 403,
      reason: '다른 계정 또는 삭제된 패스키',
    });

    return res.status(403).json({
      ok: false,
      error: '이 계정에 등록된 패스키가 아닙니다.',
    });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(
          Buffer.from(passkey.publicKey, 'base64url'),
        ),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new Error('서명 검증 실패');
    }

    const db2 = await readDb();
    const liveUser = db2.users[username];

    if (!liveUser) {
      throw new Error('로그인 중 계정 정보를 찾을 수 없습니다.');
    }

    const livePasskey = liveUser.passkeys.find(
      (p) => p.id === passkey.id,
    );

    if (!livePasskey) {
      throw new Error('패스키가 삭제되었거나 더 이상 유효하지 않습니다.');
    }

    livePasskey.counter =
      verification.authenticationInfo.newCounter;

    delete db2.challenges[`auth:${username}`];

    await writeDb(db2);

    setSession(res, username);

    await addEvidence('login-success', {
      username,
      status: 200,
      passkeyName: passkey.name,
      note: '저장된 공개키로 서명을 검증한 뒤 세션 쿠키 발급',
    });

    res.json({
      ok: true,
      verified: true,
      username,
    });
  } catch (error) {
    console.error('login/verify', error);

    await addEvidence('login-failed', {
      username,
      status: 403,
      reason: error.message,
    });

    res.status(403).json({
      ok: false,
      error: '패스키 서명 검증에 실패했습니다.',
    });
  }
});

app.get('/api/private', requireAuth, async (req, res) => {
  const db = await readDb();
  const user = db.users[req.username];

  if (!user) {
    return res.status(404).json({
      ok: false,
      error: '계정을 찾을 수 없습니다.',
    });
  }

  res.json({
    ok: true,
    username: req.username,
    items: user.privateItems,
  });
});

app.post('/api/private/test-other-account', requireAuth, async (req, res) => {
  const requested = normalizeUsername(req.body.username);

  if (requested && requested !== req.username) {
    const db = await readDb();

    const before =
      db.users[requested]?.privateItems?.length ?? 0;

    await addEvidence('cross-account-denied', {
      username: req.username,
      requestedAccount: requested,
      status: 403,
      otherAccountItemCountBefore: before,
      otherAccountItemCountAfter: before,
      note: '세션의 사용자와 요청한 사용자가 달라 거절됨',
    });

    return res.status(403).json({
      ok: false,
      error: '다른 계정의 비공개 자료에는 접근할 수 없습니다.',
    });
  }

  const db = await readDb();

  res.json({
    ok: true,
    username: req.username,
    items: db.users[req.username].privateItems,
  });
});

app.get('/api/passkeys', requireAuth, async (req, res) => {
  const db = await readDb();
  const user = db.users[req.username];

  if (!user) {
    return res.status(404).json({
      ok: false,
      error: '계정을 찾을 수 없습니다.',
    });
  }

  res.json({
    ok: true,
    passkeys: user.passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
    })),
  });
});

app.delete('/api/passkeys/:id', requireAuth, async (req, res) => {
  const db = await readDb();
  const user = db.users[req.username];

  if (!user) {
    return res.status(404).json({
      ok: false,
      error: '계정을 찾을 수 없습니다.',
    });
  }

  const idx = user.passkeys.findIndex(
    (p) => p.id === req.params.id,
  );

  if (idx === -1) {
    return res.status(404).json({
      ok: false,
      error: '패스키를 찾을 수 없습니다.',
    });
  }

  const removed = user.passkeys.splice(idx, 1)[0];

  await writeDb(db);

  await addEvidence('passkey-deleted', {
    username: req.username,
    status: 200,
    passkeyName: removed.name,
    remaining: user.passkeys.length,
  });

  res.json({
    ok: true,
    remaining: user.passkeys.length,
    message:
      user.passkeys.length === 0
        ? '마지막 패스키가 삭제되었습니다. 현재 세션이 끝나면 다시 로그인할 수 없습니다.'
        : '패스키를 삭제했습니다. 남은 패스키로 계속 로그인할 수 있습니다.',
  });
});

app.post('/api/logout', async (req, res) => {
  const username = currentUser(req);

  clearSession(res);

  if (username) {
    await addEvidence('logout', {
      username,
      status: 200,
    });
  }

  res.json({
    ok: true,
  });
});

app.get('/api/session', (req, res) => {
  const username = currentUser(req);

  res.json({
    loggedIn: Boolean(username),
    username,
  });
});

app.get('/api/evidence', async (_req, res) => {
  try {
    const db = await readDb();

    res.json({
      ok: true,
      warning: '세션 값, 개인키, 전체 공개키는 표시하지 않습니다.',
      evidence: db.evidence,
    });
  } catch (error) {
    console.error('evidence error', error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n과제 8 서버 실행: ${ORIGIN}`);
  console.log(`RP ID: ${RP_ID}`);
  console.log(redis ? '저장소: Upstash Redis' : '저장소: local db.json');
  console.log('Chrome에서 위 주소를 여세요.\n');
});