// Prüft die Werkbank-Teile (werkbank/js/*.js): Syntax und Bezüge, die beim Laden sofort ausgewertet werden und auf Namen
// aus späteren Teilen zeigen (die gäbe es dann noch nicht). Aufruf: npm i --no-save acorn acorn-walk && node _werkzeuge/werkbank-pruefen.js
const acorn = require('acorn'), walk = require('acorn-walk'), fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'werkbank', 'js');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const defIn = {};
const asts = files.map((f) => acorn.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script', locations: true }));
asts.forEach((ast, i) => {
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') defIn[st.id.name] = i;
    if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
      if (d.id.type === 'Identifier') defIn[d.id.name] = i;
      else walk.full(d.id, (n) => { if (n.type === 'Identifier') defIn[n.name] = i; });
    }
  }
});
let n = 0;
asts.forEach((ast, i) => {
  // Alles außerhalb von Funktionsrümpfen läuft sofort
  const sofort = (node) => {
    walk.recursive(node, null, {
      Function() {},  // Funktionsrümpfe laufen später
      Identifier(id) {
        const j = defIn[id.name];
        if (j !== undefined && j > i) { n++; console.log(`${files[i]}:${id.loc.start.line} nutzt ${id.name} aus ${files[j]}`); }
      },
      MemberExpression(m, st, c) { c(m.object, st); if (m.computed) c(m.property, st); },
      Property(p, st, c) { if (p.computed) c(p.key, st); c(p.value, st); },
    });
  };
  for (const st of ast.body) if (st.type !== 'FunctionDeclaration') sofort(st);
});
// Jeder Name nur einmal über alle Teile
const gesehen = {};
asts.forEach((ast, i) => {
  for (const st of ast.body) {
    const namen = st.type === 'FunctionDeclaration' ? [st.id.name]
      : st.type === 'VariableDeclaration' ? st.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name) : [];
    for (const name of namen) {
      if (gesehen[name] !== undefined) { n++; console.log(`${name} doppelt in ${files[gesehen[name]]} und ${files[i]}`); }
      gesehen[name] = i;
    }
  }
});
console.log(n ? `${n} Stellen` : 'Werkbank-Teile in Ordnung');
process.exit(n ? 1 : 0);
