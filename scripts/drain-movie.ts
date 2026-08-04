import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { drainUntilMovieTerminal } from "../src/workers/movies";

async function main() {
  const movieId = process.argv[2] || "5-CSZryP8F0-zMX-XVGyf";
  console.log("Draining until terminal:", movieId);
  const result = await drainUntilMovieTerminal(movieId, { maxJobs: 5 });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
