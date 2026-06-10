import { ProgressBar } from "react-aria-components";

export const Spinner = () => (
  <ProgressBar aria-label="loading" isIndeterminate>
    <span className="loading loading-spinner" />
  </ProgressBar>
);
