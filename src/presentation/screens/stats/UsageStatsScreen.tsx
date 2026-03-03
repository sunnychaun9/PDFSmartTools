import React, { useEffect, useState, memo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeScreen, Header } from '../../components/layout';
import { Text, Card, Icon } from '../../components/ui';
import { useTheme } from '../../context';
import { colors, spacing, borderRadius, typography } from '../../../theme';
import {
  getUsageStats,
  formatBytes,
  getMostUsedTool,
  getAchievements,
  type UsageStats,
} from '../../../domain/stats/usageStatsService';

const TOOL_LABELS: Record<string, string> = {
  compress: 'Compress',
  merge: 'Merge',
  split: 'Split',
  sign: 'Sign',
  scan: 'Scan',
  ocr: 'OCR',
  image_to_pdf: 'Image to PDF',
  pdf_to_image: 'PDF to Image',
  protect: 'Protect',
  unlock: 'Unlock',
  word_to_pdf: 'Word to PDF',
  pdf_to_word: 'PDF to Word',
  organize: 'Organize',
};

function UsageStatsScreen() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    getUsageStats().then(setStats);
  }, []);

  if (!stats) return null;

  const mostUsed = getMostUsedTool(stats);
  const achievements = getAchievements(stats);
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <SafeScreen>
      <Header title="Usage Stats" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: `${colors.primary}10` }]}>
            <Text variant="h1" style={[styles.statValue, { color: colors.primary }]}>
              {stats.totalOperations}
            </Text>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Operations
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: `${colors.success}10` }]}>
            <Text variant="h1" style={[styles.statValue, { color: colors.success }]}>
              {formatBytes(stats.totalBytesSaved)}
            </Text>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Space Saved
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: `${colors.warning}10` }]}>
            <Text variant="h1" style={[styles.statValue, { color: colors.warning }]}>
              {stats.totalPagesProcessed}
            </Text>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Pages Processed
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: `${colors.info}10` }]}>
            <Text variant="h1" style={[styles.statValue, { color: colors.info }]}>
              {stats.streakDays}
            </Text>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Day Streak
            </Text>
          </View>
        </View>

        {/* Most Used Tool */}
        {mostUsed && (
          <Card style={styles.section}>
            <Text variant="h3" style={{ color: theme.textPrimary, marginBottom: spacing.sm }}>
              Most Used Tool
            </Text>
            <View style={styles.mostUsedRow}>
              <Icon name="star" size={20} color={colors.warning} />
              <Text variant="body" style={{ color: theme.textPrimary, marginLeft: spacing.sm }}>
                {TOOL_LABELS[mostUsed.type] || mostUsed.type}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.textTertiary, marginLeft: 'auto' }}>
                {mostUsed.count} times
              </Text>
            </View>
          </Card>
        )}

        {/* This Week Activity */}
        <Card style={styles.section}>
          <Text variant="h3" style={{ color: theme.textPrimary, marginBottom: spacing.md }}>
            This Week
          </Text>
          <View style={styles.weekChart}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => {
              const value = stats.weeklyOperations[index] || 0;
              const maxValue = Math.max(...stats.weeklyOperations, 1);
              const height = Math.max(4, (value / maxValue) * 60);
              const isToday = new Date().getDay() === index;

              return (
                <View key={index} style={styles.weekBarContainer}>
                  <View
                    style={[
                      styles.weekBar,
                      {
                        height,
                        backgroundColor: isToday ? colors.primary : `${colors.primary}40`,
                      },
                    ]}
                  />
                  <Text
                    variant="caption"
                    style={{
                      color: isToday ? colors.primary : theme.textTertiary,
                      fontWeight: isToday ? '700' : '400',
                      marginTop: 4,
                    }}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Achievements */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3" style={{ color: theme.textPrimary }}>
              Achievements
            </Text>
            <Text variant="bodySmall" style={{ color: theme.textTertiary }}>
              {earnedCount}/{achievements.length}
            </Text>
          </View>
          {achievements.map((achievement) => (
            <View
              key={achievement.id}
              style={[
                styles.achievementRow,
                { opacity: achievement.earned ? 1 : 0.4 },
              ]}
            >
              <View
                style={[
                  styles.achievementIcon,
                  {
                    backgroundColor: achievement.earned
                      ? `${colors.warning}20`
                      : `${theme.textTertiary}10`,
                  },
                ]}
              >
                <Icon
                  name={achievement.earned ? 'star' : 'lock'}
                  size={18}
                  color={achievement.earned ? colors.warning : theme.textTertiary}
                />
              </View>
              <View style={styles.achievementText}>
                <Text variant="body" style={{ color: theme.textPrimary, fontWeight: '600' }}>
                  {achievement.title}
                </Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  {achievement.description}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
  },
  section: {
    marginBottom: spacing.lg,
  },
  mostUsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weekChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 80,
  },
  weekBarContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  weekBar: {
    width: 24,
    borderRadius: 4,
    minHeight: 4,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  achievementIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  achievementText: {
    flex: 1,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});

export default memo(UsageStatsScreen);
