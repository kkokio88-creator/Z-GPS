<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Z-GPS (Government Grant Positioning System)

중소기업을 위한 AI 기반 정부 지원금 신청 관리 시스템

## 🎯 주요 기능

- **🤖 Multi-Agent AI System**: 여러 AI 에이전트들이 협업하여 복잡한 작업을 자동으로 수행
  - 6개의 특화 에이전트 (분석, 작성, 검토, 조사, 전략, 최적화)
  - 에이전트 간 실시간 통신 및 공유 메모리
  - 사전 정의된 워크플로우로 자동화된 프로세스
- **AI 기반 지원사업 추천**: Google Gemini AI를 활용한 맞춤형 지원사업 추천
- **스마트 신청서 작성**: AI가 자동으로 신청서 초안 생성
- **기업 프로필 관리**: 재무 데이터, 지적재산권 등 체계적 관리
- **일정 관리**: 지원사업 마감일 자동 추적
- **문서 분석**: OCR 및 AI를 활용한 문서 자동 분석

## 🤖 Multi-Agent AI System

Z-GPS는 여러 AI 에이전트들이 협업하는 고급 시스템을 탑재하고 있습니다:

### 에이전트 역할
- **ANALYZER**: 회사 분석, 자격 검토, 갭 분석
- **WRITER**: 지원서 작성, 콘텐츠 생성
- **REVIEWER**: 품질 평가, 일관성 검토
- **RESEARCHER**: 시장 조사, 트렌드 분석
- **STRATEGIST**: 전략 수립, 포지셔닝
- **OPTIMIZER**: 최적화, 지속적 학습

### 사전 정의 워크플로우
1. **지원서 완전 작성**: 분석 → 전략 → 작성 → 검토
2. **빠른 검토**: 일관성 + 품질 평가
3. **회사 프로필 강화**: 데이터 분석 + 포지셔닝
4. **자격 적합성 검토**: 요건 분석 + 전략 수립
5. **지속적 학습**: 성공 패턴 추출 및 공유

> 📖 자세한 내용: [Multi-Agent System 가이드](docs/MULTI_AGENT_SYSTEM.md) | [통합 예제](docs/AGENT_INTEGRATION_EXAMPLES.md)

## 🚀 빠른 시작

### 필수 요구사항

- Node.js 18 이상
- npm 또는 yarn

### 설치

1. **저장소 클론**
   ```bash
   git clone https://github.com/kkokio88-creator/Z-GPS.git
   cd Z-GPS
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 변수 설정**

   `.env.local` 파일을 생성하고 다음 내용을 추가하세요:
   ```bash
   # Google Gemini API Key (필수)
   # 발급: https://aistudio.google.com/app/apikey
   VITE_GEMINI_API_KEY=your_gemini_api_key_here

   # ODCloud API Key (공공데이터포털)
   # 발급: https://www.data.go.kr/
   VITE_ODCLOUD_API_KEY=your_odcloud_api_key_here

   # DART API Key (금융감독원)
   # 발급: https://opendart.fss.or.kr/
   VITE_DART_API_KEY=your_dart_api_key_here
   ```

   > 💡 `.env.example` 파일을 참고하세요

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```

   브라우저에서 `http://localhost:5173` 접속

## 📦 빌드

프로덕션 빌드를 생성하려면:

```bash
npm run build
```

빌드된 파일은 `dist/` 디렉토리에 생성됩니다.

미리보기:
```bash
npm run preview
```

## 🛠️ 기술 스택

- **Frontend**: React 19, TypeScript
- **Build Tool**: Vite
- **Routing**: React Router DOM 7
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS (inline)

## 📁 프로젝트 구조

```
Z-GPS/
├── components/          # React 컴포넌트
│   ├── Dashboard.tsx    # 대시보드
│   ├── ApplicationEditor.tsx  # 신청서 편집기
│   ├── CompanyProfile.tsx     # 기업 프로필
│   └── ...
├── services/            # 비즈니스 로직
│   ├── geminiService.ts       # Gemini API 통합
│   ├── apiService.ts          # 공공 API 통합
│   ├── storageService.ts      # 로컬 저장소 관리
│   └── ...
├── types.ts             # TypeScript 타입 정의
├── App.tsx              # 메인 앱 컴포넌트
└── .env.local           # 환경 변수 (gitignore)
```

## 🔐 보안

- API 키는 절대 코드에 직접 포함하지 마세요
- `.env.local` 파일은 Git에 커밋되지 않습니다
- 프로덕션 환경에서는 서버 측 API 프록시 사용을 권장합니다

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.

## 📧 문의

프로젝트 관련 문의: [GitHub Issues](https://github.com/kkokio88-creator/Z-GPS/issues)

---

**Made with ❤️ for SMEs**
