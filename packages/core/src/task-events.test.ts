import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { announceTasks, onTasksChanged, receive } =
  await import("./task-events");

describe("tasks:changed", () => {
  it("tells this process at once when there is no Redis", async () => {
    const heard: string[] = [];
    const stop = onTasksChanged((ownerId) => heard.push(ownerId));
    await announceTasks("owner-1");
    stop();
    await announceTasks("owner-2");
    expect(heard).toEqual(["owner-1"]);
  });

  it("tells the handlers what another process says", () => {
    const heard: string[] = [];
    const stop = onTasksChanged((ownerId) => heard.push(ownerId));
    receive(JSON.stringify({ ownerId: "owner-3" }));
    stop();
    expect(heard).toEqual(["owner-3"]);
  });

  it("ignores a message it cannot read", () => {
    const heard: string[] = [];
    const stop = onTasksChanged((ownerId) => heard.push(ownerId));
    receive("not json");
    receive(JSON.stringify({ ownerId: 42 }));
    receive("{}");
    stop();
    expect(heard).toEqual([]);
  });
});
