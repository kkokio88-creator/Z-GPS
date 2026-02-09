/**
 * 지원서 편집기 핵심 state 관리
 */
import React, { useState, useEffect } from 'react';
import { INITIAL_APPLICATION } from '../constants';
import { getStoredCompany, getApplicationByProgramId, getTeamMembers } from '../services/storageService';
import { SupportProgram, DraftSnapshot, DraftComment, Company, EligibilityStatus } from '../types';

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
    }
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
