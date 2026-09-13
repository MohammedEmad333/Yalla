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
  final _openTime = TextEditingController();
  final _closeTime = TextEditingController();
  Map<String, dynamic> _restaurant = {};
  bool _isOpen = true;
  bool _loading = true;
  bool _busy = false;
  String _error = '';

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    _description.dispose(); _phone.dispose(); _minOrder.dispose(); _prepMinutes.dispose(); _openTime.dispose(); _closeTime.dispose();
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
      _openTime.text = restaurant['openTime']?.toString() ?? '';
      _closeTime.text = restaurant['closeTime']?.toString() ?? '';
      _isOpen = restaurant['isOpen'] != false;
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
        'openTime': _openTime.text.trim(),
        'closeTime': _closeTime.text.trim(),
        'isOpen': _isOpen,
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
      children: [
        Card(child: Column(children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            child: cover.isEmpty
                ? Container(height: 150, color: Colors.black12, child: const Center(child: Icon(Icons.storefront_rounded, size: 56)))
                : Image.network(cover, height: 150, width: double.infinity, fit: BoxFit.cover),
          ),
          ListTile(
            title: Text(_restaurant['name']?.toString() ?? 'المتجر', style: const TextStyle(fontWeight: FontWeight.w900)),
            subtitle: Text(_restaurant['address']?.toString() ?? ''),
            trailing: IconButton(onPressed: _busy ? null : _pickCover, icon: const Icon(Icons.photo_camera_outlined), tooltip: 'تغيير الغلاف'),
          ),
        ])),
        const SizedBox(height: 12),
        Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('إعدادات التشغيل', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            SwitchListTile(value: _isOpen, onChanged: (v) => setState(() => _isOpen = v), title: Text(_isOpen ? 'المتجر مفتوح' : 'المتجر مغلق'), contentPadding: EdgeInsets.zero),
            TextField(controller: _description, maxLines: 2, decoration: const InputDecoration(labelText: 'وصف المتجر')),
            const SizedBox(height: 10),
            TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'هاتف المتجر')),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: TextField(controller: _minOrder, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'أقل طلب (₪)'))),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: _prepMinutes, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'التحضير (دقيقة)'))),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: TextField(controller: _openTime, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'يفتح HH:MM'))),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: _closeTime, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'يغلق HH:MM'))),
            ]),
            if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _save, child: Padding(padding: const EdgeInsets.all(11), child: Text(_busy ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'))),
          ]),
        )),
        const SizedBox(height: 16),
        OutlinedButton.icon(onPressed: widget.onLogout, icon: const Icon(Icons.logout_rounded), label: const Text('تسجيل الخروج')),
      ],
    );
  }
}
