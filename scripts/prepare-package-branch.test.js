const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  defaultBranchName,
  preparePackageBranch,
  sanitizePackageJson,
} = require("./prepare-package-branch");

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("defaultBranchName builds a stable package branch name", () => {
  assert.strictEqual(defaultBranchName({ name: "@yoroi/common" }), "pkg/yoroi-common");
});

test("sanitizePackageJson strips git dependency build and publish scripts", () => {
  const sanitized = sanitizePackageJson({
    name: "@yoroi/common",
    scripts: {
      build: "npm run tsc",
      prepare: "npm run build",
      prepack: "npm run build",
      prepublish: "npm run build",
      "prepublish:beta": "npm run build",
      "publish:prod": "npm publish",
      test: "node --test",
    },
  });

  assert.deepStrictEqual(sanitized.scripts, {
    test: "node --test",
  });
});

test("preparePackageBranch packs a prebuilt package and validates entrypoints", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yoroi-package-branch-test-"));
  const packageRoot = path.join(tempRoot, "fixture");
  const outDir = path.join(tempRoot, "out");

  fs.mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "README.md"), "# Fixture\n");
  fs.writeFileSync(path.join(packageRoot, "lib", "index.js"), "module.exports = {}\n");
  fs.writeFileSync(path.join(packageRoot, "lib", "index.mjs"), "export default {}\n");
  fs.writeFileSync(path.join(packageRoot, "lib", "index.d.ts"), "export default {}\n");
  writeJson(path.join(packageRoot, "package.json"), {
    name: "@yoroi/fixture",
    version: "0.0.0",
    main: "lib/index.js",
    module: "lib/index.mjs",
    types: "lib/index.d.ts",
    files: ["lib", "README.md"],
    scripts: {
      build: "echo build",
      prepack: "echo prepack",
      "publish:prod": "npm publish",
      test: "node --test",
    },
  });

  try {
    preparePackageBranch([
      "--package-dir",
      packageRoot,
      "--out-dir",
      outDir,
      "--branch",
      "pkg/yoroi-fixture",
      "--skip-install",
      "--skip-build",
    ]);

    const outputPackageJson = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf8"),
    );

    assert.strictEqual(outputPackageJson.name, "@yoroi/fixture");
    assert.deepStrictEqual(outputPackageJson.scripts, {
      test: "node --test",
    });
    assert.ok(fs.existsSync(path.join(outDir, "lib", "index.js")));
    assert.ok(fs.existsSync(path.join(outDir, "lib", "index.mjs")));
    assert.ok(fs.existsSync(path.join(outDir, "lib", "index.d.ts")));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
