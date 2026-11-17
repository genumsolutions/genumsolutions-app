// Shared admin section strip (app).
//
// Both the console (Dashboard/Orders/Content/Users sections) and the 3D
// Products print studio render a second-level tab row under the eight top
// tabs. They used to be two hand-copied pill strips that drifted apart in
// size, casing and selected treatment. One component keeps the admin
// hierarchy honest: the top tab strip owns uppercase + wide tracking, and
// these section pills sit one level BELOW it (sentence case, xs body size,
// tighter height) so the eye can tell tabs from subtabs at a glance.
//
// Colour/weight follow TYPE_SCALE.md: display headings carry the size
// hierarchy, UI labels are Inter, and the selected pill reuses the navy
// emphasis already used by the primary buttons.
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export function AdminSubTabs<T extends string>({
  label,
  options,
  value,
  labels,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  /**
   * Display text per option, when the stored value is not what staff should
   * read. Two different managers are both called "Services" (storefront and
   * print) and one tab was literally labelled with its parent's name; the
   * value stays stable for the code, only the label changes.
   */
  labels?: Partial<Record<T, string>>;
  onChange: (next: T) => void;
}) {
  return (
    <View
      role="tablist"
      aria-label={label}
      className="shrink-0 border-b border-line bg-card"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={labels?.[option] ?? option}
              tabIndex={selected ? 0 : -1}
              className={`h-8 shrink-0 items-center justify-center rounded-full border px-3 ${
                selected ? "border-navy bg-navy" : "border-line bg-card"
              }`}
            >
              <Text
                numberOfLines={1}
                className={`text-xs font-bold ${
                  selected ? "text-white" : "text-muted"
                }`}
              >
                {labels?.[option] ?? option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default AdminSubTabs;
