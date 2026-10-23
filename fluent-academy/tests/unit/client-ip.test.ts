import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/server/env";
import { clientIp } from "@/server/http";

const req = (xff?: string) => new Request("http://localhost/api/x", { headers: xff ? { "x-forwarded-for": xff } : {} });

describe("clientIp (rate-limit key)", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    resetEnvCache();
  });
  it("uses the address appended by the trusted proxy, not a spoofed leading entry", () => {
    expect(clientIp(req("6.6.6.6, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(req("203.0.113.7"))).toBe("203.0.113.7");
  });
  it("supports several trusted proxy hops", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    resetEnvCache();
    expect(clientIp(req("6.6.6.6, 203.0.113.7, 10.0.0.2"))).toBe("203.0.113.7");
  });
  it("ignores the header entirely when no proxy is trusted", () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    resetEnvCache();
    expect(clientIp(req("6.6.6.6"))).toBe("direct");
  });
});
