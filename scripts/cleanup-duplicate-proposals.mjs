import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dedupeProposalList } from "../shared/proposalDedupe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target =
  process.argv[2] ||
  path.join(__dirname, "../data/cloud-proposals/acct_seansimmons_at_jantauscom/proposals.json");

if (!fs.existsSync(target)) {
  console.error("File not found:", target);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(target, "utf8"));
const before = store.proposals?.length || 0;
store.proposals = dedupeProposalList(store.proposals || []);
fs.writeFileSync(target, JSON.stringify(store, null, 2), "utf8");
console.log(`Cleaned ${target}`);
console.log(`  Before: ${before}`);
console.log(`  After:  ${store.proposals.length}`);
console.log(`  Removed: ${before - store.proposals.length}`);
