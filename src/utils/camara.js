// Importación correcta para @capacitor/barcode-scanner
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from "@capacitor/barcode-scanner";

export const escanearCodigoNativo = async () => {
  try {
    // La API oficial usa CapacitorBarcodeScanner.scanBarcode
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL, // Escanea todos los formatos
      cameraDirection: 1, // 1 = Cámara trasera (importante en Android)
    });

    // El resultado viene en la propiedad ScanResult
    if (result && result.ScanResult) {
      return result.ScanResult.trim();
    }
    return null;
  } catch (error) {
    // Si el usuario cancela o hay un error
    console.log("Escaneo cancelado o error:", error);
    return null;
  }
};
