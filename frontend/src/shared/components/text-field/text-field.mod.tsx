import type {
  TextFieldProps as AriaTextFieldProps,
  ValidationResult,
} from "react-aria-components";
import {
  FieldError as AriaFieldError,
  Input as AriaInput,
  Label as AriaLabel,
  Text as AriaText,
  TextField as AriaTextField,
} from "react-aria-components";

import { cn } from "#/shared/utils/classnames/classnames.mod";

interface TextFieldProps extends AriaTextFieldProps {
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  label?: string;
  slotProps?: Partial<{
    input: React.ComponentProps<typeof AriaInput>;
  }>;
}

export const TextField = (props: TextFieldProps) => {
  const { description, errorMessage, label, slotProps, ...textFieldProps } =
    props;

  return (
    <AriaTextField
      {...textFieldProps}
      className={cn(
        // Layout classes
        "flex flex-col",
        textFieldProps.className,
      )}
      validationBehavior={textFieldProps.validationBehavior ?? "aria"}
    >
      <AriaLabel className="label">{label}</AriaLabel>

      <AriaInput
        {...slotProps?.input}
        className={cn(
          // Base classes
          "input validator",
          // Layout classes
          "w-full",
          slotProps?.input?.className,
        )}
      />

      {typeof description === "string" ? (
        <AriaText slot="description">{description}</AriaText>
      ) : null}

      <AriaFieldError className="validator-hint">{errorMessage}</AriaFieldError>
    </AriaTextField>
  );
};
