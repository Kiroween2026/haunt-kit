// Built by Yadnesh for Anish's gestures package. Run by .kiro/hooks/gesture-from-spec.json.
import { existsSync, readFileSync } from "node:fs";
import { workOrder } from "./work-order";

const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
const order = workOrder(stdin, (p) => (existsSync(p) ? readFileSync(p, "utf8") : null));
if (order) console.log(order);
