/**
 * Settings screen — language picker, manage categories (add/edit/delete),
 * main currency picker, and a manual sync trigger placeholder.
 *
 * Lighter than the web frontend's settings — font-size override, dark/
 * light toggle, and the export/import dialog are deferred. Cloud-drive
 * sign-in is a button stub for now; real Drive/OneDrive auth + picker is
 * the next milestone.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Dialog,
  Divider,
  IconButton,
  List,
  Portal,
  RadioButton,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';

import { ThemedButton as Button } from '../src/components/ThemedButton';
import { AppDialog } from '../src/components/AppDialog';
import { CategoryAvatar } from '../src/components/CategoryAvatar';
import { ExportImportDialog } from '../src/components/ExportImportDialog';
import { ThemeModePickerDialog } from '../src/components/ThemeModePickerDialog';
import { FontSizePickerDialog } from '../src/components/FontSizePickerDialog';
import { CurrencyPickerDialog as CurrencyPickerDialogV2 } from '../src/components/CurrencyPickerDialog';
import {
  useCategories,
  useCategoryCatalog,
  useCreateCategory,
  useDeleteCategory,
  useMergeCategories,
  useResetCategoriesToDefaults,
  useRestoreCategory,
  useUpdateCategory,
} from '../src/hooks/useCategories';
import { useCategoryLookup } from '../src/hooks/useCategoryLookup';
import {
  useFontScale,
  useMainCurrency,
  useThemeMode,
} from '../src/context/preferencesProvider';
import { setLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from '../src/i18n';
import { ICON_KEYS, AVAILABLE_COLORS, getMaterialIconName } from '../src/utils/categoryConfig';
import { findDuplicateCustoms } from '../src/utils/duplicateMatching';
import type { Category } from '../src/domain/types';

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CZK', 'PLN', 'UAH', 'CHF', 'JPY'];

export default function SettingsScreen() {
  const { t: translate, i18n } = useTranslation();
  const { mainCurrency, setMainCurrency } = useMainCurrency();
  const { themeMode, setThemeMode } = useThemeMode();
  const { fontScale, setFontScale } = useFontScale();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  return (
    <>
      <Stack.Screen options={{ title: translate('nav.settings') }} />
      <ScrollView>
        <List.Section>
          <List.Item
            title={translate('settings.language')}
            description={
              SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.nativeLabel ??
              i18n.language
            }
            left={(props) => <List.Icon {...props} icon="translate" />}
            onPress={() => setLanguageOpen(true)}
          />
          <Divider />
          <List.Item
            title={translate('settings.currency')}
            description={mainCurrency}
            left={(props) => <List.Icon {...props} icon="currency-usd" />}
            onPress={() => setCurrencyOpen(true)}
          />
          <Divider />
          <List.Item
            title={translate('settings.darkMode')}
            description={translate(`settings.themeMode.${themeMode}`)}
            left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
            onPress={() => setThemeOpen(true)}
          />
          <Divider />
          <List.Item
            title={translate('settings.fontSize')}
            description={translate(`settings.fontScale.${fontScale}`)}
            left={(props) => <List.Icon {...props} icon="format-size" />}
            onPress={() => setFontOpen(true)}
          />
          <Divider />
          <List.Item
            title={translate('settings.manageCategories')}
            left={(props) => <List.Icon {...props} icon="shape-outline" />}
            onPress={() => setManageOpen(true)}
          />
          <Divider />
          <List.Item
            title={translate('settings.exportImport')}
            left={(props) => <List.Icon {...props} icon="swap-vertical" />}
            onPress={() => setExchangeOpen(true)}
          />
        </List.Section>

        {statusMsg ? (
          <Text
            style={{
              textAlign: 'center',
              paddingHorizontal: 24,
              paddingVertical: 8,
            }}
          >
            {statusMsg}
          </Text>
        ) : null}
      </ScrollView>

      <LanguageDialog visible={languageOpen} onDismiss={() => setLanguageOpen(false)} />
      <CurrencyPickerDialogV2
        visible={currencyOpen}
        selected={mainCurrency}
        onDismiss={() => setCurrencyOpen(false)}
        onPick={(c) => {
          setMainCurrency(c);
          setCurrencyOpen(false);
        }}
      />
      <ThemeModePickerDialog
        visible={themeOpen}
        value={themeMode}
        onDismiss={() => setThemeOpen(false)}
        onPick={(m) => {
          setThemeMode(m);
          setThemeOpen(false);
        }}
      />
      <FontSizePickerDialog
        visible={fontOpen}
        value={fontScale}
        onDismiss={() => setFontOpen(false)}
        onPick={(s) => {
          setFontScale(s);
          setFontOpen(false);
        }}
      />
      <ManageCategoriesDialog
        visible={manageOpen}
        onDismiss={() => setManageOpen(false)}
        onShowStatus={showStatus}
      />
      <ExportImportDialog
        visible={exchangeOpen}
        onDismiss={() => setExchangeOpen(false)}
        onShowStatus={showStatus}
      />
    </>
  );
}

function LanguageDialog({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { t: translate, i18n } = useTranslation();
  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('languageDialog.title')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <RadioButton.Group
          value={i18n.language}
          onValueChange={(code) => {
            void setLanguage(code as LanguageCode).then(onDismiss);
          }}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <RadioButton.Item key={l.code} value={l.code} label={l.nativeLabel} />
          ))}
        </RadioButton.Group>
      </Dialog.Content>
    </AppDialog>
  );
}

function CurrencyDialog({
  visible,
  onDismiss,
  currency,
  onPick,
}: {
  visible: boolean;
  onDismiss: () => void;
  currency: string;
  onPick: (c: string) => void;
}) {
  const { t: translate } = useTranslation();
  // Kept for backward compatibility with any imports outside this file —
  // the SettingsScreen now uses the richer `<CurrencyPickerDialog>` from
  // src/components. Older callers still see the simpler list here.
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{translate('currencyDialog.title')}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView>
            {COMMON_CURRENCIES.map((c) => (
              <List.Item
                key={c}
                title={c}
                onPress={() => onPick(c)}
                right={(props) =>
                  c === currency ? <List.Icon {...props} icon="check" /> : null
                }
              />
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
      </Dialog>
    </Portal>
  );
}
// Suppress "unused" warnings on the inline `CurrencyDialog` — it stays
// as a low-cost fallback we may revive if `<CurrencyPickerDialog>` is
// ever swapped out for testing.
void CurrencyDialog;

function ManageCategoriesDialog({
  visible,
  onDismiss,
  onShowStatus,
}: {
  visible: boolean;
  onDismiss: () => void;
  onShowStatus: (msg: string) => void;
}) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const { categories: active } = useCategories();
  const { categories: catalog } = useCategoryCatalog();
  const lookup = useCategoryLookup();
  const deleteCategory = useDeleteCategory();
  const restoreCategory = useRestoreCategory();
  const mergeCategories = useMergeCategories();
  const resetCategories = useResetCategoriesToDefaults();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [mergeSource, setMergeSource] = useState<Category | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const archived = catalog.filter((c) => c.deleted);

  return (
    <>
      <AppDialog
        visible={visible && editing === null && mergeSource === null && !resetConfirmOpen}
        onDismiss={onDismiss}
        title={translate('categoryDialog.manageTitle')}
      >
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView>
              {active.length === 0 ? (
                <Text style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
                  {translate('categoryDialog.empty')}
                </Text>
              ) : (
                active.map((c) => {
                  const r = lookup.resolve(c.id);
                  return (
                    <TouchableRipple
                      key={c.id}
                      onPress={() => setEditing(c)}
                      accessibilityLabel={translate('categoryDialog.editAriaLabel', { name: r.name })}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingHorizontal: 24,
                          paddingVertical: 8,
                        }}
                      >
                        <CategoryAvatar iconName={r.iconName} color={r.color} />
                        <Text variant="bodyLarge" style={{ flex: 1 }} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <IconButton
                          icon="call-merge"
                          size={20}
                          accessibilityLabel={translate('categoryDialog.mergeAriaLabel', { name: r.name })}
                          onPress={() => setMergeSource(c)}
                        />
                        <IconButton
                          icon="delete-outline"
                          size={20}
                          onPress={() => void deleteCategory.mutateAsync(c.id)}
                        />
                      </View>
                    </TouchableRipple>
                  );
                })
              )}

              {archived.length > 0 ? (
                <>
                  <Text
                    variant="labelLarge"
                    style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}
                  >
                    {translate('categoryDialog.restoreButton')}
                  </Text>
                  {archived.map((c) => {
                    const r = lookup.resolve(c.id);
                    return (
                      <View
                        key={c.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingHorizontal: 24,
                          paddingVertical: 8,
                          opacity: 0.7,
                        }}
                      >
                        <CategoryAvatar iconName={r.iconName} color={r.color} />
                        <Text variant="bodyLarge" style={{ flex: 1 }} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <IconButton
                          icon="restore"
                          size={20}
                          onPress={() => void restoreCategory.mutateAsync(c.id)}
                        />
                      </View>
                    );
                  })}
                </>
              ) : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button
              onPress={() => setResetConfirmOpen(true)}
              textColor={theme.colors.error}
            >
              {translate('settings.resetCategories')}
            </Button>
            <Button onPress={() => setEditing('new')}>{translate('common.add')}</Button>
          </Dialog.Actions>
        </AppDialog>

      {editing !== null ? (
        <CategoryFormDialog
          visible
          category={editing === 'new' ? null : editing}
          onDismiss={() => setEditing(null)}
        />
      ) : null}

      {mergeSource ? (
        <MergeCategoryDialog
          source={mergeSource}
          onDismiss={() => setMergeSource(null)}
          onConfirm={async (targetId) => {
            const sourceId = mergeSource.id;
            setMergeSource(null);
            try {
              await mergeCategories.mutateAsync({ sourceId, targetId });
            } catch (e) {
              console.warn('Merge failed', e);
            }
          }}
        />
      ) : null}

      <AppDialog
        visible={resetConfirmOpen}
        onDismiss={() => setResetConfirmOpen(false)}
        title={translate('categoryDialog.resetTitle')}
        showCloseButton={false}
      >
        <Dialog.Content>
          <Text>{translate('categoryDialog.resetConfirm')}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setResetConfirmOpen(false)}>{translate('common.cancel')}</Button>
          <Button
            mode="contained"
            onPress={async () => {
              setResetConfirmOpen(false);
              try {
                const r = await resetCategories.mutateAsync();
                onDismiss();
                onShowStatus(translate('settings.resetSuccess', { archived: r.archived, seeded: r.seeded }));
              } catch (e) {
                onShowStatus(translate('settings.resetError'));
                console.warn('Reset failed', e);
              }
            }}
          >
            {translate('categoryDialog.resetButton')}
          </Button>
        </Dialog.Actions>
      </AppDialog>
    </>
  );
}

function MergeCategoryDialog({
  source,
  onDismiss,
  onConfirm,
}: {
  source: Category;
  onDismiss: () => void;
  onConfirm: (targetId: string) => void;
}) {
  const { t: translate } = useTranslation();
  const { categories } = useCategories();
  const lookup = useCategoryLookup();
  const sourceName = lookup.resolve(source.id).name;
  const targets = categories.filter((c) => c.id !== source.id);

  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss} style={{ maxHeight: '85%' }}>
        <Dialog.Title>{translate('categoryDialog.mergeTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
            {translate('categoryDialog.mergePickPrompt', { name: sourceName }).replace(/<\/?\d+>/g, '')}
          </Text>
        </Dialog.Content>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView>
            {targets.map((c) => {
              const r = lookup.resolve(c.id);
              return (
                <TouchableRipple
                  key={c.id}
                  onPress={() => onConfirm(c.id)}
                  style={{ paddingHorizontal: 24, paddingVertical: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <CategoryAvatar iconName={r.iconName} color={r.color} />
                    <Text variant="bodyLarge">{r.name}</Text>
                  </View>
                </TouchableRipple>
              );
            })}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{translate('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function CategoryFormDialog({
  visible,
  category,
  onDismiss,
}: {
  visible: boolean;
  category: Category | null;
  onDismiss: () => void;
}) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const restoreCategory = useRestoreCategory();
  const { categories: catalog } = useCategoryCatalog();

  // For templated rows the displayed label comes from i18n; the user
  // overrides it by typing a name, so we start with an empty string for
  // those (matches the web frontend's "clear override" semantics).
  const [name, setName] = useState(category?.name ?? '');
  const [iconKey, setIconKey] = useState(category?.icon ?? ICON_KEYS[0]!);
  const [color, setColor] = useState(category?.color ?? AVAILABLE_COLORS[0]!);
  const [submitting, setSubmitting] = useState(false);
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false);

  // Only run duplicate detection when creating a brand-new category;
  // editing an existing row is allowed to keep the same name.
  const dup = !category ? findDuplicateCustoms(catalog, name) : null;
  const dupActive = dup?.active ?? null;
  const dupArchived = dup?.archived ?? [];

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!category && (dupActive || dupArchived.length > 0)) {
      setDuplicatePromptOpen(true);
      return;
    }
    await persist();
  };

  const persist = async () => {
    setSubmitting(true);
    try {
      if (category) {
        await updateCategory.mutateAsync({
          id: category.id,
          cmd: { name: name.trim(), icon: iconKey, color },
        });
      } else {
        await createCategory.mutateAsync({ name: name.trim(), icon: iconKey, color });
      }
      onDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <AppDialog
      visible={visible && !duplicatePromptOpen}
      onDismiss={onDismiss}
      title={category ? translate('categoryDialog.editTitle') : translate('categoryDialog.addTitle')}
    >
      <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8, gap: 16 }}>
          <TextInput
            mode="outlined"
            label={translate('categoryDialog.name')}
            value={name}
            onChangeText={setName}
          />

          <Text variant="labelLarge">{translate('categoryDialog.icon')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ICON_KEYS.map((key) => {
              const selected = key === iconKey;
              return (
                <TouchableRipple
                  key={key}
                  onPress={() => setIconKey(key)}
                  borderless
                  style={{
                    borderRadius: 24,
                    borderWidth: selected ? 2 : 0,
                    borderColor: selected ? theme.colors.primary : 'transparent',
                  }}
                >
                  <CategoryAvatar iconName={getMaterialIconName(key)} color={color} />
                </TouchableRipple>
              );
            })}
          </View>

          <Text variant="labelLarge">{translate('categoryDialog.color')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AVAILABLE_COLORS.map((c) => {
              const selected = c === color;
              return (
                <TouchableRipple
                  key={c}
                  onPress={() => setColor(c)}
                  borderless
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c,
                    borderWidth: selected ? 3 : 0,
                    borderColor: selected ? theme.colors.onSurface : 'transparent',
                  }}
                >
                  <View />
                </TouchableRipple>
              );
            })}
          </View>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button mode="contained" onPress={handleSave} loading={submitting} disabled={submitting}>
          {translate('common.save')}
        </Button>
      </Dialog.Actions>
    </AppDialog>

    <Portal>
      <Dialog visible={duplicatePromptOpen} onDismiss={() => setDuplicatePromptOpen(false)}>
        <Dialog.Title>
          {dupActive
            ? translate('categoryDialog.duplicateActiveTitle')
            : translate('categoryDialog.duplicateArchivedTitle')}
        </Dialog.Title>
        <Dialog.Content>
          <Text>
            {(dupActive
              ? translate('categoryDialog.duplicateActiveBody', { name: name.trim() })
              : translate('categoryDialog.duplicateArchivedBody', { name: name.trim() })
            ).replace(/<\/?\d+>/g, '')}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          {dupActive ? (
            <Button
              onPress={() => {
                setDuplicatePromptOpen(false);
                onDismiss();
              }}
            >
              {translate('categoryDialog.useExistingButton')}
            </Button>
          ) : null}
          {dupArchived.length > 0 && !dupActive ? (
            <Button
              onPress={async () => {
                setDuplicatePromptOpen(false);
                const first = dupArchived[0];
                if (first) await restoreCategory.mutateAsync(first.id);
                onDismiss();
              }}
            >
              {translate('categoryDialog.restoreButton')}
            </Button>
          ) : null}
          <Button
            onPress={async () => {
              setDuplicatePromptOpen(false);
              await persist();
            }}
          >
            {dupActive
              ? translate('categoryDialog.createAnywayButton')
              : translate('categoryDialog.createNewButton')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
    </>
  );
}
