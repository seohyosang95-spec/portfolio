# 과제 8 — 내 소개 페이지에 패스키 달기

이 프로젝트는 기존 공개 포트폴리오에 패스키(WebAuthn)로 잠긴 비공개 영역을 붙인 과제용 예제입니다.

## 1. 가장 먼저 실행하기

Node.js 20 이상이 필요합니다.

```bash
npm install
npm start
```

그 다음 Chrome에서 아래 주소를 엽니다.

```text
http://localhost:3000
```

`localhost`는 WebAuthn 개발 환경에서 안전한 컨텍스트 예외로 사용할 수 있습니다.

## 2. 첫 패스키 등록

1. 계정 이름을 `seo-main`으로 둡니다.
2. 패스키 이름을 `내 노트북`으로 둡니다.
3. `패스키 등록`을 누릅니다.
4. Windows Hello, 휴대폰, 보안 키 등 브라우저가 보여주는 인증 방법을 선택합니다.
5. 성공하면 서버의 `data/db.json`에는 credential id, 공개키, counter 등이 저장됩니다. 개인키는 저장되지 않습니다.

## 3. 두 번째 패스키 등록

로그인한 상태에서 패스키 이름을 `내 휴대폰` 등으로 바꾸고 다시 `패스키 등록`을 누릅니다.

같은 인증기가 기존 credential 재등록을 막으면 다른 기기/인증기를 사용합니다.

## 4. 과제용 두 번째 계정

계정 이름을 `seo-test`로 바꾸고 별도 패스키를 등록합니다.

각 계정의 비공개 자료는 서버가 계정별로 자동 생성한 가상 자료입니다.

## 5. 확인할 것

- 로그아웃 상태에서 `/api/private` 직접 요청 → `401`
- `seo-main` 로그인 후 `seo-test` 자료 요청 시험 → `403`
- 로그인 옵션을 받은 뒤 같은 verify 요청을 재전송 → 이미 사용한 challenge라 거절
- 패스키 두 개 등록 → 하나 삭제 → 남은 패스키로 로그인 성공
- 삭제된 패스키로 인증 시 서버 허용 목록에 없어서 실패

## 6. 중요한 보안 설계

- 비공개 내용은 `index.html` 안에 숨겨 두지 않습니다.
- 로그인 전에는 `/api/private`가 내용 자체를 반환하지 않습니다.
- 등록/로그인 challenge는 서버 파일에 저장되고 1회 사용 뒤 소비됩니다.
- 로그인 성공 뒤 서버가 HMAC 서명된 HttpOnly 세션 쿠키를 발급합니다.
- 세션 쿠키 값은 과제 확인 기록 API에 노출하지 않습니다.
- 개인키는 서버에 저장하지 않습니다.

## 7. 소스 위치 설명에 쓸 문장

- 등록: `server.js`의 `/api/register/options`, `/api/register/verify`
- 로그인: `server.js`의 `/api/login/options`, `/api/login/verify`
- 로그아웃: `server.js`의 `/api/logout`
- 비공개 자료 조회: `server.js`의 `/api/private`
- 패스키 목록/삭제: `server.js`의 `/api/passkeys`, `/api/passkeys/:id`
- 브라우저 패스키 호출: `app.js`의 `registerPasskey()`, `loginPasskey()`

## 8. 아직 못 막은 것 — 제출문에 사용 가능

이 학습용 버전은 최초 계정 등록 단계에 별도의 관리자 승인이나 초대 절차가 없습니다. 따라서 실제 서비스라면 계정 선점 방지를 위한 초기 등록 승인 절차를 추가해야 합니다.

또한 기본 버전의 데이터는 `data/db.json`에 저장합니다. 클라우드 서버의 임시 파일 시스템에 그대로 배포하면 재배포/재시작 시 데이터가 사라질 수 있으므로, 최종 인터넷 배포에서는 영구 데이터베이스로 교체해야 합니다.

## 9. HTTPS 배포 시 환경변수

배포 주소가 예를 들어 `https://example.onrender.com`이라면 다음 값을 설정해야 합니다.

```text
RP_ID=example.onrender.com
ORIGIN=https://example.onrender.com
SESSION_SECRET=충분히_긴_무작위_문자열
```

`SESSION_SECRET` 값은 GitHub에 올리지 않습니다.
