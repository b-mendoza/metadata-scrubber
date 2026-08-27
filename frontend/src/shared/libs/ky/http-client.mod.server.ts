import type { KyInstance } from "ky";
import ky from "ky";

export const createHttpClient = (baseUrl: URL) => ky.create({ baseUrl });

export interface HTTPClient extends KyInstance {}
