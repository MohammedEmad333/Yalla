#!/usr/bin/env python3
"""حقن إعداد توقيع الإصدار (release signing) في ملفّ Gradle للتطبيق المولَّد.

`flutter create` يولّد ملفّ Gradle يوقّع الإصدار بمفتاح debug — وهو ما يرفضه
Google Play. هذا السكربت يضيف إعداد توقيع الإصدار بشكل متسامح ويدعم صيغتَي Gradle:
  • Kotlin DSL  (android/app/build.gradle.kts) — تولّده إصدارات Flutter الحديثة.
  • Groovy      (android/app/build.gradle)     — إصدارات Flutter الأقدم.

الخطوات في كلتا الحالتين:
  1) تحميل قيم التوقيع من android/key.properties.
  2) إضافة كتلة signingConfigs باسم release تقرأ ذلك الـ keystore.
  3) تحويل buildTypes.release لاستخدام توقيع release بدل debug.

يُشغَّل من مجلّد mobile/:  python3 tool/inject_signing.py
يفشل بوضوح إن لم يجد المواضع المتوقّعة — حتى لا يُبنى إصدار موقّع بمفتاح debug صامتًا.
"""
import re
import sys
from pathlib import Path

GRADLE_GROOVY = Path("android/app/build.gradle")
GRADLE_KTS = Path("android/app/build.gradle.kts")

MARKER = "keystorePropertiesFile"

# ── Groovy ──────────────────────────────────────────────────────────────────
GROOVY_LOADER = """
// ── توقيع الإصدار (Yalla) — تُحقَن بواسطة tool/inject_signing.py ──
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

"""

GROOVY_SIGNING = """
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties['keyAlias']
                keyPassword = keystoreProperties['keyPassword']
                storeFile = keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
                storePassword = keystoreProperties['storePassword']
            }
        }
    }
"""

# ── Kotlin DSL ──────────────────────────────────────────────────────────────
KTS_IMPORTS = "import java.util.Properties\nimport java.io.FileInputStream\n"

KTS_LOADER = """
// ── توقيع الإصدار (Yalla) — تُحقَن بواسطة tool/inject_signing.py ──
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

"""

KTS_SIGNING = """
    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }
"""


def fail(msg: str) -> None:
    print(f"inject_signing: خطأ — {msg}", file=sys.stderr)
    sys.exit(1)


def insert_before_android(text: str, snippet: str) -> str:
    m = re.search(r"^android\s*\{", text, flags=re.MULTILINE)
    if not m:
        fail("لم يُعثر على كتلة `android {`.")
    return text[: m.start()] + snippet + text[m.start() :]


def insert_after_android_open(text: str, snippet: str) -> str:
    m = re.search(r"^android\s*\{[^\n]*\n", text, flags=re.MULTILINE)
    if not m:
        fail("تعذّر تحديد سطر فتح `android {`.")
    return text[: m.end()] + snippet + text[m.end() :]


def patch_groovy() -> None:
    text = GRADLE_GROOVY.read_text(encoding="utf-8")
    if MARKER in text:
        print("inject_signing: التوقيع مُحقَن مسبقًا (Groovy) — تخطّي.")
        return
    text = insert_before_android(text, GROOVY_LOADER)
    text = insert_after_android_open(text, GROOVY_SIGNING)
    text, n = re.subn(
        r"signingConfig\s*=?\s*signingConfigs\.debug",
        "signingConfig = signingConfigs.release",
        text,
    )
    if n == 0:
        fail("لم يُعثر على توقيع debug في buildTypes.release (Groovy).")
    GRADLE_GROOVY.write_text(text, encoding="utf-8")
    print(f"inject_signing: تمّ حقن توقيع الإصدار (Groovy) — {n} موضع تحويل.")


def patch_kts() -> None:
    text = GRADLE_KTS.read_text(encoding="utf-8")
    if MARKER in text:
        print("inject_signing: التوقيع مُحقَن مسبقًا (Kotlin DSL) — تخطّي.")
        return
    # 1) الاستيرادات في أعلى الملفّ (يجب أن تسبق أيّ تعليمات)
    if "import java.util.Properties" not in text:
        text = KTS_IMPORTS + text
    # 2) محمّل key.properties قبل كتلة android
    text = insert_before_android(text, KTS_LOADER)
    # 3) كتلة signingConfigs بعد فتح android
    text = insert_after_android_open(text, KTS_SIGNING)
    # 4) تحويل توقيع الإصدار من debug إلى release
    #    يدعم getByName("debug") وsigningConfigs.debug
    text, n1 = re.subn(
        r'signingConfigs\.getByName\(\s*"debug"\s*\)',
        'signingConfigs.getByName("release")',
        text,
    )
    text, n2 = re.subn(
        r"signingConfig\s*=\s*signingConfigs\.debug\b",
        'signingConfig = signingConfigs.getByName("release")',
        text,
    )
    if n1 + n2 == 0:
        fail("لم يُعثر على توقيع debug في buildTypes.release (Kotlin DSL).")
    GRADLE_KTS.write_text(text, encoding="utf-8")
    print(f"inject_signing: تمّ حقن توقيع الإصدار (Kotlin DSL) — {n1 + n2} موضع تحويل.")


def main() -> None:
    if GRADLE_KTS.exists():
        patch_kts()
    elif GRADLE_GROOVY.exists():
        patch_groovy()
    else:
        fail("لم يُعثر على build.gradle.kts ولا build.gradle — شغّل `flutter create` أوّلًا.")


if __name__ == "__main__":
    main()
