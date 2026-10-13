// Cliente de la API. Las sesiones viajan en una cookie HttpOnly: el navegador nunca guarda contraseñas ni tokens.
export class ApiError extends Error {
  constructor(code, status, details) { super(code); this.code = code; this.status = status; this.details = details; }
}

const MESSAGES = {
  HB_GPS_AUTH_REQUIRED: 'Tu sesión venció. Entra de nuevo.',
  HB_GPS_INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  HB_GPS_TOO_MANY_ATTEMPTS: 'Demasiados intentos. Espera unos minutos.',
  HB_GPS_LICENSE_REQUIRED: 'Este GPS no tiene licencia vigente para esa función.',
  HB_GPS_INSUFFICIENT_CREDITS: 'No hay créditos suficientes.',
  HB_GPS_PASSWORD_CONFIRMATION_REQUIRED: 'La contraseña no es correcta.',
  HB_GPS_REASON_REQUIRED: 'Escribe el motivo.',
  HB_GPS_EMAIL_ALREADY_IN_USE: 'Ese correo ya tiene una cuenta.',
  HB_GPS_ALREADY_EXISTS: 'Ya existe un registro con esos datos.',
  HB_GPS_DEVICE_LIMIT_REACHED: 'Se alcanzó el límite de equipos del plan.',
  HB_GPS_EMPLOYEE_USER_LIMIT_REACHED: 'Se alcanzó el límite de usuarios de la empresa.',
  HB_GPS_ROUTE_TOO_SHORT: 'La ruta es demasiado corta.',
  HB_GPS_SELECT_COMPANY: 'Elige primero una empresa (arriba, en el selector).',
  HB_GPS_SHAPE_INVALID: 'La forma de la geovalla no es válida.',
  HB_GPS_COMPANY_SCOPE_DENIED: 'Esa empresa no está disponible para tu cuenta.',
  HB_GPS_PLAN_REQUIRED: 'Elige el plan del GPS.',
  HB_GPS_COMMAND_UNSUPPORTED: 'Este modelo de GPS no admite esa orden.',
  HB_GPS_DEVICE_NOT_CONNECTED: 'El GPS no está conectado en este momento. Inténtalo cuando vuelva a reportar.',
  HB_GPS_DECLARATION_REQUIRED: 'Debes aceptar la declaración para continuar.',
  HB_GPS_VALIDATION_ERROR: 'Revisa los datos del formulario.',
  HB_GPS_INVALID_RANGE: 'El rango de fechas no es válido.',
  HB_GPS_RANGE_TOO_LARGE: 'El rango de fechas es demasiado largo.',
  HB_GPS_WHATSAPP_PHONE_INVALID: 'Un número de WhatsApp no es válido. Escribe 10 dígitos (República Dominicana) o el número con su código de país.',
  HB_GPS_WHATSAPP_CONSENT_REQUIRED: 'Confirma que esas personas aceptaron recibir avisos por WhatsApp.',
  HB_GPS_WHATSAPP_NOT_CONFIGURED: 'WhatsApp todavía no está conectado (falta el número o el token).',
  HB_GPS_WHATSAPP_WABA_REQUIRED: 'Falta el identificador de la cuenta de WhatsApp Business (WABA ID).',
  HB_GPS_WHATSAPP_TOKEN_REQUIRED: 'Pega el token de acceso de WhatsApp.',
  HB_GPS_WHATSAPP_TEMPLATE_INVALID: 'La plantilla no cumple las reglas de Meta.',
  HB_GPS_WHATSAPP_TEMPLATE_LOCKED: 'Esa plantilla ya está en revisión o aprobada y no se puede cambiar.',
  HB_GPS_WHATSAPP_TEMPLATE_BUILTIN: 'Las plantillas que trae HB GPS no se pueden eliminar.',
  HB_GPS_WHATSAPP_TEMPLATE_NOT_FOUND: 'La plantilla no existe.',
  HB_GPS_WHATSAPP_NO_APPROVED_TEMPLATE: 'Todavía no hay una plantilla aprobada por Meta. Envíalas a revisión y actualiza los estados.',
  HB_GPS_META_190: 'El token de WhatsApp venció o no es válido. Genera uno permanente y pégalo de nuevo.',
  HB_GPS_META_100: 'Meta rechazó un dato (revisa los identificadores).',
  HB_GPS_META_131026: 'Ese número no tiene WhatsApp.'
};
// «password: String must contain at least 12 character(s)» → «La contraseña debe tener al menos 12 caracteres».
const FIELD_NAMES = { password: 'La contraseña', newPassword: 'La nueva contraseña', currentPassword: 'La contraseña actual', email: 'El correo', name: 'El nombre', imei: 'El IMEI', plate: 'La placa', phone: 'El teléfono', companyId: 'La empresa', role: 'El rol', endCustomerId: 'El cliente final', seconds: 'Los segundos', frequency: 'La frecuencia' };
function explainDetail(detail) {
  const [field, ...rest] = String(detail).split(': ');
  const message = rest.join(': ');
  const who = FIELD_NAMES[field] || `El campo «${field}»`;
  const least = message.match(/at least (\d+) character/i);
  if (least) return `${who} debe tener al menos ${least[1]} caracteres.`;
  if (/invalid email/i.test(message)) return `${who} no es un correo válido.`;
  if (/^required$/i.test(message)) return `${who} es obligatorio.`;
  if (/at most (\d+) character/i.test(message)) return `${who} es demasiado largo.`;
  if (/invalid uuid/i.test(message)) return `${who} no es válido; elige una opción de la lista.`;
  return `${who}: ${message}`;
}
export const explain = (error) => {
  if (!(error instanceof ApiError)) return error?.message || 'No se pudo completar la operación';
  if (error.code === 'HB_GPS_INSUFFICIENT_CREDITS' && error.details?.required != null) return `No hay créditos suficientes: este plan cuesta ${error.details.required} y hay ${error.details.balance}. Pide una recarga a HB GPS o deja el registro pendiente hasta recargar.`;
  if (error.code === 'HB_GPS_VALIDATION_ERROR' && Array.isArray(error.details) && error.details.length) return error.details.slice(0, 3).map(explainDetail).join(' ');
  if (MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.code?.startsWith('HB_GPS_PERMISSION_DENIED')) return 'Tu rol no permite esta acción.';
  return error.code;
};

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const response = await fetch(path, { method, credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return response;
  if (response.status === 204) return { data: null };
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(json.error || `HTTP_${response.status}`, response.status, json.details);
  return json;
}
export const get = async (path) => (await api(path)).data;
export const getFull = (path) => api(path);
export const post = async (path, body) => (await api(path, { method: 'POST', body })).data;
export const put = async (path, body) => (await api(path, { method: 'PUT', body })).data;
export const patch = async (path, body) => (await api(path, { method: 'PATCH', body })).data;
export const del = (path) => api(path, { method: 'DELETE' });
export const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = q.toString();
  return s ? `?${s}` : '';
};
