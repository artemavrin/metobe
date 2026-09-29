import { describe, expect, it } from "vitest";

import { deviceOf, shownIp } from "./device";

describe("a session's device", () => {
  it("names the browser and the system", () => {
    expect(
      deviceOf(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
      )
    ).toEqual({ browser: "Chrome", system: "macOS" });
    expect(
      deviceOf(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ browser: "Safari", system: "iOS" });
  });

  it("tells Edge and Yandex from Chrome, which they carry inside", () => {
    expect(
      deviceOf(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0"
      )
    ).toEqual({ browser: "Edge", system: "Windows" });
    expect(
      deviceOf(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 YaBrowser/25.8 Safari/537.36"
      )
    ).toEqual({ browser: "Яндекс Браузер", system: "Windows" });
  });

  it("knows nothing of what it does not know", () => {
    expect(deviceOf("curl/8.0")).toEqual({ browser: null, system: null });
    expect(deviceOf(null)).toEqual({ browser: null, system: null });
  });
});

describe("a session's address", () => {
  it("shows a real one and hides what says nothing", () => {
    expect(shownIp("203.0.113.7")).toBe("203.0.113.7");
    expect(shownIp("0000:0000:0000:0000:0000:0000:0000:0000")).toBeNull();
    expect(shownIp("::1")).toBeNull();
    expect(shownIp("127.0.0.1")).toBeNull();
    expect(shownIp(null)).toBeNull();
  });
});
