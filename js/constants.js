/* ====================================================================
   constants.js — datos fijos del dominio (categorías, meses, colores).
   Si agregas un módulo nuevo que necesite su propia taxonomía, este es
   buen lugar para sus constantes, o crea un constants.js dentro de
   modules/ si son muy específicas de ese módulo.
   ==================================================================== */

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const MESES_KEYS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

export const CATS_GASTO = {
  'Alimentación': ['Arroz','Huevos','Tomate','Papas','Frutas','Carnes','Condimentos','Comida fuera','Comida variada'],
  'Servicios': ['Banco','Internet','Luz','Gas','Teléfono'],
  'Higiene': ['Papel higiénico','Pasta de dientes','Gastos de higiene','Corte de cabello'],
  'Salud': ['Médico','Dentista','Medicamentos','Fisioterapeuta','Otros'],
  'Transporte': ['Bus','Taxi','Bicicleta','Combustible','Otros'],
  'Educación': ['Cursos','Libros','Materiales','Licencia','Otros'],
  'Vestimenta': ['Ropa interior','Camisas / Polos','Pantalones','Zapatos / Zapatillas','Ropa deportiva','Ropa formal','Accesorios','Medias','Abrigos','Otros'],
  'Imprevistos': ['Electrodomésticos','Reparaciones','Emergencias','Otros'],
  'Ocio': ['Entretenimiento','Restaurantes','Viajes','Otros'],
  'Deudas': ['Préstamo','Tarjeta de crédito','Otros'],
  'Otros': ['Otros'],
};

export const CAT_COLORS = {
  'Alimentación':'#C1603F','Servicios':'#3D5A73','Higiene':'#8B6BA8','Salud':'#C94F6D',
  'Transporte':'#3D8FA3','Educación':'#5C7A52','Vestimenta':'#C99A3A','Imprevistos':'#9A6B3F',
  'Ocio':'#5C9BAE','Deudas':'#7A5C8B','Otros':'#9A8F7A'
};

export const THEME_KEY = 'finanzas_theme';
