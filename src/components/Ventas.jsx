import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { iniciarEscucha, detenerEscucha } from "../utils/voz";
import { db } from "../db";
import { Capacitor } from "@capacitor/core";
import EscanerWebcam from "./EscanearWebcam";
import { escanearCodigoNativo } from "../utils/camara";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning"; // <-- NUEVO

// Función mejorada para quitar tildes, mayúsculas y signos de puntuación
const normalizarTexto = (texto) => {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .toLowerCase()
    .trim();
};

const numerosPalabras = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
};

const palabrasRelleno = [
  "quiero",
  "quisiera",
  "necesito",
  "agregar",
  "agrega",
  "agregame",
  "anadir",
  "anade",
  "dame",
  "deme",
  "regalame",
  "por",
  "favor",
  "de",
  "del",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "x",
  "veces",
  "unidades",
  "cantidad",
  "y",
];

// const buscarProductoPorCodigo = async (codigoEscaneado) => {
//   // 1. Búsqueda exacta
//   let producto = await db.productos
//     .where("codigo_barras")
//     .equals(codigoEscaneado)
//     .first();

//   // 2. Búsqueda por prefijo (primeros 7 dígitos)
//   if (!producto && codigoEscaneado.length >= 7) {
//     const prefijo = codigoEscaneado.substring(0, 7);
//     const todos = await db.productos.toArray();
//     producto = todos.find(
//       (p) => p.codigo_barras && p.codigo_barras.startsWith(prefijo),
//     );
//   }

//   if (producto) {
//     if (producto.stock <= 0)
//       return alert(`El producto "${producto.nombre}" está agotado.`);

//     setCarrito((prev) => {
//       const existe = prev.find((item) => item.id === producto.id);
//       if (existe)
//         return prev.map((item) =>
//           item.id === producto.id
//             ? { ...item, cantidad: item.cantidad + 1 }
//             : item,
//         );
//       return [...prev, { ...producto, cantidad: 1 }];
//     });

//     if ("speechSynthesis" in window) {
//       const msg = new SpeechSynthesisUtterance(`1 ${producto.nombre} agregado`);
//       msg.lang = "es-CO";
//       window.speechSynthesis.speak(msg);
//     }
//   } else {
//     setBusqueda(codigoEscaneado); // Lo pone en el buscador manual para asociarlo
//     alert(
//       `Código "${codigoEscaneado}" no registrado. Búscalo manualmente y guárdalo en el inventario.`,
//     );
//   }
// };

// const abrirEscaner = async () => {
//   if (Capacitor.isNativePlatform()) {
//     // Android: Usa cámara nativa
//     const codigo = await escanearCodigoNativo();
//     if (codigo) buscarProductoPorCodigo(codigo);
//   } else {
//     // Windows: Usa la webcam
//     setShowScanner(true);
//   }
// };

const extraerCantidadYProducto = (textoOriginal) => {
  const textoNorm = normalizarTexto(textoOriginal);
  let palabras = textoNorm.split(" ");
  let cantidad = 1;
  let indexNumero = -1;

  for (let i = 0; i < palabras.length; i++) {
    if (/^\d+$/.test(palabras[i])) {
      cantidad = parseInt(palabras[i], 10);
      indexNumero = i;
      break;
    } else if (numerosPalabras[palabras[i]]) {
      cantidad = numerosPalabras[palabras[i]];
      indexNumero = i;
      break;
    }
  }

  if (indexNumero !== -1) palabras.splice(indexNumero, 1);
  palabras = palabras.filter(
    (p) => !palabrasRelleno.includes(p) && p.length > 1,
  );

  return { cantidad, textoLimpio: palabras.join(" ") };
};

export default function Ventas() {
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [escuchando, setEscuchando] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const escanearConAndroid = async () => {
    try {
      // 1. Pedir permisos de cámara al sistema
      const { camera } = await BarcodeScanner.requestPermissions();

      if (camera === "granted" || camera === "limited") {
        // 2. Abrir el escáner nativo de Google
        const { barcodes } = await BarcodeScanner.scan();

        // 3. Si detectó un código, procesarlo
        if (barcodes.length > 0) {
          const codigo = barcodes[0].rawValue;
          buscarProductoPorCodigo(codigo);
        }
      } else {
        alert(
          "Permiso de cámara denegado. Debes activarlo en los ajustes de tu teléfono.",
        );
      }
    } catch (error) {
      console.error("Error al escanear en Android:", error);
      alert("Hubo un error al abrir el escáner.");
    }
  };

  const cantidadInputRef = useRef(null);
  const productos = useLiveQuery(() => db.productos.toArray()) || [];

  const buscarProductoPorCodigo = async (codigoEscaneado) => {
    if (!codigoEscaneado) return;
    const codigoLimpio = codigoEscaneado.trim();
    console.log("Código escaneado:", codigoLimpio);

    let producto = await db.productos
      .where("codigo_barras")
      .equals(codigoLimpio)
      .first();

    if (!producto && codigoLimpio.length >= 7) {
      const prefijo = codigoLimpio.substring(0, 7);
      const todos = await db.productos.toArray();
      producto = todos.find(
        (p) => p.codigo_barras && p.codigo_barras.startsWith(prefijo),
      );
    }

    if (producto) {
      if (producto.stock <= 0)
        return alert(`El producto "${producto.nombre}" está agotado.`);

      setCarrito((prev) => {
        const existe = prev.find((item) => item.id === producto.id);
        if (existe)
          return prev.map((item) =>
            item.id === producto.id
              ? { ...item, cantidad: item.cantidad + 1 }
              : item,
          );
        return [...prev, { ...producto, cantidad: 1 }];
      });

      if ("speechSynthesis" in window) {
        const msg = new SpeechSynthesisUtterance(
          `1 ${producto.nombre} agregado`,
        );
        msg.lang = "es-CO";
        window.speechSynthesis.speak(msg);
      }
    } else {
      setBusqueda(codigoLimpio);
      alert(`Código "${codigoLimpio}" no está registrado en el inventario.`);
    }
  };

  const abrirEscaner = async () => {
    if (Capacitor.isNativePlatform()) {
      // 📱 ANDROID: Usar ML Kit nativo
      await escanearConAndroid();
    } else {
      // 💻 WINDOWS: Usar Webcam
      setShowScanner(true);
    }
  };

  const procesarTextoDictado = (textoOriginal) => {
    console.log("🎤 El micrófono escuchó:", textoOriginal);

    const { cantidad: cantidadDictada, textoLimpio } =
      extraerCantidadYProducto(textoOriginal);
    const textoNorm = normalizarTexto(textoLimpio);

    console.log(
      "🔍 Buscando producto:",
      textoNorm,
      "| Cantidad:",
      cantidadDictada,
    );

    if (!textoNorm || textoNorm.length < 2) {
      console.warn("⚠️ El texto era muy corto o solo ruido.");
      return;
    }

    // Búsqueda tolerante a errores
    const coincidencias = productos.filter((p) => {
      if (p.stock <= 0) return false;
      const nombreNorm = normalizarTexto(p.nombre);

      // Si lo que dijiste está en el nombre del producto (ej: "coca" -> "Coca Cola")
      if (nombreNorm.includes(textoNorm)) return true;

      // Si el nombre del producto está en lo que dijiste (ej: "pan tajado" -> "pan")
      if (textoNorm.includes(nombreNorm)) return true;

      // Búsqueda por palabras individuales
      const palabrasBuscadas = textoNorm.split(" ").filter((w) => w.length > 2);
      if (
        palabrasBuscadas.length > 0 &&
        palabrasBuscadas.every((w) => nombreNorm.includes(w))
      ) {
        return true;
      }

      return false;
    });

    console.log(
      "📦 Productos encontrados:",
      coincidencias.map((p) => p.nombre),
    );

    if (coincidencias.length === 1) {
      const prod = coincidencias[0];

      if (cantidadDictada > prod.stock) {
        return alert(
          `No hay suficiente stock de ${prod.nombre}. Solo quedan ${prod.stock}.`,
        );
      }

      // 🟢 SOLUCIÓN AL BUG DE LA TABLA: Usar función de estado previo
      setCarrito((prevCarrito) => {
        const existe = prevCarrito.find((item) => item.id === prod.id);

        if (existe) {
          const nuevaCantidad = existe.cantidad + cantidadDictada;
          if (nuevaCantidad > prod.stock) {
            alert(
              `No hay suficiente stock. Ya tienes ${existe.cantidad} en el carrito.`,
            );
            return prevCarrito; // No hacer cambios
          }
          // Actualizar cantidad si ya existe
          return prevCarrito.map((item) =>
            item.id === prod.id ? { ...item, cantidad: nuevaCantidad } : item,
          );
        } else {
          // Añadir nuevo producto al final de la lista
          return [...prevCarrito, { ...prod, cantidad: cantidadDictada }];
        }
      });

      setBusqueda("");
      setMostrarLista(false);

      if ("speechSynthesis" in window) {
        try {
          const msg = new SpeechSynthesisUtterance(
            `${cantidadDictada} ${prod.nombre} agregado.`,
          );
          msg.lang = "es-CO";
          window.speechSynthesis.speak(msg);
        } catch (e) {}
      } else {
        alert(`✅ ${cantidadDictada} ${prod.nombre} agregado(s).`);
      }
    } else if (coincidencias.length > 1) {
      setBusqueda(textoLimpio);
      setMostrarLista(true);
      alert(`Se encontraron varios productos. Selecciona uno de la lista.`);
    } else {
      alert(`❌ No se encontró ningún producto con "${textoLimpio}".`);
    }
  };

  const iniciarVoz = async () => {
    if (escuchando) {
      await detenerEscucha();
      setEscuchando(false);
      return;
    }

    setEscuchando(true);
    try {
      await iniciarEscucha(
        (texto) => procesarTextoDictado(texto),
        () => setEscuchando(false),
      );
    } catch (error) {
      console.error("Error al iniciar micrófono:", error);
      setEscuchando(false);
    }
  };

  const agregarAlCarrito = () => {
    const prod = productos.find((p) => p.nombre === busqueda);
    if (!prod) return alert("Seleccione un producto válido de la lista");
    if (cantidad > prod.stock)
      return alert(`No hay suficiente stock. Solo quedan ${prod.stock}.`);

    // 🟢 También aplicamos la solución aquí por seguridad
    setCarrito((prevCarrito) => {
      const existe = prevCarrito.find((item) => item.id === prod.id);
      if (existe) {
        const nuevaCantidad = existe.cantidad + cantidad;
        if (nuevaCantidad > prod.stock) {
          alert(
            `No hay suficiente stock. Ya tienes ${existe.cantidad} en el carrito.`,
          );
          return prevCarrito;
        }
        return prevCarrito.map((item) =>
          item.id === prod.id ? { ...item, cantidad: nuevaCantidad } : item,
        );
      } else {
        return [...prevCarrito, { ...prod, cantidad }];
      }
    });

    setBusqueda("");
    setCantidad(1);
    setMostrarLista(false);
    setTimeout(() => document.getElementById("input-busqueda")?.focus(), 50);
  };

  const finalizarVenta = async () => {
    if (carrito.length === 0) return alert("El carrito está vacío");
    const total = carrito.reduce(
      (acc, item) => acc + item.precio * item.cantidad,
      0,
    );

    try {
      await db.transaction(
        "rw",
        [db.ventas, db.detalle_ventas, db.productos],
        async () => {
          const ventaId = await db.ventas.add({
            fecha: new Date().toISOString(),
            total,
            metodo_pago: metodoPago,
          });
          for (const item of carrito) {
            await db.detalle_ventas.add({
              venta_id: ventaId,
              producto_id: item.id,
              nombre_producto: item.nombre,
              cantidad: item.cantidad,
              precio_unitario: item.precio,
            });
            await db.productos.update(item.id, {
              stock: item.stock - item.cantidad,
            });
          }
        },
      );

      alert("✅ Venta registrada exitosamente");
      setCarrito([]);
    } catch (error) {
      console.error(error);
      alert("❌ Error al registrar venta");
    }
  };

  const productosFiltrados = productos.filter(
    (p) =>
      p.stock > 0 &&
      normalizarTexto(p.nombre).includes(normalizarTexto(busqueda)),
  );

  const totalVenta = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0,
  );

  return (
    <div className="tab-content">
      <div className="panel-venta">
        <div className="form-venta">
          <h2>Agregar Producto</h2>

          <div className="input-group buscador-container">
            <label>Producto:</label>
            <input
              id="input-busqueda"
              className="venta-producto-input"
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setMostrarLista(true);
              }}
              onFocus={() => setMostrarLista(true)}
              onBlur={() => setTimeout(() => setMostrarLista(false), 150)}
              placeholder="Escriba o dicte: 'Quiero 2 panes'"
              autoComplete="off"
            />

            {mostrarLista && busqueda && productosFiltrados.length > 0 && (
              <ul className="lista-resultados">
                {productosFiltrados.map((p) => (
                  <li
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setBusqueda(p.nombre);
                      setMostrarLista(false);
                      setTimeout(() => cantidadInputRef.current?.focus(), 50);
                    }}
                  >
                    <span className="res-nombre">{p.nombre}</span>
                    <div className="res-info">
                      <span className="res-precio">${p.precio}</span>
                      <span
                        className={`res-stock ${p.stock <= 5 ? "res-stock-bajo" : ""}`}
                      >
                        Stock: {p.stock}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="input-group">
            <label>Cantidad:</label>
            <input
              ref={cantidadInputRef}
              id="input-cantidad"
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
              min="1"
            />
          </div>

          <div className="acciones-venta">
            <button className="btn-add" onClick={agregarAlCarrito}>
              ➕ Añadir a la lista
            </button>
            <button
              className={`btn-voz-busqueda ${escuchando ? "escuchando" : ""}`}
              onClick={iniciarVoz}
            >
              {escuchando ? "🔴 Escuchando..." : "🎤 Buscar por voz"}
            </button>
            <button
              className="btn-primario"
              style={{ backgroundColor: "#e67e22" }}
              onClick={abrirEscaner}
            >
              📷 Escanear
            </button>
          </div>
        </div>

        <div className="carrito-container">
          <h2>Productos en esta venta</h2>
          <div className="table-responsive">
            <table className="tabla-carrito">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Subtotal</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {carrito.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center" }}>
                      No hay productos aún
                    </td>
                  </tr>
                ) : (
                  carrito.map((item, i) => (
                    <tr key={i}>
                      <td>{item.nombre}</td>
                      <td>{item.cantidad}</td>
                      <td>${item.precio * item.cantidad}</td>
                      <td>
                        <button
                          className="btn-accion btn-eliminar"
                          onClick={() =>
                            setCarrito(carrito.filter((_, idx) => idx !== i))
                          }
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <h3 className="total-venta">Total: ${totalVenta}</h3>
        </div>
      </div>

      <div className="cobro-container">
        <div className="cobro-metodo">
          <label>Método de Pago:</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
          >
            <option value="Efectivo">💵 Efectivo</option>
            <option value="Nequi">📱 Nequi</option>
            <option value="Daviplata">📱 Daviplata</option>
            <option value="Transferencia">🏦 Transferencia</option>
          </select>
        </div>
        <button className="btn-cobrar" onClick={finalizarVenta}>
          ✅ COBRAR Y REGISTRAR VENTA
        </button>
      </div>
      {showScanner && (
        <EscanerWebcam
          onScan={buscarProductoPorCodigo}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
