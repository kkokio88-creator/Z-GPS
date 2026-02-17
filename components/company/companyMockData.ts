import { DeepResearchResult } from '../../types';

/** 산너머남촌 상세 목업 데이터 (실제 기업 정보 기반) */
export const getSannamchonMockData = (): DeepResearchResult => ({
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
    competitiveAdvantage: '산너머남촌의 핵심 경쟁력은 "신선함"과 "정성"입니다. 대기업 HMR이 대량생산-재고 기반인 반면, 집반찬연구소는 주문 후 당일 제조하여 신선도를 차별화합니다. 15년간 축적된 한식 레시피와 17만 고객 데이터는 쉽게 복제할 수 없는 자산입니다.',
    growthPotential: '단기적으로 2024년 적자 전환이 우려되나, 2025년 스마트팩토리(MES/OMS/WES) 구축을 통한 생산성 향상이 기대됩니다. 중기적으로 2026년 한식소스 글로벌 진출, 2027년 서울 Micro Factory 매장 전략이 새로운 성장동력이 될 수 있습니다.',
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
    industryOutlook: '국내 HMR 시장은 약 5조원 규모로, 프리미엄 반찬 및 간편식 세그먼트가 가장 빠르게 성장 중입니다.',
    regulatoryEnvironment: '식품 위생 규제 강화 추세로 HACCP 인증이 필수화되고 있으며, 이는 영세업체 대비 경쟁 우위 요소입니다.',
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
    applicationTips: '스마트공장 구축 지원사업이 현재 상황에 가장 적합합니다. 2025년 MES/OMS/WES 개발 계획을 구체화하여 정부 지원금과 연계하세요.'
  },
  executiveSummary: '(주)산너머남촌은 2007년 강원도 토속한정식에서 시작하여 2016년 \'집반찬연구소\' 브랜드로 프리미엄 반찬 배송 시장에 진출한 식품제조 기업입니다. 박종철 대표가 이끄는 이 회사는 17만 고객 기반과 81명의 직원을 보유하며, 2024년 매출 106.7억원을 기록했습니다.',
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
