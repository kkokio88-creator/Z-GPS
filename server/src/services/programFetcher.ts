/**
 * 서버 측 API 수집기
 * 프론트엔드 apiService.ts 로직을 서버에 이식
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
  // 딥크롤 확장 필드 (모두 optional)
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
}

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

const filterActivePrograms = (programs: ServerSupportProgram[]): ServerSupportProgram[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date('2027-12-31');

  return programs.filter(p => {
    const endDate = new Date(p.officialEndDate);
    return !isNaN(endDate.getTime()) && endDate >= today && endDate <= maxDate;
  });
};

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

      let endDate = '2099-12-31';
      if (applyDate) {
        try {
          const start = new Date(applyDate);
          if (!isNaN(start.getTime())) {
            start.setDate(start.getDate() + 60);
            endDate = start.toISOString().split('T')[0];
          }
        } catch { /* ignore */ }
      }

      const grant = (Math.floor(Math.random() * 17) + 3) * 10000000;

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
        description: `${organizer}에서 진행하는 ${supportType} 분야 지원사업입니다.`,
        successProbability: 'Unknown',
        detailUrl: `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?search=${encodeURIComponent(programName)}`,
        source: 'incheon_bizok',
      };
    });
  } catch (e) {
    console.error('[programFetcher] IncheonBizOK error:', e);
    return [];
  }
}

/** 중소벤처기업부 사업공고 API 호출 */
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

    // 서버 측 XML 파싱 (DOMParser 대신 정규식 사용)
    const programs: ServerSupportProgram[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      const getText = (tag: string): string => {
        const tagMatch = new RegExp(`<${tag}>(.*?)</${tag}>`).exec(itemXml);
        return tagMatch?.[1]?.trim() || '';
      };

      const programName = getText('title') || '제목 없음';
      const endDateStr = getText('applicationEndDate') || '';
      const detailUrl = getText('viewUrl') || '';
      const itemId = getText('itemId') || `mss_${programs.length}`;
      const description = getText('dataContents') || '';

      let endDate = '2099-12-31';
      if (endDateStr) {
        if (endDateStr.includes('-')) {
          endDate = endDateStr;
        } else if (endDateStr.length === 8) {
          endDate = `${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6, 8)}`;
        }
      }

      const grant = (Math.floor(Math.random() * 25) + 5) * 10000000;

      programs.push({
        id: `mss_${itemId}_${Date.now()}`,
        organizer: '중소벤처기업부',
        programName,
        supportType: '정부지원',
        officialEndDate: endDate,
        internalDeadline: calculateInternalDeadline(endDate),
        expectedGrant: grant,
        fitScore: 0,
        eligibility: '검토 필요',
        priorityRank: 99,
        eligibilityReason: 'AI 분석 대기',
        requiredDocuments: [],
        description: description || '상세 내용은 공고문을 참조하세요.',
        successProbability: 'Unknown',
        detailUrl: detailUrl || 'https://www.mss.go.kr/',
        source: 'mss_biz',
      });
    }

    return programs;
  } catch (e) {
    console.error('[programFetcher] MssBiz error:', e);
    return [];
  }
}

/** 창업진흥원 K-Startup API 호출 */
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
      const supportType = String(item.supt_biz_clsfc || '창업지원');
      const description = String(item.pbanc_ctnt || item.aply_trgt_ctnt || '');
      const detailUrl = String(item.detl_pg_url || item.biz_gdnc_url || 'https://www.k-startup.go.kr/');
      const endDateStr = String(item.pbanc_rcpt_end_dt || '');

      let endDate = '2099-12-31';
      if (endDateStr.length === 8) {
        endDate = `${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6, 8)}`;
      } else if (endDateStr.includes('-')) {
        endDate = endDateStr;
      }

      const grant = (Math.floor(Math.random() * 17) + 3) * 10000000;

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
        requiredDocuments: [],
        description: description || '상세 내용은 공고문을 참조하세요.',
        successProbability: 'Unknown',
        detailUrl,
        source: 'kstartup',
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

  console.log(
    `[programFetcher] 총 ${uniquePrograms.length}개 중 ${activePrograms.length}개 유효`
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
      type: '시설/인증',
      desc: 'HACCP 의무 적용 대상 식품제조업체 대상 스마트 센서 및 모니터링 시스템 구축 비용 지원',
      grant: 200000000,
      url: 'https://www.foodsafetykorea.go.kr/',
    },
    {
      name: `${TARGET_YEAR}년 중소기업 혁신바우처 (마케팅/기술지원)`,
      org: '중소벤처기업진흥공단',
      end: getFutureDate(2, 30),
      type: '마케팅',
      desc: '매출액 120억 이하 제조 소기업 대상 바우처 형태 지원',
      grant: 50000000,
      url: 'https://www.kosmes.or.kr/',
    },
    {
      name: `${TARGET_YEAR}년도 창업성장기술개발사업 (디딤돌) 상반기 공고`,
      org: '중소벤처기업부',
      end: getFutureDate(1, 28),
      type: 'R&D',
      desc: 'R&D 역량이 부족한 창업기업 대상 신제품 개발 자금 지원',
      grant: 120000000,
      url: 'https://www.smtech.go.kr/',
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
    requiredDocuments: [],
    description: item.desc,
    successProbability: 'Unknown',
    detailUrl: item.url,
    source: 'simulation',
  }));
}

export type { ServerSupportProgram };
