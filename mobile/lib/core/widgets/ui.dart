// مكوّنات واجهة مشتركة لتطبيق يلا — تُبقي الشاشات نظيفة ومظهرها موحّدًا.
// كلّها تقرأ ألوانها من YallaColors فلا يُكتب لون خامّ داخل الشاشات.

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// بطاقة بيضاء بحدّ رفيع — الحاوية الأساسية للمحتوى.
class YallaCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? background;
  final Color? borderColor;

  const YallaCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.background,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(padding: padding, child: child);
    return Material(
      color: background ?? YallaColors.card,
      borderRadius: BorderRadius.circular(YallaRadii.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(YallaRadii.lg),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(YallaRadii.lg),
            border: Border.all(color: borderColor ?? YallaColors.outline),
          ),
          child: content,
        ),
      ),
    );
  }
}

/// عنوان قسم داخل الشاشة (أيقونة + نصّ + إجراء اختياري).
class SectionTitle extends StatelessWidget {
  final String title;
  final IconData? icon;
  final Widget? trailing;

  const SectionTitle(this.title, {super.key, this.icon, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: YallaColors.muted),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: YallaColors.onSurface,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// نغمة الشارة/الحالة.
enum PillTone { neutral, brand, info, success, warning, danger }

/// شارة حالة صغيرة (بانتظار/مسلّم/ملغى...).
class StatusPill extends StatelessWidget {
  final String text;
  final PillTone tone;
  final bool dot;

  const StatusPill(this.text, {super.key, this.tone = PillTone.neutral, this.dot = true});

  // خلفيّة/لون كل نغمة — دوال لأنّ ألوان الوضعين (فاتح/ليلي) تُشتقّ وقت البناء
  static Map<PillTone, Color> get _bg => {
        PillTone.neutral: YallaColors.surfaceContainer,
        PillTone.brand: YallaColors.primaryContainer,
        PillTone.info: YallaColors.secondaryContainer,
        PillTone.success: YallaColors.successContainer,
        PillTone.warning: YallaColors.warningContainer,
        PillTone.danger: YallaColors.errorContainer,
      };
  static Map<PillTone, Color> get _fg => {
        PillTone.neutral: YallaColors.onSurfaceVariant,
        PillTone.brand: YallaColors.primaryDeep,
        PillTone.info: YallaColors.secondaryDeep,
        PillTone.success: YallaColors.success,
        PillTone.warning: YallaColors.warning,
        PillTone.danger: YallaColors.error,
      };

  @override
  Widget build(BuildContext context) {
    final fg = _fg[tone]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _bg[tone],
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            text,
            style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// سطر «تسمية: قيمة» داخل البطاقات.
class InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;

  const InfoRow(this.label, this.value, {super.key, this.icon});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: YallaColors.muted),
            const SizedBox(width: 8),
          ],
          SizedBox(
            width: 96,
            child: Text(label, style: TextStyle(color: YallaColors.muted, fontSize: 13)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(fontWeight: FontWeight.w600, color: YallaColors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}

/// حالة فارغة موحّدة (أيقونة + عنوان + شرح + إجراء).
class EmptyStateView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  const EmptyStateView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: YallaColors.surfaceContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 30, color: YallaColors.muted),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: YallaColors.onSurfaceVariant,
              ),
            ),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: TextStyle(color: YallaColors.muted, fontSize: 13),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// مؤشّر تحميل بعرض كامل مع نصّ.
class LoadingView extends StatelessWidget {
  final String label;
  const LoadingView({super.key, this.label = 'جارٍ التحميل...'});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(height: 12),
          Text(label, style: TextStyle(color: YallaColors.muted)),
        ],
      ),
    );
  }
}

/// بطاقة رقم بارز (رصيد/عدّاد) مع أيقونة ملوّنة.
class StatTile extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  /// لون الأيقونة — يعود إلى برتقالي العلامة إن لم يُحدَّد.
  final Color? color;

  const StatTile({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final color = this.color ?? YallaColors.primary;
    return YallaCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(YallaRadii.md),
            ),
            child: Icon(icon, color: color, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    color: YallaColors.onSurface,
                  ),
                ),
                Text(label, style: TextStyle(fontSize: 12, color: YallaColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
