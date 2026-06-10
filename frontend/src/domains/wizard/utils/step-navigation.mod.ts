import type { WizardStepPath } from "#/domains/wizard/constants/wizard.mod";
import { WIZARD_STEPS } from "#/domains/wizard/constants/wizard.mod";
import { invariant } from "#/shared/utils/invariant/invariant.mod";

const NOT_FOUND_INDEX = -1;

/**
 * Check if stepA is at or before stepB in the wizard flow.
 * Used for determining progress indicator styling.
 */
export function isStepAtOrBefore(
  stepAPath: WizardStepPath,
  stepBPath: WizardStepPath,
): boolean {
  const indexA = WIZARD_STEPS.findIndex((step) => step.path === stepAPath);

  const indexB = WIZARD_STEPS.findIndex((step) => step.path === stepBPath);

  invariant(
    indexA !== NOT_FOUND_INDEX,
    `Invalid wizard step path: "${stepAPath}"`,
  );

  invariant(
    indexB !== NOT_FOUND_INDEX,
    `Invalid wizard step path: "${stepBPath}"`,
  );

  return indexA <= indexB;
}

const WIZARD_STEP_PATHS = new Set(WIZARD_STEPS.map((step) => step.path));

/**
 * Type guard that checks if a path is a valid wizard step path.
 *
 * Used to safely narrow string paths before performing wizard-specific
 * operations like step comparison. This prevents runtime errors when
 * the current route is outside the wizard flow (e.g., homepage).
 *
 * @param path - The path string to validate
 * @returns `true` if the path is a wizard step path, enabling type narrowing
 */
export const isWizardStepPath = (path: string): path is WizardStepPath => {
  return WIZARD_STEP_PATHS.has(path);
};
