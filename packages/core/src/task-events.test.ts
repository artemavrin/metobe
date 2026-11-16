import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  announceMemory,
  announceTasks,
  onMemoryChanged,
  onTasksChanged,
  receive,
} = await import("./task-events");

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

describe("the memory's word on the same line", () => {
  it("goes to the memory's handlers with its chat, not to the tasks'", async () => {
    const tasks: string[] = [];
    const memory: string[] = [];
    const stopTasks = onTasksChanged((ownerId) => tasks.push(ownerId));
    const stopMemory = onMemoryChanged((ownerId, chatId) =>
      memory.push(`${ownerId}:${chatId}`)
    );
    await announceMemory("owner-1", "chat-1");
    receive(
      JSON.stringify({ chatId: "chat-2", kind: "memory", ownerId: "owner-2" })
    );
    await announceTasks("owner-3");
    stopTasks();
    stopMemory();
    expect(memory).toEqual(["owner-1:chat-1", "owner-2:chat-2"]);
    expect(tasks).toEqual(["owner-3"]);
  });

  it("takes an old word without a kind for the tasks', and a memory word without its chat for nobody's", () => {
    const memory: string[] = [];
    const stop = onMemoryChanged((ownerId) => memory.push(ownerId));
    receive(JSON.stringify({ kind: "memory", ownerId: "owner-4" }));
    stop();
    expect(memory).toEqual([]);
  });
});
