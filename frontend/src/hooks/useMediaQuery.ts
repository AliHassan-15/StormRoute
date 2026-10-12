import * as React from "react";

/** Subscribe to a CSS media query; returns whether it currently matches. */
export function useMediaQuery(query: string): boolean {
  const getMatch = React.useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
