import type { Control, FieldPath } from "react-hook-form";
import { useController } from "react-hook-form";

import { TextField } from "#/shared/components/text-field/text-field.mod";

interface NativeInputProps extends Pick<
  React.ComponentProps<"input">,
  "className" | "placeholder" | "type"
> {}

interface FormFields extends Record<string, string | null | undefined> {}

interface ControlledFormElementProps<
  FORM_FIELDS extends FormFields,
> extends NativeInputProps {
  control: Control<FORM_FIELDS, unknown, FORM_FIELDS>;
  label: string;
  name: FieldPath<FORM_FIELDS>;
}

export const ControlledTextField = <FORM_FIELDS extends FormFields>(
  props: ControlledFormElementProps<FORM_FIELDS>,
) => {
  const { control, label, name, className, placeholder, type = "text" } = props;

  const { field, fieldState } = useController({
    control,
    name,
  });

  return (
    <TextField
      className={className}
      errorMessage={fieldState.error?.message}
      isDisabled={field.disabled}
      isInvalid={fieldState.invalid}
      label={label}
      name={field.name}
      slotProps={{
        input: {
          placeholder,
          ref: field.ref,
        },
      }}
      type={type}
      value={field.value ?? undefined}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
};
