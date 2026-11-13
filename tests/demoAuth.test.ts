import { describe, expect, it } from "vitest";
import { checkDemoAdminCredentials, checkDemoCredentials } from "@/lib/demoAuth";

describe("demo login", () => {
  it("accepts demo / demo and rejects anything else", () => {
    expect(checkDemoCredentials("demo", "demo")).toBe(true);
    expect(checkDemoCredentials("  Demo ", "demo")).toBe(true); // username: case and spaces ignored
    expect(checkDemoCredentials("demo", "Demo")).toBe(false); // password: exact
    expect(checkDemoCredentials("demo", "wrong")).toBe(false);
    expect(checkDemoCredentials("admin", "demo")).toBe(false);
    expect(checkDemoCredentials("", "")).toBe(false);
  });

  it("admin / admin opens the admin console only; the demo login doesn't", () => {
    expect(checkDemoAdminCredentials("admin", "admin")).toBe(true);
    expect(checkDemoAdminCredentials("demo", "demo")).toBe(false);
    expect(checkDemoAdminCredentials("admin", "demo")).toBe(false);
    expect(checkDemoCredentials("admin", "admin")).toBe(false);
  });
});
