import { screen } from "@testing-library/react";
import type { ButtonProps } from "react-aria-components";
import { describe, expect, it, vi } from "vitest";

import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { Button } from "./button.mod";

const handleFormSubmission: React.SubmitEventHandler<HTMLFormElement> = (
  event,
) => {
  event.preventDefault();
};

describe('tests for "Button" component', () => {
  // 1. Component Specifications
  describe("component Structure", () => {
    it('renders as a "button" element', () => {
      renderComponent(<Button>Click me</Button>);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders children correctly", () => {
      renderComponent(<Button>Click me</Button>);

      expect(screen.getByRole("button")).toHaveTextContent("Click me");
    });
  });

  // 2. Functional Test Cases
  describe("core functionality", () => {
    it('applies the default "btn" class', () => {
      renderComponent(<Button>Button</Button>);

      expect(screen.getByRole("button")).toHaveClass("btn");
    });

    it('merges custom "className" with default class', () => {
      renderComponent(<Button className="custom-class">Button</Button>);

      const button = screen.getByRole("button");

      expect(button).toHaveClass("btn");
      expect(button).toHaveClass("custom-class");
    });

    it('calls the "onPress" handler when clicked', async () => {
      const handleButtonPress = vi.fn<NonNullable<ButtonProps["onPress"]>>();

      const { user } = renderComponent(
        <Button onPress={handleButtonPress}>Click Me</Button>,
      );

      await user.click(screen.getByRole("button"));

      expect(handleButtonPress).toHaveBeenCalledOnce();
    });

    it('passes all props to the underlying "AriaButton"', () => {
      renderComponent(
        <Button id="test-id" data-testid="test-button" aria-label="Test Button">
          Button
        </Button>,
      );

      const button = screen.getByRole("button");

      expect(button).toHaveAttribute("id", "test-id");
      expect(button).toHaveAttribute("data-testid", "test-button");
      expect(button).toHaveAttribute("aria-label", "Test Button");
    });
  });

  // 3. Edge Cases
  describe("edge cases", () => {
    it("renders correctly with no props", () => {
      renderComponent(<Button />);

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveClass("btn");
    });

    it('handles empty "className" prop', () => {
      renderComponent(<Button className="">Button</Button>);

      expect(screen.getByRole("button")).toHaveClass("btn");
    });

    it("handles multiple className values", () => {
      renderComponent(<Button className="class1 class2">Button</Button>);

      const button = screen.getByRole("button");

      expect(button).toHaveClass("btn");
      expect(button).toHaveClass("class1");
      expect(button).toHaveClass("class2");
    });
  });

  // 4. Disabled State
  describe("disabled state", () => {
    it("applies disabled attribute correctly", () => {
      renderComponent(<Button isDisabled>Disabled Button</Button>);

      expect(screen.getByRole("button")).toHaveAttribute("disabled");
    });

    it("does not trigger onClick when disabled", async () => {
      const handlePressButtonHandler =
        vi.fn<NonNullable<ButtonProps["onPress"]>>();

      const { user } = renderComponent(
        <Button isDisabled onPress={handlePressButtonHandler}>
          Disabled Button
        </Button>,
      );

      await user.click(screen.getByRole("button"));

      expect(handlePressButtonHandler).not.toHaveBeenCalled();
    });
  });

  // 5. Accessibility
  describe("accessibility", () => {
    it("maintains ARIA properties from AriaButton", () => {
      renderComponent(<Button aria-pressed="true">Toggle Button</Button>);

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("supports focus management", async () => {
      const { user } = renderComponent(<Button>Focusable Button</Button>);

      const button = screen.getByRole("button");

      // We must tab to the button as it is the only focusable element in the
      // test environment
      await user.tab();

      expect(button).toHaveFocus();
    });
  });

  // 6. Integration
  describe("integration with Form Elements", () => {
    it("functions as a submit button in forms", async () => {
      const onSubmit = vi.fn(handleFormSubmission);

      const { user } = renderComponent(
        <form onSubmit={onSubmit}>
          <Button type="submit">Submit</Button>
        </form>,
      );

      const button = screen.getByRole("button");

      expect(button).toHaveAttribute("type", "submit");

      // Simulate form submission
      await user.click(button);

      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });
});
