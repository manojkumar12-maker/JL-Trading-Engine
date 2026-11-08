import { listAgents } from "../db.js";
import { runAgent } from "./agents.js";

export function startScheduler() {
  setInterval(async () => {
    const agents = listAgents();
    const now = Date.now();

    for (const agent of agents) {
      if (!agent.enabled || !agent.intervalMinutes) continue;

      const last = agent.lastRunAt ? Date.parse(agent.lastRunAt) : 0;
      if (now - last >= agent.intervalMinutes * 60_000) {
        try {
          await runAgent(agent.id, "schedule");
        } catch (err) {
          console.error(`[scheduler] ${agent.name}: ${err.message}`);
        }
      }
    }
  }, 30_000);

  console.log("Scheduler started (checks every 30s).");
}
