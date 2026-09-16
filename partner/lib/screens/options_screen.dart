import 'package:flutter/material.dart';

import '../core/api_client.dart';

class OptionsScreen extends StatefulWidget {
  final ApiClient api;
  const OptionsScreen({super.key, required this.api});

  @override
  State<OptionsScreen> createState() => _OptionsScreenState();
}

class _OptionsScreenState extends State<OptionsScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await widget.api.get('/merchant/menu');
      if (mounted) setState(() => _items = data as List);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit(Map<String, dynamic> item) async {
    final groups = ((item['optionGroups'] as List?) ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => _OptionGroupsEditor(api: widget.api, item: item, groups: groups),
    ));
    if (changed == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF071D3A),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('الخيارات والإضافات', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                  SizedBox(height: 6),
                  Text('أنشئ خيارات مثل الحجم، نوع الخبز، الصوصات والإضافات المدفوعة.', style: TextStyle(color: Color(0xFFCBD5E1))),
                ],
              ),
            ),
            if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error)),
            const SizedBox(height: 14),
            if (_items.isEmpty)
              const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('أضف منتجات أولًا من تبويب المنتجات')))
            else
              ..._items.map((raw) {
                final item = Map<String, dynamic>.from(raw as Map);
                final groups = (item['optionGroups'] as List?) ?? const [];
                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.tune_rounded)),
                    title: Text((item['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(groups.isEmpty ? 'لا توجد إضافات' : '${groups.length} مجموعات خيارات'),
                    trailing: const Icon(Icons.chevron_left),
                    onTap: () => _edit(item),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class _OptionGroupsEditor extends StatefulWidget {
  final ApiClient api;
  final Map<String, dynamic> item;
  final List<Map<String, dynamic>> groups;
  const _OptionGroupsEditor({required this.api, required this.item, required this.groups});

  @override
  State<_OptionGroupsEditor> createState() => _OptionGroupsEditorState();
}

class _OptionGroupsEditorState extends State<_OptionGroupsEditor> {
  late final List<Map<String, dynamic>> _groups = widget.groups.map((e) => Map<String, dynamic>.from(e)).toList();
  bool _saving = false;

  Future<void> _addGroup() async {
    final group = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _GroupDialog(),
    );
    if (group != null) setState(() => _groups.add(group));
  }

  Future<void> _editGroup(int index) async {
    final group = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _GroupDialog(existing: _groups[index]),
    );
    if (group != null) setState(() => _groups[index] = group);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.api.patch('/merchant/menu/${widget.item['_id']}', {'optionGroups': _groups});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('خيارات ${widget.item['name']}')),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _addGroup,
          icon: const Icon(Icons.add),
          label: const Text('مجموعة جديدة'),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
          children: [
            if (_groups.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('لا توجد مجموعات خيارات لهذا المنتج')))),
            ...List.generate(_groups.length, (i) {
              final g = _groups[i];
              final options = (g['options'] as List?) ?? const [];
              return Card(
                child: ListTile(
                  title: Text((g['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('${options.length} خيارات · ${g['required'] == true ? 'إجباري' : 'اختياري'} · ${g['multiple'] == true ? 'متعدد' : 'اختيار واحد'}'),
                  onTap: () => _editGroup(i),
                  trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => setState(() => _groups.removeAt(i))),
                ),
              );
            }),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_outlined),
              label: const Text('حفظ كل الخيارات'),
            ),
          ],
        ),
      );
}

class _GroupDialog extends StatefulWidget {
  final Map<String, dynamic>? existing;
  const _GroupDialog({this.existing});
  @override
  State<_GroupDialog> createState() => _GroupDialogState();
}

class _GroupDialogState extends State<_GroupDialog> {
  late final TextEditingController _name = TextEditingController(text: widget.existing?['name']?.toString() ?? '');
  late final TextEditingController _options = TextEditingController(
    text: ((widget.existing?['options'] as List?) ?? const [])
        .map((o) => '${o['name']}:${o['price'] ?? 0}')
        .join('\n'),
  );
  late bool _required = widget.existing?['required'] == true;
  late bool _multiple = widget.existing?['multiple'] == true;
  late int _max = ((widget.existing?['maxSelect'] as num?) ?? 1).toInt().clamp(1, 20);

  @override
  void dispose() {
    _name.dispose();
    _options.dispose();
    super.dispose();
  }

  void _done() {
    final name = _name.text.trim();
    final opts = _options.text.split('\n').map((line) {
      final parts = line.split(':');
      final n = parts.first.trim();
      final p = parts.length > 1 ? double.tryParse(parts.last.trim()) ?? 0 : 0;
      return {'name': n, 'price': p, 'available': true};
    }).where((o) => (o['name'] as String).isNotEmpty).toList();
    if (name.isEmpty || opts.isEmpty) return;
    Navigator.pop(context, {
      'name': name,
      'required': _required,
      'multiple': _multiple,
      'minSelect': _required ? 1 : 0,
      'maxSelect': _multiple ? _max : 1,
      'options': opts,
    });
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.existing == null ? 'مجموعة خيارات جديدة' : 'تعديل المجموعة'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم المجموعة', hintText: 'مثال: الإضافات')),
            const SizedBox(height: 10),
            TextField(
              controller: _options,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'الخيارات وأسعارها',
                hintText: 'جبنة:2\nصوص إضافي:1\nبدون بصل:0',
                helperText: 'كل خيار في سطر: الاسم:السعر',
              ),
            ),
            SwitchListTile(value: _required, onChanged: (v) => setState(() => _required = v), title: const Text('اختيار إجباري')),
            SwitchListTile(value: _multiple, onChanged: (v) => setState(() { _multiple = v; if (!v) _max = 1; }), title: const Text('السماح بأكثر من اختيار')),
            if (_multiple)
              Row(children: [
                const Expanded(child: Text('أقصى عدد اختيارات')),
                DropdownButton<int>(
                  value: _max,
                  items: List.generate(10, (i) => i + 1).map((v) => DropdownMenuItem(value: v, child: Text('$v'))).toList(),
                  onChanged: (v) => setState(() => _max = v ?? 1),
                ),
              ]),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(onPressed: _done, child: const Text('تم')),
        ],
      );
}
