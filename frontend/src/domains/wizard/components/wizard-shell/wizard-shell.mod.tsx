import { useLocation } from "@tanstack/react-router";

import type { WizardStep } from "#/domains/wizard/constants/wizard.mod";
import { WIZARD_STEPS } from "#/domains/wizard/constants/wizard.mod";
import {
  isStepAtOrBefore,
  isWizardStepPath,
} from "#/domains/wizard/utils/step-navigation.mod";
import { cn } from "#/shared/utils/classnames/classnames.mod";

const MAIN_PAGE_TITLE = "Document Analysis Wizard";

interface WizardShellProps extends React.PropsWithChildren {
  navigation: React.ReactNode;
  stepTitle: string;
}

export const WizardShell = (props: WizardShellProps) => {
  const { navigation, stepTitle, children } = props;

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{MAIN_PAGE_TITLE}</h1>

        <h2 className="text-base-content/70">{stepTitle}</h2>
      </header>

      <WizardStepList />

      <main className="border-base-300 rounded-lg border border-dashed p-8 text-center">
        {children}
      </main>

      <footer className="flex justify-between gap-4">{navigation}</footer>
    </div>
  );
};

const WizardStepList = () => (
  <ul className="steps">
    {WIZARD_STEPS.map((step) => (
      <WizardStepListItem key={step.path} label={step.label} path={step.path} />
    ))}
  </ul>
);

interface WizardStepListItemProps extends WizardStep {}

function WizardStepListItem(props: Readonly<WizardStepListItemProps>) {
  const { label, path } = props;

  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  const isCompleted =
    isWizardStepPath(pathname) && isStepAtOrBefore(path, pathname);

  const listItemClassNames = cn("step", {
    "step-primary": isCompleted,
  });

  return (
    <li className={listItemClassNames}>
      {/*
       * In the future, we'd like to make these step indicators clickable so users can jump
       * between steps they've already completed. This would be especially helpful if someone
       * wants to review or change something from an earlier step without having to click
       * "Previous" multiple times. To do this safely, we'll need to persist the wizard state
       * (uploaded files, form data, etc.) so users don't lose their progress when navigating.
       */}
      {label}
    </li>
  );
}
