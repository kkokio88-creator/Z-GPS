/**
 * Supabase 프론트엔드 클라이언트
 * 기업 정보, 공고, 지원서를 Supabase에 영속화
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

/** Supabase 연결 여부 확인 */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Supabase 클라이언트 (미설정 시 null) */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// ── 기업 정보 ───────────────────────────────────────

export async function upsertCompany(companyData: Record<string, unknown>): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('companies')
      .upsert({
        name: companyData.name || '',
        business_number: companyData.businessNumber || '',
        industry: companyData.industry || '',
        address: companyData.address || '',
        revenue: companyData.revenue || 0,
        employees: companyData.employees || 0,
        description: companyData.description || '',
        core_competencies: companyData.coreCompetencies || [],
        certifications: companyData.certifications || [],
        main_products: companyData.mainProducts || [],
        deep_research: companyData.deepResearch || null,
        raw_data: companyData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'name' });

    if (error) {
      console.warn('[supabase] upsertCompany error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] upsertCompany failed:', e);
    return false;
  }
}

export async function fetchLatestCompany(): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('companies')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      name: data.name,
      businessNumber: data.business_number,
      industry: data.industry,
      address: data.address,
      revenue: data.revenue,
      employees: data.employees,
      description: data.description,
      coreCompetencies: data.core_competencies,
      certifications: data.certifications,
      mainProducts: data.main_products,
      deepResearch: data.deep_research,
    };
  } catch {
    return null;
  }
}

// ── 프로그램 ───────────────────────────────────────

export async function fetchPrograms(): Promise<Record<string, unknown>[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('programs')
      .select('*')
      .order('fit_score', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ── 지원서 ───────────────────────────────────────

export async function fetchApplications(): Promise<Record<string, unknown>[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ── 설정 ───────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) return null;
    return data.value;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });

    return !error;
  } catch {
    return false;
  }
}
