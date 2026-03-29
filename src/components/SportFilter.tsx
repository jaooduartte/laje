import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Sport } from "@/lib/types";

interface Props {
  sports: Sport[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

interface SportFilterItem {
  value: string;
  label: string;
}

const ALL_SPORT_FILTER_VALUE = "__ALL_SPORT_FILTER__";

export function SportFilter({ sports, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonByValueRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);

  const sportFilterItems = useMemo(() => {
    const nextSportFilterItems: SportFilterItem[] = [{ value: ALL_SPORT_FILTER_VALUE, label: "Todas" }];

    sports.forEach((sport) => {
      nextSportFilterItems.push({
        value: sport.id,
        label: sport.name,
      });
    });

    return nextSportFilterItems;
  }, [sports]);

  const selectedSportValue = selected ?? ALL_SPORT_FILTER_VALUE;

  const updateActiveIndicator = useCallback(() => {
    if (!containerRef.current) {
      setShowActiveIndicator(false);
      return;
    }

    const activeButtonElement = buttonByValueRef.current[selectedSportValue];

    if (!activeButtonElement) {
      setShowActiveIndicator(false);
      return;
    }

    setActiveIndicatorLeft(activeButtonElement.offsetLeft);
    setActiveIndicatorWidth(activeButtonElement.offsetWidth);
    setShowActiveIndicator(true);
  }, [selectedSportValue]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateActiveIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  useEffect(() => {
    const containerElement = containerRef.current;

    if (!containerElement) {
      return;
    }

    containerElement.addEventListener("scroll", updateActiveIndicator);

    return () => {
      containerElement.removeEventListener("scroll", updateActiveIndicator);
    };
  }, [updateActiveIndicator]);

  return (
    <div className="enter-section">
      <div
        ref={containerRef}
        className="app-pill-container relative flex h-10 items-stretch gap-0 overflow-x-auto rounded-xl p-0"
      >
        <span
          className="app-pill-active-indicator pointer-events-none absolute inset-y-0 left-0 rounded-xl transition-[transform,width,opacity] duration-500"
          style={{
            width: `${activeIndicatorWidth}px`,
            transform: `translateX(${activeIndicatorLeft}px)`,
            opacity: showActiveIndicator ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {sportFilterItems.map((sportFilterItem) => {
          const isSelected = selectedSportValue == sportFilterItem.value;

          return (
            <button
              key={sportFilterItem.value}
              ref={(buttonElement) => {
                buttonByValueRef.current[sportFilterItem.value] = buttonElement;
              }}
              data-state={isSelected ? "active" : undefined}
              onClick={() => onSelect(sportFilterItem.value == ALL_SPORT_FILTER_VALUE ? null : sportFilterItem.value)}
              className={`app-pill-option relative z-10 h-full whitespace-nowrap rounded-none px-3 py-0 text-sm font-medium first:rounded-l-xl last:rounded-r-xl ${
                isSelected ? "text-primary font-bold dark:text-foreground" : ""
              }`}
            >
              {sportFilterItem.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
