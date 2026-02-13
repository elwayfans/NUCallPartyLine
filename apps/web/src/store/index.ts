import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Contact, Campaign, Call } from '../services/api';

interface AppState {
  // Selected contacts for campaign creation
  selectedContactIds: Set<string>;
  toggleContactSelection: (id: string) => void;
  selectContacts: (ids: string[]) => void;
  clearContactSelection: () => void;

  // Active campaign tracking
  activeCampaignId: string | null;
  setActiveCampaignId: (id: string | null) => void;

  // Real-time call status cache
  callStatuses: Map<string, { status: string; updatedAt: Date }>;
  updateCallStatus: (callId: string, status: string) => void;

  // Campaign progress cache
  campaignProgress: Map<
    string,
    { completedCalls: number; failedCalls: number; totalContacts: number }
  >;
  updateCampaignProgress: (
    campaignId: string,
    progress: { completedCalls: number; failedCalls: number; totalContacts: number }
  ) => void;
}

export const useStore = create<AppState>()(
  devtools(
    (set) => ({
      // Contact selection
      selectedContactIds: new Set(),

      toggleContactSelection: (id) =>
        set((state) => {
          const newSet = new Set(state.selectedContactIds);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
          return { selectedContactIds: newSet };
        }),

      selectContacts: (ids) =>
        set(() => ({
          selectedContactIds: new Set(ids),
        })),

      clearContactSelection: () =>
        set(() => ({
          selectedContactIds: new Set(),
        })),

      // Active campaign
      activeCampaignId: null,
      setActiveCampaignId: (id) => set({ activeCampaignId: id }),

      // Call status
      callStatuses: new Map(),
      updateCallStatus: (callId, status) =>
        set((state) => {
          const newMap = new Map(state.callStatuses);
          newMap.set(callId, { status, updatedAt: new Date() });
          return { callStatuses: newMap };
        }),

      // Campaign progress
      campaignProgress: new Map(),
      updateCampaignProgress: (campaignId, progress) =>
        set((state) => {
          const newMap = new Map(state.campaignProgress);
          newMap.set(campaignId, progress);
          return { campaignProgress: newMap };
        }),
    }),
    { name: 'app-store' }
  )
);
