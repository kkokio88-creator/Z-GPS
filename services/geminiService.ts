import { Company, SupportProgram, EligibilityStatus } from "../types";
import { apiClient } from "./apiClient";

interface GeminiResponse {
  text: string;
  candidates?: unknown[];
}

const callGemini = async (model: string, contents: string | unknown, config?: Record<string, unknown>): Promise<GeminiResponse> => {
  const { data } = await apiClient.post<GeminiResponse>('/api/gemini/generate', {
    model,
    contents,
    config,
  });
  return data;
};

// 1. Evaluate Suitability (Batch or Single)
export const evaluateProgramSuitability = async (
  company: Company,
  program: SupportProgram
): Promise<Partial<SupportProgram>> => {
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
    const response = await callGemini('gemini-2.0-flash', prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          fitScore: { type: "INTEGER" },
          expectedGrant: { type: "INTEGER" },
          eligibility: { type: "STRING", enum: ["POSSIBLE", "IMPOSSIBLE", "REVIEW_NEEDED"] },
          eligibilityReason: { type: "STRING" },
          successProbability: { type: "STRING" }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");

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
        const response = await callGemini('gemini-2.0-flash', prompt, {
          responseMimeType: "application/json"
        });
        const json = JSON.parse(response.text || "{}");
        return {
            requiredDocuments: json.documents || [],
            advice: json.advice || ""
        };
    } catch {
        return { requiredDocuments: [], advice: "Analysis failed." };
    }
};

// 3. Draft Generation
export const generateDraftSection = async (
  company: Company,
  program: SupportProgram,
  sectionTitle: string
): Promise<string> => {
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

    const response = await callGemini('gemini-2.0-flash', prompt);
    return response.text || "Failed to generate text.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating draft.";
  }
};
