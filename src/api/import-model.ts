import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { db } from "../db/index";
import { models } from "../db/schema";
import { eq } from "drizzle-orm";
import config from "../config";

interface ModelType {
  type: 'full' | 'lora';
  baseModel?: string;
}

async function detectModelType(extractDir: string): Promise<ModelType> {
  console.log(`🔍 Detecting model type in: ${extractDir}`);

  // First check the root directory
  let checkDir = extractDir;

  // Check if there's a single subdirectory (common with ZIP files)
  const entries = await Bun.$`ls -d ${extractDir}/*/`.text().catch(() => "");
  const subdirs = entries.trim().split('\n').filter(d => d);

  if (subdirs.length === 1 && subdirs[0]) {
    // If there's exactly one subdirectory, check inside it
    checkDir = subdirs[0].replace(/\/$/, ''); // Remove trailing slash
    console.log(`📂 Checking subdirectory: ${checkDir}`);
  }

  // Check for adapter_config.json (LoRA indicator)
  const adapterConfigPath = join(checkDir, "adapter_config.json");
  if (existsSync(adapterConfigPath)) {
    console.log(`📄 Found adapter_config.json - this is a LoRA model`);

    try {
      const adapterConfig = await Bun.file(adapterConfigPath).json();

      // Extract base model name from path
      const baseModelPath = adapterConfig.base_model_name_or_path;
      if (baseModelPath) {
        // Extract the last part of the path (e.g., "qwen2.5-7b" from "/data/.../qwen2.5-7b")
        const baseModelName = baseModelPath.split('/').pop();
        console.log(`📦 Base model required: ${baseModelName}`);
        return { type: 'lora', baseModel: baseModelName };
      }
    } catch (error) {
      console.error(`❌ Failed to read adapter_config.json: ${error}`);
    }

    return { type: 'lora' };
  }

  // Check for config.json (could be either, but without adapter_config.json it's full)
  const configPath = join(checkDir, "config.json");
  if (existsSync(configPath)) {
    console.log(`📄 Found config.json without adapter_config.json - this is a full model`);
    return { type: 'full' };
  }

  // Default to full model
  console.log(`ℹ️ No clear indicators found, assuming full model`);
  return { type: 'full' };
}

async function downloadBaseModel(baseModelName: string, targetDir: string): Promise<string> {
  console.log(`📥 Downloading base model: ${baseModelName}`);

  const s3Url = `https://sid-base-checkpoints-fugmyeb.s3.eu-central-1.amazonaws.com/${baseModelName}.zip`;
  const zipPath = join(targetDir, `${baseModelName}.zip`);
  const extractPath = join(targetDir, baseModelName);

  // Check if already cached
  if (existsSync(extractPath)) {
    console.log(`✅ Base model already cached at: ${extractPath}`);
    return extractPath;
  }

  // Create target directory if needed
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Download the base model
  console.log(`⬇️ Downloading from: ${s3Url}`);
  const proc = Bun.spawn(["curl", "-L", "-o", zipPath, s3Url], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Stream output for progress
  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.trim()) {
        console.log(`[curl] ${chunk.trim()}`);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to download base model from ${s3Url}`);
  }

  console.log(`✅ Download complete, extracting...`);

  // Extract the base model
  await extractZip(zipPath, extractPath);

  // Clean up the zip file
  await Bun.$`rm -f ${zipPath}`;

  console.log(`✅ Base model ready at: ${extractPath}`);
  return extractPath;
}

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

  // Try to list contents with unzip -l
  const listProc = Bun.spawn(["unzip", "-l", zipPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const listExitCode = await listProc.exited;
  const listStderr = await new Response(listProc.stderr).text();
  await new Response(listProc.stdout).text();

  if (listExitCode === 0) {
    console.log(`✅ ZIP file appears valid`);
    return true;
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

  // Extract using unzip
  console.log(`🔧 Extracting with unzip...`);
  const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", extractDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    console.error(`❌ Unzip extraction failed with exit code ${exitCode}`);
    if (stderr) {
      console.error(`Error details: ${stderr}`);
    }
    throw new Error(`Failed to extract zip: ${stderr || "Unknown error"}`);
  }

  console.log(`✅ Extraction successful`);

  // List extracted contents
  const lsProc = Bun.spawn(["ls", "-la", extractDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lsOutput = await new Response(lsProc.stdout).text();
  console.log(`📁 Directory contents:\n${lsOutput}`);
}

async function createModelfile(
  modelType: ModelType,
  modelPath: string,
  adapterPath: string | null | undefined,
  modelfileDir: string,
): Promise<string> {
  console.log(`📝 Creating Modelfile for ${modelType.type} model`);

  // For LoRA models, we need to handle the paths differently
  // The base model path should point to the directory with model files
  // The adapter path should point to the directory with adapter files

  let processedModelPath = modelPath;
  let processedAdapterPath: string | null | undefined = adapterPath;

  if (modelType.type === 'lora') {
    // For LoRA, modelPath is the base model, adapterPath is the LoRA adapter
    console.log(`🔍 Processing LoRA model paths`);
    console.log(`📦 Base model path: ${modelPath}`);
    console.log(`🎯 Adapter path: ${adapterPath}`);

    // The base model path is already correct (downloaded from S3)
    // The adapter path is the extracted LoRA directory
    processedModelPath = modelPath;
    processedAdapterPath = adapterPath;
  } else {
    // For full models, process the path to find the actual model files
    console.log(`🔍 Processing full model path: ${modelPath}`);

    // Check what files are in the extracted directory
    const lsProc = Bun.spawn(["ls", "-la", modelPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lsOutput = await new Response(lsProc.stdout).text();
    console.log(`📁 Model directory contents:\n${lsOutput}`);

    // Look for specific model files (*.bin, *.gguf, *.safetensors, etc.)
    // Check if there's a subdirectory (common in ZIP exports)
    const findDirsProc = Bun.spawn(
      ["find", modelPath, "-type", "d", "-maxdepth", "1"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const findDirsOutput = await new Response(findDirsProc.stdout).text();
    const dirs = findDirsOutput
      .trim()
      .split("\n")
      .filter((d) => d && d !== modelPath);

    // If there's exactly one subdirectory, use it
    if (dirs.length === 1 && dirs[0]) {
      console.log(`📂 Found subdirectory: ${dirs[0]}`);
      processedModelPath = dirs[0];

      // List contents of subdirectory
      const subLsProc = Bun.spawn(["ls", "-la", processedModelPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const subLsOutput = await new Response(subLsProc.stdout).text();
      console.log(`📁 Subdirectory contents:\n${subLsOutput}`);
    }

    // Check for model files
    const findProc = Bun.spawn(
      [
        "find",
        processedModelPath,
        "-type",
        "f",
        "-name",
        "*.safetensors",
        "-o",
        "-name",
        "*.bin",
        "-o",
        "-name",
        "*.gguf",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const findOutput = await new Response(findProc.stdout).text();
    const modelFiles = findOutput
      .trim()
      .split("\n")
      .filter((f) => f && f.includes("."));

    console.log(`🔍 Found model files: ${modelFiles.length} files`);
    if (modelFiles.length > 0) {
      console.log(`📦 Model files found:\n${modelFiles.join("\n")}`);

      // For multi-part safetensors, we need to point to the directory containing them
      if (modelFiles.some((f) => f.includes("safetensors"))) {
        // Get the directory containing the safetensors files
        const firstFile = modelFiles[0];
        if (firstFile) {
          const modelDir = firstFile.substring(
            0,
            firstFile.lastIndexOf("/"),
          );
          processedModelPath = modelDir;
          console.log(`📂 Using safetensors directory: ${processedModelPath}`);
        }
      }
    }
  }

  // Create modelfile directory if it doesn't exist
  if (!existsSync(modelfileDir)) {
    console.log(`📁 Creating modelfile directory: ${modelfileDir}`);
    mkdirSync(modelfileDir, { recursive: true });
  }

  const modelfilePath = join(modelfileDir, "Modelfile");

  // Create appropriate Modelfile content based on type
  let content: string;
  if (modelType.type === 'lora' && processedAdapterPath) {
    // For LoRA models, we need to copy required files from base model to adapter directory
    // Ollama expects config.json to be in the adapter directory
    const baseConfigPath = join(processedModelPath, "config.json");
    const adapterConfigPath = join(processedAdapterPath, "config.json");

    if (existsSync(baseConfigPath) && !existsSync(adapterConfigPath)) {
      console.log(`📋 Copying config.json from base model to adapter directory`);
      await Bun.$`cp ${baseConfigPath} ${adapterConfigPath}`;
    }

    // Check if there are subdirectories in base model path
    const baseDirs = await Bun.$`find ${processedModelPath} -type d -maxdepth 1`.text();
    const baseSubDirs = baseDirs.trim().split('\n').filter(d => d && d !== processedModelPath);

    if (baseSubDirs.length === 1 && baseSubDirs[0]) {
      // There's a subdirectory in the base model, use it
      const actualBaseModelPath = baseSubDirs[0];
      console.log(`📂 Using base model subdirectory: ${actualBaseModelPath}`);

      // Copy config.json from the subdirectory if it exists
      const subConfigPath = join(actualBaseModelPath, "config.json");
      if (existsSync(subConfigPath) && !existsSync(adapterConfigPath)) {
        console.log(`📋 Copying config.json from base model subdirectory to adapter directory`);
        await Bun.$`cp ${subConfigPath} ${adapterConfigPath}`;
      }

      content = `FROM ${actualBaseModelPath}
ADAPTER ${processedAdapterPath}`;
    } else {
      content = `FROM ${processedModelPath}
ADAPTER ${processedAdapterPath}`;
    }

    console.log(`📝 Creating LoRA Modelfile with base model and adapter`);
  } else {
    content = `FROM ${processedModelPath}`;
    console.log(`📝 Creating standard Modelfile`);
  }

  console.log(`📝 Writing Modelfile with content:\n${content}`);
  await Bun.write(modelfilePath, content);

  // Verify the file was written
  const written = await Bun.file(modelfilePath).text();
  console.log(`✅ Modelfile created at: ${modelfilePath}`);
  console.log(`📋 Modelfile content:\n${written}`);

  return modelfilePath;
}

async function runOllamaCreate(
  modelName: string,
  modelfilePath: string,
): Promise<void> {
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
  zipPath: string,
): Promise<void> {
  try {
    console.log(`📦 Starting import for model: ${modelName} (${modelId})`);
    console.log(`📍 ZIP path: ${zipPath}`);

    // Verify ZIP file exists before starting
    if (!existsSync(zipPath)) {
      throw new Error(`ZIP file not found at: ${zipPath}`);
    }

    // Create directories for extraction and modelfile in DATA_PATH
    const baseDir = join(config.DATA_PATH, "models");
    const extractDir = join(baseDir, modelId);
    const modelfileDir = join(baseDir, `${modelId}_modelfile`);
    const baseModelsDir = join(config.DATA_PATH, "base_models");

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

    // Step 2: Detect model type
    const modelType = await detectModelType(extractDir);
    console.log(`🔍 Detected model type: ${modelType.type}`);

    let baseModelPath: string | undefined;
    let adapterPath: string | null | undefined = null;

    if (modelType.type === 'lora') {
      // This is a LoRA model, we need the base model
      // Find the actual adapter directory (may be in a subdirectory)
      const entries = await Bun.$`ls -d ${extractDir}/*/`.text().catch(() => "");
      const subdirs = entries.trim().split('\n').filter(d => d);

      if (subdirs.length === 1 && subdirs[0]) {
        adapterPath = subdirs[0].replace(/\/$/, ''); // Remove trailing slash
        console.log(`📂 Using adapter directory: ${adapterPath}`);
      } else {
        adapterPath = extractDir;
      }

      if (modelType.baseModel) {
        // Download or use cached base model
        try {
          baseModelPath = await downloadBaseModel(modelType.baseModel, baseModelsDir);
        } catch (downloadError) {
          console.error(`❌ Failed to download base model: ${modelType.baseModel}`);
          // Clean up
          if (existsSync(extractDir)) {
            await Bun.$`rm -rf ${extractDir}`;
          }
          throw new Error(`Failed to download base model: ${downloadError}`);
        }
      } else {
        throw new Error('LoRA model detected but no base model specified in adapter_config.json');
      }
    } else {
      // This is a full model
      baseModelPath = extractDir;
    }

    // Step 3: Create Modelfile
    console.log(`📝 Creating Modelfile`);
    if (!baseModelPath) {
      throw new Error('Base model path is not defined');
    }
    const modelfilePath = await createModelfile(
      modelType,
      baseModelPath,
      adapterPath,
      modelfileDir
    );

    // Step 4: Run ollama create
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

    // Step 5: Update database to mark model as imported
    console.log(`✅ Model imported successfully, updating database`);
    await db
      .update(models)
      .set({ downloaded: true })
      .where(eq(models.id, modelId));

    // Cleanup modelfile directory (keep extracted model and base models)
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
