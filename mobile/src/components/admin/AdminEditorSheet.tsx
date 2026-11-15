import { Modal, Pressable, ScrollView, Text, View } from "react-native";

/**
 * Every admin add/edit form lives behind Add/Edit and opens here, above the
 * list it belongs to, instead of reflowing the screen inline. Staff see the
 * form only while they are editing; closing the sheet returns them to the
 * unchanged list.
 *
 * `full` presents a whole-screen editor (product/service editors already own
 * their header and Save/Cancel row); the default is a bottom sheet for the
 * compact record editors.
 */
export function AdminEditorSheet({
  visible,
  title,
  hint,
  onClose,
  full = false,
  children,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={!full}
      onRequestClose={onClose}
    >
      {full ? (
        <View className="flex-1 bg-card">{children}</View>
      ) : (
        <View className="flex-1 justify-end bg-ink/40">
          <View className="max-h-[92%] w-full rounded-t-3xl border-t border-line bg-card">
            <View className="flex-row items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
              <View className="min-w-0 flex-1">
                <Text className="font-display text-base font-bold text-ink">
                  {title}
                </Text>
                {hint ? (
                  <Text className="mt-0.5 text-xs leading-5 text-muted">
                    {hint}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close editor"
                className="rounded-full border border-line px-3 py-1"
              >
                <Text className="text-xs font-bold text-ink">Close</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}
