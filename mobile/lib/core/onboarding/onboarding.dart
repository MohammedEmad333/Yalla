// Card 75: شرح تعريفي للمميزات — يُعرض مرّة واحدة بعد أوّل دخول للحساب،
// وبعد كل تحديث رسميّ يُعرض شرح الميزات الجديدة فقط دون إعادة شرح القديمة.
//
// الفكرة: لكلّ ميزة رقم إصدار (version) تصاعديّ. نخزّن محلّيًا (لكلّ دور) أعلى
// إصدار شاهده المستخدم. عند فتح الشاشة الرئيسية نعرض الميزات ذات الإصدار الأعلى
// من المخزَّن فقط: أوّل دخول (المخزَّن = 0) يعرض كلّ المميزات (جولة كاملة)، وبعد
// إضافة ميزات بإصدار أعلى يعرض الجديد فقط. التخزين محلّي على الجهاز (بلا خادم).

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// ميزة واحدة في الشرح التعريفي.
class OnboardingFeature {
  final int version; // رقم الإصدار الذي أُضيفت فيه الميزة (تصاعديّ)
  final IconData icon;
  final String title;
  final String body;
  const OnboardingFeature({
    required this.version,
    required this.icon,
    required this.title,
    required this.body,
  });
}

/// مميزات تطبيق العميل (مرتّبة تصاعديًا حسب الإصدار).
/// عند إطلاق تحديث رسميّ جديد أضِف ميزة بإصدار أعلى فتُعرض للجميع مرّة واحدة.
const List<OnboardingFeature> userFeatures = [
  OnboardingFeature(
    version: 1,
    icon: Icons.add_location_alt,
    title: 'اطلب توصيلة بسهولة',
    body: 'حدّد نقطة الاستلام والتسليم وتفاصيل الشحنة، وسنصلك بأقرب كابتن متاح.',
  ),
  OnboardingFeature(
    version: 1,
    icon: Icons.receipt_long,
    title: 'تابع طلباتك لحظيًا',
    body: 'شاهد حالة طلبك وموقع الكابتن مباشرةً، وتواصل معه عبر الدردشة أو الهاتف.',
  ),
  OnboardingFeature(
    version: 1,
    icon: Icons.account_balance_wallet,
    title: 'محفظتك ورمز التسليم',
    body: 'اشحن رصيدك بسهولة، وأعطِ الكابتن رمز التسليم عند الاستلام لتأكيد وصول شحنتك.',
  ),
];

/// مميزات تطبيق الكابتن.
const List<OnboardingFeature> captainFeatures = [
  OnboardingFeature(
    version: 1,
    icon: Icons.delivery_dining,
    title: 'استقبل الطلبات المُسنَدة',
    body: 'ستصلك الطلبات القريبة فور إسنادها. اقبلها وابدأ التوصيل مباشرةً.',
  ),
  OnboardingFeature(
    version: 1,
    icon: Icons.price_check,
    title: 'السعر ورمز التسليم',
    body: 'أدخل السعر الحقيقي (لا يتجاوز السعر التقريبي)، واطلب رمز التسليم من العميل لتأكيد التسليم.',
  ),
  OnboardingFeature(
    version: 1,
    icon: Icons.account_balance_wallet,
    title: 'أرباحك ومحفظتك',
    body: 'تابع أرباحك الصافية واطلب سحب أموالك إلى محافظك الإلكترونية المحفوظة.',
  ),
];

/// تخزين محلّي لأعلى إصدار شرح شاهده المستخدم (لكلّ دور).
class OnboardingStorage {
  final _storage = const FlutterSecureStorage();
  String _key(String role) => 'yalla_onboarding_seen_$role';

  /// أعلى إصدار شُوهد (0 إن لم يُشاهد شيء بعد — أوّل دخول).
  Future<int> seenVersion(String role) async {
    try {
      final raw = await _storage.read(key: _key(role));
      return int.tryParse(raw ?? '') ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<void> setSeenVersion(String role, int version) async {
    try {
      await _storage.write(key: _key(role), value: '$version');
    } catch (_) {
      // فشل التخزين لا يجب أن يعطّل التطبيق — أسوأ حالة: يُعاد العرض لاحقًا
    }
  }
}

/// قائمة المميزات لدورٍ معيّن.
List<OnboardingFeature> featuresForRole(String role) =>
    role == 'captain' ? captainFeatures : userFeatures;

/// أعلى إصدار ميزة متوفّر لدورٍ معيّن.
int latestVersionForRole(String role) {
  final list = featuresForRole(role);
  return list.isEmpty ? 0 : list.map((f) => f.version).reduce((a, b) => a > b ? a : b);
}

/// يعرض الشرح التعريفي إن وُجدت ميزات لم تُشاهَد بعد، ثم يحفظ أنّها شوهدت.
/// آمن للاستدعاء عند فتح الشاشة الرئيسية؛ لا يفعل شيئًا إن لا جديد.
Future<void> maybeShowOnboarding(BuildContext context, String role) async {
  final storage = OnboardingStorage();
  final seen = await storage.seenVersion(role);
  final unseen = featuresForRole(role).where((f) => f.version > seen).toList();
  if (unseen.isEmpty) return;
  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => OnboardingDialog(features: unseen),
  );

  await storage.setSeenVersion(role, latestVersionForRole(role));
}

/// نافذة الشرح التعريفي — عرض شرائح المميزات مع زرّ تالٍ/إنهاء.
class OnboardingDialog extends StatefulWidget {
  final List<OnboardingFeature> features;
  const OnboardingDialog({super.key, required this.features});

  @override
  State<OnboardingDialog> createState() => _OnboardingDialogState();
}

class _OnboardingDialogState extends State<OnboardingDialog> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isLast => _page >= widget.features.length - 1;

  void _next() {
    if (_isLast) {
      Navigator.of(context).pop();
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 260,
                child: PageView.builder(
                  controller: _controller,
                  itemCount: widget.features.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) {
                    final f = widget.features[i];
                    return Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircleAvatar(
                          radius: 42,
                          backgroundColor: theme.colorScheme.primaryContainer,
                          child: Icon(f.icon, size: 42, color: theme.colorScheme.primary),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          f.title,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          f.body,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(color: Colors.grey[700]),
                        ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              // مؤشّرات الصفحات
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(widget.features.length, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: active ? 20 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: active ? theme.colorScheme.primary : Colors.grey[300],
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  if (!_isLast)
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('تخطّي'),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _next,
                    child: Text(_isLast ? 'ابدأ' : 'التالي'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
