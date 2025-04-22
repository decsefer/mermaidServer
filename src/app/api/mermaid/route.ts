import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

// Promisify exec for easier async/await usage
const execPromise = util.promisify(exec);

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function POST(request: Request) {
  try {
    const body = await request.text();
    let mermaidCode: string;

    try {
      const jsonData = JSON.parse(body);
      mermaidCode = jsonData.mermaidCode || jsonData;
    } catch {
      mermaidCode = body;
    }

    if (!mermaidCode) {
      return NextResponse.json(
        { error: 'Mermaid code is required' },
        { status: 400 }
      );
    }

    // Definir el archivo temporal para el diagrama generado
    // En local, creamos un directorio temporal adecuado usando os.tmpdir()
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, 'mermaid-diagram.png');
    const tempFilePath = path.join(tempDir, 'mermaidCode.mmd');

    // Crear un archivo temporal con el código Mermaid para pasarlo a mermaid-cli
    fs.writeFileSync(tempFilePath, mermaidCode);

    // Ejecutar mermaid.cli para generar el SVG usando npx
    try {
      await execPromise(`npx @mermaid-js/mermaid-cli -i ${tempFilePath} -o ${outputPath}`);
    } catch (error) {
      console.error("Error generating diagram:", error);
      throw new Error("Error generating diagram");
    }

    // Leer el archivo generado
    const buffer = fs.readFileSync(outputPath);

    // Subir el diagrama generado a Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mermaid-diagrams' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(buffer);
    });

    // Eliminar los archivos temporales
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(outputPath);

    // Devolver la URL generada de Cloudinary
    return NextResponse.json({
      success: true,
      url: (uploadResponse as { secure_url: string }).secure_url
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate diagram' },
      { status: 500 }
    );
  }
}
