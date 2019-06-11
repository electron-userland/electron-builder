const fs = require("fs")

const homedir = require("os").homedir()

const separator = "- "
const data = fs.readFileSync(`${homedir}/f.txt`, "utf-8")
  .trim()
  .split("\n")
  .map(it => '"-usr/lib/*/' + it.replace(/[-.].*$/, "*") + '"')

fs.writeFileSync(`${homedir}/f.yaml`, separator + Array.from(new Set(data)).join("\n" + separator))