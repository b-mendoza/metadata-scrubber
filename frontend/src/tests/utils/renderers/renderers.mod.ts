import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export const renderComponent = (jsx: React.ReactNode) => {
  const user = userEvent.setup();

  return {
    ...render(jsx),
    user,
  };
};
