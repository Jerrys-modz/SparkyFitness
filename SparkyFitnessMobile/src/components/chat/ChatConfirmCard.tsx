import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useChatConfirmStore } from '../../stores/chatConfirmStore';

/** The question the on-device model asks before it saves anything. */
export default function ChatConfirmCard() {
  const pending = useChatConfirmStore((s) => s.pending);
  const answer = useChatConfirmStore((s) => s.answer);

  useEffect(() => {
    const { addHost, removeHost } = useChatConfirmStore.getState();
    addHost();
    return removeHost;
  }, []);

  if (!pending) return null;

  return (
    <View
      testID="chat-confirm-card"
      className="mx-3 mb-2 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <Text className="text-text-primary text-base font-semibold">
        {pending.title}
      </Text>
      <Text className="text-text-secondary text-sm mt-1">
        {pending.message}
      </Text>
      <View className="flex-row gap-2 mt-3">
        <Pressable
          testID="chat-confirm-cancel"
          accessibilityRole="button"
          onPress={() => answer(false)}
          className="flex-1 items-center rounded-xl bg-raised py-3 active:opacity-70"
        >
          <Text className="text-text-primary text-sm font-semibold">
            Cancel
          </Text>
        </Pressable>
        <Pressable
          testID="chat-confirm-ok"
          accessibilityRole="button"
          onPress={() => answer(true)}
          className="flex-1 items-center rounded-xl bg-accent-primary py-3 active:opacity-70"
        >
          <Text className="text-white text-sm font-semibold">
            {pending.confirmText}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
