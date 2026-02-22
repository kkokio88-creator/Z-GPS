import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { KeyRound, ExternalLink, Save, CheckCircle2, Info, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <CheckCircle2 className="h-4 w-4 mr-1" />
      저장되었습니다
    </span>
  );
};

interface ApiTabProps {
  apiKey: string;
  dartApiKey: string;
  npsApiKey: string;
  aiModel: string;
  apiSaved: boolean;
  onApiKeyChange: (v: string) => void;
  onDartApiKeyChange: (v: string) => void;
  onNpsApiKeyChange: (v: string) => void;
  onAiModelChange: (v: string) => void;
  onSave: () => void;
}

const ApiTab: React.FC<ApiTabProps> = ({
  apiKey,
  dartApiKey,
  npsApiKey,
  aiModel,
  apiSaved,
  onApiKeyChange,
  onDartApiKeyChange,
  onNpsApiKeyChange,
  onAiModelChange,
  onSave,
}) => {
  const [npsGuideOpen, setNpsGuideOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" />
              API 설정
            </CardTitle>
            <InlineSaveMessage show={apiSaved} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">Gemini API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={e => onApiKeyChange(e.target.value)}
                placeholder="Gemini API 키를 입력하세요"
                className="flex-1"
              />
              <Button asChild variant="default" size="sm" className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> 발급
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Google AI Studio에서 무료로 발급 가능합니다</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">Open DART API Key (선택)</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={dartApiKey}
                onChange={e => onDartApiKeyChange(e.target.value)}
                placeholder="DART API 키를 입력하세요"
                className="flex-1"
              />
              <Button asChild variant="secondary" size="sm" className="whitespace-nowrap">
                <a href="https://opendart.fss.or.kr/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> 발급
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">금융감독원 전자공시 데이터 조회용</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">공공데이터포털 API Key (국민연금)</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={npsApiKey}
                onChange={e => onNpsApiKeyChange(e.target.value)}
                placeholder="공공데이터포털 인증키를 입력하세요"
                className="flex-1"
              />
              <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap">
                <a href="https://www.data.go.kr/data/3046071/openapi.do" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> 신청
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">국민연금 사업장 정보 API를 연결하면 세금 환급 분석의 정확도가 높아집니다</p>
            <button
              type="button"
              onClick={() => setNpsGuideOpen(v => !v)}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
            >
              {npsGuideOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
              연결 방법 안내
            </button>
            {npsGuideOpen && (
              <ol className="mt-2 ml-4 text-xs text-muted-foreground space-y-1 list-decimal">
                <li>data.go.kr 회원가입 (공공데이터포털)</li>
                <li>'국민연금공단_국민연금 사업장 정보' API 신청</li>
                <li>즉시 승인 — 발급된 인증키를 위 필드에 입력</li>
                <li>저장 후 세금 환급 탭에서 재스캔</li>
              </ol>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">AI 모델</Label>
            <select
              value={aiModel}
              onChange={e => onAiModelChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (빠름)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (정확)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            </select>
          </div>

          <Button onClick={onSave} className="w-full bg-foreground text-background hover:bg-foreground/90">
            <Save className="h-4 w-4 mr-2" />
            API 설정 저장
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiTab;
