import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { iniciarEscucha, detenerEscucha } from "../utils/voz";
import { db } from "../db";
import { Capacitor } from "@capacitor/core";
import EscanerWebcam from "./EscanearWebcam";
import { escanearCodigoNativo } from "../utils/camara"; // Asegúrate de tener este archivo

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

  const cantidadInputRef = useRef(null);
  const productos = useLiveQuery(() => db.productos.toArray()) || [];

  const procesarTextoDictado = (textoOriginal) => {
    const { cantidad: cantidadDictada, textoLimpio } =
      extraerCantidadYProducto(textoOriginal);
    const textoNorm = normalizarTexto(textoLimpio);

    if (!textoNorm || textoNorm.length < 2) return;

    const coincidencias = productos.filter((p) => {
      if (p.stock <= 0) return false;

      const nombreNorm = normalizarTexto(p.nombre);
      const codigoStr = p.codigo_barras
        ? p.codigo_barras.toString().trim()
        : "";

      // Buscar por nombre o por código de barras
      if (nombreNorm.includes(textoNorm) || textoNorm.includes(nombreNorm))
        return true;
      if (codigoStr && codigoStr.includes(textoNorm)) return true;

      const palabrasBuscadas = textoNorm.split(" ").filter((w) => w.length > 2);
      if (
        palabrasBuscadas.length > 0 &&
        palabrasBuscadas.every((w) => nombreNorm.includes(w))
      ) {
        return true;
      }
      return false;
    });

    if (coincidencias.length === 1) {
      const prod = coincidencias[0];
      if (cantidadDictada > prod.stock)
        return alert(
          `No hay suficiente stock de ${prod.nombre}. Solo quedan ${prod.stock}.`,
        );

      setCarrito((prev) => {
        const existe = prev.find((item) => item.id === prod.id);
        if (existe) {
          const nuevaCantidad = existe.cantidad + cantidadDictada;
          if (nuevaCantidad > prod.stock) {
            alert(
              `No hay suficiente stock. Ya tienes ${existe.cantidad} en el carrito.`,
            );
            return prev;
          }
          return prev.map((item) =>
            item.id === prod.id ? { ...item, cantidad: nuevaCantidad } : item,
          );
        }
        return [...prev, { ...prod, cantidad: cantidadDictada }];
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

  const abrirEscaner = async () => {
    if (Capacitor.isNativePlatform()) {
      const codigo = await escanearCodigoNativo();
      if (codigo) buscarProductoPorCodigo(codigo);
    } else {
      setShowScanner(true);
    }
  };

  const buscarProductoPorCodigo = async (codigoEscaneado) => {
    if (!codigoEscaneado) return;
    const codigoLimpio = codigoEscaneado.trim();

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
    } else {
      setBusqueda(codigoLimpio);
      alert(
        `Código "${codigoLimpio}" no registrado. Búscalo manualmente y guárdalo en el inventario.`,
      );
    }
  };

  const agregarAlCarrito = () => {
    const prod = productos.find(
      (p) => p.nombre === busqueda || p.codigo_barras === busqueda,
    );
    if (!prod) return alert("Seleccione un producto válido de la lista");
    if (cantidad > prod.stock)
      return alert(`No hay suficiente stock. Solo quedan ${prod.stock}.`);

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
      }
      return [...prevCarrito, { ...prod, cantidad }];
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

  // 🟢 AQUÍ ESTÁ LA MAGIA: Búsqueda por Nombre O por Código de Barras
  const productosFiltrados = productos.filter((p) => {
    if (p.stock <= 0) return false;

    const busquedaNorm = normalizarTexto(busqueda);
    const nombreNorm = normalizarTexto(p.nombre);
    const codigoStr = p.codigo_barras ? p.codigo_barras.toString().trim() : "";

    // 1. Coincide con el Nombre
    const coincideNombre = nombreNorm.includes(busquedaNorm);

    // 2. Coincide con el Código de Barras (Búsqueda exacta o parcial)
    const coincideCodigo = codigoStr && codigoStr.includes(busqueda.trim());

    return coincideNombre || coincideCodigo;
  });

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
            <label>Producto (Nombre o Código):</label>
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
              placeholder="Ej: Pan, 770123..."
              autoComplete="off"
            />

            {mostrarLista && busqueda && productosFiltrados.length > 0 && (
              <ul className="lista-resultados">
                {productosFiltrados.map((p) => (
                  <li
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setBusqueda(p.nombre); // Si hace clic, lo pasa al nombre
                      setMostrarLista(false);
                      setTimeout(() => cantidadInputRef.current?.focus(), 50);
                    }}
                  >
                    <div>
                      <span className="res-nombre">{p.nombre}</span>
                      {/* Mostrar el código de barras si tiene */}
                      {p.codigo_barras && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#888",
                          }}
                        >
                          Cód: {p.codigo_barras}
                        </span>
                      )}
                    </div>
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
              ➕ Añadir
            </button>
            <button
              className={`btn-voz-busqueda ${escuchando ? "escuchando" : ""}`}
              onClick={iniciarVoz}
            >
              {escuchando ? "🔴 Escuchando..." : "🎤 Voz"}
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
