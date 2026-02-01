import { Application, Company } from "../types";
import { getStoredApplications, getStoredCompany, saveStoredCompany } from "./storageService";
import { ontologyLearningAgent } from "./geminiAgents";

/**
 * Ontology Engine (온톨로지 엔진)
 * 
 * 시스템이 도메인으로부터 학습할수록 성능이 향상되도록 하는 핵심 모듈입니다.
 * 1. 완료된 지원서(Application)를 AI로 분석하여 성공적인 키워드 패턴을 추출합니다.
 * 2. 추출된 키워드를 Company Profile의 'preferredKeywords'에 병합합니다.
 */

export const learnFromApplication = async (application: Application) => {
  const company = getStoredCompany();
  if (!company) return;

  // 1. 작성된 지원서 초안 텍스트 수집
  const allText = Object.values(application.draftSections).join("\n\n");
  
  console.log("🧠 Ontology Engine: Analyzing draft for learning...");
  
  // 2. Gemini Agent를 통한 핵심 패턴 추출
  const learnedKeywords = await ontologyLearningAgent.extractSuccessPatterns(allText);

  if (learnedKeywords.length === 0) return;

  // 3. 회사 온톨로지 업데이트 (기존 키워드 + 새로운 키워드)
  const currentKeywords = new Set(company.preferredKeywords || []);
  learnedKeywords.forEach(k => currentKeywords.add(k));

  const updatedCompany: Company = {
    ...company,
    preferredKeywords: Array.from(currentKeywords).slice(0, 30) // 최대 30개 키워드 유지
  };

  saveStoredCompany(updatedCompany);
  console.log("🧠 Ontology Engine: Updated successfully.", updatedCompany.preferredKeywords);
};

export const getContextForDrafting = (): string => {
  const company = getStoredCompany();
  if (!company || !company.preferredKeywords || company.preferredKeywords.length === 0) {
    return "";
  }

  return `
    [Ontology Memory - Preferred Styles & Keywords]
    The user prefers using these business keywords/concepts: ${company.preferredKeywords.join(", ")}.
    Ensure these core competencies are emphasized in the draft to match the company's successful patterns.
  `;
};