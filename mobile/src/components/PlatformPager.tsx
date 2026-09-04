// =====================================================================
// PlatformPager - native swipe pager (react-native-pager-view).
// Web uses PlatformPager.web.tsx (hidden-tab variant). Both expose the
// same PagerView-ish API: ref.setPage(), onPageSelected, initialPage.
// =====================================================================
import React, { forwardRef } from 'react';
import PagerView from 'react-native-pager-view';
import type { PagerViewOnPageSelectedEvent } from 'react-native-pager-view';

export type { PagerViewOnPageSelectedEvent };
export type PlatformPagerRef = PagerView;

type PlatformPagerProps = React.ComponentProps<typeof PagerView>;

export const PlatformPager = forwardRef<PlatformPagerRef, PlatformPagerProps>(
  function PlatformPager(props, ref) {
    return <PagerView ref={ref} {...props} />;
  },
);