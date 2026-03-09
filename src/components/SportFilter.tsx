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

    const containerRect = containerRef.current.getBoundingClientRect();
    const buttonRect = activeButtonElement.getBoundingClientRect();

    setActiveIndicatorLeft(buttonRect.left - containerRect.left);
    setActiveIndicatorWidth(buttonRect.width);
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

  return (
    <div className="enter-section">
      <div
        ref={containerRef}
        className="glass-chip relative flex items-center gap-0 overflow-x-auto rounded-xl p-0"
      >
        <span
          className="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-primary/20 backdrop-blur-2xl transition-[transform,width,opacity] duration-500"
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
              onClick={() => onSelect(sportFilterItem.value == ALL_SPORT_FILTER_VALUE ? null : sportFilterItem.value)}
              className={`relative z-10 whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                isSelected ? "text-primary" : "text-secondary-foreground hover:text-foreground"
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
