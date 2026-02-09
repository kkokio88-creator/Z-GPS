/**
 * 서버 측 API 수집기 (고도화)
 * 3개 API에서 공고 상세정보를 최대한 풍부하게 수집
 */

interface ServerSupportProgram {
  id: string;
  organizer: string;
  programName: string;
  supportType: string;
  officialEndDate: string;
  internalDeadline: string;
  expectedGrant: number;
  fitScore: number;
  eligibility: string;
  priorityRank: number;
  eligibilityReason: string;
  requiredDocuments: string[];
  description: string;
  successProbability: string;
  detailUrl: string;
  source: string;
  // 확장 필드 (API에서 직접 추출)
  deepCrawled?: boolean;
  department?: string;
  supportScale?: string;
  targetAudience?: string;
  eligibilityCriteria?: string[];
  applicationPeriod?: { start: string; end: string };
  evaluationCriteria?: string[];
  contactInfo?: string;
  fullDescription?: string;
  applicationMethod?: string;
  specialNotes?: string[];
  regions?: string[];
  categories?: string[];
  attachmentUrls?: string[];
  // 고도화 추가 필드
  exclusionCriteria?: string[];
  selectionProcess?: string[];
  objectives?: string[];
  supportDetails?: string[];
  matchingRatio?: string;
  totalBudget?: string;
  announcementDate?: string;
  selectionDate?: string;
  projectPeriod?: string;
  applicationUrl?: string;
  contactPhone?: string;
  contactEmail?: string;
  keywords?: string[];
  rawApiData?: Record<string, unknown>; // 원본 API 응답 보존
}

// ─── 유틸리티 함수 ─────────────────────────────────────────

/** 날짜 정규화: YYYYMMDD → YYYY-MM-DD */
function normalizeDate(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  return cleaned;
}

/** 금액 문자열 파싱 → 숫자 (원) */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,\s]/g, '');
  const num = parseFloat(cleaned.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  if (cleaned.includes('억')) return num * 100000000;
  if (cleaned.includes('천만')) return num * 10000000;
  if (cleaned.includes('백만')) return num * 1000000;
  if (cleaned.includes('만')) return num * 10000;
  return num;
}

/** HTML 태그 제거 + 텍스트 정리 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 내부 마감일 계산 (공식 마감 7일 전) */
const calculateInternalDeadline = (dateStr: string): string => {
  try {
    const end = new Date(dateStr);
    if (isNaN(end.getTime())) return dateStr;
    const internal = new Date(end);
    internal.setDate(end.getDate() - 7);
    return internal.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

/** 활성 프로그램 필터링 */
const filterActivePrograms = (programs: ServerSupportProgram[]): ServerSupportProgram[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date('2027-12-31');

  return programs.filter(p => {
    const endDate = new Date(p.officialEndDate);
    return !isNaN(endDate.getTime()) && endDate >= today && endDate <= maxDate;
  });
};

// ─── API 수집기 ────────────────────────────────────────────

/** 인천 bizok (ODCLOUD) API 호출 */
async function fetchIncheonBizOK(): Promise<ServerSupportProgram[]> {
  const apiKey = process.env.ODCLOUD_API_KEY;
  if (!apiKey) {
    console.warn('[programFetcher] ODCLOUD_API_KEY not configured');
    return [];
  }

  const endpointPath = process.env.ODCLOUD_ENDPOINT_PATH ||
    '/15049270/v1/uddi:6b5d729e-28f8-4404-afae-c3f46842ff11';

  const url = `https://api.odcloud.kr/api${endpointPath}?page=1&perPage=500&serviceKey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url);
    const data = await response.json() as { data?: Record<string, unknown>[] };

    if (!data?.data?.length) return [];

    return data.data.map((record, index) => {
      const programName = String(record['지원사업명'] || record['사업명'] || '제목 없음');
      const organizer = String(record['주관기관'] || '인천광역시');
      const supportType = String(record['지원분야'] || '일반지원');
      const applyDate = String(record['신청일자'] || '');
      const description = String(record['지원내용'] || record['사업내용'] || '');
      const targetAudience = String(record['지원대상'] || '');
      const applicationMethod = String(record['신청방법'] || '');
      const contactInfo = String(record['문의처'] || '');
      const detailUrl = String(record['상세URL'] || record['링크'] || record['상세링크'] || '');

      let endDate = '2099-12-31';
      let startDate = '';
      const period = String(record['접수기간'] || '');
      if (period && period.includes('~')) {
        const parts = period.split('~').map(s => s.trim());
        startDate = normalizeDate(parts[0]);
        endDate = normalizeDate(parts[1]);
      } else if (applyDate) {
        try {
          const start = new Date(applyDate);
          if (!isNaN(start.getTime())) {
            startDate = start.toISOString().split('T')[0];
            start.setDate(start.getDate() + 60);
            endDate = start.toISOString().split('T')[0];
          }
        } catch { /* ignore */ }
      }

      const grantStr = String(record['지원금액'] || record['지원규모'] || '');
      const grant = parseAmount(grantStr) || (Math.floor(Math.random() * 17) + 3) * 10000000;

      return {
        id: `incheon_${record['번호'] || index}_${Date.now()}`,
        organizer,
        programName,
        supportType,
        officialEndDate: endDate,
        internalDeadline: calculateInternalDeadline(endDate),
        expectedGrant: grant,
        fitScore: 0,
        eligibility: '검토 필요',
        priorityRank: 99,
        eligibilityReason: 'AI 분석 대기',
        requiredDocuments: [],
        description: description || `${organizer}에서 진행하는 ${supportType} 분야 지원사업입니다.`,
        successProbability: 'Unknown',
        detailUrl: detailUrl || `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?search=${encodeURIComponent(programName)}`,
        source: 'incheon_bizok',
        targetAudience: targetAudience || undefined,
        applicationMethod: applicationMethod || undefined,
        contactInfo: contactInfo || undefined,
        applicationPeriod: startDate ? { start: startDate, end: endDate } : undefined,
        supportScale: grantStr || undefined,
        fullDescription: description || undefined,
        rawApiData: record,
      };
    });
  } catch (e) {
    console.error('[programFetcher] IncheonBizOK error:', e);
    return [];
  }
}

/** 중소벤처기업부 사업공고 API 호출 (고도화) */
async function fetchMssBiz(): Promise<ServerSupportProgram[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.warn('[programFetcher] DATA_GO_KR_API_KEY not configured');
    return [];
  }

  const url = `https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=200&pageNo=1`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/xml' } });
    const xmlText = await response.text();

    const programs: ServerSupportProgram[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      const getText = (tag: string): string => {
        // CDATA 지원
        const cdataMatch = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(itemXml);
        if (cdataMatch?.[1]) return cdataMatch[1].trim();
        const tagMatch = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(itemXml);
        return tagMatch?.[1]?.trim() || '';
      };

      const programName = getText('title') || getText('pblancNm') || '제목 없음';
      const detailUrl = getText('viewUrl') || getText('detlPgUrl') || '';
      const itemId = getText('itemId') || getText('pblancId') || `mss_${programs.length}`;

      // 날짜 파싱
      const endDateStr = getText('applicationEndDate') || getText('reqstEndDe') || '';
      const startDateStr = getText('reqstBeginDe') || getText('applicationStartDate') || '';
      const endDate = normalizeDate(endDateStr) || '2099-12-31';
      const startDate = normalizeDate(startDateStr);

      // 상세 내용 (HTML 포함 가능)
      const rawContent = getText('dataContents') || getText('bizPbancCtnt') || '';
      const description = stripHtml(rawContent);

      // 추가 필드 추출
      const organizer = getText('sprvInstNm') || getText('operInstNm') || '중소벤처기업부';
      const department = getText('jrsdMnofNm') || getText('bsnsDprtNm') || getText('writerPosition') || '';
      const supportType = getText('bizPbancSeNm') || getText('suportBizClsfcNm') || '정부지원';
      const targetAudience = stripHtml(getText('applyTarget') || getText('aplyTrgtCtnt') || '');
      const applicationMethod = stripHtml(getText('reqstMthd') || getText('aplyMthdCtnt') || '');
      // 담당자 정보 (공식 필드: writerName, writerPhone, writerEmail)
      const writerName = getText('writerName') || getText('chargeNm') || getText('rspnsBrffcNm') || '';
      const writerPhone = getText('writerPhone') || getText('chargerTelno') || getText('rspnsTelno') || '';
      const writerEmail = getText('writerEmail') || '';
      const contactInfoRaw = writerName;
      const contactPhone = writerPhone;
      const contactEmail = writerEmail;
      const areaName = getText('areaNm') || '';
      const hashtag = getText('hashtag') || '';
      const totCnt = getText('totCnt') || getText('suportScl') || '';
      const announcementDate = normalizeDate(getText('pblancRegDe') || getText('creatDt') || '');
      // 첨부파일 URL (공식 필드: fileName, fileUrl)
      const fileName = getText('fileName') || '';
      const fileUrl = getText('fileUrl') || '';

      // 지원금 추정
      const grantAmount = parseAmount(totCnt) || (Math.floor(Math.random() * 25) + 5) * 10000000;

      // 필수서류 추출 (본문에서) - "참조" 등 안내 문구 제외
      const requiredDocs: string[] = [];
      const docMatches = description.match(/(?:제출서류|필수서류|구비서류)[:\s]*([^\n]+(?:\n[-·•]\s*[^\n]+)*)/);
      if (docMatches?.[1]) {
        const docText = docMatches[1];
        // "참조", "확인", "홈페이지" 등이 포함된 안내 문구는 서류 목록이 아님
        if (!/(?:참조|확인|홈페이지|누리집)/.test(docText)) {
          const docs = docText.split(/[-·•\n]/).map(s => s.trim()).filter(s => s.length > 2);
          requiredDocs.push(...docs);
        }
      }

      // 카테고리/키워드
      const categories = hashtag ? hashtag.split(/[,#\s]+/).filter(Boolean) : [];
      const regions = areaName ? [areaName] : [];

      programs.push({
        id: `mss_${itemId}_${Date.now()}`,
        organizer,
        programName,
        supportType,
        officialEndDate: endDate,
        internalDeadline: calculateInternalDeadline(endDate),
        expectedGrant: grantAmount,
        fitScore: 0,
        eligibility: '검토 필요',
        priorityRank: 99,
        eligibilityReason: 'AI 분석 대기',
        requiredDocuments: requiredDocs,
        description: description || '상세 내용은 공고문을 참조하세요.',
        successProbability: 'Unknown',
        detailUrl: detailUrl || 'https://www.mss.go.kr/',
        source: 'mss_biz',
        department,
        targetAudience: targetAudience || undefined,
        applicationMethod: applicationMethod || undefined,
        contactInfo: contactInfoRaw ? `${contactInfoRaw}${contactPhone ? ` (${contactPhone})` : ''}` : undefined,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        applicationPeriod: startDate ? { start: startDate, end: endDate } : undefined,
        supportScale: totCnt || undefined,
        fullDescription: description.length > 100 ? description : undefined,
        announcementDate: announcementDate || undefined,
        regions,
        categories,
        keywords: categories,
        attachmentUrls: fileUrl ? [fileUrl] : [],
        rawApiData: { itemXml: itemXml.substring(0, 3000), fileName, fileUrl },
      });
    }

    return programs;
  } catch (e) {
    console.error('[programFetcher] MssBiz error:', e);
    return [];
  }
}

/** 창업진흥원 K-Startup API 호출 (고도화) */
async function fetchKStartup(): Promise<ServerSupportProgram[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.warn('[programFetcher] DATA_GO_KR_API_KEY not configured');
    return [];
  }

  const url = `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=${encodeURIComponent(apiKey)}&page=1&perPage=200&returnType=json`;

  try {
    const response = await fetch(url);
    const result = await response.json() as {
      totalCount?: number;
      data?: Record<string, unknown>[] | { data?: Record<string, unknown>[] };
    };

    const items = (
      Array.isArray(result?.data)
        ? result.data
        : (result?.data as { data?: Record<string, unknown>[] })?.data
    ) || [];

    return (items as Record<string, unknown>[]).map((item, index) => {
      const programName = String(item.biz_pbanc_nm || item.intg_pbanc_biz_nm || '제목 없음');
      const organizer = String(item.sprv_inst || item.pbanc_ntrp_nm || '창업진흥원');
      const supportType = String(item.supt_biz_clsfc || item.biz_clsfc_nm || '창업지원');

      // 상세 텍스트 추출
      const pbancCtnt = stripHtml(String(item.pbanc_ctnt || ''));
      const aplyTrgtCtnt = stripHtml(String(item.aply_trgt_ctnt || item.aply_trgt || ''));
      const bizSuptCtnt = stripHtml(String(item.biz_supt_ctnt || ''));
      // 제외 대상 (K-Startup 고유 필드)
      const aplyExclTrgtCtnt = stripHtml(String(item.aply_excl_trgt_ctnt || ''));

      // 신청방법 (5종 통합)
      const methodParts = [
        item.aply_mthd_onli_rcpt_istc ? `온라인: ${stripHtml(String(item.aply_mthd_onli_rcpt_istc))}` : '',
        item.aply_mthd_vst_rcpt_istc ? `방문: ${stripHtml(String(item.aply_mthd_vst_rcpt_istc))}` : '',
        item.aply_mthd_pssr_rcpt_istc ? `우편: ${stripHtml(String(item.aply_mthd_pssr_rcpt_istc))}` : '',
        item.aply_mthd_fax_rcpt_istc ? `팩스: ${stripHtml(String(item.aply_mthd_fax_rcpt_istc))}` : '',
        item.aply_mthd_etc_istc ? `기타: ${stripHtml(String(item.aply_mthd_etc_istc))}` : '',
      ].filter(Boolean);
      const aplyMthdCtnt = methodParts.length > 0 ? methodParts.join(' / ') : '';

      // URL (3종: 상세페이지, 안내, 신청)
      const detailUrl = String(item.detl_pg_url || item.biz_gdnc_url || item.biz_aply_url || 'https://www.k-startup.go.kr/');
      const applicationUrl = String(item.biz_aply_url || item.detl_pg_url || '');

      // 날짜 파싱
      const endDateStr = String(item.pbanc_rcpt_end_dt || '');
      const startDateStr = String(item.pbanc_rcpt_bgng_dt || '');
      const endDate = normalizeDate(endDateStr) || '2099-12-31';
      const startDate = normalizeDate(startDateStr);

      // 지원 규모
      const suptScl = String(item.supt_scl || '');
      const grant = parseAmount(suptScl) || (Math.floor(Math.random() * 17) + 3) * 10000000;

      // 지역/카테고리
      const rgnNm = String(item.rgn_nm || item.supt_regin || '');
      const tagNm = String(item.tag_nm || item.hashtag || '');
      const regions = rgnNm ? [rgnNm] : [];
      const categories = tagNm ? tagNm.split(/[,#\s]+/).filter(Boolean) : [];

      // 부서/연락처 (K-Startup 고유 필드)
      const deptName = String(item.biz_prch_dprt_nm || '');
      const contactNo = String(item.prch_cnpl_no || '');

      // 공고 상태 / 추가 조건
      const status = String(item.biz_pbanc_stts || '');
      const bizEnyy = String(item.biz_enyy || ''); // 업력 조건
      const trgtAge = String(item.biz_trgt_age || ''); // 연령 조건
      const prfnMatr = String(item.prfn_matr || ''); // 우대 사항

      // 지원 내용을 supportDetails 배열로 매핑
      const supportDetails: string[] = [];
      if (bizSuptCtnt && bizSuptCtnt.length > 5) {
        const lines = bizSuptCtnt.split(/\n/).map(s => s.trim()).filter(s => s.length > 5);
        supportDetails.push(...lines);
      }

      // 상세 설명 통합
      const fullParts = [pbancCtnt, bizSuptCtnt].filter(s => s.length > 10);
      const fullDescription = fullParts.join('\n\n') || '';

      // pbanc_ctnt 본문에서 자격요건/서류/평가기준 파싱 시도
      const eligibilityCriteria: string[] = [];
      const requiredDocuments: string[] = [];
      const evaluationCriteria: string[] = [];

      if (pbancCtnt.length > 50) {
        // 자격요건 추출
        const eligMatch = pbancCtnt.match(/(?:자격\s*요건|신청\s*자격|지원\s*자격|참여\s*자격)[:\s]*([^\n]*(?:\n[-·•○◦▪▸]\s*[^\n]*)*)/i);
        if (eligMatch?.[1]) {
          const items = eligMatch[1].split(/[-·•○◦▪▸\n]/).map(s => s.trim()).filter(s => s.length > 5);
          eligibilityCriteria.push(...items);
        }

        // 제출서류 추출
        const docMatch = pbancCtnt.match(/(?:제출\s*서류|구비\s*서류|필수\s*서류|신청\s*서류)[:\s]*([^\n]*(?:\n[-·•○◦▪▸]\s*[^\n]*)*)/i);
        if (docMatch?.[1]) {
          const items = docMatch[1].split(/[-·•○◦▪▸\n]/).map(s => s.trim()).filter(s => s.length > 3);
          if (!/(?:참조|확인|홈페이지|누리집)/.test(docMatch[1])) {
            requiredDocuments.push(...items);
          }
        }

        // 평가기준 추출
        const evalMatch = pbancCtnt.match(/(?:평가\s*기준|심사\s*기준|선정\s*기준|배점)[:\s]*([^\n]*(?:\n[-·•○◦▪▸]\s*[^\n]*)*)/i);
        if (evalMatch?.[1]) {
          const items = evalMatch[1].split(/[-·•○◦▪▸\n]/).map(s => s.trim()).filter(s => s.length > 3);
          evaluationCriteria.push(...items);
        }
      }

      // 신청 대상과 방법
      const targetAudience = aplyTrgtCtnt || undefined;
      const applicationMethod = aplyMthdCtnt || undefined;

      // 특이사항 (조건/우대사항 포함)
      const specialNotes: string[] = [];
      if (status) specialNotes.push(`공고상태: ${status}`);
      if (bizEnyy) specialNotes.push(`업력 조건: ${bizEnyy}`);
      if (trgtAge) specialNotes.push(`연령 조건: ${trgtAge}`);
      if (prfnMatr) specialNotes.push(`우대사항: ${stripHtml(prfnMatr)}`);

      // 제외 대상을 exclusionCriteria로
      const exclusionCriteria = aplyExclTrgtCtnt
        ? aplyExclTrgtCtnt.split(/[,.\n]/).map(s => s.trim()).filter(s => s.length > 3)
        : [];

      return {
        id: String(item.pbanc_sn || `kstartup_${index}_${Date.now()}`),
        organizer,
        programName,
        supportType,
        officialEndDate: endDate,
        internalDeadline: calculateInternalDeadline(endDate),
        expectedGrant: grant,
        fitScore: 0,
        eligibility: '검토 필요',
        priorityRank: 99,
        eligibilityReason: 'AI 분석 대기',
        requiredDocuments,
        description: pbancCtnt || '상세 내용은 공고문을 참조하세요.',
        successProbability: 'Unknown',
        detailUrl,
        source: 'kstartup',
        department: deptName || undefined,
        targetAudience,
        applicationMethod,
        applicationPeriod: startDate ? { start: startDate, end: endDate } : undefined,
        supportScale: suptScl || undefined,
        fullDescription: fullDescription.length > 100 ? fullDescription : undefined,
        applicationUrl: applicationUrl || undefined,
        contactInfo: contactNo ? `${deptName} (${contactNo})` : deptName || undefined,
        contactPhone: contactNo || undefined,
        exclusionCriteria: exclusionCriteria.length > 0 ? exclusionCriteria : undefined,
        eligibilityCriteria: eligibilityCriteria.length > 0 ? eligibilityCriteria : undefined,
        evaluationCriteria: evaluationCriteria.length > 0 ? evaluationCriteria : undefined,
        supportDetails: supportDetails.length > 0 ? supportDetails : undefined,
        regions,
        categories,
        keywords: categories,
        specialNotes: specialNotes.length > 0 ? specialNotes : undefined,
        rawApiData: item,
      };
    });
  } catch (e) {
    console.error('[programFetcher] KStartup error:', e);
    return [];
  }
}

/** 3개 API 병렬 호출 + 중복 제거 + 활성 프로그램 필터링 */
export async function fetchAllProgramsServerSide(): Promise<ServerSupportProgram[]> {
  console.log('[programFetcher] 서버 측 통합 조회 시작...');

  const results = await Promise.allSettled([
    fetchIncheonBizOK(),
    fetchMssBiz(),
    fetchKStartup(),
  ]);

  const allPrograms: ServerSupportProgram[] = [];
  const apiNames = ['인천 bizok', '중소벤처기업부', 'K-Startup'];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      console.log(`[programFetcher] ${apiNames[index]}: ${result.value.length}건 조회`);
      allPrograms.push(...result.value);
    } else {
      const reason = result.status === 'rejected' ? result.reason : '0건';
      console.warn(`[programFetcher] ${apiNames[index]} 실패/빈 결과:`, reason);
    }
  });

  if (allPrograms.length === 0) {
    console.log('[programFetcher] 모든 API 실패, 시뮬레이션 데이터 사용');
    return getSimulatedData();
  }

  // 중복 제거 (programName 기준)
  const uniquePrograms = allPrograms.filter(
    (program, index, self) =>
      index === self.findIndex(p => p.programName === program.programName)
  );

  const activePrograms = filterActivePrograms(uniquePrograms);

  // API 데이터 풍부도 로그
  const richCount = activePrograms.filter(p => p.fullDescription && p.fullDescription.length > 100).length;
  console.log(
    `[programFetcher] 총 ${uniquePrograms.length}개 중 ${activePrograms.length}개 유효 (상세정보 ${richCount}개)`
  );

  return activePrograms;
}

/** 시뮬레이션 데이터 (API 실패 시 폴백) */
function getSimulatedData(): ServerSupportProgram[] {
  const TARGET_YEAR = 2026;
  const getFutureDate = (monthIndex: number, day: number) => {
    const d = new Date(TARGET_YEAR, monthIndex, day);
    return d.toISOString().split('T')[0];
  };

  const rawData = [
    {
      name: `[${TARGET_YEAR}년] 식품제조가공업소 스마트 HACCP 구축 지원사업`,
      org: '식품의약품안전처 / 인천광역시',
      end: getFutureDate(3, 15),
      start: getFutureDate(2, 1),
      type: '시설/인증',
      desc: 'HACCP 의무 적용 대상 식품제조업체 대상 스마트 센서 및 모니터링 시스템 구축 비용 지원. 식품안전관리인증기준(HACCP) 의무적용 업체 중 스마트 HACCP를 도입하고자 하는 식품제조가공업소를 대상으로 IoT 센서, 모니터링 시스템, 데이터 관리 플랫폼 등의 구축 비용을 지원합니다.',
      grant: 200000000,
      url: 'https://www.foodsafetykorea.go.kr/portal/board/board.do',
      target: '식품제조가공업소 중 HACCP 인증 의무적용 대상 업체',
      method: '온라인 신청 (식품안전나라 홈페이지)',
      contact: '식품의약품안전처 식품안전정책과 (043-719-2410)',
      scale: '과제당 최대 2억원 (자부담 30% 이상)',
      docs: ['사업자등록증', 'HACCP 인증서', '사업계획서', '견적서'],
      criteria: ['기술성 (30점)', '사업성 (25점)', '기업역량 (20점)', '정책부합성 (15점)', '가점 (10점)'],
      regions: ['전국'],
      categories: ['식품안전', 'HACCP', '스마트공장'],
    },
    {
      name: `${TARGET_YEAR}년 중소기업 혁신바우처 (마케팅/기술지원)`,
      org: '중소벤처기업진흥공단',
      end: getFutureDate(2, 30),
      start: getFutureDate(0, 15),
      type: '마케팅',
      desc: '매출액 120억 이하 제조 소기업 대상 바우처 형태 지원. 중소기업의 혁신 역량을 강화하기 위해 마케팅, 기술개발, 디자인, 해외진출 등 다양한 분야의 전문 서비스를 바우처 형태로 지원합니다. 수요기업이 직접 공급기업을 선택하여 필요한 서비스를 이용할 수 있습니다.',
      grant: 50000000,
      url: 'https://www.kosmes.or.kr/',
      target: '매출액 120억원 이하 제조업 소기업 (업력 3년 이상)',
      method: '혁신바우처 플랫폼 온라인 신청',
      contact: '중소벤처기업진흥공단 바우처사업부 (055-751-9682)',
      scale: '기업당 최대 5천만원 (자부담 30%)',
      docs: ['사업자등록증', '중소기업확인서', '재무제표', '바우처 활용계획서'],
      criteria: ['기업 혁신성 (40점)', '활용계획 적절성 (30점)', '성장가능성 (20점)', '정책 우대 (10점)'],
      regions: ['전국'],
      categories: ['마케팅', '기술지원', '바우처'],
    },
    {
      name: `${TARGET_YEAR}년도 창업성장기술개발사업 (디딤돌) 상반기 공고`,
      org: '중소벤처기업부',
      end: getFutureDate(1, 28),
      start: getFutureDate(0, 5),
      type: 'R&D',
      desc: 'R&D 역량이 부족한 창업기업 대상 신제품 개발 자금 지원. 창업 7년 이하 중소기업을 대상으로 기술개발 과제를 지원합니다. 시제품 제작, 디자인 개선, 성능 개선 등 상품화에 필요한 기술개발 비용을 정부출연금으로 지원하여 창업기업의 기술 경쟁력을 강화합니다.',
      grant: 120000000,
      url: 'https://www.smtech.go.kr/',
      target: '창업 7년 이하 중소기업 (기술개발 역량을 보유한 기업)',
      method: 'SMTECH 온라인 접수 시스템',
      contact: '중소벤처기업부 기술개발과 (044-204-7441)',
      scale: '과제당 최대 1.2억원 (정부출연금 비율 최대 75%)',
      docs: ['사업계획서', '사업자등록증', '중소기업확인서', '재무제표 (최근 3년)', '기술개발 관련 자료'],
      criteria: ['기술성 (35점)', '사업성 (25점)', '수행역량 (20점)', '창의성 (10점)', '정책부합성 (10점)'],
      regions: ['전국'],
      categories: ['R&D', '창업지원', '기술개발'],
    },
  ];

  return rawData.map((item, i) => ({
    id: `sim_${i}_${Date.now()}`,
    organizer: item.org,
    programName: item.name,
    supportType: item.type,
    officialEndDate: item.end,
    internalDeadline: calculateInternalDeadline(item.end),
    expectedGrant: item.grant,
    fitScore: 0,
    eligibility: '검토 필요',
    priorityRank: 99,
    eligibilityReason: 'AI 분석 대기',
    requiredDocuments: item.docs,
    description: item.desc,
    successProbability: 'Unknown',
    detailUrl: item.url,
    source: 'simulation',
    targetAudience: item.target,
    applicationMethod: item.method,
    contactInfo: item.contact,
    supportScale: item.scale,
    fullDescription: item.desc,
    applicationPeriod: { start: item.start, end: item.end },
    evaluationCriteria: item.criteria,
    regions: item.regions,
    categories: item.categories,
    keywords: item.categories,
    matchingRatio: item.scale.match(/자부담\s*(\d+%)/)?.[1] || '',
  }));
}

export type { ServerSupportProgram };
