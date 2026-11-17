// =====================================================================
// PagePager - U-43 (2026-09-26): shared bottom pager with NUMBERED page
// buttons, not just prev/next. Owner: "the ease of the page number in
// the bottom to fast navigate — just this much."
//
// Renders: ‹ [1] … [c-1] [c] [c+1] … [n] › with the current page
// highlighted. A small window of numbers is shown around the current
// page (plus first/last) so long lists never become a wall of numbers.
// Tap any number to jump straight there. Replaces the five copies of
// the prev/next-only footer in Projects/Shop/Services/Admin lists.
// =====================================================================
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

/** Compact page-number window: 1 … c-1 c c+1 … n (ellipses where skipped). */
export function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

export function PagePager({
  page,
  totalPages,
  onPage,
  label = "items",
  totalItems,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  label?: string;
  totalItems?: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <View className="mt-1 px-4">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          accessibilityLabel="Previous page"
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
        >
          <Feather name="chevron-left" size={18} color="#1e3a8a" />
        </Pressable>
        <View className="flex-1 flex-row flex-wrap items-center justify-center gap-1 px-2">
          {pageWindow(page, totalPages).map((entry, i) =>
            entry === "…" ? (
              <Text key={`gap-${i}`} className="px-0.5 text-xs text-muted">
                …
              </Text>
            ) : (
              <Pressable
                key={entry}
                onPress={() => onPage(entry)}
                disabled={entry === page}
                accessibilityLabel={`Page ${entry}`}
                accessibilityState={{ selected: entry === page }}
                className={`min-h-9 min-w-9 items-center justify-center rounded-full px-2 ${
                  entry === page ? "bg-navy" : "border border-line bg-card"
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    entry === page ? "text-white" : "text-navy"
                  }`}
                >
                  {entry}
                </Text>
              </Pressable>
            ),
          )}
        </View>
        <Pressable
          onPress={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          accessibilityLabel="Next page"
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
        >
          <Feather name="chevron-right" size={18} color="#1e3a8a" />
        </Pressable>
      </View>
      <Text className="mt-1 text-center text-xs font-bold text-muted">
        Page {page} of {totalPages}
        {totalItems != null
          ? ` · ${totalItems} ${label}${totalItems === 1 ? "" : "s"}`
          : ""}
      </Text>
    </View>
  );
}
