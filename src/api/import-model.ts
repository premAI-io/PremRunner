import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { db } from "../db/index";
import { models } from "../db/schema";
import { eq } from "drizzle-orm";

async function validateZipFile(zipPath: string): Promise<boolean> {
  console.log(`🔍 Validating ZIP file: ${zipPath}`);
  
  // Check if file exists
  if (!existsSync(zipPath)) {
    console.error(`❌ ZIP file does not exist: ${zipPath}`);
    return false;
  }
  
  // Check file size
  const stats = Bun.file(zipPath).size;
  console.log(`📊 ZIP file size: ${(stats / 1024 / 1024).toFixed(2)} MB`);
  
  // First, try to list contents with unzip -l (less strict than -t)
  const listProc = Bun.spawn(["unzip", "-l", zipPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  const listExitCode = await listProc.exited;
  const listStderr = await new Response(listProc.stderr).text();
  const listStdout = await new Response(listProc.stdout).text();
  
  if (listExitCode === 0) {
    console.log(`✅ ZIP file appears valid (can list contents)`);
    console.log(`📋 ZIP contents:\n${listStdout}`);
    return true;
  }
  
  // If list fails, try to get more info with file command
  const fileProc = Bun.spawn(["file", zipPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  const fileStdout = await new Response(fileProc.stdout).text();
  console.log(`📄 File type: ${fileStdout}`);
  
  // Check if it's actually a ZIP file
  if (fileStdout.toLowerCase().includes("zip")) {
    console.log(`⚠️ File appears to be ZIP but unzip can't read it. Attempting extraction anyway...`);
    return true; // Try extraction anyway
  }
  
  console.error(`❌ File is not a valid ZIP: ${listStderr}`);
  return false;
}

async function extractZip(zipPath: string, extractDir: string): Promise<void> {
  console.log(`📂 Starting extraction from: ${zipPath}`);
  console.log(`📂 Extracting to: ${extractDir}`);
  
  // Validate ZIP file first
  const isValid = await validateZipFile(zipPath);
  if (!isValid) {
    throw new Error(`Invalid ZIP file: ${zipPath}`);
  }
  
  // Create extraction directory
  if (!existsSync(extractDir)) {
    console.log(`📁 Creating extraction directory: ${extractDir}`);
    mkdirSync(extractDir, { recursive: true });
  }

  // Try different extraction methods
  let extractionSuccessful = false;
  let extractionError = "";

  // Method 1: Try with ditto (macOS specific, handles more formats)
  if (process.platform === "darwin") {
    console.log(`🔧 Trying extraction with ditto (macOS)...`);
    const dittoProc = Bun.spawn(["ditto", "-xk", zipPath, extractDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    const dittoExitCode = await dittoProc.exited;
    const dittoStderr = await new Response(dittoProc.stderr).text();
    
    if (dittoExitCode === 0) {
      console.log(`✅ Extraction successful with ditto`);
      extractionSuccessful = true;
    } else {
      console.log(`⚠️ Ditto extraction failed: ${dittoStderr}`);
    }
  }

  // Method 2: Try with tar (sometimes works with ZIP files)
  if (!extractionSuccessful) {
    console.log(`🔧 Trying extraction with tar...`);
    const tarProc = Bun.spawn(["tar", "-xf", zipPath, "-C", extractDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    const tarExitCode = await tarProc.exited;
    const tarStderr = await new Response(tarProc.stderr).text();
    
    if (tarExitCode === 0) {
      console.log(`✅ Extraction successful with tar`);
      extractionSuccessful = true;
    } else {
      console.log(`⚠️ Tar extraction failed: ${tarStderr}`);
    }
  }

  // Method 3: Try with unzip using different flags
  if (!extractionSuccessful) {
    console.log(`🔧 Trying extraction with unzip -o -q...`);
    const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", extractDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    
    if (exitCode === 0) {
      console.log(`✅ Extraction successful with unzip`);
      extractionSuccessful = true;
    } else {
      console.error(`❌ Unzip extraction failed with exit code ${exitCode}`);
      extractionError = stderr;
    }
  }

  // Method 4: Try Python's zipfile module (more tolerant)
  if (!extractionSuccessful) {
    console.log(`🔧 Trying extraction with Python zipfile...`);
    const pythonScript = `
import zipfile
import sys
try:
    with zipfile.ZipFile(sys.argv[1], 'r') as zip_ref:
        zip_ref.extractall(sys.argv[2])
    print("Success")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
    
    const pythonProc = Bun.spawn(["python3", "-c", pythonScript, zipPath, extractDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    const pythonExitCode = await pythonProc.exited;
    const pythonStderr = await new Response(pythonProc.stderr).text();
    const pythonStdout = await new Response(pythonProc.stdout).text();
    
    if (pythonExitCode === 0) {
      console.log(`✅ Extraction successful with Python: ${pythonStdout}`);
      extractionSuccessful = true;
    } else {
      console.log(`⚠️ Python extraction failed: ${pythonStderr}`);
      extractionError = pythonStderr || extractionError;
    }
  }

  if (!extractionSuccessful) {
    throw new Error(`Failed to extract zip with all methods. Last error: ${extractionError}`);
  }
  
  // List extracted contents
  const lsProc = Bun.spawn(["ls", "-la", extractDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lsOutput = await new Response(lsProc.stdout).text();
  console.log(`📁 Directory contents:\n${lsOutput}`);
}

async function createModelfile(modelPath: string, modelfileDir: string): Promise<string> {
  console.log(`📝 Creating Modelfile for path: ${modelPath}`);
  
  // Check what files are in the extracted directory
  const lsProc = Bun.spawn(["ls", "-la", modelPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lsOutput = await new Response(lsProc.stdout).text();
  console.log(`📁 Model directory contents:\n${lsOutput}`);
  
  // Look for specific model files (*.bin, *.gguf, *.safetensors, etc.)
  let modelFilePath = modelPath;
  
  // Check if there's a subdirectory (common in ZIP exports)
  const findDirsProc = Bun.spawn(["find", modelPath, "-type", "d", "-maxdepth", "1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const findDirsOutput = await new Response(findDirsProc.stdout).text();
  const dirs = findDirsOutput.trim().split('\n').filter(d => d && d !== modelPath);
  
  // If there's exactly one subdirectory, use it
  if (dirs.length === 1) {
    console.log(`📂 Found subdirectory: ${dirs[0]}`);
    modelFilePath = dirs[0];
    
    // List contents of subdirectory
    const subLsProc = Bun.spawn(["ls", "-la", modelFilePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const subLsOutput = await new Response(subLsProc.stdout).text();
    console.log(`📁 Subdirectory contents:\n${subLsOutput}`);
  }
  
  // Check for safetensors files
  const findProc = Bun.spawn(["find", modelFilePath, "-type", "f", "-name", "*.safetensors", "-o", "-name", "*.bin", "-o", "-name", "*.gguf"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const findOutput = await new Response(findProc.stdout).text();
  const modelFiles = findOutput.trim().split('\n').filter(f => f && f.includes('.'));
  
  console.log(`🔍 Found model files: ${modelFiles.length} files`);
  if (modelFiles.length > 0) {
    console.log(`📦 Model files found:\n${modelFiles.join('\n')}`);
    
    // For multi-part safetensors, we need to point to the directory containing them
    if (modelFiles.some(f => f.includes('safetensors'))) {
      // Get the directory containing the safetensors files
      const modelDir = modelFiles[0].substring(0, modelFiles[0].lastIndexOf('/'));
      modelFilePath = modelDir;
      console.log(`📂 Using safetensors directory: ${modelFilePath}`);
    }
  }
  
  // Create modelfile directory if it doesn't exist
  if (!existsSync(modelfileDir)) {
    console.log(`📁 Creating modelfile directory: ${modelfileDir}`);
    mkdirSync(modelfileDir, { recursive: true });
  }

  const modelfilePath = join(modelfileDir, "Modelfile");
  const content = `FROM ${modelFilePath}`;
  
  console.log(`📝 Writing Modelfile with content: ${content}`);
  await Bun.write(modelfilePath, content);
  
  // Verify the file was written
  const written = await Bun.file(modelfilePath).text();
  console.log(`✅ Modelfile created at: ${modelfilePath}`);
  console.log(`📋 Modelfile content: ${written}`);
  
  return modelfilePath;
}

async function runOllamaCreate(modelName: string, modelfilePath: string): Promise<void> {
  console.log(`🔧 Creating Ollama model: ${modelName}`);
  
  const proc = Bun.spawn(["ollama", "create", modelName, "-f", modelfilePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Stream output for progress
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.trim()) {
        console.log(`[ollama create] ${chunk.trim()}`);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to create Ollama model: ${stderr}`);
  }
}

export async function importModelToOllama(
  modelId: string,
  modelName: string,
  zipPath: string
): Promise<void> {
  try {
    console.log(`📦 Starting import for model: ${modelName} (${modelId})`);
    console.log(`📍 ZIP path: ${zipPath}`);
    
    // Verify ZIP file exists before starting
    if (!existsSync(zipPath)) {
      throw new Error(`ZIP file not found at: ${zipPath}`);
    }
    
    // Create directories for extraction and modelfile
    const baseDir = join(process.cwd(), "models");
    const extractDir = join(baseDir, modelId);
    const modelfileDir = join(baseDir, `${modelId}_modelfile`);
    
    // Step 1: Extract the zip
    console.log(`📂 Extracting zip to: ${extractDir}`);
    try {
      await extractZip(zipPath, extractDir);
    } catch (extractError) {
      console.error(`❌ Extraction failed for ${modelName}`);
      // Clean up any partially extracted files
      if (existsSync(extractDir)) {
        await Bun.$`rm -rf ${extractDir}`;
      }
      throw new Error(`Failed to extract model ZIP: ${extractError}`);
    }
    
    // Step 2: Create Modelfile
    console.log(`📝 Creating Modelfile`);
    const modelfilePath = await createModelfile(extractDir, modelfileDir);
    
    // Step 3: Run ollama create
    console.log(`🚀 Running ollama create...`);
    try {
      await runOllamaCreate(modelName, modelfilePath);
    } catch (ollamaError) {
      console.error(`❌ Ollama create failed for ${modelName}`);
      // Clean up extracted files and modelfile
      if (existsSync(extractDir)) {
        await Bun.$`rm -rf ${extractDir}`;
      }
      if (existsSync(modelfileDir)) {
        await Bun.$`rm -rf ${modelfileDir}`;
      }
      throw new Error(`Failed to create Ollama model: ${ollamaError}`);
    }
    
    // Step 4: Update database to mark model as imported
    console.log(`✅ Model imported successfully, updating database`);
    await db
      .update(models)
      .set({ downloaded: true })
      .where(eq(models.id, modelId));
    
    // Cleanup modelfile directory (keep extracted model)
    await Bun.$`rm -rf ${modelfileDir}`;
    
    console.log(`🎉 Model ${modelName} is ready to use!`);
  } catch (error) {
    console.error(`❌ Failed to import model ${modelName}:`, error);
    
    // Update database to reflect failure
    await db
      .update(models)
      .set({ downloaded: false })
      .where(eq(models.id, modelId))
      .catch(console.error);
    
    throw error;
  }
}

export async function deleteModelFromOllama(modelName: string): Promise<void> {
  try {
    console.log(`🗑️ Deleting Ollama model: ${modelName}`);
    
    const proc = Bun.spawn(["ollama", "rm", modelName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      // Don't throw if model doesn't exist
      if (!stderr.includes("not found")) {
        throw new Error(`Failed to delete Ollama model: ${stderr}`);
      }
    }
    
    console.log(`✅ Ollama model ${modelName} deleted`);
  } catch (error) {
    console.error(`Failed to delete model ${modelName}:`, error);
    // Don't throw, as model might not exist in Ollama
  }
}