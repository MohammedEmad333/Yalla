import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';

class MenuScreen extends StatefulWidget {
  final ApiClient api;
  const MenuScreen({super.key, required this.api});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/merchant/menu');
      if (mounted) setState(() { _items = data as List<dynamic>; _error = ''; });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openEditor([Map<String, dynamic>? existing]) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (_) => _ItemEditor(api: widget.api, item: existing),
    );
    if (changed == true) await _load();
  }

  Future<void> _toggle(Map<String, dynamic> item) async {
    try {
      await widget.api.patch('/merchant/menu/${item['_id']}', {'available': item['available'] != true});
      await _load();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _remove(Map<String, dynamic> item) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('حذف المنتج؟'),
        content: Text('سيتم حذف «${item['name']}» نهائيًا.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('حذف')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await widget.api.delete('/merchant/menu/${item['_id']}');
      await _load();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final availableCount = _items.where((e) => (e as Map)['available'] == true).length;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('إضافة منتج', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFFF7A00), Color(0xFFFFA340)]),
                borderRadius: BorderRadius.circular(26),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('قائمة المنتجات', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 5),
                        Text('${_items.length} منتج · $availableCount متاح للطلب', style: const TextStyle(color: Color(0xFFFFF0E3), fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(color: const Color(0x24FFFFFF), borderRadius: BorderRadius.circular(17)),
                    child: const Icon(Icons.inventory_2_rounded, color: Colors.white, size: 28),
                  ),
                ],
              ),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 18),
            const Text('منتجات متجرك', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (_items.isEmpty)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 52, horizontal: 20),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
                child: const Column(
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 54, color: Color(0xFFB3BCC9)),
                    SizedBox(height: 12),
                    Text('ابدأ بإضافة أول منتج', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                    SizedBox(height: 4),
                    Text('أضف الاسم والسعر والصورة ليظهر المنتج للزبائن.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF7A8595))),
                  ],
                ),
              )
            else
              ..._items.map((raw) {
                final item = Map<String, dynamic>.from(raw as Map);
                final image = AppConfig.imageUrl(item['imageUrl']?.toString());
                final available = item['available'] == true;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(24),
                      onTap: () => _openEditor(item),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: image.isEmpty
                                  ? Container(
                                      width: 72,
                                      height: 72,
                                      color: const Color(0xFFF1F3F6),
                                      child: const Icon(Icons.fastfood_rounded, color: Color(0xFF98A1B2), size: 30),
                                    )
                                  : Image.network(image, width: 72, height: 72, fit: BoxFit.cover),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item['name']?.toString() ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5)),
                                  const SizedBox(height: 4),
                                  Text(item['category']?.toString().trim().isNotEmpty == true ? item['category'].toString() : 'بدون قسم', style: const TextStyle(color: Color(0xFF7A8595), fontSize: 12.5)),
                                  const SizedBox(height: 7),
                                  Row(
                                    children: [
                                      Text('${item['price'] ?? 0} ₪', style: const TextStyle(color: Color(0xFFFF7A00), fontWeight: FontWeight.w900, fontSize: 15)),
                                      const SizedBox(width: 10),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: available ? const Color(0xFFEAF8F1) : const Color(0xFFF1F3F6),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          available ? 'متاح' : 'متوقف',
                                          style: TextStyle(color: available ? const Color(0xFF218A5A) : const Color(0xFF7A8595), fontSize: 11, fontWeight: FontWeight.w800),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            PopupMenuButton<String>(
                              onSelected: (value) {
                                if (value == 'edit') _openEditor(item);
                                if (value == 'toggle') _toggle(item);
                                if (value == 'delete') _remove(item);
                              },
                              itemBuilder: (_) => [
                                const PopupMenuItem(value: 'edit', child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('تعديل'), contentPadding: EdgeInsets.zero)),
                                PopupMenuItem(value: 'toggle', child: ListTile(leading: Icon(available ? Icons.visibility_off_outlined : Icons.visibility_outlined), title: Text(available ? 'إيقاف التوفر' : 'تفعيل التوفر'), contentPadding: EdgeInsets.zero)),
                                const PopupMenuItem(value: 'delete', child: ListTile(leading: Icon(Icons.delete_outline_rounded), title: Text('حذف'), contentPadding: EdgeInsets.zero)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class _ItemEditor extends StatefulWidget {
  final ApiClient api;
  final Map<String, dynamic>? item;
  const _ItemEditor({required this.api, this.item});

  @override
  State<_ItemEditor> createState() => _ItemEditorState();
}

class _ItemEditorState extends State<_ItemEditor> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _category;
  late final TextEditingController _price;
  late final TextEditingController _variants;
  bool _available = true;
  bool _busy = false;
  XFile? _image;
  String _error = '';

  @override
  void initState() {
    super.initState();
    final item = widget.item ?? {};
    _name = TextEditingController(text: item['name']?.toString() ?? '');
    _description = TextEditingController(text: item['description']?.toString() ?? '');
    _category = TextEditingController(text: item['category']?.toString() ?? '');
    _price = TextEditingController(text: item['price']?.toString() ?? '');
    final variants = (item['variants'] as List?) ?? const [];
    _variants = TextEditingController(text: variants.map((v) => '${v['label']}:${v['price']}').join('\n'));
    _available = item['available'] != false;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _category.dispose();
    _price.dispose();
    _variants.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final price = double.tryParse(_price.text.trim());
    if (_name.text.trim().isEmpty || price == null || price <= 0) {
      setState(() => _error = 'أدخل اسم المنتج وسعرًا صحيحًا');
      return;
    }
    setState(() { _busy = true; _error = ''; });
    try {
      final body = {
        'name': _name.text.trim(),
        'description': _description.text.trim(),
        'category': _category.text.trim(),
        'price': price,
        'available': _available,
        'variants': _variants.text.split('\n').map((line) {
          final parts = line.split(':');
          return {
            'label': parts.first.trim(),
            'price': parts.length > 1 ? double.tryParse(parts.last.trim()) : null,
          };
        }).where((v) => (v['label'] as String).isNotEmpty && v['price'] != null).toList(),
      };
      final dynamic saved = widget.item == null
          ? await widget.api.post('/merchant/menu', body)
          : await widget.api.patch('/merchant/menu/${widget.item!['_id']}', body);
      final id = saved['_id']?.toString() ?? widget.item?['_id']?.toString();
      if (_image != null && id != null) {
        await widget.api.uploadImage('/merchant/menu/$id/image', _image!.path);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 10, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(child: Container(width: 42, height: 5, decoration: BoxDecoration(color: const Color(0xFFD8DDE5), borderRadius: BorderRadius.circular(20)))),
            const SizedBox(height: 18),
            Text(widget.item == null ? 'إضافة منتج جديد' : 'تعديل المنتج', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 5),
            const Text('أدخل تفاصيل المنتج كما ستظهر للزبائن.', style: TextStyle(color: Color(0xFF7A8595))),
            const SizedBox(height: 20),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم المنتج', prefixIcon: Icon(Icons.sell_outlined))),
            const SizedBox(height: 12),
            TextField(controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'السعر (₪)', prefixIcon: Icon(Icons.payments_outlined))),
            const SizedBox(height: 12),
            TextField(controller: _category, decoration: const InputDecoration(labelText: 'القسم', prefixIcon: Icon(Icons.category_outlined))),
            const SizedBox(height: 12),
            TextField(controller: _description, maxLines: 2, decoration: const InputDecoration(labelText: 'الوصف', prefixIcon: Icon(Icons.notes_rounded))),
            const SizedBox(height: 12),
            TextField(
              controller: _variants,
              maxLines: 4,
              textDirection: TextDirection.rtl,
              decoration: const InputDecoration(
                labelText: 'أحجام أو أوزان إضافية',
                hintText: 'صغير:10\nوسط:15\n1 كغ:20',
                helperText: 'كل خيار وسعره في سطر منفصل',
                prefixIcon: Icon(Icons.tune_rounded),
              ),
            ),
            const SizedBox(height: 6),
            SwitchListTile.adaptive(
              value: _available,
              onChanged: (v) => setState(() => _available = v),
              title: const Text('متاح للطلب', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: const Text('يمكن للزبائن طلب هذا المنتج'),
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 4),
            OutlinedButton.icon(
              onPressed: () async {
                final image = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 82, maxWidth: 1400);
                if (image != null) setState(() => _image = image);
              },
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(_image == null ? 'اختيار صورة للمنتج' : 'تم اختيار الصورة'),
            ),
            if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(_busy ? 'جارٍ الحفظ...' : 'حفظ المنتج'),
            ),
          ]),
        ),
      );
}
