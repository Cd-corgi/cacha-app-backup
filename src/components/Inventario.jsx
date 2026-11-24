import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { iniciarDictadoContinuo, detenerEscucha } from "../utils/voz";
import { db } from "../db";

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

export default function Inventario() {
  const [nuevoProd, setNuevoProd] = useState({
    nombre: "",
    codigo_barras: "",
    precio: "",
    stock: "",
    fecha_vencimiento: "",
  });
  const [orden, setOrden] = useState("fifo");
  const [editando, setEditando] = useState(null);

  // --- ESTADOS PARA EL MODAL DE CARGA MASIVA ---
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);
  const [representante, setRepresentante] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcriptRef = useRef("");

  const productos = useLiveQuery(() => db.productos.toArray()) || [];

  // --- CRUD PRODUCTO INDIVIDUAL ---
  const guardarProducto = async () => {
    if (!nuevoProd.nombre || !nuevoProd.precio || !nuevoProd.stock)
      return alert("Llene los campos obligatorios");

    await db.productos.add({
      nombre: nuevoProd.nombre,
      codigo_barras: nuevoProd.codigo_barras.trim() || null,
      precio: parseFloat(nuevoProd.precio),
      stock: parseInt(nuevoProd.stock),
      fecha_vencimiento: nuevoProd.fecha_vencimiento || "Sin fecha",
    });

    setNuevoProd({
      nombre: "",
      codigo_barras: "",
      precio: "",
      stock: "",
      fecha_vencimiento: "",
    });
  };

  const eliminarProducto = async (id) => {
    if (window.confirm("¿Eliminar producto del inventario?")) {
      await db.productos.delete(id);
    }
  };

  const guardarEdicion = async () => {
    await db.productos.update(editando.id, editando);
    setEditando(null);
  };

  // --- PARSER INTELIGENTE DE TEXTO ---
  const procesarDictado = (texto) => {
    if (!texto) return [];

    let textoLimpio = texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    Object.keys(numerosPalabras).forEach((palabra) => {
      const regex = new RegExp(`\\b${palabra}\\b`, "g");
      textoLimpio = textoLimpio.replace(regex, numerosPalabras[palabra]);
    });

    const partes = textoLimpio.split(/(\d+)/);
    const nuevosItems = [];

    for (let i = 1; i < partes.length; i += 2) {
      const cantidad = parseInt(partes[i]);
      let nombreProducto = partes[i + 1] ? partes[i + 1].trim() : "";

      nombreProducto = nombreProducto
        .replace(
          /\b(quiero|agrega|anade|dame|por|favor|de|del|la|el|los|las|y|e|mas)\b/g,
          "",
        )
        .replace(/\s+/g, " ")
        .trim();

      if (nombreProducto.length > 2) {
        nuevosItems.push({
          nombre:
            nombreProducto.charAt(0).toUpperCase() + nombreProducto.slice(1),
          cantidad: cantidad,
          precio: "",
          codigo_barras: "",
          fecha_vencimiento: "",
        });
      }
    }
    return nuevosItems;
  };

  // --- LÓGICA DE VOZ MASIVA ---
  const toggleDictado = async () => {
    if (isListening) {
      await detenerEscucha();
      setIsListening(false);
      if (transcriptRef.current.trim()) {
        const nuevos = procesarDictado(transcriptRef.current);
        if (nuevos.length > 0) setBulkItems((prev) => [...prev, ...nuevos]);
        else alert("No se entendió ningún producto.");
        setTranscript("");
        transcriptRef.current = "";
      }
    } else {
      setTranscript("");
      transcriptRef.current = "";
      setIsListening(true);
      try {
        await iniciarDictadoContinuo(
          (textoActualizado) => {
            transcriptRef.current = textoActualizado;
            setTranscript(textoActualizado);
          },
          () => setIsListening(false),
        );
      } catch (error) {
        console.error("Error al iniciar dictado:", error);
        setIsListening(false);
      }
    }
  };

  const actualizarCampo = (index, campo, valor) => {
    const nuevos = [...bulkItems];
    nuevos[index][campo] = valor;
    setBulkItems(nuevos);
  };

  const eliminarItemPendiente = (index) => {
    setBulkItems(bulkItems.filter((_, i) => i !== index));
  };

  const totalFactura = bulkItems.reduce(
    (acc, item) => acc + (parseFloat(item.precio) || 0) * item.cantidad,
    0,
  );

  const aprobarFactura = async () => {
    if (bulkItems.length === 0) return alert("No hay productos en la lista.");
    if (
      bulkItems.some((item) => !item.precio || parseFloat(item.precio) <= 0)
    ) {
      return alert("Por favor, asigne un precio válido a todos los productos.");
    }
    if (!representante.trim()) {
      return alert(
        "Por favor, ingrese el nombre del representante o proveedor.",
      );
    }

    try {
      await db.transaction(
        "rw",
        [db.productos, db.facturas_ingreso, db.detalle_facturas],
        async () => {
          const facturaId = await db.facturas_ingreso.add({
            fecha: new Date().toISOString(),
            total: totalFactura,
            representante: representante.trim(),
          });

          for (const item of bulkItems) {
            await db.detalle_facturas.add({
              factura_id: facturaId,
              nombre_producto: item.nombre,
              cantidad: item.cantidad,
              precio_unitario: parseFloat(item.precio),
            });

            const prodExistente = await db.productos
              .where("nombre")
              .equalsIgnoreCase(item.nombre)
              .first();

            if (prodExistente) {
              const nuevaFecha = item.fecha_vencimiento
                ? item.fecha_vencimiento
                : prodExistente.fecha_vencimiento;
              const nuevoCodigo = item.codigo_barras.trim()
                ? item.codigo_barras.trim()
                : prodExistente.codigo_barras;

              await db.productos.update(prodExistente.id, {
                stock: prodExistente.stock + item.cantidad,
                fecha_vencimiento: nuevaFecha,
                codigo_barras: nuevoCodigo,
              });
            } else {
              await db.productos.add({
                nombre: item.nombre,
                precio: parseFloat(item.precio),
                stock: item.cantidad,
                fecha_vencimiento: item.fecha_vencimiento || "Sin fecha",
                codigo_barras: item.codigo_barras.trim() || null,
              });
            }
          }
        },
      );

      alert("✅ Factura de ingreso registrada y stock actualizado.");
      setBulkItems([]);
      setRepresentante("");
      setShowBulkModal(false);
    } catch (error) {
      console.error(error);
      alert("❌ Error al registrar la factura de ingreso.");
    }
  };

  // --- ORDENAMIENTO DE LA TABLA PRINCIPAL (LÓGICA FIFO MEJORADA) ---
  let prodsMostrar = [...productos];

  if (orden === "fifo") {
    prodsMostrar.sort((a, b) => {
      const fechaA = a.fecha_vencimiento;
      const fechaB = b.fecha_vencimiento;

      // 1. Si ambos son "Sin fecha", mantener el orden
      if (fechaA === "Sin fecha" && fechaB === "Sin fecha") return 0;

      // 2. Si 'a' no tiene fecha, va al final (1 significa que va después)
      if (fechaA === "Sin fecha") return 1;

      // 3. Si 'b' no tiene fecha, va al final (-1 significa que va antes)
      if (fechaB === "Sin fecha") return -1;

      // 4. Si ambos tienen fecha, comparar cronológicamente
      const dateA = new Date(fechaA);
      const dateB = new Date(fechaB);

      // Validación por si hay fechas corruptas
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;

      return dateA - dateB; // Ascendente: el más cercano a vencer va primero
    });
  }

  if (orden === "nombre")
    prodsMostrar.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (orden === "stock-asc") prodsMostrar.sort((a, b) => a.stock - b.stock);
  if (orden === "stock-desc") prodsMostrar.sort((a, b) => b.stock - a.stock);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <h2>Inventario Actual</h2>
        <button
          className="btn-primario"
          style={{ backgroundColor: "#8e44ad", width: "auto" }}
          onClick={() => setShowBulkModal(true)}
        >
          📦 Carga Masiva
        </button>
      </div>

      {/* FORMULARIO INDIVIDUAL */}
      <div className="card">
        <h3>Añadir Producto Individual</h3>
        <div className="form-grid">
          <input
            type="text"
            placeholder="Nombre"
            value={nuevoProd.nombre}
            onChange={(e) =>
              setNuevoProd({ ...nuevoProd, nombre: e.target.value })
            }
          />
          <input
            type="text"
            placeholder="Código de Barras (Opcional)"
            value={nuevoProd.codigo_barras}
            onChange={(e) =>
              setNuevoProd({ ...nuevoProd, codigo_barras: e.target.value })
            }
          />
          <input
            type="number"
            placeholder="Precio Venta"
            value={nuevoProd.precio}
            onChange={(e) =>
              setNuevoProd({ ...nuevoProd, precio: e.target.value })
            }
          />
          <input
            type="number"
            placeholder="Stock"
            value={nuevoProd.stock}
            onChange={(e) =>
              setNuevoProd({ ...nuevoProd, stock: e.target.value })
            }
          />
          <input
            type="date"
            value={nuevoProd.fecha_vencimiento}
            onChange={(e) =>
              setNuevoProd({ ...nuevoProd, fecha_vencimiento: e.target.value })
            }
          />
        </div>
        <button className="btn-primario" onClick={guardarProducto}>
          Guardar Producto
        </button>
      </div>

      {/* FILTROS */}
      <div className="barra-filtros">
        <div
          className="filtro-item"
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <label>Organizar por: </label>
          <select value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="fifo">
              Vencimiento (FIFO - Más próximos primero)
            </option>
            <option value="nombre">Nombre (A-Z)</option>
            <option value="stock-asc">Menor Stock</option>
            <option value="stock-desc">Mayor Stock</option>
          </select>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Vence</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {prodsMostrar.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.codigo_barras || "-"}</td>
                <td>${p.precio}</td>
                <td
                  style={{
                    color: p.stock <= 5 ? "red" : "inherit",
                    fontWeight: p.stock <= 5 ? "bold" : "normal",
                  }}
                >
                  {p.stock}
                </td>
                <td>{p.fecha_vencimiento}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn-accion btn-editar"
                    onClick={() => setEditando(p)}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-accion btn-eliminar"
                    onClick={() => eliminarProducto(p.id)}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE EDICIÓN INDIVIDUAL */}
      {editando && (
        <div className="modal-overlay active">
          <div className="modal-contenido">
            <h3>Editar Producto</h3>

            <div
              className="input-group"
              style={{ marginBottom: "10px", textAlign: "left" }}
            >
              <label>Nombre:</label>
              <input
                type="text"
                value={editando.nombre}
                onChange={(e) =>
                  setEditando({ ...editando, nombre: e.target.value })
                }
              />
            </div>

            <div
              className="input-group"
              style={{ marginBottom: "10px", textAlign: "left" }}
            >
              <label>Código de Barras:</label>
              <input
                type="text"
                value={editando.codigo_barras || ""}
                onChange={(e) =>
                  setEditando({ ...editando, codigo_barras: e.target.value })
                }
              />
            </div>

            <div
              className="input-group"
              style={{ marginBottom: "10px", textAlign: "left" }}
            >
              <label>Precio:</label>
              <input
                type="number"
                value={editando.precio}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    precio: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div
              className="input-group"
              style={{ marginBottom: "10px", textAlign: "left" }}
            >
              <label>Stock:</label>
              <input
                type="number"
                value={editando.stock}
                onChange={(e) =>
                  setEditando({ ...editando, stock: parseInt(e.target.value) })
                }
              />
            </div>

            <div
              className="input-group"
              style={{ marginBottom: "10px", textAlign: "left" }}
            >
              <label>Fecha de Vencimiento:</label>
              <input
                type="date"
                value={
                  editando.fecha_vencimiento !== "Sin fecha"
                    ? editando.fecha_vencimiento
                    : ""
                }
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    fecha_vencimiento: e.target.value,
                  })
                }
              />
            </div>

            <div className="modal-botones">
              <button
                type="button"
                className="btn-cancelar"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={guardarEdicion}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CARGA MASIVA (FACTURA DE INGRESO) */}
      {showBulkModal && (
        <div className="modal-overlay active">
          <div className="modal-contenido modal-large">
            <h2 style={{ textAlign: "center", color: "#8e44ad" }}>
              📦 Factura de Ingreso
            </h2>

            <div className="input-group" style={{ marginBottom: "15px" }}>
              <label>Representante / Proveedor del ingreso:</label>
              <input
                type="text"
                placeholder="Ej: Distribuidora Postobón, Juan Pérez..."
                value={representante}
                onChange={(e) => setRepresentante(e.target.value)}
                style={{ borderColor: "#8e44ad" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <button
                className={`btn-voz-busqueda ${isListening ? "escuchando" : ""}`}
                style={{
                  backgroundColor: isListening ? "#e74c3c" : "#8e44ad",
                  flex: 1,
                  width: "100%",
                }}
                onClick={toggleDictado}
              >
                {isListening ? "🔴 Detener y Procesar" : "🎤 Dictar Productos"}
              </button>
            </div>

            {transcript && (
              <div
                style={{
                  padding: "10px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "5px",
                  marginBottom: "15px",
                  fontStyle: "italic",
                  color: "#555",
                }}
              >
                Escuchando: "{transcript}"
              </div>
            )}

            {bulkItems.length > 0 ? (
              <div
                className="table-responsive"
                style={{ marginBottom: "15px" }}
              >
                <table style={{ minWidth: "850px" }}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ width: "70px", textAlign: "center" }}>
                        Cant.
                      </th>
                      <th style={{ width: "110px" }}>Precio U. ($)</th>
                      <th style={{ width: "130px" }}>Cód. Barras</th>
                      <th style={{ width: "140px" }}>Vencimiento</th>
                      <th style={{ width: "90px" }}>Subtotal</th>
                      <th style={{ width: "50px", textAlign: "center" }}>X</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.map((item, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            value={item.nombre}
                            onChange={(e) =>
                              actualizarCampo(index, "nombre", e.target.value)
                            }
                            style={{ padding: "8px", width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarCampo(
                                index,
                                "cantidad",
                                parseInt(e.target.value) || 1,
                              )
                            }
                            min="1"
                            style={{
                              padding: "8px",
                              textAlign: "center",
                              width: "100%",
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.precio}
                            onChange={(e) =>
                              actualizarCampo(index, "precio", e.target.value)
                            }
                            placeholder="0.00"
                            style={{ padding: "8px", width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.codigo_barras || ""}
                            onChange={(e) =>
                              actualizarCampo(
                                index,
                                "codigo_barras",
                                e.target.value,
                              )
                            }
                            placeholder="Opcional"
                            style={{ padding: "8px", width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={item.fecha_vencimiento}
                            onChange={(e) =>
                              actualizarCampo(
                                index,
                                "fecha_vencimiento",
                                e.target.value,
                              )
                            }
                            style={{ padding: "8px", width: "100%" }}
                          />
                        </td>
                        <td>
                          $
                          {(
                            (parseFloat(item.precio) || 0) * item.cantidad
                          ).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            className="btn-accion btn-eliminar"
                            onClick={() => eliminarItemPendiente(index)}
                          >
                            ❌
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{ textAlign: "center", padding: "20px", color: "#888" }}
              >
                No hay productos en la lista. Usa el botón de dictado o añade
                manualmente.
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "20px",
                borderTop: "2px solid #eee",
                paddingTop: "15px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Total Factura:{" "}
                <span style={{ color: "#27ae60" }}>
                  ${totalFactura.toFixed(2)}
                </span>
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flex: 1,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn-cancelar"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkItems([]);
                    setRepresentante("");
                  }}
                >
                  Cerrar
                </button>
                <button
                  className="btn-primario"
                  onClick={aprobarFactura}
                  style={{ backgroundColor: "#27ae60" }}
                >
                  ✅ Aprobar e Ingresar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
