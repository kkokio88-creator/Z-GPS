-- Z-GPS Supabase 테이블 스키마
-- Supabase 대시보드 SQL Editor에서 실행하세요

-- 기업 정보
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  business_number TEXT,
  industry TEXT,
  address TEXT,
  revenue BIGINT DEFAULT 0,
  employees INT DEFAULT 0,
  description TEXT,
  core_competencies TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  main_products TEXT[] DEFAULT '{}',
  deep_research JSONB,
  raw_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 공고 프로그램
CREATE TABLE IF NOT EXISTS programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  program_name TEXT NOT NULL,
  organizer TEXT,
  fit_score INT DEFAULT 0,
  eligibility TEXT,
  status TEXT DEFAULT 'synced',
  frontmatter JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ
);

-- 지원서
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_slug TEXT NOT NULL UNIQUE,
  draft_sections JSONB DEFAULT '{}',
  section_schema JSONB,
  review JSONB,
  consistency JSONB,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API 설정 (공유용)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_programs_fit_score ON programs(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_applications_program_slug ON applications(program_slug);
