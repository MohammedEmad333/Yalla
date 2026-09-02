#!/usr/bin/env python3
"""تفعيل core library desugaring في ملفّ Gradle للتطبيق المولَّد.

حزمة flutter_local_notifications (المستخدمة لإشعارات شاشة القفل و heads-up) تتطلّب
تفعيل «core library desugaring». وبما أنّ سقالة android/ تُولَّد في CI عبر
`flutter create` فلا تحوي هذا الإعداد، يفشل بناء الـ APK برسالة:
  "Dependency ':flutter_local_notifications' requires core library desugaring…"

هذا السكربت يضيف الإعداد بشكل متسامح ويدعم صيغتَي Gradle:
  • Kotlin DSL  (android/app/build.gradle.kts) — تولّده إصدارات Flutter الحديثة.
  • Groovy      (android/app/build.gradle)     — إصدارات Flutter الأقدم.

الخطوات:
  1) تفعيل isCoreLibraryDesugaringEnabled داخل compileOptions.
  2) إضافة تبعيّة coreLibraryDesugaring لمكتبة desugar_jdk_libs.

يُشغَّل من مجلّد mobile/ بعد `flutter create`:  python3 tool/enable_desugaring.py
آمن للتكرار (idempotent): لا يُكرّر الإعداد إن كان موجودًا.
"""
import re
import sys
from pathlib import Path

GRADLE_GROOVY = Path("android/app/build.gradle")
GRADLE_KTS = Path("android/app/build.gradle.kts")

# إصدار مكتبة desugaring — متوافق مع AGP 8.x الذي تستخدمه Flutter stable
DESUGAR_LIB = "com.android.tools:desugar_jdk_libs:2.1.4"
MARKER = "isCoreLibraryDesugaringEnabled"  # Kotlin DSL
MARKER_GROOVY = "coreLibraryDesugaringEnabled"


def fail(msg: str) -> None:
    print(f"enable_desugaring: خطأ — {msg}", file=sys.stderr)
    sys.exit(1)


def enable_in_compile_options(text: str, line: str) -> str:
    """يضيف سطر تفعيل desugaring داخل كتلة compileOptions { … }."""
    m = re.search(r"compileOptions\s*\{", text)
    if not m:
        fail("لم يُعثر على كتلة `compileOptions {`.")
    return text[: m.end()] + "\n        " + line + text[m.end() :]


def add_dependency_kts(text: str) -> str:
    """يضيف coreLibraryDesugaring إلى كتلة dependencies (Kotlin DSL) أو ينشئها."""
    dep = f'    coreLibraryDesugaring("{DESUGAR_LIB}")'
    m = re.search(r"^dependencies\s*\{", text, flags=re.MULTILINE)
    if m:
        return text[: m.end()] + "\n" + dep + text[m.end() :]
    return text.rstrip() + f"\n\ndependencies {{\n{dep}\n}}\n"


def add_dependency_groovy(text: str) -> str:
    dep = f"    coreLibraryDesugaring '{DESUGAR_LIB}'"
    m = re.search(r"^dependencies\s*\{", text, flags=re.MULTILINE)
    if m:
        return text[: m.end()] + "\n" + dep + text[m.end() :]
    return text.rstrip() + f"\n\ndependencies {{\n{dep}\n}}\n"


def patch_kts() -> None:
    text = GRADLE_KTS.read_text(encoding="utf-8")
    if MARKER in text:
        print("enable_desugaring: مفعّل مسبقًا (Kotlin DSL) — تخطّي.")
        return
    text = enable_in_compile_options(text, "isCoreLibraryDesugaringEnabled = true")
    text = add_dependency_kts(text)
    GRADLE_KTS.write_text(text, encoding="utf-8")
    print("enable_desugaring: تمّ تفعيل desugaring (Kotlin DSL).")


def patch_groovy() -> None:
    text = GRADLE_GROOVY.read_text(encoding="utf-8")
    if MARKER_GROOVY in text:
        print("enable_desugaring: مفعّل مسبقًا (Groovy) — تخطّي.")
        return
    text = enable_in_compile_options(text, "coreLibraryDesugaringEnabled true")
    text = add_dependency_groovy(text)
    GRADLE_GROOVY.write_text(text, encoding="utf-8")
    print("enable_desugaring: تمّ تفعيل desugaring (Groovy).")


def main() -> None:
    if GRADLE_KTS.exists():
        patch_kts()
    elif GRADLE_GROOVY.exists():
        patch_groovy()
    else:
        fail("لم يُعثر على build.gradle.kts ولا build.gradle — شغّل `flutter create` أوّلًا.")


if __name__ == "__main__":
    main()
