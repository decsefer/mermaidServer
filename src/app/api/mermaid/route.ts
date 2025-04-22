import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import mermaid from 'mermaid';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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
        { error: 'Se requiere el código Mermaid' },
        { status: 400 }
      );
    }

    // Crear un entorno DOM virtual con JSDOM
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="container"></div></body></html>`);
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;

    // Inicializar mermaid sin el uso de DOM (headless)
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

    // Renderizar el diagrama Mermaid a SVG
    const { svg } = await mermaid.render('mermaid-diagram', mermaidCode);

    // Convertir el SVG a PNG usando sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()  // Convertir a PNG
      .toBuffer();

    // Subir el PNG a Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mermaid-diagrams', format: 'png' }, // Especificamos el formato como PNG
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(pngBuffer);  // Subimos el buffer de la imagen PNG
    });

    // Devolver la URL generada de Cloudinary
    return NextResponse.json({
      success: true,
      url: (uploadResponse as { secure_url: string }).secure_url,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'No se pudo generar el diagrama' },
      { status: 500 }
    );
  }
}
