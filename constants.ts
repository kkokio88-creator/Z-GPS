import { Company, SupportProgram, EligibilityStatus, Application } from './types';

// Initial empty state
export const COMPANIES: Company[] = [
  {
    id: 'c_new',
    name: '신규 기업', 
    businessNumber: '',
    industry: '',
    description: '기업 정보가 설정되지 않았습니다.',
    revenue: 0, 
    employees: 0, 
    address: '',
    certifications: [],
    preferredKeywords: [],
    financials: [],
    ipList: []
  }
];

// Initial empty state, will be populated by API/AI
export const MOCK_PROGRAMS: SupportProgram[] = [];

export const INITIAL_APPLICATION: Application = {
  id: 'app_new',
  programId: '',
  programSnapshot: {
      name: '',
      organizer: '',
      endDate: '',
      grantAmount: 0,
      type: '',
      description: '',
      requiredDocuments: []
  },
  companyId: 'c_new',
  status: '작성 전',
  draftSections: {
    section1: '',
    section2: '',
    section3: '',
    section4: '',
    section5: '',
    section6: '',
  },
  documentStatus: {},
  updatedAt: new Date().toISOString(),
};

export const DRAFT_SECTIONS = [
  { id: 'section1', title: '1. 프로젝트 개요 (Project Overview)', description: '사업의 배경, 필요성 및 기업의 핵심 역량을 기술하세요.' },
  { id: 'section2', title: '2. 사업화 목표 (Objectives)', description: '최종 달성하고자 하는 정량적/정성적 목표를 기술하세요.' },
  { id: 'section3', title: '3. 시장 분석 및 마케팅 전략 (Market & Strategy)', description: '타겟 시장 분석 및 구체적인 판로 개척 방안을 기술하세요.' },
  { id: 'section4', title: '4. 기술/제품의 우수성 (Product Excellence)', description: '보유한 레시피, 공정 기술의 차별성을 기술하세요.' },
  { id: 'section5', title: '5. 추진 일정 및 예산 (Schedule & Budget)', description: '구체적인 사업 추진 일정과 정부지원금 활용 계획을 기술하세요.' },
  { id: 'section6', title: '6. 기대효과 (Expected Outcomes)', description: '지역 경제 활성화, 고용 창출 등 파급 효과를 기술하세요.' },
];