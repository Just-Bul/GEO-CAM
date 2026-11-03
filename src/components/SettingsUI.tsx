import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

export function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  label,
  value,
  description,
  onPress,
  icon,
  destructive,
}: {
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}) {
  const trailing = icon ?? (onPress ? 'chevron-forward' : undefined);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.label, destructive && { color: colors.danger }]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailing ? <Ionicons name={trailing} size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export function ChoiceRow<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.rowColumn}>
      <Text style={styles.label}>{label}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.choices} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.rowColumn}>
      <View style={styles.sliderHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{format(value)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onSlidingComplete={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function TextRow({
  label,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.rowColumn}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        defaultValue={value}
        onEndEditing={(event) => onChange(event.nativeEvent.text)}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        maxLength={maxLength}
        style={styles.input}
        accessibilityLabel={label}
        returnKeyType="done"
      />
    </View>
  );
}

export const settingsStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
});

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, overflow: 'hidden' },
  footer: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm, marginHorizontal: spacing.xs, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowColumn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 15 },
  description: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  value: { color: colors.textMuted, fontSize: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: 'rgba(47,140,255,0.15)' },
  choiceText: { color: colors.textMuted, fontSize: 13 },
  choiceTextSelected: { color: colors.white, fontWeight: '600' },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
});
