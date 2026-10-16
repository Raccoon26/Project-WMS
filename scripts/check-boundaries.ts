import { readFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import ts from "typescript";
const graph = new Map<string, string[]>();
const roots = new Map<string, { root: string; dependencies: Set<string> }>();
for (const parent of ["apps", "packages"])
  for (const entry of await readdir(parent)) {
    const root = join(parent, entry);
    const p = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as { name: string; dependencies?: Record<string, string> };
    const deps = Object.keys(p.dependencies ?? {});
    graph.set(
      p.name,
      deps.filter((x) => x.startsWith("@wms/")),
    );
    roots.set(p.name, { root, dependencies: new Set(deps) });
    if (p.name === "@wms/domain" && deps.length)
      throw new Error("Domain must be framework independent");
  }
function visit(name: string, stack: Set<string>) {
  if (stack.has(name)) throw new Error("Dependency cycle");
  const next = new Set(stack).add(name);
  for (const dep of graph.get(name) ?? []) {
    if (!graph.has(dep)) throw new Error("Unknown workspace");
    visit(dep, next);
  }
}
for (const name of graph.keys()) visit(name, new Set());
async function checkSources(
  name: string,
  directory: string,
  dependencies: Set<string>,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkSources(name, file, dependencies);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const imports = ts.preProcessFile(
      await readFile(file, "utf8"),
    ).importedFiles;
    for (const { fileName: specifier } of imports) {
      if (specifier.startsWith(".")) {
        const owner = roots.get(name)!.root;
        if (
          relative(resolve(owner), resolve(directory, specifier)).startsWith(
            "..",
          )
        )
          throw new Error(`Cross-package relative import: ${file}`);
      } else {
        if (specifier.startsWith("node:")) {
          if (name === "@wms/domain") throw new Error("Domain Node dependency");
          continue;
        }
        const parts = specifier.split("/");
        const pkg = specifier.startsWith("@")
          ? parts.slice(0, 2).join("/")
          : parts[0]!;
        if (!dependencies.has(pkg))
          throw new Error(`Undeclared source dependency ${pkg} in ${file}`);
      }
    }
  }
}
for (const [name, { root, dependencies }] of roots)
  await checkSources(name, join(root, "src"), dependencies);
console.log(
  "Workspace declarations and source imports respect acyclic module boundaries.",
);
