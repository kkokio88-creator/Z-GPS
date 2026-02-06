
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredCompany, saveStoredCompany, getStoredDeepResearch, saveStoredDeepResearch } from '../services/storageService';
import { Company, CompanySearchResult, DeepResearchResult, ResearchProgress } from '../types';
import { companyResearchAgent } from '../services/geminiAgents';
import { getQAState } from '../services/qaService';

type SearchMode = 'INPUT' | 'RESULTS' | 'RESEARCHING' | 'COMPLETE';

const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [isQaActive, setIsQaActive] = useState(false);

  // 검색 관련 상태
  const [searchMode, setSearchMode] = useState<SearchMode>('INPUT');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress>({
    stage: 'IDLE',
    message: '',
    progress: 0
  });
  const [deepResearchData, setDeepResearchData] = useState<DeepResearchResult | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 산너머남촌 상세 목업 데이터 (실제 기업 정보 기반)
  const getSannamchonMockData = (): DeepResearchResult => ({
    basicInfo: {
      name: '(주)산너머남촌',
      representativeName: '박종철',
      businessNumber: '131-86-42xxx',
      establishedDate: '2012-06-19',
      address: '인천광역시 서구 가석로 26 (가좌동)',
      website: 'https://www.zipbanchan.co.kr',
      employeeCount: 81
    },
    financialInfo: {
      recentRevenue: 10670000000,
      revenueGrowth: '-6.2%',
      financials: [
        { year: 2024, revenue: 10670000000, operatingProfit: -460000000, netIncome: -1160000000, totalAssets: 14820000000 },
        { year: 2023, revenue: 11380000000, operatingProfit: 200000000, netIncome: 50000000, totalAssets: 15100000000 },
        { year: 2022, revenue: 10500000000, operatingProfit: 350000000, netIncome: 180000000 },
        { year: 2021, revenue: 11370000000, operatingProfit: 420000000, netIncome: 250000000 },
        { year: 2019, revenue: 6160000000, operatingProfit: 150000000, netIncome: 80000000 }
      ]
    },
    businessInfo: {
      industry: '식료품 제조업 (HMR/프리미엄 반찬)',
      mainProducts: ['프리미엄 가정식 반찬', '밑반찬 정기배송', '간편식(HMR)', '명절 선물세트', '단체급식 B2B'],
      businessDescription: '(주)산너머남촌은 2007년 강원도 토속한정식 전문점에서 시작하여, 2016년 \'집반찬연구소\' 브랜드를 론칭한 프리미엄 반찬 전문 기업입니다. 건강한 식재료로 주문 당일 제조하여 당일 발송하는 신선 반찬 배송 서비스를 운영하며, 17만 이상의 충성 고객층을 보유하고 있습니다. 온라인 D2C 플랫폼과 다양한 유통채널을 통해 전국 배송 서비스를 제공합니다.',
      distributionChannels: ['집반찬연구소 자사몰', '배민찬', '29CM', '네이버 스마트스토어', '만나박스']
    },
    certifications: ['HACCP 인증', '중소기업 확인서', '식품제조업 영업등록', '외부감사 대상 기업'],
    ipList: [
      { id: 'ip1', title: '집반찬연구소 브랜드', type: '상표', status: '등록', date: '2016-07-01' },
      { id: 'ip2', title: '산너머남촌 브랜드', type: '상표', status: '등록', date: '2012-09-15' }
    ],
    marketPosition: {
      competitors: ['마켓컬리 반찬', '배민찬(서비스종료)', '반찬가게', '프레시지', '심플리쿡', '지역 반찬가게'],
      marketShare: '프리미엄 반찬 배송 시장 내 약 3-5% (추정)',
      uniqueSellingPoints: [
        '17만+ 충성 고객층 기반의 안정적 매출 구조',
        '주문 당일 제조-당일 발송 신선 시스템',
        '정기배송 구독 모델로 안정적 수익 확보',
        '15년 이상 한식 노하우 (2007년 창업)',
        '다채널 유통 (자사몰, 네이버, 29CM, 만나박스 등)'
      ]
    },
    history: '2007년 강원도 토속한정식 전문점 "산너머남촌" 오픈으로 시작. 2012년 법인 설립. 2016년 7월 프리미엄 반찬 브랜드 "집반찬연구소" 론칭. 2017년 배민찬, 29CM, 네이버스토어팜 입점 및 온라인 판매 본격화. 2018년 만나박스, 띵굴마켓 입점으로 채널 확장. 2021년 매출 113억원 달성 (전년비 27% 성장). 2024년 직원 81명 규모로 성장, 매출 107억원. 2025년 MIS/MES/OMS/WES 시스템 개발 추진 중, 2026년 한식소스 글로벌 진출, 2027년 서울 핵심상권 Micro Factory 매장 진출 계획.',
    coreCompetencies: [
      '15년 이상의 한식 전문 노하우와 레시피 자산',
      '당일제조-당일발송 콜드체인 물류 시스템',
      '17만 고객 데이터 기반 수요 예측 역량',
      '정기배송 구독 모델의 안정적 수익 구조',
      '다채널 유통 경험 (자사몰, 플랫폼, B2B)'
    ],
    strategicAnalysis: {
      swot: {
        strengths: [
          '17만 충성 고객 기반의 안정적 매출 구조',
          '15년 이상 축적된 한식 레시피와 제조 노하우',
          '당일제조-당일배송 신선 물류 시스템 구축 완료',
          '정기배송 구독 모델로 예측 가능한 수익 흐름',
          '다채널 유통 경험으로 플랫폼 의존도 분산'
        ],
        weaknesses: [
          '2024년 영업적자 전환 (-5억원)으로 수익성 악화',
          '제조 설비 인천 집중으로 지역 확장 시 물류비 부담',
          '인건비 상승 (81명)에 따른 고정비 증가',
          '대기업 HMR 브랜드 대비 브랜드 인지도 열세',
          '신선식품 특성상 유통기한 짧아 재고 리스크 존재'
        ],
        opportunities: [
          '1인 가구 증가로 간편식/반찬 배송 시장 성장세 지속',
          'K-Food 글로벌 인기로 한식소스 해외 진출 기회',
          '구독경제 확산으로 정기배송 모델 성장 여력',
          '스마트팩토리 도입 시 생산성 향상 및 원가 절감 가능',
          '프리미엄 HMR 시장의 지속적 성장 (연 10%+)'
        ],
        threats: [
          'CJ, 풀무원 등 대기업의 프리미엄 반찬 시장 진입 강화',
          '원자재(농산물) 가격 상승으로 마진 압박',
          '배달앱 수수료 인상에 따른 수익성 악화',
          '경기 침체 시 프리미엄 식품 소비 감소 우려',
          '인건비 및 물류비 지속 상승'
        ]
      },
      competitiveAdvantage: '산너머남촌의 핵심 경쟁력은 "신선함"과 "정성"입니다. 대기업 HMR이 대량생산-재고 기반인 반면, 집반찬연구소는 주문 후 당일 제조하여 신선도를 차별화합니다. 15년간 축적된 한식 레시피와 17만 고객 데이터는 쉽게 복제할 수 없는 자산입니다. 정기배송 구독 모델은 고객 이탈을 방지하고 안정적 매출을 보장합니다.',
      growthPotential: '단기적으로 2024년 적자 전환이 우려되나, 2025년 스마트팩토리(MES/OMS/WES) 구축을 통한 생산성 향상이 기대됩니다. 중기적으로 2026년 한식소스 글로벌 진출, 2027년 서울 Micro Factory 매장 전략이 새로운 성장동력이 될 수 있습니다. HMR 시장의 지속 성장(연 10%+)과 K-Food 글로벌 트렌드는 긍정적 외부 환경입니다.',
      riskFactors: [
        '2024년 영업적자로 재무건전성 모니터링 필요',
        '대표이사 의존도 높은 경영 구조',
        '원자재 가격 변동에 민감한 수익 구조'
      ]
    },
    industryInsights: {
      marketTrends: [
        '1인 가구 증가로 HMR/간편식 시장 연 10% 이상 성장',
        '프리미엄 반찬 배송 시장 확대 (건강, 신선 키워드)',
        '밀키트에서 완조리 반찬으로 소비 트렌드 이동',
        '구독경제 확산으로 정기배송 서비스 선호도 증가',
        'K-Food 글로벌 인기로 한식 소스/반찬 수출 기회'
      ],
      industryOutlook: '국내 HMR 시장은 약 5조원 규모로, 프리미엄 반찬 및 간편식 세그먼트가 가장 빠르게 성장 중입니다. 1인 가구 비중 증가(전체 가구의 34%)와 맞벌이 가정 확대로 "외식보다 저렴하고, 집밥보다 편리한" 반찬 배송 서비스 수요는 지속 증가할 전망입니다. 다만, 대기업의 시장 진입과 원자재 가격 상승이 중소기업에게는 위협 요인입니다.',
      regulatoryEnvironment: '식품 위생 규제 강화 추세로 HACCP 인증이 필수화되고 있으며, 이는 영세업체 대비 경쟁 우위 요소입니다. 정부는 농식품 가공업체의 스마트팩토리 전환을 적극 지원하고 있으며, 수출 지원사업도 확대 중입니다.',
      technologyTrends: [
        'AI 기반 수요예측 및 생산계획 최적화',
        '스마트팩토리 (MES, OMS, WES) 도입 확산',
        '콜드체인 물류 고도화 (온도 모니터링)',
        '식품 이력 추적 시스템 (블록체인)',
        '개인화 추천 알고리즘 (고객 취향 반영)'
      ]
    },
    governmentFundingFit: {
      recommendedPrograms: [
        '스마트공장 구축 및 고도화 지원사업',
        '농식품 가공업체 시설현대화 지원',
        '중소기업 디지털 전환 지원사업',
        '일자리 안정자금 (81명 고용 기반)',
        '농식품 수출 지원사업 (수출바우처)',
        '소상공인 온라인 판로개척 지원'
      ],
      eligibilityStrengths: [
        '중소기업 확인서 보유로 대부분 지원사업 자격 충족',
        'HACCP 인증으로 식품 관련 사업 우대 대상',
        '81명 고용으로 일자리 창출 기여도 높음',
        '제조업 기반으로 스마트공장 지원사업 적합',
        '외부감사 대상 기업으로 재무 투명성 입증'
      ],
      potentialChallenges: [
        '2024년 영업적자로 재무건전성 심사 시 불리할 수 있음',
        '자부담금 비율에 따른 현금 유동성 확인 필요',
        'R&D 인력 부족으로 기술개발 사업 참여 시 인력 확보 필요'
      ],
      applicationTips: '스마트공장 구축 지원사업이 현재 상황에 가장 적합합니다. 2025년 MES/OMS/WES 개발 계획을 구체화하여 정부 지원금과 연계하세요. 81명 고용과 17만 고객 기반을 "일자리 창출"과 "소비자 직접 판매" 관점에서 어필하면 효과적입니다. 2024년 적자는 "공격적 성장투자"와 "스마트화 준비"로 설명하고, 2025년 흑자 전환 계획을 구체적으로 제시하세요. 한식소스 글로벌 진출 계획은 수출바우처 사업 신청 시 핵심 어필 포인트입니다.'
    },
    executiveSummary: '(주)산너머남촌은 2007년 강원도 토속한정식에서 시작하여 2016년 \'집반찬연구소\' 브랜드로 프리미엄 반찬 배송 시장에 진출한 식품제조 기업입니다. 박종철 대표가 이끄는 이 회사는 17만 고객 기반과 81명의 직원을 보유하며, 2024년 매출 106.7억원을 기록했습니다.\n\n핵심 강점은 (1) 당일제조-당일배송 신선 시스템, (2) 15년 한식 노하우와 레시피 자산, (3) 정기배송 구독 모델의 안정적 수익구조입니다. 다만 2024년 영업적자(-4.6억)로 수익성 개선이 시급합니다.\n\n전략적 제언: 2025년 스마트팩토리(MES/OMS/WES) 구축을 통해 생산성을 높이고, 정부의 스마트공장 지원사업을 적극 활용하세요. 중기적으로 한식소스 해외 진출(2026)과 서울 Micro Factory(2027) 전략을 차질없이 추진하여 새로운 성장동력을 확보해야 합니다.',
    sources: [
      { title: '혁신의숲 - 산너머남촌', uri: 'https://www.innoforest.co.kr/company/CP00001044' },
      { title: '캐치 기업정보 - 산너머남촌', uri: 'https://www.catch.co.kr/Comp/CompSummary/J34502' },
      { title: '잡코리아 기업정보', uri: 'https://www.jobkorea.co.kr/Recruit/Co_Read/C/sannam77' },
      { title: '잡플래닛 리뷰', uri: 'https://www.jobplanet.co.kr/companies/347820' },
      { title: 'FIS 금융정보', uri: 'https://fis.kr' },
      { title: '집반찬연구소 공식 홈페이지', uri: 'https://www.zipbanchan.co.kr' }
    ],
    researchedAt: new Date().toISOString(),
    employmentInfo: {
      averageSalary: 31370000,
      creditRating: '양호',
      reviewRating: 2.4,
      reviewCount: 38,
      reviewSource: '잡플래닛',
      benefits: ['4대보험', '퇴직연금', '주5일근무', '연차/반차', '중식지원', '사내식당', '주차지원', '교육지원'],
      turnoverRate: '보통'
    },
    investmentInfo: {
      isBootstrapped: true,
      totalRaised: '없음 (자체 성장)',
      fundingRounds: []
    },
    dataSources: [
      { name: '혁신의숲', url: 'https://www.innoforest.co.kr', dataTypes: ['매출', '직원수', '성장률'], lastUpdated: '2024-12' },
      { name: '캐치', url: 'https://www.catch.co.kr', dataTypes: ['기업개요', '복리후생', '연봉'], lastUpdated: '2024-11' },
      { name: '잡플래닛', url: 'https://www.jobplanet.co.kr', dataTypes: ['직원리뷰', '평점'], lastUpdated: '2025-01' },
      { name: 'FIS', url: 'https://fis.kr', dataTypes: ['재무제표', '신용등급'], lastUpdated: '2024-12' },
      { name: '집반찬연구소', url: 'https://www.zipbanchan.co.kr', dataTypes: ['제품정보', '유통채널'], lastUpdated: '2025-02' }
    ]
  });

  // 저장된 기업 정보를 DeepResearchResult 형식으로 변환
  const convertCompanyToResearchData = (comp: Company): DeepResearchResult => ({
    basicInfo: {
      name: comp.name,
      representativeName: '',
      businessNumber: comp.businessNumber || '',
      establishedDate: '',
      address: comp.address || '',
      website: '',
      employeeCount: comp.employees || 0
    },
    financialInfo: {
      recentRevenue: comp.revenue || 0,
      revenueGrowth: '',
      financials: comp.financials || []
    },
    businessInfo: {
      industry: comp.industry || '',
      mainProducts: [],
      businessDescription: comp.description || ''
    },
    certifications: comp.certifications || [],
    ipList: comp.ipList || [],
    marketPosition: {
      competitors: [],
      marketShare: '',
      uniqueSellingPoints: []
    },
    history: comp.history || '',
    coreCompetencies: comp.coreCompetencies || [],
    strategicAnalysis: undefined,
    industryInsights: undefined,
    governmentFundingFit: undefined,
    executiveSummary: '',
    sources: [],
    researchedAt: new Date().toISOString()
  });

  useEffect(() => {
    const storedCompany = getStoredCompany();
    setCompany(storedCompany);
    setIsQaActive(getQAState().isActive);

    // 1. 저장된 DeepResearch 확인
    const storedResearch = getStoredDeepResearch();
    if (storedResearch) {
      setDeepResearchData(storedResearch);
      setSearchMode('COMPLETE');
    } else if (storedCompany && storedCompany.name && storedCompany.name !== '신규 기업') {
      // 2. 산너머남촌이면 enriched mock 데이터
      if (storedCompany.name === '산너머남촌' || storedCompany.name === '(주)산너머남촌') {
        const mockData = getSannamchonMockData();
        setDeepResearchData(mockData);
        saveStoredDeepResearch(mockData);
      } else {
        // 3. 기타 저장 기업 → convertCompanyToResearchData
        setDeepResearchData(convertCompanyToResearchData(storedCompany));
      }
      setSearchMode('COMPLETE');
    } else {
      // 4. 아무것도 없으면 → 산너머남촌 mock 자동 로드 + 저장
      const mockData = getSannamchonMockData();
      setDeepResearchData(mockData);
      saveStoredDeepResearch(mockData);
      setSearchMode('COMPLETE');
    }

    const handleStorage = () => {
      const updatedCompany = getStoredCompany();
      setCompany(updatedCompany);
      const updatedResearch = getStoredDeepResearch();
      if (updatedResearch) {
        setDeepResearchData(updatedResearch);
        setSearchMode('COMPLETE');
      } else if (updatedCompany && updatedCompany.name && updatedCompany.name !== '신규 기업') {
        if (updatedCompany.name === '산너머남촌' || updatedCompany.name === '(주)산너머남촌') {
          setDeepResearchData(getSannamchonMockData());
        } else {
          setDeepResearchData(convertCompanyToResearchData(updatedCompany));
        }
        setSearchMode('COMPLETE');
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('zmis-qa-update', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('zmis-qa-update', handleStorage);
    };
  }, []);

  const hasApiKey = (): boolean => {
    // 백엔드 프록시를 통해 API 키 관리 - 항상 true 반환
    return true;
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setErrorMessage(null);
    setResearchProgress({ stage: 'SEARCHING', message: '기업 검색 중...', progress: 30 });

    try {
      const results = await companyResearchAgent.searchByName(searchQuery);
      setSearchResults(results);
      setSearchMode('RESULTS');
      setResearchProgress({ stage: 'SELECTING', message: '검색 완료', progress: 100 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.';
      console.error("Search error:", msg);
      setErrorMessage(msg);
      setResearchProgress({ stage: 'ERROR', message: msg, progress: 0 });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCompany = async (result: CompanySearchResult) => {
    setSelectedCompanyName(result.name);
    setSearchMode('RESEARCHING');
    setErrorMessage(null);
    setResearchProgress({ stage: 'RESEARCHING', message: '딥 리서치 시작...', progress: 0 });

    try {
      const data = await companyResearchAgent.deepResearch(
        result.name,
        (stage, progress) => {
          setResearchProgress({ stage: 'RESEARCHING', message: stage, progress });
        }
      );

      if (data) {
        setDeepResearchData(data);
        setSearchMode('COMPLETE');
        setResearchProgress({ stage: 'COMPLETE', message: '리서치 완료!', progress: 100 });
      } else {
        setResearchProgress({ stage: 'ERROR', message: '리서치 결과를 가져올 수 없습니다.', progress: 0 });
        setSearchMode('RESULTS');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '리서치 중 오류가 발생했습니다.';
      console.error("Deep research error:", msg);
      setErrorMessage(msg);
      setResearchProgress({ stage: 'ERROR', message: msg, progress: 0 });
      setSearchMode('RESULTS');
    }
  };

  const handleSaveResearchData = () => {
    if (!deepResearchData) return;

    const newCompany: Company = {
      id: `c_${Date.now()}`,
      name: deepResearchData.basicInfo.name,
      businessNumber: deepResearchData.basicInfo.businessNumber || '',
      industry: deepResearchData.businessInfo.industry,
      description: deepResearchData.businessInfo.businessDescription,
      revenue: deepResearchData.financialInfo.recentRevenue || 0,
      employees: deepResearchData.basicInfo.employeeCount || 0,
      address: deepResearchData.basicInfo.address || '',
      isVerified: false,
      certifications: deepResearchData.certifications,
      history: deepResearchData.history,
      coreCompetencies: deepResearchData.coreCompetencies,
      financials: deepResearchData.financialInfo.financials,
      ipList: deepResearchData.ipList
    };

    saveStoredCompany(newCompany);
    saveStoredDeepResearch(deepResearchData);
    setCompany(newCompany);
    alert('기업 정보가 저장되었습니다!');
  };

  const handleReset = () => {
    setSearchMode('INPUT');
    setSearchQuery('');
    setSearchResults([]);
    setDeepResearchData(null);
    setSelectedCompanyName('');
    setResearchProgress({ stage: 'IDLE', message: '', progress: 0 });
  };

  const formatCurrency = (value: number): string => {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1000000000000) return `${sign}${(abs / 1000000000000).toFixed(1)}조원`;
    if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억원`;
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(0)}만원`;
    return `${sign}${abs.toLocaleString()}원`;
  };

  // API 키 없음 안내
  const renderApiKeyWarning = () => (
    <div className="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 p-4 rounded-r">
      <div className="flex items-center">
        <span className="material-icons-outlined text-yellow-600 mr-2">warning</span>
        <p className="font-bold text-yellow-800 dark:text-yellow-200">API 키 필요</p>
      </div>
      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
        AI 기업 검색 기능을 사용하려면 Gemini API 키가 필요합니다.
        데모 모드로 작동하여 샘플 데이터가 표시됩니다.
      </p>
      <button
        onClick={() => navigate('/settings')}
        className="mt-2 text-sm text-yellow-800 dark:text-yellow-200 underline hover:no-underline"
      >
        설정에서 API 키 입력하기 →
      </button>
    </div>
  );

  // 에러 메시지 표시
  const renderErrorMessage = () => {
    if (!errorMessage) return null;
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 rounded-r mb-4">
        <div className="flex items-center">
          <span className="material-icons-outlined text-red-600 mr-2">error</span>
          <p className="font-bold text-red-800 dark:text-red-200">오류 발생</p>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMessage}</p>
        <button
          onClick={() => setErrorMessage(null)}
          className="mt-2 text-sm text-red-800 dark:text-red-200 underline hover:no-underline"
        >
          닫기
        </button>
      </div>
    );
  };

  // Step 1: 검색 입력
  const renderSearchInput = () => (
    <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
      <h2 className="text-lg font-bold mb-4 flex items-center">
        <span className="material-icons-outlined text-primary mr-2">search</span>
        기업명으로 검색
      </h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="기업명을 입력하세요 (예: 삼성전자, 현대자동차)"
          className="flex-1 border border-gray-300 dark:border-gray-600 p-3 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSearching ? (
            <>
              <span className="material-icons-outlined animate-spin mr-2">sync</span>
              검색 중...
            </>
          ) : (
            <>
              <span className="material-icons-outlined mr-2">travel_explore</span>
              AI 검색
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Gemini AI가 웹에서 기업 정보를 검색합니다.
      </p>
    </div>
  );

  // Step 2: 검색 결과
  const renderSearchResults = () => (
    <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold flex items-center">
          <span className="material-icons-outlined text-green-600 mr-2">checklist</span>
          검색 결과 ({searchResults.length}건)
        </h2>
        <button
          onClick={handleReset}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
        >
          <span className="material-icons-outlined text-sm mr-1">arrow_back</span>
          다시 검색
        </button>
      </div>

      {searchResults.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <span className="material-icons-outlined text-4xl mb-2">search_off</span>
          <p>검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {searchResults.map((result, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">{result.name}</h3>
                    {result.industry && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                        {result.industry}
                      </span>
                    )}
                  </div>
                  {result.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{result.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {result.address && (
                      <span className="flex items-center">
                        <span className="material-icons-outlined text-sm mr-1">location_on</span>
                        {result.address}
                      </span>
                    )}
                    {result.establishedYear && (
                      <span className="flex items-center">
                        <span className="material-icons-outlined text-sm mr-1">calendar_today</span>
                        {result.establishedYear}년 설립
                      </span>
                    )}
                    {result.estimatedRevenue && (
                      <span className="flex items-center">
                        <span className="material-icons-outlined text-sm mr-1">payments</span>
                        {result.estimatedRevenue}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleSelectCompany(result)}
                  className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm flex items-center ml-4 transition-colors"
                >
                  <span className="material-icons-outlined text-sm mr-1">science</span>
                  이 기업 선택
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Step 3: 딥 리서치 진행
  const renderResearchProgress = () => (
    <div className="bg-white dark:bg-surface-dark p-8 rounded-lg shadow border border-border-light dark:border-border-dark">
      <div className="text-center">
        <span className="material-icons-outlined text-5xl text-primary animate-pulse mb-4">biotech</span>
        <h2 className="text-xl font-bold mb-2">
          {selectedCompanyName} 딥 리서치 진행 중
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{researchProgress.message}</p>

        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
          <div
            className="bg-primary h-3 rounded-full transition-all duration-500"
            style={{ width: `${researchProgress.progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">{researchProgress.progress}%</p>

        <div className="mt-6 text-xs text-gray-400 space-y-1">
          <p>• 기본 정보 수집 (회사명, 대표자, 설립일)</p>
          <p>• 재무 정보 분석 (매출, 영업이익)</p>
          <p>• 사업 영역 및 인증/특허 조사</p>
          <p>• 시장 위치 및 핵심 역량 분석</p>
        </div>
      </div>
    </div>
  );

  // Step 4: 결과 표시
  const renderResearchResult = () => {
    if (!deepResearchData) return null;
    const { basicInfo, financialInfo, businessInfo, certifications, ipList, marketPosition, history, coreCompetencies, strategicAnalysis, industryInsights, governmentFundingFit, executiveSummary, sources, employmentInfo, investmentInfo, dataSources } = deepResearchData;

    return (
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center">
                {basicInfo.name}
                <span className="ml-2 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                  리서치 완료
                </span>
              </h2>
              {basicInfo.representativeName && (
                <p className="text-gray-600 dark:text-gray-400 mt-1">대표: {basicInfo.representativeName}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                다시 검색
              </button>
              <button
                onClick={handleSaveResearchData}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-colors"
              >
                <span className="material-icons-outlined text-sm mr-1">save</span>
                기업정보 저장
              </button>
            </div>
          </div>
        </div>

        {/* 기본 정보 */}
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-blue-600 mr-2">badge</span>
            기본 정보
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {basicInfo.businessNumber && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">사업자번호</p>
                <p className="font-medium">{basicInfo.businessNumber}</p>
              </div>
            )}
            {basicInfo.establishedDate && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">설립일</p>
                <p className="font-medium">{basicInfo.establishedDate}</p>
              </div>
            )}
            {basicInfo.employeeCount && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">직원 수</p>
                <p className="font-medium">{basicInfo.employeeCount}명</p>
              </div>
            )}
            {basicInfo.address && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">주소</p>
                <p className="font-medium">{basicInfo.address}</p>
              </div>
            )}
            {basicInfo.website && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">웹사이트</p>
                <a href={basicInfo.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {basicInfo.website}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* 재무 현황 */}
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-green-600 mr-2">payments</span>
            재무 현황
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {financialInfo.recentRevenue && (
              <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-sm">최근 매출</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(financialInfo.recentRevenue)}
                </p>
              </div>
            )}
            {financialInfo.revenueGrowth && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-sm">성장률</p>
                <p className={`text-2xl font-bold ${financialInfo.revenueGrowth.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                  {financialInfo.revenueGrowth}
                </p>
              </div>
            )}
          </div>
          {financialInfo.financials && financialInfo.financials.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left">연도</th>
                    <th className="px-4 py-2 text-right">매출액</th>
                    <th className="px-4 py-2 text-right">영업이익</th>
                    <th className="px-4 py-2 text-right">당기순이익</th>
                    <th className="px-4 py-2 text-right">총자산</th>
                  </tr>
                </thead>
                <tbody>
                  {financialInfo.financials.map((f, i) => (
                    <tr key={i} className="border-t dark:border-gray-700">
                      <td className="px-4 py-2">{f.year}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(f.revenue)}</td>
                      <td className={`px-4 py-2 text-right ${f.operatingProfit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatCurrency(f.operatingProfit)}</td>
                      <td className={`px-4 py-2 text-right ${f.netIncome && f.netIncome < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{f.netIncome !== undefined ? formatCurrency(f.netIncome) : '-'}</td>
                      <td className="px-4 py-2 text-right">{f.totalAssets ? formatCurrency(f.totalAssets) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 사업 영역 */}
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-purple-600 mr-2">business</span>
            사업 영역
          </h3>
          <div className="mb-4">
            <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full text-sm font-medium">
              {businessInfo.industry}
            </span>
          </div>
          {businessInfo.mainProducts.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">주요 제품/서비스</p>
              <div className="flex flex-wrap gap-2">
                {businessInfo.mainProducts.map((product, i) => (
                  <span key={i} className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-sm">
                    {product}
                  </span>
                ))}
              </div>
            </div>
          )}
          {businessInfo.businessDescription && (
            <p className="text-gray-600 dark:text-gray-400">{businessInfo.businessDescription}</p>
          )}
          {businessInfo.distributionChannels && businessInfo.distributionChannels.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">유통 채널</p>
              <div className="flex flex-wrap gap-2">
                {businessInfo.distributionChannels.map((channel, i) => (
                  <span key={i} className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-3 py-1 rounded-full text-sm">
                    {channel}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 핵심 역량 */}
        {coreCompetencies.length > 0 && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-yellow-600 mr-2">emoji_events</span>
              AI 분석 핵심 역량
            </h3>
            <div className="space-y-2">
              {coreCompetencies.map((comp, i) => (
                <div key={i} className="flex items-start">
                  <span className="material-icons-outlined text-yellow-500 mr-2 mt-0.5 text-sm">star</span>
                  <span>{comp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 인증 & 특허 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certifications.length > 0 && (
            <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
              <h3 className="font-bold text-lg mb-4 flex items-center">
                <span className="material-icons-outlined text-blue-600 mr-2">verified</span>
                보유 인증
              </h3>
              <div className="flex flex-wrap gap-2">
                {certifications.map((cert, i) => (
                  <span key={i} className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ipList.length > 0 && (
            <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
              <h3 className="font-bold text-lg mb-4 flex items-center">
                <span className="material-icons-outlined text-orange-600 mr-2">lightbulb</span>
                지적재산권 ({ipList.length}건)
              </h3>
              <div className="space-y-2">
                {ipList.slice(0, 5).map((ip, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{ip.title}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs ${ip.status === '등록' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {ip.type} ({ip.status})
                    </span>
                  </div>
                ))}
                {ipList.length > 5 && (
                  <p className="text-xs text-gray-500">외 {ipList.length - 5}건</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 고용 & 복지 정보 */}
        {employmentInfo && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-cyan-600 mr-2">groups</span>
              고용 & 복지 정보
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {employmentInfo.averageSalary && (
                <div className="bg-cyan-50 dark:bg-cyan-900/30 p-4 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">평균 연봉</p>
                  <p className="text-xl font-bold text-cyan-700 dark:text-cyan-400">
                    {formatCurrency(employmentInfo.averageSalary)}
                  </p>
                </div>
              )}
              {employmentInfo.creditRating && (
                <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">신용등급</p>
                  <span className="inline-block mt-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-bold">
                    {employmentInfo.creditRating}
                  </span>
                </div>
              )}
              {employmentInfo.reviewRating !== undefined && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                    {employmentInfo.reviewSource || '리뷰'} 평점
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{employmentInfo.reviewRating}</span>
                    <span className="text-gray-400">/5.0</span>
                  </div>
                  <div className="flex justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className={`text-sm ${star <= Math.round(employmentInfo.reviewRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  {employmentInfo.reviewCount && (
                    <p className="text-xs text-gray-400 mt-1">{employmentInfo.reviewCount}건</p>
                  )}
                </div>
              )}
              {employmentInfo.turnoverRate && (
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">이직률</p>
                  <p className="text-lg font-bold mt-1">{employmentInfo.turnoverRate}</p>
                </div>
              )}
            </div>
            {employmentInfo.benefits && employmentInfo.benefits.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">복리후생</p>
                <div className="flex flex-wrap gap-2">
                  {employmentInfo.benefits.map((benefit, i) => (
                    <span key={i} className="bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 px-3 py-1 rounded-full text-sm">
                      {benefit}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 투자 현황 */}
        {investmentInfo && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-emerald-600 mr-2">account_balance</span>
              투자 현황
            </h3>
            {investmentInfo.isBootstrapped ? (
              <div className="flex items-center gap-3">
                <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-4 py-2 rounded-full text-sm font-bold">
                  Bootstrapped
                </span>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  외부 VC 투자 없이 자체 매출로 성장한 기업입니다.
                </p>
              </div>
            ) : (
              <div>
                {investmentInfo.totalRaised && (
                  <div className="mb-4">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">누적 투자유치</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{investmentInfo.totalRaised}</p>
                  </div>
                )}
                {investmentInfo.fundingRounds && investmentInfo.fundingRounds.length > 0 && (
                  <div className="space-y-3">
                    {investmentInfo.fundingRounds.map((round, i) => (
                      <div key={i} className="flex items-center gap-4 border-l-2 border-emerald-400 pl-4">
                        <div>
                          <p className="font-medium">{round.round}</p>
                          <p className="text-sm text-gray-500">{round.date}</p>
                        </div>
                        <p className="font-bold text-emerald-600">{round.amount}</p>
                        {round.investor && <p className="text-sm text-gray-400">{round.investor}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 시장 위치 */}
        {(marketPosition.competitors.length > 0 || marketPosition.uniqueSellingPoints.length > 0) && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-indigo-600 mr-2">analytics</span>
              시장 위치
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {marketPosition.competitors.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">주요 경쟁사</p>
                  <div className="flex flex-wrap gap-2">
                    {marketPosition.competitors.map((comp, i) => (
                      <span key={i} className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-sm">
                        {comp}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {marketPosition.uniqueSellingPoints.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">차별화 포인트</p>
                  <ul className="space-y-1">
                    {marketPosition.uniqueSellingPoints.map((point, i) => (
                      <li key={i} className="text-sm flex items-center">
                        <span className="material-icons-outlined text-green-500 text-sm mr-1">check</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {marketPosition.marketShare && (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                시장 점유율: <strong>{marketPosition.marketShare}</strong>
              </p>
            )}
          </div>
        )}

        {/* 연혁 */}
        {history && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-gray-600 mr-2">history</span>
              주요 연혁
            </h3>
            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-line">{history}</p>
          </div>
        )}

        {/* Executive Summary */}
        {executiveSummary && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-lg shadow text-white">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined mr-2">summarize</span>
              Executive Summary
            </h3>
            <p className="text-blue-50 leading-relaxed">{executiveSummary}</p>
          </div>
        )}

        {/* SWOT 분석 */}
        {strategicAnalysis?.swot && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-purple-600 mr-2">grid_view</span>
              SWOT 분석
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
                <h4 className="font-bold text-green-700 dark:text-green-400 mb-2 flex items-center">
                  <span className="material-icons-outlined text-sm mr-1">thumb_up</span>
                  강점 (Strengths)
                </h4>
                <ul className="space-y-1 text-sm">
                  {strategicAnalysis.swot.strengths?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="text-green-500 mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Weaknesses */}
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-l-4 border-red-500">
                <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center">
                  <span className="material-icons-outlined text-sm mr-1">thumb_down</span>
                  약점 (Weaknesses)
                </h4>
                <ul className="space-y-1 text-sm">
                  {strategicAnalysis.swot.weaknesses?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="text-red-500 mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Opportunities */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-4 border-blue-500">
                <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-2 flex items-center">
                  <span className="material-icons-outlined text-sm mr-1">trending_up</span>
                  기회 (Opportunities)
                </h4>
                <ul className="space-y-1 text-sm">
                  {strategicAnalysis.swot.opportunities?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Threats */}
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border-l-4 border-orange-500">
                <h4 className="font-bold text-orange-700 dark:text-orange-400 mb-2 flex items-center">
                  <span className="material-icons-outlined text-sm mr-1">warning</span>
                  위협 (Threats)
                </h4>
                <ul className="space-y-1 text-sm">
                  {strategicAnalysis.swot.threats?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="text-orange-500 mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 전략적 분석 */}
        {strategicAnalysis && (strategicAnalysis.competitiveAdvantage || strategicAnalysis.growthPotential) && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-indigo-600 mr-2">insights</span>
              전략적 분석
            </h3>
            <div className="space-y-4">
              {strategicAnalysis.competitiveAdvantage && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">경쟁 우위</h4>
                  <p className="text-gray-600 dark:text-gray-400 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded">{strategicAnalysis.competitiveAdvantage}</p>
                </div>
              )}
              {strategicAnalysis.growthPotential && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">성장 잠재력</h4>
                  <p className="text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 p-3 rounded">{strategicAnalysis.growthPotential}</p>
                </div>
              )}
              {strategicAnalysis.riskFactors && strategicAnalysis.riskFactors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">주요 리스크 요인</h4>
                  <div className="flex flex-wrap gap-2">
                    {strategicAnalysis.riskFactors.map((risk, i) => (
                      <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-full text-sm">
                        {risk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 산업 인사이트 */}
        {industryInsights && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-teal-600 mr-2">trending_up</span>
              산업 인사이트
            </h3>
            <div className="space-y-4">
              {industryInsights.marketTrends && industryInsights.marketTrends.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">시장 트렌드</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {industryInsights.marketTrends.map((trend, i) => (
                      <div key={i} className="flex items-center bg-teal-50 dark:bg-teal-900/20 p-2 rounded">
                        <span className="material-icons-outlined text-teal-500 text-sm mr-2">arrow_forward</span>
                        <span className="text-sm">{trend}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {industryInsights.industryOutlook && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">산업 전망</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{industryInsights.industryOutlook}</p>
                </div>
              )}
              {industryInsights.technologyTrends && industryInsights.technologyTrends.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">기술 트렌드</h4>
                  <div className="flex flex-wrap gap-2">
                    {industryInsights.technologyTrends.map((tech, i) => (
                      <span key={i} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded text-sm">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 정부지원사업 적합성 */}
        {governmentFundingFit && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-lg shadow border border-amber-200 dark:border-amber-800">
            <h3 className="font-bold text-lg mb-4 flex items-center text-amber-800 dark:text-amber-300">
              <span className="material-icons-outlined mr-2">policy</span>
              정부지원사업 적합성 분석
            </h3>
            <div className="space-y-4">
              {governmentFundingFit.recommendedPrograms && governmentFundingFit.recommendedPrograms.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2">추천 지원사업 유형</h4>
                  <div className="flex flex-wrap gap-2">
                    {governmentFundingFit.recommendedPrograms.map((prog, i) => (
                      <span key={i} className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-full text-sm font-medium">
                        {prog}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {governmentFundingFit.eligibilityStrengths && governmentFundingFit.eligibilityStrengths.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 mb-2">어필 포인트</h4>
                    <ul className="space-y-1 text-sm">
                      {governmentFundingFit.eligibilityStrengths.map((str, i) => (
                        <li key={i} className="flex items-start">
                          <span className="material-icons-outlined text-green-500 text-sm mr-1">check_circle</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {governmentFundingFit.potentialChallenges && governmentFundingFit.potentialChallenges.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-2">보완 필요 사항</h4>
                    <ul className="space-y-1 text-sm">
                      {governmentFundingFit.potentialChallenges.map((ch, i) => (
                        <li key={i} className="flex items-start">
                          <span className="material-icons-outlined text-red-500 text-sm mr-1">error_outline</span>
                          <span>{ch}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {governmentFundingFit.applicationTips && (
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-amber-300 dark:border-amber-700">
                  <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2 flex items-center">
                    <span className="material-icons-outlined text-sm mr-1">lightbulb</span>
                    지원서 작성 전략
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{governmentFundingFit.applicationTips}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 데이터 출처 */}
        {dataSources && dataSources.length > 0 && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-gray-600 mr-2">source</span>
              데이터 출처 ({dataSources.length}개)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {dataSources.map((ds, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <a href={ds.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      {ds.name}
                    </a>
                    <span className="text-xs text-gray-400">{ds.lastUpdated}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ds.dataTypes.map((dt, j) => (
                      <span key={j} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                        {dt}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 출처 링크 */}
        {sources && sources.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
            <h4 className="font-medium text-sm mb-2 flex items-center text-gray-600 dark:text-gray-400">
              <span className="material-icons-outlined text-sm mr-1">link</span>
              출처 ({sources.length}건)
            </h4>
            <div className="flex flex-wrap gap-2">
              {sources.filter(s => s.uri && s.uri !== 'demo://local').slice(0, 10).map((source, i) => (
                <a
                  key={i}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline bg-white dark:bg-gray-700 px-2 py-1 rounded"
                >
                  {source.title || source.uri}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="기업 자산 허브"
        actionLabel="대시보드"
        icon="dashboard"
        onAction={() => navigate('/')}
      />

      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        {isQaActive && (
          <div className="mb-4 bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded shadow-sm">
            <p className="font-bold text-indigo-700 flex items-center">
              <span className="material-icons-outlined animate-spin mr-2">sync</span>
              QA Testing In Progress: Data Verification...
            </p>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6">
          {/* API 키 경고 (없을 때) */}
          {!hasApiKey() && renderApiKeyWarning()}

          {/* 에러 메시지 */}
          {renderErrorMessage()}

          {/* 검색 섹션 - 항상 상단에 고정 */}
          {renderSearchInput()}

          {/* 검색 모드에 따른 추가 렌더링 */}
          {searchMode === 'RESULTS' && renderSearchResults()}
          {searchMode === 'RESEARCHING' && renderResearchProgress()}

          {/* 분석 결과 표시 (COMPLETE 모드) */}
          {searchMode === 'COMPLETE' && renderResearchResult()}
        </div>
      </main>
    </div>
  );
};

export default CompanyProfile;
