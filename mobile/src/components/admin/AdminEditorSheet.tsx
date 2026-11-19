import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Every admin add/edit form lives behind Add/Edit and opens here, above the
 * list it belongs to, instead of reflowing the screen inline. Staff see the
 * form only while they are editing; closing the sheet returns them to the
 * unchanged list.
 *
 * `full` presents a whole-screen editor (product/service editors already own
 * their header and Save/Cancel row); the default is a bottom sheet for the
 * compact record editors, whose header carries the Cancel action every inline
 * form used to have.
 *
 * 2026-11-19 (owner: the add/import/edit windows "don't display properly on
 * the phone"): a Modal does not move for the keyboard by itself, so the field
 * being typed into could sit under it — the sheet now shrinks for the keyboard
 * and keeps the home-indicator inset clear at the bottom.
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
  // A full-screen editor replaces the whole surface, so nothing else supplies
  // the status-bar inset — without it the form starts flush against the top
  // edge (owner report: "the new product page is on too top part of the
  // screen").
  const insets = useSafeAreaInsets();
  // iOS needs the explicit padding; Android's modal window already resizes
  // (adjustResize), and adding a second behaviour there shrinks it twice.
  const keyboard = Platform.OS === "ios" ? "padding" : undefined;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={!full}
      onRequestClose={onClose}
    >
      {full ? (
        <KeyboardAvoidingView
          behavior={keyboard}
          className="flex-1 bg-card"
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
            {children}
          </View>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView
          behavior={keyboard}
          className="flex-1 justify-end bg-ink/40"
        >
          <View
            className="max-h-[92%] w-full rounded-t-3xl border-t border-line bg-card"
            style={{ paddingBottom: insets.bottom }}
          >
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
                accessibilityLabel="Cancel"
                className="rounded-full border border-line px-3 py-1"
              >
                <Text className="text-xs font-bold text-ink">Cancel</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}
