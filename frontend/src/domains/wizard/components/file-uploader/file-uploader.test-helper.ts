import { screen } from "@testing-library/react";
import { expect, vi } from "vitest";

import type { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const BROWSE_FILES_BUTTON_NAME = /browse files/iv;

export const getFileInput = async (
  user: ReturnType<typeof renderComponent>["user"],
) => {
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
  await user.click(
    screen.getByRole("button", { name: BROWSE_FILES_BUTTON_NAME }),
  );
  const [fileInput] = clickSpy.mock.contexts;
  clickSpy.mockRestore();
  expect.assert(fileInput instanceof HTMLInputElement);
  return fileInput;
};
