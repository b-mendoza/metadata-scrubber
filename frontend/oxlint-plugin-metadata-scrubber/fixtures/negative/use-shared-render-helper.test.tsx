import * as testingLibrary from "@testing-library/react";
import { render, render as renderAgain } from "@testing-library/react";
import { render as pureRender } from "@testing-library/react/pure";

render(<div />);
renderAgain(<div />);
pureRender(<div />);
testingLibrary.render(<div />);
