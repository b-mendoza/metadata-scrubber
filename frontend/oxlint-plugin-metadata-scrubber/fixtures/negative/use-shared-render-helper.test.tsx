import * as testingLibrary from "@testing-library/react";
import { render, render as renderAgain } from "@testing-library/react";
import { render as pureRender } from "@testing-library/react/pure";

export { render, renderAgain, pureRender };
testingLibrary.render(<div />);
