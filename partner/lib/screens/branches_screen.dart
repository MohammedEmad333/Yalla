import 'package:flutter/material.dart';

import '../core/session.dart';

class BranchesScreen extends StatefulWidget {
  final PartnerSession session;
  const BranchesScreen({super.key, required this.session});

  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> {
  bool _loading = true;
  bool _busy = false;
  List<Map<String, dynamic>> _branches = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.session.api.get('/merchant/branches');
      if (!mounted) return;
      setState(() => _branches = (data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _select(Map<String, dynamic> branch) async {
    if (_busy || branch['selected'] == true) return;
    setState(() => _busy = true);
    try {
      await widget.session.switchBranch(branch['_id'].toString());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تم التبديل إلى ${branch['name']}')));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addBranch() async {
    final name = TextEditingController();
    final city = TextEditingController();
    final neighborhood = TextEditingController();
    final street = TextEditingController();
    final phone = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إضافة فرع'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم الفرع *')),
            TextField(controller: city, decoration: const InputDecoration(labelText: 'المدينة')),
            TextField(controller: neighborhood, decoration: const InputDecoration(labelText: 'الحي')),
            TextField(controller: street, decoration: const InputDecoration(labelText: 'الشارع')),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'هاتف الفرع')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إنشاء')),
        ],
      ),
    );
    if (ok != true || name.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await widget.session.api.post('/merchant/branches', {
        'name': name.text.trim(),
        'city': city.text.trim(),
        'neighborhood': neighborhood.text.trim(),
        'street': street.text.trim(),
        'phone': phone.text.trim(),
      });
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إنشاء الفرع')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      name.dispose(); city.dispose(); neighborhood.dispose(); street.dispose(); phone.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الفروع')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _addBranch,
        icon: const Icon(Icons.add_business_rounded),
        label: const Text('إضافة فرع'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                itemCount: _branches.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final branch = _branches[index];
                  final selected = branch['selected'] == true;
                  final address = [branch['city'], branch['neighborhood'], branch['street']]
                      .where((e) => e != null && e.toString().trim().isNotEmpty)
                      .join(' - ');
                  return Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        child: Icon(selected ? Icons.check_rounded : Icons.storefront_rounded),
                      ),
                      title: Text('${branch['name'] ?? 'فرع'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(address.isEmpty ? (branch['active'] == false ? 'معطّل' : 'فرع نشط') : address),
                      trailing: selected
                          ? const Chip(label: Text('الحالي'))
                          : FilledButton.tonal(onPressed: _busy ? null : () => _select(branch), child: const Text('تبديل')),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
