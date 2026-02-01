import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, saveStoredCompany, getStoredCompany } from '../services/storageService';
import { fetchCompanyDetailsFromDART } from '../services/apiService';
import { Company } from '../types';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [bizNum, setBizNum] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatBizNum = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 5)}-${numbers.slice(5, 10)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBizNum(formatBizNum(e.target.value));
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    
    // Validation
    const rawNum = bizNum.replace(/-/g, '');
    if (rawNum.length < 10) {
        setError('사업자등록번호 10자리를 정확히 입력해주세요.');
        return;
    }

    setIsLoading(true);
    setError('');

    try {
        // --- DATA PERSISTENCE SAFEGUARD ---
        // 1. Check if we already have data for this company
        const existingData = getStoredCompany();
        const existingRawNum = existingData?.businessNumber?.replace(/-/g, '');

        if (existingData && existingRawNum === rawNum && existingData.name !== '신규 기업') {
            // Data exists! Do NOT overwrite. Just login.
            console.log("Restoring existing session data...");
            loginUser(rawNum);
            navigate('/');
            return;
        }
        // ----------------------------------

        // 2. If no data exists (or new user), proceed to fetch/create
        let companyData: Partial<Company> = {};
        
        try {
            companyData = await fetchCompanyDetailsFromDART(bizNum, 'demo_check');
        } catch (err) {
            companyData = {
                name: '(주)미등록기업',
                businessNumber: bizNum,
                industry: '-',
                description: '정보 연동이 필요합니다.',
                revenue: 0,
                employees: 0,
                isVerified: false
            };
        }

        const newProfile: Company = {
            id: `comp_${rawNum}`,
            name: companyData.name || '신규 기업',
            businessNumber: bizNum,
            industry: companyData.industry || '-',
            description: companyData.description || '',
            revenue: companyData.revenue || 0,
            employees: companyData.employees || 0,
            address: companyData.address || '',
            isVerified: companyData.isVerified || false,
            financials: companyData.financials || [],
            ipList: [],
            documents: [],
            preferredKeywords: []
        };

        saveStoredCompany(newProfile);
        loginUser(rawNum);

        navigate('/');

    } catch (err) {
        console.error(err);
        setError('로그인 처리 중 오류가 발생했습니다.');
        setIsLoading(false);
    }
  };

  const handleReset = () => {
      if(window.confirm("저장된 모든 데이터를 삭제하고 새로운 기업으로 시작하시겠습니까?")) {
          localStorage.clear();
          window.location.reload();
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-gray-900 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>

      <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl w-full max-w-md border border-border-light dark:border-border-dark relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-green-600 rounded-xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <span className="material-icons-outlined text-3xl text-white">business</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Z-GPS 시작하기</h1>
          <p className="text-sm text-gray-500 mt-2">기업 식별을 위해 사업자등록번호를 입력해주세요.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">사업자등록번호</label>
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-gray-400 material-icons-outlined text-lg">badge</span>
              <input 
                type="text" 
                value={bizNum}
                onChange={handleChange}
                maxLength={12}
                placeholder="000-00-00000"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-lg font-mono tracking-wide"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-xs flex items-center bg-red-50 p-3 rounded-lg border border-red-100 animate-pulse">
              <span className="material-icons-outlined text-sm mr-2">error</span> {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading || bizNum.length < 10}
            className={`w-full font-bold py-3.5 rounded-lg shadow-md transition-all transform active:scale-95 flex items-center justify-center ${
                isLoading || bizNum.length < 10 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-primary hover:bg-primary-dark text-white'
            }`}
          >
            {isLoading ? (
                <>
                    <span className="material-icons-outlined animate-spin mr-2">refresh</span>
                    정보 확인 중...
                </>
            ) : '확인 및 시작하기'}
          </button>
        </form>
        
        <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4 text-center">
            <p className="text-xs text-gray-400 mb-2">
                <span className="material-icons-outlined text-[10px] align-middle mr-1">lock</span>
                입력하신 정보는 로컬 기기에만 저장됩니다.
            </p>
            <button onClick={handleReset} className="text-xs text-indigo-500 hover:text-indigo-700 underline">
                다른 사업자번호로 테스트 (데이터 초기화)
            </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;