import { Alert } from 'react-native';
import { create } from 'zustand';

export interface ChatConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
}

interface Pending extends ChatConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

interface ChatConfirmState {
  /** How many chat screens are showing the confirmation card. */
  hosts: number;
  pending: Pending | null;
  addHost: () => void;
  removeHost: () => void;
  answer: (confirmed: boolean) => void;
}

export const useChatConfirmStore = create<ChatConfirmState>((set, get) => ({
  hosts: 0,
  pending: null,
  addHost: () => set((s) => ({ hosts: s.hosts + 1 })),
  removeHost: () => {
    const hosts = Math.max(0, get().hosts - 1);
    // A card that goes away unanswered counts as a no.
    if (hosts === 0) get().pending?.resolve(false);
    set({ hosts, pending: hosts === 0 ? null : get().pending });
  },
  answer: (confirmed) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(confirmed);
  },
}));

/**
 * Asks the user to confirm a write the on-device model wants to make. Shows a
 * card in the chat when the chat screen is open, and a system alert otherwise
 * (for example from the test box in AI settings).
 */
export function requestChatConfirm(
  request: ChatConfirmRequest
): Promise<boolean> {
  const { hosts } = useChatConfirmStore.getState();
  if (hosts === 0) {
    return new Promise((resolve) => {
      Alert.alert(
        request.title,
        request.message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: request.confirmText, onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  }
  return new Promise((resolve) => {
    // Only one question at a time; a new one replaces an unanswered one.
    useChatConfirmStore.getState().pending?.resolve(false);
    useChatConfirmStore.setState({ pending: { ...request, resolve } });
  });
}
