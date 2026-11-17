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

// Subimos a la versión 4 para agregar el código de barras
db.version(4).stores({
  productos: "++id, nombre, fecha_vencimiento, codigo_barras",
  ventas: "++id, fecha, metodo_pago",
  detalle_ventas: "++id, venta_id, producto_id",
  fiados: "++id, cliente",
  caja: "++id, fecha, tipo, metodo",
  facturas_ingreso: "++id, fecha",
  detalle_facturas: "++id, factura_id",
});
