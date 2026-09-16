import 'package:flutter/material.dart';

import '../core/api_client.dart';

class StaffScreen extends StatefulWidget {
  final ApiClient api;
  const StaffScreen({super.key, required this.api});

  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  List<dynamic> _staff = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/merchant-staff');
      if (mounted) setState(() => _staff = data as List);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([Map<String, dynamic>? existing]) async {
    final name = TextEditingController(text: existing?['name']?.toString() ?? '');
    final phone = TextEditingController(text: existing?['phone']?.toString() ?? '');
    final password = TextEditingController();
    var role = existing?['role']?.toString() == 'manager' ? 'manager' : 'cashier';
    var active = existing?['active'] != false;
    final save = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, local) => Padding(
        padding: EdgeInsets.fromLTRB(20, 18, 20, MediaQuery.viewInsetsOf(ctx).bottom + 20),
        child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(existing == null ? 'إضافة موظف' : 'تعديل الموظف', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          TextField(controller: name, decoration: const InputDecoration(labelText: 'الاسم', prefixIcon: Icon(Icons.person_outline))),
          const SizedBox(height: 10),
          TextField(controller: phone, enabled: existing == null, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الجوال', prefixIcon: Icon(Icons.phone_outlined))),
          const SizedBox(height: 10),
          TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: existing == null ? 'كلمة السر' : 'كلمة سر جديدة (اختياري)', prefixIcon: const Icon(Icons.lock_outline))),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: role,
            decoration: const InputDecoration(labelText: 'الصلاحية'),
            items: const [
              DropdownMenuItem(value: 'manager', child: Text('Manager — مدير')),
              DropdownMenuItem(value: 'cashier', child: Text('Cashier — كاشير')),
            ],
            onChanged: (v) => local(() => role = v ?? 'cashier'),
          ),
          if (existing != null) SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: active, onChanged: (v) => local(() => active = v), title: const Text('الحساب مفعّل')),
          const SizedBox(height: 18),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ')),
        ])),
      )),
    );
    if (save != true) return;
    try {
      if (existing == null) {
        await widget.api.post('/merchant-staff', {
          'name': name.text.trim(),
          'phone': phone.text.trim(),
          'password': password.text,
          'role': role,
        });
      } else {
        await widget.api.patch('/merchant-staff/${existing['_id'] ?? existing['id']}', {
          'name': name.text.trim(),
          'role': role,
          'active': active,
          if (password.text.isNotEmpty) 'password': password.text,
        });
      }
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _remove(Map<String, dynamic> row) async {
    final yes = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('حذف الموظف؟'),
      content: Text('لن يتمكن ${row['name'] ?? 'الموظف'} من تسجيل الدخول بعد الحذف.'),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف'))],
    ));
    if (yes != true) return;
    try {
      await widget.api.delete('/merchant-staff/${row['_id'] ?? row['id']}');
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('الموظفون والصلاحيات')),
    floatingActionButton: FloatingActionButton.extended(onPressed: () => _edit(), icon: const Icon(Icons.person_add_alt_1), label: const Text('موظف جديد')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              children: [
                const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Owner: كامل الصلاحيات. Manager: إدارة التشغيل والطلبات. Cashier: متابعة الطلبات والمنتجات. حسابات الموظفين تسجل الدخول من نفس شاشة Yalla Partner.'))),
                const SizedBox(height: 10),
                if (_staff.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('لم تضف موظفين بعد.')))
                else
                  ..._staff.map((raw) {
                    final row = Map<String, dynamic>.from(raw as Map);
                    final active = row['active'] != false;
                    return Card(child: ListTile(
                      leading: CircleAvatar(child: Icon(row['role'] == 'manager' ? Icons.manage_accounts_outlined : Icons.point_of_sale_outlined)),
                      title: Text(row['name']?.toString() ?? ''),
                      subtitle: Text('${row['phone'] ?? ''} · ${row['role'] == 'manager' ? 'Manager' : 'Cashier'} · ${active ? 'مفعّل' : 'موقوف'}'),
                      onTap: () => _edit(row),
                      trailing: IconButton(onPressed: () => _remove(row), icon: const Icon(Icons.delete_outline)),
                    ));
                  }),
              ],
            ),
          ),
  );
}
