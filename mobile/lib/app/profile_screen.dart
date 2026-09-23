// شاشة الحساب "حسابي" (Card 17) — تعرض بيانات المستخدم/الكابتن مع صورة شخصية،
// وتتيح تعديل البيانات ورفع صورة، إضافةً لتسجيل الخروج.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config/app_config.dart';
import '../core/config/company.dart';
import '../core/network/api_client.dart';
import '../core/realtime/socket_service.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/support/support_screen.dart';
import '../features/user/user_hub_screen.dart';
import '../core/util/vehicles.dart';
import '../core/widgets/ui.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/theme_controller.dart';
import '../main.dart' show themeController;

class ProfileScreen extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;
  final SocketService? socket;
  const ProfileScreen({super.key, required this.api, this.socket, required this.onLogout});

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

  Future<void> _openExternal(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      _snack('تعذّر فتح الرابط');
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
      appBar: AppBar(toolbarHeight: 0),
      body: _loading
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
                children: [
                  _profileHeader(fullName),
                  const SizedBox(height: 14),

                  _sectionTitle('بيانات الحساب'),
                  _sectionCard([
                    _infoTile(Icons.phone_outlined, 'رقم الجوال', _me['phone']),
                    if (!_isCaptain) ...[
                      _infoTile(Icons.email_outlined, 'البريد الإلكتروني', _me['email']),
                      _infoTile(Icons.location_city_outlined, 'المدينة', _me['city']),
                    ] else ...[
                      _infoTile(Icons.two_wheeler_outlined, 'نوع المركبة', vehicleLabel(_me['vehicleType'])),
                      _infoTile(Icons.confirmation_number_outlined, 'رقم اللوحة', _me['vehiclePlate']),
                      _infoTile(Icons.star_outline_rounded, 'التقييم', '${_me['rating'] ?? '—'}'),
                    ],
                  ]),

                  if (!_isCaptain && widget.socket != null) ...[
                    const SizedBox(height: 18),
                    _sectionTitle('حسابي وخدماتي'),
                    _sectionCard([
                      _actionTile(
                        icon: Icons.bookmarks_outlined,
                        title: 'محفوظاتي',
                        subtitle: 'العناوين، المفضلة، العروض والنقاط',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => UserHubScreen(api: widget.api),
                        )),
                      ),
                      _actionTile(
                        icon: Icons.notifications_outlined,
                        title: 'الإشعارات',
                        subtitle: 'تابع تحديثات الطلبات والحساب',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => NotificationsScreen(api: widget.api, socket: widget.socket!),
                        )),
                      ),
                      _actionTile(
                        icon: Icons.support_agent_outlined,
                        title: 'الدعم',
                        subtitle: 'تواصل معنا عند وجود مشكلة',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => SupportScreen(api: widget.api, socket: widget.socket!),
                        )),
                      ),
                    ]),
                  ],

                  const SizedBox(height: 18),
                  _sectionTitle('الإعدادات والأمان'),
                  _sectionCard([
                    ValueListenableBuilder<ThemeMode>(
                      valueListenable: themeController.mode,
                      builder: (context, mode, _) => ListTile(
                        leading: _leadingIcon(themeModeIcon(mode)),
                        title: const Text('المظهر', style: TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(themeModeLabel(mode)),
                        trailing: SegmentedButton<ThemeMode>(
                          showSelectedIcon: false,
                          style: SegmentedButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                          ),
                          segments: const [
                            ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined, size: 17)),
                            ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined, size: 17)),
                            ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined, size: 17)),
                          ],
                          selected: {mode},
                          onSelectionChanged: (s) => themeController.set(s.first),
                        ),
                      ),
                    ),
                    _actionTile(
                      icon: Icons.lock_outline_rounded,
                      title: 'تغيير كلمة السر',
                      subtitle: 'حدّث كلمة السر الخاصة بحسابك',
                      onTap: _saving ? null : _changePassword,
                    ),
                  ]),

                  const SizedBox(height: 18),
                  _sectionTitle('Yalla والخصوصية'),
                  _sectionCard([
                    _actionTile(
                      icon: Icons.language_rounded,
                      title: 'موقع Yalla الرسمي',
                      subtitle: 'yalladelivery.org',
                      external: true,
                      onTap: () => _openExternal('https://yalladelivery.org'),
                    ),
                    _actionTile(
                      icon: Icons.privacy_tip_outlined,
                      title: 'سياسة الخصوصية',
                      subtitle: 'كيف نتعامل مع بياناتك ونحميها',
                      external: true,
                      onTap: () => _openExternal('https://yalladelivery.org/privacy.html'),
                    ),
                    _actionTile(
                      icon: Icons.manage_accounts_outlined,
                      title: 'حذف الحساب والبيانات',
                      subtitle: 'معلومات وخيارات حذف الحساب',
                      external: true,
                      onTap: () => _openExternal('https://yalladelivery.org/delete-account.html'),
                    ),
                  ]),

                  const SizedBox(height: 18),
                  _sectionTitle('التواصل'),
                  _sectionCard([
                    _actionTile(
                      icon: Icons.chat_outlined,
                      iconColor: const Color(0xFF25D366),
                      title: 'تواصل عبر واتس اب',
                      subtitle: '+${Company.whatsappNumber}',
                      external: true,
                      onTap: _openWhatsapp,
                    ),
                  ]),

                  const SizedBox(height: 22),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                        foregroundColor: Colors.red,
                      ),
                      onPressed: widget.onLogout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('تسجيل الخروج'),
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: Colors.red),
                    onPressed: _saving ? null : _deleteAccount,
                    icon: const Icon(Icons.delete_forever_outlined),
                    label: const Text('حذف الحساب نهائيًا'),
                  ),
                ],
              )            ),
    );
  }

  Widget _profileHeader(String fullName) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .75),
          ),
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                CircleAvatar(
                  radius: 38,
                  backgroundImage: _avatarUrl != null ? CachedNetworkImageProvider(_avatarUrl!) : null,
                  child: _avatarUrl == null ? const Icon(Icons.person_rounded, size: 38) : null,
                ),
                Positioned(
                  bottom: -3,
                  right: -3,
                  child: Semantics(
                    button: true,
                    label: 'تغيير الصورة',
                    child: Material(
                      color: YallaColors.primary,
                      shape: const CircleBorder(),
                      elevation: 1,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _saving ? null : _changeAvatar,
                        child: Container(
                          width: 30,
                          height: 30,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Theme.of(context).colorScheme.surface,
                              width: 2,
                            ),
                          ),
                          child: _saving
                              ? const SizedBox.square(
                                  dimension: 12,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(
                                  Icons.camera_alt_outlined,
                                  size: 15,
                                  color: Colors.white,
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fullName.isEmpty ? 'حساب Yalla' : fullName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _isCaptain ? 'حساب كابتن' : 'حساب مستخدم',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton.filledTonal(
              tooltip: 'تعديل البيانات',
              onPressed: _saving ? null : _editProfile,
              icon: const Icon(Icons.edit_outlined),
            ),
          ],
        ),
      );

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsetsDirectional.only(start: 4, bottom: 8),
        child: Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
      );

  Widget _sectionCard(List<Widget> children) => Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              children[i],
              if (i != children.length - 1)
                Divider(
                  height: 1,
                  indent: 64,
                  color: Theme.of(context).dividerColor.withValues(alpha: .45),
                ),
            ],
          ],
        ),
      );

  Widget _leadingIcon(IconData icon, {Color? color}) => Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: (color ?? Theme.of(context).colorScheme.primary).withValues(alpha: .10),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(
          icon,
          size: 20,
          color: color ?? Theme.of(context).colorScheme.primary,
        ),
      );

  Widget _actionTile({
    required IconData icon,
    required String title,
    String? subtitle,
    Color? iconColor,
    bool external = false,
    VoidCallback? onTap,
  }) =>
      ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 3),
        leading: _leadingIcon(icon, color: iconColor),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: subtitle == null ? null : Text(subtitle),
        trailing: Icon(external ? Icons.open_in_new_rounded : Icons.chevron_left_rounded, size: 19),
        onTap: onTap,
      );

  Widget _infoTile(IconData icon, String label, dynamic value) {
    final v = (value ?? '').toString().trim();
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: _leadingIcon(icon),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
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
