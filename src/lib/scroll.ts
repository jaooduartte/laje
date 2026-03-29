const DEFAULT_DESKTOP_SCROLL_OFFSET_IN_PIXELS = 112;
const DEFAULT_MOBILE_SCROLL_OFFSET_IN_PIXELS = 84;

interface ScrollToElementWithOffsetOptions {
  behavior?: ScrollBehavior;
  desktopOffsetInPixels?: number;
  mobileOffsetInPixels?: number;
}

export function scrollToElementWithOffset(
  element: HTMLElement | null,
  {
    behavior = "smooth",
    desktopOffsetInPixels = DEFAULT_DESKTOP_SCROLL_OFFSET_IN_PIXELS,
    mobileOffsetInPixels = DEFAULT_MOBILE_SCROLL_OFFSET_IN_PIXELS,
  }: ScrollToElementWithOffsetOptions = {},
) {
  if (!element || typeof window == "undefined") {
    return;
  }

  const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
  const topOffsetInPixels = isMobileViewport ? mobileOffsetInPixels : desktopOffsetInPixels;
  const elementTop = element.getBoundingClientRect().top + window.scrollY;
  const targetTop = Math.max(0, elementTop - topOffsetInPixels);

  window.scrollTo({
    top: targetTop,
    behavior,
  });
}

export function scrollToTopOfPage(behavior: ScrollBehavior = "smooth") {
  if (typeof window == "undefined") {
    return;
  }

  window.scrollTo({
    top: 0,
    behavior,
  });
}
