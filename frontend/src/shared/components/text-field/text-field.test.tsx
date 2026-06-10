import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { TextField } from "./text-field.mod";

describe('tests for "TextField" component', () => {
  // 1. Basic Rendering
  describe("component structure", () => {
    it("renders with minimal props", () => {
      renderComponent(<TextField />);

      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders with all basic props", () => {
      renderComponent(
        <TextField
          label="Name"
          description="Enter your full name"
          slotProps={{
            input: {
              placeholder: "John Doe",
            },
          }}
        />,
      );

      const textbox = screen.getByRole("textbox");

      expect(textbox).toHaveAttribute("placeholder", "John Doe");

      expect(screen.getByText("Name")).toBeInTheDocument();

      expect(screen.getByText("Enter your full name")).toBeInTheDocument();
    });
  });

  // 2. User Interactions
  describe("user interactions", () => {
    it("handles text input correctly", async () => {
      const { user } = renderComponent(<TextField label="Name" />);

      const input = screen.getByRole("textbox");

      await user.type(input, "John Doe");

      expect(input).toHaveValue("John Doe");
    });

    it("handles focus and blur events", async () => {
      const onBlur = vi.fn<React.FocusEventHandler<HTMLInputElement>>();

      const onFocus = vi.fn<React.FocusEventHandler<HTMLInputElement>>();

      const { user } = renderComponent(
        <TextField label="Name" onBlur={onBlur} onFocus={onFocus} />,
      );

      const input = screen.getByRole("textbox");

      await user.click(input);

      expect(onFocus).toHaveBeenCalledOnce();

      await user.tab();

      expect(onBlur).toHaveBeenCalledOnce();
    });

    it("handles copy and paste", async () => {
      const { user } = renderComponent(<TextField label="Name" />);

      const input = screen.getByRole("textbox");

      await user.click(input);

      await user.paste("Pasted Content");

      expect(input).toHaveValue("Pasted Content");
    });
  });

  // 3. Accessibility
  describe("accessibility features", () => {
    it("associates label with input", () => {
      renderComponent(<TextField label="Name" />);

      const textbox = screen.getByRole("textbox");

      const labelText = screen.getByText("Name");

      expect(textbox.getAttribute("aria-labelledby")).toBeDefined();

      expect(labelText.id).toBeDefined();
    });

    it("associates description with input", () => {
      renderComponent(
        <TextField label="Name" description="Enter your full name" />,
      );

      const textbox = screen.getByRole("textbox");

      const description = screen.getByText("Enter your full name");

      expect(textbox.getAttribute("aria-describedby")).toBe(description.id);
    });

    it("indicates required state correctly", () => {
      renderComponent(<TextField label="Name" isRequired />);

      const textbox = screen.getByRole("textbox");

      expect(textbox).toHaveAttribute("aria-required", "true");
    });
  });

  // 4. States and Validation
  describe("states and validation", () => {
    it("handles disabled state correctly", () => {
      renderComponent(<TextField label="Name" isDisabled />);

      const textbox = screen.getByRole("textbox");

      expect(textbox).toBeDisabled();

      expect(textbox).toHaveAttribute("disabled");
    });

    it("handles read-only state correctly", () => {
      renderComponent(
        <TextField label="Name" defaultValue="John" isReadOnly />,
      );

      const textbox = screen.getByRole("textbox");

      expect(textbox).toHaveAttribute("readonly");

      expect(textbox).toHaveValue("John");
    });

    it("displays error message when invalid", () => {
      renderComponent(
        <TextField
          label="Email"
          errorMessage="Invalid email format"
          isInvalid
        />,
      );

      expect(screen.getByText("Invalid email format")).toBeInTheDocument();

      const textbox = screen.getByRole("textbox");

      expect(textbox).toHaveAttribute("aria-invalid", "true");
    });
  });

  // 5. Edge Cases
  describe("edge cases", () => {
    it("handles empty strings in optional props", () => {
      renderComponent(<TextField label="" description="" errorMessage="" />);

      const textbox = screen.getByRole("textbox");

      expect(textbox).toBeInTheDocument();
    });

    it("handles special characters correctly", async () => {
      const { user } = renderComponent(<TextField label="Name" />);

      const input = screen.getByRole("textbox");

      const specialChars = "áéíóú!@#$%^&*()_+😀";

      await user.type(input, specialChars);

      expect(input).toHaveValue(specialChars);
    });
  });
});
