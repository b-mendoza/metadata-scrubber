import { describe, expect, it } from "vitest";

import { OK_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

import { handleHealth } from "./health";

describe("handleHealth", () => {
  it("returns an ok health response", async () => {
    const response = handleHealth();
    const body = await response.json();

    expect(body).toEqual({ status: "ok" });
    expect(response.status).toBe(OK_STATUS_CODE);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
