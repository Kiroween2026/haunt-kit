// Writes src/styles/tokens.css from src/tokens.ts.
import { writeFileSync } from "node:fs";
import { themeCss } from "../tokens";

writeFileSync(new URL("./tokens.css", import.meta.url), themeCss());
console.log("wrote src/styles/tokens.css");
