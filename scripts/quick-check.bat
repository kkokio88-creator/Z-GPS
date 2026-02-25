@echo off
REM Z-GPS Quick Check Script (Windows)
REM 빠른 프로젝트 상태 체크

echo 🔍 Z-GPS Quick Check Starting...
echo.

REM 1. TypeScript 타입 체크
echo 📝 Checking TypeScript types...
call npx tsc --noEmit
if %errorlevel% equ 0 (
    echo ✅ TypeScript: No type errors
) else (
    echo ❌ TypeScript: Type errors found
    exit /b 1
)
echo.

REM 2. 빌드 테스트
echo 🏗️  Testing production build...
call npm run build >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Build: Success
) else (
    echo ❌ Build: Failed
    exit /b 1
)
echo.

REM 3. 중요 파일 존재 확인
echo 📂 Checking essential files...
if exist types.ts (echo ✅ types.ts exists) else (echo ❌ types.ts missing! & exit /b 1)
if exist services\agentOrchestrator.ts (echo ✅ agentOrchestrator.ts exists) else (echo ❌ agentOrchestrator.ts missing! & exit /b 1)
if exist services\agentTeam.ts (echo ✅ agentTeam.ts exists) else (echo ❌ agentTeam.ts missing! & exit /b 1)
if exist components\AgentControl.tsx (echo ✅ AgentControl.tsx exists) else (echo ❌ AgentControl.tsx missing! & exit /b 1)
if exist CLAUDE.md (echo ✅ CLAUDE.md exists) else (echo ❌ CLAUDE.md missing! & exit /b 1)
echo.

REM 4. 환경 변수 체크
echo 🔑 Checking environment setup...
if exist .env.local (
    echo ✅ .env.local exists
) else (
    echo ⚠️  .env.local not found (create from .env.example)
)
echo.

REM 5. Git 상태
echo 📊 Git status...
git status --short
echo.

echo ✨ Quick check completed!
