/**
 * AI 도구 관련 state 관리 (생성, 개선, 번역, 음성, 매직 툴바)
 */
import { useState, useRef } from 'react';
import { ReviewResult } from '../types';
import { ReviewPersona } from '../services/geminiAgents';

interface SourceItem {
  title: string;
  uri: string;
}

export function useAITools() {
  // AI generation states
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<string | null>(null);
  const [isAnalyzingDocs, setIsAnalyzingDocs] = useState(false);
  const [aiAdvice, setAiAdvice] = useState('');
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [sourcesMap, setSourcesMap] = useState<Record<string, SourceItem[]>>({});

  // Settings
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [reviewPersona, setReviewPersona] = useState<ReviewPersona>('GENERAL');

  // Review
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  // Translation / Audio
  const [isGlobalMode, setIsGlobalMode] = useState(false);
  const [translatedSections, setTranslatedSections] = useState<Record<string, string>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Magic Toolbar
  const [showMagicToolbar, setShowMagicToolbar] = useState(false);
  const [activeSectionForToolbar, setActiveSectionForToolbar] = useState<string | null>(null);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // Comments
  const [activeCommentSection, setActiveCommentSection] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Refs
  const fileImportRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return {
    isGenerating, setIsGenerating,
    isRefining, setIsRefining,
    isListening, setIsListening,
    isAnalyzingDocs, setIsAnalyzingDocs,
    aiAdvice, setAiAdvice,
    isSyncingCalendar, setIsSyncingCalendar,
    sourcesMap, setSourcesMap,
    useSearchGrounding, setUseSearchGrounding,
    reviewPersona, setReviewPersona,
    reviewResult, setReviewResult,
    isReviewing, setIsReviewing,
    isGlobalMode, setIsGlobalMode,
    translatedSections, setTranslatedSections,
    isPlayingAudio, setIsPlayingAudio,
    isImporting, setIsImporting,
    showMagicToolbar, setShowMagicToolbar,
    activeSectionForToolbar, setActiveSectionForToolbar,
    magicInstruction, setMagicInstruction,
    selectedText, setSelectedText,
    selectionRange, setSelectionRange,
    activeCommentSection, setActiveCommentSection,
    newCommentText, setNewCommentText,
    fileImportRef,
    mediaRecorderRef,
    audioChunksRef,
    audioContextRef,
    sectionRefs,
  };
}
