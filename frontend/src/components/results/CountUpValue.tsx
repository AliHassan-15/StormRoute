import * as React from "react";

import { runCountUp } from "@/lib/countUp";

/** One-time count-up for route card metrics (respects reduced motion). */
export function CountUpValue({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(0);
  const seen = React.useRef(false);

  React.useEffect(() => {
    if (seen.current) {
      setDisplay(value);
      return;
    }
    seen.current = true;
    return runCountUp(value, setDisplay);
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
