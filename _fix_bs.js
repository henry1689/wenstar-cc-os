const fs = require('fs');
['.claude/harness-pre-check.cjs', '.claude/harness-post-check.cjs'].forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  // replace(/\/g, → replace(/\/g,
  c = c.replace(/replace\(\/\\\/g,/g, 'replace(/\\\\/g,');
  fs.writeFileSync(f, c);
});
