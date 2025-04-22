import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import mermaid from 'mermaid';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

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

    // Crear un entorno DOM virtual
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="container"></div></body></html>`);
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;
    
    // Setup DOMPurify with the virtual window
    const DOMPurify = createDOMPurify(dom.window);
    
    // Inicializamos mermaid
    mermaid.initialize({ 
      startOnLoad: false,
      securityLevel: 'loose'
    });

    // Sanitize the mermaid code
    const sanitizedCode = DOMPurify.sanitize(mermaidCode);
    const { svg } = await mermaid.render('mermaid-diagram', sanitizedCode);

    // Convertir el SVG a PNG usando sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    // Subir el PNG a Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mermaid-diagrams', format: 'png' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(pngBuffer);
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