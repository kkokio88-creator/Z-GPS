/**
 * 서버 측 API 수집기 (고도화)
 * 3개 API에서 공고 상세정보를 최대한 풍부하게 수집
 */
import { parseAmountFromScale } from '../utils/amountParser.js';

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

// ─── 지역 필터 ─────────────────────────────────────────────

/** 한국 17개 광역자치단체 매핑 */
const REGION_MAP: Record<string, string> = {
  '서울특별시': '서울', '서울시': '서울', '서울': '서울',
  '부산광역시': '부산', '부산시': '부산', '부산': '부산',
  '대구광역시': '대구', '대구시': '대구', '대구': '대구',
  '인천광역시': '인천', '인천시': '인천', '인천': '인천',
  '광주광역시': '광주', '광주시': '광주', '광주': '광주',
  '대전광역시': '대전', '대전시': '대전', '대전': '대전',
  '울산광역시': '울산', '울산시': '울산', '울산': '울산',
  '세종특별자치시': '세종', '세종시': '세종', '세종': '세종',
  '경기도': '경기', '경기': '경기',
  '강원특별자치도': '강원', '강원도': '강원', '강원': '강원',
  '충청북도': '충북', '충북': '충북',
  '충청남도': '충남', '충남': '충남',
  '전북특별자치도': '전북', '전라북도': '전북', '전북': '전북',
  '전라남도': '전남', '전남': '전남',
  '경상북도': '경북', '경북': '경북',
  '경상남도': '경남', '경남': '경남',
  '제주특별자치도': '제주', '제주도': '제주', '제주': '제주',
};

/** 시/구 → 광역시/도 매핑 (프로그램명에서 지역 감지용) */
const CITY_TO_REGION: Record<string, string> = {
  // 서울 자치구
  '강남구': '서울', '강동구': '서울', '강북구': '서울', '강서구': '서울',
  '관악구': '서울', '광진구': '서울', '구로구': '서울', '금천구': '서울',
  '노원구': '서울', '도봉구': '서울', '동대문구': '서울', '동작구': '서울',
  '마포구': '서울', '서대문구': '서울', '서초구': '서울', '성동구': '서울',
  '성북구': '서울', '송파구': '서울', '양천구': '서울', '영등포구': '서울',
  '용산구': '서울', '은평구': '서울', '종로구': '서울', '중랑구': '서울',
  // 경기 시
  '수원시': '경기', '성남시': '경기', '과천시': '경기', '양주시': '경기',
  '군포시': '경기', '부천시': '경기', '고양시': '경기', '안양시': '경기',
  '안산시': '경기', '용인시': '경기', '화성시': '경기', '평택시': '경기',
  '파주시': '경기', '광명시': '경기', '시흥시': '경기', '하남시': '경기',
  // 부산 자치구
  '해운대구': '부산', '해운대': '부산', '사하구': '부산',
  // 대구 자치구
  '수성구': '대구', '달서구': '대구',
  // 대전 자치구
  '유성구': '대전', '대덕구': '대전',
  // 경북 시
  '구미시': '경북', '구미': '경북', '포항시': '경북', '경주시': '경북',
  // 경남 시
  '김해시': '경남', '김해': '경남', '창원시': '경남', '거제시': '경남',
  // 전북 시
  '전주시': '전북', '전주': '전북', '군산시': '전북', '익산시': '전북',
  // 충남 시
  '천안시': '충남', '아산시': '충남',
  // 충북 시
  '청주시': '충북', '충주시': '충북',
};

/** 주소에서 시/도 수준 지역 추출 */
function extractRegionFromAddress(address: string): string {
  if (!address) return '';
  const trimmed = address.trim();
  for (const [pattern, region] of Object.entries(REGION_MAP)) {
    if (trimmed.startsWith(pattern) || trimmed.includes(pattern)) {
      return region;
    }
  }
  return '';
}

/** 프로그램명/주관기관에서 지역 키워드 감지 */
function detectRegionFromName(programName: string): string {
  // 광역시/도 직접 매칭 (서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주)
  const regionNames = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  for (const r of regionNames) {
    if (programName.includes(r)) return r;
  }
  // 시/구 수준 매칭
  for (const [city, region] of Object.entries(CITY_TO_REGION)) {
    if (programName.includes(city)) return region;
  }
  return '';
}

/** 지역 기반 필터링: 회사 지역과 공고 대상 지역 매칭 */
function filterByRegion(
  programs: ServerSupportProgram[],
  companyRegion: string
): { filtered: ServerSupportProgram[]; removedCount: number } {
  if (!companyRegion) {
    return { filtered: programs, removedCount: 0 };
  }

  const before = programs.length;
  const filtered = programs.filter(p => {
    const regions = p.regions || [];

    // 1. regions 필드에 데이터가 있으면 사용
    if (regions.length > 0) {
      if (regions.some(r => r === '전국' || r === '전체' || r === '해당없음')) return true;
      return regions.some(r => {
        const normalized = REGION_MAP[r] || r;
        return normalized === companyRegion;
      });
    }

    // 2. regions가 비어있으면 프로그램명에서 지역 감지
    const nameRegion = detectRegionFromName(p.programName);
    if (nameRegion && nameRegion !== companyRegion) {
      return false; // 다른 지역 프로그램이므로 제외
    }

    // 3. 지역 정보 없음 → 전국으로 간주
    return true;
  });

  return { filtered, removedCount: before - filtered.length };
}

// ─── 창업 필터 ─────────────────────────────────────────────

/** 사업명 기준 hard exclude 패턴 (Tier 1) */
const STARTUP_EXCLUDE_PATTERNS = [
  /예비\s*창업/,
  /초기\s*창업/,
  /창업\s*도약/,
  /청년\s*창업/,
  /스타트\s*업/i,
  /start[\s-]*up/i,
  /창업\s*사관\s*학교/,
  /창업\s*보육/,
  /엑셀러레이팅/,
  /액셀러레이팅/,
  /엑셀러레이터/,
  /액셀러레이터/,
  /창업\s*인큐베이팅/,
  /창업\s*캠프/,
  /창업\s*경진/,
  /창업\s*아이디어/,
  /창업\s*교육/,
  /예비\s*?창업자/,
  // Phase 2 추가: 더 많은 창업 생태계 패턴
  /창업\s*패키지/,
  /창업\s*지원\s*센터/,
  /창업\s*지원\s*사업/,
  /창업\s*허브/,
  /창업\s*혁신\s*공간/,
  /창업\s*마루/,
  /창업\s*아카데미/,
  /창업\s*스쿨/,
  /창업\s*멘토링/,
  /창업\s*성공\s*패키지/,
  /창업\s*부트\s*캠프/,
  /로컬\s*창업/,
  /모의\s*창업/,
  /1인\s*창조\s*기업/,
  /여성\s*(?:예비\s*)?창업/,
  /재도전\s*사관학교/,
  /창업\s*융합/,
  /벤처\s*포럼/,
  /벤처\s*스튜디오/,
  /IR\s*피칭/i,
  /팁스\s*타운/,
  /\bTIPS\b/,
  /팁스\s*(?:프로그램|사업)/,
  /입교\s*(?:생|기업)/,
  /창업BuS/i,
];

/** 기존 기업 대상임을 나타내는 지표 */
const EXISTING_BIZ_INDICATORS = [
  /기창업\s*기업/,
  /창업\s*3년\s*이상/,
  /창업\s*5년\s*이상/,
  /창업\s*7년\s*이상/,
  /기존\s*기업/,
  /중소기업/,
  /중견기업/,
  /소상공인/,
  /제조업/,
  /제조\s*기업/,
];

/** 스타트업 전용 공고를 나타내는 지표 (Tier 2) */
const STARTUP_ONLY_INDICATORS = [
  /창업\s*3년\s*이내/,
  /창업\s*2년\s*이내/,
  /창업\s*1년\s*이내/,
  /예비\s*?창업자/,
  /창업\s*준비/,
  /창업\s*희망/,
  /창업을\s*준비/,
];

/** 창업 관련 공고 필터링 */
function filterStartupPrograms(
  programs: ServerSupportProgram[]
): { filtered: ServerSupportProgram[]; removedCount: number } {
  const before = programs.length;

  const filtered = programs.filter(p => {
    const name = p.programName;

    // Tier 1: 사업명에 확실한 창업 전용 키워드가 있으면 제외
    const isHardExclude = STARTUP_EXCLUDE_PATTERNS.some(pattern => pattern.test(name));

    if (isHardExclude) {
      // 단, 사업명에 "창업"이 있더라도 본문에서 기존 기업 대상 지표가 있으면 유지
      const fullText = `${name} ${p.description || ''} ${p.targetAudience || ''}`;
      const hasExistingBizIndicator = EXISTING_BIZ_INDICATORS.some(pattern =>
        pattern.test(fullText)
      );
      if (hasExistingBizIndicator) {
        return true; // 기존 기업 대상이므로 유지
      }
      return false; // 창업 전용이므로 제외
    }

    // Tier 2: 사업명에 "창업"이 포함되어 있으면 context-aware 판단
    if (/창업/.test(name)) {
      const fullText = `${name} ${p.description || ''} ${p.targetAudience || ''}`;
      const hasExistingBizIndicator = EXISTING_BIZ_INDICATORS.some(pattern =>
        pattern.test(fullText)
      );
      const hasStartupOnlyIndicator = STARTUP_ONLY_INDICATORS.some(pattern =>
        pattern.test(fullText)
      );

      // 기존기업 지표가 있으면 유지
      if (hasExistingBizIndicator) return true;
      // 스타트업 전용 지표가 있으면 제외
      if (hasStartupOnlyIndicator) return false;
      // "창업"이 있으나 기존기업 지표도 없으면 제외 (보수적 접근)
      return false;
    }

    // "창업" 키워드 없으면 유지
    return true;
  });

  return { filtered, removedCount: before - filtered.length };
}

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
      const grant = parseAmountFromScale(grantStr);

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
      const supportScaleText = getText('suportScl') || getText('totCnt') || '';
      const announcementDate = normalizeDate(getText('pblancRegDe') || getText('creatDt') || '');
      // 첨부파일 URL (공식 필드: fileName, fileUrl)
      const fileName = getText('fileName') || '';
      const fileUrl = getText('fileUrl') || '';

      // 지원금 파싱 (확인 불가 시 0)
      const grantAmount = parseAmountFromScale(supportScaleText);

      // 필수서류 추출 (본문에서) - "참조" 등 안내 문구 제외
      const requiredDocs: string[] = [];
      const docMatches = description.match(/(?:제출\s*서류|필수\s*서류|구비\s*서류|신청\s*서류|첨부\s*서류|제출서류\s*목록)[:\s]*([^\n]+(?:\n[-·•○◦▪▸►◈①②③④⑤⑥⑦⑧⑨⑩가나다라]\s*[^\n]+)*)/);
      if (docMatches?.[1]) {
        const docText = docMatches[1];
        // "참조", "확인", "홈페이지" 등이 포함된 안내 문구는 서류 목록이 아님
        if (!/(?:참조|확인|홈페이지|누리집)/.test(docText)) {
          const docs = docText.split(/[-·•○◦▪▸►◈\n]/).map(s => s.trim()).filter(s => s.length > 2);
          requiredDocs.push(...docs);
        }
      }

      // 자격요건 추출 (MSS)
      const mssEligCriteria: string[] = [];
      const mssEligMatch = description.match(/(?:지원\s*대상|신청\s*자격|참여\s*자격|자격\s*요건|지원\s*자격)[:\s]*([^\n]*(?:\n[-·•○◦▪▸►◈①②③]\s*[^\n]*)*)/i);
      if (mssEligMatch?.[1]) {
        const items = mssEligMatch[1].split(/[-·•○◦▪▸►◈\n]/).map(s => s.trim()).filter(s => s.length > 5);
        mssEligCriteria.push(...items);
      }

      // 평가기준 추출 (MSS)
      const mssEvalCriteria: string[] = [];
      const mssEvalMatch = description.match(/(?:평가\s*기준|심사\s*기준|선정\s*기준|배점\s*기준|심사\s*항목)[:\s]*([^\n]*(?:\n[-·•○◦▪▸►◈①②③]\s*[^\n]*)*)/i);
      if (mssEvalMatch?.[1]) {
        const items = mssEvalMatch[1].split(/[-·•○◦▪▸►◈\n]/).map(s => s.trim()).filter(s => s.length > 3);
        mssEvalCriteria.push(...items);
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
        supportScale: supportScaleText || undefined,
        fullDescription: description.length > 100 ? description : undefined,
        announcementDate: announcementDate || undefined,
        eligibilityCriteria: mssEligCriteria.length > 0 ? mssEligCriteria : undefined,
        evaluationCriteria: mssEvalCriteria.length > 0 ? mssEvalCriteria : undefined,
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
      const grant = parseAmountFromScale(suptScl);

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

      // 확장된 리스트 마커 패턴 (한국 공고문 다양한 마커)
      const LIST_SPLIT = /[-·•○◦▪▸►◈※①②③④⑤⑥⑦⑧⑨⑩\n]/;
      const selectionProcess: string[] = [];

      if (pbancCtnt.length > 50) {
        // 자격요건 추출 (확장된 헤더 변형)
        const eligMatch = pbancCtnt.match(
          /(?:자격\s*요건|신청\s*자격|지원\s*자격|참여\s*자격|참여\s*대상|지원\s*대상\s*자격|응모\s*자격|신청\s*대상)[:\s]*([^\n]*(?:\n(?:[ \t]*(?:[-·•○◦▪▸►◈※①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]\s*|[가-힣][.)]\s*)\s*[^\n]*))*)/i
        );
        if (eligMatch?.[1]) {
          const items = eligMatch[1].split(LIST_SPLIT).map(s => s.replace(/^\s*\d+[.)]\s*/, '').replace(/^[가-힣][.)]\s*/, '').trim()).filter(s => s.length > 5);
          eligibilityCriteria.push(...items);
        }

        // 제출서류 추출 (확장된 헤더 변형)
        const docMatch = pbancCtnt.match(
          /(?:제출\s*서류|구비\s*서류|필수\s*서류|신청\s*서류|첨부\s*서류|제출서류\s*목록|구비\s*서류\s*목록)[:\s]*([^\n]*(?:\n(?:[ \t]*(?:[-·•○◦▪▸►◈※①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]\s*|[가-힣][.)]\s*)\s*[^\n]*))*)/i
        );
        if (docMatch?.[1]) {
          if (!/(?:참조|확인|홈페이지|누리집)/.test(docMatch[1])) {
            const items = docMatch[1].split(LIST_SPLIT).map(s => s.replace(/^\s*\d+[.)]\s*/, '').replace(/^[가-힣][.)]\s*/, '').trim()).filter(s => s.length > 3);
            requiredDocuments.push(...items);
          }
        }

        // 평가기준 추출 (확장된 헤더 변형)
        const evalMatch = pbancCtnt.match(
          /(?:평가\s*기준|심사\s*기준|선정\s*기준|배점\s*기준|심사\s*항목|평가\s*항목|선정\s*방법)[:\s]*([^\n]*(?:\n(?:[ \t]*(?:[-·•○◦▪▸►◈※①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]\s*|[가-힣][.)]\s*)\s*[^\n]*))*)/i
        );
        if (evalMatch?.[1]) {
          const items = evalMatch[1].split(LIST_SPLIT).map(s => s.replace(/^\s*\d+[.)]\s*/, '').replace(/^[가-힣][.)]\s*/, '').trim()).filter(s => s.length > 3);
          evaluationCriteria.push(...items);
        }

        // 선정절차 추출 (신규)
        const selMatch = pbancCtnt.match(
          /(?:선정\s*절차|심사\s*절차|선발\s*절차|선정\s*과정|심사\s*과정)[:\s]*([^\n]*(?:\n(?:[ \t]*(?:[-·•○◦▪▸►◈※①②③④⑤⑥⑦⑧⑨⑩→▶]|\d+[.)]\s*)\s*[^\n]*))*)/i
        );
        if (selMatch?.[1]) {
          const items = selMatch[1].split(/[-·•○◦▪▸►◈→▶\n]/).map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(s => s.length > 3);
          selectionProcess.push(...items);
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
        selectionProcess: selectionProcess.length > 0 ? selectionProcess : undefined,
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

/** 필터링 통계 */
export interface FilterStats {
  totalFetched: number;
  afterDedup: number;
  afterActive: number;
  filteredByRegion: number;
  filteredByStartup: number;
  finalCount: number;
}

/** 3개 API 병렬 호출 + 중복 제거 + 활성 프로그램 + 지역/창업 필터링 */
export async function fetchAllProgramsServerSide(
  options?: { companyAddress?: string }
): Promise<{ programs: ServerSupportProgram[]; filterStats: FilterStats }> {
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
    const simData = getSimulatedData();
    return {
      programs: simData,
      filterStats: {
        totalFetched: 0,
        afterDedup: 0,
        afterActive: simData.length,
        filteredByRegion: 0,
        filteredByStartup: 0,
        finalCount: simData.length,
      },
    };
  }

  // 중복 제거 (programName 기준)
  const uniquePrograms = allPrograms.filter(
    (program, index, self) =>
      index === self.findIndex(p => p.programName === program.programName)
  );

  const activePrograms = filterActivePrograms(uniquePrograms);

  // 지역 필터
  const companyRegion = extractRegionFromAddress(options?.companyAddress || '');
  const regionResult = filterByRegion(activePrograms, companyRegion);

  // 창업 필터
  const startupResult = filterStartupPrograms(regionResult.filtered);

  const finalPrograms = startupResult.filtered;

  const filterStats: FilterStats = {
    totalFetched: allPrograms.length,
    afterDedup: uniquePrograms.length,
    afterActive: activePrograms.length,
    filteredByRegion: regionResult.removedCount,
    filteredByStartup: startupResult.removedCount,
    finalCount: finalPrograms.length,
  };

  // API 데이터 풍부도 로그
  const richCount = finalPrograms.filter(p => p.fullDescription && p.fullDescription.length > 100).length;
  console.log(
    `[programFetcher] 총 ${allPrograms.length}건 → 중복제거 ${uniquePrograms.length} → 활성 ${activePrograms.length} → 지역필터 -${regionResult.removedCount} → 창업필터 -${startupResult.removedCount} → 최종 ${finalPrograms.length}건 (상세정보 ${richCount}개)`
  );

  if (companyRegion) {
    console.log(`[programFetcher] 회사 지역: ${companyRegion}`);
  }

  return { programs: finalPrograms, filterStats };
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

/** 프로그램명 기준 창업 관련 여부 판단 (vault 클린업용) */
export function isLikelyStartupProgram(
  programName: string,
  description: string,
  targetAudience: string
): boolean {
  const name = programName || '';
  const fullText = `${name} ${description || ''} ${targetAudience || ''}`;

  // Tier 1: hard exclude
  if (STARTUP_EXCLUDE_PATTERNS.some(p => p.test(name))) {
    // 기존 기업 대상 지표가 있으면 유지
    if (EXISTING_BIZ_INDICATORS.some(p => p.test(fullText))) return false;
    return true;
  }

  // Tier 2: "창업" 포함
  if (/창업/.test(name)) {
    if (EXISTING_BIZ_INDICATORS.some(p => p.test(fullText))) return false;
    if (STARTUP_ONLY_INDICATORS.some(p => p.test(fullText))) return true;
    return true; // 창업 키워드 있으나 기존기업 지표 없으면 제외
  }

  return false;
}

/** 프로그램의 지역 불일치 판단 (vault 클린업용) */
export function isRegionMismatch(
  programName: string,
  regions: string[],
  companyRegion: string
): boolean {
  if (!companyRegion) return false;

  // regions 필드 체크
  if (regions && regions.length > 0) {
    if (regions.some(r => r === '전국' || r === '전체' || r === '해당없음')) return false;
    const matches = regions.some(r => (REGION_MAP[r] || r) === companyRegion);
    return !matches;
  }

  // 프로그램명에서 지역 감지
  const nameRegion = detectRegionFromName(programName);
  if (nameRegion && nameRegion !== companyRegion) return true;

  return false;
}

export { extractRegionFromAddress };
export type { ServerSupportProgram };
