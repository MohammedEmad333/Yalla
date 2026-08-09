// شاشة إنشاء طلب توصيل (تطبيق المستخدم)
// Clean Architecture: هذه طبقة العرض (Presentation) — تستدعي طبقة الـ Repository
// عبر Provider. لأغراض الـ MVP نضع منطق الاستدعاء مباشرةً مع تعليقات توضيحية.

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/network/api_client.dart';

class CreateOrderScreen extends StatefulWidget {
  final ApiClient api;
  const CreateOrderScreen({super.key, required this.api});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  // متحكّم الخريطة ونقاط الاستلام/التسليم المختارة
  GoogleMapController? _mapController;
  LatLng? _pickup;
  LatLng? _dropoff;

  // نحدّد أي نقطة نختار حاليًا (استلام أم تسليم)
  bool _selectingPickup = true;

  final _noteController = TextEditingController();
  bool _submitting = false;

  // التسعيرة التقديرية القادمة من الخادم
  num? _quotePrice;
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  // عند الضغط على الخريطة نُسند النقطة للحقل النشط ثم نحدّث التسعيرة
  void _onMapTap(LatLng point) {
    setState(() {
      if (_selectingPickup) {
        _pickup = point;
      } else {
        _dropoff = point;
      }
    });
    _refreshQuote(); // احسب السعر فور اكتمال النقطتين
  }

  // جلب تسعيرة تقديرية من الخادم عند توفّر النقطتين
  Future<void> _refreshQuote() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _loadingQuote = true);
    try {
      final q = await widget.api.post('/orders/quote', {
        'pickup': [_pickup!.longitude, _pickup!.latitude], // [lng, lat]
        'dropoff': [_dropoff!.longitude, _dropoff!.latitude],
        'vehicleType': 'motorcycle',
      });
      setState(() {
        _quotePrice = q['price'];
        _quoteDistance = q['distanceKm'];
        _quoteEta = q['etaMinutes'];
      });
    } on ApiException {
      // نتجاهل خطأ التسعيرة بهدوء — السعر يُحسب نهائيًا في الخادم عند الإنشاء
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  // بناء علامات الخريطة (Markers) للنقطتين
  Set<Marker> _buildMarkers() {
    final markers = <Marker>{};
    if (_pickup != null) {
      markers.add(Marker(
        markerId: const MarkerId('pickup'),
        position: _pickup!,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: const InfoWindow(title: 'نقطة الاستلام'),
      ));
    }
    if (_dropoff != null) {
      markers.add(Marker(
        markerId: const MarkerId('dropoff'),
        position: _dropoff!,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: const InfoWindow(title: 'نقطة التسليم'),
      ));
    }
    return markers;
  }

  // إرسال الطلب إلى الـ Backend
  Future<void> _submitOrder() async {
    if (_pickup == null || _dropoff == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('حدّد نقطتي الاستلام والتسليم أولًا')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      // ── هنا يُستدعى الـ Repository ──────────────────────────────
      // await orderRepository.createOrder(
      //   pickup: {'address': '...', 'location': {'type':'Point',
      //            'coordinates': [_pickup!.longitude, _pickup!.latitude]}},
      //   dropoff: {'address': '...', 'location': {'type':'Point',
      //            'coordinates': [_dropoff!.longitude, _dropoff!.latitude]}},
      //   packageNote: _noteController.text,
      // );
      // الـ Repository يرسل POST /api/orders ثم ينضمّ لغرفة الطلب على السوكت
      await Future.delayed(const Duration(seconds: 1)); // محاكاة

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إنشاء الطلب بنجاح — بانتظار إسناد كابتن')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب توصيل جديد')),
      body: Column(
        children: [
          // الخريطة لاختيار النقاط
          Expanded(
            child: GoogleMap(
              initialCameraPosition: const CameraPosition(
                target: LatLng(30.0444, 31.2357), // القاهرة كنقطة بداية
                zoom: 12,
              ),
              onMapCreated: (c) => _mapController = c,
              onTap: _onMapTap,
              markers: _buildMarkers(),
              myLocationEnabled: true,
            ),
          ),

          // لوحة الإدخال السفلية
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // مبدّل: نختار نقطة الاستلام أم التسليم
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('الاستلام'), icon: Icon(Icons.store)),
                    ButtonSegment(value: false, label: Text('التسليم'), icon: Icon(Icons.flag)),
                  ],
                  selected: {_selectingPickup},
                  onSelectionChanged: (s) => setState(() => _selectingPickup = s.first),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _noteController,
                  decoration: const InputDecoration(
                    labelText: 'ملاحظة الشحنة (اختياري)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),

                // بطاقة التسعيرة التقديرية (تظهر بعد اختيار النقطتين)
                if (_loadingQuote || _quotePrice != null)
                  Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      leading: const Icon(Icons.payments),
                      title: _loadingQuote
                          ? const Text('جارٍ حساب السعر...')
                          : Text('السعر التقديري: $_quotePrice ج.م'),
                      subtitle: _quoteDistance != null
                          ? Text('المسافة: ~$_quoteDistance كم'
                              '${_quoteEta != null ? ' · الزمن المتوقّع: ~$_quoteEta دقيقة' : ''}')
                          : null,
                    ),
                  ),

                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _submitting ? null : _submitOrder,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send),
                    label: const Text('تأكيد الطلب'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _noteController.dispose();
    _mapController?.dispose();
    super.dispose();
  }
}
