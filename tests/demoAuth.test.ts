import { describe, expect, it } from "vitest";
import { checkDemoCredentials } from "@/lib/demoAuth";

describe("demo login", () => {
  it("accepts demo / demo and rejects anything else", () => {
    expect(checkDemoCredentials("demo", "demo")).toBe(true);
    expect(checkDemoCredentials("  Demo ", "demo")).toBe(true); // username: case and spaces ignored
    expect(checkDemoCredentials("demo", "Demo")).toBe(false); // password: exact
    expect(checkDemoCredentials("demo", "wrong")).toBe(false);
    expect(checkDemoCredentials("admin", "demo")).toBe(false);
    expect(checkDemoCredentials("", "")).toBe(false);
  });
});
