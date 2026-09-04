// =====================================================================
// PlatformPager (web) - browser variant of the swipe pager.
// react-native-pager-view is native-only, so on web this renders every
// page mounted and hides inactive ones (display:none) to preserve
// per-tab state. It mirrors the native API so callers don't change:
//   ref.setPage(index)  ->  onPageSelected({ nativeEvent: { position } })
// =====================================================================
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export type PagerViewOnPageSelectedEvent = { nativeEvent: { position: number } };
export type PlatformPagerRef = { setPage: (index: number) => void };

type PlatformPagerProps = {
  initialPage?: number;
  onPageSelected?: (event: PagerViewOnPageSelectedEvent) => void;
  offscreenPageLimit?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export const PlatformPager = forwardRef<PlatformPagerRef, PlatformPagerProps>(
  function PlatformPager({ initialPage = 0, onPageSelected, style, children }, ref) {
    const [page, setPage] = useState(initialPage);

    useImperativeHandle(
      ref,
      () => ({
        setPage: (index: number) => {
          setPage(index);
          onPageSelected?.({ nativeEvent: { position: index } });
        },
      }),
      [onPageSelected],
    );

    const pages = React.Children.toArray(children);
    return (
      <View style={style}>
        {pages.map((child, index) => (
          <View key={index} style={{ flex: 1, display: index === page ? 'flex' : 'none' }}>
            {child}
          </View>
        ))}
      </View>
    );
  },
);