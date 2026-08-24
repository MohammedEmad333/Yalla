// شاشة الحساب "حسابي" (Card 17) — تعرض بيانات المستخدم/الكابتن مع صورة شخصية،
// وتتيح تعديل البيانات ورفع صورة، إضافةً لتسجيل الخروج.

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config/app_config.dart';
import '../core/config/company.dart';
import '../core/network/api_client.dart';

class ProfileScreen extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;
  const ProfileScreen({super.key, required this.api, required this.onLogout});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _picker = ImagePicker();

  String _role = 'user';
  Map<String, dynamic> _me = {};
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/auth/me');
      final role = data['role'] as String? ?? 'user';
      final profile = role == 'captain' ? data['captain'] : data['user'];
      if (!mounted) return;
      setState(() {
        _role = role;
        _me = Map<String, dynamic>.from(profile as Map);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(e.message);
    }
  }

  bool get _isCaptain => _role == 'captain';

  // رابط الصورة الشخصية الكامل (النسبي مُخزَّن على الخادم تحت /uploads)
  String? get _avatarUrl {
    final url = (_me['avatarUrl'] ?? '').toString();
    if (url.isEmpty) return null;
    return url.startsWith('http') ? url : '${AppConfig.origin}$url';
  }

  // اختيار صورة ورفعها إلى /auth/me/avatar
  Future<void> _changeAvatar() async {
    final img = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (img == null) return;
    setState(() => _saving = true);
    try {
      final res = await widget.api.postMultipart(
        '/auth/me/avatar',
        fields: const {},
        filePath: img.path,
        fileField: 'avatar', // يطابق uploadAvatar.single('avatar') في الخادم
      );
      if (!mounted) return;
      setState(() => _me['avatarUrl'] = (res as Map)['avatarUrl']);
      _snack('تم تحديث الصورة الشخصية');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // نموذج تعديل البيانات
  Future<void> _editProfile() async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditProfileForm(isCaptain: _isCaptain, me: _me),
    );
    if (result == null) return;
    setState(() => _saving = true);
    try {
      final data = await widget.api.patch('/auth/me', result);
      final profile = _isCaptain ? data['captain'] : data['user'];
      if (!mounted) return;
      setState(() => _me = Map<String, dynamic>.from(profile as Map));
      _snack('تم حفظ البيانات');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // تغيير كلمة سر الحساب (Card 72): يفتح نموذجًا (كلمة حالية + جديدة + تأكيد)
  // ثم يرسلها إلى الخادم الذي يتحقّق من الحالية ويعيّن الجديدة.
  Future<void> _changePassword() async {
    final body = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ChangePasswordForm(),
    );
    if (body == null) return;
    setState(() => _saving = true);
    try {
      await widget.api.patch('/auth/me/password', body);
      _snack('تم تغيير كلمة السر بنجاح');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // حذف الحساب نهائيًا (متطلّب Google Play) — بتأكيد صريح من المستخدم.
  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف الحساب'),
        content: const Text(
          'سيؤدّي هذا إلى حذف حسابك وبياناتك المرتبطة به نهائيًا (المحفظة، '
          'الإشعارات، ورسائل الدعم). لا يمكن التراجع عن هذا الإجراء.\n\n'
          'لا يمكن الحذف أثناء وجود طلب نشط قيد التنفيذ.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('حذف نهائيًا'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _saving = true);
    try {
      await widget.api.delete('/auth/me');
      _snack('تم حذف حسابك');
      widget.onLogout(); // يمسح الجلسة ويعيد لصفحة الدخول
    } on ApiException catch (e) {
      // مثال: 409 عند وجود طلب نشط
      if (mounted) setState(() => _saving = false);
      _snack(e.message);
    }
  }

  // فتح واتس اب الشركة برابط wa.me (Card 43)
  Future<void> _openWhatsapp() async {
    final uri = Company.whatsappUri();
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      _snack('تعذّر فتح واتس اب');
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    final fullName =
        [_me['name'], _me['lastName']].where((p) => p != null && '$p'.trim().isNotEmpty).join(' ');

    return Scaffold(
      appBar: AppBar(
        title: const Text('حسابي'),
        actions: [
          IconButton(
            tooltip: 'تعديل البيانات',
            icon: const Icon(Icons.edit),
            onPressed: _loading ? null : _editProfile,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Center(
                    child: Stack(
                      children: [
                        CircleAvatar(
                          radius: 48,
                          backgroundImage: _avatarUrl != null ? NetworkImage(_avatarUrl!) : null,
                          child: _avatarUrl == null ? const Icon(Icons.person, size: 48) : null,
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: CircleAvatar(
                            radius: 16,
                            child: IconButton(
                              iconSize: 16,
                              padding: EdgeInsets.zero,
                              icon: _saving
                                  ? const SizedBox(
                                      width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.camera_alt),
                              onPressed: _saving ? null : _changeAvatar,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Text(fullName.isEmpty ? '—' : fullName,
                        style: Theme.of(context).textTheme.titleLarge),
                  ),
                  const SizedBox(height: 24),

                  _infoTile(Icons.phone, 'رقم الجوال', _me['phone']),
                  if (!_isCaptain) ...[
                    _infoTile(Icons.email, 'البريد الإلكتروني', _me['email']),
                    _infoTile(Icons.location_city, 'المدينة', _me['city']),
                  ] else ...[
                    _infoTile(Icons.two_wheeler, 'نوع المركبة',
                        _me['vehicleType'] == 'bicycle' ? 'دراجة هوائية' : 'موتوسيكل'),
                    _infoTile(Icons.confirmation_number, 'رقم اللوحة', _me['vehiclePlate']),
                    _infoTile(Icons.star, 'التقييم', '${_me['rating'] ?? '—'}'),
                  ],

                  const Divider(height: 32),

                  // تغيير كلمة سر الحساب (Card 72)
                  ListTile(
                    leading: const Icon(Icons.lock_outline),
                    title: const Text('تغيير كلمة السر'),
                    trailing: const Icon(Icons.chevron_left, size: 18),
                    onTap: _saving ? null : _changePassword,
                  ),

                  // تواصل عبر واتس اب الشركة (Card 43)
                  ListTile(
                    leading: const Icon(Icons.chat, color: Color(0xFF25D366)),
                    title: const Text('تواصل عبر واتس اب'),
                    subtitle: Text('+${Company.whatsappNumber}'),
                    trailing: const Icon(Icons.open_in_new, size: 18),
                    onTap: _openWhatsapp,
                  ),

                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                    onPressed: widget.onLogout,
                    icon: const Icon(Icons.logout),
                    label: const Text('تسجيل الخروج'),
                  ),

                  const SizedBox(height: 8),
                  // حذف الحساب نهائيًا (متطلّب Google Play)
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: Colors.red),
                    onPressed: _saving ? null : _deleteAccount,
                    icon: const Icon(Icons.delete_forever),
                    label: const Text('حذف الحساب'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _infoTile(IconData icon, String label, dynamic value) {
    final v = (value ?? '').toString().trim();
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      subtitle: Text(v.isEmpty ? '—' : v),
      dense: true,
    );
  }
}

// نموذج تعديل بيانات الحساب (يختلف حسب الدور)
class _EditProfileForm extends StatefulWidget {
  final bool isCaptain;
  final Map<String, dynamic> me;
  const _EditProfileForm({required this.isCaptain, required this.me});

  @override
  State<_EditProfileForm> createState() => _EditProfileFormState();
}

class _EditProfileFormState extends State<_EditProfileForm> {
  late final _name = TextEditingController(text: '${widget.me['name'] ?? ''}');
  late final _lastName = TextEditingController(text: '${widget.me['lastName'] ?? ''}');
  late final _email = TextEditingController(text: '${widget.me['email'] ?? ''}');
  late final _city = TextEditingController(text: '${widget.me['city'] ?? ''}');
  late final _plate = TextEditingController(text: '${widget.me['vehiclePlate'] ?? ''}');

  void _submit() {
    // نرسل الحقول المسموح بها حسب الدور فقط
    final Map<String, String> body = {'name': _name.text.trim()};
    if (widget.isCaptain) {
      body['vehiclePlate'] = _plate.text.trim();
    } else {
      body['lastName'] = _lastName.text.trim();
      body['email'] = _email.text.trim();
      body['city'] = _city.text.trim();
    }
    Navigator.pop(context, body);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('تعديل البيانات', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'الاسم الأول', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          if (widget.isCaptain)
            TextField(
              controller: _plate,
              decoration: const InputDecoration(labelText: 'رقم اللوحة', border: OutlineInputBorder()),
            )
          else ...[
            TextField(
              controller: _lastName,
              decoration: const InputDecoration(labelText: 'اسم العائلة', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'البريد الإلكتروني', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _city,
              decoration: const InputDecoration(labelText: 'المدينة', border: OutlineInputBorder()),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _submit, child: const Text('حفظ')),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _lastName.dispose();
    _email.dispose();
    _city.dispose();
    _plate.dispose();
    super.dispose();
  }
}

// نموذج تغيير كلمة السر (Card 72): كلمة حالية + جديدة + تأكيد الجديدة.
// يتحقّق محليًا من التطابق والطول قبل الإرسال، والخادم يتحقّق من كلمة السر الحالية.
class _ChangePasswordForm extends StatefulWidget {
  const _ChangePasswordForm();

  @override
  State<_ChangePasswordForm> createState() => _ChangePasswordFormState();
}

class _ChangePasswordFormState extends State<_ChangePasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNext = true;
  String? _error;

  void _submit() {
    final current = _current.text;
    final next = _next.text;
    final confirm = _confirm.text;
    if (current.isEmpty) {
      setState(() => _error = 'أدخل كلمة السر الحالية');
      return;
    }
    if (next.length < 6) {
      setState(() => _error = 'كلمة السر الجديدة يجب أن تكون ٦ أحرف على الأقلّ');
      return;
    }
    if (next != confirm) {
      setState(() => _error = 'كلمة السر الجديدة وتأكيدها غير متطابقين');
      return;
    }
    if (next == current) {
      setState(() => _error = 'اختر كلمة سر مختلفة عن الحالية');
      return;
    }
    Navigator.pop(context, {'currentPassword': current, 'newPassword': next});
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('تغيير كلمة السر', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(
            controller: _current,
            obscureText: _obscureCurrent,
            decoration: InputDecoration(
              labelText: 'كلمة السر الحالية',
              prefixIcon: const Icon(Icons.lock_outline),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscureCurrent ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscureCurrent = !_obscureCurrent),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _next,
            obscureText: _obscureNext,
            decoration: InputDecoration(
              labelText: 'كلمة السر الجديدة',
              prefixIcon: const Icon(Icons.lock),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscureNext ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscureNext = !_obscureNext),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirm,
            obscureText: _obscureNext,
            decoration: const InputDecoration(
              labelText: 'تأكيد كلمة السر الجديدة',
              prefixIcon: Icon(Icons.lock),
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submit,
              icon: const Icon(Icons.check),
              label: const Text('تأكيد التغيير'),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }
}
