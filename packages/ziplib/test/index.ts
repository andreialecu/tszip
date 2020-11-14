import { CentralDirectory } from "../src/central-directory";
import fs from "fs";

import path from "path";
import "source-map-support/register";

const x = new CentralDirectory(path.join(__dirname, "test.zip"));
console.log(x.entries);

(async function () {
  console.log(
    (
      await x.entries
        .get("node_modules/typescript/lib/de/diagnosticMessages.generated.json")
        ?.inflate(fs.openSync(path.join(__dirname, "test.zip"), "r"))
    )?.toString()
  );
})();

function toBits(dec: number, size: number) {
  var b = (dec >>> 0).toString(2).padStart(size, "0");
  return b.split("");
}
console.log(toBits(2175008768, 16).join(""));
