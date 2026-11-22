import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PICKER_PROGRAMS } from '@workspace/shared';
import RunProgramPickerCard from '../components/recording/RunProgramPickerCard';
import Button from '../components/ui/Button';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useRunProgram } from '../services/runProgramService';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RunProgramBrowse'>;

/**
 * Every built-in training program to look through, week by week, while one is
 * already running. Nothing on this screen changes the person's own program:
 * the only action copies a program into a new plan of their own.
 */
const RunProgramBrowseScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status } = useRunProgram();
  // Which version (3 or 4 runs a week) is picked on a card that has both.
  const [versionOf, setVersionOf] = useState<Record<string, string>>({});

  const header = useScreenHeader({
    title: t('screens.runProgramBrowse', { defaultValue: 'All programs' }),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        testID="run-program-browse"
      >
        <Text className="text-text-secondary text-sm">
          {t('runPrograms.browse.intro', {
            defaultValue:
              'Look through any program, week by week. Nothing here changes the plan you are following.',
          })}
        </Text>
        {PICKER_PROGRAMS.map((basic) => (
          <RunProgramPickerCard
            key={basic.id}
            basic={basic}
            versionId={versionOf[basic.id]}
            onVersion={(id) =>
              setVersionOf((prev) => ({ ...prev, [basic.id]: id }))
            }
            currentId={status?.program.id ?? null}
            renderActions={(program) => (
              <View className="mt-2">
                <Button
                  variant="ghost"
                  onPress={() =>
                    navigation.navigate('RunProgramEdit', {
                      fromProgramId: program.id,
                    })
                  }
                  testID={`browse-customize-${program.id}`}
                >
                  {t('runPrograms.custom.customize', {
                    defaultValue: 'Customize this program',
                  })}
                </Button>
              </View>
            )}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default RunProgramBrowseScreen;
