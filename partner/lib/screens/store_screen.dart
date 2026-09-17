import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';

class StoreScreen extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() onLogout;
  const StoreScreen({super.key, required this.api, required this.onLogout});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  final _description = TextEditingController();
  final _phone = TextEditingController();
  final _minOrder = TextEditingController();
  final _prepMinutes = TextEditingController();
  Map<String, dynamic> _restaurant = {};
  bool _loading = true;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _description.dispose();
    _phone.dispose();
    _minOrder.dispose();
    _prepMinutes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/merchant/profile');
      final restaurant = Map<String, dynamic>.from(data['restaurant'] as Map);
      _restaurant = restaurant;
      _description.text = restaurant['description']?.toString() ?? '';
      _phone.text = restaurant['phone']?.toString() ?? '';
      _minOrder.text = restaurant['minOrder']?.toString() ?? '0';
      _prepMinutes.text = restaurant['prepMinutes']?.toString() ?? '15';
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() { _busy = true; _error = ''; });
    try {
      final saved = await widget.api.patch('/merchant/restaurant', {
        'description': _description.text.trim(),
        'phone': _phone.text.trim(),
        'minOrder': double.tryParse(_minOrder.text) ?? 0,
        'prepMinutes': int.tryParse(_prepMinutes.text) ?? 15,
      });
      if (mounted) {
        setState(() => _restaurant = Map<String, dynamic>.from(saved as Map));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ إعدادات المتجر')));
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickCover() async {
    final image = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 82, maxWidth: 1600);
    if (image == null) return;
    setState(() => _busy = true);
    try {
      final data = await widget.api.uploadImage('/merchant/restaurant/image', image.path);
      if (mounted) setState(() => _restaurant = Map<String, dynamic>.from(data['restaurant'] as Map));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final cover = AppConfig.imageUrl(_restaurant['imageUrl']?.toString());
    final name = _restaurant['name']?.toString() ?? 'المتجر';
    final address = _restaurant['address']?.toString() ?? '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 116),
      children: [
        Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: const Color(0xFF071D3A),
            borderRadius: BorderRadius.circular(26),
            boxShadow: const [BoxShadow(color: Color(0x18071D3A), blurRadius: 24, offset: Offset(0, 10))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Stack(
                children: [
                  cover.isEmpty
                      ? Container(
                          height: 180,
                          color: const Color(0xFF102F56),
                          child: const Center(child: Icon(Icons.storefront_rounded, size: 64, color: Color(0x55FFFFFF))),
                        )
                      : Image.network(cover, height: 180, width: double.infinity, fit: BoxFit.cover),
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, const Color(0xCC071D3A)],
                          stops: const [.35, 1],
                        ),
                      ),
                    ),
                  ),
                  PositionedDirectional(
                    end: 12,
                    top: 12,
                    child: IconButton.filled(
                      onPressed: _busy ? null : _pickCover,
                      style: IconButton.styleFrom(backgroundColor: const Color(0xD9FFFFFF), foregroundColor: const Color(0xFF071D3A)),
                      icon: const Icon(Icons.photo_camera_outlined),
                      tooltip: 'تغيير الغلاف',
                    ),
                  ),
                  PositionedDirectional(
                    start: 18,
                    end: 18,
                    bottom: 14,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                        if (address.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              const Icon(Icons.location_on_outlined, color: Color(0xFFC8D4E3), size: 17),
                              const SizedBox(width: 4),
                              Expanded(child: Text(address, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFFC8D4E3), fontSize: 12.5))),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Text('بيانات المتجر', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionTitle(icon: Icons.info_outline_rounded, title: 'المعلومات الأساسية', subtitle: 'الوصف ورقم التواصل الظاهر للزبائن'),
                const SizedBox(height: 14),
                TextField(controller: _description, maxLines: 3, decoration: const InputDecoration(labelText: 'وصف المتجر', prefixIcon: Icon(Icons.notes_rounded))),
                const SizedBox(height: 12),
                TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'هاتف المتجر', prefixIcon: Icon(Icons.phone_outlined))),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionTitle(icon: Icons.tune_rounded, title: 'إعدادات الطلب', subtitle: 'تحكم في الحد الأدنى ووقت تجهيز الطلب'),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: TextField(controller: _minOrder, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'أقل طلب (₪)', prefixIcon: Icon(Icons.payments_outlined)))),
                    const SizedBox(width: 10),
                    Expanded(child: TextField(controller: _prepMinutes, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'التحضير (دقيقة)', prefixIcon: Icon(Icons.timer_outlined)))),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFFFEFEF), borderRadius: BorderRadius.circular(14)),
            child: Text(_error, style: const TextStyle(color: Color(0xFFC23A3A))),
          ),
        ],
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: _busy ? null : _save,
          icon: const Icon(Icons.save_outlined),
          label: Text(_busy ? 'جارٍ الحفظ...' : 'حفظ إعدادات المتجر'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout_rounded, color: Color(0xFFC23A3A)),
          label: const Text('تسجيل الخروج', style: TextStyle(color: Color(0xFFC23A3A))),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _SectionTitle({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: const Color(0xFFFFF0E2), borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, color: const Color(0xFFFF7A00), size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5)),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(color: Color(0xFF7A8595), fontSize: 12.2, height: 1.35)),
              ],
            ),
          ),
        ],
      );
}
