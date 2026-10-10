import React from 'react';
import { Text, View } from 'react-native';

export interface ReportSummaryRow {
  label: string;
  value: string;
  /** A smaller second line under the value, e.g. a change against the previous period. */
  hint?: string;
  testID?: string;
}

/** A titled card of label / value rows, the summary block under a report's charts. */
const ReportSummaryCard: React.FC<{
  title: string;
  rows: ReportSummaryRow[];
}> = ({ title, rows }) => (
  <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
    <Text className="text-text-primary text-lg font-semibold mb-2">
      {title}
    </Text>
    {rows.map((row, index) => (
      <View
        key={row.label}
        testID={row.testID}
        className={`flex-row justify-between py-2 ${
          index < rows.length - 1 ? 'border-b border-border-subtle' : ''
        }`}
      >
        <Text className="text-text-secondary text-sm flex-1 mr-3">
          {row.label}
        </Text>
        <View className="items-end">
          <Text className="text-text-primary text-sm font-semibold">
            {row.value}
          </Text>
          {row.hint ? (
            <Text className="text-text-muted text-xs mt-0.5">{row.hint}</Text>
          ) : null}
        </View>
      </View>
    ))}
  </View>
);

export default ReportSummaryCard;
