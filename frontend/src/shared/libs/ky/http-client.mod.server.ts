import type { KyInstance } from "ky";
import ky from "ky";

export type HTTPClient = KyInstance;

export const createHttpClient = (baseUrl: URL): HTTPClient => {
  return ky.create({
    baseUrl,
  });
};
