import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { JSDOM } from 'jsdom'; // Importar jsdom directamente
import DOMPurify from 'dompurify'; // Importar DOMPurify directamente

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Especificamos Node.js como el entorno de ejecución
export const runtime = 'nodejs';
export const maxDuration = 60; // Aumentamos el tiempo máximo de ejecución a 60 segundos

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
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    
    // Establecer los objetos globales necesarios para mermaid
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.SVGElement = dom.window.SVGElement;
    
    // Configurar DOMPurify con el entorno virtual de JSDOM
    const purify = DOMPurify(dom.window); // Aseguramos que DOMPurify use el entorno de JSDOM
    
    // Sanitize el código Mermaid
    const sanitizedCode = purify.sanitize(mermaidCode); // Usamos sanitize correctamente
    
    // Importar mermaid de manera dinámica para evitar problemas de inicialización en Vercel
    const { default: mermaid } = await import('mermaid');
    
    // Inicializar mermaid con una configuración adecuada para servidores
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default',
      logLevel: 1,
      flowchart: { htmlLabels: false },
    });

    // Renderizar el diagrama
    const { svg } = await mermaid.render('mermaid-diagram', sanitizedCode);

    // Subir el SVG a Cloudinary y pedir que se convierta a PNG
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'mermaid-diagrams',
          resource_type: 'image',
          format: 'png', // Solicitamos la conversión de SVG a PNG
          public_id: 'mermaid-diagram' // Usamos un ID público único para el diagrama
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(Buffer.from(svg)); // Subimos el SVG generado como imagen
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
