import Dexie from "dexie";

export const db = new Dexie("CachaAppDB");

db.version(1).stores({
  productos: "++id, nombre, fecha_vencimiento",
  ventas: "++id, fecha, metodo_pago",
  detalle_ventas: "++id, venta_id, producto_id",
  fiados: "++id, cliente",
  caja: "++id, fecha, tipo, metodo",
  facturas_ingreso: "++id, fecha",
  detalle_facturas: "++id, factura_id",
});

// Añadimos la versión 3 (asumiendo que ya tenías la 2) para incluir el código de barras
db.version(3).stores({
  productos: "++id, nombre, fecha_vencimiento, codigo_barras",
  ventas: "++id, fecha, metodo_pago",
  detalle_ventas: "++id, venta_id, producto_id",
  fiados: "++id, cliente",
  caja: "++id, fecha, tipo, metodo",
  facturas_ingreso: "++id, fecha",
  detalle_facturas: "++id, factura_id",
});
