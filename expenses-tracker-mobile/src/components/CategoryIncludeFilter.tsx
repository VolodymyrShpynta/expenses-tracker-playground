/**
 * Include-style category filter row.
 *
 *   [avatar Name ×] [avatar Name ×] [+ Add]
 *
 * Semantics:
 *  - Empty `includeIds`     → caller filters nothing (everything visible).
 *  - Non-empty `includeIds` → caller restricts data to only those categories.
 *
 * The Add pill is rendered with a `TouchableRipple` (not Paper's `Chip`)
 * so its height matches the inline selected pills exactly — Paper's
 * outlined Chip is taller than our custom-height filter pills, which
 * makes the wrapped row look uneven (a "+ Add…" chip floating above
 * the others). Keeping both pill kinds in the same component
 * guarantees they stay in lock-step.
 *
 * Shared between the Transactions filter row and the Overview filter,
 * so any visual tweak applies everywhere at once.
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { CategoryAvatar } from './CategoryAvatar';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { useCategoryLookup } from '../hooks/useCategoryLookup';

export interface CategoryIncludeFilterProps {
  readonly includeIds: ReadonlyArray<string>;
  readonly availableCategoryIds: ReadonlySet<string>;
  readonly onAddInclude: (id: string) => void;
  readonly onRemoveInclude: (id: string) => void;
  /** Visible label for the "+ Add" pill (e.g. "Add…"). */
  readonly addLabel: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function CategoryIncludeFilter({
  includeIds,
  availableCategoryIds,
  onAddInclude,
  onRemoveInclude,
  addLabel,
  style,
}: CategoryIncludeFilterProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const lookup = useCategoryLookup();
  const [pickerOpen, setPickerOpen] = useState(false);

  const canAdd = availableCategoryIds.size > 0;
  // Nothing to show: no chips and nothing left to add.
  if (includeIds.length === 0 && !canAdd) return null;

  return (
    <>
      <View
        style={[
          {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
          },
          style,
        ]}
      >
        {includeIds.map((id) => {
          const r = lookup.resolve(id);
          // Custom inline pill (not Paper's `Chip`): Paper positions its
          // close icon with `position: 'absolute'` under a column-flex
          // Surface, which interacts badly with wrapping parents and can
          // push the × below the label. A single flex row sidesteps
          // that entirely.
          return (
            <TouchableRipple
              key={`inc-${id}`}
              onPress={() => onRemoveInclude(id)}
              borderless
              accessibilityRole="button"
              accessibilityLabel={translate('transactions.removeFilter', {
                name: r.name,
              })}
              style={{
                backgroundColor: theme.colors.secondaryContainer,
                borderRadius: 16,
                paddingLeft: 4,
                paddingRight: 8,
                paddingVertical: 4,
                minHeight: 32,
                justifyContent: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CategoryAvatar iconName={r.iconName} color={r.color} size={24} />
                <Text
                  variant="labelLarge"
                  style={{ color: theme.colors.onSecondaryContainer }}
                >
                  {r.name}
                </Text>
                <MaterialIcons
                  name="close"
                  size={16}
                  color={theme.colors.onSecondaryContainer}
                />
              </View>
            </TouchableRipple>
          );
        })}
        {canAdd ? (
          <TouchableRipple
            onPress={() => setPickerOpen(true)}
            borderless
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.outline,
              paddingLeft: 8,
              paddingRight: 12,
              // Selected pills are 32 px tall (24 avatar + 4*2 padding).
              // Mirror that exactly so the wrap row stays visually
              // aligned regardless of how many chips fit per row.
              minHeight: 32,
              justifyContent: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialIcons
                name="add"
                size={18}
                color={theme.colors.onSurface}
              />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>
                {addLabel}
              </Text>
            </View>
          </TouchableRipple>
        ) : null}
      </View>
      <CategoryPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        availableIds={availableCategoryIds}
        onPick={(id) => {
          onAddInclude(id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
