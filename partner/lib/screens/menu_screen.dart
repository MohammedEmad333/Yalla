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
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('منتج جديد'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? ListView(children: [
                const SizedBox(height: 150),
                const Icon(Icons.inventory_2_outlined, size: 60),
                const SizedBox(height: 12),
                Center(child: Text(_error.isEmpty ? 'أضف أول منتج لمتجرك' : _error)),
              ])
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, index) {
                  final item = Map<String, dynamic>.from(_items[index] as Map);
                  final image = AppConfig.imageUrl(item['imageUrl']?.toString());
                  return Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.all(10),
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: image.isEmpty
                            ? Container(width: 58, height: 58, color: Colors.black12, child: const Icon(Icons.fastfood_rounded))
                            : Image.network(image, width: 58, height: 58, fit: BoxFit.cover),
                      ),
                      title: Text(item['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('${item['category'] ?? 'بدون قسم'} · ${item['price'] ?? 0} ₪'),
                      trailing: PopupMenuButton<String>(
                        onSelected: (value) {
                          if (value == 'edit') _openEditor(item);
                          if (value == 'toggle') _toggle(item);
                          if (value == 'delete') _remove(item);
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'edit', child: Text('تعديل')),
                          PopupMenuItem(value: 'toggle', child: Text(item['available'] == true ? 'إيقاف التوفر' : 'تفعيل التوفر')),
                          const PopupMenuItem(value: 'delete', child: Text('حذف')),
                        ],
                      ),
                      onTap: () => _openEditor(item),
                    ),
                  );
                },
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
    _variants = TextEditingController(
      text: variants.map((v) => '${v['label']}:${v['price']}').join('\n'),
    );
    _available = item['available'] != false;
  }

  @override
  void dispose() {
    _name.dispose(); _description.dispose(); _category.dispose(); _price.dispose(); _variants.dispose();
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
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.item == null ? 'إضافة منتج' : 'تعديل المنتج', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 18),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم المنتج')),
            const SizedBox(height: 10),
            TextField(controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'السعر (₪)')),
            const SizedBox(height: 10),
            TextField(controller: _category, decoration: const InputDecoration(labelText: 'القسم')),
            const SizedBox(height: 10),
            TextField(
              controller: _variants,
              maxLines: 4,
              textDirection: TextDirection.rtl,
              decoration: const InputDecoration(
                labelText: 'أحجام أو أوزان إضافية',
                hintText: 'صغير:10\nوسط:15\n1 كغ:20',
                helperText: 'اكتب كل خيار وسعره في سطر منفصل',
              ),
            ),
            const SizedBox(height: 10),
            TextField(controller: _description, maxLines: 2, decoration: const InputDecoration(labelText: 'الوصف')),
            SwitchListTile(value: _available, onChanged: (v) => setState(() => _available = v), title: const Text('متاح للطلب'), contentPadding: EdgeInsets.zero),
            OutlinedButton.icon(
              onPressed: () async {
                final image = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 82, maxWidth: 1400);
                if (image != null) setState(() => _image = image);
              },
              icon: const Icon(Icons.image_outlined),
              label: Text(_image == null ? 'اختيار صورة' : 'تم اختيار الصورة'),
            ),
            if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _save, child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'جارٍ الحفظ...' : 'حفظ'))),
          ]),
        ),
      );
}
