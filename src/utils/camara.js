import { Camera } from "@capacitor/camera";
import { BrowserMultiFormatReader } from "@zxing/browser";

export const escanearCodigoNativo = async () => {
  try {
    // 1. Abre la cámara nativa de Android (API moderna de Capacitor 7+)
    const photo = await Camera.takePhoto({
      quality: 90,
      resultType: "base64", // Necesitamos la imagen en base64 para ZXing
    });

    if (!photo.base64String) return null;

    // 2. Convertir el base64 a un objeto Image de HTML
    const img = new Image();
    img.src = `data:image/jpeg;base64,${photo.base64String}`;

    // 3. Esperar a que la imagen cargue completamente en memoria
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // 4. Leer el código de barras con ZXing
    const codeReader = new BrowserMultiFormatReader();
    const result = await codeReader.decodeFromImageElement(img);

    return result.getText().trim();
  } catch (error) {
    // Si el usuario cancela la cámara o ZXing no detecta nada, caerá aquí
    console.log("Escaneo cancelado o código no detectado:", error);
    return null;
  }
};
