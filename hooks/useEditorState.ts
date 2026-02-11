/**
 * 지원서 편집기 핵심 state 관리
 */
import React, { useState, useEffect } from 'react';
import { INITIAL_APPLICATION, DEFAULT_SECTION_SCHEMA } from '../constants';
import { getStoredCompany, getApplicationByProgramId, getTeamMembers } from '../services/storageService';
import { SupportProgram, DraftSnapshot, DraftComment, Company, EligibilityStatus, SectionSchema, ApplicationSectionSchema } from '../types';
import { vaultService } from '../services/vaultService';

interface GapAnalysisData {
  strengths: string[];
  gaps: string[];
  advice: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface EditorState {
  company: Company;
  program: SupportProgram | null;
  appId: string;
  draftSections: { [key: string]: string };
  documentStatus: { [key: string]: boolean };
  snapshots: DraftSnapshot[];
  comments: DraftComment[];
  gapAnalysisData: GapAnalysisData | null;
  isCalendarSynced: boolean;
  referenceContext: string;
  showContextPanel: boolean;
  sectionAssignees: { [key: string]: string };
  teamMembers: TeamMember[];
  sectionSchema: SectionSchema[];
  isLoadingSchema: boolean;
  sectionSchemaSource: 'ai_analyzed' | 'default_fallback' | 'saved';
}

export interface EditorActions {
  setProgram: (p: SupportProgram | null) => void;
  setDraftSections: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  setDocumentStatus: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  setSnapshots: React.Dispatch<React.SetStateAction<DraftSnapshot[]>>;
  setComments: React.Dispatch<React.SetStateAction<DraftComment[]>>;
  setGapAnalysisData: (data: GapAnalysisData | null) => void;
  setIsCalendarSynced: (v: boolean) => void;
  setReferenceContext: (v: string) => void;
  setShowContextPanel: (v: boolean) => void;
  setSectionAssignees: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
}

export function useEditorState(programId: string | undefined): EditorState & EditorActions {
  const company = getStoredCompany();
  const teamMembers = getTeamMembers() as TeamMember[];
  const [program, setProgram] = useState<SupportProgram | null>(null);
  const [appId, setAppId] = useState<string>(`app_${Date.now()}`);
  const [draftSections, setDraftSections] = useState(INITIAL_APPLICATION.draftSections);
  const [documentStatus, setDocumentStatus] = useState(INITIAL_APPLICATION.documentStatus);
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([]);
  const [comments, setComments] = useState<DraftComment[]>([]);
  const [gapAnalysisData, setGapAnalysisData] = useState<GapAnalysisData | null>(null);
  const [isCalendarSynced, setIsCalendarSynced] = useState(false);
  const [referenceContext, setReferenceContext] = useState<string>('');
  const [showContextPanel, setShowContextPanel] = useState(true);
  const [sectionAssignees, setSectionAssignees] = useState<{ [key: string]: string }>({});
  const [sectionSchema, setSectionSchema] = useState<SectionSchema[]>(DEFAULT_SECTION_SCHEMA);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [sectionSchemaSource, setSectionSchemaSource] = useState<'ai_analyzed' | 'default_fallback' | 'saved'>('default_fallback');

  useEffect(() => {
    if (!programId) return;
    const savedApp = getApplicationByProgramId(programId);

    if (savedApp) {
      setDraftSections(savedApp.draftSections);
      setDocumentStatus(savedApp.documentStatus);
      setAppId(savedApp.id);
      setIsCalendarSynced(!!savedApp.isCalendarSynced);
      setSnapshots(savedApp.snapshots || []);
      setComments(savedApp.comments || []);

      // 저장된 sectionSchema 복원
      if (savedApp.sectionSchema?.sections?.length) {
        setSectionSchema(savedApp.sectionSchema.sections);
        setSectionSchemaSource('saved');
      }

      if (savedApp.gapAnalysis) {
        setGapAnalysisData(savedApp.gapAnalysis);
        setReferenceContext(`[전략 가이드]\n${savedApp.gapAnalysis.advice}`);
      }

      if (savedApp.programSnapshot) {
        setProgram({
          id: savedApp.programId,
          programName: savedApp.programSnapshot.name,
          organizer: savedApp.programSnapshot.organizer,
          officialEndDate: savedApp.programSnapshot.endDate,
          internalDeadline: savedApp.programSnapshot.endDate,
          expectedGrant: savedApp.programSnapshot.grantAmount,
          supportType: savedApp.programSnapshot.type,
          description: savedApp.programSnapshot.description || '',
          requiredDocuments: savedApp.programSnapshot.requiredDocuments || [],
          fitScore: 0,
          eligibility: EligibilityStatus.POSSIBLE,
          priorityRank: 0,
          eligibilityReason: '',
          detailUrl: savedApp.programSnapshot.detailUrl,
        });
      } else {
        setProgram({
          id: programId,
          programName: '저장된 지원사업 (세부정보 없음)',
          organizer: '정보 없음',
          supportType: '기타',
          officialEndDate: '2025-12-31',
          internalDeadline: '2025-12-24',
          expectedGrant: 0,
          fitScore: 0,
          eligibility: EligibilityStatus.POSSIBLE,
          priorityRank: 0,
          eligibilityReason: '',
          requiredDocuments: [],
          detailUrl: '',
        });
      }
    } else if (programId) {
      // savedApp이 없을 때 vault에서 program 정보 조회 (slug 기반 진입)
      vaultService.getProgram(programId)
        .then(detail => {
          if (detail?.frontmatter) {
            const fm = detail.frontmatter;
            setProgram({
              id: programId,
              programName: (fm.programName as string) || programId,
              organizer: (fm.organizer as string) || '',
              officialEndDate: (fm.officialEndDate as string) || '',
              internalDeadline: (fm.internalDeadline as string) || (fm.officialEndDate as string) || '',
              expectedGrant: (fm.expectedGrant as number) || 0,
              supportType: (fm.supportType as string) || '',
              description: (fm.fullDescription as string) || (fm.description as string) || '',
              requiredDocuments: (fm.requiredDocuments as string[]) || [],
              fitScore: (fm.fitScore as number) || 0,
              eligibility: EligibilityStatus.POSSIBLE,
              priorityRank: 0,
              eligibilityReason: (fm.eligibility as string) || '',
              detailUrl: (fm.detailUrl as string) || '',
            });
          }
        })
        .catch(() => {
          // vault 조회 실패 시 기본값 설정
          setProgram({
            id: programId,
            programName: programId,
            organizer: '정보 없음',
            supportType: '기타',
            officialEndDate: '',
            internalDeadline: '',
            expectedGrant: 0,
            fitScore: 0,
            eligibility: EligibilityStatus.POSSIBLE,
            priorityRank: 0,
            eligibilityReason: '',
            requiredDocuments: [],
            detailUrl: '',
          });
        });
    }
  }, [programId]);

  // 동적 섹션 스키마 로딩 (slug 기반 진입 시)
  useEffect(() => {
    if (!programId) return;
    // 이미 저장된 스키마가 있으면 재분석하지 않음
    const savedApp = getApplicationByProgramId(programId);
    if (savedApp?.sectionSchema?.sections?.length) return;

    // vault slug인 경우 서버에서 섹션 분석
    const slug = programId;
    setIsLoadingSchema(true);
    vaultService.analyzeSections(slug)
      .then(result => {
        setSectionSchema(result.sections);
        setSectionSchemaSource(result.source);
        // 새 스키마에 맞는 빈 draftSections 초기화
        setDraftSections(prev => {
          const hasContent = Object.values(prev).some(v => typeof v === 'string' && v.trim().length > 0);
          if (hasContent) return prev; // 기존 내용이 있으면 유지
          const newSections: Record<string, string> = {};
          result.sections.forEach(s => { newSections[s.id] = ''; });
          return newSections;
        });
      })
      .catch(() => {
        // 실패 시 기본 스키마 유지
        setSectionSchema(DEFAULT_SECTION_SCHEMA);
        setSectionSchemaSource('default_fallback');
      })
      .finally(() => setIsLoadingSchema(false));
  }, [programId]);

  return {
    company,
    program,
    appId,
    draftSections,
    documentStatus,
    snapshots,
    comments,
    gapAnalysisData,
    isCalendarSynced,
    referenceContext,
    showContextPanel,
    sectionAssignees,
    teamMembers,
    sectionSchema,
    isLoadingSchema,
    sectionSchemaSource,
    setProgram,
    setDraftSections,
    setDocumentStatus,
    setSnapshots,
    setComments,
    setGapAnalysisData,
    setIsCalendarSynced,
    setReferenceContext,
    setShowContextPanel,
    setSectionAssignees,
  };
}
