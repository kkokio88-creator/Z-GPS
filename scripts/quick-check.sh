#!/bin/bash
# Z-GPS Quick Check Script
# 빠른 프로젝트 상태 체크

echo "🔍 Z-GPS Quick Check Starting..."
echo ""

# 1. TypeScript 타입 체크
echo "📝 Checking TypeScript types..."
if npx tsc --noEmit; then
    echo "✅ TypeScript: No type errors"
else
    echo "❌ TypeScript: Type errors found"
    exit 1
fi
echo ""

# 2. 빌드 테스트
echo "🏗️  Testing production build..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Build: Success"
else
    echo "❌ Build: Failed"
    exit 1
fi
echo ""

# 3. 중요 파일 존재 확인
echo "📂 Checking essential files..."
files=(
    "types.ts"
    "services/agentOrchestrator.ts"
    "services/agentTeam.ts"
    "services/geminiAgents.ts"
    "components/AgentControl.tsx"
    "CLAUDE.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing!"
        exit 1
    fi
done
echo ""

# 4. 환경 변수 체크
echo "🔑 Checking environment setup..."
if [ -f ".env.local" ]; then
    echo "✅ .env.local exists"
else
    echo "⚠️  .env.local not found (create from .env.example)"
fi
echo ""

# 5. Git 상태
echo "📊 Git status..."
git status --short
echo ""

echo "✨ Quick check completed!"
