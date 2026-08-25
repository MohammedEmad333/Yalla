// Card 92: أنواع المركبات الثلاثة وتسمياتها العربية الموحّدة عبر لوحة الأدمن.
// هوائية (bicycle) / كهربائية (electric) / نارية (motorcycle)

export const VEHICLE_TYPES = [
  { value: 'bicycle', label: 'دراجة هوائية' },
  { value: 'electric', label: 'دراجة كهربائية' },
  { value: 'motorcycle', label: 'دراجة نارية' },
];

const LABELS = VEHICLE_TYPES.reduce((m, v) => ({ ...m, [v.value]: v.label }), {});

// تسمية عربية لنوع المركبة (مع بديل افتراضي للقيم القديمة/غير المعروفة)
export function vehicleLabel(type) {
  return LABELS[type] || 'دراجة نارية';
}
