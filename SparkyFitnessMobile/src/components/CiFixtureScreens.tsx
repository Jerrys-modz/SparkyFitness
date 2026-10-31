import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActivityRingsCard from './ActivityRingsCard';
import HealthTrendTiles from './HealthTrendTiles';
import {
  buildActivityRings,
  resolveActivityRingKeys,
} from '../utils/activityRings';
import type { HealthTrendsData } from './HealthTrendChart';

/**
 * CI-only: the iOS screenshot job has no server to load a Dashboard from, so it renders
 * the new cards from sample data instead. Cycles through scenes so one run photographs
 * each; only mounted when the build sets EXPO_PUBLIC_CI_FIXTURES=1.
 */
const SCENE_SECONDS = 15;

const VALUES = {
  move: { current: 320, goal: 500 },
  exercise: { current: 42, goal: 30 },
  steps: { current: 6800, goal: 10000 },
  points: { current: 26, goal: 22 },
};

const days = Array.from(
  { length: 7 },
  (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`
);

const SAMPLE: HealthTrendsData = {
  steps: {
    data: days.map((day, i) => ({ day, steps: 5200 + i * 650 })),
    isLoading: false,
    isError: false,
  },
  weight: {
    data: days.map((day, i) => ({ day, weight: 82 - i * 0.2 })),
    isLoading: false,
    isError: false,
  },
  sleep: {
    data: days.map((day) => ({
      day,
      timeInBedSeconds: 8 * 3600,
      timeAsleepSeconds: 7.2 * 3600,
      segments: [],
      zone: null,
    })),
    averageTimeInBedSeconds: 8 * 3600,
    averageTimeAsleepSeconds: 7.2 * 3600,
    nightsWithData: 7,
    isLoading: false,
    isError: false,
  },
  hydration: {
    data: days.map((day, i) => ({ day, milliliters: 1800 + i * 100 })),
    isLoading: false,
    isError: false,
  },
  calories: {
    data: days.map((day, i) => ({
      day,
      calories: 2100 + i * 40,
      protein: 130,
      carbs: 230,
      fat: 70,
    })),
    averageCalories: 2200,
    calorieGoals: days.map(() => 2300),
    isLoading: false,
    isError: false,
  },
  range: '7d',
  weightUnit: 'kg',
  waterUnit: 'ml',
};

const SCENES = [
  {
    title: 'Activity rings: Move & Exercise',
    render: () => (
      <ActivityRingsCard
        rings={buildActivityRings(resolveActivityRingKeys('apple', []), VALUES)}
      />
    ),
  },
  {
    title: 'Activity rings: Minutes & Points',
    render: () => (
      <ActivityRingsCard
        rings={buildActivityRings(
          resolveActivityRingKeys('google', []),
          VALUES
        )}
      />
    ),
  },
  {
    title: 'Activity rings: Custom, four rings',
    render: () => (
      <ActivityRingsCard
        rings={buildActivityRings(
          resolveActivityRingKeys('custom', [
            'move',
            'exercise',
            'steps',
            'points',
          ]),
          VALUES
        )}
      />
    ),
  },
  {
    title: 'Health trend tiles',
    render: () => (
      <HealthTrendTiles
        {...SAMPLE}
        tileTrends={['steps', 'weight', 'sleep', 'calories']}
      />
    ),
  },
] as const;

const CiFixtureScreens: React.FC = () => {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setScene((s) => (s + 1) % SCENES.length),
      SCENE_SECONDS * 1000
    );
    return () => clearInterval(id);
  }, []);
  const current = SCENES[scene];
  return (
    <NavigationContainer>
      <SafeAreaView className="flex-1 bg-background">
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="mb-3">
            <Text className="text-text-primary text-lg font-bold">
              {current.title}
            </Text>
          </View>
          {current.render()}
        </ScrollView>
      </SafeAreaView>
    </NavigationContainer>
  );
};

export default CiFixtureScreens;
