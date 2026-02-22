import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, saveStoredCompany } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { fetchCompanyDetailsFromDART } from '../services/apiService';
import { Company } from '../types';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Building2, BadgeCheck, AlertCircle, RefreshCw, Lock } from 'lucide-react';

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

    const rawNum = bizNum.replace(/-/g, '');
    if (rawNum.length < 10) {
      setError('사업자등록번호 10자리를 정확히 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const existingData = useCompanyStore.getState().company;
      const existingRawNum = existingData?.businessNumber?.replace(/-/g, '');

      if (existingData && existingRawNum === rawNum && existingData.name !== '신규 기업') {
        loginUser(rawNum);
        navigate('/');
        return;
      }

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

      useCompanyStore.getState().setCompany(newProfile);
      loginUser(rawNum);
      navigate('/');

    } catch (err) {
      console.error(err);
      setError('로그인 처리 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (window.confirm("저장된 모든 데이터를 삭제하고 새로운 기업으로 시작하시겠습니까?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-border">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-green-600 rounded-xl mx-auto flex items-center justify-center shadow-lg mb-4">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Z-GPS 시작하기</h1>
            <p className="text-sm text-muted-foreground mt-2">기업 식별을 위해 사업자등록번호를 입력해주세요.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="biznum" className="font-bold">사업자등록번호</Label>
              <div className="relative">
                <BadgeCheck className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="biznum"
                  type="text"
                  value={bizNum}
                  onChange={handleChange}
                  maxLength={12}
                  placeholder="000-00-00000"
                  className="pl-10 py-3 h-12 text-lg font-mono tracking-wide"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={isLoading || bizNum.length < 10}
              className="w-full h-12 font-bold text-base shadow-md"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  정보 확인 중...
                </>
              ) : '확인 및 시작하기'}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              <Lock className="inline h-3 w-3 align-middle mr-1" />
              입력하신 정보는 로컬 기기에만 저장됩니다.
            </p>
            <button onClick={handleReset} className="text-xs text-indigo-500 hover:text-indigo-700 underline cursor-pointer">
              다른 사업자번호로 테스트 (데이터 초기화)
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
