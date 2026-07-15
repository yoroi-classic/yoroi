#!/usr/bin/env node

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUILD_TRIGGER_SCRIPTS = new Set([
  "build",
  "prepare",
  "prepack",
  "preinstall",
  "install",
  "postinstall",
]);

const PUBLISH_SCRIPTS = /^prepublish(?::|$)|^publish(?::|$)/;

function usage() {
  return `Usage:
  node scripts/prepare-package-branch.js <package> --out-dir <dir> [options]
  node scripts/prepare-package-branch.js --package-dir <dir> --out-dir <dir> [options]

Options:
  --package-dir <dir>   Package root to pack instead of scripts/packages/<package>
  --out-dir <dir>       Output directory for the generated branch contents
  --branch <name>       Branch name to print in the install example
  --skip-install        Do not run npm ci --legacy-peer-deps in the package root
  --skip-build          Do not run npm run build:release in the package root
  --keep-tarball        Keep the intermediate npm pack tarball
  -h, --help            Show this help
`;
}

function parseArgs(argv) {
  const args = {
    packageName: null,
    packageDir: null,
    outDir: null,
    branch: null,
    skipInstall: false,
    skipBuild: false,
    keepTarball: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--package-dir") {
      args.packageDir = nextValue(argv, (index += 1), arg);
    } else if (arg === "--out-dir") {
      args.outDir = nextValue(argv, (index += 1), arg);
    } else if (arg === "--branch") {
      args.branch = nextValue(argv, (index += 1), arg);
    } else if (arg === "--skip-install") {
      args.skipInstall = true;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--keep-tarball") {
      args.keepTarball = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.packageName) {
      args.packageName = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return args;
}

function nextValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function run(command, args, options) {
  const printable = [command, ...args].join(" ");
  console.log(`> ${printable}`);
  childProcess.execFileSync(command, args, { stdio: "inherit", ...options });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function packagePathFromArgs(args, repoRoot) {
  if (args.packageDir) return path.resolve(repoRoot, args.packageDir);
  if (!args.packageName) {
    throw new Error("Provide a package name or --package-dir");
  }
  return path.join(repoRoot, "scripts", "packages", args.packageName);
}

function cleanOutputDirectory(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

function defaultBranchName(packageJson) {
  return `pkg/${packageJson.name.replace(/^@/, "").replace("/", "-")}`;
}

function sanitizePackageJson(packageJson) {
  const sanitized = { ...packageJson };
  const scripts = { ...(sanitized.scripts || {}) };

  for (const scriptName of Object.keys(scripts)) {
    if (BUILD_TRIGGER_SCRIPTS.has(scriptName) || PUBLISH_SCRIPTS.test(scriptName)) {
      delete scripts[scriptName];
    }
  }

  if (Object.keys(scripts).length > 0) {
    sanitized.scripts = scripts;
  } else {
    delete sanitized.scripts;
  }

  return sanitized;
}

function validateOutput(outDir, packageJson) {
  const outputPackageJsonPath = path.join(outDir, "package.json");
  if (!fs.existsSync(outputPackageJsonPath)) {
    throw new Error("Generated branch output is missing package.json");
  }

  const outputPackageJson = readJson(outputPackageJsonPath);
  if (outputPackageJson.name !== packageJson.name) {
    throw new Error(`Generated package name ${outputPackageJson.name} does not match ${packageJson.name}`);
  }

  for (const field of ["main", "module", "types"]) {
    const target = outputPackageJson[field];
    if (target && !fs.existsSync(path.join(outDir, target))) {
      throw new Error(`Generated package is missing ${field} entry: ${target}`);
    }
  }

  const scripts = outputPackageJson.scripts || {};
  for (const scriptName of Object.keys(scripts)) {
    if (BUILD_TRIGGER_SCRIPTS.has(scriptName) || PUBLISH_SCRIPTS.test(scriptName)) {
      throw new Error(`Generated package still has install-time script: ${scriptName}`);
    }
  }
}

function preparePackageBranch(argv, env = process.env) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const packageRoot = packagePathFromArgs(args, repoRoot);
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Package manifest not found: ${packageJsonPath}`);
  }
  if (!args.outDir) {
    throw new Error("--out-dir is required");
  }

  const packageJson = readJson(packageJsonPath);
  const outDir = path.resolve(repoRoot, args.outDir);
  const branch = args.branch || defaultBranchName(packageJson);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yoroi-package-branch-"));

  try {
    if (!args.skipInstall) {
      run("npm", ["ci", "--legacy-peer-deps"], { cwd: packageRoot, env });
    }
    if (!args.skipBuild) {
      run("npm", ["run", "build:release"], { cwd: packageRoot, env });
    }

    run("npm", ["pack", "--ignore-scripts", "--pack-destination", tempDir], {
      cwd: packageRoot,
      env,
    });

    const tarballs = fs.readdirSync(tempDir).filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`Expected one npm pack tarball, found ${tarballs.length}`);
    }

    cleanOutputDirectory(outDir);
    const tarball = path.join(tempDir, tarballs[0]);
    run("tar", ["-xzf", tarball, "--strip-components=1", "-C", outDir], { env });

    const outputPackageJsonPath = path.join(outDir, "package.json");
    writeJson(outputPackageJsonPath, sanitizePackageJson(readJson(outputPackageJsonPath)));
    validateOutput(outDir, packageJson);

    if (args.keepTarball) {
      fs.copyFileSync(tarball, path.join(outDir, tarballs[0]));
    }

    console.log("");
    console.log(`Prepared ${packageJson.name} for branch ${branch}`);
    console.log(`Output: ${outDir}`);
    console.log("");
    console.log("Install example:");
    console.log(`  "${packageJson.name}": "git+ssh://git@github.com/yoroi-classic/yoroi.git#${branch}"`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    preparePackageBranch(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    process.exit(1);
  }
}

module.exports = {
  defaultBranchName,
  preparePackageBranch,
  sanitizePackageJson,
};
