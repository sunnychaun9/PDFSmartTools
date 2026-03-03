import React, { memo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '../../../components/ui';
import { spacing, borderRadius } from '../../../../theme';

export type FailureEntry = {
  timestamp: number;
  engineTag: string;
  errorCode: string;
  errorMessage: string;
};

type Props = {
  entries: FailureEntry[];
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function FailureLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <Text variant="caption" style={styles.placeholder}>
          No failures recorded.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {entries.map((entry, index) => (
          <View key={`${entry.timestamp}-${index}`} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text variant="caption" style={styles.timestamp}>
                {formatTime(entry.timestamp)}
              </Text>
              <View style={styles.tagBadge}>
                <Text variant="caption" style={styles.tagText}>
                  {entry.engineTag}
                </Text>
              </View>
              <View style={styles.codeBadge}>
                <Text variant="caption" style={styles.codeText}>
                  {entry.errorCode}
                </Text>
              </View>
            </View>
            <Text variant="caption" style={styles.message} numberOfLines={3}>
              {entry.errorMessage}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: 250,
  },
  placeholder: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  entry: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  timestamp: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  tagBadge: {
    backgroundColor: '#334155',
    borderRadius: borderRadius.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  tagText: {
    color: '#CBD5E1',
    fontSize: 9,
    fontWeight: '600',
  },
  codeBadge: {
    backgroundColor: '#7F1D1D',
    borderRadius: borderRadius.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  codeText: {
    color: '#FCA5A5',
    fontSize: 9,
    fontWeight: '600',
  },
  message: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
});

export default memo(FailureLog);
