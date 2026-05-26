const fs = require("fs");
const path = require("path");
const readline = require("readline");
const net = require("net");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, "..");
const DEFAULT_AUTH_CENTER_ROOT = path.resolve(WORKSPACE_ROOT, "auth-center");
const DEFAULT_GRAPH_ENGINE_ROOT = path.resolve(WORKSPACE_ROOT, "graph-every-novel-main");
const COLORS = {
  launcher: "\x1b[36m",
  auth: "\x1b[35m",
  app: "\x1b[32m",
  reset: "\x1b[0m",
};

function parseArgs(argv) {
  const options = {
    desktop: false,
    skipAuth: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--desktop") {
      options.desktop = true;
      continue;
    }
    if (arg === "--skip-auth") {
      options.skipAuth = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: node scripts/dev-local-suite.cjs [--desktop] [--skip-auth]");
  console.log("");
  console.log("Options:");
  console.log("  --desktop    Start the Electron desktop shell instead of the web app workflow.");
  console.log("  --skip-auth  Start only the main project and skip auth-center.");
}

function colorize(channel, text) {
  const color = COLORS[channel] || "";
  return `${color}${text}${COLORS.reset}`;
}

function logLauncher(message) {
  console.log(colorize("launcher", `[launcher] ${message}`));
}

function formatExistsStatus(value) {
  return value ? "ready" : "missing";
}

function attachPrefixedOutput(child, label, channel) {
  const writeLine = (line, target) => {
    if (!line.length) {
      target.write("\n");
      return;
    }
    target.write(`${colorize(channel, `[${label}]`)} ${line}\n`);
  };

  if (child.stdout) {
    const stdoutReader = readline.createInterface({ input: child.stdout });
    stdoutReader.on("line", (line) => writeLine(line, process.stdout));
  }

  if (child.stderr) {
    const stderrReader = readline.createInterface({ input: child.stderr });
    stderrReader.on("line", (line) => writeLine(line, process.stderr));
  }
}

function spawnManagedProcess({
  key,
  label,
  channel,
  cwd,
  command,
  args,
  env,
  children,
}) {
  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });
  } catch (error) {
    throw new Error(`${key} failed to spawn: ${error.message}`);
  }

  children.set(key, { child, label });
  attachPrefixedOutput(child, label, channel);
  return child;
}

function shutdownChildren(children, signal = "SIGTERM") {
  for (const { child } of children.values()) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // Ignore shutdown races.
      }
    }
  }
}

function ensurePathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found: ${targetPath}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canBindPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function ensurePortsAvailable(portChecks) {
  const conflicts = [];

  for (const check of portChecks) {
    const available = await canBindPort(check.port, check.host ?? "127.0.0.1");
    if (!available) {
      conflicts.push(check);
    }
  }

  if (conflicts.length === 0) {
    return;
  }

  const message = conflicts
    .map((item) => `${item.label} expected port ${item.port} is already occupied`)
    .join("; ");

  throw new Error(
    `${message}. Please close the old local process first, for example with taskkill /PID <pid> /F, then restart the local suite.`,
  );
}

function getCandidateNodeExecutables() {
  const currentNodeDir = path.dirname(process.execPath);
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const candidates = [
    process.execPath,
    path.join(currentNodeDir, "node.exe"),
    localAppData ? path.join(localAppData, "nvm", "node.exe") : null,
    "node",
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

function resolveAdjacentPnpmScript(nodeExecutablePath) {
  if (!nodeExecutablePath || nodeExecutablePath === "node") {
    return null;
  }

  const nodeDir = path.dirname(nodeExecutablePath);
  const directPnpmScript = path.join(nodeDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
  if (fs.existsSync(directPnpmScript)) {
    return directPnpmScript;
  }

  return null;
}

function resolvePnpmScriptFromShim(shimPath) {
  if (!shimPath) {
    return null;
  }

  const shimDir = path.dirname(shimPath);
  const directPnpmScript = path.join(shimDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
  if (fs.existsSync(directPnpmScript)) {
    return directPnpmScript;
  }

  const corepackPnpmScript = path.join(shimDir, "node_modules", "corepack", "dist", "pnpm.js");
  if (fs.existsSync(corepackPnpmScript)) {
    return corepackPnpmScript;
  }

  return null;
}

function resolveWherePnpmCandidates() {
  const result = spawnSync("where.exe", ["pnpm"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    return [];
  }

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePnpmCommand() {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath],
      source: `npm_execpath (${npmExecPath})`,
    };
  }

  for (const nodeExecutablePath of getCandidateNodeExecutables()) {
    const pnpmScriptPath = resolveAdjacentPnpmScript(nodeExecutablePath);
    if (pnpmScriptPath) {
      return {
        command: nodeExecutablePath,
        argsPrefix: [pnpmScriptPath],
        source: `adjacent pnpm script (${pnpmScriptPath})`,
      };
    }
  }

  for (const shimPath of resolveWherePnpmCandidates()) {
    const pnpmScriptPath = resolvePnpmScriptFromShim(shimPath);
    if (pnpmScriptPath) {
      return {
        command: process.execPath,
        argsPrefix: [pnpmScriptPath],
        source: `shim-derived pnpm script (${pnpmScriptPath})`,
      };
    }
  }

  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    argsPrefix: [],
    source: "PATH lookup fallback",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const authCenterRoot = process.env.AI_NOVEL_AUTH_CENTER_ROOT?.trim()
    ? path.resolve(process.env.AI_NOVEL_AUTH_CENTER_ROOT.trim())
    : DEFAULT_AUTH_CENTER_ROOT;
  const graphEngineRoot = process.env.AI_NOVEL_GRAPH_ENGINE_ROOT?.trim()
    ? path.resolve(process.env.AI_NOVEL_GRAPH_ENGINE_ROOT.trim())
    : DEFAULT_GRAPH_ENGINE_ROOT;
  const authCenterPackagePath = path.join(authCenterRoot, "package.json");
  const graphEnginePyprojectPath = path.join(graphEngineRoot, "pyproject.toml");
  const authCenterNodeModulesPath = path.join(authCenterRoot, "node_modules");

  ensurePathExists(REPO_ROOT, "Main project root");
  if (!options.skipAuth) {
    ensurePathExists(authCenterPackagePath, "auth-center package");
  }

  await ensurePortsAvailable([
    { label: "main server", port: 3000 },
    { label: "vite client", port: 5173 },
    ...(options.skipAuth ? [] : [{ label: "auth-center", port: 5681 }]),
  ]);

  const pnpmCommand = resolvePnpmCommand();
  const mainArgs = options.desktop ? ["dev:desktop:raw"] : ["dev:raw"];
  const authCenterServerEntry = path.join(authCenterRoot, "src", "server.js");

  logLauncher(`Main project root: ${REPO_ROOT}`);
  logLauncher(`Auth-center root: ${authCenterRoot} (${options.skipAuth ? "skipped" : formatExistsStatus(fs.existsSync(authCenterPackagePath))})`);
  logLauncher(`Graph engine root: ${graphEngineRoot} (${formatExistsStatus(fs.existsSync(graphEnginePyprojectPath))})`);
  logLauncher(`Main package manager bridge: ${pnpmCommand.source}`);
  if (!options.skipAuth && !fs.existsSync(authCenterNodeModulesPath)) {
    logLauncher("auth-center has no node_modules yet. Run `npm install` in that repo if startup fails.");
  }
  logLauncher(`Mode: ${options.desktop ? "desktop shell" : "web dev"}`);
  logLauncher("Expected URLs after startup: app http://localhost:5173, api http://localhost:3000, auth http://localhost:5681");

  const children = new Map();
  let closing = false;

  const finish = (exitCode) => {
    if (closing) {
      return;
    }
    closing = true;
    shutdownChildren(children, "SIGTERM");
    setTimeout(() => shutdownChildren(children, "SIGKILL"), 1500).unref();
    process.exit(exitCode);
  };

  const registerLifecycle = (key, child) => {
    child.on("error", (error) => {
      console.error(colorize("launcher", `[launcher] ${key} failed to start: ${error.message}`));
      finish(1);
    });

    child.on("close", (code, signal) => {
      if (closing) {
        return;
      }

      const status = typeof code === "number" ? `exit code ${code}` : `signal ${signal || "unknown"}`;
      console.error(colorize("launcher", `[launcher] ${key} stopped with ${status}. Shutting down the local suite.`));
      finish(typeof code === "number" ? code : 1);
    });
  };

  if (!options.skipAuth) {
    const authChild = spawnManagedProcess({
      key: "auth-center",
      label: "auth-center",
      channel: "auth",
      cwd: authCenterRoot,
      command: process.execPath,
      args: [authCenterServerEntry],
      children,
    });
    registerLifecycle("auth-center", authChild);
  }

  const mainChild = spawnManagedProcess({
    key: "main-app",
    label: options.desktop ? "desktop-suite" : "main-suite",
    channel: "app",
    cwd: REPO_ROOT,
    command: pnpmCommand.command,
    args: [...pnpmCommand.argsPrefix, ...mainArgs],
    children,
  });
  registerLifecycle("main-app", mainChild);

  process.on("SIGINT", () => finish(0));
  process.on("SIGTERM", () => finish(0));
}

main().catch((error) => {
  console.error(colorize("launcher", `[launcher] ${error.message}`));
  process.exit(1);
});
