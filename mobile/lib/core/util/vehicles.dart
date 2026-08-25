// Card 92: أنواع المركبات الثلاثة وتسمياتها العربية الموحّدة في التطبيق.
// هوائية (bicycle) / كهربائية (electric) / نارية (motorcycle)

class VehicleType {
  final String value;
  final String label;
  const VehicleType(this.value, this.label);
}

const List<VehicleType> kVehicleTypes = [
  VehicleType('bicycle', 'دراجة هوائية'),
  VehicleType('electric', 'دراجة كهربائية'),
  VehicleType('motorcycle', 'دراجة نارية'),
];

/// تسمية عربية لنوع المركبة (مع بديل افتراضي للقيم القديمة/غير المعروفة).
String vehicleLabel(String? type) {
  for (final v in kVehicleTypes) {
    if (v.value == type) return v.label;
  }
  return 'دراجة نارية';
}
