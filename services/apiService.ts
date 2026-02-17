
import { SupportProgram, EligibilityStatus, Company } from "../types";
import { getCachedPrograms, setCachedPrograms } from "./storageService";
import { apiClient } from "./apiClient";

const ENDPOINT_PATH = import.meta.env.VITE_ODCLOUD_ENDPOINT_PATH || "/15049270/v1/uddi:6b5d729e-28f8-4404-afae-c3f46842ff11";

// API 호출 중복 방지를 위한 플래그
let isFetchingPrograms = false;
let lastFetchPromise: Promise<SupportProgram[]> | null = null;

export const fetchIncheonSupportPrograms = async (): Promise<SupportProgram[]> => {
  try {
    const { data } = await apiClient.get<{ totalCount?: number; matchCount?: number; data?: unknown[] }>(
      `/api/odcloud/programs?page=1&perPage=500&endpointPath=${encodeURIComponent(ENDPOINT_PATH)}`
    );

    if (import.meta.env.DEV) {
      console.log(`[API] ODCloud response: ${data.totalCount || data.matchCount || 0} total, ${data.data?.length || 0} returned`);
    }
    if (data && data.data && data.data.length > 0) {
      return mapIncheonApiData(data.data);
    }
    throw new Error("API Response invalid or empty");
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[API] ODCloud API failed:", e);
    return getSimulatedData();
  }
};

// 인천 bizok API 데이터 매핑 (새로운 구조)
const mapIncheonApiData = (rawData: unknown[]): SupportProgram[] => {
  return rawData.map((item: unknown, index: number) => {
    const record = item as Record<string, unknown>;

    const programName = String(record['지원사업명'] || record['사업명'] || "제목 없음");
    const organizer = String(record['주관기관'] || "인천광역시");
    const supportType = String(record['지원분야'] || "일반지원");
    const applyDate = String(record['신청일자'] || "");

    // 마감일 계산 (신청일자 + 60일 기본값)
    let endDate = "2099-12-31";
    if (applyDate) {
      try {
        const start = new Date(applyDate);
        if (!isNaN(start.getTime())) {
          start.setDate(start.getDate() + 60);
          endDate = start.toISOString().split('T')[0];
        }
      } catch { /* ignore */ }
    }

    // 지원금/적합도: AI 분석 전이므로 0으로 초기화
    const grant = 0;
    const fitScore = 0;

    return {
      id: `incheon_${record['번호'] || index}_${Date.now()}`,
      organizer,
      programName,
      supportType,
      officialEndDate: endDate,
      internalDeadline: calculateInternalDeadline(endDate),
      expectedGrant: grant,
      fitScore,
      eligibility: EligibilityStatus.REVIEW_NEEDED,
      priorityRank: 99,
      eligibilityReason: "AI 분석 대기",
      requiredDocuments: [],
      description: `${organizer}에서 진행하는 ${supportType} 분야 지원사업입니다.`,
      successProbability: "Unknown",
      detailUrl: `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?search=${encodeURIComponent(programName)}`
    };
  });
};

/**
 * fetchCompanyDetailsFromDART
 * 백엔드 프록시를 통해 DART API 호출
 */
export const fetchCompanyDetailsFromDART = async (businessNumber: string, _apiKey: string, currentName?: string): Promise<Partial<Company>> => {
    if (import.meta.env.DEV) {
      console.log(`[API] Fetching DART for ${businessNumber}...`);
    }

    // 산너머남촌 기업 데이터 반환
    const generateMockData = (bNum: string): Partial<Company> => {
        return {
            name: currentName && currentName !== '신규 기업' ? currentName : '(주)산너머남촌',
            businessNumber: bNum || '131-86-42xxx',
            industry: '식료품 제조업 (HMR/프리미엄 반찬)',
            address: '인천광역시 서구 가석로 26 (가좌동)',
            revenue: 10700000000,
            employees: 81,
            description: '2007년 강원도 토속한정식 전문점에서 시작하여 2016년 "집반찬연구소" 브랜드를 론칭한 프리미엄 반찬 전문 기업입니다. 17만 이상의 충성 고객층을 보유하고 있으며, 당일 제조-당일 발송 신선 배송 시스템을 운영합니다.',
            isVerified: true,
            certifications: ['HACCP 인증', '중소기업 확인서', '식품제조업 영업등록'],
            coreCompetencies: [
                '15년 이상의 한식 전문 노하우와 레시피 자산',
                '당일제조-당일발송 콜드체인 물류 시스템',
                '17만 고객 데이터 기반 수요 예측 역량',
                '정기배송 구독 모델의 안정적 수익 구조'
            ],
            financials: [
                { year: 2022, revenue: 10500000000, operatingProfit: 350000000 },
                { year: 2023, revenue: 11370000000, operatingProfit: 200000000 },
                { year: 2024, revenue: 10700000000, operatingProfit: -500000000 }
            ]
        };
    };

    // Try Real API via backend proxy
    try {
        const corpCode = businessNumber.replace(/-/g, '');
        const { data } = await apiClient.get<Record<string, unknown>>(
          `/api/dart/company?corp_code=${corpCode}`
        );
        if (data && !('error' in data)) {
            return data as Partial<Company>;
        }
    } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("[API] DART API failed. Switching to simulation.", e);
        }
    }

    // Fallback: Return mock data
    await new Promise(r => setTimeout(r, 800));
    return generateMockData(businessNumber);
};

// ... helpers
const filterActivePrograms = (programs: SupportProgram[]): SupportProgram[] => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const maxDate = new Date('2027-12-31');

    return programs.filter(p => {
        const endDate = new Date(p.officialEndDate);
        return !isNaN(endDate.getTime()) &&
               endDate >= today &&
               endDate <= maxDate;
    });
};

const mapApiDataToModel = (rawData: Record<string, unknown>[]): SupportProgram[] => {
  return rawData.map((item, index) => {
    const programName = String(item.titl || item['사업명'] || item['제목'] || "제목 없음");
    const organizer = String(item.dept_nm || item['주관기관'] || item['지원기관'] || "인천광역시");
    const supportType = String(item.cate || item['지원분야'] || item['사업유형'] || "일반지원");
    const endDate = String(item.edate || item['공고종료일'] || item['접수마감일'] || "2099-12-31");
    const detailUrl = String(item.url || item['상세주소'] || `https://www.google.com/search?q=${encodeURIComponent(programName + " 공고")}`);

    // API 원본에 금액이 있으면 사용, 없으면 0(미확정)으로 유지
    const grant = Number(item.expectedGrant) || 0;

    const internalDate = calculateInternalDeadline(endDate);
    const requiredDocuments: string[] = [];
    const docField = item.gu_docs || item['제출서류'];
    if (docField && typeof docField === 'string') {
        requiredDocuments.push(...docField.split(',').map((s:string) => s.trim()));
    }

    return {
      id: String(item.sn || item['고유번호'] || `api_real_${index}_${Date.now()}`),
      organizer,
      programName,
      supportType,
      officialEndDate: endDate,
      internalDeadline: internalDate,
      expectedGrant: grant,
      fitScore: Number(item.fitScore) || 0,
      eligibility: EligibilityStatus.REVIEW_NEEDED,
      priorityRank: 99,
      eligibilityReason: "AI 분석 대기",
      requiredDocuments: requiredDocuments,
      description: String(item.description || "상세 내용은 공고문을 참조하세요."),
      successProbability: "Unknown",
      detailUrl: detailUrl
    };
  });
};

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

const getSimulatedData = (): SupportProgram[] => {
  const TARGET_YEAR = 2026;
  const getFutureDate = (monthIndex: number, day: number) => {
      const d = new Date(TARGET_YEAR, monthIndex, day);
      return d.toISOString().split('T')[0];
  };

  const rawApiData = [
    {
      titl: `[${TARGET_YEAR}년] 식품제조가공업소 스마트 HACCP 구축 지원사업`,
      dept_nm: "식품의약품안전처 / 인천광역시",
      edate: getFutureDate(3, 15),
      cate: "시설/인증",
      description: "HACCP 의무 적용 대상 식품제조업체 대상 스마트 센서 및 모니터링 시스템 구축 비용 지원 (최대 2억원, 자부담 50%)",
      fitScore: 92,
      expectedGrant: 200000000,
      url: "https://www.foodsafetykorea.go.kr/portal/content/view.do?menuKey=3386&contentKey=72"
    },
    {
      titl: `${TARGET_YEAR}년 중소기업 혁신바우처 (마케팅/기술지원)`,
      dept_nm: "중소벤처기업진흥공단",
      edate: getFutureDate(2, 30),
      cate: "마케팅",
      description: "매출액 120억 이하 제조 소기업 대상. 브랜드 개발, 포장 디자인 개선, 온라인 마케팅 등 바우처 형태 지원.",
      fitScore: 88,
      expectedGrant: 50000000,
      url: "https://www.kosmes.or.kr/sbc/SH/BPO/SHBPO010M0.do"
    },
    {
      titl: `[${TARGET_YEAR}] 농공상융합형 중소기업 판로개척 지원`,
      dept_nm: "농림축산식품부",
      edate: getFutureDate(4, 10),
      cate: "판로개척",
      description: "국산 농산물을 주원료로 사용하는 중소기업 대상 대형마트 입점, 홈쇼핑 방송 송출 지원.",
      fitScore: 85,
      expectedGrant: 30000000
    },
    {
      titl: `${TARGET_YEAR}년도 창업성장기술개발사업 (디딤돌) 상반기 공고`,
      dept_nm: "중소벤처기업부",
      edate: getFutureDate(1, 28),
      cate: "R&D",
      description: "R&D 역량이 부족한 창업기업 및 여성기업 대상 신제품 개발 자금 지원 (최대 1.2억원).",
      fitScore: 95,
      expectedGrant: 120000000,
      url: "https://www.smtech.go.kr/"
    },
    {
      titl: `[인천] ${TARGET_YEAR} 식품기업 수출 물류비 긴급 지원`,
      dept_nm: "인천테크노파크",
      edate: getFutureDate(2, 10),
      cate: "수출지원",
      description: "인천 소재 식품 제조 기업의 해외 수출 시 발생하는 해상/항공 물류비 실비 지원.",
      fitScore: 82,
      expectedGrant: 10000000,
      url: "https://bizok.incheon.go.kr/"
    },
    {
      titl: `${TARGET_YEAR}년 IP(지식재산) 나래 프로그램 지원기업 모집`,
      dept_nm: "인천지식재산센터",
      edate: getFutureDate(5, 5),
      cate: "특허/IP",
      description: "창업 7년 이내 기업의 IP 기술경영 융복합 컨설팅 및 특허 출원 비용 지원.",
      fitScore: 78,
      expectedGrant: 17000000
    }
  ];

  return filterActivePrograms(mapApiDataToModel(rawApiData));
};

/**
 * 중소벤처기업부 사업공고 API 호출 (백엔드 프록시 경유)
 */
export const fetchMssBizPrograms = async (): Promise<SupportProgram[]> => {
  try {
    const { data } = await apiClient.get<string>(
      '/api/data-go/mss-biz?numOfRows=200&pageNo=1',
      { headers: { 'Accept': 'application/xml' } }
    );

    const programs = parseMssBizXml(data);

    if (import.meta.env.DEV) {
      console.log(`[API] Fetched ${programs.length} MSS programs`);
    }

    return programs;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[API] MSS Biz API failed:", e);
    }
    return [];
  }
};

/**
 * 중소벤처기업부 XML 응답 파싱
 */
const parseMssBizXml = (xmlText: string): SupportProgram[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const items = xmlDoc.getElementsByTagName("item");

  if (import.meta.env.DEV) {
    console.log(`[API] MSS XML parsing: ${items.length} items found`);
  }

  const programs: SupportProgram[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const getText = (tag: string): string => {
      const el = item.getElementsByTagName(tag)[0];
      return el?.textContent?.trim() || "";
    };

    const programName = getText("title") || "제목 없음";
    const description = getText("dataContents") || "";
    const endDateStr = getText("applicationEndDate") || "";
    const detailUrl = getText("viewUrl") || "";
    const itemId = getText("itemId") || `mss_${i}`;

    let endDate = "2099-12-31";
    if (endDateStr) {
      if (endDateStr.includes("-")) {
        endDate = endDateStr;
      } else if (endDateStr.length === 8) {
        endDate = `${endDateStr.slice(0,4)}-${endDateStr.slice(4,6)}-${endDateStr.slice(6,8)}`;
      }
    }

    // AI 분석 전 초기값 0
    const fitScore = 0;
    const grant = 0;

    programs.push({
      id: `mss_${itemId}_${Date.now()}`,
      organizer: "중소벤처기업부",
      programName,
      supportType: "정부지원",
      officialEndDate: endDate,
      internalDeadline: calculateInternalDeadline(endDate),
      expectedGrant: grant,
      fitScore,
      eligibility: EligibilityStatus.REVIEW_NEEDED,
      priorityRank: 99,
      eligibilityReason: "AI 분석 대기",
      requiredDocuments: [],
      description: description || "상세 내용은 공고문을 참조하세요.",
      successProbability: "Unknown",
      detailUrl: detailUrl || `https://www.mss.go.kr/`
    });
  }

  return programs;
};

/**
 * 창업진흥원 K-Startup 사업공고 API 호출 (백엔드 프록시 경유)
 */
export const fetchKStartupPrograms = async (): Promise<SupportProgram[]> => {
  try {
    const { data: result } = await apiClient.get<{ totalCount?: number; data?: { data?: Record<string, unknown>[] } | Record<string, unknown>[] }>(
      '/api/data-go/kstartup?page=1&perPage=200'
    );

    const items = (Array.isArray(result?.data) ? result.data : (result?.data as { data?: Record<string, unknown>[] })?.data) || [];

    if (import.meta.env.DEV) {
      console.log(`[API] K-Startup response: totalCount=${result.totalCount}, items=${items.length}`);
    }

    const programs: SupportProgram[] = items.map((item: Record<string, unknown>, index: number) => {
      const programName = String(item.biz_pbanc_nm || item.intg_pbanc_biz_nm || "제목 없음");
      const organizer = String(item.sprv_inst || item.pbanc_ntrp_nm || "창업진흥원");
      const supportType = String(item.supt_biz_clsfc || "창업지원");
      const description = String(item.pbanc_ctnt || item.aply_trgt_ctnt || "");
      const detailUrl = String(item.detl_pg_url || item.biz_gdnc_url || "https://www.k-startup.go.kr/");
      const endDateStr = String(item.pbanc_rcpt_end_dt || "");

      let endDate = "2099-12-31";
      if (endDateStr.length === 8) {
        endDate = `${endDateStr.slice(0,4)}-${endDateStr.slice(4,6)}-${endDateStr.slice(6,8)}`;
      } else if (endDateStr.includes("-")) {
        endDate = endDateStr;
      }

      // AI 분석 전 초기값 0
      const fitScore = 0;
      const grant = 0;

      return {
        id: String(item.pbanc_sn || `kstartup_${index}_${Date.now()}`),
        organizer,
        programName,
        supportType,
        officialEndDate: endDate,
        internalDeadline: calculateInternalDeadline(endDate),
        expectedGrant: grant,
        fitScore,
        eligibility: EligibilityStatus.REVIEW_NEEDED,
        priorityRank: 99,
        eligibilityReason: "AI 분석 대기",
        requiredDocuments: [],
        description: description || "상세 내용은 공고문을 참조하세요.",
        successProbability: "Unknown",
        detailUrl
      };
    });

    return programs;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[API] K-Startup API failed:", e);
    }
    return [];
  }
};

/**
 * 모든 API에서 지원사업 통합 조회
 */
export const fetchAllSupportPrograms = async (forceRefresh = false): Promise<SupportProgram[]> => {
  if (!forceRefresh) {
    const cached = getCachedPrograms();
    if (cached && cached.programs.length > 0) {
      return cached.programs;
    }
  }

  if (isFetchingPrograms && lastFetchPromise) {
    if (import.meta.env.DEV) {
      console.log('[API] 진행 중인 요청 재사용');
    }
    return lastFetchPromise;
  }

  isFetchingPrograms = true;
  lastFetchPromise = (async () => {
    if (import.meta.env.DEV) {
      console.log('[API] 지원사업 통합 조회 시작...');
    }

    try {
      const results = await Promise.allSettled([
        fetchIncheonSupportPrograms(),
        fetchMssBizPrograms(),
        fetchKStartupPrograms()
      ]);

      const allPrograms: SupportProgram[] = [];
      const apiNames = ['인천 bizok', '중소벤처기업부', 'K-Startup'];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          if (import.meta.env.DEV) {
            console.log(`[API] ${apiNames[index]}: ${result.value.length}건 조회`);
          }
          allPrograms.push(...result.value);
        } else {
          if (import.meta.env.DEV) {
            const reason = result.status === 'rejected' ? result.reason : '0건';
            console.warn(`[API] ${apiNames[index]} 조회 실패/빈 결과:`, reason);
          }
        }
      });

      if (allPrograms.length === 0) {
        const oldCache = getCachedPrograms();
        if (oldCache && oldCache.programs.length > 0) {
          if (import.meta.env.DEV) {
            console.log('[API] API 실패, 이전 캐시 사용:', oldCache.programs.length + '건');
          }
          return oldCache.programs;
        }

        if (import.meta.env.DEV) {
          console.log('[API] 모든 API 실패, 시뮬레이션 데이터 사용');
        }
        const simData = getSimulatedData();
        setCachedPrograms(simData, 'simulation');
        return simData;
      }

      const uniquePrograms = allPrograms.filter((program, index, self) =>
        index === self.findIndex(p => p.programName === program.programName)
      );

      const activePrograms = filterActivePrograms(uniquePrograms);

      if (import.meta.env.DEV) {
        console.log(`[API] 총 ${uniquePrograms.length}개 중 ${activePrograms.length}개 유효 (마감 ${uniquePrograms.length - activePrograms.length}건 제외)`);
      }

      setCachedPrograms(activePrograms, 'api');

      return activePrograms;
    } finally {
      isFetchingPrograms = false;
      lastFetchPromise = null;
    }
  })();

  return lastFetchPromise;
};

export const refreshSupportPrograms = async (): Promise<SupportProgram[]> => {
  return fetchAllSupportPrograms(true);
};
