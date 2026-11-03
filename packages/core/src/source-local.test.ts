import { describe, expect, it } from "vitest";

import { isLocalAddress } from "./source-local";

describe("a source on the organization's own hardware", () => {
  it("is this machine, a private network or a .local name", () => {
    for (const url of [
      "http://localhost:11434/v1",
      "http://127.0.0.1:8080",
      "http://192.168.172.145:11499",
      "http://10.0.0.5/v1",
      "http://172.20.1.2:8000",
      "http://gpu-box.local:11434",
      "http://[::1]:8080",
    ]) {
      expect(isLocalAddress(url), url).toBe(true);
    }
  });

  it("is not a cloud endpoint, a public address or no address at all", () => {
    for (const url of [
      "https://api.openai.com/v1",
      "https://172.32.0.1",
      "https://llm.example.com",
      "not a url",
      null,
    ]) {
      expect(isLocalAddress(url), String(url)).toBe(false);
    }
  });
});
