/**
 * Supabase 서버 서비스
 * 서버에서 공고/지원서 데이터를 Supabase에 동기화
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseProgramRecord {
  slug: string;
  program_name: string;
  organizer: string;
  fit_score: number;
  eligibility: string;
  status: string;
  frontmatter: Record<string, unknown>;
  enrichment_phase: number;
  crawled_content: string | null;
  attachment_texts: string[] | null;
  synced_at: string;
  analyzed_at: string | null;
  last_api_sync: string | null;
}

let supabase: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

// ── 공고 프로그램 Upsert ─────────────────────────

export async function upsertProgram(program: {
  slug: string;
  programName: string;
  organizer?: string;
  fitScore?: number;
  eligibility?: string;
  status?: string;
  frontmatter?: Record<string, unknown>;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('programs')
      .upsert({
        slug: program.slug,
        program_name: program.programName,
        organizer: program.organizer || '',
        fit_score: program.fitScore || 0,
        eligibility: program.eligibility || '',
        status: program.status || 'synced',
        frontmatter: program.frontmatter || {},
        synced_at: new Date().toISOString(),
        analyzed_at: program.fitScore ? new Date().toISOString() : null,
      }, { onConflict: 'slug' });

    if (error) {
      console.warn('[supabase] upsertProgram error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] upsertProgram failed:', e);
    return false;
  }
}

/** 복수 프로그램 일괄 upsert */
export async function upsertProgramsBatch(programs: {
  slug: string;
  programName: string;
  organizer?: string;
  fitScore?: number;
  eligibility?: string;
  status?: string;
  frontmatter?: Record<string, unknown>;
  enrichmentPhase?: number;
  crawledContent?: string | null;
  attachmentTexts?: string[] | null;
  lastApiSync?: string | null;
}[]): Promise<number> {
  const sb = getSupabase();
  if (!sb || programs.length === 0) return 0;

  try {
    const rows = programs.map(p => ({
      slug: p.slug,
      program_name: p.programName,
      organizer: p.organizer || '',
      fit_score: p.fitScore || 0,
      eligibility: p.eligibility || '',
      status: p.status || 'synced',
      frontmatter: p.frontmatter || {},
      synced_at: new Date().toISOString(),
      analyzed_at: p.fitScore ? new Date().toISOString() : null,
      ...(p.enrichmentPhase !== undefined && { enrichment_phase: p.enrichmentPhase }),
      ...(p.crawledContent !== undefined && { crawled_content: p.crawledContent }),
      ...(p.attachmentTexts !== undefined && { attachment_texts: p.attachmentTexts }),
      ...(p.lastApiSync !== undefined && { last_api_sync: p.lastApiSync }),
    }));

    const { error } = await sb
      .from('programs')
      .upsert(rows, { onConflict: 'slug' });

    if (error) {
      console.warn('[supabase] upsertProgramsBatch error:', error.message);
      return 0;
    }
    return programs.length;
  } catch (e) {
    console.warn('[supabase] upsertProgramsBatch failed:', e);
    return 0;
  }
}

// ── 공고 프로그램 Pull / Sync ─────────────────────

/** Supabase programs 테이블 전체 pull */
export async function pullProgramsFromSupabase(): Promise<SupabaseProgramRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('programs')
      .select('*');

    if (error) {
      console.warn('[supabase] pullProgramsFromSupabase error:', error.message);
      return [];
    }
    return (data as SupabaseProgramRecord[]) || [];
  } catch (e) {
    console.warn('[supabase] pullProgramsFromSupabase failed:', e);
    return [];
  }
}

/** 가장 최근 last_api_sync 타임스탬프 반환 */
export async function getLastApiSyncTimestamp(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('programs')
      .select('last_api_sync')
      .order('last_api_sync', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[supabase] getLastApiSyncTimestamp error:', error.message);
      return null;
    }
    return (data?.[0]?.last_api_sync as string | null) ?? null;
  } catch (e) {
    console.warn('[supabase] getLastApiSyncTimestamp failed:', e);
    return null;
  }
}

/** 지정된 slug 목록의 last_api_sync를 현재 시각으로 업데이트 */
export async function updateLastApiSync(slugs: string[]): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || slugs.length === 0) return false;

  try {
    const { error } = await sb
      .from('programs')
      .update({ last_api_sync: new Date().toISOString() })
      .in('slug', slugs);

    if (error) {
      console.warn('[supabase] updateLastApiSync error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] updateLastApiSync failed:', e);
    return false;
  }
}

// ── 지원서 Upsert ─────────────────────────────────

export async function upsertApplication(app: {
  programSlug: string;
  draftSections?: Record<string, unknown>;
  sectionSchema?: Record<string, unknown>;
  review?: Record<string, unknown>;
  consistency?: Record<string, unknown>;
  status?: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('applications')
      .upsert({
        program_slug: app.programSlug,
        draft_sections: app.draftSections || {},
        section_schema: app.sectionSchema || null,
        review: app.review || null,
        consistency: app.consistency || null,
        status: app.status || 'draft',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'program_slug' });

    if (error) {
      console.warn('[supabase] upsertApplication error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] upsertApplication failed:', e);
    return false;
  }
}
