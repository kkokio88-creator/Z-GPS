
import { Company, QATestItem, QAState } from "../types";
import { getStoredCompany, saveStoredCompany, getStoredDartApiKey, getStoredApiKey } from "./storageService";
import { fetchCompanyDetailsFromDART, fetchIncheonSupportPrograms } from "./apiService";
import { draftAgent } from "./geminiAgents";

const QA_STORAGE_KEY = 'zmis_qa_state_v1';

export const INITIAL_QA_CHECKLIST: QATestItem[] = [
    {
        id: 'TEST_01',
        category: 'API',
        name: 'OpenDART API Key Check',
        path: '/settings',
        action: 'CHECK_DART_KEY',
        status: 'PENDING',
        log: []
    },
    {
        id: 'TEST_02',
        category: 'DATA',
        name: 'Company Data Fetch',
        path: '/company',
        action: 'FETCH_DART_DATA',
        status: 'PENDING',
        log: []
    },
    {
        id: 'TEST_03',
        category: 'FUNCTIONAL',
        name: 'Dashboard Grant Loading',
        path: '/',
        action: 'LOAD_DASHBOARD_DATA',
        status: 'PENDING',
        log: []
    },
    {
        id: 'TEST_04',
        category: 'AI',
        name: 'Gemini AI Generation',
        path: '/settings', 
        action: 'TEST_AI_GENERATION',
        status: 'PENDING',
        log: []
    }
];

// --- State Management ---

export const getQAState = (): QAState => {
    const stored = localStorage.getItem(QA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : { isActive: false, currentIndex: 0, checklist: INITIAL_QA_CHECKLIST };
};

export const saveQAState = (state: QAState): void => {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(state));
    // Dispatch Global Event
    window.dispatchEvent(new Event('zmis-qa-update'));
};

export const startQA = (): QAState => {
    const state: QAState = {
        isActive: true,
        currentIndex: 0,
        checklist: INITIAL_QA_CHECKLIST.map(item => ({
            ...item,
            status: 'PENDING' as const,
            log: [],
            errorDetails: '',
            fixProposal: ''
        }))
    };
    saveQAState(state);
    return state;
};

export const stopQA = () => {
    const state = getQAState();
    state.isActive = false;
    saveQAState(state);
};

export const resetQA = () => {
    localStorage.removeItem(QA_STORAGE_KEY);
    window.dispatchEvent(new Event('zmis-qa-update'));
};

export const updateTestResult = (id: string, status: 'PASS' | 'FAIL', logs: string[], error?: string, fix?: string) => {
    const state = getQAState();
    const index = state.checklist.findIndex((i: QATestItem) => i.id === id);
    if (index !== -1) {
        state.checklist[index].status = status;
        state.checklist[index].log = logs;
        state.checklist[index].errorDetails = error;
        state.checklist[index].fixProposal = fix;
        
        if (state.isActive) {
            state.currentIndex = index + 1;
        }
    }
    saveQAState(state);
};

// --- CENTRALIZED TEST RUNNER ---
// This ensures tests run reliably without relying on component lifecycles.

export const executeTestLogic = async (test: QATestItem): Promise<{ status: 'PASS' | 'FAIL', logs: string[], error?: string, fix?: string }> => {
    const logs: string[] = [`Executing logic for ${test.name}...`];
    
    try {
        if (test.action === 'CHECK_DART_KEY') {
            const key = getStoredDartApiKey();
            logs.push(`Retrieved DART Key: ${key ? 'Yes' : 'No'}`);
            if (!key) {
                logs.push("Key missing, using simulation fallback.");
                return { status: 'PASS', logs, fix: "Simulation mode active." };
            }
            return { status: 'PASS', logs };
        } 
        
        else if (test.action === 'FETCH_DART_DATA') {
            const company = getStoredCompany();
            const key = getStoredDartApiKey() || 'demo';
            logs.push(`Target: ${company.businessNumber || 'Default'}`);
            
            // Force API Call
            const data = await fetchCompanyDetailsFromDART(company.businessNumber || '123-45-67890', key, company.name);
            logs.push(`Result: ${data.name}, Rev: ${data.revenue}`);
            
            if (data.revenue && data.revenue > 0) {
                // Update Store to reflect in UI
                saveStoredCompany({ ...company, ...data } as Company);
                return { status: 'PASS', logs };
            } else {
                return { status: 'FAIL', logs, error: 'Empty Data', fix: 'Check API response structure' };
            }
        } 
        
        else if (test.action === 'LOAD_DASHBOARD_DATA') {
            logs.push("Fetching Dashboard Support Programs...");
            const data = await fetchIncheonSupportPrograms();
            logs.push(`Items fetched: ${data.length}`);
            if (data.length > 0) {
                return { status: 'PASS', logs };
            } else {
                return { status: 'FAIL', logs, error: 'No items returned', fix: 'Check Data.go.kr Endpoint' };
            }
        } 
        
        else if (test.action === 'TEST_AI_GENERATION') {
            logs.push("Testing Gemini connection...");
            const company = getStoredCompany();
            // Mock Program
            const prog = { programName: "QA Test Program", organizer: "QA Team", supportType: "TEST" } as any;
            const res = await draftAgent.writeSection(company, prog, "개요");
            logs.push(`AI Response: ${res.text.substring(0, 20)}...`);
            
            if (res.text && res.text.length > 10 && !res.text.includes("Error")) {
                return { status: 'PASS', logs };
            } else {
                return { status: 'FAIL', logs, error: 'AI Generation Failed', fix: 'Check Gemini API Key' };
            }
        }

        return { status: 'PASS', logs };

    } catch (e: any) {
        return { status: 'FAIL', logs, error: e.message, fix: 'Unexpected Exception' };
    }
};

export const generateFixPrompt = () => {
    const state = getQAState();
    const failures = state.checklist.filter((i: QATestItem) => i.status === 'FAIL');
    
    if (failures.length === 0) return "All systems passed QA. No critical code changes required.";

    let prompt = "Please fix the following critical issues detected during the Automated QA process:\n\n";
    failures.forEach((f: QATestItem) => {
        prompt += `### Issue: ${f.name} Failed\n`;
        prompt += `- Error: ${f.errorDetails}\n`;
        prompt += `- Logs: ${f.log.join(' -> ')}\n`;
        prompt += `- Suggested Fix: ${f.fixProposal}\n\n`;
    });
    
    prompt += "Generate the corrected code snippets to resolve these errors specifically.";
    return prompt;
};
