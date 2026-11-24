// A process of the simulation: `app` (several tabs) or `worker` (a task). Prints one JSON line per event.
//   holder.ts <role> <attempts> <userId> <holdMs>
import { hold, makeSlots } from "./slots-lib.ts";

const [role, attempts, userId, holdMs] = [
  process.argv[2]!,
  Number(process.argv[3]),
  process.argv[4]!,
  Number(process.argv[5]),
];
const slots = await makeSlots();
const log = (o: object) =>
  process.stdout.write(
    `${JSON.stringify({ role, pid: process.pid, t: Date.now(), ...o })}\n`
  );
const held: Array<{ id: string; stop: () => Promise<void> }> = [];

process.on("SIGTERM", async () => {
  await Promise.all(held.map((h) => h.stop()));
  log({ ev: "sigterm-released" });
  process.exit(0);
});

await Promise.all(
  Array.from({ length: attempts }, async (_, i) => {
    const id = `${role}-${process.pid}-${i}`;
    const h = await hold(slots, userId, id);
    if (!h) return log({ ev: "busy", id });
    held.push({ id, stop: h.stop });
    log({ ev: "acquired", id });
    setTimeout(async () => {
      await h.stop();
      log({ ev: "released", id, lost: h.lost() });
    }, holdMs);
  })
);
log({ ev: "started" });
setTimeout(() => process.exit(0), holdMs + 500);
