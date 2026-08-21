import { create } from 'zustand';

interface SelectionStore {
  selectedPieceCode: string | null;
  setSelectedPieceCode: (code: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  selectedPieceCode: null,
  setSelectedPieceCode: (code) => set({ selectedPieceCode: code }),
  clearSelection: () => set({ selectedPieceCode: null }),
}));
