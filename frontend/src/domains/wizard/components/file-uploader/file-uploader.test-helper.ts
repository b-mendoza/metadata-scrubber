import { screen } from "@testing-library/react";

import type { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const BROWSE_FILES_BUTTON_NAME = /browse files/iv;
export const getFileInput = async (
  user: ReturnType<typeof renderComponent>["user"],
) => {
  const capturedFileInput: { current: HTMLInputElement | null } = {
    current: null,
  };
  const captureFileInput = (event: Event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.type === "file"
    ) {
      capturedFileInput.current = event.target;
    }
  };
  document.addEventListener("click", captureFileInput);

  try {
    await user.click(
      screen.getByRole("button", { name: BROWSE_FILES_BUTTON_NAME }),
    );
  } finally {
    document.removeEventListener("click", captureFileInput);
  }

  if (capturedFileInput.current == null) {
    throw new Error("Uppy did not open its local file input");
  }

  return capturedFileInput.current;
};
