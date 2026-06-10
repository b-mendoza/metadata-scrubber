import type { ToastContent } from "#/domains/notifications/constants/toast-queue/toast-queue.mod";
import { toastQueue } from "#/domains/notifications/constants/toast-queue/toast-queue.mod";

const DEFAULT_TOAST_DURATION_IN_MS = 2_500;

interface EnqueueToastOpts {
  /**
   * The duration in milliseconds for which the toast should be displayed.
   *
   * @default 2_500
   */
  durationInMs?: number;
}

export const enqueueToast = (
  content: ToastContent,
  opts?: EnqueueToastOpts,
) => {
  return toastQueue.add(content, {
    timeout: opts?.durationInMs ?? DEFAULT_TOAST_DURATION_IN_MS,
  });
};

export const dismissToast = (toastId: string) => {
  toastQueue.close(toastId);
};
