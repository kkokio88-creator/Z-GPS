import { create } from 'zustand';
import { QAState, QATestItem } from '../../types';

const QA_STORAGE_KEY = 'zmis_qa_state_v1';

interface QAStoreState {
  qaState: QAState;
  setQAState: (state: QAState) => void;
  resetQAState: () => void;
}

const INITIAL_QA_STATE: QAState = {
  isActive: false,
  currentIndex: 0,
  checklist: [],
};

const loadFromStorage = (): QAState => {
  const stored = localStorage.getItem(QA_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      if (import.meta.env.DEV) console.warn('[qaStore] Failed to parse QA state');
    }
  }
  return INITIAL_QA_STATE;
};

export const useQAStore = create<QAStoreState>((set) => ({
  qaState: loadFromStorage(),

  setQAState: (state: QAState) => {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(state));
    set({ qaState: state });
  },

  resetQAState: () => {
    localStorage.removeItem(QA_STORAGE_KEY);
    set({ qaState: INITIAL_QA_STATE });
  },
}));
