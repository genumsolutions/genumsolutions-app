// =====================================================================
// SignInSheet - native sign-in / sign-up / forgot-password bottom sheet.
// All auth goes directly to Supabase (no WebView involved).
//
// Mirrors the website's AuthPanel (components/AuthPanel.tsx): one form per
// mode, the primary action, then "or Continue with Google" (sign-in and
// sign-up), then text links to switch modes (never lingering tabs). The
// sheet is capped to the viewport and the body scrolls inside that cap, so
// the Create account / Google buttons can't be pushed off the bottom of a
// small screen with the keyboard open.
// =====================================================================
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabaseConfigured, googleConfigured } from "../config/supabase";
import { useApp } from "../context/AppContext";
import { useViewport } from "../lib/viewport";
import { GoogleLogo } from "./GoogleLogo";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

type Mode = "signin" | "signup" | "forgot";

const labelClass = "mb-1 text-xs font-bold uppercase tracking-wide text-border";

export function SignInSheet({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useViewport();
  const {
    authBusy,
    authError,
    clearAuthError,
    isSignedIn,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    resetPassword,
  } = useApp();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bodyRef = useRef<ScrollView>(null);

  const closeDisabled = authBusy;

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setNotice(null);
    setMode("signin");
    clearAuthError();
  };

  const handleClose = () => {
    if (closeDisabled) return;
    resetForm();
    onRequestClose();
  };

  // A session can land while the sheet is open: Google sign-in returns from the
  // browser, or a token refresh completes. Close the sheet rather than leaving
  // a sign-in / sign-up form sitting over an already signed-in app.
  useEffect(() => {
    if (!visible || !isSignedIn) return;
    resetForm();
    onRequestClose();
  }, [visible, isSignedIn, onRequestClose]);

  // Always reopen on the Sign in tab. A previous visit could be left on Sign up
  // or Reset, which then reads as "create an account" to a returning user.
  useEffect(() => {
    if (visible) setMode("signin");
  }, [visible]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    setShowPassword(false);
    // A previous attempt's error belongs to the form it came from; showing
    // "Invalid login credentials" over the create-account form is confusing.
    clearAuthError();
    bodyRef.current?.scrollTo({ y: 0, animated: false });
  };

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit =
    mode === "forgot"
      ? emailValid && !authBusy
      : mode === "signup"
        ? name.trim().length >= 2 &&
          emailValid &&
          password.length >= 6 &&
          !authBusy
        : emailValid && password.length > 0 && !authBusy;

  const handlePrimary = async () => {
    if (!canSubmit) return;
    if (mode === "signin") {
      const ok = await signInWithPassword(email, password);
      if (ok) resetForm();
    } else if (mode === "signup") {
      const result = await signUp(name, email, password);
      if (result === "ok") resetForm();
      else if (result === "confirm") {
        // Nothing else to do on the create-account form: send them back to
        // Sign in with the confirmation notice, same as the website.
        switchMode("signin");
        setNotice(
          "Account created. Check your email to confirm it, then sign in.",
        );
      }
    } else {
      const ok = await resetPassword(email);
      if (ok) {
        // switchMode clears the notice, so switch first and set it after.
        switchMode("signin");
        setNotice("If that email exists, a reset link has been sent.");
      }
    }
  };

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create account"
        : "Reset password";

  const subtitle =
    mode === "signin"
      ? "Sign in to sync your build list and orders."
      : mode === "signup"
        ? "One account for orders, saved builds, and support."
        : "We’ll email you a link to reset your password.";

  return (
    <Modal
      visible={visible && !isSignedIn}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          disabled={closeDisabled}
        />

        <View
          style={{
            paddingBottom: Math.max(insets.bottom, 12),
            paddingTop: 18,
            maxHeight: height * 0.9,
          }}
          className="rounded-t-3xl bg-card"
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />

          <View className="flex-row items-start justify-between px-5">
            <View className="flex-1 pr-4">
              <Text className="font-display text-xl font-bold tracking-tight text-navy">
                {title}
              </Text>
              <Text className="mt-0.5 text-sm text-muted">{subtitle}</Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={closeDisabled}
              accessibilityLabel="Close sign in"
              className="h-9 w-9 items-center justify-center rounded-full bg-mist"
            >
              <Feather name="x" size={18} color="#1e3a8a" />
            </Pressable>
          </View>

          <ScrollView
            ref={bodyRef}
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 8,
            }}
          >
            {!supabaseConfigured ? (
              <View className="mb-3 rounded-xl border border-line bg-mist px-4 py-3">
                <Text className="text-xs text-muted">
                  Sign-in is not configured in this build yet.
                </Text>
              </View>
            ) : null}

            {notice ? (
              <View className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <Text className="text-xs font-medium text-emerald-700">
                  {notice}
                </Text>
              </View>
            ) : null}

            {authError ? (
              <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <Feather name="alert-circle" size={15} color="#dc2626" />
                <Text className="flex-1 text-xs font-medium text-red-600">
                  {authError}
                </Text>
              </View>
            ) : null}

            {mode === "signup" ? (
              <>
                <Text className={labelClass}>Full name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                  autoComplete="name"
                  accessibilityLabel="Full name"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink"
                />
              </>
            ) : null}

            <Text
              className={`${labelClass} ${mode === "signup" ? "mt-4" : ""}`}
            >
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink"
            />

            {mode !== "forgot" ? (
              <>
                <Text className={`${labelClass} mt-4`}>Password</Text>
                <View className="flex-row items-center rounded-xl border border-border bg-surface">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={
                      mode === "signup" ? "At least 6 characters" : "••••••••"
                    }
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    textContentType={
                      mode === "signup" ? "newPassword" : "password"
                    }
                    accessibilityLabel="Password"
                    onSubmitEditing={() => void handlePrimary()}
                    className="flex-1 px-4 py-3 text-sm text-ink"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="px-3 py-3 active:opacity-60"
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={17}
                      color="#64748b"
                    />
                  </Pressable>
                </View>
              </>
            ) : null}

            {mode === "signin" ? (
              <Pressable
                onPress={() => switchMode("forgot")}
                disabled={closeDisabled}
                accessibilityRole="button"
                className="mt-3 self-start active:opacity-60"
              >
                <Text className="text-sm font-semibold text-navy">
                  Forgot password?
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => void handlePrimary()}
              disabled={!canSubmit}
              accessibilityRole="button"
              className={`mt-5 flex-row items-center justify-center rounded-xl py-3.5 ${canSubmit ? "bg-navy" : "bg-navy/40"}`}
            >
              {authBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  {mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : "Send reset link"}
                </Text>
              )}
            </Pressable>

            {mode !== "forgot" && supabaseConfigured && googleConfigured ? (
              <>
                <View className="mt-5 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-line" />
                  <Text className="text-xs font-bold uppercase tracking-widest text-border">
                    or
                  </Text>
                  <View className="h-px flex-1 bg-line" />
                </View>
                <Pressable
                  onPress={() => void signInWithGoogle()}
                  disabled={authBusy}
                  accessibilityRole="button"
                  className="mt-4 flex-row items-center justify-center rounded-xl border border-border bg-card py-3.5 disabled:opacity-60"
                >
                  <View className="h-5 w-5 items-center justify-center">
                    <GoogleLogo size={20} />
                  </View>
                  <Text className="ml-2.5 text-sm font-bold text-ink">
                    Continue with Google
                  </Text>
                </Pressable>
              </>
            ) : null}

            <View className="mt-5 border-t border-line pt-4">
              {mode !== "signup" ? (
                <Pressable
                  onPress={() => switchMode("signup")}
                  disabled={closeDisabled}
                  accessibilityRole="button"
                  className="py-1.5 active:opacity-60"
                >
                  <Text className="text-sm font-semibold text-navy">
                    New here? Create a customer account
                  </Text>
                </Pressable>
              ) : null}
              {mode !== "signin" ? (
                <Pressable
                  onPress={() => switchMode("signin")}
                  disabled={closeDisabled}
                  accessibilityRole="button"
                  className="py-1.5 active:opacity-60"
                >
                  <Text className="text-sm font-semibold text-navy">
                    I already have an account
                  </Text>
                </Pressable>
              ) : null}
              {mode === "forgot" ? (
                <Pressable
                  onPress={() => switchMode("signin")}
                  disabled={closeDisabled}
                  accessibilityRole="button"
                  className="py-1.5 active:opacity-60"
                >
                  <Text className="text-sm font-semibold text-navy">
                    Back to sign in
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
});
