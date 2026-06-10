import { Button as AriaButton } from "react-aria-components";

import { Spinner } from "#/shared/components/spinner/spinner.mod";
import { cn } from "#/shared/utils/classnames/classnames.mod";

interface ButtonProps extends React.ComponentProps<typeof AriaButton> {}

export const Button = (props: ButtonProps) => {
  const { children, className, ...ariaButtonProps } = props;

  const buttonClasses = cn("btn", className);

  return (
    <AriaButton className={buttonClasses} {...ariaButtonProps}>
      {(renderProps) => (
        <>
          {renderProps.isPending ? <Spinner /> : null}

          {typeof children === "function" ? children(renderProps) : children}
        </>
      )}
    </AriaButton>
  );
};
