import { UNSTABLE_ToastQueue as ToastQueue } from "react-aria-components";
import { flushSync } from "react-dom";

export type ToastType = "ERROR" | "INFO" | "LOADING" | "SUCCESS";

export interface ToastContent {
  content: string;
  type: ToastType;
}

const MAX_VISIBLE_TOASTS = 5;

export const toastQueue = new ToastQueue<ToastContent>({
  maxVisibleToasts: MAX_VISIBLE_TOASTS,
  // Wrap state updates in a CSS view transition.
  wrapUpdate(fn) {
    if ("startViewTransition" in document) {
      document.startViewTransition(() => {
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- View Transitions need the toast DOM update committed before this callback completes.
        flushSync(fn);
      });
    } else {
      fn();
    }
  },
});
