// ensure-ollama.ts

// --- CONFIGURATION ---
// The script will automatically try to find the ollama executable.
// If it fails, run `which ollama` in your terminal and paste the path here.
const OLLAMA_EXECUTABLE_PATH = "/usr/local/bin/ollama";

/**
 * A more reliable way to find the executable path.
 */
async function getOllamaPath(): Promise<string> {
  // If the user-configured path exists and is executable, use it.
  if (OLLAMA_EXECUTABLE_PATH && await Bun.file(OLLAMA_EXECUTABLE_PATH).exists()) {
    return OLLAMA_EXECUTABLE_PATH;
  }
  // Otherwise, fall back to the default command name.
  return "ollama";
}


/**
 * Checks the status of Ollama by running `ollama ps`.
 * @returns 'running' | 'stopped' | 'not_installed'
 */
async function checkOllamaStatus(): Promise<'running' | 'stopped' | 'not_installed'> {
  const ollamaPath = await getOllamaPath();
  // We don't log here anymore to keep the output cleaner during polling.

  try {
    const proc = Bun.spawnSync([ollamaPath, "ps"], {
      stdio: ["ignore", "pipe", "pipe"], // Capture stdout and stderr
    });

    const stderr = new TextDecoder().decode(proc.stderr);

    if (proc.exitCode === 0) {
      return 'running';
    }

    if (stderr.includes("could not connect to ollama server")) {
      return 'stopped';
    }
    
    return 'not_installed';

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 'not_installed';
    }
    console.error(`Log: An unexpected error occurred while running 'ollama ps':`, error);
    return 'not_installed';
  }
}


/**
 * Executes the official Ollama installation script.
 */
async function installOllama(): Promise<boolean> {
  console.log("🔧 Ollama not found or is malfunctioning. Starting installation...");
  const installCommand = "curl -fsSL https://ollama.com/install.sh | sh";
  const proc = Bun.spawn(["sh", "-c", installCommand], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  });
  const exitCode = await proc.exitCode;
  if (exitCode !== 0) {
    console.error("❌ Ollama installation failed.");
    return false;
  }
  console.log("✅ Ollama installed successfully.");
  return true;
}

/**
 * Starts the Ollama service as a background process.
 */
async function startOllamaService(): Promise<void> {
  const ollamaPath = await getOllamaPath();
  console.log(`⚙️ Starting Ollama service with command: '${ollamaPath} serve'`);
  Bun.spawn(["nohup", ollamaPath, "serve"], {
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  });
}

/**
 * Polls the Ollama server until it's ready or a timeout is reached.
 */
async function waitForOllamaReady(timeoutSeconds = 20): Promise<boolean> {
  console.log("⏳ Waiting for Ollama service to become available...");
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutSeconds * 1000) {
    if (await checkOllamaStatus() === 'running') {
      return true;
    }
    await Bun.sleep(1000);
  }
  return false;
}

/**
 * Runs a small inference to confirm Ollama is working correctly.
 * This version captures output to reliably determine success.
 */
async function runInferenceTest(): Promise<void> {
    const ollamaPath = await getOllamaPath();
    const model = "gemma3:270m";
    const prompt = "In one short sentence, why is the sky blue?";
    
    console.log(`\n🤖 Running inference test with model '${model}'...`);
    console.log(`   This may take a moment if the model needs to be downloaded.`);
    
    try {
        // Use spawnSync to block and capture all output, avoiding race conditions.
        const proc = Bun.spawnSync([ollamaPath, "run", model, prompt]);
        
        const stdout = new TextDecoder().decode(proc.stdout);
        const stderr = new TextDecoder().decode(proc.stderr);

        // Show the user any progress from the stderr stream (like model pulling).
        if (stderr.trim()) {
            console.log("\n--- Ollama Progress ---");
            console.log(stderr.trim());
            console.log("-----------------------\n");
        }

        // The most reliable success condition is getting a valid response in stdout.
        if (stdout.trim()) {
            console.log("🤖 Response:");
            console.log(stdout.trim());
            console.log("\n✅ Inference test completed successfully.");
        } else {
            console.error("\n❌ Inference test failed. No response was received from the model.");
        }
    } catch (error) {
        console.error("\n❌ An error occurred while trying to run the inference test:", error);
    }
}


// --- Main Execution Logic ---
async function main() {
  console.log("Checking Ollama status...");

  let status = await checkOllamaStatus();

  if (status === 'not_installed') {
    const installed = await installOllama();
    if (!installed) {
      process.exit(1);
    }
    // After installation, re-check the status.
    status = await checkOllamaStatus();
  }

  if (status === 'stopped') {
    console.log("✅ Ollama is installed but not running. Starting service...");
    await startOllamaService();
    if (!(await waitForOllamaReady())) {
      console.error("❌ Timed out waiting for the Ollama service to start.");
      process.exit(1);
    }
  }

  console.log("🚀 Ollama is up and running!");
  
  // Now that we know Ollama is running, perform the inference test.
  await runInferenceTest();
}

main();
