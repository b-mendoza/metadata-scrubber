import * as fixtureRenderers from "#/fixtures/support/renderers.mod";
import { renderComponent } from "#/fixtures/support/renderers.mod";
import * as testingLibrary from "@testing-library/react";
import type * as testingLibraryTypes from "@testing-library/react";
import type { render as Render } from "@testing-library/react";
import { type render as RenderType } from "@testing-library/react";

const localTestingLibrary = {
  render: (value: unknown): unknown => value,
};

const callShadowedRender = (testingLibrary: {
  readonly render: (value: unknown) => unknown;
}): unknown => testingLibrary.render("shadowed");

type ImportedTestingLibrary = typeof testingLibrary;
type TestingLibraryTypes = typeof testingLibraryTypes;
type RenderFunction = typeof Render;
type RenderFunctionFromSpecifier = typeof RenderType;

renderComponent(<div />);
localTestingLibrary.render(<div />);
callShadowedRender(localTestingLibrary);
fixtureRenderers.render(<div />);
unresolvedTestingLibrary.render(<div />);

export type {
  ImportedTestingLibrary,
  RenderFunction,
  RenderFunctionFromSpecifier,
  TestingLibraryTypes,
};
