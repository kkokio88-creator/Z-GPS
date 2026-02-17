import React, { useRef, useState, useEffect } from 'react';

interface UseDragHandlerOptions {
  onSwipe: (direction: 'left' | 'right') => void;
  threshold?: number;
}

interface UseDragHandlerResult {
  cardRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  dragOverlay: 'left' | 'right' | null;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

export const useDragHandler = ({ onSwipe, threshold = 120 }: UseDragHandlerOptions): UseDragHandlerResult => {
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const dragXRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverlay, setDragOverlay] = useState<'left' | 'right' | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!cardRef.current) return;
    setIsDragging(true);
    startXRef.current = e.clientX;
    dragXRef.current = 0;
    cardRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startXRef.current;
    dragXRef.current = deltaX;
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 25}deg)`;
    }
    const newOverlay = deltaX > 80 ? 'right' : deltaX < -80 ? 'left' : null;
    if (newOverlay !== dragOverlay) {
      setDragOverlay(newOverlay);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragOverlay(null);
    if (cardRef.current) {
      cardRef.current.releasePointerCapture(e.pointerId);
    }
    const dx = dragXRef.current;
    if (Math.abs(dx) > threshold) {
      onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      dragXRef.current = 0;
      if (cardRef.current) {
        cardRef.current.style.transform = 'none';
        cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => { if (cardRef.current) cardRef.current.style.transition = ''; }, 300);
      }
    }
  };

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onSwipe('left');
      if (e.key === 'ArrowRight') onSwipe('right');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSwipe]);

  return { cardRef, isDragging, dragOverlay, handlePointerDown, handlePointerMove, handlePointerUp };
};
