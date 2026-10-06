// =====================================================================
// App - the GENUM Solutions mobile app.
//
// The app is fully NATIVE with its own UI/UX. It reads and writes the SAME
// Supabase database as the website (products, services, projects, orders,
// carts, profiles) - it does NOT load pages from the website. There is no
// WebView.
//
//   NavigationContainer -> RootNavigator (tabs + stack)
//   AppProvider          native auth + cart state
//   SignInSheet          global sign-in / sign-up / reset overlay
// =====================================================================
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform, UIManager, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import * as Linking from "expo-linking";
import "./global.css";

import { RootNavigator } from "./src/navigation/RootNavigator";
import { SignInSheet } from "./src/components/SignInSheet";
import { AppProvider, useApp } from "./src/context/AppContext";
import { CollectionProvider } from "./src/context/CollectionContext";
import { navigationRef, navigate } from "./src/navigation/navigationRef";
import { clearCart } from "./src/services/cartService";
import { recordScreenView } from "./src/services/analyticsService";

// ⑤ (owner snag, 2026-10-02 audit): the Control Panel's connect flow
// collapses the address/scan card the moment a link goes live, and the
// content below it jumps by that card's height. TransportPicker now asks
// for an ease-in-ease-out layout pass on those transitions; on Android's
// legacy architecture that pass only exists behind this experimental flag
// (a no-op on Fabric, where the flag does not exist). Guarded by the API
// check so it never crashes a build where it was removed.
if (
  Platform.OS === "android" &&
  typeof UIManager.setLayoutAnimationEnabledExperimental === "function"
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Walk the navigation state tree to the focused route and return its name. */
function getActiveRouteName(state: unknown): string | null {
  const s = state as {
    routes?: { state?: unknown; name?: string }[];
    index?: number;
  } | null;
  if (!s || !s.routes || s.index == null) return null;
  const route = s.routes[s.index];
  if (!route) return null;
  if (route.state) return getActiveRouteName(route.state);
  return route.name ?? null;
}

// Web linking maps each screen to a URL so the browser back button (and
// deep links) move exactly one step through the stack instead of resetting
// to the entry screen. Payment return links (genumsolutions://checkout/*)
// are intentionally NOT mapped here — handleDeepLink below owns those so the
// container and the manual listener never navigate to the same screen twice.
const linking = {
  prefixes: [Linking.createURL("/"), "genumsolutions://"],
  config: {
    screens: {
      Main: {
        screens: {
          Home: "",
          Shop: "shop",
          Cart: "cart",
          Menu: "menu",
        },
      },
      Account: "account",
      ProductDetail: "product/:id",
      Services: "services",
      Projects: "projects",
      Contact: "contact",
      About: "about",
      Tools: "tools",
      // The per-car remote screen is registered as `RemoteControl`, not
      // `CarRemote`, and its only param is `category` — see RootStackParamList.
      // This entry used to read `CarRemote: "car/:productId"`, which pointed at
      // a route that does not exist AND carried a param that route never had, so
      // a `car/...` deep link could not have resolved. No code in src generates
      // such a link, which is why nothing noticed.
      RemoteControl: "car",
      Admin: "admin",
      Journal: "journal",
      Printing: "printing",
      OpenTools: "open-tools",
      Legal: "legal/:doc",
      Update: "update",
    },
  },
};

/** Parse a return link like genumsolutions://checkout/success?provider=esewa&order=...&paid=1 */
function handleDeepLink(url: string) {
  const { hostname, path, queryParams } = Linking.parse(url);
  const params = queryParams || {};

  if (hostname !== "checkout") return;

  const sub = path?.replace(/\/+$/, "") || "/";

  if (sub === "/success") {
    // The order was already marked paid server-side by the edge function; drop
    // the local cart too (covers app-cold-start returns after payment).
    void clearCart();
    navigate("OrderSuccess", {
      orderId: typeof params.order === "string" ? params.order : undefined,
      provider:
        typeof params.provider === "string" ? params.provider : undefined,
      paid: params.paid === "1",
    });
    return;
  }

  // cancelled / not-paid / amount-mismatch / no-order -> let the user retry.
  navigate("Checkout", {
    provider: (typeof params.provider === "string"
      ? params.provider
      : undefined) as "cod" | "esewa" | "khalti" | undefined,
    status: typeof params.status === "string" ? params.status : undefined,
  });
}

function Shell() {
  const { authSheetOpen, setAuthSheetOpen } = useApp();

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) =>
      handleDeepLink(url),
    );
    return () => sub.remove();
  }, []);

  // Record page views into the shared page_views table (best-effort).
  // Records once when navigation is ready, then on every route change;
  // the service debounces repeated views of the same screen.
  useEffect(() => {
    const track = () => {
      const name = getActiveRouteName(navigationRef.getRootState());
      if (name) void recordScreenView(`/${name}`);
    };
    const unsubReady = navigationRef.addListener("ready", track);
    const unsubState = navigationRef.addListener("state", track);
    return () => {
      unsubReady();
      unsubState();
    };
  }, []);

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef} linking={linking}>
        <RootNavigator />
      </NavigationContainer>
      <SignInSheet
        visible={authSheetOpen}
        onRequestClose={() => setAuthSheetOpen(false)}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        {/* U-47: app-wide heart sync — mounts INSIDE AppProvider so it can
            react to sign-in/sign-out; cards across every screen read it. */}
        <CollectionProvider>
          <Shell />
        </CollectionProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
