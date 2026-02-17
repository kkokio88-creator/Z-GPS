import { create } from 'zustand';
import { Company } from '../../types';

const COMPANY_KEY = 'zmis_company_v2';

function getInitialCompany(): Company | null {
  const stored = localStorage.getItem(COMPANY_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.id) return parsed as Company;
    } catch { /* ignore */ }
  }
  return null;
}

interface CompanyState {
  company: Company | null;
  setCompany: (company: Company | null) => void;
  loadCompany: () => void;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  company: getInitialCompany(),

  setCompany: (company: Company | null) => {
    if (company !== null) {
      localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
    }
    set({ company });
  },

  loadCompany: () => {
    const stored = localStorage.getItem(COMPANY_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) {
          set({ company: parsed });
          return;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error('[companyStore] Failed to parse stored company', e);
      }
    }
    // Fallback: import default from constants (lazy to avoid circular deps)
    import('../../constants').then(({ COMPANIES }) => {
      const defaultCompany = COMPANIES[0];
      localStorage.setItem(COMPANY_KEY, JSON.stringify(defaultCompany));
      set({ company: defaultCompany });
    });
  },
}));
