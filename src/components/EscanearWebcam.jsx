import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export default function EscanerWebcam({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const streamRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  });

  const apagarCamara = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {}
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const iniciarCamara = async () => {
      try {
        // 1. FORZAR AUTOFOCUS Y RESOLUCIÓN ÓPTIMA
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 }, // Mayor resolución para leer códigos pequeños
            height: { ideal: 1080 },
            focusMode: "continuous", // Fuerza a la cámara a mantener el enfoque
            advanced: [{ focusMode: "continuous" }], // Compatibilidad con navegadores antiguos
          },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // 2. OPTIMIZACIÓN DE ZXING (Hints)
        const hints = new Map();
        // Solo buscamos los formatos comerciales comunes (ignoramos QR, DataMatrix, etc.)
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);
        // TRY_HARDER: Le dice a ZXing que se esfuerce más en leer códigos borrosos o pequeños
        hints.set(DecodeHintType.TRY_HARDER, true);

        const codeReader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 50, // Escanea cada 50ms (más rápido)
          delayBetweenScanSuccess: 500,
        });

        controlsRef.current = await codeReader.decodeFromVideoElement(
          videoRef.current,
          (result, error) => {
            if (result) {
              // Feedback de sonido (Beep) para confirmar lectura sin mirar la pantalla
              try {
                const audioCtx = new (
                  window.AudioContext || window.webkitAudioContext
                )();
                const oscillator = audioCtx.createOscillator();
                oscillator.type = "sine";
                oscillator.frequency.value = 1200;
                oscillator.connect(audioCtx.destination);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.1);
              } catch (e) {}

              onScanRef.current(result.getText());
              apagarCamara();
              onCloseRef.current();
            }
          },
        );
      } catch (err) {
        console.error("Error al abrir cámara:", err);
        if (isMounted)
          setErrorMsg("No se pudo acceder a la cámara. Verifica los permisos.");
      }
    };

    iniciarCamara();

    return () => {
      isMounted = false;
      apagarCamara();
    };
  }, []);

  return (
    <div className="modal-overlay active" style={{ zIndex: 9999 }}>
      <div
        className="modal-contenido"
        style={{ maxWidth: "600px", padding: "10px" }}
      >
        <h3 style={{ margin: "0 0 10px 0", textAlign: "center" }}>
          📷 Escaneando...
        </h3>

        {errorMsg ? (
          <div
            style={{
              backgroundColor: "#f8d7da",
              color: "#721c24",
              padding: "20px",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <strong>⚠️ Error</strong>
            <br />
            {errorMsg}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              width: "100%",
              borderRadius: "8px",
              overflow: "hidden",
              backgroundColor: "#000",
              minHeight: "250px",
            }}
          >
            <video
              ref={videoRef}
              style={{ width: "100%", display: "block" }}
              autoPlay
              playsInline
              muted
            />

            {/* 3. GUÍA VISUAL (Línea de escaneo animada) */}
            <div
              style={{
                position: "absolute",
                top: "15%",
                left: "10%",
                right: "10%",
                bottom: "15%",
                border: "3px dashed #27ae60",
                borderRadius: "10px",
                pointerEvents: "none",
              }}
            ></div>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "10%",
                right: "10%",
                height: "2px",
                backgroundColor: "red",
                boxShadow: "0 0 10px red",
                pointerEvents: "none",
                animation: "scanline 2s linear infinite",
              }}
            ></div>

            <p
              style={{
                position: "absolute",
                bottom: "5px",
                width: "100%",
                textAlign: "center",
                color: "white",
                fontSize: "12px",
                textShadow: "1px 1px 2px black",
              }}
            >
              Centre el código en el recuadro
            </p>
          </div>
        )}

        <button
          className="btn-cancelar"
          onClick={() => {
            apagarCamara();
            onClose();
          }}
          style={{ marginTop: "15px", width: "100%" }}
        >
          Cancelar
        </button>
      </div>
      <style>{`
        @keyframes scanline {
          0% { top: 15%; }
          50% { top: 85%; }
          100% { top: 15%; }
        }
      `}</style>
    </div>
  );
}
