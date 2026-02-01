import { GoogleGenAI, Type } from "@google/genai";
import { Company, SupportProgram, EligibilityStatus } from "../types";

const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

// 1. Evaluate Suitability (Batch or Single)
export const evaluateProgramSuitability = async (
  company: Company,
  program: SupportProgram
): Promise<Partial<SupportProgram>> => {
  if (!apiKey) {
    // Fallback for demo without key
    return {
      fitScore: Math.floor(Math.random() * 40) + 60,
      expectedGrant: 50000000,
      eligibility: EligibilityStatus.POSSIBLE,
      eligibilityReason: "데모 모드: 키 확인 필요",
      successProbability: "Medium"
    };
  }

  const prompt = `
    Analyze the compatibility between the following company and government support program.
    
    Company Profile:
    - Name: ${company.name} (Business No: ${company.businessNumber})
    - Industry: ${company.industry}
    - Revenue: ${company.revenue} KRW
    - Employees: ${company.employees}
    - Location: ${company.address}
    - Description: ${company.description}

    Support Program:
    - Name: ${program.programName}
    - Organizer: ${program.organizer}
    - Type: ${program.supportType}
    - Description: ${program.description}

    Task:
    1. Calculate a 'fitScore' (0-100) based on industry relevance, location match, and eligibility.
    2. Estimate 'expectedGrant' (in KRW) based on typical Korean government standards for this type of program (e.g., Facility improvement ~50M, R&D ~100M+).
    3. Determine 'eligibility' (POSSIBLE, IMPOSSIBLE, REVIEW_NEEDED).
    4. Provide a short 'eligibilityReason' (Korean).
    5. Estimate 'successProbability' (High, Medium, Low).

    Return ONLY JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                fitScore: { type: Type.INTEGER },
                expectedGrant: { type: Type.INTEGER },
                eligibility: { type: Type.STRING, enum: ["POSSIBLE", "IMPOSSIBLE", "REVIEW_NEEDED"] },
                eligibilityReason: { type: Type.STRING },
                successProbability: { type: Type.STRING }
            }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Map string enum to Typescript Enum
    let status = EligibilityStatus.REVIEW_NEEDED;
    if (result.eligibility === "POSSIBLE") status = EligibilityStatus.POSSIBLE;
    if (result.eligibility === "IMPOSSIBLE") status = EligibilityStatus.IMPOSSIBLE;

    return {
      fitScore: result.fitScore || 0,
      expectedGrant: result.expectedGrant || 0,
      eligibility: status,
      eligibilityReason: result.eligibilityReason || "분석 실패",
      successProbability: result.successProbability || "Low"
    };

  } catch (error) {
    console.error("AI Evaluation Error:", error);
    return {
       eligibilityReason: "AI 분석 중 오류 발생"
    };
  }
};

// 2. Extract Requirements & Docs
export const analyzeProgramRequirements = async (
    program: SupportProgram,
    company: Company
): Promise<{ requiredDocuments: string[]; advice: string }> => {
    if (!apiKey) {
        return {
            requiredDocuments: ["사업자등록증", "부가가치세과세표준증명", "국세납세증명서"],
            advice: "API Key required for real analysis."
        };
    }

    const prompt = `
      Based on the program "${program.programName}" (${program.supportType}) by "${program.organizer}",
      and considering the company "${company.name}" (Food/Service industry),
      
      1. List the specific standard documents usually required for this type of Korean government grant.
      2. Provide brief advice on what to emphasize in the application.

      Output JSON format:
      {
        "documents": ["doc1", "doc2", ...],
        "advice": "..."
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || "{}");
        return {
            requiredDocuments: json.documents || [],
            advice: json.advice || ""
        };
    } catch (e) {
        return { requiredDocuments: [], advice: "Analysis failed." };
    }
}

// 3. Draft Generation (Existing but refined)
export const generateDraftSection = async (
  company: Company,
  program: SupportProgram,
  sectionTitle: string
): Promise<string> => {
  if (!apiKey) {
    return `[AI Draft Demo] Content for ${sectionTitle}...`;
  }

  try {
    const prompt = `
      Role: Professional Government Grant Consultant.
      Context: Writing an application for "${program.programName}".
      Company: "${company.name}" (${company.description}).
      
      Task: Write the "${sectionTitle}" section.
      Style: Formal, persuasive, data-driven.
      Language: Korean.
      Length: ~400 characters.
      
      Key Points to emphasize:
      - For Food industry: Hygiene, Local sourcing, HACCP, Export potential.
      - Align with program nature (${program.supportType}).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Failed to generate text.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating draft.";
  }
};
