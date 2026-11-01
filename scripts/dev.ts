const children = [
  Bun.spawn(["bun", "run", "dev:server"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }),
  Bun.spawn(["bun", "run", "dev:web"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }),
  Bun.spawn(["bun", "run", "dev:widget"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }),
];

console.log("See dev servers started");
console.log("  API + TMDB proxy + widget: http://localhost:8080");
console.log("  Dashboard (HMR):          http://localhost:5173/see/");
console.log("  Widget bundle:            apps/server/public/widget/widget.js (watch build)");

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(children.map((child) => child.exited));
shutdown();
