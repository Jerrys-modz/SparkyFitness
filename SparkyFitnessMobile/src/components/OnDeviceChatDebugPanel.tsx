import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';

import Button from './ui/Button';
import Switch from './ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  formatTrace,
  useOnDeviceChatDebugStore,
} from '../stores/onDeviceChatDebugStore';
import {
  askOnDeviceChat,
  CHAT_TOOL_NAMES,
  getDefaultChatInstructions,
} from '../services/onDeviceChat';

function Row({
  label,
  hint,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-1 pr-3">
        <Text className="text-text-primary text-sm">{label}</Text>
        {hint ? (
          <Text className="text-text-secondary text-xs mt-0.5">{hint}</Text>
        ) : null}
      </View>
      <Switch testID={testID} value={value} onValueChange={onValueChange} />
    </View>
  );
}

/** Knobs and a trace for tuning on-device chat. Lives on the AI settings page. */
export default function OnDeviceChatDebugPanel() {
  const prefs = useAppPreferencesStore();
  const events = useOnDeviceChatDebugStore((s) => s.events);
  const clear = useOnDeviceChatDebugStore((s) => s.clear);
  const muted = String(useCSSVariable('--color-text-muted'));
  const [testPrompt, setTestPrompt] = useState('');
  const [testReply, setTestReply] = useState('');
  const [running, setRunning] = useState(false);

  const runTest = async () => {
    const text = testPrompt.trim();
    if (!text || running) return;
    setRunning(true);
    setTestReply('');
    try {
      setTestReply(await askOnDeviceChat([{ role: 'user', text }]));
    } catch (error) {
      setTestReply(`Error: ${error instanceof Error ? error.message : error}`);
    } finally {
      setRunning(false);
    }
  };

  const loadDefaultPrompt = () =>
    prefs.setOnDeviceChatSystemPrompt(getDefaultChatInstructions());

  return (
    <View testID="chat-debug-panel">
      <Text className="text-text-primary text-base font-semibold mb-1">
        Chat testing
      </Text>
      <Text className="text-text-secondary text-sm mb-3">
        Tune and inspect on-device chat. Changes apply to the next message.
      </Text>

      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        <Row
          testID="chat-debug-trace-switch"
          label="Record a trace"
          hint="Prompts, tool calls with timings, and replies."
          value={prefs.onDeviceChatDebug}
          onValueChange={prefs.setOnDeviceChatDebug}
        />
        <Row
          testID="chat-debug-greedy-switch"
          label="Repeatable replies"
          hint="Greedy decoding: the same message gives the same answer."
          value={prefs.onDeviceChatGreedy}
          onValueChange={prefs.setOnDeviceChatGreedy}
        />
        <Row
          testID="chat-debug-context-switch"
          label="Send today's diary snapshot"
          hint="Turn off to see how it answers without any data."
          value={prefs.onDeviceChatIncludeContext}
          onValueChange={prefs.setOnDeviceChatIncludeContext}
        />
      </View>

      <Text className="text-text-primary text-sm font-semibold mb-1">
        Server tool budget (tokens)
      </Text>
      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        <TextInput
          testID="chat-debug-tool-budget"
          keyboardType="number-pad"
          value={String(prefs.onDeviceChatToolBudget)}
          onChangeText={(text) => {
            const value = parseInt(text, 10);
            if (Number.isFinite(value)) prefs.setOnDeviceChatToolBudget(value);
          }}
          className="text-text-primary text-sm"
        />
        <Text className="text-text-secondary text-xs mt-1">
          How much of the model&apos;s window the lent server tools may use. The
          rest of the window holds your messages, the diary snapshot and the
          answer. Tools that do not fit are left out; the trace shows how many
          were kept.
        </Text>
      </View>

      <Text className="text-text-primary text-sm font-semibold mb-1">
        Tools
      </Text>
      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        {CHAT_TOOL_NAMES.map((tool) => (
          <Row
            key={tool}
            testID={`chat-debug-tool-${tool}`}
            label={tool}
            value={!prefs.onDeviceChatDisabledTools.includes(tool)}
            onValueChange={(on) => prefs.setOnDeviceChatToolEnabled(tool, on)}
          />
        ))}
      </View>

      <Text className="text-text-primary text-sm font-semibold mb-1">
        System prompt
      </Text>
      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        <TextInput
          testID="chat-debug-prompt-input"
          multiline
          value={prefs.onDeviceChatSystemPrompt}
          onChangeText={prefs.setOnDeviceChatSystemPrompt}
          placeholder="Empty uses the built-in prompt"
          placeholderTextColor={muted}
          autoCapitalize="none"
          className="text-text-primary text-xs min-h-[120px]"
          style={{ textAlignVertical: 'top' }}
        />
        <View className="flex-row gap-2 mt-2">
          <Button
            variant="outline"
            onPress={loadDefaultPrompt}
            testID="chat-debug-load-default"
          >
            Load built-in
          </Button>
          <Button
            variant="ghost"
            onPress={() => prefs.setOnDeviceChatSystemPrompt('')}
            testID="chat-debug-reset-prompt"
          >
            Reset
          </Button>
        </View>
      </View>

      <Text className="text-text-primary text-sm font-semibold mb-1">
        Test a message
      </Text>
      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        <TextInput
          testID="chat-debug-test-input"
          value={testPrompt}
          onChangeText={setTestPrompt}
          placeholder="e.g. log 500 ml of water"
          placeholderTextColor={muted}
          className="text-text-primary text-sm"
        />
        <View className="mt-2">
          <Button
            variant="primary"
            onPress={() => void runTest()}
            disabled={running || !testPrompt.trim()}
            testID="chat-debug-run"
          >
            {running ? 'Running…' : 'Run'}
          </Button>
        </View>
        {running ? <ActivityIndicator className="mt-2" /> : null}
        {testReply ? (
          <Text
            testID="chat-debug-test-reply"
            selectable
            className="text-text-primary text-sm mt-3"
          >
            {testReply}
          </Text>
        ) : null}
      </View>

      <Text className="text-text-primary text-sm font-semibold mb-1">
        Trace ({events.length})
      </Text>
      <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
        {events.length === 0 ? (
          <Text className="text-text-secondary text-xs">
            Nothing recorded. Turn on “Record a trace”, then send a message.
          </Text>
        ) : (
          <Text
            testID="chat-debug-trace"
            selectable
            className="text-text-primary text-xs"
            style={{ fontFamily: 'Menlo' }}
          >
            {formatTrace(events)}
          </Text>
        )}
        <View className="flex-row gap-2 mt-2">
          <Button
            variant="outline"
            onPress={() => Clipboard.setString(formatTrace(events))}
            disabled={events.length === 0}
            testID="chat-debug-copy"
          >
            Copy
          </Button>
          <Button variant="ghost" onPress={clear} testID="chat-debug-clear">
            Clear
          </Button>
        </View>
      </View>
    </View>
  );
}
