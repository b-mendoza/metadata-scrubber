import {
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
} from "react-aria-components";

import { cn } from "#/shared/utils/classnames/classnames.mod";

interface ToolTipTriggerProps extends React.PropsWithChildren {}

/**
 * A pre-configured tooltip trigger component that uses the
 * `react-aria-components` library.
 */
export const ToolTipTrigger = (props: ToolTipTriggerProps) => {
  const { children } = props;

  return (
    <AriaTooltipTrigger delay={200} closeDelay={200}>
      {children}
    </AriaTooltipTrigger>
  );
};

interface TooltipProps {
  content: string;
  className?: string;
}

/**
 * The `Tooltip` component has issues with the `ResizeObserver` that doesn't
 * reposition the tooltip element when the layout shifts.
 */
export const Tooltip = (props: TooltipProps) => {
  const { content } = props;

  const tooltipClasses = cn(
    "bg-neutral text-neutral-content rounded-field px-2 py-1",
    props.className,
  );

  return (
    <AriaTooltip {...props} className={tooltipClasses}>
      {content}

      <OverlayArrow>
        <svg width={8} height={8} viewBox="0 0 8 8">
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
    </AriaTooltip>
  );
};
