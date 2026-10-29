import type { ZodString as Inputs } from "zod";

export type Imported = Inputs;
export type Upload = { storageKey: string };
export interface ResponseBody {
  status: string;
}
export function check() {
  type Inputs = { fileName: string };
  interface LocalBody {
    error: string;
  }
  const input: Inputs = { fileName: "report.pdf" };
  const response: LocalBody = { error: "unavailable" };
  return { input, response };
}
