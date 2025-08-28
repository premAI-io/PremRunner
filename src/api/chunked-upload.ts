import { Hono } from "hono";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

interface ChunkInfo {
  modelId: string;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
  modelName: string;
}

const chunkedUpload = new Hono()
  .post("/start", async (c) => {
    const body = await c.req.json();
    const { fileName, fileSize, modelName } = body;
    
    const modelId = crypto.randomUUID();
    const tempDir = join(process.cwd(), "temp-uploads", modelId);
    
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    console.log(`🚀 Starting chunked upload for ${fileName}`);
    console.log(`📊 Total size: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    
    return c.json({
      modelId,
      message: "Ready for chunks"
    });
  })
  .post("/chunk", async (c) => {
    const formData = await c.req.formData();
    const chunk = formData.get("chunk") as File;
    const modelId = formData.get("modelId") as string;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const totalChunks = parseInt(formData.get("totalChunks") as string);
    
    if (!chunk || !modelId) {
      return c.json({ error: "Missing chunk or modelId" }, 400);
    }
    
    const tempDir = join(process.cwd(), "temp-uploads", modelId);
    const chunkPath = join(tempDir, `chunk_${chunkIndex}`);
    
    const arrayBuffer = await chunk.arrayBuffer();
    await Bun.write(chunkPath, arrayBuffer);
    
    console.log(`📦 Saved chunk ${chunkIndex + 1}/${totalChunks} for model ${modelId}`);
    console.log(`📊 Chunk size: ${(chunk.size / 1024 / 1024).toFixed(2)} MB`);
    
    return c.json({
      success: true,
      chunkIndex,
      totalChunks
    });
  })
  .post("/complete", async (c) => {
    const body = await c.req.json();
    const { modelId, modelName, totalChunks } = body;
    
    const tempDir = join(process.cwd(), "temp-uploads", modelId);
    const uploadsDir = join(process.cwd(), "uploads");
    const finalPath = join(uploadsDir, `${modelId}.zip`);
    
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }
    
    console.log(`🔄 Assembling ${totalChunks} chunks into final file`);
    
    // Use streams to combine chunks without loading all in memory
    const writer = Bun.file(finalPath).writer();
    let totalSize = 0;
    
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(tempDir, `chunk_${i}`);
      const chunkFile = Bun.file(chunkPath);
      const chunkSize = chunkFile.size;
      
      console.log(`📦 Writing chunk ${i + 1}/${totalChunks}, size: ${chunkSize}`);
      
      // Stream chunk directly to final file
      const chunkData = await chunkFile.arrayBuffer();
      writer.write(new Uint8Array(chunkData));
      totalSize += chunkSize;
      
      // Free memory after each chunk
      if (i % 10 === 0) {
        await writer.flush();
      }
    }
    
    await writer.end();
    console.log(`✅ Assembled ${totalChunks} chunks into ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB file`);
    
    // Clean up temp files
    await Bun.$`rm -rf ${tempDir}`;
    
    const finalSize = Bun.file(finalPath).size;
    console.log(`✅ File assembled: ${finalPath}`);
    console.log(`📊 Final size: ${(finalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    
    return c.json({
      success: true,
      modelId,
      path: finalPath,
      size: finalSize
    });
  });

export default chunkedUpload;