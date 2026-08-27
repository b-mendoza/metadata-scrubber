import ky, { type KyInstance } from "ky";

export const createHttpClient = (baseUrl: URL) => ky.create({ baseUrl });

export interface HTTPClient extends KyInstance {}
